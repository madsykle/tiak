fn main() {
    let re = regex::Regex::new(r"^https?://(?:[a-zA-Z0-9\-]+\.)+[a-zA-Z]{2,}(?:/[a-zA-Z0-9\-._~:/?#\[\]@!$&'()*+,;=]*)?$").unwrap();
    println!("{}", re.is_match("https://www.tiktok.com/@username/video/123456789"));
    println!("{}", re.is_match("https://vm.tiktok.com/ZMxxx/"));
    println!("{}", re.is_match("https://youtube.com/watch?v=123"));
}
