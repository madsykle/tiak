use std::fs::File;
use std::process::Stdio;

use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tracing::{error, info};

use super::{DownloadQueue, SYNC_MARKER_FILE};

impl DownloadQueue {
    pub async fn run_sync(&self) -> Result<String, anyhow::Error> {
        {
            let state = self.sync_state.read().await;
            if state.status == "running" {
                return Ok("Sync is already running".to_string());
            }
        }

        let dest = self.get_sync_destination().await;
        let mode = self.get_sync_mode().await;
        let cwd = std::env::current_dir()?;
        let data_dir = cwd.join("data");

        info!("Starting cloud sync ({}) to {}", mode, dest);

        {
            let mut state = self.sync_state.write().await;
            state.status = "running".to_string();
            state.logs.clear();
            state.logs.push(format!("Starting {} to {}...", mode, dest));
            state.error = None;
        }

        let dest_clone = dest.clone();
        let state_clone = self.sync_state.clone();
        let mode_clone = mode.clone();

        tokio::spawn(async move {
            let mut cmd = Command::new("rclone");
            if mode_clone == "sync" {
                cmd.arg("sync").arg("--track-renames");
            } else {
                cmd.arg("copy");
            }

            let mut child = cmd
                .arg(&data_dir)
                .arg(&dest_clone)
                .arg("--ignore-existing")
                .arg("--transfers=4")
                .arg("--exclude")
                .arg("jobs.sqlite*")
                .arg("--exclude")
                .arg(".last_sync")
                .arg("--exclude")
                .arg(".thumbnails/**")
                .arg("-v")
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()
                .expect("Failed to spawn rclone");

            let stdout = child.stdout.take().expect("Failed to open stdout");
            let stderr = child.stderr.take().expect("Failed to open stderr");

            let state_logger = state_clone.clone();
            let stderr_task = tokio::spawn(async move {
                let mut reader = BufReader::new(stderr).lines();
                while let Ok(Some(line)) = reader.next_line().await {
                    let mut s = state_logger.write().await;
                    if s.logs.len() > 100 {
                        s.logs.remove(0);
                    }
                    s.logs.push(line);
                }
            });

            let state_logger_out = state_clone.clone();
            let stdout_task = tokio::spawn(async move {
                let mut reader = BufReader::new(stdout).lines();
                while let Ok(Some(line)) = reader.next_line().await {
                    let mut s = state_logger_out.write().await;
                    if s.logs.len() > 100 {
                        s.logs.remove(0);
                    }
                    s.logs.push(line);
                }
            });

            match child.wait().await {
                Ok(status) => {
                    let _ = stderr_task.await;
                    let _ = stdout_task.await;

                    let mut s = state_clone.write().await;
                    if status.success() {
                        s.status = "idle".to_string();
                        s.logs.push("Sync completed successfully.".to_string());
                        s.unsynced_count = 0;
                        let _ = File::create(SYNC_MARKER_FILE);
                        if let Ok(meta) = std::fs::metadata(SYNC_MARKER_FILE) {
                            if let Ok(mod_time) = meta.modified() {
                                s.last_run = Some(mod_time.into());
                            }
                        }
                        info!("Cloud sync completed successfully to {}", dest_clone);
                    } else {
                        s.status = "error".to_string();
                        let code = status.code().unwrap_or(-1);
                        let msg = format!("Sync failed with exit code {}", code);
                        s.error = Some(msg.clone());
                        s.logs.push(msg);
                        error!("Cloud sync failed");
                    }
                }
                Err(e) => {
                    let mut s = state_clone.write().await;
                    s.status = "error".to_string();
                    s.error = Some(e.to_string());
                    s.logs.push(format!("Process error: {}", e));
                }
            }
        });

        Ok(format!("Sync ({}) started to {}", mode, dest))
    }
}
