mod download;
mod sync;

use crate::db::{Db, Job};
use crate::storage::FileIndex;
use chrono::{DateTime, Utc};
use dashmap::DashMap;
use serde::Serialize;
use std::collections::VecDeque;
use std::sync::{Arc, Mutex};
use tokio::sync::{Notify, RwLock};
use tokio_util::sync::CancellationToken;
use tracing::{error, info};

#[derive(Clone, Serialize, Debug)]
pub struct SyncState {
    pub status: String,
    #[serde(rename = "lastRun")]
    pub last_run: Option<DateTime<Utc>>,
    pub logs: Vec<String>,
    pub error: Option<String>,
    #[serde(rename = "unsyncedCount")]
    pub unsynced_count: usize,
}

impl Default for SyncState {
    fn default() -> Self {
        Self {
            status: "idle".to_string(),
            last_run: None,
            logs: Vec::new(),
            error: None,
            unsynced_count: 0,
        }
    }
}

#[derive(Clone)]
pub struct DownloadQueue {
    pub(super) db: Db,
    pub(super) file_index: Arc<FileIndex>,
    pub(super) queue: Arc<Mutex<VecDeque<String>>>,
    pub(super) active_jobs: Arc<DashMap<String, CancellationToken>>,
    pub(super) max_concurrent: Arc<RwLock<usize>>,
    pub(super) sync_destination: Arc<RwLock<String>>,
    pub(super) sync_mode: Arc<RwLock<String>>,
    pub(super) sync_state: Arc<RwLock<SyncState>>,
    pub(super) notify: Arc<Notify>,
}

pub(super) const SYNC_MARKER_FILE: &str = "data/.last_sync";

impl DownloadQueue {
    pub fn new(db: Db, file_index: Arc<FileIndex>) -> Arc<Self> {
        let queue = Arc::new(Self {
            db,
            file_index,
            queue: Arc::new(Mutex::new(VecDeque::new())),
            active_jobs: Arc::new(DashMap::new()),
            max_concurrent: Arc::new(RwLock::new(2)),
            sync_destination: Arc::new(RwLock::new("onedrive:others/Edits".to_string())),
            sync_mode: Arc::new(RwLock::new("copy".to_string())),
            sync_state: Arc::new(RwLock::new(SyncState::default())),
            notify: Arc::new(Notify::new()),
        });

        let q = queue.clone();
        tokio::spawn(async move {
            loop {
                q.process_next().await;
                q.notify.notified().await;
            }
        });

        queue
    }

    pub async fn load_initial_state(&self) {
        if let Err(e) = self.db.reset_crashed_jobs().await {
            error!("Failed to reset crashed jobs: {}", e);
        }

        if let Ok(jobs) = self.db.get_queued_jobs().await {
            let mut q = self.queue.lock().unwrap();
            for job in jobs {
                if !q.contains(&job.id) {
                    q.push_back(job.id);
                }
            }
        }
        self.notify.notify_one();
    }

    pub async fn add_job(
        &self,
        url: String,
        category: Option<String>,
        platform: Option<String>,
    ) -> Result<Job, anyhow::Error> {
        let job = self.db.add_job(url, category, platform, None, None, None).await?;
        self.enqueue_job_id(job.id.clone());
        Ok(job)
    }

    pub fn cancel_job(&self, id: &str) {
        if let Some(token) = self.active_jobs.get(id) {
            info!("Cancelling active job {}", id);
            token.cancel();
            return;
        }

        let mut q = self.queue.lock().unwrap();
        if let Some(pos) = q.iter().position(|x| x == id) {
            q.remove(pos);
            info!("Removed job {} from pending queue", id);
        }
    }

    pub async fn retry_job(&self, id: &str) -> Option<Job> {
        if self.db.get_job(id).await.is_ok() && self.db.increment_retry(id).await.is_ok() {
            self.enqueue_job_id(id.to_string());
            return self.db.get_job(id).await.ok();
        }
        None
    }

    pub async fn redownload_job(&self, id: &str) -> Option<Job> {
        if self.db.get_job(id).await.is_ok() && self.db.redownload_job(id).await.is_ok() {
            self.enqueue_job_id(id.to_string());
            return self.db.get_job(id).await.ok();
        }
        None
    }

