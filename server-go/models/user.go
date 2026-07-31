package models

// User represents an authenticated user.
type User struct {
	ID              string  `bson:"_id" json:"id"`
	Username        string  `bson:"username" json:"username"`
	Email           string  `bson:"email" json:"email"`
	PasswordHash    string  `bson:"password_hash" json:"-"`
	Role            string  `bson:"role" json:"role"`
	DefaultPresetID *string `bson:"default_preset_id,omitempty" json:"default_preset_id"`
}
