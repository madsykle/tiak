use crate::{
    config::AppConfig,
    db::Db,
    queue::DownloadQueue,
    routes::{create_router, normalize_url, AppState},
    storage::FileIndex,
};
use axum::{
    body::{to_bytes, Body},
    http::{Request, StatusCode},
    response::Response,
    Router,
};
use moka::future::Cache;
use std::sync::{Arc, Mutex, OnceLock};
use tower::ServiceExt;
use uuid::Uuid;

fn route_test_lock() -> std::sync::MutexGuard<'static, ()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(())).lock().unwrap_or_else(|e| e.into_inner())
}

struct CwdGuard {
    original_cwd: std::path::PathBuf,
}

impl CwdGuard {
    fn new() -> Self {
        let original_cwd = std::env::current_dir().unwrap();
        Self { original_cwd }
    }
}

impl Drop for CwdGuard {
    fn drop(&mut self) {
        let _ = std::env::set_current_dir(&self.original_cwd);
    }
}

fn admin_token() -> String {
    let auth_state = crate::auth::AuthState::new();
    auth_state.generate_token("admin_user", "admin").unwrap()
}

async fn test_db() -> Db {
    dotenv::dotenv().ok();
    let uri = std::env::var("MONGODB_URI").unwrap_or_else(|_| "mongodb://localhost:27017".to_string());
    let db_name = format!("tiak-tr-{}", &Uuid::new_v4().to_string().replace("-", "")[..15]);
    Db::new_with_db(&uri, &db_name)
        .await
        .expect("create test db")
}

async fn test_router() -> Router {
    let db = test_db().await;
    let file_index = Arc::new(FileIndex::new());
    let queue = DownloadQueue::new(db.clone(), file_index.clone());

    let state = AppState {
        db,
        queue,
        file_index,
        url_cache: Cache::builder().max_capacity(100).build(),
        config: AppConfig::default(),
        auth_state: Arc::new(crate::auth::AuthState::new()),
    };

    create_router(state)
}

async fn json_body(response: Response) -> serde_json::Value {
    let bytes = to_bytes(response.into_body(), usize::MAX)
        .await
        .expect("body bytes");
    serde_json::from_slice(&bytes).expect("json body")
}

