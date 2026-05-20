use axum::{
    extract::{Path, Query, State},
    response::{IntoResponse, Response},
    Json,
};
use serde::Deserialize;

use super::AppState;

#[derive(Deserialize)]
pub(super) struct SearchQuery {
    q: String,
}

pub(super) async fn search_videos(
    State(state): State<AppState>,
    Query(params): Query<SearchQuery>,
) -> Response {
    if let Ok(jobs) = state.db.search_jobs(&params.q).await {
        Json(jobs).into_response()
    } else {
        (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            "Search failed",
        )
            .into_response()
    }
}

pub(super) async fn list_by_category(
    State(state): State<AppState>,
    Path(name): Path<String>,
) -> Response {
    if let Ok(jobs) = state.db.get_jobs_by_category(&name).await {
        Json(jobs).into_response()
    } else {
        (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            "Failed to fetch category",
        )
            .into_response()
    }
}

pub(super) async fn list_by_creator(
    State(state): State<AppState>,
    Path(name): Path<String>,
) -> Response {
    if let Ok(jobs) = state.db.get_jobs_by_creator(&name).await {
        Json(jobs).into_response()
    } else {
        (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            "Failed to fetch creator videos",
        )
            .into_response()
    }
}
