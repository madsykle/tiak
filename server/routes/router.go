package routes

import (
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	chiMiddleware "github.com/go-chi/chi/v5/middleware"
	"tiak-server/auth"
	"tiak-server/config"
	"tiak-server/db"
	"tiak-server/queue"
	"tiak-server/storage"
)

type AppState struct {
	DB        *db.MongoDB
	Config    *config.AppConfig
	AuthState *auth.AuthState
	FileIndex *storage.FileIndex
	Queue     *queue.DownloadQueue
	URLCache  map[string]string // simple in-memory cache
}

var (
	reYT     = regexp.MustCompile(`(?:v=|shorts/|v/|embed/|live/|youtu\.be/)([a-zA-Z0-9_-]{11})`)
	reIG     = regexp.MustCompile(`instagram\.com/(?:reels|p|tv)/([a-zA-Z0-9_-]+)`)
	reTT     = regexp.MustCompile(`tiktok\.com/(@[^/]+/video/\d+)`)
	reTW     = regexp.MustCompile(`(?:x|twitter)\.com/([^/]+/status/\d+)`)
	reParams = regexp.MustCompile(`([?&])(?:feature|utm_[^=&]+|si|igsh|fbclid|gclid|ref|referrer)=[^&]*`)
)

func NormalizeURL(url string) string {
	s := strings.TrimSpace(url)
	s = reParams.ReplaceAllString(s, "")
	if strings.Contains(s, "&") && !strings.Contains(s, "?") {
		s = strings.Replace(s, "&", "?", 1)
	}
	for strings.HasSuffix(s, "?") || strings.HasSuffix(s, "&") || strings.HasSuffix(s, "/") {
		s = strings.TrimSuffix(s, "?")
		s = strings.TrimSuffix(s, "&")
		s = strings.TrimSuffix(s, "/")
	}
	if strings.Contains(s, "youtube.com") || strings.Contains(s, "youtu.be") {
		if c := reYT.FindStringSubmatch(s); len(c) > 1 {
			return fmt.Sprintf("https://www.youtube.com/watch?v=%s", c[1])
		}
	}
	if strings.Contains(s, "instagram.com") {
		if c := reIG.FindStringSubmatch(s); len(c) > 1 {
			return fmt.Sprintf("https://www.instagram.com/reels/%s/", c[1])
		}
	}
	if strings.Contains(s, "tiktok.com") && strings.Contains(s, "/video/") {
		if c := reTT.FindStringSubmatch(s); len(c) > 1 {
			return "https://www.tiktok.com/" + c[1]
		}
	}
	if strings.Contains(s, "x.com") || strings.Contains(s, "twitter.com") {
		if c := reTW.FindStringSubmatch(s); len(c) > 1 {
			return "https://twitter.com/" + c[1]
		}
	}
	return s
}

func DetectPlatform(url string) string {
	if strings.Contains(url, "tiktok.com") {
		return "tiktok"
	}
	if strings.Contains(url, "instagram.com") {
		return "instagram"
	}
	if strings.Contains(url, "youtube.com") || strings.Contains(url, "youtu.be") {
		return "youtube"
	}
	return "unknown"
}

func ResolveURL(rawURL string) (string, error) {
	client := &http.Client{
		Timeout: 10 * time.Second,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 10 {
				return fmt.Errorf("too many redirects")
			}
			return nil
		},
	}
	resp, err := client.Head(rawURL)
	if err != nil {
		return rawURL, nil
	}
	defer resp.Body.Close()
	resolved := resp.Request.URL.String()
	if resolved == "" {
		return rawURL, nil
	}
	return NormalizeURL(resolved), nil
}

// sanitizeURL validates and sanitizes a URL to prevent SSRF.
func sanitizeURL(rawURL string) (string, error) {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return "", fmt.Errorf("invalid URL: %w", err)
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return "", fmt.Errorf("only http/https schemes allowed")
	}
	if parsed.Host == "" {
		return "", fmt.Errorf("missing host")
	}
	return rawURL, nil
}

func DoneJobFileExists(jobFilename *string, completedAt, createdAt *int64, category string, fileIndex *storage.FileIndex) bool {
	if jobFilename == nil || *jobFilename == "" {
		return false
	}
	ts := createdAt
	if completedAt != nil {
		ts = completedAt
	}
	if ts == nil {
		now := time.Now().UnixMilli()
		ts = &now
	}
	dateStr := time.UnixMilli(*ts).UTC().Format("2006-01-02")
	path := fmt.Sprintf("%s/%s/%s/%s", storage.DataRoot, category, dateStr, *jobFilename)
	if _, err := os.Stat(path); err == nil {
		return true
	}
	if fileIndex.FindFileByName(*jobFilename) != nil {
		return true
	}
	return false
}

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("X-XSS-Protection", "1; mode=block")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		w.Header().Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
		next.ServeHTTP(w, r)
	})
}

