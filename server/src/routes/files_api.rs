mod catalog;
mod delivery;

use axum::{
    extract::{Json, Path, Query, State},
    response::{IntoResponse, Response},
};

use crate::{auth::{AuthenticatedUser, OptionalUser}, routes::AppState};

pub(super) async fn list_files(
    user: AuthenticatedUser,
    state: State<AppState>,
) -> impl IntoResponse {
    catalog::list_files(user, state).await
}

pub(super) async fn move_file(
    user: AuthenticatedUser,
    state: State<AppState>,
    payload: Json<catalog::MoveFilePayload>,
) -> impl IntoResponse {
    catalog::move_file(user, state, payload).await
}

pub(super) async fn list_categories(user: AuthenticatedUser) -> impl IntoResponse {
    catalog::list_categories(user).await
}

pub(super) async fn create_category(
    user: AuthenticatedUser,
    payload: Json<catalog::CreateCategoryPayload>,
) -> impl IntoResponse {
    catalog::create_category(user, payload).await
}

pub(super) async fn delete_category(
    user: AuthenticatedUser,
    state: State<AppState>,
    path: Path<String>,
) -> impl IntoResponse {
    catalog::delete_category(user, state, path).await
}

pub(super) async fn rename_category(
    user: AuthenticatedUser,
    state: State<AppState>,
    payload: Json<catalog::RenameCategoryPayload>,
) -> impl IntoResponse {
    catalog::rename_category(user, state, payload).await
}

pub(super) async fn delete_files(
    user: AuthenticatedUser,
    state: State<AppState>,
    payload: Json<catalog::DeleteFilesPayload>,
) -> impl IntoResponse {
    catalog::delete_files(user, state, payload).await
}

pub(super) async fn system_usage(user: AuthenticatedUser) -> Response {
    catalog::system_usage(user).await
}

pub(super) async fn zip_files(
    user: AuthenticatedUser,
    state: State<AppState>,
    payload: Json<delivery::ZipPayload>,
) -> Response {
    delivery::zip_files(user, state, payload).await
}

pub(super) async fn download_file(query: Query<delivery::FileQuery>) -> Response {
    delivery::download_file(query).await
}

pub(super) async fn get_file_info(
    user: OptionalUser,
    state: State<AppState>,
    query: Query<delivery::FileQuery>,
) -> Response {
    delivery::get_file_info(user, state, query).await
}

pub(super) async fn stream_file(
    query: Query<delivery::FileQuery>,
    req: axum::extract::Request,
) -> impl IntoResponse {
    delivery::stream_file(query, req).await
}

pub(super) async fn get_thumbnail(
    query: Query<delivery::FileQuery>,
    req: axum::extract::Request,
) -> impl IntoResponse {
    delivery::get_thumbnail(query, req).await
}
