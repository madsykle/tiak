fn main() {
    let filename = "video 🎵.mp4";
    let header_val = format!("attachment; filename=\"{}\"", filename);
    println!("Trying to parse: {}", header_val);
    let h: axum::http::HeaderValue = header_val.parse().unwrap();
    println!("Parsed!");
}
