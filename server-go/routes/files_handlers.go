package routes

import (
	"encoding/json"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"

	"github.com/go-chi/chi/v5"
	"tiak-server/auth"
	"tiak-server/storage"
)

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
	if user == nil || user.Role != "admin" {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	http.Error(w, "Zip not implemented yet", http.StatusNotImplemented)
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
