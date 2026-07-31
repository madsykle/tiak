# Tiak

A high-performance, self-hosted media management and download platform for TikTok, Instagram Reels, and YouTube. Tiak provides a centralized dashboard to queue downloads, manage a private library, and stream high-quality content with a 3-tier membership system.

## 🚀 Key Features

- **Multi-Platform Support**: Effortlessly download content from TikTok, Instagram, and YouTube.
- **3-Tier Role System**:
  - 👑 **Admin**: Full system control, global stats, user management, and unlimited storage.
  - ⭐ **Premium**: Persistent storage, private library, and custom yt-dlp presets.
  - 👤 **Guest**: Anonymous downloads, locked to 1080p/1GB, with **5-minute auto-deletion**.
- **High-Performance Streaming**: Go backend with range-request support for smooth, zero-buffer playback.
- **Admin Dashboard**: Real-time server metrics, platform distribution charts, and manual user onboarding.
- **Custom Presets**: Premium members can define custom `yt-dlp` arguments for specialized formats or qualities.
- **Ephemeral Library**: Automatic background cleanup worker that deletes guest files after 5 minutes; database records are marked as "missing" to preserve history.

## 🛠️ Tech Stack

- **Backend**: Go (chi router, go.mongodb.org/mongo-driver/v2, golang-jwt/jwt/v5, argon2)
- **Frontend**: Next.js 14 App Router (TypeScript, Tailwind CSS, media-chrome)
- **Database**: MongoDB Atlas
- **Processing**: yt-dlp, FFmpeg
- **Deployment**: Vercel (Frontend), Ubuntu/Linux VPS (Backend), Nginx (Reverse Proxy)
- **State Management**: Zustand (auth + settings), TanStack Query v5 (server state)
- **Service Worker**: Custom Workbox (offline-first, custom caching strategies)

---

## 🎯 Frontend Optimizations (10 completed)

1. **TanStack Query v5** - Replaced manual fetch/polling/caching
2. **Native Video Player** - Removed `plyr` (~60KB), use `media-chrome` web components
3. **lucide-react Icons** - Replaced 41 inline SVGs with tree-shaken icons
4. **@tanstack/react-virtual** - Virtualized HistoryTable & FileDateSection
5. **Custom Workbox SW** - Removed `next-pwa` (163 packages), -6.4% bundle
6. **App Router Migration** - All pages + API routes moved, -20KB shared bundle
7. **Zustand Store** - Centralized auth + settings state, eliminated duplicated patterns
8. **next/image + Sharp** - Auto WebP/AVIF thumbnails, responsive images
9. **Bundle Audit** - Removed unused deps, optimized devtools loading
10. **Production Build** - 87.4 KB shared (down from 107 KB Pages Router = **18.5% reduction**)

---

## 📋 Prerequisites

- **Go**: 1.21+ (for backend compilation)
- **Node.js**: v18.0 or higher (for frontend)
- **Python**: 3.10+ (for yt-dlp integration)
- **MongoDB**: A running instance (local or Atlas)
- **FFmpeg**: Installed on the system path
- **yt-dlp**: Installed and in PATH (`pip install yt-dlp`)

---

