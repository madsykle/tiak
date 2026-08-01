package db

import (
	"context"
	"crypto/rand"
	"fmt"
	"regexp"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"tiak-server/models"
)

// escapeRegex escapes regex metacharacters to prevent ReDoS and injection.
func escapeRegex(s string) string {
	return regexp.QuoteMeta(s)
}

func generateID() string {
	b := make([]byte, 16)
	rand.Read(b)
	return fmt.Sprintf("%x", b)
}

func (m *MongoDB) jobs() *mongo.Collection {
	return m.Database.Collection(jobsCollection)
}

func (m *MongoDB) CreateJob(ctx context.Context, url, category, platform string, expiresAt *int64, userID, presetID string) (*models.Job, error) {
	now := time.Now().UnixMilli()
	job := &models.Job{
		ID:        generateID(),
		URL:       url,
		Status:    "queued",
		Progress:  0,
		CreatedAt: now,
		Retries:   0,
		Category:  category,
	}
	if platform != "" {
		job.Platform = &platform
	}
	if expiresAt != nil {
		job.ExpiresAt = expiresAt
	}
	if userID != "" {
		job.UserID = &userID
	}
	if presetID != "" {
		job.PresetID = &presetID
	}

	_, err := m.jobs().InsertOne(ctx, job)
	if err != nil {
		return nil, err
	}
	return job, nil
}

func (m *MongoDB) GetJob(ctx context.Context, id string) (*models.Job, error) {
	var job models.Job
	err := m.jobs().FindOne(ctx, bson.M{"_id": id}).Decode(&job)
	if err != nil {
		return nil, err
	}
	return &job, nil
}

func (m *MongoDB) GetQueuedJobs(ctx context.Context) ([]models.Job, error) {
	return m.findJobsByStatus(ctx, "queued")
}

func (m *MongoDB) GetActiveJobs(ctx context.Context) ([]models.Job, error) {
	return m.findJobsByStatus(ctx, "downloading")
}

func (m *MongoDB) UrlInQueue(ctx context.Context, url string) (bool, error) {
	count, err := m.jobs().CountDocuments(ctx, bson.M{"url": url, "status": bson.M{"$in": []string{"queued", "downloading"}}})
	if err != nil {
		return false, err
	}
	return count > 0, nil
}

func (m *MongoDB) UrlDownloaded(ctx context.Context, url string) (*models.Job, error) {
	var job models.Job
	err := m.jobs().FindOne(ctx, bson.M{"url": url, "status": "done"}).Decode(&job)
	if err != nil {
		return nil, err
	}
	return &job, nil
}

func (m *MongoDB) UpdateJobStatus(ctx context.Context, id, status string) error {
	_, err := m.jobs().UpdateByID(ctx, id, bson.M{"$set": bson.M{"status": status}})
	return err
}

func (m *MongoDB) UpdateJobProgress(ctx context.Context, id string, progress int64, eta *int64) error {
	update := bson.M{"$set": bson.M{"progress": progress}}
	if eta != nil {
		update["$set"].(bson.M)["eta"] = eta
	}
	_, err := m.jobs().UpdateByID(ctx, id, update)
	return err
}

func (m *MongoDB) UpdateJobFilename(ctx context.Context, id string, filename string) error {
	_, err := m.jobs().UpdateByID(ctx, id, bson.M{"$set": bson.M{"filename": filename}})
	return err
}

func (m *MongoDB) UpdateJobMetadata(ctx context.Context, id string, creator, avatar, caption *string) error {
	sets := bson.M{}
	if creator != nil {
		sets["creator_name"] = creator
	}
	if avatar != nil {
		sets["creator_avatar"] = avatar
	}
	if caption != nil {
		sets["caption"] = caption
	}
	if len(sets) == 0 {
		return nil
	}
	_, err := m.jobs().UpdateByID(ctx, id, bson.M{"$set": sets})
	return err
}

