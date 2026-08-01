package queue

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"tiak-server/db"
	"tiak-server/models"
	"tiak-server/storage"
)

type DownloadQueue struct {
	db              *db.MongoDB
	fileIndex       *storage.FileIndex
	queue           chan string
	activeJobs      sync.Map
	maxConcurrent   int
	MaxRetryCount   uint32
	SyncDestination string
	SyncMode        string
	syncRunning     bool
	syncError       string
	syncLogs        []string
	mu              sync.RWMutex
}

func NewDownloadQueue(d *db.MongoDB, fi *storage.FileIndex, maxRetry uint32) *DownloadQueue {
	return &DownloadQueue{
		db:              d,
		fileIndex:       fi,
		queue:           make(chan string, 1000),
		maxConcurrent:   2,
		MaxRetryCount:   maxRetry,
		SyncDestination: "onedrive:EDITS",
		SyncMode:        "copy",
		syncLogs:        []string{},
	}
}

func (dq *DownloadQueue) Start(ctx context.Context) {
	go func() {
		for {
			select {
			case <-ctx.Done():
				return
			case id := <-dq.queue:
				dq.processJob(ctx, id)
			}
		}
	}()
}

func (dq *DownloadQueue) AddJob(id string) {
	select {
	case dq.queue <- id:
	default:
	}
}

func (dq *DownloadQueue) CancelJob(id string) {
	if cancel, ok := dq.activeJobs.LoadAndDelete(id); ok {
		cancel.(context.CancelFunc)()
	}
}

func (dq *DownloadQueue) processJob(ctx context.Context, id string) {
	job, err := dq.db.GetJob(ctx, id)
	if err != nil || job.Status != "queued" {
		return
	}
	dq.db.MarkDownloading(ctx, id)

	jCtx, cancel := context.WithCancel(ctx)
	dq.activeJobs.Store(id, cancel)
	defer func() {
		dq.activeJobs.Delete(id)
		cancel()
	}()

	result, err := dq.runYtDlp(jCtx, job)
	if err != nil {
		if jCtx.Err() != nil {
			dq.db.MarkFailed(ctx, id, "Cancelled")
		} else {
			dq.db.MarkFailed(ctx, id, err.Error())
		}
		return
	}

	// Generate thumbnail
	videoPath := filepath.Join(storage.GetTodayFolder(job.Category), result.filename)
	thumbPath := filepath.Join(storage.ThumbnailsRoot, result.filename+".jpg")
	generateThumbnail(thumbPath, videoPath)

	dq.db.MarkDone(ctx, id, result.filename, result.creator, result.avatar, result.caption)
	dq.fileIndex.AddFile(videoPath)
}

type downloadResult struct {
	filename string
	creator  *string
	avatar   *string
	caption  *string
}

