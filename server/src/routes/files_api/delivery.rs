use axum::{
    body::Body,
    extract::{Json, Query, State},
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    Json as AxumJson,
};
use serde::Deserialize;
use std::io::Write;
use std::path::{Path as StdPath, PathBuf};
use tokio::fs::File as AsyncFile;
use tokio_util::io::ReaderStream;
use tower::ServiceExt;
use tower_http::services::ServeFile;
use zip::write::SimpleFileOptions;

use crate::{
    auth::{AuthenticatedUser, OptionalUser},
    queue::DownloadQueue,
    routes::AppState,
    storage::{validate_data_path, DATA_ROOT, THUMBNAILS_ROOT},
};

#[derive(Deserialize)]
pub(crate) struct ZipPayload {
    paths: Vec<String>,
}

pub(super) async fn zip_files(
    user: AuthenticatedUser,
    State(_state): State<AppState>,
    Json(payload): Json<ZipPayload>,
) -> Response {
    if user.role != "admin" {
        return (StatusCode::FORBIDDEN, "Admin access required").into_response();
    }
    let paths = payload.paths;
    if paths.is_empty() {
        return (StatusCode::BAD_REQUEST, "No files to zip").into_response();
    }

    let res = tokio::task::spawn_blocking(move || -> Result<Vec<u8>, anyhow::Error> {
        let mut buffer = Vec::new();
        let mut zip = zip::ZipWriter::new(std::io::Cursor::new(&mut buffer));
        let options =
            SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

        for p in paths {
            match validate_data_path(&p) {
                Ok(abs_path) if abs_path.is_file() => {
                    let data_root = StdPath::new(DATA_ROOT);
                    let relative_name = abs_path
                        .strip_prefix(data_root)
                        .map(|p| p.to_string_lossy().into_owned())
                        .unwrap_or_else(|_| {
                            abs_path.file_name().unwrap().to_string_lossy().into_owned()
                        });

                    zip.start_file(relative_name, options)?;
                    let content = std::fs::read(&abs_path)?;
                    zip.write_all(&content)?;
                }
                _ => continue,
            }
        }
        zip.finish()?;
        Ok(buffer)
    })
    .await;

    match res {
        Ok(Ok(buffer)) => {
            let mut headers = HeaderMap::new();
            headers.insert(header::CONTENT_TYPE, "application/zip".parse().unwrap());
            headers.insert(
                header::CONTENT_DISPOSITION,
                "attachment; filename=\"videos.zip\"".parse().unwrap(),
            );
            (headers, buffer).into_response()
        }
        _ => (StatusCode::INTERNAL_SERVER_ERROR, "Failed to create zip").into_response(),
    }
}

#[derive(Deserialize)]
pub(crate) struct FileQuery {
    path: String,
}

pub(super) async fn download_file(Query(params): Query<FileQuery>) -> Response {
    let p = params.path;
    let abs_path = match validate_data_path(&p) {
        Ok(path) => path,
        Err(e) => return (StatusCode::FORBIDDEN, e.to_string()).into_response(),
    };

    if !abs_path.exists() {
        return (StatusCode::NOT_FOUND, "File not found").into_response();
    }

    let metadata = match tokio::fs::metadata(&abs_path).await {
        Ok(meta) => meta,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to read metadata: {}", e),
            )
                .into_response()
        }
    };

    let file_size = metadata.len();
    let modified = metadata
        .modified()
        .unwrap_or(std::time::SystemTime::UNIX_EPOCH);
    let last_modified = chrono::DateTime::<chrono::Utc>::from(modified)
        .format("%a, %d %b %Y %H:%M:%S GMT")
        .to_string();
    let etag = format!(
        r#""{}-{}""#,
        file_size,
        modified
            .duration_since(std::time::SystemTime::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs()
    );

    match AsyncFile::open(&abs_path).await {
        Ok(file) => {
            let stream = ReaderStream::new(file);
            let body = Body::from_stream(stream);
            let filename = abs_path.file_name().unwrap().to_string_lossy().to_string();

            let mut headers = HeaderMap::new();
            headers.insert(
                header::CONTENT_DISPOSITION,
                format!("attachment; filename=\"{}\"", filename)
                    .parse()
                    .unwrap(),
            );
            headers.insert(
                header::CONTENT_LENGTH,
                HeaderValue::from_str(&file_size.to_string()).unwrap(),
            );
            headers.insert(header::ETAG, HeaderValue::from_str(&etag).unwrap());
            headers.insert(
                header::LAST_MODIFIED,
                HeaderValue::from_str(&last_modified).unwrap(),
            );
            headers.insert(
                header::CACHE_CONTROL,
                HeaderValue::from_static("public, max-age=3600"),
            );

            (headers, body).into_response()
        }
        Err(_) => (StatusCode::INTERNAL_SERVER_ERROR, "Failed to open file").into_response(),
    }
}

