use anyhow::Result;
use mongodb::bson::doc;
use uuid::Uuid;
use futures::stream::StreamExt;

use super::{Db, Job, JobInfo};

impl Db {
    pub async fn create_job(
        &self,
        url: &str,
        category: &str,
        platform: Option<&str>,
        expires_at: Option<i64>,
        user_id: Option<&str>,
        preset_id: Option<&str>,
    ) -> Result<Job> {
        let id = Uuid::new_v4().to_string();
        let now = chrono::Utc::now().timestamp_millis();

        let job = Job {
            id: id.clone(),
            url: url.to_string(),
            status: "queued".to_string(),
            progress: 0,
            eta: None,
            filename: None,
            created_at: now,
            started_at: None,
            completed_at: None,
            retries: 0,
            error: None,
            category: category.to_string(),
            creator_name: None,
            creator_avatar: None,
            caption: None,
            transcript: None,
            hashtags: None,
            suggested_category: None,
            visual_description: None,
            platform: platform.map(|s| s.to_string()),
            expires_at,
            user_id: user_id.map(|s| s.to_string()),
            preset_id: preset_id.map(|s| s.to_string()),
        };

        self.db.collection::<Job>("jobs").insert_one(job.clone()).await?;

        Ok(job)
    }

    pub async fn add_job(
        &self,
        url: String,
        category: Option<String>,
        platform: Option<String>,
        expires_at: Option<i64>,
        user_id: Option<String>,
        preset_id: Option<String>,
    ) -> Result<Job> {
        let category = category.unwrap_or_else(|| "default".to_string());
        self.create_job(&url, &category, platform.as_deref(), expires_at, user_id.as_deref(), preset_id.as_deref()).await
    }

    pub async fn get_preset(&self, id: &str) -> Result<super::models::Preset> {
        let preset = self.db.collection::<super::models::Preset>("presets").find_one(doc! { "_id": id }).await?;
        preset.ok_or_else(|| anyhow::anyhow!("Preset not found"))
    }

    pub async fn get_job(&self, id: &str) -> Result<Job> {
        let job = self.db.collection::<Job>("jobs").find_one(doc! { "_id": id }).await?;
        job.ok_or_else(|| anyhow::anyhow!("Job not found"))
    }

    pub async fn get_queued_jobs(&self) -> Result<Vec<Job>> {
        let mut cursor = self.db.collection::<Job>("jobs")
            .find(doc! { "status": "queued" })
            .sort(doc! { "createdAt": 1 })
            .await?;
        
        let mut jobs = Vec::new();
        while let Some(job) = cursor.next().await {
            jobs.push(job?);
        }
        Ok(jobs)
    }

    pub async fn get_active_jobs(&self) -> Result<Vec<Job>> {
        let filter = doc! {
            "status": { "$in": ["queued", "downloading", "failed"] }
        };
        let mut cursor = self.db.collection::<Job>("jobs")
            .find(filter)
            .sort(doc! { "createdAt": 1 })
            .limit(100)
            .await?;
        
        let mut jobs = Vec::new();
        while let Some(job) = cursor.next().await {
            jobs.push(job?);
        }
        Ok(jobs)
    }

    pub async fn url_in_queue(&self, url: &str) -> Result<bool> {
        let filter = doc! {
            "url": url,
            "status": { "$in": ["queued", "downloading"] }
        };
        let count = self.db.collection::<Job>("jobs").count_documents(filter).await?;
        Ok(count > 0)
    }

    pub async fn url_downloaded(&self, url: &str) -> Result<Option<Job>> {
        let filter = doc! {
            "url": url,
            "status": "done"
        };
        let job = self.db.collection::<Job>("jobs")
            .find_one(filter)
            .sort(doc! { "completedAt": -1 })
            .await?;
        Ok(job)
    }

    pub async fn update_job_status(&self, id: &str, status: &str) -> Result<()> {
        let now = chrono::Utc::now().timestamp_millis();
        
        let mut update_doc = doc! { "status": status };
        match status {
            "downloading" => {
                update_doc.insert("startedAt", now);
            }
            "done" | "failed" => {
                update_doc.insert("completedAt", now);
            }
            _ => {}
        }

        self.db.collection::<Job>("jobs")
            .update_one(doc! { "_id": id }, doc! { "$set": update_doc })
            .await?;
            
        Ok(())
    }

