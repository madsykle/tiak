use serde::{Deserialize, Serialize, Deserializer};

fn deserialize_i64_from_any<'de, D>(deserializer: D) -> Result<i64, D::Error>
where
    D: Deserializer<'de>,
{
    use serde_json::Value;
    let v = Value::deserialize(deserializer)?;
    deserialize_value_to_i64(v).map_err(serde::de::Error::custom)
}

fn deserialize_opt_i64_from_any<'de, D>(deserializer: D) -> Result<Option<i64>, D::Error>
where
    D: Deserializer<'de>,
{
    use serde_json::Value;
    let v = Value::deserialize(deserializer)?;
    match v {
        Value::Null => Ok(None),
        other => deserialize_value_to_i64(other).map(Some).map_err(serde::de::Error::custom),
    }
}

fn deserialize_value_to_i64(v: serde_json::Value) -> Result<i64, String> {
    use serde_json::Value;
    match v {
        Value::Number(n) => n.as_i64().or_else(|| n.as_f64().map(|f| f as i64)).ok_or_else(|| "number out of i64 range".into()),
        Value::String(s) => s.parse::<i64>().map_err(|e| e.to_string()),
        _ => Err("expected number".into()),
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Job {
    #[serde(rename = "_id", alias = "id")]
    pub id: String,
    pub url: String,
    pub status: String,
    #[serde(deserialize_with = "deserialize_i64_from_any")]
    pub progress: i64,
    #[serde(deserialize_with = "deserialize_opt_i64_from_any", default)]
    pub eta: Option<i64>,
    pub filename: Option<String>,
    #[serde(rename = "createdAt", deserialize_with = "deserialize_i64_from_any")]
    pub created_at: i64,
    #[serde(rename = "startedAt", deserialize_with = "deserialize_opt_i64_from_any", default)]
    pub started_at: Option<i64>,
    #[serde(rename = "completedAt", deserialize_with = "deserialize_opt_i64_from_any", default)]
    pub completed_at: Option<i64>,
    #[serde(deserialize_with = "deserialize_i64_from_any")]
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
    #[serde(rename = "expiresAt", deserialize_with = "deserialize_opt_i64_from_any", default)]
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
