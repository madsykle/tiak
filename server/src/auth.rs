use axum::{
    async_trait,
    extract::{FromRequestParts, State},
    http::{header::{HeaderMap, SET_COOKIE}, request::Parts, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use time::{Duration, OffsetDateTime};
use argon2::{Argon2, PasswordHash, PasswordVerifier, PasswordHasher};


#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,
    pub role: String,
    pub exp: i64,
    pub iat: i64,
}

#[derive(Debug, Clone)]
pub struct AuthConfig {
    pub jwt_secret: String,
    pub jwt_expiry_hours: i64,
}

impl Default for AuthConfig {
    fn default() -> Self {
        Self {
            jwt_secret: std::env::var("JWT_SECRET")
                .unwrap_or_else(|_| "development-secret-key-change-in-production".to_string()),
            jwt_expiry_hours: std::env::var("JWT_EXPIRY_HOURS")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(24),
        }
    }
}

pub struct AuthState {
    pub config: AuthConfig,
}

impl AuthState {
    pub fn new() -> Self {
        Self {
            config: AuthConfig::default(),
        }
    }

    pub fn generate_token(&self, username: &str, role: &str) -> Result<String, jsonwebtoken::errors::Error> {
        let now = OffsetDateTime::now_utc();
        let expiry = now + Duration::hours(self.config.jwt_expiry_hours);

        let claims = Claims {
            sub: username.to_string(),
            role: role.to_string(),
            exp: expiry.unix_timestamp(),
            iat: now.unix_timestamp(),
        };

        encode(
            &Header::default(),
            &claims,
            &EncodingKey::from_secret(self.config.jwt_secret.as_bytes()),
        )
    }

    pub fn verify_token(&self, token: &str) -> Result<Claims, jsonwebtoken::errors::Error> {
        decode::<Claims>(
            token,
            &DecodingKey::from_secret(self.config.jwt_secret.as_bytes()),
            &Validation::default(),
        )
        .map(|data| data.claims)
    }
}

#[derive(Debug)]
pub struct AuthenticatedUser {
    pub username: String,
    pub role: String,
}

#[async_trait]
impl FromRequestParts<crate::routes::AppState> for AuthenticatedUser {
    type Rejection = AuthError;

    async fn from_request_parts(parts: &mut Parts, state: &crate::routes::AppState) -> Result<Self, Self::Rejection> {
        let mut token = None;

        // 1. Try to extract token from Authorization header
        if let Some(auth_header) = parts.headers.get("Authorization") {
            if let Ok(auth_str) = auth_header.to_str() {
                if auth_str.starts_with("Bearer ") {
                    token = Some(auth_str[7..].to_string());
                }
            }
        }

        // 2. Try to extract token from Cookie header
        if token.is_none() {
            if let Some(cookie_header) = parts.headers.get("Cookie") {
                if let Ok(cookie_str) = cookie_header.to_str() {
                    for cookie in cookie_str.split(';') {
                        let parts: Vec<&str> = cookie.trim().splitn(2, '=').collect();
                        if parts.len() == 2 && parts[0] == "token" {
                            token = Some(parts[1].to_string());
                            break;
                        }
                    }
                }
            }
        }

        if let Some(token) = token {
            let auth_state = parts
                .extensions
                .get::<Arc<AuthState>>()
                .ok_or(AuthError::MissingAuthState)?;

            if let Ok(claims) = auth_state.verify_token(&token) {
                return Ok(AuthenticatedUser {
                    username: claims.sub,
                    role: claims.role,
                });
            }
        }

        // If auth is disabled in configuration, bypass validation and grant full admin access
        if !state.config.server.enable_auth {
            return Ok(AuthenticatedUser {
                username: "admin_bypass".to_string(),
                role: "admin".to_string(),
            });
        }

        Err(AuthError::MissingToken)
    }
}

#[derive(Debug)]
pub struct OptionalUser {
    pub username: String,
    pub role: String,
}

#[async_trait]
impl FromRequestParts<crate::routes::AppState> for OptionalUser {
    type Rejection = std::convert::Infallible;

    async fn from_request_parts(parts: &mut Parts, state: &crate::routes::AppState) -> Result<Self, Self::Rejection> {
        // 1. Try to find a real authenticated user first
        if let Ok(user) = AuthenticatedUser::from_request_parts(parts, state).await {
            return Ok(OptionalUser {
                username: user.username,
                role: user.role,
            });
        }

        // 2. Try to identify as a guest via X-Guest-ID header
        let guest_id = parts.headers
            .get("X-Guest-ID")
            .and_then(|h| h.to_str().ok())
            .map(|s| s.to_string());

        if let Some(uid) = guest_id {
            return Ok(OptionalUser {
                username: uid,
                role: "guest".to_string(),
            });
        }

        // 3. If auth is disabled, default to admin bypass (only if no guest ID was provided)
        if !state.config.server.enable_auth {
            return Ok(OptionalUser {
                username: "admin_bypass".to_string(),
                role: "admin".to_string(),
            });
        }

        // 4. Final fallback to generic guest
        Ok(OptionalUser {
            username: "guest".to_string(),
            role: "guest".to_string(),
        })
    }
}

#[derive(Debug)]
pub enum AuthError {
    MissingToken,
    InvalidToken,
    MissingAuthState,
    InternalError(String),
}

impl IntoResponse for AuthError {
    fn into_response(self) -> Response {
        let (status, message) = match self {
            AuthError::MissingToken => (
                StatusCode::UNAUTHORIZED,
                "Missing authorization token".to_string(),
            ),
            AuthError::InvalidToken => (StatusCode::UNAUTHORIZED, "Invalid token".to_string()),
            AuthError::MissingAuthState => (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Auth state not configured".to_string(),
            ),
            AuthError::InternalError(msg) => (StatusCode::INTERNAL_SERVER_ERROR, msg),
        };

        (status, message).into_response()
    }
}

#[derive(Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

#[derive(Deserialize)]
pub struct SignupRequest {
    pub username: String,
    pub email: String,
    pub password: String,
}

pub async fn create_user_handler(
    _admin: AuthenticatedUser,
    State(state): State<crate::routes::AppState>,
    Json(payload): Json<SignupRequest>,
) -> impl IntoResponse {
    if _admin.role != "admin" {
        return (StatusCode::FORBIDDEN, "Forbidden").into_response();
    }
    let db = &state.db;

    // Check if user exists
    let existing = db.db.collection::<crate::db_optimized::models::User>("users")
        .count_documents(mongodb::bson::doc! {
            "$or": [
                { "username": &payload.username },
                { "email": &payload.email }
            ]
        }).await;

    if let Ok(count) = existing {
        if count > 0 {
            return (StatusCode::CONFLICT, "Username or email already exists").into_response();
        }
    }

    let salt = argon2::password_hash::SaltString::generate(&mut rand::thread_rng());
    let argon2 = Argon2::default();
    let password_hash = match argon2.hash_password(payload.password.as_bytes(), &salt) {
        Ok(h) => h.to_string(),
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, "Hashing failed").into_response()
    };

    let user = crate::db_optimized::models::User {
        id: uuid::Uuid::new_v4().to_string(),
        username: payload.username,
        email: payload.email,
        password_hash,
        role: "premium_member".to_string(),
        default_preset_id: None,
    };

    match db.db.collection::<crate::db_optimized::models::User>("users").insert_one(user).await {
        Ok(_) => (StatusCode::CREATED, "User created successfully").into_response(),
        Err(_) => (StatusCode::INTERNAL_SERVER_ERROR, "Failed to create user").into_response()
    }
}


