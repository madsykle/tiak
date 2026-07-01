/**
 * backfill_tiktok_metadata.js
 *
 * For every job in MongoDB with platform=tiktok and no real URL,
 * constructs a TikTok URL from the numeric filename, fetches metadata
 * via yt-dlp, and updates the record with:
 *   - url
 *   - creator_name
 *   - creator_avatar
 *   - caption
 *   - hashtags
 *
 * Features:
 *   - Concurrency limit (default 2) to avoid rate-limiting
 *   - Delay between requests (default 2s)
 *   - Skips jobs that already have a real URL
 *   - Saves progress to backfill_progress.json so you can resume
 *   - Logs failures to backfill_failures.json for manual review
 *
 * Run from inside server/:
 *   node backfill_tiktok_metadata.js
 *
 * Resume after interrupt:
 *   node backfill_tiktok_metadata.js
 *   (progress file is checked automatically)
 */

const { MongoClient } = require("mongodb");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// ── Config ────────────────────────────────────────────────────────────────
const MONGO_URI       = "mongodb://localhost:27017/tiak";
const YT_DLP          = path.join(__dirname, "venv_python/bin/yt-dlp");
const CONCURRENCY     = 2;       // parallel yt-dlp calls
const DELAY_MS        = 2000;    // ms between each request
const TIMEOUT_SEC     = 30;      // yt-dlp timeout per video
const PROGRESS_FILE   = path.join(__dirname, "backfill_progress.json");
const FAILURES_FILE   = path.join(__dirname, "backfill_failures.json");

// ── Helpers ───────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function loadProgress() {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      return new Set(JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf8")));
    }
  } catch (_) {}
  return new Set();
}

function saveProgress(done) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify([...done]), "utf8");
}

function loadFailures() {
  try {
    if (fs.existsSync(FAILURES_FILE)) {
      return JSON.parse(fs.readFileSync(FAILURES_FILE, "utf8"));
    }
  } catch (_) {}
  return [];
}

function saveFailure(id, filename, reason) {
  const failures = loadFailures();
  failures.push({ id, filename, reason, time: new Date().toISOString() });
  fs.writeFileSync(FAILURES_FILE, JSON.stringify(failures, null, 2), "utf8");
}

/**
 * Extract the TikTok video ID from a filename like "7593739294276193558.mp4"
 */
function tiktokIdFromFilename(filename) {
  const match = filename.match(/^(\d{15,21})\.mp4$/i);
  return match ? match[1] : null;
}

/**
 * Fetch metadata for a TikTok video ID using yt-dlp.
 * Returns parsed JSON or throws on failure.
 */
function fetchTikTokMeta(videoId) {
  const url = `https://www.tiktok.com/@placeholder/video/${videoId}`;
  const cmd = `"${YT_DLP}" --dump-json --no-warnings --no-playlist --socket-timeout ${TIMEOUT_SEC} "${url}"`;
  const output = execSync(cmd, {
    encoding: "utf-8",
    timeout: (TIMEOUT_SEC + 5) * 1000,
    stdio: ["pipe", "pipe", "pipe"],
  });
  return JSON.parse(output.trim());
}

/**
 * Process a single job: fetch metadata and update MongoDB.
 */
async function processJob(jobs, job, done, idx, total) {
  const videoId = tiktokIdFromFilename(job.filename);
  if (!videoId) {
    console.log(`  [${idx}/${total}] SKIP (no TikTok ID): ${job.filename}`);
    done.add(job._id);
    return;
  }

  const url = `https://www.tiktok.com/@placeholder/video/${videoId}`;
  process.stdout.write(`  [${idx}/${total}] ${job.category}/${job.filename} … `);

  try {
    const meta = fetchTikTokMeta(videoId);

    const creatorName   = meta.uploader || meta.creator || meta.channel || null;
    const creatorAvatar = meta.thumbnail || null;
    const caption       = meta.description || meta.title || null;
    const hashtags      = Array.isArray(meta.tags) && meta.tags.length
      ? meta.tags
      : (caption ? (caption.match(/#\w+/g) || null) : null);
    const realUrl       = meta.webpage_url || url;

    await jobs.updateOne(
      { _id: job._id },
      {
        $set: {
          url:            realUrl,
          creator_name:   creatorName,
          creator_avatar: creatorAvatar,
          caption:        caption,
          hashtags:       hashtags,
        },
      }
    );

    console.log(`✓ ${creatorName || "unknown"}`);
    done.add(job._id);
  } catch (err) {
    const reason = err.message?.split("\n")[0] || String(err);
    console.log(`✗ FAILED (${reason.slice(0, 80)})`);
    saveFailure(job._id, job.filename, reason);
    done.add(job._id); // mark done so we don't retry on resume (failures are in failures file)
  }
}

// ── Main ──────────────────────────────────────────────────────────────────
async function run() {
  // Sanity check yt-dlp
  if (!fs.existsSync(YT_DLP)) {
    console.error(`yt-dlp not found at: ${YT_DLP}`);
    process.exit(1);
  }

  const client = new MongoClient(MONGO_URI);
  try {
    await client.connect();
    console.log("✓ Connected to MongoDB\n");

    const jobs = client.db("tiak").collection("jobs");

    // Fetch all TikTok jobs that still have no real URL
    const pending = await jobs
      .find({
        platform: "tiktok",
        $or: [
          { url: "recovered-from-disk" },
          { url: null },
          { url: "" },
        ],
      })
      .toArray();

    const done = loadProgress();
    const remaining = pending.filter(j => !done.has(j._id));

    console.log(`Total TikTok jobs : ${pending.length}`);
    console.log(`Already done      : ${done.size}`);
    console.log(`To process        : ${remaining.length}`);
    console.log(`Concurrency       : ${CONCURRENCY}`);
    console.log(`Delay between req : ${DELAY_MS}ms\n`);

    if (remaining.length === 0) {
      console.log("Nothing to do — all TikTok jobs already processed.");
      return;
    }

    let idx = done.size;
    const total = pending.length;

    // Process in chunks of CONCURRENCY
    for (let i = 0; i < remaining.length; i += CONCURRENCY) {
      const chunk = remaining.slice(i, i + CONCURRENCY);

      await Promise.all(
        chunk.map((job, offset) => {
          idx++;
          return processJob(jobs, job, done, idx - offset + offset, total);
        })
      );

      // Save progress after every chunk
      saveProgress(done);

      // Delay before next chunk (skip after last)
      if (i + CONCURRENCY < remaining.length) {
        await sleep(DELAY_MS);
      }
    }

    // ── Final summary ─────────────────────────────────────────────────────
    const failures = loadFailures();
    const updated = await jobs.countDocuments({
      platform: "tiktok",
      url: { $nin: ["recovered-from-disk", null, ""] },
    });

    console.log("\n════════════════════════════════");
    console.log(`  Processed : ${remaining.length}`);
    console.log(`  Updated   : ${updated} total with real URL`);
    console.log(`  Failures  : ${failures.length}`);
    if (failures.length > 0) {
      console.log(`  → See ${FAILURES_FILE} for details`);
    }
    console.log("════════════════════════════════");

  } catch (e) {
    console.error("Fatal:", e.message);
  } finally {
    await client.close();
  }
}

run();
