package routes

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
)

func searchVideos(state *AppState) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query().Get("q")
		jobs, err := state.DB.SearchJobs(r.Context(), q)
		if err != nil {
			http.Error(w, "Search failed", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(jobs)
	}
}

func listByCategory(state *AppState) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		name := chi.URLParam(r, "name")
		jobs, err := state.DB.GetJobsByCategory(r.Context(), name)
		if err != nil {
			http.Error(w, "Failed", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(jobs)
	}
}

func listByCreator(state *AppState) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		name := chi.URLParam(r, "name")
		jobs, err := state.DB.GetJobsByCreator(r.Context(), name)
		if err != nil {
			http.Error(w, "Failed", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(jobs)
	}
}
