use crate::db_optimized::Db;
use crate::storage::{get_today_folder, THUMBNAILS_ROOT};
use regex::Regex;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::{Arc, Mutex};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio_util::sync::CancellationToken;

use super::DownloadQueue;

impl DownloadQueue {
    pub async fn generate_thumbnail(video_path: &Path) -> Result<PathBuf, anyhow::Error> {
        let filename = video_path
            .file_name()
            .ok_or_else(|| anyhow::anyhow!("No filename"))?;
        let thumb_filename = format!("{}.jpg", filename.to_string_lossy());
        let thumb_path = Path::new(THUMBNAILS_ROOT).join(thumb_filename);

        if !Path::new(THUMBNAILS_ROOT).exists() {
            let _ = tokio::fs::create_dir_all(THUMBNAILS_ROOT).await;
        }
        if thumb_path.exists() {
            return Ok(thumb_path);
        }

        let mut cmd = Command::new("ffmpeg");
        cmd.arg("-i")
            .arg(video_path)
            .arg("-ss")
            .arg("00:00:01")
            .arg("-vframes")
            .arg("1")
            .arg("-q:v")
            .arg("4")
            .arg(&thumb_path)
            .stdout(Stdio::null())
            .stderr(Stdio::null());

        let status = cmd.status().await?;
        if !status.success() {
            let mut cmd = Command::new("ffmpeg");
            cmd.arg("-i")
                .arg(video_path)
                .arg("-ss")
                .arg("00:00:00")
                .arg("-vframes")
                .arg("1")
                .arg("-q:v")
                .arg("4")
                .arg(&thumb_path)
                .stdout(Stdio::null())
                .stderr(Stdio::null());
            let status = cmd.status().await?;
            if !status.success() {
                return Err(anyhow::anyhow!("ffmpeg failed to generate thumbnail"));
            }
        }

        Ok(thumb_path)
    }

    pub(super) async fn run_yt_dlp(
        id: &str,
        url: &str,
        category: &str,
        db: &Db,
        token: CancellationToken,
    ) -> Result<(String, Option<String>, Option<String>, Option<String>), anyhow::Error> {
        let job = db.get_job(id).await?;
        let user_role = if let Some(uid) = &job.user_id {
            let user: Result<crate::db_optimized::models::User, _> = db.db.collection("users")
                .find_one(mongodb::bson::doc! { "username": uid }).await
                .map(|o| o.unwrap_or_else(|| crate::db_optimized::models::User { 
                    id: "".to_string(), username: "guest".to_string(), email: "".to_string(), 
                    password_hash: "".to_string(), role: "guest".to_string(), default_preset_id: None 
                }));
            user.map(|u| u.role).unwrap_or_else(|_| "guest".to_string())
        } else {
            "guest".to_string()
        };

        let cwd = std::env::current_dir()?;
        let python_path = std::env::var("YT_DLP_PYTHON")
            .map(PathBuf::from)
            .unwrap_or_else(|_| cwd.join("venv_python/bin/python"));
        let yt_dlp_path = std::env::var("YT_DLP_BINARY")
            .map(PathBuf::from)
            .unwrap_or_else(|_| cwd.join("bin/yt-dlp"));

        let output_folder = get_today_folder(Some(category));
        let is_tiktok = url.contains("tiktok.com");
        let is_instagram = url.contains("instagram.com");
        let template = if is_instagram || is_tiktok {
            output_folder.join("%(id)s.%(ext)s")
        } else {
            output_folder.join("%(title)s.%(ext)s")
        };

        let mut cmd = Command::new("nice");
        cmd.arg("-n")
            .arg("10")
            .arg(&python_path)
            .arg(&yt_dlp_path)
            .arg("--newline")
            .arg("--no-check-certificates")
            .arg("--no-mtime")
            .arg("--no-update")
            .arg("--js-runtimes")
            .arg("node");

        // --- Quality & Preset Logic ---
        let mut quality_applied = false;

        // 1. Check for Custom Preset (Premium Only)
        if user_role == "premium_member" {
            if let Some(pid) = job.preset_id {
                if let Ok(preset) = db.get_preset(&pid).await {
                    for arg in preset.args {
                        if crate::validation::is_safe_ytdlp_arg(&arg) {
                            cmd.arg(arg);
                        } else {
                            tracing::warn!("Skipping unsafe custom preset argument: {}", arg);
                        }
                    }
                    quality_applied = true;
                }
            }
        }

        // 2. Default Role-Based Quality
        if !quality_applied {
            if user_role == "admin" {
                // Admin: Absolute highest quality available
                cmd.arg("-f").arg("bv*+ba/best");
            } else if user_role == "premium_member" {
                // Premium Default: High quality
                cmd.arg("-f").arg("bv*+ba/best");
            } else {
                // Guest: Cap at 1080p and 1GB file size
                cmd.arg("-f").arg("bv*[height<=1080]+ba/b[height<=1080] / bestvideo+bestaudio / best");
                cmd.arg("--max-filesize").arg("1G");
            }
        }

        cmd.arg("--merge-output-format")
            .arg("mp4")
            .arg("--remux-video")
            .arg("mp4")
            .arg("--postprocessor-args")
            .arg("ffmpeg:-movflags +faststart")
            .arg("--write-info-json");

        if is_tiktok {
            cmd.arg("--add-header")
                .arg("Referer:https://www.tiktok.com/");
        } else if is_instagram {
            cmd.arg("--add-header")
                .arg("Referer:https://www.instagram.com/");
        }

        // Auto-detect cookie files for platforms that require auth
        let cookie_file = if is_instagram && Path::new("cookies_instagram.txt").exists() {
            Some("cookies_instagram.txt")
        } else if url.contains("youtube.com") || url.contains("youtu.be") {
            if Path::new("cookies_youtube.txt").exists() {
                Some("cookies_youtube.txt")
            } else if Path::new("cookies.txt").exists() {
                Some("cookies.txt")
            } else {
                None
            }
        } else if Path::new("cookies.txt").exists() {
            Some("cookies.txt")
        } else {
            None
        };

        if let Some(cf) = cookie_file {
            tracing::info!("Using cookie file: {}", cf);
            cmd.arg("--cookies").arg(cf);
        }

        let actual_url = if is_tiktok && url.contains("/photo/") {
            url.replace("/photo/", "/video/")
        } else {
            url.to_string()
        };

        let mut child = cmd
            .arg("-o")
            .arg(template)
            .arg("--")
            .arg(&actual_url)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true)
            .spawn()?;

