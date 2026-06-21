# Tiak

A high-performance, self-hosted media management and download platform for TikTok, Instagram Reels, and YouTube. Tiak provides a centralized dashboard to queue downloads, manage a private library, and stream high-quality content with a 3-tier membership system.

## 🚀 Key Features

- **Multi-Platform Support**: Effortlessly download content from TikTok, Instagram, and YouTube.
- **3-Tier Role System**:
    - 👑 **Admin**: Full system control, global stats, user management, and unlimited storage.
    - ⭐ **Premium**: Persistent storage, private library, and custom yt-dlp presets.
    - 👤 **Guest**: Anonymous downloads, locked to 1080p/1GB, with **5-minute auto-deletion**.
- **High-Performance Streaming**: Rust-powered backend with range-request support for smooth, zero-buffer playback.
- **Admin Dashboard**: Real-time server metrics, platform distribution charts, and manual user onboarding.
- **Custom Presets**: Premium members can define custom `yt-dlp` arguments for specialized formats or qualities.
- **Ephemeral Library**: Automatic background cleanup worker that deletes guest files after 5 minutes; database records are marked as "missing" to preserve history.

## 🛠️ Tech Stack

- **Backend**: Rust (Axum, Tokio, MongoDB)
- **Frontend**: Next.js 14 (TypeScript, Tailwind CSS, Plyr)
- **Database**: MongoDB (Primary), SQLite (Legacy migration source)
- **Processing**: yt-dlp, FFmpeg
- **Deployment**: Vercel (Frontend), Ubuntu/Linux VPS (Backend), Nginx (Reverse Proxy)

## 📋 Prerequisites

- **Rust**: Latest stable toolchain.
- **Node.js**: v18.0 or higher.
- **Python**: 3.10+ (for yt-dlp integration).
- **MongoDB**: A running instance (local or Atlas).
- **FFmpeg**: Installed on the system path.

---

## 🚀 Getting Started

### 1. Clone the Repository
```bash
git clone https://github.com/madsykle/tiak.git
cd tiak
```

### 2. Environment Setup
Tiak uses a centralized configuration. Copy the example file in the root:
```bash
cp .env.example .env
```
Edit `.env` and provide your `MONGODB_URI` and a secure `JWT_SECRET`.

### 3. Server Setup (Rust)
The server handles the core logic and media processing.
```bash
cd server
# Setup Python virtual environment for yt-dlp
./install_deps.sh
# Run the server
cargo run
```
*Note: On first boot, Tiak will automatically migrate any existing `jobs.sqlite` data to your MongoDB cluster.*

### 4. Frontend Setup (Next.js)
The web dashboard provides the user interface.
```bash
cd web
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to view the dashboard.

---

## 🏗️ Architecture

### Directory Structure
```
├── server/
│   ├── src/
│   │   ├── auth.rs           # RBAC & JWT Logic
│   │   ├── cleanup_worker.rs # Ephemeral file deletion (60s interval)
│   │   ├── db_optimized/     # MongoDB drivers & models
│   │   ├── queue/            # yt-dlp download orchestration
│   │   └── routes/           # API Endpoints (Admin vs Guest)
│   └── bin/                  # Pre-compiled yt-dlp binary
├── web/
│   ├── src/
│   │   ├── components/       # UI Library (Plyr, Memoized cards)
│   │   ├── lib/              # API wrapper with Auth interceptors
│   │   └── pages/            # Next.js Routes (Admin, Files, History)
└── nginx.conf.example        # Reverse proxy template
```

### Role-Based Access Control (RBAC)

| Feature | Guest | Premium | Admin |
| :--- | :---: | :---: | :---: |
| Download Media | ✅ (1080p/1GB) | ✅ (Unlimited) | ✅ (Highest) |
| Auto-Delete | ⏱️ 5 Minutes | ♾️ Never | ⏱️ Never |
| Private Library | ❌ | ✅ | ✅ |
| Custom Presets | ❌ | ✅ | ✅ |
| Admin Dashboard | ❌ | ❌ | ✅ |
| User Management | ❌ | ❌ | ✅ |

---

## ⚙️ Environment Variables

| Variable | Description | Default |
| :--- | :--- | :--- |
| `PORT` | Backend server port | `4697` |
| `MONGODB_URI` | MongoDB connection string | Required |
| `JWT_SECRET` | Secret key for auth tokens | Required |
| `CORS_ORIGINS` | Allowed frontend domains | `localhost` |
| `NEXT_PUBLIC_API_BASE` | Frontend API endpoint | `https://your-domain/api` |

---

## 🌐 Deployment

### 1. Reverse Proxy (Nginx)
Use the provided `nginx.conf.example`. It includes critical rules for **Proxy Buffering Off** (required for smooth streaming) and large body sizes.

### 2. Frontend (Vercel)
The `web` directory is optimized for Vercel. Ensure your `NEXT_PUBLIC_API_BASE` in the Vercel dashboard points to your VPS domain.

### 3. Backend (Systemd)
Create a systemd service to keep the Rust server running:
```ini
[Service]
ExecStart=/usr/bin/cargo run --release
WorkingDirectory=/home/user/tiak/server
Restart=always
EnvironmentFile=/home/user/tiak/.env
```

---

## 🛠️ Troubleshooting

- **Disappearing Downloads**: If you are a Guest, downloads are deleted 5 minutes after completion. Sign in as Admin to keep files forever.
- **Buffering**: Ensure your Nginx config has `proxy_buffering off;` for the `/api/files/stream` location.
- **"unknown.mp4"**: This usually means `yt-dlp` output was non-standard. The backend now includes a fallback to pick the newest file in the folder if this happens.

## 🤝 Contributing

Contributions are what make the open source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**. Please see [CONTRIBUTING.md](CONTRIBUTING.md).

## 📜 License

Distributed under the MIT License. See `LICENSE` for more information.