func (m *MongoDB) UpdateJobCategory(ctx context.Context, id, category string) (bool, error) {
	result, err := m.jobs().UpdateByID(ctx, id, bson.M{"$set": bson.M{"category": category}})
	if err != nil {
		return false, err
	}
	return result.MatchedCount == 1, nil
}

func (m *MongoDB) UpdateJobPlatform(ctx context.Context, id, platform string) error {
	_, err := m.jobs().UpdateByID(ctx, id, bson.M{"$set": bson.M{"platform": platform}})
	return err
}

func (m *MongoDB) DeleteJob(ctx context.Context, id string) error {
	_, err := m.jobs().DeleteOne(ctx, bson.M{"_id": id})
	return err
}

func (m *MongoDB) GetJobHistory(ctx context.Context, limit, offset int64, userID, role string) ([]models.Job, int64, error) {
	filter := bson.M{}
	if role != "admin" && userID != "" {
		filter["user_id"] = userID
	}

	total, err := m.jobs().CountDocuments(ctx, filter)
	if err != nil {
		return nil, 0, err
	}

	opts := options.Find().
		SetSort(bson.D{{Key: "createdAt", Value: -1}}).
		SetLimit(limit).
		SetSkip(offset)

	cursor, err := m.jobs().Find(ctx, filter, opts)
	if err != nil {
		return nil, 0, err
	}
	defer cursor.Close(ctx)

	var jobs []models.Job
	if err := cursor.All(ctx, &jobs); err != nil {
		return nil, 0, err
	}
	return jobs, total, nil
}

func (m *MongoDB) GetAllJobs(ctx context.Context, userID, role string) ([]models.Job, error) {
	filter := bson.M{}
	if role != "admin" && userID != "" {
		filter["user_id"] = userID
	}

	cursor, err := m.jobs().Find(ctx, filter)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var jobs []models.Job
	if err := cursor.All(ctx, &jobs); err != nil {
		return nil, err
	}
	return jobs, nil
}

func (m *MongoDB) GetJobsForMissingScan(ctx context.Context) ([]models.Job, error) {
	filter := bson.M{"status": bson.M{"$in": []string{"done", "missing"}}}
	cursor, err := m.jobs().Find(ctx, filter)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var jobs []models.Job
	if err := cursor.All(ctx, &jobs); err != nil {
		return nil, err
	}
	return jobs, nil
}

func (m *MongoDB) GetDoneJobsInfoMap(ctx context.Context, userID, role string) (map[string]models.JobInfo, error) {
	filter := bson.M{"status": "done"}
	if role != "admin" && userID != "" {
		filter["user_id"] = userID
	}

	cursor, err := m.jobs().Find(ctx, filter, options.Find().SetProjection(bson.M{
		"_id": 1, "url": 1, "status": 1, "filename": 1, "category": 1,
	}))
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	jobsMap := make(map[string]models.JobInfo)
	for cursor.Next(ctx) {
		var info models.JobInfo
		if err := cursor.Decode(&info); err != nil {
			continue
		}
		jobsMap[info.ID] = info
	}
	return jobsMap, nil
}

func (m *MongoDB) GetTimelineJobs(ctx context.Context, limit int64) ([]models.Job, error) {
	filter := bson.M{"status": "done"}
	opts := options.Find().
		SetSort(bson.D{{Key: "createdAt", Value: -1}}).
		SetLimit(limit)

	cursor, err := m.jobs().Find(ctx, filter, opts)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var jobs []models.Job
	if err := cursor.All(ctx, &jobs); err != nil {
		return nil, err
	}
	return jobs, nil
}

func (m *MongoDB) SearchJobs(ctx context.Context, pattern string) ([]models.Job, error) {
	// Escape regex metacharacters to prevent ReDoS and injection
	escaped := escapeRegex(pattern)
	filter := bson.M{
		"$or": []bson.M{
			{"url": bson.M{"$regex": escaped, "$options": "i"}},
			{"filename": bson.M{"$regex": escaped, "$options": "i"}},
			{"category": bson.M{"$regex": escaped, "$options": "i"}},
		},
	}

	cursor, err := m.jobs().Find(ctx, filter)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var jobs []models.Job
	if err := cursor.All(ctx, &jobs); err != nil {
		return nil, err
	}
	return jobs, nil
}

