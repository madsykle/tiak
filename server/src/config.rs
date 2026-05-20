use serde::{Deserialize, Serialize};
use std::env;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerConfig {
    pub port: u16,
    pub host: String,
    pub data_root: String,
    pub mongodb_uri: String,
    pub max_concurrent_downloads: u8,
    pub cors_origins: Vec<String>,
    pub jwt_secret: String,
    pub jwt_expiry_hours: i64,
    pub enable_auth: bool,
}

impl Default for ServerConfig {
    fn default() -> Self {
        Self {
            port: env::var("PORT")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(4697),
            host: env::var("HOST").unwrap_or_else(|_| "0.0.0.0".to_string()),
            data_root: env::var("DATA_ROOT").unwrap_or_else(|_| "data".to_string()),
            mongodb_uri: env::var("MONGODB_URI").unwrap_or_else(|_| {
                "mongodb://localhost:27017/tiak".to_string()
            }),
            max_concurrent_downloads: env::var("MAX_CONCURRENT_DOWNLOADS")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(4),
            cors_origins: parse_cors_origins(),
            jwt_secret: env::var("JWT_SECRET").unwrap_or_else(|_| {
                // In production, this should be a proper secret
                "development-secret-key-change-in-production".to_string()
            }),
            jwt_expiry_hours: env::var("JWT_EXPIRY_HOURS")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(24),
            enable_auth: env::var("ENABLE_AUTH")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(false),
        }
    }
}

fn parse_cors_origins() -> Vec<String> {
    env::var("CORS_ORIGINS")
        .map(|s| {
            s.split(',')
                .map(|origin| origin.trim().to_string())
                .filter(|origin| !origin.is_empty())
                .collect()
        })
        .unwrap_or_else(|_| {
            vec![
                "http://localhost:3000".to_string(),
                "http://localhost:3001".to_string(),
            ]
        })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecurityConfig {
    pub max_upload_size: usize,
    pub rate_limit_requests: u32,
    pub rate_limit_window_seconds: u64,
    pub enable_rate_limiting: bool,
    pub enable_https_redirect: bool,
    pub security_headers: bool,
}

impl Default for SecurityConfig {
    fn default() -> Self {
        Self {
            max_upload_size: env::var("MAX_UPLOAD_SIZE")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(10 * 1024 * 1024), // 10MB
            rate_limit_requests: env::var("RATE_LIMIT_REQUESTS")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(100),
            rate_limit_window_seconds: env::var("RATE_LIMIT_WINDOW_SECONDS")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(60),
            enable_rate_limiting: env::var("ENABLE_RATE_LIMITING")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(false),
            enable_https_redirect: env::var("ENABLE_HTTPS_REDIRECT")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(false),
            security_headers: env::var("SECURITY_HEADERS")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(true),
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AppConfig {
    pub server: ServerConfig,
    pub security: SecurityConfig,
}

impl AppConfig {
    pub fn new() -> Self {
        Self {
            server: ServerConfig::default(),
            security: SecurityConfig::default(),
        }
    }

    pub fn validate(&self) -> Result<(), Vec<String>> {
        let mut errors = Vec::new();

        if self.server.enable_auth {
            if self.server.jwt_secret == "development-secret-key-change-in-production" {
                errors.push("JWT_SECRET must be changed from the default value when authentication is enabled".to_string());
            }
            if self.server.jwt_secret.len() < 32 {
                errors.push("JWT_SECRET must be at least 32 characters for adequate security".to_string());
            }
        }

        if self.server.port == 0 {
            errors.push("PORT must be a valid port number".to_string());
        }

        if self.security.max_upload_size > 100 * 1024 * 1024 {
            errors.push("MAX_UPLOAD_SIZE should not exceed 100MB".to_string());
        }

        if errors.is_empty() {
            Ok(())
        } else {
            Err(errors)
        }
    }
}
