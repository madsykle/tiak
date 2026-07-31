package routes

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"tiak-server/auth"
	"tiak-server/models"
	"tiak-server/validation"
)

func addToQueue(state *AppState) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := auth.GetUser(r)
		if user == nil {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		var req struct {
			URLs     string `json:"urls"`
			Category string `json:"category"`
		}
		json.NewDecoder(r.Body).Decode(&req)
		if req.Category == "" {
			req.Category = "default"
		}
		lines := strings.Split(req.URLs, "\n")
		added := []models.Job{}
		skipped := []map[string]string{}

		for _, line := range lines {
			rawURL := strings.TrimSpace(line)
			if rawURL == "" {
				continue
			}
			originalURL := NormalizeURL(rawURL)
			if err := validation.ValidateURLSSRF(originalURL); err != nil {
				skipped = append(skipped, map[string]string{"url": originalURL, "reason": err.Error()})
				continue
			}
			finalURL := originalURL
			resolved, err := ResolveURL(originalURL)
			if err == nil && resolved != "" {
				finalURL = resolved
			}
			if state.Queue.HasJob(r.Context(), finalURL) {
				skipped = append(skipped, map[string]string{"url": finalURL, "reason": "Already in queue"})
				continue
			}
			exists, _ := state.DB.UrlDownloaded(r.Context(), finalURL)
			if exists != nil {
				skipped = append(skipped, map[string]string{"url": finalURL, "reason": "Already downloaded"})
				continue
			}
			platform := DetectPlatform(finalURL)
			job, err := state.DB.CreateJob(r.Context(), finalURL, req.Category, platform, nil, user.Username, "")
			if err != nil {
				skipped = append(skipped, map[string]string{"url": finalURL, "reason": err.Error()})
				continue
			}
			state.Queue.AddJob(job.ID)
			added = append(added, *job)
		}
		w.WriteHeader(http.StatusCreated)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{"added": added, "skipped": skipped})
	}
}

func listQueue(state *AppState) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := auth.GetUser(r)
		if user == nil {
			user = &auth.AuthenticatedUser{Username: "guest", Role: "guest"}
		}
		jobs, err := state.DB.GetAllJobs(r.Context(), user.Username, user.Role)
		if err != nil {
			http.Error(w, "Failed", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(jobs)
	}
}

func deleteJob(state *AppState) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := auth.GetUser(r)
		if user == nil || user.Role != "admin" {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}
		id := chi.URLParam(r, "id")
		state.Queue.CancelJob(id)
		state.DB.DeleteJob(r.Context(), id)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{"success": true, "id": id})
	}
}

func retryJob(state *AppState) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := auth.GetUser(r)
		if user == nil {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		id := chi.URLParam(r, "id")
		job, err := state.DB.GetJob(r.Context(), id)
		if err != nil {
			http.Error(w, "Job not found", http.StatusNotFound)
			return
		}
		if user.Role != "admin" && (job.UserID == nil || *job.UserID != user.Username) {
			http.Error(w, "Access denied", http.StatusForbidden)
			return
		}
		maxRetries := state.Config.Server.MaxRetryCount
		newRetry, err := state.DB.IncrementRetry(r.Context(), id, maxRetries, nil)
		if err != nil {
			http.Error(w, err.Error(), http.StatusConflict)
			return
		}
		state.Queue.AddJob(id)
		updated, _ := state.DB.GetJob(r.Context(), id)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"job":              updated,
			"remainingRetries": maxRetries - newRetry,
			"maxRetries":       maxRetries,
		})
	}
}

func redownloadJob(state *AppState) http.HandlerFunc {
	return retryJob(state) // same logic
}

func queueHistory(state *AppState) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := auth.GetUser(r)
		if user == nil {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		page := int64(1)
		limit := int64(50)
		offset := (page - 1) * limit
		jobs, total, err := state.DB.GetJobHistory(r.Context(), limit, offset, user.Username, user.Role)
		if err != nil {
			http.Error(w, "Failed", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"items": jobs, "total": total, "page": page, "limit": limit,
		})
	}
}

func resolveURLEndpoint(state *AppState) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			URL string `json:"url"`
		}
		json.NewDecoder(r.Body).Decode(&req)
		if err := validation.ValidateURLSSRF(req.URL); err != nil {
			http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusBadRequest)
			return
		}
		resolved, err := ResolveURL(req.URL)
		if err != nil {
			http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusBadRequest)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"url": resolved})
	}
}

func getSettings(state *AppState) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"maxConcurrent":   state.Queue.GetMaxConcurrent(),
			"syncDestination": state.Queue.GetSyncDestination(),
			"syncMode":        state.Queue.GetSyncMode(),
		})
	}
}

func setSettings(state *AppState) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := auth.GetUser(r)
		if user == nil || user.Role != "admin" {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}
		var req struct {
			MaxConcurrent   int    `json:"maxConcurrent"`
			SyncDestination string `json:"syncDestination"`
			SyncMode        string `json:"syncMode"`
		}
		json.NewDecoder(r.Body).Decode(&req)
		if req.MaxConcurrent > 0 {
			state.Queue.SetMaxConcurrent(req.MaxConcurrent)
		}
		if req.SyncDestination != "" {
			state.Queue.SetSyncDestination(req.SyncDestination)
		}
		if req.SyncMode != "" {
			state.Queue.SetSyncMode(req.SyncMode)
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"maxConcurrent":   state.Queue.GetMaxConcurrent(),
			"syncDestination": state.Queue.GetSyncDestination(),
			"syncMode":        state.Queue.GetSyncMode(),
		})
	}
}

func syncRun(state *AppState) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		msg, err := state.Queue.RunSync()
		if err != nil {
			http.Error(w, `{"success":false,"error":"`+err.Error()+`"}`, http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{"success": true, "message": msg})
	}
}

func syncStatus(state *AppState) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		state.FileIndex.BuildIndex()
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(state.Queue.GetSyncState(state.FileIndex))
	}
}

func exportQueue(state *AppState) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		jobs, err := state.DB.ExportAllJobs(r.Context())
		if err != nil {
			http.Error(w, "Failed", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Disposition", "attachment; filename=\"jobs-export.json\"")
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(jobs)
	}
}

func importQueue(state *AppState) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "Import not implemented", http.StatusNotImplemented)
	}
}

func rcloneLs(w http.ResponseWriter, r *http.Request) {
	user := auth.GetUser(r)
	if user == nil || user.Role != "admin" {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"entries": []string{}})
}
