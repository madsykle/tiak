pub mod jobs;
pub mod maintenance;
pub mod models;
pub mod setup;

pub use models::{DbStats, Job, JobInfo};
use mongodb::Database;

#[derive(Debug, Clone)]
pub struct Db {
    pub(super) db: Database,
}
