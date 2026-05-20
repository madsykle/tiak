use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use lazy_static::lazy_static;
use regex::Regex;
use std::path::PathBuf;

lazy_static! {
    static ref SAFE_PATH_REGEX: Regex = Regex::new(r"^[a-zA-Z0-9\-_./]+$").unwrap();
    static ref URL_REGEX: Regex = Regex::new(
        r"^https?://(?:[a-zA-Z0-9\-]+\.)+[a-zA-Z]{2,}(?:/[a-zA-Z0-9\-._~:/?#\[\]@!$&'()*+,;=]*)?$"
    )
    .unwrap();
}

#[derive(Debug)]
pub enum ValidationError {
    PathTraversalAttempt,
    InvalidPathCharacters,
    InvalidUrl,
    EmptyInput,
    TooLong(usize, usize), // actual, max
}

impl IntoResponse for ValidationError {
    fn into_response(self) -> Response {
        let (status, message) = match self {
            ValidationError::PathTraversalAttempt => (
                StatusCode::BAD_REQUEST,
                "Path traversal attempt detected".to_string(),
            ),
            ValidationError::InvalidPathCharacters => (
                StatusCode::BAD_REQUEST,
                "Invalid characters in path".to_string(),
            ),
            ValidationError::InvalidUrl => {
                (StatusCode::BAD_REQUEST, "Invalid URL format".to_string())
            }
            ValidationError::EmptyInput => {
                (StatusCode::BAD_REQUEST, "Input cannot be empty".to_string())
            }
            ValidationError::TooLong(actual, max) => (
                StatusCode::BAD_REQUEST,
                format!("Input too long: {} characters (max {})", actual, max),
            ),
        };

        (status, message).into_response()
    }
}

pub fn validate_file_path(path: &str) -> Result<PathBuf, ValidationError> {
    if path.is_empty() {
        return Err(ValidationError::EmptyInput);
    }

    if path.len() > 1024 {
        return Err(ValidationError::TooLong(path.len(), 1024));
    }

    // Check for path traversal attempts
    if path.contains("..") || path.contains("//") || path.starts_with('/') {
        return Err(ValidationError::PathTraversalAttempt);
    }

    // Check for safe characters only
    if !SAFE_PATH_REGEX.is_match(path) {
        return Err(ValidationError::InvalidPathCharacters);
    }

    let path_buf = PathBuf::from(path);

    // Ensure the path doesn't try to escape the data directory
    let normalized = path_buf.canonicalize().unwrap_or(path_buf.clone());
    if normalized != path_buf {
        return Err(ValidationError::PathTraversalAttempt);
    }

    Ok(path_buf)
}

pub fn validate_url(url: &str) -> Result<(), ValidationError> {
    if url.is_empty() {
        return Err(ValidationError::EmptyInput);
    }

    if url.len() > 2048 {
        return Err(ValidationError::TooLong(url.len(), 2048));
    }

    // Basic URL validation
    if !URL_REGEX.is_match(url) {
        return Err(ValidationError::InvalidUrl);
    }

    // Additional checks for supported platforms
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err(ValidationError::InvalidUrl);
    }

    Ok(())
}

pub fn validate_category_name(name: &str) -> Result<(), ValidationError> {
    if name.is_empty() {
        return Err(ValidationError::EmptyInput);
    }

    if name.len() > 100 {
        return Err(ValidationError::TooLong(name.len(), 100));
    }

    // Categories should only contain alphanumeric, spaces, hyphens, and underscores
    let category_regex = Regex::new(r"^[a-zA-Z0-9 \-_]+$").unwrap();
    if !category_regex.is_match(name) {
        return Err(ValidationError::InvalidPathCharacters);
    }

    Ok(())
}

pub fn sanitize_filename(filename: &str) -> String {
    let mut sanitized = String::new();

    for c in filename.chars() {
        match c {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => {
                sanitized.push('_');
            }
            _ => {
                sanitized.push(c);
            }
        }
    }

    sanitized.trim().to_string()
}

pub fn sanitize_user_input(input: &str) -> String {
    input
        .chars()
        .filter(|c| c.is_ascii() && !c.is_control())
        .take(5000)
        .collect()
}