#[tokio::test]
async fn health_and_ready_endpoints_respond() {
    let _lock = route_test_lock();
    let app = test_router().await;

    let health = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/health")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(health.status(), StatusCode::OK);
    let health_body = to_bytes(health.into_body(), usize::MAX).await.unwrap();
    assert_eq!(&health_body[..], b"OK");

    let ready = app
        .oneshot(
            Request::builder()
                .uri("/ready")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(ready.status(), StatusCode::OK);
    let ready_body = to_bytes(ready.into_body(), usize::MAX).await.unwrap();
    assert_eq!(&ready_body[..], b"READY");
}

#[tokio::test]
async fn queue_list_only_returns_active_jobs() {
    let _lock = route_test_lock();
    let db = test_db().await;

    let queued = db
        .add_job(
            "https://example.com/q".to_string(),
            Some("default".to_string()),
            None,
            None,
            None,
            None,
        )
        .await
        .unwrap();
    let done = db
        .add_job(
            "https://example.com/d".to_string(),
            Some("default".to_string()),
            None,
            None,
            None,
            None,
        )
        .await
        .unwrap();
    db.mark_done(&done.id, "done.mp4", None, None, Some("done".to_string()))
        .await
        .unwrap();

    let file_index = Arc::new(FileIndex::new());
    let queue = DownloadQueue::new(db.clone(), file_index.clone());
    let app = create_router(AppState {
        db,
        queue,
        file_index,
        url_cache: Cache::builder().max_capacity(100).build(),
        config: AppConfig::default(),
        auth_state: Arc::new(crate::auth::AuthState::new()),
    });

    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/queue/list")
                .header("Authorization", format!("Bearer {}", admin_token()))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body = json_body(response).await;
    let items = body.as_array().unwrap();
    assert_eq!(items.len(), 1);
    assert_eq!(items[0]["_id"], queued.id);
    assert_eq!(items[0]["status"], "queued");
}

#[tokio::test]
async fn queue_history_returns_paginated_shape() {
    let _lock = route_test_lock();
    let db = test_db().await;
    db.add_job(
        "https://example.com/1".to_string(),
        Some("cats".to_string()),
        None,
        None,
        None,
        None,
    )
    .await
    .unwrap();
    db.add_job(
        "https://example.com/2".to_string(),
        Some("cats".to_string()),
        None,
        None,
        None,
        None,
    )
    .await
    .unwrap();

    let file_index = Arc::new(FileIndex::new());
    let queue = DownloadQueue::new(db.clone(), file_index.clone());
    let app = create_router(AppState {
        db,
        queue,
        file_index,
        url_cache: Cache::builder().max_capacity(100).build(),
        config: AppConfig::default(),
        auth_state: Arc::new(crate::auth::AuthState::new()),
    });

    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/queue/history?page=1&limit=1")
                .header("Authorization", format!("Bearer {}", admin_token()))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body = json_body(response).await;
    assert_eq!(body["page"], 1);
    assert_eq!(body["limit"], 1);
    assert_eq!(body["total"], 2);
    assert_eq!(body["items"].as_array().unwrap().len(), 1);
}

#[tokio::test]
async fn search_endpoint_only_returns_done_jobs() {
    let _lock = route_test_lock();
    let db = test_db().await;

    let done = db
        .add_job(
            "https://example.com/done".to_string(),
            Some("music".to_string()),
            None,
            None,
            None,
            None,
        )
        .await
        .unwrap();
    db.mark_done(
        &done.id,
        "done.mp4",
        None,
        None,
        Some("lofi vibes".to_string()),
    )
    .await
    .unwrap();

    db.add_job(
        "https://example.com/queued".to_string(),
        Some("music".to_string()),
        None,
        None,
        None,
        None,
    )
    .await
    .unwrap();

    let file_index = Arc::new(FileIndex::new());
    let queue = DownloadQueue::new(db.clone(), file_index.clone());
    let app = create_router(AppState {
        db,
        queue,
        file_index,
        url_cache: Cache::builder().max_capacity(100).build(),
        config: AppConfig::default(),
        auth_state: Arc::new(crate::auth::AuthState::new()),
    });

    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/videos/search?q=music")
                .header("Authorization", format!("Bearer {}", admin_token()))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body = json_body(response).await;
    let items = body.as_array().unwrap();
    assert_eq!(items.len(), 1);
    assert_eq!(items[0]["_id"], done.id);
    assert_eq!(items[0]["status"], "done");
}

#[test]
fn normalize_url_canonicalizes_platform_urls() {
    let _lock = route_test_lock();
    assert_eq!(
        normalize_url("https://youtu.be/dQw4w9WgXcQ?si=abc"),
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    );
    assert_eq!(
        normalize_url("https://www.instagram.com/p/abc123/?utm_source=ig_web_copy_link"),
        "https://www.instagram.com/reels/abc123/"
    );
    assert_eq!(
        normalize_url("https://www.tiktok.com/@user/video/1234567890?lang=en"),
        "https://www.tiktok.com/@user/video/1234567890"
    );
    assert_eq!(
        normalize_url("https://x.com/user/status/12345?ref_src=twsrc"),
        "https://twitter.com/user/status/12345"
    );
}

#[tokio::test]
async fn category_endpoints_create_rename_delete_and_list() {
    let _lock = route_test_lock();
    let temp = tempfile::TempDir::new().unwrap();
    let _guard = CwdGuard::new();
    std::env::set_current_dir(temp.path()).unwrap();

    let app = test_router().await;

    let list_initial = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/categories")
                .header("Authorization", format!("Bearer {}", admin_token()))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(list_initial.status(), StatusCode::OK);
    let initial_body = json_body(list_initial).await;
    assert!(initial_body
        .as_array()
        .unwrap()
        .iter()
        .any(|v| v == "default"));

    let create = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/categories")
                .header("content-type", "application/json")
                .header("Authorization", format!("Bearer {}", admin_token()))
                .body(Body::from(r#"{"name":"Clips"}"#))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(create.status(), StatusCode::CREATED);

    let rename = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/categories/rename")
                .header("content-type", "application/json")
                .header("Authorization", format!("Bearer {}", admin_token()))
                .body(Body::from(r#"{"old":"Clips","new":"Edits"}"#))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(rename.status(), StatusCode::OK);

    let list_after = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/categories")
                .header("Authorization", format!("Bearer {}", admin_token()))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    let after_body = json_body(list_after).await;
    let names: Vec<String> = after_body
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|v| v.as_str().map(ToOwned::to_owned))
        .collect();
    assert!(names.iter().any(|n| n == "Edits"));
    assert!(!names.iter().any(|n| n == "Clips"));

    let delete = app
        .oneshot(
            Request::builder()
                .method("DELETE")
                .uri("/api/categories/Edits")
                .header("Authorization", format!("Bearer {}", admin_token()))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(delete.status(), StatusCode::OK);
    assert!(!temp.path().join("data/Edits").exists());
}

#[tokio::test]
async fn move_file_endpoint_moves_file_and_updates_job_category() {
    let _lock = route_test_lock();
    let temp = tempfile::TempDir::new().unwrap();
    let _guard = CwdGuard::new();
    std::env::set_current_dir(temp.path()).unwrap();

    let db = test_db().await;
    let data_dir = temp.path().join("data/default/2024-02-02");
    std::fs::create_dir_all(&data_dir).unwrap();
    let file_path = data_dir.join("clip.mp4");
    std::fs::write(&file_path, b"video").unwrap();

    let job = db
        .add_job(
            "https://example.com/video".to_string(),
            Some("default".to_string()),
            Some("youtube".to_string()),
            None,
            None,
            None,
        )
        .await
        .unwrap();
    db.mark_done(&job.id, "clip.mp4", None, None, Some("caption".to_string()))
        .await
        .unwrap();

    let file_index = Arc::new(FileIndex::new());
    file_index.build_index().await.unwrap();
    let queue = DownloadQueue::new(db.clone(), file_index.clone());
    let app = create_router(AppState {
        db: db.clone(),
        queue,
        file_index,
        url_cache: Cache::builder().max_capacity(100).build(),
        config: AppConfig::default(),
        auth_state: Arc::new(crate::auth::AuthState::new()),
    });

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/files/move")
                .header("content-type", "application/json")
                .header("Authorization", format!("Bearer {}", admin_token()))
                .body(Body::from(format!(
                    r#"{{"jobId":"{}","newCategory":"edits"}}"#,
                    job.id
                )))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let body = json_body(response).await;
    let new_path = body["newPath"].as_str().unwrap();
    assert!(new_path.contains("/data/edits/2024-02-02/clip.mp4"));
    assert!(!file_path.exists());
    assert!(temp.path().join("data/edits/2024-02-02/clip.mp4").exists());

    let updated = db.find_job_by_filename("clip.mp4").await.unwrap().unwrap();
    assert_eq!(updated.category, "edits");
}

#[tokio::test]
async fn timeline_endpoint_excludes_queued_jobs() {
    let _lock = route_test_lock();
    let temp = tempfile::TempDir::new().unwrap();
    let _guard = CwdGuard::new();
    std::env::set_current_dir(temp.path()).unwrap();

    let db = test_db().await;
    let done = db
        .add_job(
            "https://example.com/timeline-done".to_string(),
            Some("default".to_string()),
            None,
            None,
            None,
            None,
        )
        .await
        .unwrap();
    db.mark_done(
        &done.id,
        "done.mp4",
        None,
        None,
        Some("caption".to_string()),
    )
    .await
    .unwrap();
    db.add_job(
        "https://example.com/timeline-queued".to_string(),
        Some("default".to_string()),
        None,
        None,
        None,
        None,
    )
    .await
    .unwrap();

    let file_index = Arc::new(FileIndex::new());
    let queue = DownloadQueue::new(db.clone(), file_index.clone());
    let app = create_router(AppState {
        db,
        queue,
        file_index,
        url_cache: Cache::builder().max_capacity(100).build(),
        config: AppConfig::default(),
        auth_state: Arc::new(crate::auth::AuthState::new()),
    });

    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/timeline")
                .header("Authorization", format!("Bearer {}", admin_token()))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let body = json_body(response).await;
    let items = body.as_array().unwrap();
    assert_eq!(items.len(), 1);
    assert_eq!(items[0]["job"]["_id"], done.id);
    assert_eq!(items[0]["job"]["status"], "done");
}

#[tokio::test]
async fn resolve_endpoint_blocks_ssrf_urls() {
    let _lock = route_test_lock();
    let app = test_router().await;

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/files/resolve")
                .header("content-type", "application/json")
                .header("Authorization", format!("Bearer {}", admin_token()))
                .body(Body::from(r#"{"url":"http://127.0.0.1"}"#))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    let body = json_body(response).await;
    assert!(body["error"].as_str().unwrap().contains("SSRF check failed"));
}

#[tokio::test]
async fn guest_is_forbidden_from_zipping_files() {
    let _lock = route_test_lock();
    let app = test_router().await;

    let guest_token = {
        let auth_state = crate::auth::AuthState::new();
        auth_state.generate_token("guest_user", "guest").unwrap()
    };

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/files/zip")
                .header("content-type", "application/json")
                .header("Authorization", format!("Bearer {}", guest_token))
                .body(Body::from(r#"{"paths":[]}"#))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn guest_can_list_categories_if_authenticated() {
    let _lock = route_test_lock();
    let temp = tempfile::TempDir::new().unwrap();
    let _guard = CwdGuard::new();
    std::env::set_current_dir(temp.path()).unwrap();

    let app = test_router().await;

    let guest_token = {
        let auth_state = crate::auth::AuthState::new();
        auth_state.generate_token("guest_user", "guest").unwrap()
    };

    let anon_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/categories")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_ne!(anon_response.status(), StatusCode::OK);

    let guest_response = app
        .oneshot(
            Request::builder()
                .uri("/api/categories")
                .header("Authorization", format!("Bearer {}", guest_token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(guest_response.status(), StatusCode::OK);
}