    pub async fn update_job_progress(
        &self,
        id: &str,
        progress: i64,
        eta: Option<i64>,
    ) -> Result<()> {
        let mut update_doc = doc! { "progress": progress };
        if let Some(e) = eta {
            update_doc.insert("eta", e);
        } else {
            update_doc.insert("eta", mongodb::bson::Bson::Null);
        }

        self.db.collection::<Job>("jobs")
            .update_one(doc! { "_id": id }, doc! { "$set": update_doc })
            .await?;
        Ok(())
    }

    pub async fn update_job_filename(&self, id: &str, filename: &str) -> Result<()> {
        self.db.collection::<Job>("jobs")
            .update_one(doc! { "_id": id }, doc! { "$set": { "filename": filename } })
            .await?;
        Ok(())
    }

    pub async fn update_job_error(&self, id: &str, error: &str) -> Result<()> {
        self.db.collection::<Job>("jobs")
            .update_one(
                doc! { "_id": id }, 
                doc! { 
                    "$set": { "error": error },
                    "$inc": { "retries": 1 }
                }
            )
            .await?;
        Ok(())
    }

    pub async fn update_job_metadata(
        &self,
        id: &str,
        creator: Option<String>,
        avatar: Option<String>,
        caption: Option<String>,
    ) -> Result<()> {
        let mut update_doc = doc! {};
        
        if let Some(c) = creator { update_doc.insert("creator_name", c); } else { update_doc.insert("creator_name", mongodb::bson::Bson::Null); }
        if let Some(a) = avatar { update_doc.insert("creator_avatar", a); } else { update_doc.insert("creator_avatar", mongodb::bson::Bson::Null); }
        if let Some(cap) = caption { update_doc.insert("caption", cap); } else { update_doc.insert("caption", mongodb::bson::Bson::Null); }

        self.db.collection::<Job>("jobs")
            .update_one(doc! { "_id": id }, doc! { "$set": update_doc })
            .await?;
        Ok(())
    }

    pub async fn update_job_category(&self, id: &str, category: &str) -> Result<()> {
        self.db.collection::<Job>("jobs")
            .update_one(doc! { "_id": id }, doc! { "$set": { "category": category } })
            .await?;
        Ok(())
    }

    pub async fn update_job_platform(&self, id: &str, platform: &str) -> Result<()> {
        self.db.collection::<Job>("jobs")
            .update_one(doc! { "_id": id }, doc! { "$set": { "platform": platform } })
            .await?;
        Ok(())
    }

    pub async fn delete_job(&self, id: &str) -> Result<()> {
        self.db.collection::<Job>("jobs").delete_one(doc! { "_id": id }).await?;
        Ok(())
    }

    pub async fn get_job_history(&self, limit: i64, offset: i64, user_id: Option<&str>, role: Option<&str>) -> Result<(Vec<Job>, i64)> {
        let mut filter = doc! {};
        if role != Some("admin") {
            filter.insert("user_id", user_id.unwrap_or(""));
        }

        let total = self.db.collection::<Job>("jobs").count_documents(filter.clone()).await?;
        
        let mut cursor = self.db.collection::<Job>("jobs")
            .find(filter)
            .sort(doc! { "createdAt": -1 })
            .skip(offset as u64)
            .limit(limit as i64)
            .await?;
            
        let mut jobs = Vec::new();
        while let Some(job) = cursor.next().await {
            jobs.push(job?);
        }
        Ok((jobs, total as i64))
    }

    pub async fn get_all_jobs(&self, user_id: Option<&str>, role: Option<&str>) -> Result<Vec<Job>> {
        let filter = if role == Some("admin") {
            doc! { "status": { "$in": ["queued", "downloading", "failed"] } }
        } else if role == Some("premium_member") {
            // Premium sees their own active jobs
            doc! { 
                "user_id": user_id.unwrap_or(""),
                "status": { "$in": ["queued", "downloading", "failed"] } 
            }
        } else if let Some(uid) = user_id {
            // Guests see their active and done (ephemeral)
            doc! {
                "user_id": uid,
                "$or": [
                    { "status": { "$in": ["queued", "downloading", "failed"] } },
                    { "status": "done", "expiresAt": { "$ne": mongodb::bson::Bson::Null } }
                ]
            }
        } else {
            return Ok(vec![]);
        };

        let mut cursor = self.db.collection::<Job>("jobs")
            .find(filter)
            .sort(doc! { "createdAt": 1 })
            .await?;
            
        let mut jobs = Vec::new();
        while let Some(job) = cursor.next().await {
            jobs.push(job?);
        }
        Ok(jobs)
    }

