use axum::{http::StatusCode, response::IntoResponse};

pub(super) async fn root() -> &'static str {
    "Tiak Server is running (Rust)"
}

pub(super) async fn health_check() -> impl IntoResponse {
    (StatusCode::OK, "OK")
}

pub(super) async fn ready_check() -> impl IntoResponse {
    (StatusCode::OK, "READY")
}

pub(super) async fn metrics_endpoint() -> impl IntoResponse {
    let metrics = "# HELP tiak_server_info Server information
# TYPE tiak_server_info gauge
tiak_server_info{version=\"0.1.0\"} 1
"
    .to_string();
    (StatusCode::OK, metrics)
}
