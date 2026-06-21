use std::fs;

fn main() {
    if let Ok(meta) = fs::metadata("data/.last_sync") {
        println!("created: {:?}", meta.created());
        println!("modified: {:?}", meta.modified());
    }
}
