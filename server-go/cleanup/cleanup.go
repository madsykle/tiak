package cleanup

import (
	"context"
	"time"

	"tiak-server/db"
	"tiak-server/storage"
)

func RunCleanup(ctx context.Context, d *db.MongoDB) {
	cutoff := time.Now().Add(-7 * 24 * time.Hour).UnixMilli()
	d.DeleteOldFailedJobs(ctx, cutoff)
}

func FixJobCategories(ctx context.Context, d *db.MongoDB, fi *storage.FileIndex) {
	d.ResetCrashedJobs(ctx)
	fi.BuildIndex()
}

func ScanForMissingFiles(ctx context.Context, d *db.MongoDB, fi *storage.FileIndex) {
	jobs, err := d.GetJobsForMissingScan(ctx)
	if err != nil {
		return
	}
	for _, job := range jobs {
		if job.Filename == nil || *job.Filename == "" {
			continue
		}
		if fi.FindFileByName(*job.Filename) != nil {
			if job.Status == "missing" {
				d.RecoverMissingJob(ctx, job.ID)
			}
		} else {
			if job.Status != "missing" {
				d.MarkMissing(ctx, job.ID)
			}
		}
	}
}