pub(super) async fn get_file_info(
    user: OptionalUser,
    State(state): State<AppState>,
    Query(params): Query<FileQuery>,
) -> Response {
    let p = params.path;
    let abs_path = StdPath::new(&p)
        .canonicalize()
        .unwrap_or_else(|_| PathBuf::from(&p));
    let filename = abs_path
        .file_name()
        .map(|s| s.to_string_lossy().to_string());

    if let Some(filename) = filename {
        if let Ok(Some(job)) = state.db.find_job_by_filename(&filename).await {
            // Security Check: Only Admin or Owner can see the metadata
            if user.role != "admin" && job.user_id.as_deref() != Some(&user.username) {
                return (
                    StatusCode::FORBIDDEN,
                    AxumJson(serde_json::json!({ "error": "Access denied" })),
                )
                    .into_response();
            }

            return AxumJson(serde_json::json!({
                "jobId": job.id,
                "url": job.url,
                "status": job.status,
                "progress": job.progress,
                "category": job.category,
                "platform": job.platform,
                "suggestedCategory": job.suggested_category,
                "transcript": job.transcript,
                "hashtags": job.hashtags,
                "visualDescription": job.visual_description,
                "creator": job.creator_name,
                "caption": job.caption
            }))
            .into_response();
        }
    }

    (
        StatusCode::NOT_FOUND,
        AxumJson(serde_json::json!({ "error": "Job info not found" })),
    )
        .into_response()
}

pub(super) async fn stream_file(
    Query(params): Query<FileQuery>,
    req: axum::extract::Request,
) -> impl IntoResponse {
    let p = params.path;
    let abs_path = match validate_data_path(&p) {
        Ok(path) => path,
        Err(e) => return (StatusCode::FORBIDDEN, e.to_string()).into_response(),
    };

    if !abs_path.exists() {
        return (StatusCode::NOT_FOUND, "File not found").into_response();
    }

    match ServeFile::new(abs_path).oneshot(req).await {
        Ok(res) => res.into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to serve file: {}", e),
        )
            .into_response(),
    }
}

pub(super) async fn get_thumbnail(
    Query(params): Query<FileQuery>,
    req: axum::extract::Request,
) -> impl IntoResponse {
    let p = params.path;
    let abs_path = match validate_data_path(&p) {
        Ok(path) => path,
        Err(e) => return (StatusCode::FORBIDDEN, e.to_string()).into_response(),
    };

    let filename = match abs_path.file_name() {
        Some(f) => f.to_string_lossy().to_string(),
        None => return (StatusCode::BAD_REQUEST, "Invalid path").into_response(),
    };

    let thumb_filename = format!("{}.jpg", filename);
    let thumb_path = StdPath::new(THUMBNAILS_ROOT).join(thumb_filename);

    if !thumb_path.exists() {
        if abs_path.exists() {
            match DownloadQueue::generate_thumbnail(&abs_path).await {
                Ok(path) => {
                    return match ServeFile::new(path).oneshot(req).await {
                        Ok(res) => res.into_response(),
                        Err(e) => (
                            StatusCode::INTERNAL_SERVER_ERROR,
                            format!("Failed to serve thumbnail: {}", e),
                        )
                            .into_response(),
                    };
                }
                Err(_) => {
                    return (StatusCode::NOT_FOUND, "Thumbnail generation failed").into_response();
                }
            }
        }
        return (StatusCode::NOT_FOUND, "Thumbnail not found").into_response();
    }

    match ServeFile::new(thumb_path).oneshot(req).await {
        Ok(res) => res.into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to serve thumbnail: {}", e),
        )
            .into_response(),
    }
}
