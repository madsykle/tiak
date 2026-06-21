use crate::db_optimized::Db;
use crate::storage::{FileIndex, DATA_ROOT};
use chrono::{DateTime, Utc};
use std::path::Path;
use std::sync::Arc;
use tracing::info;

pub async fn run_cleanup(db: &Db) {
    info!("[Cleanup] Starting cleanup task...");

    // 7 days ago
    let cutoff = Utc::now() - chrono::Duration::days(7);
    let cutoff_ts = cutoff.timestamp_millis();

    match db.delete_old_failed_jobs(cutoff_ts).await {
        Ok(count) => info!("[Cleanup] Deleted {} old failed jobs", count),
        Err(e) => info!("[Cleanup] Error deleting failed jobs: {}", e),
    }
}

pub async fn fix_job_categories(db: &Db, file_index: &Arc<FileIndex>) {
    info!("[Cleanup] Fixing job categories...");
    let jobs = match db.get_jobs_for_missing_scan().await {
        Ok(j) => j,
        Err(_) => return,
    };

    let mut fixed_count = 0;

    for job in jobs {
        if let Some(filename) = &job.filename {
            // Check if file exists at expected location
            let ts = job.completed_at.unwrap_or(job.created_at);
            let date = DateTime::<Utc>::from_timestamp_millis(ts).unwrap_or(Utc::now());
            let folder_name = date.format("%Y-%m-%d").to_string();

            // Expected path: data/<category>/<date>/<filename>
            let current_category = if job.category.is_empty() {
                "default"
            } else {
                &job.category
            };
            let expected_path = Path::new(DATA_ROOT)
                .join(current_category)
                .join(&folder_name)
                .join(filename);

            if !expected_path.exists() {
                // File not found where expected. Check index.
                if let Some(found_file) = file_index.find_file_by_name(filename) {
                    // Found it elsewhere!
                    if found_file.category != current_category {
                        info!(
                            "[Cleanup] Found missing file {} in category {}, updating DB from {}",
                            filename, found_file.category, current_category
                        );
                        if db
                            .update_job_category(&job.id, &found_file.category)
                            .await
                            .is_ok()
                        {
                            fixed_count += 1;
                        }
                    }
                }
            }
        }
    }
    if fixed_count > 0 {
        info!("[Cleanup] Fixed {} job categories", fixed_count);
    }
}

pub async fn scan_for_missing_files(db: &Db, file_index: &Arc<FileIndex>) {
    info!("[Cleanup] Scanning for missing files...");

    let jobs = match db.get_jobs_for_missing_scan().await {
        Ok(j) => j,
        Err(_) => return,
    };

    let mut missing_count = 0;
    let mut recovered_count = 0;

    for job in jobs {
        if let Some(filename) = &job.filename {
            // Determine expected path
            // Use completedAt or createdAt
            let ts = job.completed_at.unwrap_or(job.created_at);

            let date = DateTime::<Utc>::from_timestamp_millis(ts).unwrap_or(Utc::now());
            let folder_name = date.format("%Y-%m-%d").to_string();

            let current_category = if job.category.is_empty() {
                "default"
            } else {
                &job.category
            };
            let path = Path::new(DATA_ROOT)
                .join(current_category)
                .join(folder_name)
                .join(filename);

            let exists_at_path = path.exists();
            let found_in_index = if !exists_at_path {
                file_index.find_file_by_name(filename).is_some()
            } else {
                false
            };

            if exists_at_path || found_in_index {
                // File exists
                if job.status == "missing" && db.recover_missing_job(&job.id).await.is_ok() {
                    recovered_count += 1;
                }
            } else {
                // File missing
                if job.status != "missing" && db.mark_missing(&job.id).await.is_ok() {
                    missing_count += 1;
                }
            }
        }
    }

    if missing_count > 0 {
        info!("[Cleanup] Marked {} jobs as missing", missing_count);
    }
    if recovered_count > 0 {
        info!(
            "[Cleanup] Recovered {} jobs from missing status",
            recovered_count
        );
    }
    if missing_count == 0 && recovered_count == 0 {
        info!("[Cleanup] File scan complete. No changes.");
    }
}
