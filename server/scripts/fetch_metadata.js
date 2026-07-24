#!/usr/bin/env node
/**
 * fetch_metadata.js — Backfill metadata via yt-dlp
 *
 * Finds jobs missing metadata (creator_name, caption, etc.) and fetches
 * it from TikTok/YouTube/Instagram using yt-dlp --dump-json.
 *
 * Usage:
 *   node scripts/fetch_metadata.js [--limit N] [--platform tiktok] [--proxy socks5://127.0.0.1:9746]
 *
 * Options:
 *   --limit N         Max jobs to process (default: all)
 *   --platform X      Only process this platform (tiktok, youtube, instagram)
 *   --proxy URL       Proxy for yt-dlp (default: none)
 *   --delay MS        Delay between requests in ms (default: 2000)
 *   --force           Re-fetch even if metadata already exists
 */

const { MongoClient } = require("mongodb");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// ── Config ──────────────────────────────────────────────────────────
const YT_DLP = path.resolve(__dirname, "../bin/yt-dlp");
const PROGRESS_FILE = path.resolve(__dirname, "metadata_progress.json");
const FAILURES_FILE = path.resolve(__dirname, "metadata_failures.json");

// ── Parse args ──────────────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { limit: Infinity, platform: null, proxy: null, delay: 2000, force: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--limit") opts.limit = parseInt(args[++i], 10);
    if (args[i] === "--platform") opts.platform = args[++i];
    if (args[i] === "--proxy") opts.proxy = args[++i];
    if (args[i] === "--delay") opts.delay = parseInt(args[++i], 10);
    if (args[i] === "--force") opts.force = true;
  }
  return opts;
}

function loadMongoUri() {
  const envPath = path.resolve(__dirname, "../.env");
  if (fs.existsSync(envPath)) {
    const env = fs.readFileSync(envPath, "utf8");
    const match = env.match(/^MONGODB_URI=(.+)$/m);
    if (match) return match[1].trim();
  }
  return process.env.MONGODB_URI || "mongodb://localhost:27017/tiak";
}

// ── Progress tracking ───────────────────────────────────────────────
function loadProgress() {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      return new Set(JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf8")));
    }
  } catch {}
  return new Set();
}

function saveProgress(done) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify([...done]));
}

function loadFailures() {
  try {
    if (fs.existsSync(FAILURES_FILE)) {
      return JSON.parse(fs.readFileSync(FAILURES_FILE, "utf8"));
    }
  } catch {}
  return [];
}

function saveFailure(id, filename, reason) {
  const failures = loadFailures();
  failures.push({ id, filename, reason, time: new Date().toISOString() });
  fs.writeFileSync(FAILURES_FILE, JSON.stringify(failures, null, 2));
}

// ── yt-dlp ──────────────────────────────────────────────────────────
function tiktokUrl(filename) {
  const basename = path.basename(filename, path.extname(filename));
  const match = basename.match(/(\d{15,21})/);
  if (match) return `https://www.tiktok.com/@unknown/video/${match[1]}`;
  return null;
}

function detectPlatform(filename) {
  const basename = path.basename(filename, path.extname(filename));
  if (/^\d{15,21}$/.test(basename)) return "tiktok";
  if (/^[A-Za-z0-9_-]{11}$/.test(basename)) return "youtube";
  return null;
}

function youtubeUrl(filename) {
  const basename = path.basename(filename, path.extname(filename));
  // YouTube IDs are 11 chars
  const match = basename.match(/^([A-Za-z0-9_-]{11})$/);
  if (match) return `https://www.youtube.com/watch?v=${match[1]}`;
  return null;
}

function buildUrl(job) {
  if (job.url && job.url !== "" && job.url !== "recovered-from-disk") return job.url;
  // Detect platform from filename if not set
  const platform = job.platform || detectPlatform(job.filename);
  if (platform === "tiktok") return tiktokUrl(job.filename);
  if (platform === "youtube") return youtubeUrl(job.filename);
  // Fallback: try tiktok pattern anyway
  return tiktokUrl(job.filename);
}

