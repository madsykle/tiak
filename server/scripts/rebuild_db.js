#!/usr/bin/env node
/**
 * rebuild_db.js — Full database rebuild from filesystem
 *
 * Scans server/data/<CATEGORY>/<DATE>/<files> and (re)creates:
 *   - All collections (drops existing first)
 *   - Indexes
 *   - Admin user
 *   - Job records from every media file on disk
 *
 * Usage:
 *   node scripts/rebuild_db.js [--dry-run] [--keep-data]
 *
 * Options:
 *   --dry-run    Show what would be inserted, don't touch MongoDB
 *   --keep-data  Don't drop existing collections, just rebuild missing jobs
 */

const { MongoClient } = require("mongodb");
const crypto = require("crypto");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

// ── Config ──────────────────────────────────────────────────────────
const DATA_ROOT = path.resolve(__dirname, "../data");
const MEDIA_EXTS = new Set([
  ".mp4", ".mkv", ".webm", ".mp3", ".ogg", ".wav",
  ".jpg", ".jpeg", ".png", ".gif", ".webp", ".m4a",
  ".flac", ".aac", ".srt",
]);

// ── Parse .env for MONGO_URI ────────────────────────────────────────
function loadMongoUri() {
  const envPath = path.resolve(__dirname, "../.env");
  if (fs.existsSync(envPath)) {
    const env = fs.readFileSync(envPath, "utf8");
    const match = env.match(/^MONGODB_URI=(.+)$/m);
    if (match) return match[1].trim();
  }
  return process.env.MONGODB_URI || "mongodb://localhost:27017/tiak";
}

// ── Argon2 password hash (matches Rust's Argon2::default()) ────────
async function hashPassword(password) {
  const { hash } = require("argon2");
  return hash(password);
}

// ── Scan filesystem ─────────────────────────────────────────────────
function scanFilesystem() {
  if (!fs.existsSync(DATA_ROOT)) {
    console.error(`Data directory not found: ${DATA_ROOT}`);
    process.exit(1);
  }

  const categories = fs.readdirSync(DATA_ROOT).filter((d) => {
    try { return fs.statSync(path.join(DATA_ROOT, d)).isDirectory(); }
    catch { return false; }
  }).filter((d) => !d.startsWith("."));

  const jobs = [];

  for (const category of categories) {
    const catPath = path.join(DATA_ROOT, category);
    const dateDirs = fs.readdirSync(catPath).filter((d) => {
      try { return fs.statSync(path.join(catPath, d)).isDirectory(); }
      catch { return false; }
    });

    for (const dateDir of dateDirs) {
      const datePath = path.join(catPath, dateDir);
      const files = fs.readdirSync(datePath).filter((f) =>
        MEDIA_EXTS.has(path.extname(f).toLowerCase())
      );

      for (const file of files) {
        const filePath = path.join(datePath, file);
        const stat = fs.statSync(filePath);
        const relPath = path.join(category, dateDir, file);

        // Parse date from folder name
        let createdAt = stat.mtimeMs;
        const dateMatch = dateDir.match(/(\d{4})-(\d{2})-(\d{2})/);
        if (dateMatch) {
          createdAt = new Date(`${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}T12:00:00Z`).getTime();
        }

        // Try to read .info.json sidecar
        const infoPath = filePath.replace(/\.[^.]+$/, ".info.json");
        let url = "", caption = "", hashtags = "", creatorName = "", platform = "";
        if (fs.existsSync(infoPath)) {
          try {
            const info = JSON.parse(fs.readFileSync(infoPath, "utf8"));
            url = info.webpage_url || info.url || "";
            caption = info.description || info.title || "";
            creatorName = info.uploader || info.creator || info.channel || "";
            platform = info.extractor || "";
            if (info.tags && Array.isArray(info.tags)) {
              hashtags = info.tags.join(", ");
            }
          } catch {}
        }

        // Detect platform from TikTok video IDs in filename
        if (!platform) {
          const tiktokMatch = file.match(/^(\d{15,21})\.mp4$/i);
          if (tiktokMatch) {
            platform = "tiktok";
            if (!url) url = `https://www.tiktok.com/@unknown/video/${tiktokMatch[1]}`;
          }
        }

        jobs.push({
          _id: crypto.randomUUID(),
          url,
          status: "completed",
          progress: 100,
          eta: null,
          filename: relPath,
          createdAt,
          startedAt: createdAt,
          completedAt: createdAt + 5000,
          retries: 0,
          error: null,
          category,
          creator_name: creatorName || null,
          creator_avatar: null,
          caption: caption || null,
          transcript: null,
          hashtags: hashtags || null,
          suggested_category: null,
          visual_description: null,
          platform: platform || null,
          expiresAt: null,
          user_id: null,
          preset_id: null,
        });
      }
    }
  }

  return jobs;
}

