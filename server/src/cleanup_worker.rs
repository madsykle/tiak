use tokio::time::{interval, Duration};
use crate::db_optimized::Db;
use std::path::Path;
use mongodb::bson::doc;
use futures::stream::StreamExt;

pub fn start_cleanup_worker(db: Db, data_root: String) {
    tokio::spawn(async move {
        let mut interval = interval(Duration::from_secs(60)); // Run every 60 seconds
        loop {
            interval.tick().await;
            if let Err(e) = perform_cleanup(&db, &data_root).await {
                tracing::error!("Error during cleanup worker: {}", e);
            }
        }
    });
}

async fn perform_cleanup(db: &Db, data_root: &str) -> anyhow::Result<()> {
    let now = chrono::Utc::now().timestamp_millis();
    
    // Find expired jobs (exclude active downloads/queue)
    let filter = doc! {
        "expiresAt": { "$ne": mongodb::bson::Bson::Null, "$lte": now },
        "status": { "$nin": ["queued", "downloading"] }
    };
    
    let mut cursor = db.db.collection::<crate::db_optimized::Job>("jobs").find(filter).await?;
    let mut expired_jobs = Vec::new();
    while let Some(res) = cursor.next().await {
        expired_jobs.push(res?);
    }

    if !expired_jobs.is_empty() {
        tracing::info!("Found {} expired ephemeral jobs to clean up", expired_jobs.len());
    }

    for job in expired_jobs {
        // 1. If the job has a filename (meaning it finished downloading), delete the file
        if let Some(filename) = job.filename {
            // Get date string from completedAt or createdAt
            let date_ms = job.completed_at.or(job.started_at).unwrap_or(job.created_at);
            use chrono::TimeZone;
            let date_str = chrono::Utc.timestamp_millis_opt(date_ms).single()
                .map(|dt| dt.format("%Y-%m-%d").to_string())
                .unwrap_or_else(|| "1970-01-01".to_string());

            let file_path = Path::new(data_root).join(&job.category).join(date_str).join(&filename);
            if file_path.exists() {
                if let Err(e) = tokio::fs::remove_file(&file_path).await {
                    tracing::error!("Failed to delete expired file {:?}: {}", file_path, e);
                } else {
                    tracing::info!("Deleted expired file: {:?}", file_path);
                }
            }
            
            // Also try to delete thumbnails
            let thumbnail_path = Path::new(data_root).join(".thumbnails").join(format!("{}.jpg", filename));
            if thumbnail_path.exists() {
                let _ = tokio::fs::remove_file(thumbnail_path).await;
            }
        }
        
        // 2. Instead of deleting the job, mark it as missing so history is preserved
        let _ = db.db.collection::<crate::db_optimized::Job>("jobs")
            .update_one(
                doc! { "_id": &job.id },
                doc! { 
                    "$set": { "status": "missing" },
                    "$unset": { "expiresAt": "" }
                }
            ).await?;
        
        tracing::info!("Expired file cleaned up, kept record as 'missing': {}", job.id);
    }
    
    Ok(())
}
