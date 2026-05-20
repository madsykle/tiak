# Tiak Web Frontend (v2.0)

A high-performance, responsive web dashboard for Tiak. Built with Next.js 14, TypeScript, and Tailwind CSS.

## ✨ Features

- **RBAC-Aware UI**: Dynamically adapts interface elements based on user role (Admin, Premium, Guest).
- **Guest Isolation**: Automatically tracks and isolates Guest queues using `localStorage` and custom headers.
- **Optimized Video Playback**: Integrated `Plyr` player with custom buffering and Nginx-optimized streaming.
- **Admin Command Center**: Global oversight of system metrics, storage usage, and user management.
- **PWA Ready**: Offline-first support and mobile-native experience (Installable on iOS/Android).
- **Lag-Free Rendering**: Component-level memoization for smooth library browsing with 1000+ files.

## 🚀 Getting Started

### Prerequisites
- **Node.js**: v18+ (v20 recommended)
- **npm**: Standard package manager used for this project

### Installation

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Environment Configuration**:
   The frontend uses the monorepo `.env` file via a symbolic link. Ensure `NEXT_PUBLIC_API_BASE` is set.
   ```bash
   # In the root .env
   NEXT_PUBLIC_API_BASE=https://your-api-domain.com/api
   ```

3. **Development**:
   ```bash
   npm run dev
   ```

4. **Production Build**:
   ```bash
   npm run build
   ```

## 🔒 Security
- **JWT Authentication**: Secure token handling with automatic 401 interception and logout.
- **Zero-Trust Headers**: Enforces `X-Guest-ID` for all non-authenticated sessions to prevent queue pollution.
- **Content Security**: Sanitized inputs and strictly controlled allowed origins.

## 📱 Deployment
Optimized for deployment on **Vercel**. Ensure that the backend's CORS settings include your Vercel production URL.
