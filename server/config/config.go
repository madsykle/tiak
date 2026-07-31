package config

import (
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

type ServerConfig struct {
	Port                   int
	Host                   string
	DataRoot               string
	MongoDBURI             string
	MaxConcurrentDownloads int
	MaxRetryCount          uint32
	CORSOrigins            []string
	JWTSecret              string
	JWTExpiryHours         int64
	EnableAuth             bool
	AdminPassword          string
	YtDlpPython            string
	YtDlpBinary            string
	InstagramProxy         string
}

type SecurityConfig struct {
	MaxUploadSize         int
	RateLimitRequests     uint32
	RateLimitWindowSeconds uint64
}

type AppConfig struct {
	Server   ServerConfig
	Security SecurityConfig
}

func LoadConfig() *AppConfig {
	cwd, _ := os.Getwd()

	return &AppConfig{
		Server: ServerConfig{
			Port:                   getEnvInt("PORT", 4697),
			Host:                   getEnvStr("HOST", "0.0.0.0"),
			DataRoot:               getEnvStr("DATA_ROOT", "data"),
			MongoDBURI:             getEnvStr("MONGODB_URI", "mongodb://localhost:27017/tiak"),
			MaxConcurrentDownloads: getEnvInt("MAX_CONCURRENT_DOWNLOADS", 4),
			MaxRetryCount:          uint32(getEnvInt("MAX_RETRY_COUNT", 5)),
			CORSOrigins:            strings.Split(getEnvStr("CORS_ORIGINS", ""), ","),
			JWTSecret:              getEnvStr("JWT_SECRET", "development-secret-key-change-in-production"),
			JWTExpiryHours:         getEnvInt64("JWT_EXPIRY_HOURS", 24),
			EnableAuth:             getEnvBool("ENABLE_AUTH", false),
			AdminPassword:          getEnvStr("ADMIN_PASSWORD", "admin"),
			YtDlpPython:            getEnvStr("YT_DLP_PYTHON", filepath.Join(cwd, "venv_python", "bin", "python")),
			YtDlpBinary:            getEnvStr("YT_DLP_BINARY", filepath.Join(cwd, "bin", "yt-dlp")),
			InstagramProxy:         getEnvStr("INSTAGRAM_PROXY", ""),
		},
		Security: SecurityConfig{
			MaxUploadSize:          getEnvInt("MAX_UPLOAD_SIZE", 10*1024*1024),
			RateLimitRequests:      uint32(getEnvInt("RATE_LIMIT_REQUESTS", 100)),
			RateLimitWindowSeconds: uint64(getEnvInt("RATE_LIMIT_WINDOW_SECONDS", 60)),
		},
	}
}

func (c *AppConfig) Validate() error {
	if c.Server.Port < 1 || c.Server.Port > 65535 {
		return ErrInvalidPort
	}
	if c.Server.MongoDBURI == "" {
		return ErrMissingMongoURI
	}
	if c.Server.JWTSecret == "" {
		return ErrMissingJWTSecret
	}
	return nil
}

func getEnvStr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if i, err := strconv.Atoi(v); err == nil {
			return i
		}
	}
	return fallback
}

func getEnvInt64(key string, fallback int64) int64 {
	if v := os.Getenv(key); v != "" {
		if i, err := strconv.ParseInt(v, 10, 64); err == nil {
			return i
		}
	}
	return fallback
}

func getEnvBool(key string, fallback bool) bool {
	if v := os.Getenv(key); v != "" {
		if b, err := strconv.ParseBool(v); err == nil {
			return b
		}
	}
	return fallback
}

var (
	ErrInvalidPort     = &ConfigError{"invalid port number"}
	ErrMissingMongoURI = &ConfigError{"MONGODB_URI is required"}
	ErrMissingJWTSecret = &ConfigError{"JWT_SECRET is required"}
)

type ConfigError struct {
	Message string
}

func (e *ConfigError) Error() string {
	return e.Message
}
