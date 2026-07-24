#!/usr/bin/env node
/**
 * reindex.js — Recreate all MongoDB indexes without touching data
 *
 * Safe to run repeatedly. Idempotent.
 *
 * Usage:
 *   node scripts/reindex.js
 */

const { MongoClient } = require("mongodb");
const fs = require("fs");
const path = require("path");

function loadMongoUri() {
  const envPath = path.resolve(__dirname, "../.env");
  if (fs.existsSync(envPath)) {
    const env = fs.readFileSync(envPath, "utf8");
    const match = env.match(/^MONGODB_URI=(.+)$/m);
    if (match) return match[1].trim();
  }
  return process.env.MONGODB_URI || "mongodb://localhost:27017/tiak";
}

async function main() {
  const uri = loadMongoUri();
  console.log("═══════════════════════════════════════════════");
  console.log("  Tiak DB Reindex");
  console.log("═══════════════════════════════════════════════\n");

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db("tiak");

  console.log("Recreating indexes...\n");

  // Drop ALL non-_id indexes first, then recreate cleanly
  for (const collName of ["users", "jobs", "corrections", "presets"]) {
    const existing = await db.collection(collName).listIndexes().toArray();
    for (const idx of existing) {
      if (idx.name === "_id_") continue;
      try { await db.collection(collName).dropIndex(idx.name); } catch {}
    }
  }
  console.log("  Cleared old indexes\n");

  const indexes = [
    { coll: "users",        idx: { username: 1 },              opts: { unique: true, name: "username_unique" } },
    { coll: "users",        idx: { email: 1 },                  opts: { unique: true, name: "email_unique" } },
    { coll: "jobs",         idx: { status: 1, createdAt: 1 },   opts: { name: "status_created" } },
    { coll: "jobs",         idx: { category: 1, platform: 1 },  opts: { name: "category_platform" } },
    { coll: "jobs",         idx: { platform: 1 },               opts: { name: "platform" } },
    { coll: "jobs",         idx: { user_id: 1 },                opts: { name: "user_id" } },
    { coll: "jobs",         idx: { completedAt: -1 },           opts: { name: "completed_desc" } },
    { coll: "jobs",         idx: { url: 1, status: 1 },         opts: { name: "url_status" } },
    { coll: "jobs",         idx: { expiresAt: 1 },              opts: { name: "expires" } },
    { coll: "jobs",         idx: { filename: 1 },               opts: { name: "filename" } },
    { coll: "jobs",         idx: { creator_name: 1, status: 1, createdAt: -1 }, opts: { name: "creator_status_created" } },
    { coll: "jobs",         idx: { category: 1, status: 1, createdAt: -1 },     opts: { name: "cat_status_created" } },
    { coll: "corrections",  idx: { timestamp: -1 },             opts: { name: "timestamp_desc" } },
    { coll: "presets",      idx: { user_id: 1 },                opts: { name: "user_id" } },
  ];

  for (const { coll, idx, opts } of indexes) {
    await db.collection(coll).createIndex(idx, opts);
    console.log(`  ✓ ${coll}.${opts.name}`);
  }

  // Drop stale indexes (anything not in our list)
  const knownJobIndexes = new Set(indexes.filter(i => i.coll === "jobs").map(i => i.opts.name));
  knownJobIndexes.add("_id_"); // default

  const currentJobIndexes = await db.collection("jobs").listIndexes().toArray();
  for (const idx of currentJobIndexes) {
    if (!knownJobIndexes.has(idx.name)) {
      await db.collection("jobs").dropIndex(idx.name);
      console.log(`  ✗ Dropped stale: jobs.${idx.name}`);
    }
  }

  console.log("\n═══════════════════════════════════════════════");
  console.log("  Done");
  console.log("═══════════════════════════════════════════════");

  await client.close();
}

main().catch((e) => {
  console.error("Fatal:", e.message);
  process.exit(1);
});