func (dq *DownloadQueue) runYtDlp(ctx context.Context, job *models.Job) (*downloadResult, error) {
	downloader, downloaderArgs, err := resolveYtDlpCommand()
	if err != nil {
		return nil, err
	}

	outputFolder := storage.GetTodayFolder(job.Category)
	isTikTok := strings.Contains(job.URL, "tiktok.com")
	isInstagram := strings.Contains(job.URL, "instagram.com")

	template := filepath.Join(outputFolder, "%(id)s.%(ext)s")
	if !isTikTok && !isInstagram {
		template = filepath.Join(outputFolder, "%(title)s.%(ext)s")
	}

	commandArgs := append([]string{"-n", "10", downloader}, downloaderArgs...)
	commandArgs = append(commandArgs,
		"--newline", "--no-mtime", "--no-update",
		"--merge-output-format", "mp4", "--remux-video", "mp4",
		"--postprocessor-args", "ffmpeg:-movflags +faststart", "--write-info-json",
		"-f", "bv*[height<=1080]+ba/b[height<=1080]/bestvideo+bestaudio/best")
	cmd := exec.CommandContext(ctx, "nice", commandArgs...)

	if isTikTok {
		cmd.Args = append(cmd.Args, "--add-header", "Referer:https://www.tiktok.com/")
	} else if isInstagram {
		cmd.Args = append(cmd.Args, "--add-header", "Referer:https://www.instagram.com/")
		if proxy := os.Getenv("INSTAGRAM_PROXY"); proxy != "" {
			cmd.Args = append(cmd.Args, "--proxy", proxy)
		}
	}

	cwd, _ := os.Getwd()
	for _, cf := range []string{"cookies_instagram.txt", "cookies_youtube.txt", "cookies.txt"} {
		if _, stat := os.Stat(filepath.Join(cwd, cf)); stat == nil {
			cmd.Args = append(cmd.Args, "--cookies", filepath.Join(cwd, cf))
			break
		}
	}

	actualURL := job.URL
	if isTikTok && strings.Contains(actualURL, "/photo/") {
		actualURL = strings.Replace(actualURL, "/photo/", "/video/", 1)
	}
	cmd.Args = append(cmd.Args, "-o", template, "--", actualURL)

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("could not capture yt-dlp output: %w", err)
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return nil, fmt.Errorf("could not capture yt-dlp errors: %w", err)
	}
	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("could not start yt-dlp: %w", err)
	}

	foundFilename := ""
	reProgress := regexp.MustCompile(`\[download\]\s+(\d+\.?\d*?)%`)
	reDest := regexp.MustCompile(`[dD]estination:\s+(.*)`)
	reMerge := regexp.MustCompile(`[mM]erger.*into\s+"?([^"]*)"?`)
	reAlready := regexp.MustCompile(`[dD]ownloaded\s+(.*)\s+has already been downloaded`)

	var outputWg sync.WaitGroup
	outputWg.Add(2)
	go func() {
		defer outputWg.Done()
		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			line := scanner.Text()
			if m := reProgress.FindStringSubmatch(line); len(m) > 1 {
				if p, e := strconv.ParseFloat(m[1], 64); e == nil {
					dq.db.UpdateJobProgress(ctx, job.ID, int64(p), nil)
				}
			}
			if m := reDest.FindStringSubmatch(line); len(m) > 1 {
				foundFilename = filepath.Base(strings.TrimSpace(m[1]))
			}
			if m := reMerge.FindStringSubmatch(line); len(m) > 1 {
				foundFilename = filepath.Base(strings.Trim(strings.TrimSpace(m[1]), "\""))
			}
			if m := reAlready.FindStringSubmatch(line); len(m) > 1 {
				foundFilename = filepath.Base(strings.TrimSpace(m[1]))
				dq.db.UpdateJobProgress(ctx, job.ID, 100, int64Ptr(0))
			}
		}
	}()

	stderrOutput := ""
	go func() {
		defer outputWg.Done()
		var lines []string
		scanner := bufio.NewScanner(stderr)
		for scanner.Scan() {
			lines = append(lines, strings.TrimSpace(scanner.Text()))
		}
		stderrOutput = strings.TrimSpace(strings.Join(lines, "\n"))
		const maxErrorLength = 12000
		if len([]rune(stderrOutput)) > maxErrorLength {
			runes := []rune(stderrOutput)
			stderrOutput = "…" + string(runes[len(runes)-maxErrorLength+1:])
		}
	}()

	err = cmd.Wait()
	outputWg.Wait()
	if err != nil {
		if stderrOutput != "" {
			return nil, fmt.Errorf("%s", stderrOutput)
		}
		return nil, fmt.Errorf("yt-dlp failed: %v", err)
	}

	if foundFilename == "" {
		entries, _ := os.ReadDir(outputFolder)
		newest := ""
		newestTime := time.Time{}
		for _, e := range entries {
			ext := filepath.Ext(e.Name())
			if ext == ".mp4" || ext == ".mkv" || ext == ".webm" {
				if info, eErr := e.Info(); eErr == nil && info.ModTime().After(newestTime) {
					newestTime = info.ModTime()
					newest = e.Name()
				}
			}
		}
		if newest != "" {
			foundFilename = newest
		}
	}

	if foundFilename == "" {
		foundFilename = "unknown.mp4"
	}

	// Parse info.json
	var creator, caption *string
	fullPath := filepath.Join(outputFolder, foundFilename)
	jsonPath := strings.TrimSuffix(fullPath, filepath.Ext(fullPath)) + ".info.json"
	if data, readErr := os.ReadFile(jsonPath); readErr == nil {
		content := string(data)
		if idx := strings.Index(content, `"uploader"`); idx > -1 {
			after := content[idx:]
			if colonIdx := strings.Index(after, ":"); colonIdx > -1 {
				val := strings.Trim(after[colonIdx+1:], " \"\n,")
				if endIdx := strings.IndexAny(val, "\",\n"); endIdx > -1 {
					c := val[:endIdx]
					creator = &c
				}
			}
		}
		if idx := strings.Index(content, `"description"`); idx > -1 {
			after := content[idx:]
			if colonIdx := strings.Index(after, ":"); colonIdx > -1 {
				val := strings.Trim(after[colonIdx+1:], " \"\n,")
				if endIdx := strings.IndexAny(val, "\",\n"); endIdx > -1 {
					c := val[:endIdx]
					caption = &c
				}
			}
		}
		os.Remove(jsonPath)
	}

	return &downloadResult{filename: foundFilename, creator: creator, avatar: nil, caption: caption}, nil
}