    pub async fn get_jobs_for_missing_scan(&self) -> Result<Vec<Job>> {
        let filter = doc! { "status": { "$in": ["done", "imported", "missing"] } };
        let mut cursor = self.db.collection::<Job>("jobs").find(filter).await?;
        let mut jobs = Vec::new();
        while let Some(job) = cursor.next().await {
            jobs.push(job?);
        }
        Ok(jobs)
    }

    pub async fn get_jobs_for_metadata_backfill(&self) -> Result<Vec<Job>> {
        let filter = doc! {
            "status": "done",
            "$or": [
                { "creator_name": mongodb::bson::Bson::Null },
                { "creator_name": "" }
            ]
        };
        let mut cursor = self.db.collection::<Job>("jobs").find(filter).await?;
        let mut jobs = Vec::new();
        while let Some(job) = cursor.next().await {
            jobs.push(job?);
        }
        Ok(jobs)
    }

    pub async fn get_jobs_missing_metadata(&self) -> Result<Vec<Job>> {
        self.get_jobs_for_metadata_backfill().await
    }

    pub async fn get_done_jobs_info_map(
        &self,
        user_id: Option<&str>,
        role: Option<&str>,
    ) -> Result<std::collections::HashMap<String, JobInfo>> {
        let mut filter = doc! {
            "status": "done",
            "filename": { "$ne": mongodb::bson::Bson::Null, "$ne": "" }
        };
        
        if role != Some("admin") {
            if let Some(uid) = user_id {
                filter.insert("user_id", uid);
            } else {
                return Ok(std::collections::HashMap::new());
            }
        }
        
        let mut cursor = self.db.collection::<Job>("jobs").find(filter).await?;
        let mut map = std::collections::HashMap::new();
        
        while let Some(job) = cursor.next().await {
            let job = job?;
            let date_secs = job
                .completed_at
                .or(job.started_at)
                .unwrap_or(job.created_at)
                / 1000;
            
            use chrono::TimeZone;
            let date_str = chrono::Utc
                .timestamp_opt(date_secs, 0)
                .single()
                .map(|dt| dt.format("%Y-%m-%d").to_string())
                .unwrap_or_else(|| "1970-01-01".to_string());
                
            let key = format!(
                "{}/{}/{}",
                job.category,
                date_str,
                job.filename.as_deref().unwrap_or("")
            );
            map.insert(
                key,
                JobInfo {
                    platform: job.platform.as_deref().unwrap_or("unknown").to_string(),
                    creator: job.creator_name.clone(),
                    caption: job.caption.clone(),
                },
            );
        }
        Ok(map)
    }

    pub async fn get_timeline_jobs(&self, limit: i64) -> Result<Vec<Job>> {
        let filter = doc! { "status": { "$in": ["done", "imported"] } };
        let mut cursor = self.db.collection::<Job>("jobs")
            .find(filter)
            .sort(doc! { "createdAt": -1 })
            .limit(limit)
            .await?;
            
        let mut jobs = Vec::new();
        while let Some(job) = cursor.next().await {
            jobs.push(job?);
        }
        Ok(jobs)
    }

    pub async fn search_jobs(&self, pattern: &str) -> Result<Vec<Job>> {
        // Simple regex search
        let regex_pattern = format!("(?i){}", pattern);
        let regex = mongodb::bson::Regex { pattern: regex_pattern, options: String::new() };
        
        let filter = doc! {
            "status": "done",
            "$or": [
                { "creator_name": { "$regex": &regex } },
                { "caption": { "$regex": &regex } },
                { "category": { "$regex": &regex } },
                { "filename": { "$regex": &regex } },
                { "transcript": { "$regex": &regex } },
                { "hashtags": { "$regex": &regex } }
            ]
        };
        
        let mut cursor = self.db.collection::<Job>("jobs")
            .find(filter)
            .sort(doc! { "createdAt": -1 })
            .limit(10000)
            .await?;
            
        let mut jobs = Vec::new();
        while let Some(job) = cursor.next().await {
            jobs.push(job?);
        }
        Ok(jobs)
    }

