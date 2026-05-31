use axum::{
    extract::{Json, Path, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    Json as AxumJson,
};
use serde::Deserialize;
use std::path::Path as StdPath;
use tracing::info;

use crate::{
    auth::AuthenticatedUser,
    routes::AppState,
    storage::{self, get_disk_usage, validate_data_path, DATA_ROOT},
};

pub(super) async fn list_files(
    user: AuthenticatedUser,
    State(state): State<AppState>,
) -> impl IntoResponse {
    let index = state.file_index.get_index();
    let info_by_key = state.db.get_done_jobs_info_map(Some(&user.username), Some(&user.role)).await.unwrap_or_default();
    
    if user.role == "admin" {
        return AxumJson(serde_json::json!({
            "byDate": index.by_date,
            "byCategory": index.by_category,
            "lastScan": index.last_scan,
            "infoByKey": info_by_key,
        }));
    }

    // Filter for non-admin: only show files that exist in the user's info_by_key map
    let mut filtered_by_date = std::collections::BTreeMap::new();
    for (date, files) in &index.by_date {
        let mut user_files = Vec::new();
        for file in files {
            // Reconstruct the key used in info_by_key: "category/date/filename"
            let key = format!("{}/{}/{}", file.category, date, file.name);
            if info_by_key.contains_key(&key) {
                user_files.push(file.clone());
            }
        }
        if !user_files.is_empty() {
            filtered_by_date.insert(date.clone(), user_files);
        }
    }

    let mut filtered_by_category = std::collections::BTreeMap::new();
    for (cat, date_map) in &index.by_category {
        let mut user_date_map = std::collections::BTreeMap::new();
        for (date, files) in date_map {
            let mut user_files = Vec::new();
            for file in files {
                let key = format!("{}/{}/{}", cat, date, file.name);
                if info_by_key.contains_key(&key) {
                    user_files.push(file.clone());
                }
            }
            if !user_files.is_empty() {
                user_date_map.insert(date.clone(), user_files);
            }
        }
        if !user_date_map.is_empty() {
            filtered_by_category.insert(cat.clone(), user_date_map);
        }
    }

    AxumJson(serde_json::json!({
        "byDate": filtered_by_date,
        "byCategory": filtered_by_category,
        "lastScan": index.last_scan,
        "infoByKey": info_by_key,
    }))
}

#[derive(Deserialize)]
pub(crate) struct MoveFilePayload {
    path: Option<String>,
    #[serde(rename = "jobId")]
    job_id: Option<String>,
    #[serde(rename = "newCategory")]
    new_category: String,
}

pub(super) async fn move_file(
    user: AuthenticatedUser,
    State(state): State<AppState>,
    Json(payload): Json<MoveFilePayload>,
) -> impl IntoResponse {
    if user.role != "admin" {
        return (StatusCode::FORBIDDEN, "Admin access required").into_response();
    }
    let new_cat = payload.new_category;

    let p = if let Some(path) = payload.path {
        path
    } else if let Some(jid) = payload.job_id {
        if let Ok(job) = state.db.get_job(&jid).await {
            if let Some(filename) = job.filename {
                if let Some(item) = state.file_index.find_file_by_name(&filename) {
                    item.path
                } else {
                    return (
                        StatusCode::NOT_FOUND,
                        AxumJson(serde_json::json!({ "error": "File not found in index" })),
                    )
                        .into_response();
                }
            } else {
                return (
                    StatusCode::BAD_REQUEST,
                    AxumJson(serde_json::json!({ "error": "Job has no filename" })),
                )
                    .into_response();
            }
        } else {
            return (
                StatusCode::NOT_FOUND,
                AxumJson(serde_json::json!({ "error": "Job not found" })),
            )
                .into_response();
        }
    } else {
        return (
            StatusCode::BAD_REQUEST,
            AxumJson(serde_json::json!({ "error": "Either path or jobId required" })),
        )
            .into_response();
    };

    let abs_path = match validate_data_path(&p) {
        Ok(path) => path,
        Err(e) => {
            return (
                StatusCode::FORBIDDEN,
                AxumJson(serde_json::json!({ "error": e.to_string() })),
            )
                .into_response();
        }
    };

    match storage::move_file_on_disk(&abs_path, &new_cat).await {
        Ok(new_abs_path) => {
            info!("Move successful (via storage module)");
            state.file_index.remove_file(&abs_path.to_string_lossy());
            state.file_index.add_file(&new_abs_path);

            if let Some(filename) = new_abs_path
                .file_name()
                .map(|s| s.to_string_lossy().to_string())
            {
                if let Ok(Some(job)) = state.db.find_job_by_filename(&filename).await {
                    if let Some(suggested) = &job.suggested_category {
                        if suggested != &new_cat && !suggested.is_empty() {
                            let _ = state
                                .db
                                .add_correction(&job.id, &job.category, suggested, &new_cat)
                                .await;
                        }
                    }
                }
                let _ = state
                    .db
                    .update_category_by_filename(&filename, &new_cat)
                    .await;
            }

            (
                StatusCode::OK,
                AxumJson(
                    serde_json::json!({ "success": true, "newPath": new_abs_path.to_string_lossy() }),
                ),
            )
                .into_response()
        }
        Err(e) => {
            tracing::error!("Move failed: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                AxumJson(serde_json::json!({ "error": e.to_string() })),
            )
                .into_response()
        }
    }
}

pub(super) async fn list_categories(_user: AuthenticatedUser) -> impl IntoResponse {
    AxumJson(storage::list_categories())
}

#[derive(Deserialize)]
pub(crate) struct CreateCategoryPayload {
    name: String,
}

pub(super) async fn create_category(
    user: AuthenticatedUser,
    Json(payload): Json<CreateCategoryPayload>,
) -> impl IntoResponse {
    if user.role != "admin" {
        return (StatusCode::FORBIDDEN, "Admin access required").into_response();
    }
    match storage::create_category(&payload.name) {
        Ok(_) => (
            StatusCode::CREATED,
            AxumJson(serde_json::json!({ "success": true })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            AxumJson(serde_json::json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

pub(super) async fn delete_category(
    user: AuthenticatedUser,
    State(state): State<AppState>,
    Path(name): Path<String>,
) -> impl IntoResponse {
    if user.role != "admin" {
        return (StatusCode::FORBIDDEN, "Admin access required").into_response();
    }
    match storage::delete_category(&name) {
        Ok(_) => {
            state.file_index.remove_category(&name);
            (
                StatusCode::OK,
                AxumJson(serde_json::json!({ "success": true })),
            )
                .into_response()
        }
        Err(e) => (
            StatusCode::BAD_REQUEST,
            AxumJson(serde_json::json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

#[derive(Deserialize)]
pub(crate) struct RenameCategoryPayload {
    old: String,
    new: String,
}

pub(super) async fn rename_category(
    user: AuthenticatedUser,
    State(state): State<AppState>,
    Json(payload): Json<RenameCategoryPayload>,
) -> impl IntoResponse {
    if user.role != "admin" {
        return (StatusCode::FORBIDDEN, "Admin access required").into_response();
    }
    match storage::rename_category(&payload.old, &payload.new) {
        Ok(_) => {
            let sanitized_new = storage::sanitize_category_name(&payload.new);
            state
                .file_index
                .rename_category(&payload.old, &sanitized_new);
            (
                StatusCode::OK,
                AxumJson(serde_json::json!({ "success": true })),
            )
                .into_response()
        }
        Err(e) => (
            StatusCode::BAD_REQUEST,
            AxumJson(serde_json::json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

#[derive(Deserialize)]
pub(crate) struct DeleteFilesPayload {
    paths: Vec<String>,
}

pub(super) async fn delete_files(
    user: AuthenticatedUser,
    State(state): State<AppState>,
    Json(payload): Json<DeleteFilesPayload>,
) -> impl IntoResponse {
    if user.role != "admin" {
        return (StatusCode::FORBIDDEN, "Admin access required").into_response();
    }
    let mut deleted = Vec::new();
    let mut errors: Vec<serde_json::Value> = Vec::new();

    for p in payload.paths {
        let abs_path = match validate_data_path(&p) {
            Ok(path) => path,
            Err(e) => {
                errors.push(serde_json::json!({ "path": p, "error": e.to_string() }));
                continue;
            }
        };

        if abs_path.to_string_lossy().contains("jobs.sqlite") {
            errors.push(serde_json::json!({ "path": p, "error": "Cannot delete database files" }));
            continue;
        }

        if abs_path.exists() {
            if let Err(e) = tokio::fs::remove_file(&abs_path).await {
                errors.push(serde_json::json!({ "path": p, "error": e.to_string() }));
            } else {
                state.file_index.remove_file(&abs_path.to_string_lossy());
                deleted.push(p.clone());

                if let Some(parent) = abs_path.parent() {
                    let data_root = StdPath::new(DATA_ROOT);
                    if parent.starts_with(data_root) && parent != data_root {
                        let _ = tokio::fs::remove_dir(parent).await;
                    }
                }
            }
        } else {
            deleted.push(p);
        }
    }

    AxumJson(serde_json::json!({ "deleted": deleted, "errors": errors })).into_response()
}

pub(super) async fn system_usage(user: AuthenticatedUser) -> Response {
    if user.role != "admin" {
        return (StatusCode::FORBIDDEN, "Admin access required").into_response();
    }
    match get_disk_usage().await {
        Ok((size, count)) => {
            AxumJson(serde_json::json!({ "totalSize": size, "fileCount": count })).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to get disk usage: {}", e),
        )
            .into_response(),
    }
}