func resolveYtDlpCommand() (string, []string, error) {
	cwd, _ := os.Getwd()
	pythonPath := resolveConfiguredPath(os.Getenv("YT_DLP_PYTHON"), filepath.Join(cwd, "venv_python", "bin", "python"))
	ytDlpPath := resolveConfiguredPath(os.Getenv("YT_DLP_BINARY"), filepath.Join(cwd, "bin", "yt-dlp"))

	if isExecutable(ytDlpPath) {
		return ytDlpPath, nil, nil
	}
	if isRegularFile(ytDlpPath) && isExecutable(pythonPath) {
		return pythonPath, []string{ytDlpPath}, nil
	}
	if path, err := exec.LookPath("yt-dlp"); err == nil {
		return path, nil, nil
	}
	if isExecutable(pythonPath) {
		return pythonPath, []string{"-m", "yt_dlp"}, nil
	}

	return "", nil, fmt.Errorf("yt-dlp is not installed or configured (checked %s and %s)", pythonPath, ytDlpPath)
}

func resolveConfiguredPath(value, fallback string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		value = fallback
	}
	if filepath.IsAbs(value) {
		return value
	}
	candidates := []string{filepath.Join(mustGetwd(), value)}
	if executable, err := os.Executable(); err == nil {
		candidates = append(candidates, filepath.Join(filepath.Dir(executable), value))
	}
	for _, candidate := range candidates {
		if _, err := os.Stat(candidate); err == nil {
			return candidate
		}
	}
	return candidates[0]
}

func mustGetwd() string {
	cwd, err := os.Getwd()
	if err != nil {
		return "."
	}
	return cwd
}

func isRegularFile(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.Mode().IsRegular()
}

func isExecutable(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.Mode().IsRegular() && info.Mode().Perm()&0111 != 0
}

func generateThumbnail(thumbPath, videoPath string) {
	if _, err := os.Stat(thumbPath); err == nil {
		return
	}
	os.MkdirAll(storage.ThumbnailsRoot, 0755)
	cmd := exec.Command("ffmpeg", "-i", videoPath, "-ss", "00:00:01", "-vframes", "1", "-q:v", "4", thumbPath)
	cmd.Run()
}

func int64Ptr(v int64) *int64 { return &v }