    #[allow(dead_code)]
    pub async fn search_jobs_all_statuses(&self, pattern: &str) -> Result<Vec<Job>> {
        let regex_pattern = format!("(?i){}", pattern);
        let regex = mongodb::bson::Regex { pattern: regex_pattern, options: String::new() };
        
        let filter = doc! {
            "$or": [
                { "url": { "$regex": &regex } },
                { "filename": { "$regex": &regex } },
                { "creator_name": { "$regex": &regex } },
                { "caption": { "$regex": &regex } },
                { "category": { "$regex": &regex } },
                { "platform": { "$regex": &regex } }
            ]
        };
        
        let mut cursor = self.db.collection::<Job>("jobs")
            .find(filter)
            .sort(doc! { "createdAt": -1 })
            .limit(100)
            .await?;
            
        let mut jobs = Vec::new();
        while let Some(job) = cursor.next().await {
            jobs.push(job?);
        }
        Ok(jobs)
    }

    pub async fn get_jobs_by_category(&self, category: &str) -> Result<Vec<Job>> {
        let filter = doc! { "status": "done", "category": category };
        let mut cursor = self.db.collection::<Job>("jobs")
            .find(filter)
            .sort(doc! { "createdAt": -1 })
            .limit(2000)
            .await?;
            
        let mut jobs = Vec::new();
        while let Some(job) = cursor.next().await {
            jobs.push(job?);
        }
        Ok(jobs)
    }

    pub async fn get_jobs_by_creator(&self, creator: &str) -> Result<Vec<Job>> {
        let filter = doc! { "status": "done", "creator_name": creator };
        let mut cursor = self.db.collection::<Job>("jobs")
            .find(filter)
            .sort(doc! { "createdAt": -1 })
            .limit(2000)
            .await?;
            
        let mut jobs = Vec::new();
        while let Some(job) = cursor.next().await {
            jobs.push(job?);
        }
        Ok(jobs)
    }

    pub async fn has_active_job(&self, url: &str) -> Result<bool> {
        self.url_in_queue(url).await
    }
    
    pub async fn find_done_job_by_url(&self, url: &str) -> Result<Option<Job>> {
        self.url_downloaded(url).await
    }
    
    pub async fn update_progress(&self, id: &str, progress: i64, eta: Option<i64>) -> Result<()> {
        self.update_job_progress(id, progress, eta).await
    }
    
    pub async fn mark_downloading(&self, id: &str) -> Result<()> {
        self.update_job_status(id, "downloading").await
    }

    pub async fn mark_done(
        &self,
        id: &str,
        filename: &str,
        creator_name: Option<String>,
        creator_avatar: Option<String>,
        caption: Option<String>,
    ) -> Result<()> {
        let now = chrono::Utc::now().timestamp_millis();
        let mut update_doc = doc! {
            "status": "done",
            "progress": 100,
            "eta": mongodb::bson::Bson::Null,
            "filename": filename,
            "completedAt": now,
        };
        
        if let Some(c) = creator_name { update_doc.insert("creator_name", c); } else { update_doc.insert("creator_name", mongodb::bson::Bson::Null); }
        if let Some(a) = creator_avatar { update_doc.insert("creator_avatar", a); } else { update_doc.insert("creator_avatar", mongodb::bson::Bson::Null); }
        if let Some(cap) = caption { update_doc.insert("caption", cap); } else { update_doc.insert("caption", mongodb::bson::Bson::Null); }

        self.db.collection::<Job>("jobs")
            .update_one(doc! { "_id": id }, doc! { "$set": update_doc })
            .await?;
        Ok(())
    }

    pub async fn update_analysis_result(
        &self,
        id: &str,
        transcript: Option<String>,
        hashtags: Option<String>,
        suggested_category: Option<String>,
        visual_description: Option<String>,
    ) -> Result<()> {
        let mut update_doc = doc! {};
        if let Some(t) = transcript { update_doc.insert("transcript", t); } else { update_doc.insert("transcript", mongodb::bson::Bson::Null); }
        if let Some(h) = hashtags { update_doc.insert("hashtags", h); } else { update_doc.insert("hashtags", mongodb::bson::Bson::Null); }
        if let Some(s) = suggested_category { update_doc.insert("suggested_category", s); } else { update_doc.insert("suggested_category", mongodb::bson::Bson::Null); }
        if let Some(v) = visual_description { update_doc.insert("visual_description", v); } else { update_doc.insert("visual_description", mongodb::bson::Bson::Null); }

        self.db.collection::<Job>("jobs")
            .update_one(doc! { "_id": id }, doc! { "$set": update_doc })
            .await?;
        Ok(())
    }

