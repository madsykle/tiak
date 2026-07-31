package queue

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"time"

	"tiak-server/storage"
)

type SyncState struct {
	Status        string     `json:"status"`
	LastRun       *time.Time `json:"lastRun"`
	Logs          []string   `json:"logs"`
	Error         *string    `json:"error"`
	UnsyncedCount int        `json:"unsyncedCount"`
}

func (dq *DownloadQueue) GetSyncState(fi *storage.FileIndex) SyncState {
	state := SyncState{Status: "idle", Logs: []string{}, UnsyncedCount: 0}
	lastSync := storage.DataRoot + "/.last_sync"
	if info, err := os.Stat(lastSync); err == nil {
		t := info.ModTime()
		state.LastRun = &t
	}
	_ = fi
	return state
}

func (dq *DownloadQueue) RunSync() (string, error) {
	dq.mu.Lock()
	dest := dq.SyncDestination
	mode := dq.SyncMode
	dq.mu.Unlock()

	if dest == "" {
		return "", fmt.Errorf("no sync destination configured")
	}

	cmd := exec.Command("rclone", "copy", storage.DataRoot, dest, "--progress")
	if mode == "sync" {
		cmd = exec.Command("rclone", "sync", storage.DataRoot, dest, "--progress")
	}

	out, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("sync failed: %v: %s", err, string(out))
	}

	// Touch marker file
	t := time.Now().Format(time.RFC3339)
	_ = exec.Command("touch", storage.DataRoot+"/.last_sync").Run()
	_ = t

	return "Sync completed", nil
}

func (dq *DownloadQueue) SetMaxConcurrent(limit int) {
	dq.mu.Lock()
	dq.maxConcurrent = limit
	dq.mu.Unlock()
}

func (dq *DownloadQueue) GetMaxConcurrent() int {
	dq.mu.RLock()
	defer dq.mu.RUnlock()
	return dq.maxConcurrent
}

func (dq *DownloadQueue) SetSyncDestination(dest string) {
	dq.mu.Lock()
	dq.SyncDestination = dest
	dq.mu.Unlock()
}

func (dq *DownloadQueue) GetSyncDestination() string {
	dq.mu.RLock()
	defer dq.mu.RUnlock()
	return dq.SyncDestination
}

func (dq *DownloadQueue) SetSyncMode(mode string) {
	dq.mu.Lock()
	dq.SyncMode = mode
	dq.mu.Unlock()
}

func (dq *DownloadQueue) GetSyncMode() string {
	dq.mu.RLock()
	defer dq.mu.RUnlock()
	return dq.SyncMode
}

func (dq *DownloadQueue) HasJob(ctx context.Context, url string) bool {
	exists, _ := dq.db.UrlInQueue(ctx, url)
	return exists
}
