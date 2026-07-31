package routes

import (
	"archive/zip"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"tiak-server/auth"
	"tiak-server/storage"
)

const maxArchiveSize int64 = 5 << 30

func listFiles(state *AppState) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := auth.GetUser(r)
		if user == nil {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		idx := state.FileIndex.GetIndex()
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"byDate":     idx.ByDate,
			"byCategory": idx.ByCategory,
			"lastScan":   idx.LastScan,
		})
	}
}

func deleteFiles(state *AppState) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := auth.GetUser(r)
		if user == nil || user.Role != "admin" {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}
		var req struct {
			Paths []string `json:"paths"`
		}
		json.NewDecoder(r.Body).Decode(&req)
		deleted := []string{}
		errs := []map[string]string{}
		for _, p := range req.Paths {
			abs, err := storage.ValidateDataPath(p)
			if err != nil {
				errs = append(errs, map[string]string{"path": p, "error": err.Error()})
				continue
			}
			if err := os.Remove(abs); err != nil {
				errs = append(errs, map[string]string{"path": p, "error": err.Error()})
			} else {
				state.FileIndex.RemoveFile(abs)
				deleted = append(deleted, p)
			}
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{"deleted": deleted, "errors": errs})
	}
}

func zipFiles(w http.ResponseWriter, r *http.Request) {
	user := auth.GetUser(r)
	if user == nil || (user.Role != "admin" && user.Role != "premium_member") {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	// Keep malformed or unexpectedly large path lists from consuming the server.
	r.Body = http.MaxBytesReader(w, r.Body, 2<<20)
	var req struct {
		Paths []string `json:"paths"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid archive request", http.StatusBadRequest)
		return
	}
	if len(req.Paths) == 0 {
		http.Error(w, "At least one file is required", http.StatusBadRequest)
		return
	}
	if len(req.Paths) > 500 {
		http.Error(w, "Too many files selected", http.StatusBadRequest)
		return
	}

	type archiveEntry struct {
		file *os.File
		name string
		info os.FileInfo
	}
	entries := make([]archiveEntry, 0, len(req.Paths))
	seen := make(map[string]struct{}, len(req.Paths))
	var totalSize int64
	closeEntries := func() {
		for _, entry := range entries {
			_ = entry.file.Close()
		}
	}
	defer closeEntries()
	for _, requestedPath := range req.Paths {
		absPath, archiveName, err := validateArchivePath(requestedPath)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if _, exists := seen[absPath]; exists {
			continue
		}
		file, err := os.Open(absPath)
		if err != nil {
			closeEntries()
			http.Error(w, "Unable to open selected file", http.StatusInternalServerError)
			return
		}
		info, err := file.Stat()
		if err != nil || !info.Mode().IsRegular() {
			_ = file.Close()
			closeEntries()
			http.Error(w, "Only regular files can be archived", http.StatusBadRequest)
			return
		}
		if info.Size() > maxArchiveSize-totalSize {
			_ = file.Close()
			closeEntries()
			http.Error(w, "Selected files exceed the archive size limit", http.StatusRequestEntityTooLarge)
			return
		}
		totalSize += info.Size()
		seen[absPath] = struct{}{}
		entries = append(entries, archiveEntry{file: file, name: archiveName, info: info})
	}
	if len(entries) == 0 {
		http.Error(w, "No unique files selected", http.StatusBadRequest)
		return
	}

	// Videos and image/audio assets are already compressed. Streaming them with
	// ZIP deflate wastes CPU and also requires a temporary archive on disk.
	// Validate and open every file before writing headers so validation errors
	// remain normal HTTP responses instead of corrupting a partially-started archive.
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"tiak-archive-%s.zip\"", time.Now().Format("20060102-150405")))
	w.Header().Set("X-Content-Type-Options", "nosniff")

	archive := zip.NewWriter(w)
	for _, entry := range entries {
		if err := r.Context().Err(); err != nil {
			log.Printf("bulk ZIP cancelled: %v", err)
			return
		}

		header, err := zip.FileInfoHeader(entry.info)
		if err != nil {
			log.Printf("bulk ZIP header failed for %s: %v", entry.name, err)
			return
		}
		header.Name = entry.name
		header.Method = archiveMethod(entry.name)
		writer, err := archive.CreateHeader(header)
		if err != nil {
			log.Printf("bulk ZIP entry setup failed for %s: %v", entry.name, err)
			return
		}
		if _, err := io.Copy(writer, entry.file); err != nil {
			log.Printf("bulk ZIP copy failed for %s: %v", entry.name, err)
			return
		}
	}
	if err := archive.Close(); err != nil {
		log.Printf("bulk ZIP finalization failed: %v", err)
	}
}

func archiveMethod(name string) uint16 {
	switch strings.ToLower(filepath.Ext(name)) {
	case ".aac", ".avi", ".flac", ".gif", ".jpeg", ".jpg", ".m4a", ".m4v", ".mkv", ".mov", ".mp3", ".mp4", ".png", ".webm", ".webp", ".zip":
		return zip.Store
	default:
		return zip.Deflate
	}
}

func validateArchivePath(requestedPath string) (string, string, error) {
	absPath, err := storage.ValidateDataPath(requestedPath)
	if err != nil {
		return "", "", err
	}
	info, err := os.Stat(absPath)
	if err != nil {
		return "", "", fmt.Errorf("file not found")
	}
	if !info.Mode().IsRegular() {
		return "", "", fmt.Errorf("only regular files can be archived")
	}

	root, err := filepath.Abs(storage.DataRoot)
	if err != nil {
		return "", "", fmt.Errorf("invalid data root")
	}
	resolvedRoot, err := filepath.EvalSymlinks(root)
	if err != nil {
		return "", "", fmt.Errorf("invalid data root")
	}
	resolvedPath, err := filepath.EvalSymlinks(absPath)
	if err != nil {
		return "", "", fmt.Errorf("file not found")
	}
	relativeResolved, err := filepath.Rel(resolvedRoot, resolvedPath)
	if err != nil || relativeResolved == "." || relativeResolved == ".." || strings.HasPrefix(relativeResolved, ".."+string(os.PathSeparator)) {
		return "", "", fmt.Errorf("access denied: file outside data root")
	}
	relativeName, err := filepath.Rel(root, absPath)
	if err != nil || relativeName == "." || relativeName == ".." || strings.HasPrefix(relativeName, ".."+string(os.PathSeparator)) {
		return "", "", fmt.Errorf("access denied: invalid archive path")
	}
	return absPath, filepath.ToSlash(relativeName), nil
}

func moveFile(state *AppState) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := auth.GetUser(r)
		if user == nil || user.Role != "admin" {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}
		var req struct {
			Path        string `json:"path"`
			JobID       string `json:"jobId"`
			NewCategory string `json:"newCategory"`
		}
		json.NewDecoder(r.Body).Decode(&req)
		p := req.Path
		if p == "" {
			http.Error(w, `{"error":"path required"}`, http.StatusBadRequest)
			return
		}
		abs, err := storage.ValidateDataPath(p)
		if err != nil {
			http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusForbidden)
			return
		}
		newPath, err := storage.MoveFileOnDisk(abs, req.NewCategory)
		if err != nil {
			http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusInternalServerError)
			return
		}
		state.FileIndex.RemoveFile(abs)
		state.FileIndex.AddFile(newPath)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{"success": true, "newPath": newPath})
	}
}

func listCategories(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(storage.ListCategories())
}

func createCategory(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name string `json:"name"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	if err := storage.CreateCategory(req.Name); err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusBadRequest)
		return
	}
	w.WriteHeader(http.StatusCreated)
}