// ── Create indexes ──────────────────────────────────────────────────
async function createIndexes(db) {
  await db.collection("users").createIndex({ username: 1 }, { unique: true });
  await db.collection("users").createIndex({ email: 1 }, { unique: true });
  await db.collection("jobs").createIndex({ status: 1, createdAt: 1 });
  await db.collection("jobs").createIndex({ category: 1, platform: 1 });
  await db.collection("jobs").createIndex({ platform: 1 });
  await db.collection("jobs").createIndex({ user_id: 1 });
  await db.collection("jobs").createIndex({ completedAt: -1 });
  await db.collection("jobs").createIndex({ url: 1, status: 1 });
  await db.collection("jobs").createIndex({ expiresAt: 1 });
  await db.collection("jobs").createIndex({ filename: 1 });
  await db.collection("jobs").createIndex({ creator_name: 1, status: 1, createdAt: -1 });
  await db.collection("jobs").createIndex({ category: 1, status: 1, createdAt: -1 });
  await db.collection("corrections").createIndex({ timestamp: -1 });
  await db.collection("presets").createIndex({ user_id: 1 });
  console.log("  ✓ Indexes created");
}

// ── Seed admin ──────────────────────────────────────────────────────
async function seedAdmin(db) {
  const users = db.collection("users");
  const existing = await users.countDocuments({ username: "nesbeer" });
  if (existing > 0) {
    console.log("  ✓ Admin user exists, skipping");
    return;
  }

  const adminPassword = process.env.ADMIN_PASSWORD || "admin";
  const hash = await hashPassword(adminPassword);

  await users.insertOne({
    _id: crypto.randomUUID(),
    username: "nesbeer",
    email: "nesbeer@tiak.app",
    password_hash: hash,
    role: "admin",
    default_preset_id: null,
  });
  console.log("  ✓ Admin user seeded (username: nesbeer, password from ADMIN_PASSWORD env or 'admin')");
}

// ── Confirm ─────────────────────────────────────────────────────────
async function confirm(message) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${message} (y/N) `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y");
    });
  });
}

// ── Main ────────────────────────────────────────────────────────────
async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const keepData = process.argv.includes("--keep-data");
  const fetchMeta = process.argv.includes("--metadata");

  console.log("═══════════════════════════════════════════════");
  console.log("  Tiak DB Rebuild");
  console.log("═══════════════════════════════════════════════\n");

  // 1. Scan filesystem
  console.log("Scanning filesystem...");
  const jobs = scanFilesystem();
  console.log(`  Found ${jobs.length} media files across ${[...new Set(jobs.map(j => j.category))].length} categories\n`);

  if (dryRun) {
    console.log("DRY RUN — would insert:");
    const byCat = {};
    jobs.forEach(j => { byCat[j.category] = (byCat[j.category] || 0) + 1; });
    Object.entries(byCat).sort((a, b) => b[1] - a[1]).forEach(([cat, n]) => {
      console.log(`  ${cat}: ${n}`);
    });
    console.log(`\n  Total: ${jobs.length} jobs`);
    return;
  }

  const uri = loadMongoUri();
  console.log(`Connecting to MongoDB...`);
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db("tiak");
  console.log("  ✓ Connected\n");

  // 2. Drop collections (unless --keep-data)
  if (!keepData) {
    console.log("Dropping existing collections...");
    const collections = await db.listCollections().toArray();
    for (const c of collections) {
      await db.dropCollection(c.name);
      console.log(`  Dropped: ${c.name}`);
    }
    console.log();
  }

  // 3. Create indexes
  console.log("Creating indexes...");
  await createIndexes(db);

  // 4. Seed admin
  console.log("\nSeeding admin user...");
  await seedAdmin(db);

  // 5. Insert jobs
  console.log(`\nInserting ${jobs.length} jobs...`);
  const BATCH = 500;
  for (let i = 0; i < jobs.length; i += BATCH) {
    const batch = jobs.slice(i, i + BATCH);
    await db.collection("jobs").insertMany(batch);
    process.stdout.write(`  ${Math.min(i + BATCH, jobs.length)}/${jobs.length}\r`);
  }
  console.log(`  ✓ ${jobs.length} jobs inserted\n`);

  // 6. Stats
  const totalJobs = await db.collection("jobs").countDocuments();
  const totalUsers = await db.collection("users").countDocuments();
  const categories = await db.collection("jobs").aggregate([
    { $group: { _id: "$category", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 10 },
  ]).toArray();

  console.log("═══════════════════════════════════════════════");
  console.log(`  Jobs    : ${totalJobs}`);
  console.log(`  Users   : ${totalUsers}`);
  console.log("  Top categories:");
  categories.forEach(c => console.log(`    ${c._id}: ${c.count}`));
  console.log("═══════════════════════════════════════════════");

  await client.close();

  // Fetch metadata if requested
  if (fetchMeta && fs.existsSync(path.resolve(__dirname, "../bin/yt-dlp"))) {
    console.log("\n── Fetching metadata ──");
    let cmd = `node "${path.join(__dirname, "fetch_metadata.js")}"`;
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
