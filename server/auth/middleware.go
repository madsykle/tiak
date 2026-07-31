package auth

import (
	"context"
	"net/http"
	"strings"
	"tiak-server/config"
)

type contextKey struct{}

type AuthenticatedUser struct {
	Username string
	Role     string
}

func AuthMiddleware(authState *AuthState, cfg *config.ServerConfig) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			user := extractUser(r, authState, cfg)
			ctx := context.WithValue(r.Context(), contextKey{}, user)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func RequireAdmin(next http.Handler) http.Handler {
	return requireRole(func(user *AuthenticatedUser) bool {
		return user.Role == "admin"
	})(next)
}

func RequirePremiumMemberOrAdmin(next http.Handler) http.Handler {
	return requireRole(func(user *AuthenticatedUser) bool {
		return user.Role == "admin" || user.Role == "premium_member"
	})(next)
}

func requireRole(allowed func(*AuthenticatedUser) bool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			user := GetUser(r)
			if user == nil || !allowed(user) {
				http.Error(w, "Forbidden", http.StatusForbidden)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func GetUser(r *http.Request) *AuthenticatedUser {
	u, _ := r.Context().Value(contextKey{}).(*AuthenticatedUser)
	return u
}

func extractUser(r *http.Request, authState *AuthState, cfg *config.ServerConfig) *AuthenticatedUser {
	// Try Authorization header
	if authHeader := r.Header.Get("Authorization"); authHeader != "" {
		if strings.HasPrefix(authHeader, "Bearer ") {
			token := authHeader[7:]
			if claims, err := authState.VerifyToken(token); err == nil {
				return &AuthenticatedUser{Username: claims.Sub, Role: claims.Role}
			}
		}
	}
	// Try Cookie
	if cookie, err := r.Cookie("token"); err == nil {
		if claims, err := authState.VerifyToken(cookie.Value); err == nil {
			return &AuthenticatedUser{Username: claims.Sub, Role: claims.Role}
		}
	}
	// Auth disabled: bypass
	if !cfg.EnableAuth {
		return &AuthenticatedUser{Username: "admin_bypass", Role: "admin"}
	}
	return &AuthenticatedUser{Username: "guest", Role: "guest"}
}

func CORSMiddleware(origins []string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")
			allowed := false
			for _, o := range origins {
				if o == "*" || o == origin {
					allowed = true
					break
				}
			}
			if allowed || len(origins) == 0 {
				w.Header().Set("Access-Control-Allow-Origin", origin)
			}
			w.Header().Set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS,PATCH")
			w.Header().Set("Access-Control-Allow-Headers", "Authorization,Content-Type,Accept,X-Guest-ID,Ngrok-Skip-Browser-Warning")
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			if r.Method == "OPTIONS" {
				w.WriteHeader(http.StatusOK)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