    pub async fn mark_failed(&self, id: &str, error: &str) -> Result<()> {
        let now = chrono::Utc::now().timestamp_millis();
        self.db.collection::<Job>("jobs")
            .update_one(
                doc! { "_id": id }, 
                doc! { 
                    "$set": { 
                        "status": "failed", 
                        "error": error, 
                        "completedAt": now 
                    } 
                }
            )
            .await?;
        Ok(())
    }

    pub async fn increment_retry(&self, id: &str) -> Result<()> {
        self.db.collection::<Job>("jobs")
            .update_one(
                doc! { "_id": id },
                doc! {
                    "$inc": { "retries": 1 },
                    "$set": {
                        "status": "queued",
                        "progress": 0
                    },
                    "$unset": {
                        "error": "",
                        "eta": "",
                        "startedAt": "",
                        "completedAt": "",
                        "transcript": "",
                        "hashtags": "",
                        "suggested_category": "",
                        "visual_description": ""
                    }
                }
            )
            .await?;
        Ok(())
    }

    pub async fn redownload_job(&self, id: &str) -> Result<()> {
        self.db.collection::<Job>("jobs")
            .update_one(
                doc! { "_id": id },
                doc! {
                    "$inc": { "retries": 1 },
                    "$set": {
                        "status": "queued",
                        "progress": 0
                    },
                    "$unset": {
                        "eta": "",
                        "error": "",
                        "startedAt": "",
                        "completedAt": "",
                        "transcript": "",
                        "hashtags": "",
                        "suggested_category": "",
                        "visual_description": ""
                    }
                }
            )
            .await?;
        Ok(())
    }

    pub async fn check_job_exists(&self, id: &str) -> Result<bool> {
        let count = self.db.collection::<Job>("jobs").count_documents(doc! { "_id": id }).await?;
        Ok(count > 0)
    }

    pub async fn update_category_by_filename(&self, filename: &str, category: &str) -> Result<()> {
        self.db.collection::<Job>("jobs")
            .update_many(
                doc! { "filename": filename },
                doc! { "$set": { "category": category } }
            )
            .await?;
        Ok(())
    }

    pub async fn find_job_by_filename(&self, filename: &str) -> Result<Option<Job>> {
        let job = self.db.collection::<Job>("jobs").find_one(doc! { "filename": filename }).await?;
        Ok(job)
    }

    pub async fn export_all_jobs(&self) -> Result<Vec<Job>> {
        let mut cursor = self.db.collection::<Job>("jobs")
            .find(doc! {})
            .sort(doc! { "createdAt": -1 })
            .await?;
        let mut jobs = Vec::new();
        while let Some(job) = cursor.next().await {
            jobs.push(job?);
        }
        Ok(jobs)
    }

    pub async fn import_job(&self, job: Job) -> Result<()> {
        self.db.collection::<Job>("jobs").insert_one(job).await?;
        Ok(())
    }

    pub async fn reset_crashed_jobs(&self) -> Result<u64> {
        let res = self.db.collection::<Job>("jobs")
            .update_many(
                doc! { "status": "downloading" },
                doc! { "$set": { "status": "queued", "progress": 0 } }
            )
            .await?;
        Ok(res.modified_count)
    }

    pub async fn delete_old_failed_jobs(&self, before_ts: i64) -> Result<u64> {
        let res = self.db.collection::<Job>("jobs")
            .delete_many(doc! { "status": "failed", "createdAt": { "$lt": before_ts } })
            .await?;
        Ok(res.deleted_count)
    }

    pub async fn mark_missing(&self, id: &str) -> Result<()> {
        self.db.collection::<Job>("jobs")
            .update_one(doc! { "_id": id }, doc! { "$set": { "status": "missing" } })
            .await?;
        Ok(())
    }

    pub async fn recover_missing_job(&self, id: &str) -> Result<()> {
        self.db.collection::<Job>("jobs")
            .update_one(doc! { "_id": id }, doc! { "$set": { "status": "done" } })
            .await?;
        Ok(())
    }
}
