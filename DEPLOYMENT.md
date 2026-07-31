# Tiak Deployment Guide 🌐

This guide covers everything you need to know to take Tiak from your local machine to a production server.

## 🏗️ Requirements

- **Linux VPS** (Ubuntu 22.04+ recommended, 4 cores / 4GB+ RAM)
- **MongoDB Atlas** (or local MongoDB instance)
- **Nginx** (Reverse Proxy)
- **Go 1.21+** & **Node.js 18+**

---

## 🔐 Security Hardening (Mandatory)

Before deploying, ensure your `.env` files are properly configured:

1. **JWT Secret**: Use a strong, 32+ character random string.

   ```bash
   openssl rand -base64 32
   ```

2. **Admin Password**: Set `ADMIN_PASSWORD` in `server/.env` (auto-hashed to argon2id on first run).
3. **CORS**: Set `CORS_ORIGINS` in server `.env` to your exact frontend domain (e.g., `https://tiak.yourdomain.com`).
4. **HTTPS**: Ensure TLS is terminated at Nginx.

---

## 📦 Deployment Steps

### 1. Build & Deploy Backend (Go)

```bash
cd server
go build -o tiak-server .
# Copy binary + .env + data/ to VPS
```

Create `/etc/systemd/system/tiak.service`:

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
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
```

Enable: `sudo systemctl enable --now tiak`

### 2. Reverse Proxy (Nginx)

Use `nginx.conf.example` as template. **Critical rules:**

```nginx
# For video streaming - prevents buffering
location /api/files/stream {
    proxy_buffering off;
    proxy_pass http://127.0.0.1:4697;
    proxy_http_version 1.1;
    proxy_set_header Range $http_range;
    proxy_set_header If-Range $http_if_range;
}

# For thumbnail images
location /api/files/thumbnail {
    proxy_pass http://127.0.0.1:4697;
    proxy_cache_valid 200 1d;
}

# API routes
location /api/ {
    proxy_pass http://127.0.0.1:4697;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

### 3. Frontend (Vercel)

```bash
cd web
# Vercel auto-detects Next.js
# Set in Vercel Dashboard:
# NEXT_PUBLIC_API_BASE = https://your-domain.com
```

### 4. MongoDB Atlas

- Create cluster, get connection string
- Add VPS IP to Network Access
- Set `MONGODB_URI` in both root `.env` and `server/.env`

---

## 🧹 Maintenance

### Cleanup Workers (automatic)

- **Guest files**: Deleted 5 min after completion (60s interval)
- **Thumbnails**: Regenerated on-demand, cached in `data/.thumbnails/`
- **Database records**: Marked "missing" (not deleted) to preserve history

### Database Backup

```bash
# Atlas: Use built-in snapshots
# Local: mongodump --uri="$MONGODB_URI" --out=/backup/$(date +%F)
```

### Logs

```bash
journalctl -u tiak -f          # Real-time
journalctl -u tiak --since "1 hour ago"
```

---

## 📊 Monitoring

| Endpoint | Auth | Description |
| ---------- | ------ | ------------- |
| `GET /health` | ❌ | Basic health check |
| `GET /ready` | ❌ | Readiness (DB connected) |
| `GET /metrics` | ❌ | Prometheus-style metrics |
| `GET /api/admin/stats` | ✅ Admin | Queue stats, storage, users |

---

## 🔧 Production Tuning

### Nginx

- `proxy_buffering off;` for `/api/files/stream`
- `client_max_body_size 2G;` for large uploads
- Enable gzip/brotli for static assets

### Go Server

- Binary is 16MB static (no runtime deps)
- Set `GOMAXPROCS` if needed (defaults to CPU count)
- File descriptors: `LimitNOFILE=65535` in systemd

### MongoDB

- Indexes created automatically on startup
- TTL index on `jobs.expiresAt` for guest cleanup

---

## ✅ Pre-Launch Checklist

- [ ] `MONGODB_URI` set in both `.env` files
- [ ] `JWT_SECRET` is 32+ chars random
- [ ] `ADMIN_PASSWORD` set in `server/.env`
- [ ] `NEXT_PUBLIC_API_BASE` points to production domain
- [ ] Nginx `proxy_buffering off` for stream endpoint
- [ ] SSL cert configured (Let's Encrypt / certbot)
- [ ] Systemd service enabled and running
- [ ] MongoDB Atlas IP whitelist includes VPS
- [ ] Health check returns `OK` at `https://domain/health`
- [ ] Frontend loads at `https://domain`
- [ ] Can login as admin (initial password from `.env`)
