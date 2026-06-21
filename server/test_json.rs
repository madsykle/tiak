use serde::Serialize;
use chrono::{DateTime, Utc};

#[derive(Serialize, Debug)]
pub struct SyncState {
    pub status: String,
    #[serde(rename = "lastRun")]
    pub last_run: Option<DateTime<Utc>>,
    pub logs: Vec<String>,
    pub error: Option<String>,
    #[serde(rename = "unsyncedCount")]
    pub unsynced_count: usize,
}

fn main() {
    let now = Utc::now();
    let state = SyncState {
        status: "idle".to_string(),
        last_run: Some(now),
        logs: vec![],
        error: None,
        unsynced_count: 5,
    };
    println!("{}", serde_json::to_string(&state).unwrap());
}
