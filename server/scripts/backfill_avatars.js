const { MongoClient } = require("mongodb");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const MONGO_URI = "mongodb://localhost:27017/tiak";
const YT_DLP = path.join(__dirname, "../bin/yt-dlp");
const PROGRESS_FILE = path.join(__dirname, "avatar_progress.json");
const FAILURES_FILE = path.join(__dirname, "avatar_failures.json");

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
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

function fetchMetadata(url) {
  const cmd = `"${YT_DLP}" --dump-json --no-warnings --no-playlist --extractor-retries 2 --proxy socks5://127.0.0.1:9746 "${url}"`;
  const output = execSync(cmd, {
    encoding: "utf-8",
    timeout: 45000,
    stdio: ["pipe", "pipe", "pipe"],
  });
  return JSON.parse(output.trim());
}

async function processJob(jobs, job, done, idx, total) {
  if (!job.url) {
    console.log(`  [${idx}/${total}] SKIP (no URL): ${job.filename}`);
    done.add(job._id);
    saveProgress(done);
    return;
  }

  process.stdout.write(`  [${idx}/${total}] ${job.filename} … `);

  try {
    const data = fetchMetadata(job.url);

    const creatorAvatar = data.uploader_thumbnail || data.channel_thumbnail || data.avatar || data.thumbnail || null;

    if (!creatorAvatar) {
      console.log(`⊘ no avatar in metadata`);
      done.add(job._id);
      saveProgress(done);
      return;
    }

    await jobs.updateOne({ _id: job._id }, { $set: { creator_avatar: creatorAvatar } });
    console.log(`✓ got avatar`);
    done.add(job._id);
    saveProgress(done);
  } catch (err) {
    const reason = err.message?.split("\n")[0] || String(err);
    console.log(`✗ FAILED (${reason.slice(0, 80)})`);
    saveFailure(job._id, job.filename, reason);
    done.add(job._id);
    saveProgress(done);
  }
}

async function run() {
  if (!fs.existsSync(YT_DLP)) {
    console.error(`yt-dlp not found at: ${YT_DLP}`);
    process.exit(1);
  }

  const client = new MongoClient(MONGO_URI);
  try {
    await client.connect();
    console.log("✓ Connected to MongoDB\n");

    const jobs = client.db("tiak").collection("jobs");

    const pending = await jobs
      .find({
        platform: "tiktok",
        creator_name: { $nin: [null, "", "unknown"] },
        $or: [
          { creator_avatar: null },
          { creator_avatar: "" },
        ],
      })
      .toArray();

    const done = loadProgress();
    const remaining = pending.filter((j) => !done.has(j._id));

    console.log(`Missing avatar     : ${pending.length}`);
    console.log(`Already done      : ${done.size}`);
    console.log(`To process        : ${remaining.length}`);
    console.log(`Concurrency       : 1 (serial)`);
    console.log(`Delay between req : 3000ms\n`);

    if (remaining.length === 0) {
      console.log("Nothing to do — all have avatars.");
      return;
    }

    let idx = done.size;
    const total = pending.length;

    for (let i = 0; i < remaining.length; i++) {
      await processJob(jobs, remaining[i], done, ++idx, total);
      if (i + 1 < remaining.length) {
        await sleep(3000);
      }
    }

    const failures = loadFailures();
    const goodAvatar = await jobs.countDocuments({
      platform: "tiktok",
      creator_avatar: { $nin: [null, ""] },
    });

    console.log("\n════════════════════════════════");
    console.log(`  Processed : ${remaining.length}`);
    console.log(`  Good avatar: ${goodAvatar}`);
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
