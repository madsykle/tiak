use std::fs;
fn main() {
    println!("{:?}", fs::metadata("data/.last_sync"));
}
