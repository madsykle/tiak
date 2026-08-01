package routes

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"tiak-server/auth"
	"tiak-server/models"
)

func loginHandler(state *AppState) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Username string `json:"username"`
			Password string `json:"password"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, `{"message":"Invalid request"}`, http.StatusBadRequest)
			return
		}
		user, err := state.DB.FindUserByUsername(r.Context(), req.Username)
		if err != nil || user == nil || !auth.VerifyPassword(req.Password, user.PasswordHash) {
			http.Error(w, `{"message":"Invalid username or password"}`, http.StatusUnauthorized)
			return
		}
		token, err := state.AuthState.GenerateToken(user.Username, user.Role)
		if err != nil {
			http.Error(w, `{"message":"Failed to generate token"}`, http.StatusInternalServerError)
			return
		}
		http.SetCookie(w, &http.Cookie{
			Name:     "token",
			Value:    token,
			Path:     "/",
			HttpOnly: true,
			Secure:   true,
			SameSite: http.SameSiteLaxMode,
			MaxAge:   int(state.Config.Server.JWTExpiryHours * 3600),
		})
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{"role": user.Role})
	}
}

func signupHandler(state *AppState) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Username string `json:"username"`
			Email    string `json:"email"`
			Password string `json:"password"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, `{"message":"Invalid request"}`, http.StatusBadRequest)
			return
		}
		count, _ := state.DB.CountUsersByUsernameOrEmail(r.Context(), req.Username, req.Email)
		if count > 0 {
			http.Error(w, `{"message":"Username or email already exists"}`, http.StatusConflict)
			return
		}
		hash, err := auth.HashPassword(req.Password)
		if err != nil {
			http.Error(w, `{"message":"Hashing failed"}`, http.StatusInternalServerError)
			return
		}
		user := models.User{
			ID:           auth.NewID(),
			Username:     req.Username,
			Email:        req.Email,
			PasswordHash: hash,
			Role:         "premium_member",
		}
		if err := state.DB.CreateUser(r.Context(), &user); err != nil {
			http.Error(w, `{"message":"Failed to create user"}`, http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusCreated)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{"message": "User created successfully"})
	}
}

func meHandler(state *AppState) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := auth.GetUser(r)
		if user == nil {
			http.Error(w, `{"error":"Not authenticated"}`, http.StatusUnauthorized)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"username": user.Username,
			"role":     user.Role,
		})
	}
}

func listUsersHandler(state *AppState) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		users, err := state.DB.ListUsers(r.Context())
		if err != nil {
			http.Error(w, `{"error":"Failed"}`, http.StatusInternalServerError)
			return
		}
		result := make([]map[string]string, len(users))
		for i, u := range users {
			result[i] = map[string]string{"id": u.ID, "username": u.Username, "email": u.Email, "role": u.Role}
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(result)
	}
}

func createUserHandler(state *AppState) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		admin := auth.GetUser(r)
		if admin == nil || admin.Role != "admin" {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}
		var req struct {
			Username string `json:"username"`
			Email    string `json:"email"`
			Password string `json:"password"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, `{"message":"Invalid request"}`, http.StatusBadRequest)
			return
		}
		count, _ := state.DB.CountUsersByUsernameOrEmail(r.Context(), req.Username, req.Email)
		if count > 0 {
			http.Error(w, "Username or email already exists", http.StatusConflict)
			return
		}
		hash, err := auth.HashPassword(req.Password)
		if err != nil {
			http.Error(w, "Hashing failed", http.StatusInternalServerError)
			return
		}
		user := models.User{
			ID:           auth.NewID(),
			Username:     req.Username,
			Email:        req.Email,
			PasswordHash: hash,
			Role:         "premium_member",
		}
		if err := state.DB.CreateUser(r.Context(), &user); err != nil {
			http.Error(w, "Failed to create user", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusCreated)
	}
}

func updateRoleHandler(state *AppState) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		admin := auth.GetUser(r)
		if admin == nil || admin.Role != "admin" {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}
		id := chi.URLParam(r, "id")
		var req struct {
			Role string `json:"role"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request", http.StatusBadRequest)
			return
		}
		validRoles := map[string]bool{"guest": true, "premium_member": true, "admin": true}
		if !validRoles[req.Role] {
			http.Error(w, "Invalid role", http.StatusBadRequest)
			return
		}
		if err := state.DB.UpdateUserRole(r.Context(), id, req.Role); err != nil {
			http.Error(w, "Failed", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusOK)
	}
}