function fetchMetadata(url, proxy) {
  let cmd = `"${YT_DLP}" --dump-json --no-warnings --no-playlist --extractor-retries 3 --retry-sleep extractor:1`;
  if (proxy) cmd += ` --proxy ${proxy}`;
  cmd += ` "${url}"`;

  const output = execSync(cmd, {
    encoding: "utf-8",
    timeout: 45000,
    stdio: ["pipe", "pipe", "pipe"],
  });
  return JSON.parse(output.trim());
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Process one job ─────────────────────────────────────────────────
async function processJob(collection, job, opts, idx, total) {
  const url = buildUrl(job);
  if (!url) {
    console.log(`  [${idx}/${total}] SKIP (no URL): ${job.filename}`);
    return false;
  }

  process.stdout.write(`  [${idx}/${total}] ${job.category}/${path.basename(job.filename)} … `);

  try {
    const data = fetchMetadata(url, opts.proxy);

    const update = {
      url: data.webpage_url || url,
      creator_name: data.uploader || data.creator || data.channel || null,
      creator_avatar: data.uploader_thumbnail || data.channel_thumbnail || data.thumbnail || null,
      caption: data.description || data.title || null,
      hashtags: Array.isArray(data.tags) && data.tags.length
        ? data.tags.join(", ")
        : null,
      platform: data.extractor?.toLowerCase() || job.platform,
    };

    // Extract hashtags from caption if tags array was empty
    if (!update.hashtags && update.caption) {
      const tagMatch = update.caption.match(/#[\w]+/g);
      if (tagMatch) update.hashtags = tagMatch.join(", ");
    }

    await collection.updateOne({ _id: job._id }, { $set: update });
    console.log(`✓ ${update.creator_name || "unknown"}`);
    return true;
  } catch (err) {
    const reason = (err.message || "").split("\n")[0].slice(0, 120);
    console.log(`✗ ${reason}`);
    saveFailure(job._id, job.filename, reason);
    return false;
  }
}

// ── Main ────────────────────────────────────────────────────────────
async function main() {
  const opts = parseArgs();

  if (!fs.existsSync(YT_DLP)) {
    console.error(`yt-dlp not found at: ${YT_DLP}`);
    console.error("Run ./install_deps.sh first");
    process.exit(1);
  }

  console.log("═══════════════════════════════════════════════");
  console.log("  Tiak Metadata Fetcher");
  console.log("═══════════════════════════════════════════════\n");

  const uri = loadMongoUri();
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db("tiak");
  const jobs = db.collection("jobs");

  // Build query: jobs missing metadata
  const query = { status: "done" };
  if (opts.platform) query.platform = opts.platform;

  if (!opts.force) {
    query.$or = [
      { creator_name: null },
      { creator_name: "" },
      { creator_name: "unknown" },
      { caption: null },
      { caption: "" },
    ];
    // Include jobs with placeholder URLs
    query.$or.push({ url: "" }, { url: null }, { url: "recovered-from-disk" });
  }

  const pending = await jobs.find(query).sort({ createdAt: -1 }).limit(opts.limit).toArray();

  // Filter out already-processed (progress tracking)
  const done = loadProgress();
  const remaining = pending.filter((j) => !done.has(j._id));

  console.log(`Pending    : ${pending.length}`);
  console.log(`Done       : ${done.size}`);
  console.log(`To process : ${remaining.length}`);
  console.log(`Platform   : ${opts.platform || "all"}`);
  console.log(`Proxy      : ${opts.proxy || "direct"}`);
  console.log(`Delay      : ${opts.delay}ms`);
  console.log();

  if (remaining.length === 0) {
    console.log("Nothing to do.");
    await client.close();
    return;
  }

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < remaining.length; i++) {
    const ok = await processJob(jobs, remaining[i], opts, i + 1, remaining.length);
    done.add(remaining[i]._id);
    saveProgress(done);

    if (ok) successCount++;
    else failCount++;

    if (i + 1 < remaining.length) await sleep(opts.delay);
  }

  const failures = loadFailures();
  const totalWithMeta = await jobs.countDocuments({
    creator_name: { $nin: [null, ""] },
  });

  console.log("\n═══════════════════════════════════════════════");
  console.log(`  Processed : ${remaining.length}`);
  console.log(`  Success   : ${successCount}`);
  console.log(`  Failed    : ${failCount}`);
  console.log(`  Total w/ creator : ${totalWithMeta}`);
  if (failures.length > 0) {
    console.log(`  → See ${FAILURES_FILE}`);
  }
  console.log("═══════════════════════════════════════════════");

  await client.close();
}

main().catch((e) => {
  console.error("Fatal:", e.message);
  process.exit(1);
});
