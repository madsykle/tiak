use std::fs;
use std::time::SystemTime;
fn main() {
    let t = SystemTime::UNIX_EPOCH + std::time::Duration::from_secs(1781505283);
    let mut count = 0;
    for entry in walkdir::WalkDir::new("data") {
        if let Ok(e) = entry {
            if e.file_type().is_file() {
                let name = e.file_name().to_string_lossy();
                if name == ".last_sync" || name.contains("sqlite") { continue; }
                if let Ok(meta) = e.metadata() {
                    let created = meta.created().unwrap_or(meta.modified().unwrap());
                    let modified = meta.modified().unwrap();
                    if created > t || modified > t {
                        count += 1;
                        println!("Found recent file: {} (created: {:?}, modified: {:?})", e.path().display(), created, modified);
                    }
                }
            }
        }
    }
    println!("Total recent files: {}", count);
}
