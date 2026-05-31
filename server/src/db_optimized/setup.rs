use anyhow::Result;
use argon2::{
    password_hash::{PasswordHasher, SaltString},
    Argon2,
};
use mongodb::{options::{ClientOptions, IndexOptions}, Client, IndexModel};
use mongodb::bson::doc;
use uuid::Uuid;

use super::Db;

impl Db {
    pub async fn new(uri: &str) -> Result<Self> {
        let client_options = ClientOptions::parse(uri).await?;
        let db_name = client_options.default_database.as_deref().unwrap_or("tiak").to_string();
        Self::new_with_db(uri, &db_name).await
    }

    pub async fn new_with_db(uri: &str, db_name: &str) -> Result<Self> {
        let mut client_options = ClientOptions::parse(uri).await?;
        client_options.app_name = Some("tiak".to_string());
        
        let client = Client::with_options(client_options)?;
        let db = client.database(db_name);
        
        let db_struct = Self { db };

        // Attempt Migration if needed
        if let Err(e) = db_struct.migrate_from_sqlite().await {
            tracing::warn!("SQLite Migration skipped or failed: {}", e);
        }

        db_struct.ensure_schema().await?;
        db_struct.fix_job_ids().await?;
        db_struct.seed_admin_user().await?;
        
        Ok(db_struct)
    }

    async fn fix_job_ids(&self) -> Result<()> {
        use futures::stream::StreamExt;
        let coll = self.db.collection::<mongodb::bson::Document>("jobs");
        let mut cursor = coll.find(doc! { "id": { "$exists": true } }).await?;
        while let Some(res) = cursor.next().await {
            let doc = res?;
            if let Some(id) = doc.get("id").and_then(|v| v.as_str()) {
                if let Some(oid) = doc.get("_id").and_then(|v| v.as_object_id()) {
                    let mut new_doc = doc.clone();
                    let id_val = id.to_string();
                    new_doc.insert("_id", &id_val);
                    new_doc.remove("id");
                    
                    // Check if a document with this _id already exists to avoid duplicate key error
                    let existing_count = coll.count_documents(doc! { "_id": &id_val }).await.unwrap_or(0);
                    if existing_count == 0 {
                        if let Err(e) = coll.delete_one(doc! { "_id": oid }).await {
                            tracing::warn!("Failed to delete old job doc: {}", e);
                            continue;
                        }
                        if let Err(e) = coll.insert_one(new_doc).await {
                            tracing::warn!("Failed to insert fixed job doc {}: {}", id_val, e);
                        } else {
                            tracing::info!("Fixed job ID: {}", id_val);
                        }
                    } else {
                        // Already exists with this UUID as _id, just delete the old one
                        tracing::info!("Job with _id {} already exists, removing legacy doc", id_val);
                        let _ = coll.delete_one(doc! { "_id": oid }).await;
                    }
                }
            }
        }
        Ok(())
    }

    async fn migrate_from_sqlite(&self) -> Result<()> {
        let sqlite_path = std::path::Path::new("data/jobs.sqlite");
        if !sqlite_path.exists() {
            return Ok(());
        }

        tracing::info!("Found jobs.sqlite, starting migration to MongoDB...");

        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .connect("sqlite://data/jobs.sqlite")
            .await?;

        // 1. Migrate Users
        let users: Vec<crate::db_optimized::models::User> = sqlx::query_as("SELECT * FROM users").fetch_all(&pool).await?;
        if !users.is_empty() {
            let users_coll = self.db.collection::<crate::db_optimized::models::User>("users");
            // Only insert if collection is empty to avoid dupes
            if users_coll.count_documents(doc! {}).await? == 0 {
                users_coll.insert_many(users).await?;
                tracing::info!("Migrated users to MongoDB");
            }
        }

        // 2. Migrate Jobs
        let jobs: Vec<crate::db_optimized::models::Job> = sqlx::query_as("SELECT * FROM jobs").fetch_all(&pool).await?;
        if !jobs.is_empty() {
            let jobs_coll = self.db.collection::<crate::db_optimized::models::Job>("jobs");
            if jobs_coll.count_documents(doc! {}).await? == 0 {
                jobs_coll.insert_many(jobs).await?;
                tracing::info!("Migrated jobs to MongoDB");
            }
        }

        // 3. Rename sqlite db so we don't migrate again
        tokio::fs::rename("data/jobs.sqlite", "data/jobs.sqlite.migrated").await?;
        tracing::info!("Migration complete! Renamed jobs.sqlite to jobs.sqlite.migrated");

        Ok(())
    }

