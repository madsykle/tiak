# Contributing to Tiak 🚀

Thank you for considering contributing to Tiak! This project thrives on community involvement.

## 🛠️ The Monorepo Structure

```
tiak/
├── server/          # Go backend (chi + MongoDB)
│   ├── auth/        # JWT + argon2 auth
│   ├── cleanup/     # Background workers
│   ├── config/      # .env loading
│   ├── data/        # Media files (191 categories)
│   ├── db/          # MongoDB layer
│   ├── models/      # Data structures
│   ├── queue/       # yt-dlp orchestration
│   ├── routes/      # HTTP handlers
│   ├── storage/     # File index + validation
│   ├── validation/  # Input validation
│   ├── main.go
│   └── go.mod
├── web/             # Next.js 14 App Router frontend
│   ├── src/
│   │   ├── app/          # App Router pages
│   │   │   ├── (main)/   # Authenticated routes
│   │   │   └── api/      # API routes
│   │   ├── components/   # UI components
│   │   ├── hooks/        # Custom hooks
│   │   ├── lib/          # API, queries, types
│   │   └── store/        # Zustand store
│   ├── public/sw.js      # Custom Workbox SW
│   └── scripts/
└── nginx.conf.example
```

## 🧪 Development Setup

### Prerequisites

- **Go 1.21+** (backend)
- **Node.js 18+** (frontend)
- **MongoDB** (Atlas or local)
- **Python 3.10+** (yt-dlp)
- **FFmpeg** (in PATH)

### Run Locally

```bash
# 1. Clone & configure
git clone https://github.com/madsykle/tiak.git
cd tiak
cp .env.example .env
# Edit .env with MONGODB_URI, JWT_SECRET

# 2. Backend
cd server
go build -o tiak-server .
./tiak-server          # Runs on 127.0.0.1:4697

# 3. Frontend
cd ../web
npm install
npm run dev            # Runs on localhost:3000
```

### Test Credentials

- **Admin**: Username from `ADMIN_PASSWORD` in `server/.env` (default: `admin` / `NESBEERMAN0as@`)
- **Guest**: No login required (ephemeral)

---

## 🔧 How to Contribute

### Code Style

- **Go**: `go fmt ./...` + `go vet ./...`
- **TypeScript**: `npm run lint` (ESLint + Prettier)
- **Commits**: Conventional commits (`feat:`, `fix:`, `chore:`, `docs:`)

### Frontend Guidelines (Ponytail Mode)

- **Lazy first**: Use stdlib/native before adding deps
- **Delete over add**: Remove dead code, unused deps
- **One optimization at a time**: Build → test → commit → push
- **Bundle awareness**: Check `npm run build` output sizes

### Backend Guidelines

- **Chi router** for HTTP handlers
- **go.mongodb.org/mongo-driver/v2** for MongoDB
- **golang-jwt/jwt/v5** + **argon2** for auth
- **Single binary** deployment (no runtime deps)

### Testing Role-Based Features

| Role | Capabilities |
| ------ | -------------- |
| **Admin** | Full access, user mgmt, stats, unlimited |
| **Premium** | Persistent library, custom presets |
| **Guest** | 1080p/1GB limit, 5-min auto-delete |

---

## 📋 Pull Request Protocol

1. **Fork** and create branch from `main`
2. **Run checks**: `go build`, `npm run build`, `npm run lint`
3. **Write tests** for new logic (Jest for frontend)
4. **Clear description**: Explain the "Why", not just "What"
5. **Screenshots** for UI changes
6. **Bundle impact** note for frontend PRs

---

## 🛡️ Security First

- **Never** commit secrets (`.env`, tokens, keys)
- **Always** use parameterized queries (no string concat)
- **Validate** all inputs (use `validation/` package)
- **Categorize** routes: `admin_routes` vs `guest_routes` in `routes/router.go`

---

## 📜 Code of Conduct

Be kind, be professional, and let's build something cool together!

---

## 🏷️ Labels for Issues/PRs

- `frontend` - Web/UI changes
- `backend` - Go server changes
- `optimization` - Performance/size improvements
- `bug` - Something broken
- `feature` - New capability
- `docs` - Documentation updates
