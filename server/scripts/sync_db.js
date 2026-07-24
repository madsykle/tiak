#!/usr/bin/env node
/**
 * sync_db.js — Incremental sync: add new files, remove deleted ones
 *
 * Compares filesystem against MongoDB and:
 *   - Inserts jobs for new files not yet in DB
 *   - Marks jobs as "missing" if their file no longer exists on disk
 *
 * Usage:
 *   node scripts/sync_db.js [--dry-run]
 */

const { MongoClient } = require("mongodb");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const { execSync } = require("child_process");
const DATA_ROOT = path.resolve(__dirname, "../data");
const YT_DLP = path.resolve(__dirname, "../bin/yt-dlp");
const MEDIA_EXTS = new Set([
  ".mp4", ".mkv", ".webm", ".mp3", ".ogg", ".wav",
  ".jpg", ".jpeg", ".png", ".gif", ".webp", ".m4a",
  ".flac", ".aac", ".srt",
]);

function loadMongoUri() {
  const envPath = path.resolve(__dirname, "../.env");
  if (fs.existsSync(envPath)) {
    const env = fs.readFileSync(envPath, "utf8");
    const match = env.match(/^MONGODB_URI=(.+)$/m);
    if (match) return match[1].trim();
  }
  return process.env.MONGODB_URI || "mongodb://localhost:27017/tiak";
}

function scanFilesystem() {
  if (!fs.existsSync(DATA_ROOT)) return [];

  const categories = fs.readdirSync(DATA_ROOT).filter((d) => {
    try { return fs.statSync(path.join(DATA_ROOT, d)).isDirectory(); }
    catch { return false; }
  }).filter((d) => !d.startsWith("."));

  const files = [];

  for (const category of categories) {
    const catPath = path.join(DATA_ROOT, category);
    const dateDirs = fs.readdirSync(catPath).filter((d) => {
      try { return fs.statSync(path.join(catPath, d)).isDirectory(); }
      catch { return false; }
    });

    for (const dateDir of dateDirs) {
      const datePath = path.join(catPath, dateDir);
      const mediaFiles = fs.readdirSync(datePath).filter((f) =>
        MEDIA_EXTS.has(path.extname(f).toLowerCase())
      );

      for (const file of mediaFiles) {
        const filePath = path.join(datePath, file);
        const stat = fs.statSync(filePath);
        const relPath = path.join(category, dateDir, file);

        let createdAt = stat.mtimeMs;
        const dateMatch = dateDir.match(/(\d{4})-(\d{2})-(\d{2})/);
        if (dateMatch) {
          createdAt = new Date(`${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}T12:00:00Z`).getTime();
        }

        // Quick platform detect
        let platform = null;
        const tiktokMatch = file.match(/^(\d{15,21})\.mp4$/i);
        if (tiktokMatch) platform = "tiktok";

        files.push({ relPath, category, createdAt, platform });
      }
    }
  }

  return files;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  console.log("═══════════════════════════════════════════════");
  console.log("  Tiak DB Sync");
  console.log("═══════════════════════════════════════════════\n");

  // Scan filesystem
  console.log("Scanning filesystem...");
  const diskFiles = scanFilesystem();
  const diskPaths = new Set(diskFiles.map(f => f.relPath));
  console.log(`  ${diskFiles.length} files on disk\n`);

  // Connect to MongoDB
  const uri = loadMongoUri();
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db("tiak");

  // Get existing jobs
  const existing = await db.collection("jobs").find({}, { projection: { filename: 1, status: 1 } }).toArray();
  const dbPaths = new Set(existing.map(j => j.filename).filter(Boolean));

  // Find new files (on disk but not in DB)
  const newFiles = diskFiles.filter(f => !dbPaths.has(f.relPath));

  // Find missing files (in DB but not on disk, and not already marked missing)
  const missingJobs = existing.filter(j => j.filename && !diskPaths.has(j.filename) && j.status !== "missing");

  console.log(`New files  : ${newFiles.length}`);
  console.log(`Missing    : ${missingJobs.length}`);
  console.log();

  if (dryRun) {
    if (newFiles.length > 0) {
      console.log("Would insert:");
      newFiles.slice(0, 20).forEach(f => console.log(`  + ${f.relPath}`));
      if (newFiles.length > 20) console.log(`  ... and ${newFiles.length - 20} more`);
    }
    if (missingJobs.length > 0) {
      console.log("\nWould mark missing:");
      missingJobs.slice(0, 20).forEach(j => console.log(`  - ${j.filename}`));
      if (missingJobs.length > 20) console.log(`  ... and ${missingJobs.length - 20} more`);
    }
    await client.close();
    return;
  }

  // Insert new jobs
  if (newFiles.length > 0) {
    console.log("Inserting new jobs...");
    const jobs = newFiles.map(f => ({
      _id: crypto.randomUUID(),
      url: f.platform === "tiktok" ? `https://www.tiktok.com/@unknown/video/${path.basename(f.relPath, ".mp4")}` : "",
      status: "completed",
      progress: 100,
      eta: null,
      filename: f.relPath,
      createdAt: f.createdAt,
      startedAt: f.createdAt,
      completedAt: f.createdAt + 5000,
      retries: 0,
      error: null,
      category: f.category,
      creator_name: null,
      creator_avatar: null,
      caption: null,
      transcript: null,
      hashtags: null,
      suggested_category: null,
      visual_description: null,
      platform: f.platform,
      expiresAt: null,
      user_id: null,
      preset_id: null,
    }));

    const BATCH = 500;
    for (let i = 0; i < jobs.length; i += BATCH) {
      await db.collection("jobs").insertMany(jobs.slice(i, i + BATCH));
    }
    console.log(`  ✓ ${jobs.length} jobs inserted`);
  }

  // Mark missing
  if (missingJobs.length > 0) {
    console.log("Marking missing files...");
    const ids = missingJobs.map(j => j._id);
    await db.collection("jobs").updateMany(
      { _id: { $in: ids } },
      { $set: { status: "missing", error: "File not found on disk" } }
    );
    console.log(`  ✓ ${ids.length} jobs marked missing`);
  }

  // Final stats
  const totalJobs = await db.collection("jobs").countDocuments();
  const doneJobs = await db.collection("jobs").countDocuments({ status: "completed" });
  const missingCount = await db.collection("jobs").countDocuments({ status: "missing" });

  console.log(`\n═══════════════════════════════════════════════`);
  console.log(`  Total     : ${totalJobs}`);
  console.log(`  Completed : ${doneJobs}`);
  console.log(`  Missing   : ${missingCount}`);
  console.log(`  Inserted  : ${newFiles.length}`);
  console.log(`  Marked -  : ${missingJobs.length}`);
  console.log(`═══════════════════════════════════════════════`);

  await client.close();

  // Auto-fetch metadata for new jobs if yt-dlp is available
  if (newFiles.length > 0 && fs.existsSync(YT_DLP)) {
    console.log("\n── Fetching metadata for new jobs ──");
    let cmd = `node "${path.join(__dirname, "fetch_metadata.js")}" --limit ${newFiles.length}`;
    try {
      execSync(cmd, { stdio: "inherit", cwd: __dirname });
    } catch {
      console.log("  Metadata fetch completed with errors (non-fatal)");
    }
  }
}

main().catch((e) => {
  console.error("Fatal:", e.message);
  process.exit(1);
});