pub async fn login_handler(
    State(state): State<crate::routes::AppState>,
    Json(payload): Json<LoginRequest>,
) -> impl IntoResponse {
    let db = &state.db;
    let auth_state = &state.auth_state;

    let user: Result<Option<crate::db_optimized::models::User>, _> = db.db.collection("users")
        .find_one(mongodb::bson::doc! { "username": &payload.username })
        .await;

    match user {
        Ok(Some(user)) => {
            let parsed_hash = PasswordHash::new(&user.password_hash);
            let is_valid = match parsed_hash {
                Ok(hash) => Argon2::default().verify_password(payload.password.as_bytes(), &hash).is_ok(),
                Err(_) => false,
            };

            if is_valid {
                match auth_state.generate_token(&user.username, &user.role) {
                    Ok(token) => {
                        let mut headers = HeaderMap::new();
                        let cookie_value = format!(
                            "token={}; Path=/; HttpOnly; SameSite=Lax; Max-Age={}",
                            token,
                            auth_state.config.jwt_expiry_hours * 3600
                        );
                        if let Ok(val) = axum::http::HeaderValue::from_str(&cookie_value) {
                            headers.insert(SET_COOKIE, val);
                        }
                        (headers, Json(serde_json::json!({ "token": token, "role": user.role }))).into_response()
                    }
                    Err(_) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"message": "Failed to generate token"}))).into_response()
                }
            } else {
                (StatusCode::UNAUTHORIZED, Json(serde_json::json!({"message": "Incorrect password"}))).into_response()
            }
        }
        Ok(None) => (StatusCode::UNAUTHORIZED, Json(serde_json::json!({"message": "User doesn't exist"}))).into_response(),
        Err(_) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"message": "Database error"}))).into_response()
    }
}

