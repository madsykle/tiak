pub use crate::db_optimized::*;

#[cfg(test)]
mod tests {
    use super::*;
    use anyhow::Result;
    use uuid::Uuid;

    async fn create_test_db() -> Result<Db> {
        if let Ok(manifest_dir) = std::env::var("CARGO_MANIFEST_DIR") {
            let dotenv_path = std::path::Path::new(&manifest_dir).parent().unwrap().join(".env");
            dotenv::from_path(dotenv_path).ok();
        } else {
            dotenv::dotenv().ok();
        }
        let uri = std::env::var("MONGODB_URI").unwrap_or_else(|_| "mongodb://localhost:27017".to_string());
        let db_name = format!("tiak-td-{}", &Uuid::new_v4().to_string().replace("-", "")[..15]);
        Db::new_with_db(&uri, &db_name).await
    }

    #[tokio::test]
    async fn test_add_and_get_job() -> Result<()> {
        let db = create_test_db().await?;
        let job = db
            .add_job(
                "http://example.com".to_string(),
                Some("test".to_string()),
                Some("youtube".to_string()),
                None,
                None,
                None,
            )
            .await?;

        assert_eq!(job.url, "http://example.com");
        assert_eq!(job.category, "test");
        assert_eq!(job.platform.as_deref(), Some("youtube"));

        let fetched = db.get_job(&job.id).await?;
        assert_eq!(fetched.id, job.id);
        Ok(())
    }

    #[tokio::test]
    async fn test_update_analysis_result() -> Result<()> {
        let db = create_test_db().await?;
        let job = db
            .add_job("http://example.com".to_string(), None, None, None, None, None)
            .await?;

        db.update_analysis_result(
            &job.id,
            Some("transcription".to_string()),
            Some("#hash".to_string()),
            Some("Music".to_string()),
            Some("Visuals".to_string()),
        )
        .await?;

        let updated = db.get_job(&job.id).await?;
        assert_eq!(updated.transcript, Some("transcription".to_string()));
        assert_eq!(updated.hashtags, Some("#hash".to_string()));
        assert_eq!(updated.suggested_category, Some("Music".to_string()));
        assert_eq!(updated.visual_description, Some("Visuals".to_string()));
        Ok(())
    }

    #[tokio::test]
    async fn test_corrections() -> Result<()> {
        let db = create_test_db().await?;
        db.add_correction("job1", "Old", "Suggested", "New").await?;
        db.add_correction("job2", "Old2", "Suggested2", "New2")
            .await?;

        let corrections = db.get_recent_corrections(10).await?;
        assert_eq!(corrections.len(), 2);
        Ok(())
    }
}
