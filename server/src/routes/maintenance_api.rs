use axum::{extract::State, http::StatusCode, response::IntoResponse, Json};
use std::path::Path as StdPath;
use tracing::info;

use super::AppState;
use crate::{metadata, queue::DownloadQueue, auth::AuthenticatedUser};

pub(super) async fn backfill_metadata_endpoint(
    user: AuthenticatedUser,
    State(state): State<AppState>
) -> impl IntoResponse {
    if user.role != "admin" {
        return (StatusCode::FORBIDDEN, Json(serde_json::json!({ "error": "Admin access required" }))).into_response();
    }
    let db = state.db.clone();
    tokio::spawn(async move {
        metadata::backfill_metadata(db).await;
    });
    (
        axum::http::StatusCode::OK,
        Json(serde_json::json!({ "success": true, "message": "Backfill started" })),
    )
    .into_response()
}

pub(super) async fn backfill_thumbnails_endpoint(
    user: AuthenticatedUser,
    State(state): State<AppState>,
) -> impl IntoResponse {
    if user.role != "admin" {
        return (StatusCode::FORBIDDEN, Json(serde_json::json!({ "error": "Admin access required" }))).into_response();
    }
    let index = state.file_index.clone();
    tokio::spawn(async move {
        let files = index.get_index();
        let mut all_paths = Vec::new();
        for cat_map in files.by_category.values() {
            for list in cat_map.values() {
                for item in list {
                    all_paths.push(item.path.clone());
                }
            }
        }

        info!(
            "[Backfill] Starting thumbnail generation for {} files",
            all_paths.len()
        );
        for p in all_paths {
            let path = StdPath::new(&p);
            if path.exists() {
                let _ = DownloadQueue::generate_thumbnail(path).await;
            }
        }
        info!("[Backfill] Thumbnail generation complete");
    });
    (
        axum::http::StatusCode::OK,
        Json(serde_json::json!({ "success": true, "message": "Backfill started" })),
    )
    .into_response()
}

pub(super) async fn get_stats_endpoint(
    user: AuthenticatedUser,
    State(state): State<AppState>
) -> impl IntoResponse {
    if user.role != "admin" {
        return (StatusCode::FORBIDDEN, Json(serde_json::json!({ "error": "Admin access required" }))).into_response();
    }
    match state.db.get_stats().await {
        Ok(stats) => Json(stats).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to get stats: {}", e),
        )
            .into_response(),
    }
}

pub(super) async fn fix_categories_endpoint(
    user: AuthenticatedUser,
    State(state): State<AppState>
) -> impl IntoResponse {
    if user.role != "admin" {
        return (StatusCode::FORBIDDEN, Json(serde_json::json!({ "error": "Admin access required" }))).into_response();
    }
    let db = state.db.clone();
    let index = state.file_index.clone();

    tokio::spawn(async move {
        let _ = index
            .build_index_if_stale(std::time::Duration::from_secs(300))
            .await;
        crate::cleanup::fix_job_categories(&db, &index).await;
        crate::cleanup::scan_for_missing_files(&db, &index).await;
    });

    (
        axum::http::StatusCode::OK,
        Json(serde_json::json!({ "success": true, "message": "Maintenance task started" })),
    )
    .into_response()
}
