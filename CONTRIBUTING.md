# Contributing to Tiak 🚀

First off, thank you for considering contributing to Tiak! This project thrives on community involvement, from fixing bugs to proposing major architectural shifts.

## 🛠️ The Monorepo Structure

Tiak is organized into three main areas:
- `server/`: Rust backend (Axum + MongoDB).
- `web/`: Next.js frontend (TypeScript + Tailwind).
- `android_native/`: Native Android app.

## 🧪 How Can I Contribute?

### 1. Development Setup
You will need a running **MongoDB** instance (local or Atlas) to work on the backend.

```bash
# 1. Clone and Setup Environment
git clone https://github.com/madsykle/tiak.git
cp .env.example .env

# 2. Run Backend
cd server
./install_deps.sh
cargo run

# 3. Run Frontend
cd web
npm install
npm run dev
```

### 2. Role-Based Testing
When adding features, consider how they affect different user roles:
- **Admin**: Has access to all files and system stats.
- **Premium**: Has persistent storage and a private library.
- **Guest**: Has ephemeral storage (deleted after 5 mins).

### 3. Pull Request Protocol
1. Fork the repo and create your branch from `main`.
2. Ensure your code follows the local style (run `cargo fmt` and `npm run lint`).
3. Add tests for new logic if possible.
4. Issue your pull request with a clear description of the "Why" behind the change.

## 🛡️ Security First
- **Never** commit secrets or API keys.
- **Always** use the `--` separator when adding new shell execution points to prevent injection.
- Ensure all new API endpoints are correctly categorized into `admin_routes` or `guest_routes` in `routes.rs`.

## 📜 Code of Conduct
Be kind, be professional, and let's build something cool together!