## 🚀 Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/madsykle/tiak.git
cd tiak
```

### 2. Environment Setup

```bash
cp .env.example .env
```

Edit `.env` and provide your `MONGODB_URI` and a secure `JWT_SECRET` (argon2id will hash it on first run).

### 3. Server Setup (Go)

```bash
cd server
go build -o tiak-server .
./tiak-server
```

The server listens on `127.0.0.1:4697`. On first boot, it connects to MongoDB and builds the file index from `data/`.

### 4. Frontend Setup (Next.js)

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
├── server/                    # Go backend
│   ├── auth/                  # JWT + argon2 auth
│   ├── cleanup/               # Cleanup workers (guest files, thumbnails)
│   ├── config/                # Config loading (.env)
│   ├── data/                  # 191 category folders (symlinked)
│   ├── db/                    # MongoDB layer
│   ├── models/                # Data models
│   ├── queue/                 # yt-dlp download orchestration
│   ├── routes/                # HTTP handlers (chi router)
│   ├── storage/               # File index + validation
│   ├── validation/            # Input validation
│   ├── main.go                # Entry point
│   ├── go.mod/go.sum          # Dependencies
│   ├── .env                   # MongoDB URI, admin password
│   └── tiak-server            # 16MB binary (built)
├── web/                       # Next.js 14 frontend
│   ├── src/
│   │   ├── app/               # App Router pages
│   │   │   ├── (main)/        # Authenticated route group
│   │   │   │   ├── layout.tsx # Nav + providers
│   │   │   │   ├── page.tsx   # Queue (index)
│   │   │   │   ├── history/
│   │   │   │   ├── files/
│   │   │   │   ├── settings/
│   │   │   │   └── admin/
│   │   │   └── api/           # API routes (hello, share_target)
│   │   ├── components/        # UI components
│   │   │   ├── FileCard.tsx
│   │   │   ├── FilePreviewModal.tsx
│   │   │   ├── HistoryTable.tsx (virtualized)
│   │   │   ├── VideoPlayer.tsx (media-chrome)
│   │   │   ├── Thumbnail.tsx (next/Image + Sharp)
│   │   │   └── settings/      # Settings sections
│   │   ├── hooks/             # Custom hooks
│   │   ├── lib/               # API, queries, types, utils
│   │   │   ├── api.ts         # Auth, fetchWithAuth
│   │   │   ├── queries.ts     # TanStack Query hooks
│   │   │   ├── types.ts       # TypeScript interfaces
│   │   │   └── utils.ts       # Formatters, platform detection
│   │   ├── store/             # Zustand store
│   │   │   └── app-store.ts   # Auth + settings + sync state
│   │   └── styles/
│   ├── public/
│   │   ├── sw.js              # Custom Workbox SW
│   │   └── icons/             # PWA icons
│   ├── scripts/
│   │   └── generate-sw-manifest.js
│   ├── next.config.mjs
│   └── package.json
└── nginx.conf.example         # Reverse proxy template
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

### Root (.env)

| Variable | Description | Default |
| :--- | :--- | :--- |
| `MONGODB_URI` | MongoDB connection string | Required |
| `JWT_SECRET` | Secret key for auth tokens (auto-hashed) | Required |

### Server (server/.env)

| Variable | Description | Default |
| :--- | :--- | :--- |
| `PORT` | Backend server port | `4697` |
| `MONGODB_URI` | MongoDB connection string | Required |
| `JWT_SECRET` | Secret key for auth tokens | Required |
| `ADMIN_PASSWORD` | Initial admin password (argon2id) | Required |
| `DATA_ROOT` | Path to media files | `./data` |

### Frontend (web/.env.local)

| Variable | Description | Default |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_API_BASE` | Backend API endpoint | `http://localhost:4697` |

---

## 🌐 Deployment

### 1. Reverse Proxy (Nginx)

Use the provided `nginx.conf.example`. Critical rules:

- **Proxy Buffering Off** (required for smooth streaming): `proxy_buffering off;`
- Large body sizes for uploads
- WebSocket support for TanStack Query devtools

### 2. Frontend (Vercel)

The `web` directory is optimized for Vercel. Ensure `NEXT_PUBLIC_API_BASE` in Vercel dashboard points to your VPS domain.

### 3. Backend (Systemd)

```ini
[Unit]
Description=Tiak Media Server
After=network.target

[Service]
Type=simple
User=youruser
WorkingDirectory=/home/youruser/tiak/server
ExecStart=/home/youruser/tiak/server/tiak-server
Restart=always
RestartSec=5
EnvironmentFile=/home/youruser/tiak/server/.env
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

Enable: `sudo systemctl enable --now tiak`

---

## 🛠️ Troubleshooting

- **Disappearing Downloads**: Guest downloads are deleted 5 minutes after completion. Sign in as Admin to keep files forever.
- **Buffering**: Ensure Nginx config has `proxy_buffering off;` for `/api/files/stream`.
- **"unknown.mp4"**: `yt-dlp` output non-standard. Backend fallback picks newest file in folder.
- **Dev mode warnings**: Zustand persist + Fast Refresh shows "infinite loop" warnings - **production works fine**.

---

## 🤝 Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md).

## 📜 License

Distributed under the MIT License. See `LICENSE` for more information.