func NewRouter(state *AppState) http.Handler {
	r := chi.NewRouter()
	r.Use(chiMiddleware.Logger)
	r.Use(chiMiddleware.Recoverer)
	r.Use(chiMiddleware.Compress(5))
	r.Use(securityHeaders)
	r.Use(auth.CORSMiddleware(state.Config.Server.CORSOrigins))
	r.Use(auth.AuthMiddleware(state.AuthState, &state.Config.Server))

	// Rate limiting on sensitive endpoints
	rl := auth.NewRateLimiter(
		state.Config.Security.RateLimitRequests,
		state.Config.Security.RateLimitWindowSeconds,
	)
	r.Use(auth.RateLimitMiddleware(rl))

	// Guest routes
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(200)
		io.WriteString(w, "OK")
	})
	r.Get("/ready", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(200)
		io.WriteString(w, "READY")
	})
	r.Get("/metrics", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain")
		io.WriteString(w, "# HELP tiak_server_up\n# TYPE tiak_server_up gauge\ntiak_server_up 1\n")
	})
	r.Get("/", func(w http.ResponseWriter, r *http.Request) {
		io.WriteString(w, "Tiak Server is running (Go)")
	})

	r.Post("/api/auth/login", loginHandler(state))
	r.Post("/api/auth/logout", func(w http.ResponseWriter, r *http.Request) {
		http.SetCookie(w, &http.Cookie{Name: "token", Value: "", Path: "/", MaxAge: 0})
		w.Header().Set("Content-Type", "application/json")
		io.WriteString(w, `{"success":true}`)
	})
	r.Post("/api/auth/signup", signupHandler(state))
	r.Get("/api/auth/me", meHandler(state))
	r.Post("/api/queue/add", addToQueue(state))
	r.Get("/api/queue/list", listQueue(state))
	r.Get("/api/files/download", downloadFile)
	r.Get("/api/files/stream", streamFile)
	r.Get("/api/files/thumbnail", getThumbnail(state))
	r.Get("/api/files/info", getFileInfo(state))
	r.Post("/api/files/resolve", resolveURLEndpoint(state))
	r.Get("/api/queue/history", queueHistory(state)) // Files share one mount point; apply role middleware per endpoint so Chi
	// does not attempt to mount /api/files more than once.
	r.Route("/api/files", func(r chi.Router) {
		r.With(auth.RequirePremiumMemberOrAdmin).Get("/", listFiles(state))
		r.With(auth.RequirePremiumMemberOrAdmin).Post("/zip", zipFiles)
		r.With(auth.RequireAdmin).Delete("/", deleteFiles(state))
		r.With(auth.RequireAdmin).Post("/move", moveFile(state))
	})

	// Admin routes
	r.Group(func(r chi.Router) {
		r.Use(auth.RequireAdmin)
		r.Route("/api/categories", func(r chi.Router) {
			r.Get("/", listCategories)
			r.Post("/", createCategory)
			r.Delete("/{name}", deleteCategory(state))
			r.Post("/rename", renameCategory(state))
		})
		r.Delete("/api/queue/{id}", deleteJob(state))
		r.Get("/api/system/usage", systemUsage)
		r.Route("/api/settings", func(r chi.Router) {
			r.Get("/", getSettings(state))
			r.Post("/", setSettings(state))
		})
		r.Get("/api/timeline", getTimeline(state))
		r.Post("/api/timeline/posted", markPosted)
		r.Get("/api/queue/export", exportQueue(state))
		r.Post("/api/queue/import", importQueue(state))
		r.Post("/api/queue/retry/{id}", retryJob(state))
		r.Post("/api/queue/redownload/{id}", redownloadJob(state))
		r.Post("/api/sync/run", syncRun(state))
		r.Get("/api/sync/status", syncStatus(state))
		r.Get("/api/admin/stats", getStatsEndpoint(state))
		r.Get("/api/rclone/ls", rcloneLs)
		r.Get("/api/admin/users", listUsersHandler(state))
		r.Post("/api/admin/users/create", createUserHandler(state))
		r.Post("/api/admin/users/{id}/role", updateRoleHandler(state))
		r.Post("/api/maintenance/fix-categories", fixCategoriesEndpoint(state))
		r.Post("/api/maintenance/backfill-metadata", backfillMetadataEndpoint(state))
		r.Post("/api/maintenance/backfill-thumbnails", backfillThumbnailsEndpoint(state))
		r.Get("/api/videos/search", searchVideos(state))
		r.Get("/api/videos/category/{name}", listByCategory(state))
		r.Get("/api/videos/creator/{name}", listByCreator(state))
	})

	return r
}
