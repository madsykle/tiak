use axum::http::header::{HeaderName, ACCEPT, AUTHORIZATION, CONTENT_TYPE};
use axum::http::{HeaderValue, Method};
use dotenv::dotenv;
use moka::future::Cache;
use server::auth::AuthState;
use server::cleanup::{fix_job_categories, run_cleanup, scan_for_missing_files};
use server::config::AppConfig;
use server::db::Db;
use server::queue::DownloadQueue;
use server::routes::{create_router, AppState};
use server::storage::FileIndex;
use std::sync::Arc;
use std::time::Duration;
use tokio::net::TcpListener;
use tower_http::compression::CompressionLayer;
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;
use tracing::info;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenv().ok();

    // Load and validate configuration
    let config = AppConfig::new();
    if let Err(errors) = config.validate() {
        for error in errors {
            eprintln!("Configuration error: {}", error);
        }
        std::process::exit(1);
    }

    info!("Configuration loaded: {:?}", config);

    // Logging
    tracing_subscriber::fmt::init();

    // DB
    let db = Db::new(&config.server.mongodb_uri).await?;
    info!("Database initialized");

    // File Index
    let file_index = Arc::new(FileIndex::new());
    file_index.build_index().await?;
    info!("File index built");

    // File Index Background Update - less frequent to reduce blocking
    let index_clone = file_index.clone();
    tokio::spawn(async move {
        // Start with a delay to avoid blocking on startup
        tokio::time::sleep(std::time::Duration::from_secs(5 * 60)).await; // 5 mins initial delay

        let mut interval = tokio::time::interval(std::time::Duration::from_secs(30 * 60)); // 30 mins
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);

        loop {
            interval.tick().await;
            info!("Starting scheduled file index rebuild...");
            if let Err(e) = index_clone.build_index().await {
                info!("Error rebuilding index: {}", e);
            } else {
                info!("File index rebuild completed");
            }
        }
    });

    // Queue
    let queue = DownloadQueue::new(db.clone(), file_index.clone());
    queue.load_initial_state().await;
    info!("Queue initialized");

    // Cleanup Worker (for ephemeral jobs)
    server::cleanup_worker::start_cleanup_worker(db.clone(), config.server.data_root.clone());

    // Cleanup Task
    let db_clone = db.clone();
    let index_clone_for_cleanup = file_index.clone();
    tokio::spawn(async move {
        // Run immediately on startup
        run_cleanup(&db_clone).await;
        fix_job_categories(&db_clone, &index_clone_for_cleanup).await;
        scan_for_missing_files(&db_clone, &index_clone_for_cleanup).await;

        let mut interval = tokio::time::interval(std::time::Duration::from_secs(24 * 60 * 60)); // 24h
        loop {
            interval.tick().await;
            run_cleanup(&db_clone).await;
            fix_job_categories(&db_clone, &index_clone_for_cleanup).await;
            scan_for_missing_files(&db_clone, &index_clone_for_cleanup).await;
        }
    });

    // Cache for URLs (1 hour expiration)
    let url_cache = Cache::builder()
        .max_capacity(1000)
        .time_to_live(Duration::from_secs(3600))
        .build();

    // Auth State
    let auth_state = Arc::new(AuthState::new());

    // App State
    let app_state = AppState {
        db: db.clone(),
        queue: queue.clone(),
        file_index: file_index.clone(),
        url_cache,
        config: config.clone(),
        auth_state: auth_state.clone(),
    };

    // CORS
    let mut cors_builder = CorsLayer::new()
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::DELETE,
            Method::OPTIONS,
            Method::PATCH,
        ])
        .allow_headers([
            AUTHORIZATION,
            CONTENT_TYPE,
            ACCEPT,
            HeaderName::from_static("x-guest-id"),
            HeaderName::from_static("ngrok-skip-browser-warning"),
        ]);

    // Configure allowed origins from config
    let mut origins = Vec::new();
    for origin in &config.server.cors_origins {
        if let Ok(header) = origin.parse::<HeaderValue>() {
            origins.push(header);
        }
    }

    if !origins.is_empty() {
        cors_builder = cors_builder.allow_origin(origins).allow_credentials(true);
    } else {
        cors_builder = cors_builder.allow_origin(Any);
    }

    // Router
    let app = create_router(app_state)
        .layer(cors_builder)
        .layer(CompressionLayer::new())
        .layer(TraceLayer::new_for_http());

    // Server
    let port = config.server.port;
    let addr = format!("{}:{}", config.server.host, port);
    info!("Server listening on {}", addr);

    let listener = TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
