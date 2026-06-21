use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Job {
    #[serde(rename = "_id", alias = "id")]
    pub id: String,
    pub url: String,
    pub status: String,
    pub progress: i64,
    pub eta: Option<i64>,
    pub filename: Option<String>,
    #[serde(rename = "createdAt")]
    pub created_at: i64,
    #[serde(rename = "startedAt")]
    pub started_at: Option<i64>,
    #[serde(rename = "completedAt")]
    pub completed_at: Option<i64>,
    pub retries: i64,
    pub error: Option<String>,
    #[serde(default)]
    pub category: String,
    #[serde(default)]
    pub creator_name: Option<String>,
    #[serde(default)]
    pub creator_avatar: Option<String>,
    #[serde(default)]
    pub caption: Option<String>,
    #[serde(default)]
    pub transcript: Option<String>,
    #[serde(default)]
    pub hashtags: Option<String>,
    #[serde(default)]
    pub suggested_category: Option<String>,
    #[serde(default)]
    pub visual_description: Option<String>,
    #[serde(default)]
    pub platform: Option<String>,
    #[serde(rename = "expiresAt")]
    pub expires_at: Option<i64>,
    pub user_id: Option<String>,
    pub preset_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct User {
    #[serde(rename = "_id", alias = "id")]
    pub id: String,
    pub username: String,
    pub email: String,
    pub password_hash: String,
    pub role: String,
    pub default_preset_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Preset {
    #[serde(rename = "_id", alias = "id")]
    pub id: String,
    pub user_id: String,
    pub name: String,
    pub args: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct JobInfo {
    pub platform: String,
    pub creator: Option<String>,
    pub caption: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DbStats {
    pub total_jobs: i64,
    pub done_jobs: i64,
    pub failed_jobs: i64,
    pub queue_size: i64,
    pub categories: Vec<(String, i64)>,
    pub platforms: Vec<(Option<String>, i64)>,
}