func deleteCategory(state *AppState) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		name := chi.URLParam(r, "name")
		if err := storage.DeleteCategory(name); err != nil {
			http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusBadRequest)
			return
		}
		state.FileIndex.RemoveCategory(name)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]bool{"success": true})
	}
}

func renameCategory(state *AppState) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Old string `json:"old"`
			New string `json:"new"`
		}
		json.NewDecoder(r.Body).Decode(&req)
		if err := storage.RenameCategory(req.Old, req.New); err != nil {
			http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusBadRequest)
			return
		}
		state.FileIndex.RenameCategory(req.Old, storage.SanitizeCategoryName(req.New))
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]bool{"success": true})
	}
}

func systemUsage(w http.ResponseWriter, r *http.Request) {
	size, count, _ := storage.GetDiskUsage()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"totalSize": size, "fileCount": count})
}

func downloadFile(w http.ResponseWriter, r *http.Request) {
	p := r.URL.Query().Get("path")
	abs, err := storage.ValidateDataPath(p)
	if err != nil {
		http.Error(w, err.Error(), http.StatusForbidden)
		return
	}
	http.ServeFile(w, r, abs)
}

func streamFile(w http.ResponseWriter, r *http.Request) {
	p := r.URL.Query().Get("path")
	abs, err := storage.ValidateDataPath(p)
	if err != nil {
		http.Error(w, err.Error(), http.StatusForbidden)
		return
	}
	http.ServeFile(w, r, abs)
}

func getThumbnail(state *AppState) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		p := r.URL.Query().Get("path")
		abs, err := storage.ValidateDataPath(p)
		if err != nil {
			http.Error(w, err.Error(), http.StatusForbidden)
			return
		}
		name := filepath.Base(abs)
		thumbPath := filepath.Join(storage.ThumbnailsRoot, name+".jpg")
		if _, statErr := os.Stat(thumbPath); statErr != nil {
			os.MkdirAll(storage.ThumbnailsRoot, 0755)
			cmd := exec.Command("ffmpeg", "-i", abs, "-ss", "00:00:01", "-vframes", "1", "-q:v", "4", thumbPath)
			cmd.Run()
			if _, statErr2 := os.Stat(thumbPath); statErr2 != nil {
				http.Error(w, "Thumbnail generation failed", http.StatusNotFound)
				return
			}
		}
		http.ServeFile(w, r, thumbPath)
	}
}

func getFileInfo(state *AppState) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		p := r.URL.Query().Get("path")
		name := filepath.Base(p)
		job, err := state.DB.FindJobByFilename(r.Context(), name)
		if err == nil && job != nil {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]interface{}{
				"jobId":      job.ID,
				"url":        job.URL,
				"status":     job.Status,
				"progress":   job.Progress,
				"category":   job.Category,
				"platform":   job.Platform,
				"creator":    job.CreatorName,
				"caption":    job.Caption,
				"transcript": job.Transcript,
				"hashtags":   job.Hashtags,
			})
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{"jobId": "synthesized", "status": "done", "progress": 100})
	}
}
