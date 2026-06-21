use axum::{
    extract::{Multipart, Path, Query, State},
    response::{IntoResponse, Response},
    Json,
};
use serde::{Deserialize, Serialize};

use super::{detect_platform, done_job_file_exists, normalize_url, resolve_url, AppState};
use crate::{db::Job, storage::DATA_ROOT, auth::{AuthenticatedUser, OptionalUser}};

#[derive(Deserialize)]
pub(super) struct ResolvePayload {
    url: String,
}

pub(super) async fn resolve_url_endpoint(
    _user: AuthenticatedUser,
    State(state): State<AppState>,
    Json(payload): Json<ResolvePayload>,
) -> impl IntoResponse {
    let url = payload.url;

    // Enforce SSRF validation on the input URL first
    if let Err(e) = crate::validation::validate_url_ssrf(&url).await {
        return (
            axum::http::StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": format!("SSRF check failed: {}", e) })),
        )
            .into_response();
    }

    if !url.starts_with("http") {
        return Json(serde_json::json!({ "url": url })).into_response();
    }

    if let Some(resolved) = state.url_cache.get(&url).await {
        return Json(serde_json::json!({ "url": resolved })).into_response();
    }

    match resolve_url(&url).await {
        Ok(resolved) => {
            state.url_cache.insert(url, resolved.clone()).await;
            Json(serde_json::json!({ "url": resolved })).into_response()
        }
        Err(e) => (
            axum::http::StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

pub(super) async fn delete_job(
    user: AuthenticatedUser,
    State(state): State<AppState>,
    Path(id): Path<String>
) -> Response {
    if user.role != "admin" {
        return (axum::http::StatusCode::FORBIDDEN, "Admin access required").into_response();
    }
    state.queue.cancel_job(&id);
    if let Ok(true) = state.db.check_job_exists(&id).await {
        let _ = state.db.delete_job(&id).await;
        return Json(serde_json::json!({ "success": true, "id": id })).into_response();
    }
    (
        axum::http::StatusCode::NOT_FOUND,
        Json(serde_json::json!({ "error": "Job not found" })),
    )
        .into_response()
}

pub(super) async fn get_settings(
    user: AuthenticatedUser,
    State(state): State<AppState>
) -> Response {
    if user.role != "admin" {
        return (axum::http::StatusCode::FORBIDDEN, "Admin access required").into_response();
    }
    let max = state.queue.get_max_concurrent().await;
    let sync_dest = state.queue.get_sync_destination().await;
    let sync_mode = state.queue.get_sync_mode().await;
    Json(
        serde_json::json!({ "maxConcurrent": max, "syncDestination": sync_dest, "syncMode": sync_mode }),
    )
    .into_response()
}

#[derive(Deserialize)]
pub(super) struct SettingsPayload {
    #[serde(rename = "maxConcurrent")]
    max_concurrent: usize,
    #[serde(rename = "syncDestination", default)]
    sync_destination: Option<String>,
    #[serde(rename = "syncMode", default)]
    sync_mode: Option<String>,
}

pub(super) async fn set_settings(
    user: AuthenticatedUser,
    State(state): State<AppState>,
    Json(payload): Json<SettingsPayload>,
) -> Response {
    if user.role != "admin" {
        return (axum::http::StatusCode::FORBIDDEN, "Admin access required").into_response();
    }
    state.queue.set_max_concurrent(payload.max_concurrent).await;
    if let Some(dest) = payload.sync_destination {
        state.queue.set_sync_destination(dest).await;
    }
    if let Some(mode) = payload.sync_mode {
        state.queue.set_sync_mode(mode).await;
    }
    state.queue.save_settings().await;

    let max = state.queue.get_max_concurrent().await;
    let sync_dest = state.queue.get_sync_destination().await;
    let sync_mode = state.queue.get_sync_mode().await;
    Json(
        serde_json::json!({ "maxConcurrent": max, "syncDestination": sync_dest, "syncMode": sync_mode }),
    )
    .into_response()
}

pub(super) async fn sync_run(
    user: AuthenticatedUser,
    State(state): State<AppState>
) -> Response {
    if user.role != "admin" {
        return (axum::http::StatusCode::FORBIDDEN, "Admin access required").into_response();
    }
    match state.queue.run_sync().await {
        Ok(msg) => Json(serde_json::json!({ "success": true, "message": msg })).into_response(),
        Err(e) => (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "success": false, "error": e.to_string() })),
        )
            .into_response(),
    }
}

pub(super) async fn sync_status(
    user: AuthenticatedUser,
    State(state): State<AppState>
) -> Response {
    if user.role != "admin" {
        return (axum::http::StatusCode::FORBIDDEN, "Admin access required").into_response();
    }
    let _ = state.file_index.build_index_if_stale(std::time::Duration::from_secs(30)).await;
    Json(state.queue.get_sync_state().await).into_response()
}

pub(super) async fn list_queue(
    user: OptionalUser,
    State(state): State<AppState>
) -> Response {
    if let Ok(jobs) = state.db.get_all_jobs(Some(&user.username), Some(&user.role)).await {
        Json(jobs).into_response()
    } else {
        (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            "Failed to fetch jobs",
        )
            .into_response()
    }
}

