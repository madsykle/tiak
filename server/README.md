# Tiak Backend Server (v2.0)

The robust, high-performance core of Tiak. Built with Rust (Axum), MongoDB, and Tokion async runtime.

## 🏗️ Architecture

- **Primary Database**: MongoDB (Scalable, NoSQL) for users, jobs, and presets.
- **Async Processing**: Multi-threaded download queue powered by `yt-dlp` and `tokio`.
- **Identity & RBAC**: Advanced Role-Based Access Control (Admin, Premium, Guest) with JWT validation.
- **Ephemeral Cleanup**: Automated background worker that purges Guest files after 5 minutes of inactivity.

## 🛠️ Key Features

- **Multi-Platform Support**: Seamlessly handles TikTok, Instagram, YouTube, and 100+ other providers via `yt-dlp`.
- **Injection Protection**: Hardened against command injection using strict `--` flag boundaries for external binaries.
- **Streaming Engine**: Optimized for Nginx `proxy_buffering off` to provide zero-lag video seeking.
- **Metadata Fallback**: Intelligent creator/caption parsing with filesystem-level recovery for interrupted downloads.

## 🚀 Getting Started

### Prerequisites
- **Rust**: 1.75+
- **MongoDB**: v6.0+
- **Python venv**: Required for `yt-dlp` and `scripts/transcribe.py`
- **External Binaries**: `yt-dlp`, `ffmpeg`, `rclone` (optional)

### Setup

1. **Install Python dependencies**:
   ```bash
   bash install_deps.sh
   ```

2. **Build and Run**:
   ```bash
   cargo run --release
   ```

## 🔒 Configuration
Uses the root `.env` file (linked). Mandatory variables:
- `MONGODB_URI`: Connection string for MongoDB.
- `JWT_SECRET`: 32+ character key for secure authentication.
- `DATA_ROOT`: Root directory for media storage.

## 📋 API Documentation
The server exposes a RESTful API at `/api`. Admin routes require an `admin` claim in the JWT, while Premium routes require `premium_member`. Guest routes are open but subject to strict resource limits (1GB/1080p).
