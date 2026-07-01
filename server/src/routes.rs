mod core_api;
mod files_api;
mod maintenance_api;
mod queue_api;
mod search_api;

use axum::{
    extract::DefaultBodyLimit,
    routing::{delete, get, post},
    Router,
};
use chrono::TimeZone;
use moka::future::Cache;
use regex::Regex;
use std::path::Path as StdPath;
use std::sync::{Arc, OnceLock};

use crate::config::AppConfig;
use crate::db_optimized::{Db, Job};
use crate::queue::DownloadQueue;
use crate::storage::FileIndex;

static RE_PARAMS: OnceLock<Regex> = OnceLock::new();
static RE_YT: OnceLock<Regex> = OnceLock::new();
static RE_IG: OnceLock<Regex> = OnceLock::new();
static RE_TT: OnceLock<Regex> = OnceLock::new();
static RE_TW: OnceLock<Regex> = OnceLock::new();

fn re_params() -> &'static Regex {
    RE_PARAMS.get_or_init(|| {
        Regex::new(r"([?&])(?:feature|utm_[^=&]+|si|igsh|fbclid|gclid|ref|referrer)=[^&]*").unwrap()
    })
}

fn re_yt() -> &'static Regex {
    RE_YT.get_or_init(|| {
        Regex::new(r"(?:v=|shorts/|v/|embed/|live/|youtu\.be/)([a-zA-Z0-9_-]{11})").unwrap()
    })
}

fn re_ig() -> &'static Regex {
    RE_IG.get_or_init(|| Regex::new(r"instagram\.com/(?:reels|p|tv)/([a-zA-Z0-9_-]+)").unwrap())
}

fn re_tt() -> &'static Regex {
    RE_TT.get_or_init(|| Regex::new(r"tiktok\.com/(@[^/]+/video/\d+)").unwrap())
}

fn re_tw() -> &'static Regex {
    RE_TW.get_or_init(|| Regex::new(r"(?:x|twitter)\.com/([^/]+/status/\d+)").unwrap())
}

#[derive(Clone)]
pub struct AppState {
    pub db: Db,
    pub queue: Arc<DownloadQueue>,
    pub file_index: Arc<FileIndex>,
    pub url_cache: Cache<String, String>,
    pub config: AppConfig,
    pub auth_state: Arc<crate::auth::AuthState>,
}

pub fn create_router(state: AppState) -> Router {
    let guest_routes = Router::new()
        .route("/health", get(core_api::health_check))
        .route("/ready", get(core_api::ready_check))
        .route("/metrics", get(core_api::metrics_endpoint))
        .route("/api/auth/login", post(crate::auth::login_handler))
        .route("/api/auth/logout", post(crate::auth::logout_handler))
        .route("/api/auth/signup", post(crate::auth::signup_handler))
        .route("/api/auth/me", get(crate::auth::me_handler))
        .route("/api/queue/add", post(queue_api::add_to_queue))
        .route("/api/queue/list", get(queue_api::list_queue))
        .route("/api/files/download", get(files_api::download_file))
        .route("/api/files/stream", get(files_api::stream_file))
        .route("/api/files/thumbnail", get(files_api::get_thumbnail))
        .route("/api/files/info", get(files_api::get_file_info))
        .route("/api/files/resolve", post(queue_api::resolve_url_endpoint))
        .route("/api/queue/history", get(queue_api::queue_history));

    let admin_routes = Router::new()
        .route("/", get(core_api::root))
        .route("/api/files", get(files_api::list_files).delete(files_api::delete_files))
        .route("/api/files/zip", post(files_api::zip_files))
        .route("/api/files/move", post(files_api::move_file))
        .route("/api/categories", get(files_api::list_categories).post(files_api::create_category))
        .route("/api/categories/:name", delete(files_api::delete_category))
        .route("/api/categories/rename", post(files_api::rename_category))
        .route("/api/queue/:id", delete(queue_api::delete_job))
        .route("/api/system/usage", get(files_api::system_usage))
        .route("/api/settings", get(queue_api::get_settings).post(queue_api::set_settings))
        .route("/api/timeline", get(crate::timeline::get_timeline))
        .route("/api/timeline/posted", post(crate::timeline::mark_posted))
        .route("/api/queue/export", get(queue_api::export_queue))
        .route("/api/queue/import", post(queue_api::import_queue))
        .route("/api/queue/retry/:id", post(queue_api::retry_job))
        .route("/api/queue/redownload/:id", post(queue_api::redownload_job))
        .route("/api/sync/run", post(queue_api::sync_run))
        .route("/api/sync/status", get(queue_api::sync_status))
        .route("/api/admin/stats", get(maintenance_api::get_stats_endpoint))
        .route("/api/rclone/ls", get(queue_api::rclone_ls))
        .route("/api/admin/users", get(crate::auth::list_users_handler))
        .route("/api/admin/users/create", post(crate::auth::create_user_handler))
        .route("/api/admin/users/:id/role", post(crate::auth::update_role_handler))
        .route("/api/maintenance/fix-categories", post(maintenance_api::fix_categories_endpoint))
        .route("/api/maintenance/backfill-metadata", post(maintenance_api::backfill_metadata_endpoint))
        .route("/api/maintenance/backfill-thumbnails", post(maintenance_api::backfill_thumbnails_endpoint))
        .route("/api/videos/search", get(search_api::search_videos))
        .route("/api/videos/category/:name", get(search_api::list_by_category))
        .route("/api/videos/creator/:name", get(search_api::list_by_creator));

    Router::new()
        .merge(guest_routes)
        .merge(admin_routes)
        .layer(DefaultBodyLimit::max(10 * 1024 * 1024))
        .layer(axum::Extension(state.auth_state.clone()))
        .with_state(state)
}