        let stdout = child.stdout.take().expect("Failed to open stdout");
        let stderr = child.stderr.take().expect("Failed to open stderr");

        let found_filename = Arc::new(Mutex::new(String::new()));
        let found_filename_clone = found_filename.clone();
        let db_clone = db.clone();
        let id_clone = id.to_string();

        let stdout_task = tokio::spawn(async move {
            let mut reader = BufReader::new(stdout).lines();
            let mut last_progress_update = std::time::Instant::now();
            let re_progress = Regex::new(r"[download]\s+(\d+\.?\d*?)%").unwrap();
            let re_eta = Regex::new(r"ETA\s+(\d{2}:\d{2}(?:\:\d{2})?)").unwrap();
            let re_dest = Regex::new(r"\b[dD]estination:\s+(.*)").unwrap();
            let re_merge = Regex::new(r#"\b[mM]erger\b.*into\s+\"?([^\"]*)\"?"#).unwrap();
            let re_already =
                Regex::new(r"\b[dD]ownloaded\s+(.*)\s+has already been downloaded").unwrap();

            while let Ok(Some(line)) = reader.next_line().await {
                if let Some(caps) = re_progress.captures(&line) {
                    if let Some(m) = caps.get(1) {
                        if let Ok(p) = m.as_str().parse::<f64>() {
                            if last_progress_update.elapsed().as_secs() >= 1 {
                                let eta = re_eta
                                    .captures(&line)
                                    .and_then(|eta_caps| eta_caps.get(1))
                                    .and_then(|m| Self::parse_eta(m.as_str()));
                                let _ = db_clone.update_progress(&id_clone, p as i64, eta).await;
                                last_progress_update = std::time::Instant::now();
                            }
                        }
                    }
                }

                if let Some(caps) = re_dest.captures(&line) {
                    if let Some(m) = caps.get(1) {
                        let mut w = found_filename_clone.lock().unwrap();
                        *w = m.as_str().trim().to_string();
                    }
                }

                if let Some(caps) = re_merge.captures(&line) {
                    if let Some(m) = caps.get(1) {
                        let mut w = found_filename_clone.lock().unwrap();
                        *w = m.as_str().trim().trim_matches('"').to_string();
                    }
                }

                if let Some(caps) = re_already.captures(&line) {
                    if let Some(m) = caps.get(1) {
                        {
                            let mut w = found_filename_clone.lock().unwrap();
                            *w = m.as_str().trim().to_string();
                        }
                        let _ = db_clone.update_progress(&id_clone, 100, Some(0)).await;
                    }
                }
            }
        });

        let stderr_error = Arc::new(Mutex::new(String::new()));
        let stderr_error_clone = stderr_error.clone();

        let stderr_task = tokio::spawn(async move {
            let mut reader = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                // Capture ERROR lines from yt-dlp for better error reporting
                if line.contains("ERROR:") {
                    let mut w = stderr_error_clone.lock().unwrap();
                    if w.is_empty() {
                        *w = line.trim().to_string();
                    }
                }
            }
        });

