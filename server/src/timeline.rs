use crate::db::Job;
use crate::routes::AppState;
use axum::{extract::State, Json};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tokio::fs;

#[derive(Default, Clone, Serialize, Deserialize)]
pub struct TimelineDb {
    pub posted_jobs: HashMap<String, bool>,
}

pub async fn load_timeline() -> TimelineDb {
    if let Ok(data) = fs::read_to_string("data/timeline.json").await {
        serde_json::from_str(&data).unwrap_or_default()
    } else {
        TimelineDb::default()
    }
}

pub async fn save_timeline(db: &TimelineDb) {
    if let Ok(data) = serde_json::to_string_pretty(db) {
        let _ = fs::write("data/timeline.json", data).await;
    }
}

#[derive(Serialize)]
pub struct TimelineItem {
    pub job: Job,
    pub posted: bool,
}

pub async fn get_timeline(State(state): State<AppState>) -> Json<Vec<TimelineItem>> {
    let jobs = state.db.get_timeline_jobs(10_000).await.unwrap_or_default();
    let timeline_db = load_timeline().await;

    let mut timeline = Vec::new();
    for job in jobs {
        let posted = timeline_db
            .posted_jobs
            .get(&job.id)
            .copied()
            .unwrap_or(false);
        timeline.push(TimelineItem { job, posted });
    }

    Json(timeline)
}

#[derive(Deserialize)]
pub struct MarkPostedReq {
    pub job_id: String,
    pub posted: bool,
}

pub async fn mark_posted(Json(req): Json<MarkPostedReq>) -> Json<bool> {
    let mut db = load_timeline().await;
    db.posted_jobs.insert(req.job_id, req.posted);
    save_timeline(&db).await;
    Json(true)
}