    async fn ensure_schema(&self) -> Result<()> {
        let jobs_coll = self.db.collection::<mongodb::bson::Document>("jobs");
        let users_coll = self.db.collection::<mongodb::bson::Document>("users");

        // Users Indexes
        users_coll.create_index(IndexModel::builder().keys(doc! { "username": 1 }).options(IndexOptions::builder().unique(true).build()).build()).await?;
        users_coll.create_index(IndexModel::builder().keys(doc! { "email": 1 }).options(IndexOptions::builder().unique(true).build()).build()).await?;

        // Jobs Indexes
        jobs_coll.create_index(IndexModel::builder().keys(doc! { "status": 1, "createdAt": 1 }).build()).await?;
        jobs_coll.create_index(IndexModel::builder().keys(doc! { "category": 1, "platform": 1 }).build()).await?;
        jobs_coll.create_index(IndexModel::builder().keys(doc! { "platform": 1 }).build()).await?;
        jobs_coll.create_index(IndexModel::builder().keys(doc! { "user_id": 1 }).build()).await?;
        jobs_coll.create_index(IndexModel::builder().keys(doc! { "completedAt": -1 }).build()).await?;
        jobs_coll.create_index(IndexModel::builder().keys(doc! { "url": 1, "status": 1 }).build()).await?;
        jobs_coll.create_index(IndexModel::builder().keys(doc! { "expiresAt": 1 }).build()).await?;
        jobs_coll.create_index(IndexModel::builder().keys(doc! { "filename": 1 }).build()).await?;
        jobs_coll.create_index(IndexModel::builder().keys(doc! { "creator_name": 1, "status": 1, "createdAt": -1 }).build()).await?;
        jobs_coll.create_index(IndexModel::builder().keys(doc! { "category": 1, "status": 1, "createdAt": -1 }).build()).await?;

        // Corrections Indexes
        let corrections_coll = self.db.collection::<mongodb::bson::Document>("corrections");
        corrections_coll.create_index(IndexModel::builder().keys(doc! { "timestamp": -1 }).build()).await?;

        // Presets Indexes
        let presets_coll = self.db.collection::<mongodb::bson::Document>("presets");
        presets_coll.create_index(IndexModel::builder().keys(doc! { "user_id": 1 }).build()).await?;

        Ok(())
    }

    async fn seed_admin_user(&self) -> Result<()> {
        let users_coll = self.db.collection::<crate::db_optimized::models::User>("users");
        
        let count = users_coll.count_documents(doc! { "username": "nesbeer" }).await?;
        if count == 0 {
            let password_env = std::env::var("ADMIN_PASSWORD");
            let password = match &password_env {
                Ok(p) => p.as_bytes(),
                Err(_) => b"NESBEERMAN0as@",
            };
            let mut rng = rand::thread_rng();
            let salt = SaltString::generate(&mut rng);
            let argon2 = Argon2::default();
            let password_hash = argon2.hash_password(password, &salt).unwrap().to_string();

            let admin = crate::db_optimized::models::User {
                id: Uuid::new_v4().to_string(),
                username: "nesbeer".to_string(),
                email: "asnesbeer3@gmail.com".to_string(),
                password_hash,
                role: "admin".to_string(),
                default_preset_id: None,
            };

            users_coll.insert_one(admin).await?;
            tracing::info!("Seeded admin user 'nesbeer'");
        }
        Ok(())
    }
}
