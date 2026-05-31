use anyhow::Result;
use mongodb::bson::{doc, Document};
use futures::stream::StreamExt;

use super::Db;

impl Db {
    pub async fn run_maintenance(&self) -> Result<i64> {
        Ok(0)
    }

    pub async fn add_correction(
        &self,
        job_id: &str,
        original: &str,
        suggested: &str,
        final_cat: &str,
    ) -> Result<()> {
        let coll = self.db.collection::<Document>("corrections");
        let doc = doc! {
            "job_id": job_id,
            "original": original,
            "suggested": suggested,
            "final_cat": final_cat,
            "timestamp": chrono::Utc::now().timestamp(),
        };
        coll.insert_one(doc).await?;
        Ok(())
    }

    pub async fn get_recent_corrections(&self, limit: i64) -> Result<Vec<(String, String, String, String, i64)>> {
        let coll = self.db.collection::<Document>("corrections");
        let find_options = mongodb::options::FindOptions::builder()
            .sort(doc! { "timestamp": -1 })
            .limit(limit)
            .build();
        
        let mut cursor = coll.find(doc! {}).with_options(find_options).await?;
        let mut results = Vec::new();
        while let Some(res) = cursor.next().await {
            let doc = res?;
            let job_id = doc.get_str("job_id").unwrap_or("").to_string();
            let original = doc.get_str("original").unwrap_or("").to_string();
            let suggested = doc.get_str("suggested").unwrap_or("").to_string();
            let final_cat = doc.get_str("final_cat").unwrap_or("").to_string();
            let timestamp = doc.get_i64("timestamp").unwrap_or(0);
            results.push((job_id, original, suggested, final_cat, timestamp));
        }
        Ok(results)
    }

    pub async fn get_stats(&self) -> Result<super::DbStats> {
        let total_jobs = self.db.collection::<super::Job>("jobs").count_documents(doc! {}).await? as i64;
        let done_jobs = self.db.collection::<super::Job>("jobs").count_documents(doc! { "status": "done" }).await? as i64;
        let failed_jobs = self.db.collection::<super::Job>("jobs").count_documents(doc! { "status": "failed" }).await? as i64;
        let queue_size = self.db.collection::<super::Job>("jobs").count_documents(doc! { "status": "queued" }).await? as i64;

        // Group by category
        let pipeline = vec![
            doc! { "$group": { "_id": "$category", "count": { "$sum": 1 } } }
        ];
        let mut cursor = self.db.collection::<Document>("jobs").aggregate(pipeline).await?;
        let mut categories = Vec::new();
        while let Some(res) = cursor.next().await {
            let doc: Document = res?;
            let id = doc.get_str("_id").unwrap_or("default").to_string();
            let count = doc.get_i32("count").or_else(|_| doc.get_i64("count").map(|v| v as i32)).unwrap_or(0) as i64;
            categories.push((id, count));
        }

        // Group by platform
        let pipeline_p = vec![
            doc! { "$group": { "_id": "$platform", "count": { "$sum": 1 } } }
        ];
        let mut cursor_p = self.db.collection::<Document>("jobs").aggregate(pipeline_p).await?;
        let mut platforms = Vec::new();
        while let Some(res) = cursor_p.next().await {
            let doc: Document = res?;
            let id = doc.get("_id").and_then(|v| v.as_str()).map(|s| s.to_string());
            let count = doc.get_i32("count").or_else(|_| doc.get_i64("count").map(|v| v as i32)).unwrap_or(0) as i64;
            platforms.push((id, count));
        }

        Ok(super::DbStats {
            total_jobs,
            done_jobs,
            failed_jobs,
            queue_size,
            categories,
            platforms,
        })
    }

    pub async fn get_job_history_count(&self) -> Result<i64> {
        let count = self.db.collection::<super::Job>("jobs").count_documents(doc! {}).await?;
        Ok(count as i64)
    }

    pub async fn optimize_db(&self) -> Result<()> {
        Ok(())
    }
}
