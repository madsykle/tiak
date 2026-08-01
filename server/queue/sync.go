package queue

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"regexp"
	"strings"
	"sync"
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

var ansiSequence = regexp.MustCompile(`\x1b\[[0-?]*[ -/]*[@-~]`)

const maxSyncLogs = 200

func (dq *DownloadQueue) GetSyncState(fi *storage.FileIndex) SyncState {
	dq.mu.RLock()
	status := "idle"
	if dq.syncRunning {
		status = "running"
	} else if dq.syncError != "" {
		status = "error"
	}
	state := SyncState{
		Status:        status,
		Logs:          append([]string(nil), dq.syncLogs...),
		UnsyncedCount: 0,
	}
	if dq.syncError != "" {
		errorMessage := dq.syncError
		state.Error = &errorMessage
	}
	dq.mu.RUnlock()

	lastSync := storage.DataRoot + "/.last_sync"
	if info, err := os.Stat(lastSync); err == nil {
		t := info.ModTime()
		state.LastRun = &t
	}
	_ = fi
	return state
}

// RunSync starts rclone in the background so the API can respond immediately.
// Its output is read while it runs so the status endpoint exposes live activity.
func (dq *DownloadQueue) RunSync() (string, error) {
	dq.mu.Lock()
	if dq.syncRunning {
		dq.mu.Unlock()
		return "", fmt.Errorf("sync already running")
	}
	dest := dq.SyncDestination
	mode := dq.SyncMode
	if dest == "" {
		dq.mu.Unlock()
		return "", fmt.Errorf("no sync destination configured")
	}
	dq.syncRunning = true
	dq.syncError = ""
	dq.syncLogs = append(dq.syncLogs, fmt.Sprintf("Sync started (%s mode)", mode))
	if len(dq.syncLogs) > maxSyncLogs {
		dq.syncLogs = dq.syncLogs[len(dq.syncLogs)-maxSyncLogs:]
	}
	dq.mu.Unlock()

	go func() {
		command := "copy"
		if mode == "sync" {
			command = "sync"
		}
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
		defer cancel()

		cmd := exec.CommandContext(ctx, "rclone", command, storage.DataRoot, dest, "--progress")
		stdout, err := cmd.StdoutPipe()
		if err != nil {
			dq.finishSyncError(err, "")
			return
		}
		stderr, err := cmd.StderrPipe()
		if err != nil {
			_ = stdout.Close()
			dq.finishSyncError(err, "")
			return
		}

		if err := cmd.Start(); err != nil {
			_ = stdout.Close()
			_ = stderr.Close()
			dq.finishSyncError(err, "")
			return
		}

		var outputMu sync.Mutex
		var outputLines []string
		recordLine := func(line string) {
			line = cleanSyncLog(line)
			if line == "" {
				return
			}
			outputMu.Lock()
			outputLines = append(outputLines, line)
			if len(outputLines) > maxSyncLogs {
				outputLines = outputLines[len(outputLines)-maxSyncLogs:]
			}
			outputMu.Unlock()
			dq.appendSyncLog(line)
		}

		var readers sync.WaitGroup
		readers.Add(2)
		go func() {
			defer readers.Done()
			streamSyncOutput(stdout, recordLine)
		}()
		go func() {
			defer readers.Done()
			streamSyncOutput(stderr, recordLine)
		}()

		err = cmd.Wait()
		readers.Wait()
		_ = stdout.Close()
		_ = stderr.Close()

		outputMu.Lock()
		output := strings.Join(outputLines, "\n")
		outputMu.Unlock()
		if ctx.Err() != nil {
			err = ctx.Err()
		}
		if err != nil {
			dq.finishSyncError(err, output)
			return
		}

		_ = exec.Command("touch", storage.DataRoot+"/.last_sync").Run()
		dq.mu.Lock()
		dq.syncRunning = false
		dq.syncLogs = append(dq.syncLogs, "Sync completed")
		if len(dq.syncLogs) > maxSyncLogs {
			dq.syncLogs = dq.syncLogs[len(dq.syncLogs)-maxSyncLogs:]
		}
		dq.mu.Unlock()
	}()

	return "Sync started", nil
}

func (dq *DownloadQueue) appendSyncLog(line string) {
	dq.mu.Lock()
	defer dq.mu.Unlock()
	dq.syncLogs = append(dq.syncLogs, line)
	if len(dq.syncLogs) > maxSyncLogs {
		dq.syncLogs = dq.syncLogs[len(dq.syncLogs)-maxSyncLogs:]
	}
}

func (dq *DownloadQueue) finishSyncError(err error, output string) {
	message := fmt.Sprintf("sync failed: %v", err)
	if output = strings.TrimSpace(output); output != "" {
		const maxErrorLength = 12000
		if len([]rune(output)) > maxErrorLength {
			runes := []rune(output)
			output = "…" + string(runes[len(runes)-maxErrorLength+1:])
		}
		message += ": " + output
	}

	dq.mu.Lock()
	defer dq.mu.Unlock()
	dq.syncRunning = false
	dq.syncError = message
	dq.syncLogs = append(dq.syncLogs, message)
	if len(dq.syncLogs) > maxSyncLogs {
		dq.syncLogs = dq.syncLogs[len(dq.syncLogs)-maxSyncLogs:]
	}
}

func cleanSyncLog(line string) string {
	return strings.TrimSpace(ansiSequence.ReplaceAllString(line, ""))
}

// streamSyncOutput emits output on both newline and carriage-return delimiters.
// rclone uses carriage returns to redraw its --progress line in a terminal.
func streamSyncOutput(reader io.Reader, emit func(string)) {
	buffered := bufio.NewReader(reader)
	var line []byte
	for {
		character, err := buffered.ReadByte()
		if err != nil {
			if len(line) > 0 {
				emit(string(line))
			}
			return
		}
		if character == '\r' || character == '\n' {
			if len(line) > 0 {
				emit(string(line))
				line = line[:0]
			}
			continue
		}
		line = append(line, character)
	}
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