        tokio::select! {
            _ = token.cancelled() => {
                child.kill().await?;
                Err(anyhow::anyhow!("Job cancelled"))
            }
            status = child.wait() => {
                let status = status?;
                let _ = stdout_task.await;
                let _ = stderr_task.await;

                if status.success() {
                    let mut full_path_str = found_filename.lock().unwrap().clone();
                    
                    if full_path_str.is_empty() {
                        // Fallback: find the newest .mp4 file in the output folder
                        if let Ok(mut entries) = tokio::fs::read_dir(&output_folder).await {
                            let mut newest_file = None;
                            let mut newest_time = std::time::SystemTime::UNIX_EPOCH;
                            while let Ok(Some(entry)) = entries.next_entry().await {
                                if let Ok(meta) = entry.metadata().await {
                                    if let Some(ext) = entry.path().extension() {
                                        if ext == "mp4" || ext == "mkv" || ext == "webm" {
                                            if let Ok(modified) = meta.modified() {
                                                if modified > newest_time {
                                                    newest_time = modified;
                                                    newest_file = Some(entry.path());
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                            if let Some(p) = newest_file {
                                full_path_str = p.to_string_lossy().to_string();
                            }
                        }
                    }

                    if !full_path_str.is_empty() {
                        let path = Path::new(&full_path_str);
                        let filename = path.file_name().unwrap().to_string_lossy().to_string();
                        let json_path = if let Some(stem) = path.file_stem() {
                            path.with_file_name(format!("{}.info.json", stem.to_string_lossy()))
                        } else {
                            PathBuf::from(&full_path_str).with_extension("info.json")
                        };

                        let mut creator = None;
                        let avatar = None;
                        let mut caption = None;

                        if json_path.exists() {
                            if let Ok(content) = tokio::fs::read_to_string(&json_path).await {
                                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                                    creator = json.get("uploader").and_then(|v| v.as_str()).map(|s| s.to_string());
                                    caption = json.get("description").and_then(|v| v.as_str()).map(|s| s.to_string());
                                    if caption.is_none() {
                                        caption = json.get("title").and_then(|v| v.as_str()).map(|s| s.to_string());
                                    }
                                }
                            }
                            let _ = tokio::fs::remove_file(&json_path).await;
                        }

                        Ok((filename, creator, avatar, caption))
                    } else {
                        Ok(("unknown.mp4".to_string(), None, None, None))
                    }
                } else {
                    // Use captured stderr error if available for a more descriptive message
                    let stderr_msg = stderr_error.lock().unwrap().clone();
                    if !stderr_msg.is_empty() {
                        Err(anyhow::anyhow!("{}", stderr_msg))
                    } else {
                        Err(anyhow::anyhow!("Process exited with code {}", status.code().unwrap_or(-1)))
                    }
                }
            }
        }
    }

    pub(super) fn parse_eta(eta_str: &str) -> Option<i64> {
        let parts: Vec<&str> = eta_str.split(':').collect();
        let seconds = if parts.len() == 3 {
            parts[0].parse::<i64>().unwrap_or(0) * 3600
                + parts[1].parse::<i64>().unwrap_or(0) * 60
                + parts[2].parse::<i64>().unwrap_or(0)
        } else if parts.len() == 2 {
            parts[0].parse::<i64>().unwrap_or(0) * 60 + parts[1].parse::<i64>().unwrap_or(0)
        } else {
            parts[0].parse::<i64>().unwrap_or(0)
        };
        Some(seconds)
    }
}