func (m *MongoDB) GetJobsByCategory(ctx context.Context, category string) ([]models.Job, error) {
	cursor, err := m.jobs().Find(ctx, bson.M{"category": category})
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var jobs []models.Job
	if err := cursor.All(ctx, &jobs); err != nil {
		return nil, err
	}
	return jobs, nil
}

func (m *MongoDB) GetJobsByCreator(ctx context.Context, creator string) ([]models.Job, error) {
	cursor, err := m.jobs().Find(ctx, bson.M{"creator_name": creator})
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var jobs []models.Job
	if err := cursor.All(ctx, &jobs); err != nil {
		return nil, err
	}
	return jobs, nil
}

func (m *MongoDB) MarkDone(ctx context.Context, id, filename string, creator, avatar, caption *string) error {
	sets := bson.M{
		"status":      "done",
		"progress":    100,
		"filename":    filename,
		"completedAt": time.Now().UnixMilli(),
	}
	if creator != nil {
		sets["creator_name"] = creator
	}
	if avatar != nil {
		sets["creator_avatar"] = avatar
	}
	if caption != nil {
		sets["caption"] = caption
	}
	_, err := m.jobs().UpdateByID(ctx, id, bson.M{"$set": sets})
	return err
}

func (m *MongoDB) MarkFailed(ctx context.Context, id, errMsg string) error {
	_, err := m.jobs().UpdateByID(ctx, id, bson.M{"$set": bson.M{
		"status": "failed",
		"error":  errMsg,
	}})
	return err
}

func (m *MongoDB) MarkDownloading(ctx context.Context, id string) error {
	_, err := m.jobs().UpdateByID(ctx, id, bson.M{"$set": bson.M{
		"status":    "downloading",
		"startedAt": time.Now().UnixMilli(),
	}})
	return err
}

func (m *MongoDB) MarkMissing(ctx context.Context, id string) error {
	_, err := m.jobs().UpdateByID(ctx, id, bson.M{"$set": bson.M{"status": "missing"}})
	return err
}

func (m *MongoDB) RecoverMissingJob(ctx context.Context, id string) error {
	_, err := m.jobs().UpdateByID(ctx, id, bson.M{"$set": bson.M{
		"status":   "queued",
		"progress": 0,
	}, "$unset": bson.M{"error": ""}})
	return err
}

func (m *MongoDB) IncrementRetry(ctx context.Context, id string, maxRetries uint32, expiresAt *int64) (uint32, error) {
	filter := bson.M{"_id": id, "retries": bson.M{"$lt": int64(maxRetries)}}
	update := bson.M{"$inc": bson.M{"retries": 1}, "$set": bson.M{"status": "queued"}}
	if expiresAt != nil {
		update["$set"].(bson.M)["expiresAt"] = expiresAt
	}

	var job models.Job
	opts := options.FindOneAndUpdate().SetReturnDocument(options.After)
	err := m.jobs().FindOneAndUpdate(ctx, filter, update, opts).Decode(&job)
	if err != nil {
		return 0, err
	}
	return uint32(job.Retries), nil
}

func (m *MongoDB) CheckJobExists(ctx context.Context, id string) (bool, error) {
	count, err := m.jobs().CountDocuments(ctx, bson.M{"_id": id})
	if err != nil {
		return false, err
	}
	return count > 0, nil
}