pub async fn logout_handler() -> impl IntoResponse {
    let mut headers = HeaderMap::new();
    let cookie_value = "token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0";
    if let Ok(val) = axum::http::HeaderValue::from_str(cookie_value) {
        headers.insert(SET_COOKIE, val);
    }
    (headers, Json(serde_json::json!({ "success": true }))).into_response()
}

pub async fn signup_handler(
    State(state): State<crate::routes::AppState>,
    Json(payload): Json<SignupRequest>,
) -> impl IntoResponse {
    let db = &state.db;

    // Check if user exists
    let existing = db.db.collection::<crate::db_optimized::models::User>("users")
        .count_documents(mongodb::bson::doc! {
            "$or": [
                { "username": &payload.username },
                { "email": &payload.email }
            ]
        }).await;

    if let Ok(count) = existing {
        if count > 0 {
            return (StatusCode::CONFLICT, Json(serde_json::json!({"message": "Username or email already exists"}))).into_response();
        }
    }

    let salt = argon2::password_hash::SaltString::generate(&mut rand::thread_rng());
    let argon2 = Argon2::default();
    let password_hash = match argon2.hash_password(payload.password.as_bytes(), &salt) {
        Ok(h) => h.to_string(),
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"message": "Hashing failed"}))).into_response()
    };

    let user = crate::db_optimized::models::User {
        id: uuid::Uuid::new_v4().to_string(),
        username: payload.username,
        email: payload.email,
        password_hash,
        role: "premium_member".to_string(),
        default_preset_id: None,
    };

    match db.db.collection::<crate::db_optimized::models::User>("users").insert_one(user).await {
        Ok(_) => (StatusCode::CREATED, Json(serde_json::json!({"message": "User created successfully"}))).into_response(),
        Err(_) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"message": "Failed to create user"}))).into_response()
    }
}

pub async fn list_users_handler(
    _admin: AuthenticatedUser,
    State(state): State<crate::routes::AppState>,
) -> impl IntoResponse {
    if _admin.role != "admin" {
        return (StatusCode::FORBIDDEN, "Forbidden").into_response();
    }
    use futures::stream::StreamExt;
    let mut cursor = state.db.db.collection::<crate::db_optimized::models::User>("users").find(mongodb::bson::doc! {}).await.unwrap();
    let mut users = Vec::new();
    while let Some(u) = cursor.next().await {
        if let Ok(user) = u {
            users.push(serde_json::json!({
                "id": user.id,
                "username": user.username,
                "email": user.email,
                "role": user.role
            }));
        }
    }
    Json(users).into_response()
}

#[derive(Deserialize)]
pub struct RoleUpdatePayload {
    pub role: String,
}

pub async fn update_role_handler(
    _admin: AuthenticatedUser,
    State(state): State<crate::routes::AppState>,
    axum::extract::Path(id): axum::extract::Path<String>,
    Json(payload): Json<RoleUpdatePayload>,
) -> impl IntoResponse {
    if _admin.role != "admin" {
        return (StatusCode::FORBIDDEN, "Forbidden").into_response();
    }
    let res = state.db.db.collection::<crate::db_optimized::models::User>("users")
        .update_one(mongodb::bson::doc! { "_id": id }, mongodb::bson::doc! { "$set": { "role": payload.role } })
        .await;
        
    match res {
        Ok(_) => StatusCode::OK.into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

