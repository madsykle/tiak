/**
 * rebuild_db_proper.js
 *
 * Walks server/data/CATEGORY/YYYY-MM-DD/*.mp4 and inserts a proper
 * job record for every video file that isn't already in the DB.
 *
 * Platform detection:
 *   - Pure 19-digit numeric filename  → tiktok
 *   - Contains "instagram" / "ig"     → instagram
 *   - Contains "youtube" / "yt"       → youtube
 *   - Everything else                 → unknown
 *
 * Timestamps: derived from the date folder name (YYYY-MM-DD) at noon UTC,
 * then overridden by the file's actual mtime if available.
 *
 * Run from inside server/:
 *   node rebuild_db_proper.js
 */

const { MongoClient } = require("mongodb");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const MONGO_URI = "mongodb://localhost:27017";
const DB_NAME = "tiak";
const DATA_DIR = path.join(__dirname, "data");

// ── Platform detection ─────────────────────────────────────────────────────
const RE_TIKTOK_ID = /^\d{15,21}\.mp4$/i;          // pure numeric TikTok ID
const RE_INSTAGRAM = /instagram|^ig_/i;
const RE_YOUTUBE   = /youtube|youtu|^yt_/i;

function detectPlatform(filename) {
  if (RE_TIKTOK_ID.test(filename))    return "tiktok";
  if (RE_INSTAGRAM.test(filename))    return "instagram";
  if (RE_YOUTUBE.test(filename))      return "youtube";
  return "unknown";
}

// ── Date folder → epoch ms at noon UTC ────────────────────────────────────
function folderDateToMs(dateFolder) {
  // dateFolder format: "YYYY-MM-DD"
  const d = new Date(`${dateFolder}T12:00:00.000Z`);
  return isNaN(d.getTime()) ? Date.now() : d.getTime();
}

// ── Caption from filename (strip extension, clean up) ─────────────────────
function captionFromFilename(filename) {
  const base = filename.replace(/\.[^/.]+$/, ""); // strip extension
  // If it's a pure TikTok numeric ID, leave caption blank so the UI
  // can show "untitled" rather than a meaningless number
  if (/^\d{15,21}$/.test(base)) return null;
  return base;
}

// ── Main ──────────────────────────────────────────────────────────────────
async function run() {
  const client = new MongoClient(MONGO_URI);
  try {
    await client.connect();
    console.log("✓ Connected to MongoDB");

    const db = client.db(DB_NAME);
    const jobs = db.collection("jobs");
    const users = db.collection("users");

    // ── Ensure admin user ──────────────────────────────────────────────────
    const userCount = await users.countDocuments({ username: "nesbeer" });
    if (userCount === 0) {
      await users.insertOne({
        _id: crypto.randomUUID(),
        username: "nesbeer",
        email: "nesbeer@localhost",
        password_hash: "admin",
        role: "admin",
        default_preset_id: null,
      });
      console.log("  Re-seeded nesbeer admin user");
    } else {
      console.log("  Admin user already exists");
    }

    // ── Build lookup of already-indexed basenames for fast dedup ──────────
    console.log("  Building existing filename index…");
    const existingCursor = jobs.find(
      { filename: { $ne: null, $ne: "" } },
      { projection: { filename: 1, category: 1 } }
    );
    const existingSet = new Set();
    for await (const doc of existingCursor) {
      if (doc.filename) existingSet.add(doc.filename);
    }
    console.log(`  Found ${existingSet.size} already-indexed files`);

    // ── Walk the data directory ────────────────────────────────────────────
    let inserted = 0;
    let skipped  = 0;
    let errors   = 0;
    const toInsert = [];

    const categoryDirs = fs.readdirSync(DATA_DIR, { withFileTypes: true });

    for (const catEnt of categoryDirs) {
      if (!catEnt.isDirectory()) continue;
      if (catEnt.name.startsWith(".")) continue;  // skip .thumbnails etc.

      const category = catEnt.name;
      const categoryPath = path.join(DATA_DIR, category);

      const dateDirs = fs.readdirSync(categoryPath, { withFileTypes: true });

      for (const dateEnt of dateDirs) {
        if (!dateEnt.isDirectory()) continue;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateEnt.name)) continue; // must be YYYY-MM-DD

        const dateFolder = dateEnt.name;
        const datePath   = path.join(categoryPath, dateFolder);
        const dateMs     = folderDateToMs(dateFolder);

        let fileEntries;
        try {
          fileEntries = fs.readdirSync(datePath, { withFileTypes: true });
        } catch (e) {
          console.warn(`  ! Can't read ${datePath}: ${e.message}`);
          errors++;
          continue;
        }

        for (const fileEnt of fileEntries) {
          if (!fileEnt.isFile()) continue;
          const filename = fileEnt.name;

          // Only process media files
          if (!/\.(mp4|mov|webm|mkv|avi)$/i.test(filename)) continue;

          // Dedup check — filename is stored as basename only
          if (existingSet.has(filename)) {
            skipped++;
            continue;
          }

          // File stat for accurate timestamps
          let mtime = dateMs;
          try {
            const stat = fs.statSync(path.join(datePath, filename));
            mtime = stat.mtimeMs;
            // If mtime is wildly in the future (>1 day from now), fall back to date folder
            if (mtime > Date.now() + 86_400_000) mtime = dateMs;
          } catch (_) {
            // use folder date
          }

          const platform = detectPlatform(filename);
          const caption  = captionFromFilename(filename);

          toInsert.push({
            _id:          crypto.randomUUID(),
            url:          "recovered-from-disk",
            status:       "done",
            progress:     100,
            eta:          null,
            filename:     filename,          // basename only, matching the app convention
            createdAt:    dateMs,            // date folder → created time
            startedAt:    dateMs,
            completedAt:  mtime,             // mtime → completed time
            retries:      0,
            error:        null,
            category:     category,
            platform:     platform,
            creator_name: null,
            creator_avatar: null,
            caption:      caption,
            transcript:   null,
            hashtags:     null,
            suggested_category: null,
            visual_description: null,
            expiresAt:    null,
            user_id:      "nesbeer",
            preset_id:    null,
          });

          existingSet.add(filename); // prevent same-session dups
        }
      }
    }

    // ── Bulk insert in batches of 200 ─────────────────────────────────────
    if (toInsert.length > 0) {
      const BATCH = 200;
      for (let i = 0; i < toInsert.length; i += BATCH) {
        const batch = toInsert.slice(i, i + BATCH);
        await jobs.insertMany(batch, { ordered: false });
        inserted += batch.length;
        process.stdout.write(`\r  Inserted ${inserted}/${toInsert.length}…`);
      }
      console.log();
    }

    // ── Summary ───────────────────────────────────────────────────────────
    const total = await jobs.countDocuments();
    console.log();
    console.log("════════════════════════════════");
    console.log(`  Inserted : ${toInsert.length}`);
    console.log(`  Skipped  : ${skipped}  (already existed)`);
    console.log(`  Errors   : ${errors}`);
    console.log(`  Total DB : ${total} jobs`);
    console.log("════════════════════════════════");

    // ── Platform breakdown ────────────────────────────────────────────────
    const platforms = await jobs.aggregate([
      { $group: { _id: "$platform", count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]).toArray();
    console.log("\nPlatform breakdown:");
    for (const p of platforms) {
      console.log(`  ${p._id || "null"}: ${p.count}`);
    }

  } catch (e) {
    console.error("Fatal error:", e);
  } finally {
    await client.close();
  }
}

run();