    pub fn enqueue_job_id(&self, id: String) {
        {
            let mut q = self.queue.lock().unwrap();
            q.push_back(id);
        }
        self.notify.notify_one();
    }

    pub async fn set_max_concurrent(&self, limit: usize) {
        if limit > 0 {
            let mut w = self.max_concurrent.write().await;
            *w = limit;
            self.notify.notify_one();
        }
    }

    pub async fn get_max_concurrent(&self) -> usize {
        *self.max_concurrent.read().await
    }

    pub async fn set_sync_destination(&self, dest: String) {
        let mut w = self.sync_destination.write().await;
        *w = dest;
    }

    pub async fn get_sync_destination(&self) -> String {
        self.sync_destination.read().await.clone()
    }

    pub async fn set_sync_mode(&self, mode: String) {
        let mut w = self.sync_mode.write().await;
        *w = mode;
    }

    pub async fn get_sync_mode(&self) -> String {
        self.sync_mode.read().await.clone()
    }

    pub async fn get_sync_state(&self) -> SyncState {
        let mut state = self.sync_state.read().await.clone();

        if std::path::Path::new(SYNC_MARKER_FILE).exists() {
            if let Ok(meta) = std::fs::metadata(SYNC_MARKER_FILE) {
                if let Ok(modified) = meta.modified() {
                    let modified_utc: DateTime<Utc> = modified.into();
                    state.unsynced_count = self.file_index.count_files_after(modified_utc);
                    state.last_run = Some(modified_utc);
                }
            }
        } else {
            state.unsynced_count = self
                .file_index
                .count_files_after(DateTime::<Utc>::from(std::time::SystemTime::UNIX_EPOCH));
        }

        state
    }

    pub async fn has_job(&self, url: &str) -> bool {
        self.db.has_active_job(url).await.unwrap_or(false)
    }

    async fn process_next(&self) {
        let max = *self.max_concurrent.read().await;

        loop {
            if self.active_jobs.len() >= max {
                break;
            }

            let next_id = {
                let mut q = self.queue.lock().unwrap();
                q.pop_front()
            };

            if let Some(id) = next_id {
                match self.db.get_job(&id).await {
                    Ok(job) => {
                        if job.status == "queued" {
                            self.start_download_task(job).await;
                        }
                    }
                    Err(e) => {
                        error!("Failed to fetch job {} from DB: {}", id, e);
                    }
                }
            } else {
                break;
            }
        }
    }

    async fn start_download_task(&self, job: Job) {
        let id = job.id.clone();
        let url = job.url.clone();
        let category = job.category.clone();
        let db = self.db.clone();
        let file_index = self.file_index.clone();
        let active_jobs = self.active_jobs.clone();
        let notify = self.notify.clone();
        let token = CancellationToken::new();

        active_jobs.insert(id.clone(), token.clone());
        let _ = db.mark_downloading(&id).await;
        info!("Starting job {} for {} in category {}", id, url, category);

        tokio::spawn(async move {
            let result = Self::run_yt_dlp(&id, &url, &category, &db, token.clone()).await;

            match result {
                Ok((filename, creator, avatar, caption)) => {
                    let folder = crate::storage::get_today_folder(Some(&category));
                    let full_path = folder.join(&filename);
                    let _ = Self::generate_thumbnail(&full_path).await;
                    let _ = db
                        .mark_done(
                            &id,
                            &filename,
                            creator.clone(),
                            avatar.clone(),
                            caption.clone(),
                        )
                        .await;
                    file_index.add_file(&full_path);
                    info!("Job {} completed. File: {}", id, filename);
                }
                Err(e) => {
                    let msg = e.to_string();
                    if msg.contains("cancelled") {
                        if let Ok(true) = db.check_job_exists(&id).await {
                            let _ = db.mark_failed(&id, "Cancelled").await;
                        }
                        info!("Job {} cancelled", id);
                    } else {
                        let _ = db.mark_failed(&id, &msg).await;
                        error!("Job {} failed: {}", id, msg);
                    }
                }
            }

            active_jobs.remove(&id);
            notify.notify_one();
        });
    }
}
