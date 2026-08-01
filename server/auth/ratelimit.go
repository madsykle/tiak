package auth

import (
	"net/http"
	"strings"
	"sync"
	"time"
)

// Simple in-memory sliding window rate limiter per IP.
type RateLimiter struct {
	mu       sync.Mutex
	visitors map[string]*visitor
	limit    uint32
	window   time.Duration
}

type visitor struct {
	count       uint32
	windowStart time.Time
}

func NewRateLimiter(limit uint32, windowSec uint64) *RateLimiter {
	return &RateLimiter{
		visitors: make(map[string]*visitor),
		limit:    limit,
		window:   time.Duration(windowSec) * time.Second,
	}
}

func (rl *RateLimiter) Allow(key string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	v, exists := rl.visitors[key]
	if !exists || now.Sub(v.windowStart) > rl.window {
		rl.visitors[key] = &visitor{count: 1, windowStart: now}
		return true
	}
	if v.count >= rl.limit {
		return false
	}
	v.count++
	return true
}

// RateLimitMiddleware returns 429 when the client exceeds the limit.
func RateLimitMiddleware(rl *RateLimiter) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ip := r.RemoteAddr
			if fwd := r.Header.Get("X-Forwarded-For"); fwd != "" {
				ip = fwd
			}
			// Strip port for consistent keying
			if idx := strings.LastIndex(ip, ":"); idx != -1 {
				ip = ip[:idx]
			}
			if !rl.Allow(ip) {
				w.Header().Set("Retry-After", "60")
				http.Error(w, `{"error":"rate limit exceeded"}`, http.StatusTooManyRequests)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