pub(crate) async fn resolve_url(url: &str) -> Result<String, anyhow::Error> {
    // Validate input URL against SSRF
    crate::validation::validate_url_ssrf(url).await?;

    use tokio::process::Command;

    let output = Command::new("curl")
        .arg("-Ls")
        .arg("-o")
        .arg("/dev/null")
        .arg("-w")
        .arg("%{url_effective}")
        .arg("--")
        .arg(url)
        .output()
        .await?;

    let resolved = if output.status.success() {
        String::from_utf8_lossy(&output.stdout).trim().to_string()
    } else {
        url.to_string()
    };

    let normalized = normalize_url(&resolved);
    
    // Validate resolved URL against SSRF
    crate::validation::validate_url_ssrf(&normalized).await?;

    Ok(normalized)
}

pub(crate) fn normalize_url(url: &str) -> String {
    let mut normalized = url.trim().to_string();
    normalized = re_params().replace_all(&normalized, "").to_string();

    if normalized.contains('&') && !normalized.contains('?') {
        normalized = normalized.replacen("&", "?", 1);
    }

    while normalized.ends_with('?') || normalized.ends_with('&') || normalized.ends_with('/') {
        normalized.pop();
    }

    if normalized.contains("youtube.com") || normalized.contains("youtu.be") {
        if let Some(caps) = re_yt().captures(&normalized) {
            return format!("https://www.youtube.com/watch?v={}", &caps[1]);
        }
    }

    if normalized.contains("instagram.com") || normalized.contains("instagr.am") {
        if let Some(caps) = re_ig().captures(&normalized) {
            return format!("https://www.instagram.com/reels/{}/", &caps[1]);
        }
    }

    if normalized.contains("tiktok.com") && normalized.contains("/video/") {
        if let Some(caps) = re_tt().captures(&normalized) {
            return format!("https://www.tiktok.com/{}", &caps[1]);
        }
    }

    if normalized.contains("x.com") || normalized.contains("twitter.com") {
        if let Some(caps) = re_tw().captures(&normalized) {
            return format!("https://twitter.com/{}", &caps[1]);
        }
    }

    normalized
}

fn done_job_file_exists(job: &Job, file_index: &FileIndex, data_root: &str) -> bool {
    let filename = match &job.filename {
        Some(f) if !f.is_empty() => f.as_str(),
        _ => return false,
    };

    let date_secs = job
        .completed_at
        .or(job.started_at)
        .unwrap_or(job.created_at)
        / 1000;
    let date_str = chrono::Utc
        .timestamp_opt(date_secs, 0)
        .single()
        .map(|dt| dt.format("%Y-%m-%d").to_string())
        .unwrap_or_else(|| "1970-01-01".to_string());

    let original_path = StdPath::new(data_root)
        .join(&job.category)
        .join(date_str)
        .join(filename);

    if original_path.exists() {
        return true;
    }

    file_index.find_file_by_name(filename).is_some()
}

fn detect_platform(url: &str) -> String {
    if url.contains("tiktok.com") || url.contains("vm.tiktok.com") {
        return "tiktok".to_string();
    }
    if url.contains("instagram.com") || url.contains("instagr.am") {
        return "instagram".to_string();
    }
    if url.contains("youtube.com") || url.contains("youtu.be") {
        return "youtube".to_string();
    }
    "unknown".to_string()
}
