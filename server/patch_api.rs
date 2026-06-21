use std::fs;

fn main() {
    let mut content = fs::read_to_string("src/routes/queue_api.rs").unwrap();
    
    // In update_settings
    let before = r#"    if let Some(mode) = payload.sync_mode {
        state.queue.set_sync_mode(mode).await;
    }"#;
    let after = r#"    if let Some(mode) = payload.sync_mode {
        state.queue.set_sync_mode(mode).await;
    }
    state.queue.save_settings().await;"#;
    content = content.replace(before, after);
    
    // In set_settings
    let before2 = r#"    if let Some(mode) = payload.sync_mode {
        state.queue.set_sync_mode(mode).await;
    }"#;
    content = content.replace(before2, after);

    fs::write("src/routes/queue_api.rs", content).unwrap();
    println!("Patched src/routes/queue_api.rs");
}