#[derive(Deserialize)]
pub(super) struct RcloneLsQuery {
    path: String,
}

#[derive(Deserialize, Serialize)]
pub(super) struct RcloneLsEntry {
    #[serde(rename = "Path")]
    path: String,
    #[serde(rename = "Name")]
    name: String,
    #[serde(rename = "IsDir")]
    is_dir: bool,
}

pub(super) async fn rclone_ls(
    user: OptionalUser,
    Query(query): Query<RcloneLsQuery>,
) -> Response {
    if user.role != "admin" {
        return (
            axum::http::StatusCode::FORBIDDEN,
            "Forbidden",
        ).into_response();
    }

    let mut cmd = std::process::Command::new("rclone");
    cmd.args(&["lsjson", &query.path, "--dirs-only"]);

    match cmd.output() {
        Ok(output) => {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let entries: Result<Vec<RcloneLsEntry>, _> = serde_json::from_str(&stdout);
                match entries {
                    Ok(e) => Json(serde_json::json!({ "entries": e })).into_response(),
                    Err(_) => (
                        axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                        "Failed to parse rclone output",
                    ).into_response()
                }
            } else {
                (
                    axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                    String::from_utf8_lossy(&output.stderr).to_string(),
                ).into_response()
            }
        }
        Err(e) => (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to execute rclone: {}", e),
        ).into_response(),
    }
}

#[derive(Deserialize)]
pub(super) struct AddQueuePayload {
    urls: String,
    category: Option<String>,
}

pub(super) async fn add_to_queue(
    user: OptionalUser,
    State(state): State<AppState>,
    Json(payload): Json<AddQueuePayload>,
) -> Response {
    let lines = payload.urls.lines();
    let mut added = Vec::new();
    let mut skipped = Vec::new();
    let category = payload
        .category
        .as_ref()
        .filter(|c| !c.is_empty())
        .cloned()
        .unwrap_or_else(|| "default".to_string());

    let is_admin = user.role == "admin";
    let is_premium = user.role == "premium_member";
    let expires_at = if !is_admin && !is_premium {
        Some(chrono::Utc::now().timestamp_millis() + 5 * 60 * 1000)
    } else {
        None
    };

    for url in lines {
        let raw_url = url.trim();
        if raw_url.is_empty() {
            continue;
        }

        let original_url = normalize_url(raw_url);

        // Perform SSRF validation on the input URL first
        if let Err(e) = crate::validation::validate_url_ssrf(&original_url).await {
            skipped.push(serde_json::json!({ "url": original_url, "reason": format!("SSRF check failed: {}", e) }));
            continue;
        }

        let final_url = match resolve_url(&original_url).await {
            Ok(resolved) => resolved,
            Err(e) => {
                // If resolving failed because of SSRF or validation error, we must skip it
                if e.downcast_ref::<crate::validation::ValidationError>().is_some() {
                    skipped.push(serde_json::json!({ "url": original_url, "reason": format!("SSRF validation failed: {}", e) }));
                    continue;
                }
                original_url.clone()
            }
        };

        if state.queue.has_job(&final_url).await {
            skipped.push(serde_json::json!({ "url": final_url, "reason": "Already in queue" }));
            continue;
        }

        if let Ok(Some(done)) = state.db.find_done_job_by_url(&final_url).await {
            let file_still_exists = done_job_file_exists(&done, &state.file_index, DATA_ROOT);
            if file_still_exists {
                let date_ms = done.completed_at.or(done.started_at).unwrap_or(done.created_at);
                let date_str = chrono::TimeZone::timestamp_millis_opt(&chrono::Utc, date_ms).single()
                    .map(|dt| dt.format("%Y-%m-%d").to_string())
                    .unwrap_or_else(|| "1970-01-01".to_string());

                skipped.push(serde_json::json!({ 
                    "url": final_url, 
                    "reason": "Already downloaded", 
                    "jobId": done.id, 
                    "finishedAt": done.completed_at,
                    "filename": done.filename,
                    "category": done.category,
                    "dateFolder": date_str
                }));
                continue;
            }
        }

        if final_url != original_url {
            if state.queue.has_job(&original_url).await {
                skipped.push(
                    serde_json::json!({ "url": original_url, "reason": "Already in queue (alias)" }),
                );
                continue;
            }
            if let Ok(Some(done)) = state.db.find_done_job_by_url(&original_url).await {
                let file_still_exists = done_job_file_exists(&done, &state.file_index, DATA_ROOT);
                if file_still_exists {
                    let date_ms = done.completed_at.or(done.started_at).unwrap_or(done.created_at);
                    let date_str = chrono::TimeZone::timestamp_millis_opt(&chrono::Utc, date_ms).single()
                        .map(|dt| dt.format("%Y-%m-%d").to_string())
                        .unwrap_or_else(|| "1970-01-01".to_string());

                    skipped.push(serde_json::json!({ 
                        "url": original_url, 
                        "reason": "Already downloaded (alias)", 
                        "jobId": done.id,
                        "filename": done.filename,
                        "category": done.category,
                        "dateFolder": date_str
                    }));
                    continue;
                }
            }
        }

        let platform = detect_platform(&final_url);

        match state.db.add_job(
            final_url.clone(), 
            Some(category.clone()), 
            Some(platform.to_string()),
            expires_at,
            Some(user.username.clone()),
            None
        ).await {
            Ok(job) => {
                state.queue.enqueue_job_id(job.id.clone());
                added.push(job);
            },
            Err(e) => {
                skipped.push(serde_json::json!({ "url": final_url, "reason": e.to_string() }))
            }
        }
    }

    (
        axum::http::StatusCode::CREATED,
        Json(serde_json::json!({ "added": added, "skipped": skipped })),
    )
        .into_response()
}

