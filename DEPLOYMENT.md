# Tiak Deployment Guide 🌐

This guide covers everything you need to know to take Tiak from your local machine to a production server.

## 🏗️ Requirements
- **Linux VPS** (Ubuntu 22.04+ recommended)
- **MongoDB Atlas** (or a local MongoDB instance)
- **Nginx** (Reverse Proxy)
- **Node.js 18+** & **Rust Stable**

---

## 🔐 Security Hardening (Mandatory)

Before deploying, ensure your `.env` file is properly configured:

1. **JWT Secret**: Use a strong, 32+ character random string.
   ```bash
   openssl rand -base64 32
   ```
2. **Auth**: Always set `ENABLE_AUTH=true` in production.
3. **CORS**: Set `CORS_ORIGINS` to your exact frontend domains (e.g., `https://tiak.yourdomain.com`).

---

## 📦 Deployment Steps

### 1. Backend (Rust)
We recommend running the backend as a **Systemd Service**.

```bash
cd server
cargo build --release
```

Create `/etc/systemd/system/tiak-backend.service`:
```ini
[Service]
ExecStart=/home/user/tiak/server/target/release/server
WorkingDirectory=/home/user/tiak/server
Restart=always
EnvironmentFile=/home/user/tiak/.env
```

### 2. Reverse Proxy (Nginx)
Nginx is **required** for smooth streaming. Use the provided `nginx.conf.example` in the root. 

**Critical Rule**: Ensure `proxy_buffering off;` is set for the streaming endpoint to prevent stuttering.

### 3. Frontend (Vercel)
The `web/` directory is pre-configured for Vercel. 
- Set `NEXT_PUBLIC_API_BASE` in the Vercel Dashboard to `https://your-domain.com/api`.
- Ensure your backend domain matches the one in your `CORS_ORIGINS`.

---

## 🧹 Maintenance

### Cleanup Worker
The server includes a background worker that purges guest downloads every 60 seconds. Ensure the `DATA_ROOT` directory has write permissions so the server can delete these files.

### Database Backup
Since Tiak uses MongoDB, you can use `mongodump` or Atlas's built-in snapshot features to keep your library metadata safe.

---

## 📊 Monitoring
- **Health**: `GET /health`
- **Stats**: `GET /api/admin/stats` (Requires Admin JWT)
- **Logs**: Use `journalctl -u tiak-backend -f` to watch real-time server activity.
