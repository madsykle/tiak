package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"tiak-server/auth"
	"tiak-server/cleanup"
	"tiak-server/config"
	"tiak-server/db"
	"tiak-server/queue"
	"tiak-server/routes"
	"tiak-server/storage"

	"github.com/joho/godotenv"
)

func main() {
	// Load .env if present
	godotenv.Overload()

	cfg := config.LoadConfig()
	if err := cfg.Validate(); err != nil {
		log.Fatalf("Config errors: %v", err)
	}

	mongodb, err := db.New(cfg.Server.MongoDBURI)
	if err != nil {
		log.Fatalf("DB connection failed: %v", err)
	}
	log.Println("Database initialized")

	fileIndex := storage.NewFileIndex()
	if err := fileIndex.BuildIndex(); err != nil {
		log.Printf("Warning: File index build failed: %v", err)
	}
	log.Println("File index built")

	dq := queue.NewDownloadQueue(mongodb, fileIndex, cfg.Server.MaxRetryCount)
	authState := auth.NewAuthState(cfg.Server.JWTSecret, cfg.Server.JWTExpiryHours)

	state := &routes.AppState{
		DB:        mongodb,
		Config:    cfg,
		AuthState: authState,
		FileIndex: fileIndex,
		Queue:     dq,
		URLCache:  make(map[string]string),
	}

	router := routes.NewRouter(state)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	dq.Start(ctx)

	// Background cleanup worker
	go func() {
		ticker := time.NewTicker(60 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				cleanup.RunCleanup(ctx, mongodb)
			}
		}
	}()

	// Periodic file index rebuild
	go func() {
		time.Sleep(5 * time.Minute)
		ticker := time.NewTicker(30 * time.Minute)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				fileIndex.BuildIndex()
			}
		}
	}()

	addr := fmt.Sprintf("%s:%d", cfg.Server.Host, cfg.Server.Port)
	srv := &http.Server{
		Addr:         addr,
		Handler:      router,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 300 * time.Second,
	}

	go func() {
		log.Printf("Server listening on %s", addr)
		if err := srv.ListenAndServe(); err != http.ErrServerClosed {
			log.Fatalf("Server error: %v", err)
		}
	}()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	<-sigCh
	log.Println("Shutting down...")
	cancel()
	srv.Shutdown(context.Background())
	log.Println("Server stopped")
}
