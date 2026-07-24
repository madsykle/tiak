#!/usr/bin/env node
/**
 * scan_jobs.js — Dry-run: show what rebuild_db would insert
 *
 * Scans server/data/ and prints a summary without touching MongoDB.
 *
 * Usage:
 *   node scripts/scan_jobs.js
 */

const fs = require("fs");
const path = require("path");

const DATA_ROOT = path.resolve(__dirname, "../data");
const MEDIA_EXTS = new Set([
  ".mp4", ".mkv", ".webm", ".mp3", ".ogg", ".wav",
  ".jpg", ".jpeg", ".png", ".gif", ".webp", ".m4a",
  ".flac", ".aac", ".srt",
]);

const categories = fs.readdirSync(DATA_ROOT).filter((d) => {
  try { return fs.statSync(path.join(DATA_ROOT, d)).isDirectory(); }
  catch { return false; }
}).filter((d) => !d.startsWith("."));

let total = 0;
const summary = [];

for (const cat of categories) {
  const catPath = path.join(DATA_ROOT, cat);
  const dateDirs = fs.readdirSync(catPath).filter((d) => {
    try { return fs.statSync(path.join(catPath, d)).isDirectory(); }
    catch { return false; }
  });

  let count = 0;
  for (const dateDir of dateDirs) {
    const datePath = path.join(catPath, dateDir);
    const files = fs.readdirSync(datePath).filter((f) =>
      MEDIA_EXTS.has(path.extname(f).toLowerCase())
    );
    count += files.length;
  }

  if (count > 0) {
    summary.push({ category: cat, count });
    total += count;
  }
}

summary.sort((a, b) => b.count - a.count);

console.log("═══════════════════════════════════════════════");
console.log("  Tiak Filesystem Scan");
console.log("═══════════════════════════════════════════════\n");

summary.forEach(({ category, count }) => {
  console.log(`  ${count.toString().padStart(4)}  ${category}`);
});

console.log(`\n  Total: ${total} files across ${summary.length} categories`);
console.log("═══════════════════════════════════════════════");
