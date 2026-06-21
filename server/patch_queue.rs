use std::fs;

fn main() {
    let content = fs::read_to_string("src/queue/mod.rs").unwrap();
    
    // Add QueueSettings struct
    let mut modified = content.replace(
        "use serde::Serialize;",
        "use serde::{Serialize, Deserialize};"
    );
    
    let struct_def = r#"
#[derive(Serialize, Deserialize)]
struct QueueSettings {
    max_concurrent: usize,
    sync_destination: String,
    sync_mode: String,
}

impl DownloadQueue {
    fn load_settings_sync(&self) {
        if let Ok(data) = std::fs::read_to_string("data/queue_settings.json") {
            if let Ok(settings) = serde_json::from_str::<QueueSettings>(&data) {
                if let Ok(mut max) = self.max_concurrent.try_write() {
                    *max = settings.max_concurrent;
                }
                if let Ok(mut dest) = self.sync_destination.try_write() {
                    *dest = settings.sync_destination.clone();
                }
                if let Ok(mut mode) = self.sync_mode.try_write() {
                    *mode = settings.sync_mode.clone();
                }
            }
        }
    }

    pub async fn save_settings(&self) {
        let settings = QueueSettings {
            max_concurrent: *self.max_concurrent.read().await,
            sync_destination: self.sync_destination.read().await.clone(),
            sync_mode: self.sync_mode.read().await.clone(),
        };
        if let Ok(data) = serde_json::to_string(&settings) {
            let _ = std::fs::write("data/queue_settings.json", data);
        }
    }
"#;
    
    modified = modified.replace("impl DownloadQueue {\n    pub fn new", &format!("{}\n    pub fn new", struct_def));
    
    // Inject load_settings_sync into new()
    let load_inject = r#"        queue.load_settings_sync();
        
        let q = queue.clone();"#;
    modified = modified.replace("        let q = queue.clone();", load_inject);
    
    fs::write("src/queue/mod.rs", modified).unwrap();
    println!("Patched src/queue/mod.rs");
}