#[derive(Deserialize)]
pub(super) struct HistoryQuery {
    page: Option<i64>,
    limit: Option<i64>,
}

pub(super) async fn queue_history(
    user: OptionalUser,
    State(state): State<AppState>,
    Query(q): Query<HistoryQuery>,
) -> Response {
    let page = q.page.unwrap_or(1).max(1);
    let limit = q.limit.unwrap_or(50).max(1);
    let offset = (page - 1) * limit;

    if let Ok((items, total)) = state.db.get_job_history(limit, offset, Some(&user.username), Some(&user.role)).await {
        Json(serde_json::json!({
            "items": items,
            "total": total,
            "page": page,
            "limit": limit
        }))
        .into_response()
    } else {
        (axum::http::StatusCode::INTERNAL_SERVER_ERROR, "Failed").into_response()
    }
}

pub(super) async fn export_queue(
    user: AuthenticatedUser,
    State(state): State<AppState>
) -> Response {
    if user.role != "admin" {
        return (axum::http::StatusCode::FORBIDDEN, "Admin access required").into_response();
    }
    if let Ok(jobs) = state.db.export_all_jobs().await {
        let now = chrono::Local::now();
        let filename = format!("jobs-export-{}.json", now.format("%Y-%m-%d"));
        let mut headers = axum::http::HeaderMap::new();
        headers.insert(
            axum::http::header::CONTENT_DISPOSITION,
            format!("attachment; filename=\"{}\"", filename)
                .parse()
                .unwrap(),
        );
        (headers, Json(jobs)).into_response()
    } else {
        (axum::http::StatusCode::INTERNAL_SERVER_ERROR, "Failed").into_response()
    }
}

pub(super) async fn import_queue(
    user: AuthenticatedUser,
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> Response {
    if user.role != "admin" {
        return (axum::http::StatusCode::FORBIDDEN, "Admin access required").into_response();
    }
    let mut imported = 0;
    let mut skipped = 0;

    while let Some(field) = multipart.next_field().await.unwrap_or(None) {
        if field.name() == Some("file") {
            if let Ok(bytes) = field.bytes().await {
                if let Ok(jobs) = serde_json::from_slice::<Vec<Job>>(&bytes) {
                    for job in jobs {
                        if let Ok(true) = state.db.check_job_exists(&job.id).await {
                            skipped += 1;
                        } else {
                            let mut new_job = job.clone();
                            new_job.status = "imported".to_string();
                            new_job.retries = 0;

                            if state.db.import_job(new_job).await.is_ok() {
                                imported += 1;
                            }
                        }
                    }
                }
            }
        }
    }
    Json(serde_json::json!({ "imported": imported, "skipped": skipped })).into_response()
}

pub(super) async fn retry_job(
    user: OptionalUser,
    State(state): State<AppState>,
    Path(id): Path<String>
) -> Response {
    if let Ok(job) = state.db.get_job(&id).await {
        if user.role != "admin" && job.user_id.as_deref() != Some(&user.username) {
            return (axum::http::StatusCode::FORBIDDEN, "Access denied").into_response();
        }
    }

    let is_admin = user.role == "admin";
    let is_premium = user.role == "premium_member";
    let new_expires_at = if !is_admin && !is_premium {
        Some(chrono::Utc::now().timestamp_millis() + 5 * 60 * 1000)
    } else {
        None
    };

    if let Some(job) = state.queue.retry_job(&id, new_expires_at).await {
        Json(job).into_response()
    } else {
        (
            axum::http::StatusCode::NOT_FOUND,
            "Job not found or cannot retry",
        )
            .into_response()
    }
}

pub(super) async fn redownload_job(
    user: OptionalUser,
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Response {
    if let Ok(job) = state.db.get_job(&id).await {
        if user.role != "admin" && job.user_id.as_deref() != Some(&user.username) {
            return (axum::http::StatusCode::FORBIDDEN, "Access denied").into_response();
        }
    }

    let is_admin = user.role == "admin";
    let is_premium = user.role == "premium_member";
    let new_expires_at = if !is_admin && !is_premium {
        Some(chrono::Utc::now().timestamp_millis() + 5 * 60 * 1000)
    } else {
        None
    };

    if let Some(job) = state.queue.redownload_job(&id, new_expires_at).await {
        Json(job).into_response()
    } else {
        (
            axum::http::StatusCode::NOT_FOUND,
            "Job not found or cannot redownload",
        )
            .into_response()
    }
}
