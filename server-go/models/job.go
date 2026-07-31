package models

// Job matches the MongoDB job document exactly.
type Job struct {
	ID                string  `bson:"_id" json:"id"`
	URL               string  `bson:"url" json:"url"`
	Status            string  `bson:"status" json:"status"`
	Progress          int64   `bson:"progress" json:"progress"`
	Eta               *int64  `bson:"eta,omitempty" json:"eta"`
	Filename          *string `bson:"filename,omitempty" json:"filename"`
	CreatedAt         int64   `bson:"createdAt" json:"createdAt"`
	StartedAt         *int64  `bson:"startedAt,omitempty" json:"startedAt"`
	CompletedAt       *int64  `bson:"completedAt,omitempty" json:"completedAt"`
	Retries           int64   `bson:"retries" json:"retries"`
	Error             *string `bson:"error,omitempty" json:"error"`
	Category          string  `bson:"category" json:"category"`
	CreatorName       *string `bson:"creator_name,omitempty" json:"creator_name"`
	CreatorAvatar     *string `bson:"creator_avatar,omitempty" json:"creator_avatar"`
	Caption           *string `bson:"caption,omitempty" json:"caption"`
	Transcript        *string `bson:"transcript,omitempty" json:"transcript"`
	Hashtags          *string `bson:"hashtags,omitempty" json:"hashtags"`
	SuggestedCategory *string `bson:"suggested_category,omitempty" json:"suggested_category"`
	VisualDescription *string `bson:"visual_description,omitempty" json:"visual_description"`
	Platform          *string `bson:"platform,omitempty" json:"platform"`
	ExpiresAt         *int64  `bson:"expiresAt,omitempty" json:"expiresAt"`
	UserID            *string `bson:"user_id,omitempty" json:"user_id"`
	PresetID          *string `bson:"preset_id,omitempty" json:"preset_id"`
}

// JobInfo is a lightweight view of a job for history/listing.
type JobInfo struct {
	ID       string  `bson:"_id" json:"id"`
	URL      string  `bson:"url" json:"url"`
	Status   string  `bson:"status" json:"status"`
	Filename *string `bson:"filename,omitempty" json:"filename"`
	Category string  `bson:"category" json:"category"`
}

// DbStats holds aggregate stats from the jobs collection.
type DbStats struct {
	Total       int64 `bson:"total" json:"total"`
	Queued      int64 `bson:"queued" json:"queued"`
	Downloading int64 `bson:"downloading" json:"downloading"`
	Done        int64 `bson:"done" json:"done"`
	Failed      int64 `bson:"failed" json:"failed"`
	Missing     int64 `bson:"missing" json:"missing"`
}

// Correction tracks category corrections.
type Correction struct {
	JobID        string `bson:"job_id" json:"job_id"`
	Original     string `bson:"original" json:"original"`
	Suggested    string `bson:"suggested" json:"suggested"`
	FinalCategory string `bson:"final_category" json:"final_category"`
	CreatedAt    int64  `bson:"created_at" json:"created_at"`
}