func (m *MongoDB) UpdateCategoryByFilename(ctx context.Context, filename, oldCategory, newCategory string) (bool, error) {
	filter := bson.M{"filename": filename, "category": oldCategory}
	matches, err := m.jobs().CountDocuments(ctx, filter)
	if err != nil {
		return false, err
	}
	if matches == 0 {
		// Files can exist on disk without a corresponding job document.
		return false, nil
	}
	if matches > 1 {
		return false, fmt.Errorf("multiple jobs match filename %q in category %q", filename, oldCategory)
	}
	result, err := m.jobs().UpdateOne(ctx, filter, bson.M{"$set": bson.M{"category": newCategory}})
	if err != nil {
		return false, err
	}
	return result.MatchedCount == 1, nil
}

func (m *MongoDB) FindJobByFilename(ctx context.Context, filename string) (*models.Job, error) {
	var job models.Job
	err := m.jobs().FindOne(ctx, bson.M{"filename": filename}).Decode(&job)
	if err != nil {
		return nil, err
	}
	return &job, nil
}

func (m *MongoDB) ExportAllJobs(ctx context.Context) ([]models.Job, error) {
	cursor, err := m.jobs().Find(ctx, bson.M{})
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var jobs []models.Job
	if err := cursor.All(ctx, &jobs); err != nil {
		return nil, err
	}
	return jobs, nil
}

func (m *MongoDB) ImportJob(ctx context.Context, job models.Job) error {
	_, err := m.jobs().InsertOne(ctx, job)
	return err
}

func (m *MongoDB) ResetCrashedJobs(ctx context.Context) (int64, error) {
	result, err := m.jobs().UpdateMany(ctx,
		bson.M{"status": "downloading"},
		bson.M{"$set": bson.M{"status": "queued", "progress": 0}},
	)
	if err != nil {
		return 0, err
	}
	return result.MatchedCount, nil
}

func (m *MongoDB) DeleteOldFailedJobs(ctx context.Context, beforeTimestamp int64) (int64, error) {
	result, err := m.jobs().DeleteMany(ctx, bson.M{
		"status":    "failed",
		"createdAt": bson.M{"$lt": beforeTimestamp},
	})
	if err != nil {
		return 0, err
	}
	return result.DeletedCount, nil
}

func (m *MongoDB) AddCorrection(ctx context.Context, jobID, original, suggested, finalCat string) error {
	coll := m.Database.Collection("corrections")
	_, err := coll.InsertOne(ctx, bson.M{
		"job_id":         jobID,
		"original":       original,
		"suggested":      suggested,
		"final_category": finalCat,
		"created_at":     time.Now().UnixMilli(),
	})
	return err
}

func (m *MongoDB) GetRecentCorrections(ctx context.Context, limit int64) ([]models.Correction, error) {
	coll := m.Database.Collection("corrections")
	opts := options.Find().
		SetSort(bson.D{{Key: "created_at", Value: -1}}).
		SetLimit(limit)

	cursor, err := coll.Find(ctx, bson.M{}, opts)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var corrections []models.Correction
	if err := cursor.All(ctx, &corrections); err != nil {
		return nil, err
	}
	return corrections, nil
}

func (m *MongoDB) GetStats(ctx context.Context) (*models.DbStats, error) {
	stats := &models.DbStats{}

	statuses := []string{"queued", "downloading", "done", "failed", "missing"}
	counts := map[string]*int64{
		"queued":      &stats.Queued,
		"downloading": &stats.Downloading,
		"done":        &stats.Done,
		"failed":      &stats.Failed,
		"missing":     &stats.Missing,
	}

	total, err := m.jobs().CountDocuments(ctx, bson.M{})
	if err != nil {
		return nil, err
	}
	stats.Total = total

	for _, status := range statuses {
		count, err := m.jobs().CountDocuments(ctx, bson.M{"status": status})
		if err != nil {
			return nil, err
		}
		*counts[status] = count
	}

	return stats, nil
}

func (m *MongoDB) findJobsByStatus(ctx context.Context, status string) ([]models.Job, error) {
	cursor, err := m.jobs().Find(ctx, bson.M{"status": status})
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var jobs []models.Job
	if err := cursor.All(ctx, &jobs); err != nil {
		return nil, err
	}
	return jobs, nil
}
