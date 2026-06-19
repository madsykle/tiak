# Comprehensive UI/UX Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix multiple bugs and overhaul the UI/UX across all pages to improve consistency, aesthetics, and functionality.

**Architecture:** Presentation-focused overhaul with minor logic fixes for disk usage reporting and user isolation. Establishes a shared component for category badges and a unified typography scale.

**Tech Stack:** React, Next.js, Tailwind CSS, Rust (Axum), MongoDB.

---

### Task 1: Backend Logic Fixes (Disk Usage & File Count)

**Files:**
- Modify: `server/src/storage.rs`

**Step 1: Fix `get_disk_usage` to filter system files**
Update `get_disk_usage` to skip `.thumbnails`, `.last_sync`, and `jobs.sqlite*` to match `build_index` logic.

**Step 2: Verify server tests pass**
Run `cd server && cargo test` (Note: ignore Atlas error if persistent, but ensure code compiles).

**Step 3: Commit**
`git add server/src/storage.rs && git commit -m "fix: align disk usage reporting with index filters"`

---

### Task 2: Global Styling & Core Components

**Files:**
- Modify: `web/src/styles/globals.css`
- Create: `web/src/components/CategoryBadge.tsx`
- Modify: `web/src/components/Layout.tsx`

**Step 1: Establish Typography Scale in CSS**
Update `globals.css` to define the 28px/18px/14px/11px scale.

**Step 2: Create Unified CategoryBadge Component**
Implement a reusable component with dark bg, left border accent, and 11px uppercase text.

**Step 3: Update Layout Navigation**
- Hide Admin tab for non-admins.
- Add active indicator (top border accent).
- Add 16px global horizontal padding.

**Step 4: Commit**
`git add web/src/styles/globals.css web/src/components/CategoryBadge.tsx web/src/components/Layout.tsx && git commit -m "style: establish global type scale and unified navigation"`

---

### Task 3: Files Page Overhaul

**Files:**
- Modify: `web/src/components/FileCard.tsx`
- Modify: `web/src/pages/files.tsx`

**Step 1: Rework FileCard Component**
- Update aspect ratio to 9:16.
- Show @creator and truncated caption below thumbnail.
- Move category badge to top-right overlay.
- Remove redundant filename row.
- Add filename fallback if metadata is null.

**Step 2: Update Files Grid Layout**
Increase gap to 12px (3 units).

**Step 3: Commit**
`git add web/src/components/FileCard.tsx web/src/pages/files.tsx && git commit -m "feat: overhaul files page grid and card layout"`

---

### Task 4: History Page Enhancement

**Files:**
- Modify: `web/src/components/HistoryTable.tsx`

**Step 1: Add new columns to HistoryTable**
Add Creator, Caption, Platform, and Status columns.

**Step 2: Implement Click-to-Expand**
Make rows clickable to show full details/error messages.

**Step 3: Commit**
`git add web/src/components/HistoryTable.tsx && git commit -m "feat: enhance history table with metadata and expandable rows"`

---

### Task 4: Queue Page & Sync Status

**Files:**
- Modify: `web/src/pages/index.tsx`

**Step 1: Redesign Input Area**
Wrap URL textarea and Category selector in a single card. Style Category as a dropdown inside the card.

**Step 2: Platform Autodetect**
Show YouTube/TikTok/Instagram icon when URL is pasted.

**Step 3: Fix Sync Badge Logic**
Hide/gray out "new files waiting to sync" when sync is running.

**Step 4: Empty State UI**
Replace plain text with Icon + shortcut tip for "Queue is empty".

**Step 5: Commit**
`git add web/src/pages/index.tsx && git commit -m "feat: redesign queue input and improve sync status feedback"`

---

### Task 5: Admin & Settings Cleanup

**Files:**
- Modify: `web/src/pages/admin.tsx`
- Modify: `web/src/components/settings/CategorySettingsSection.tsx`
- Modify: `web/src/components/settings/CloudSyncSection.tsx`

**Step 1: Update User Directory UI**
Use colored pills for roles. Add user count summary. Filter out `test_` users in production (simulated via env).

**Step 2: Categories Reordering**
Implement basic drag-to-reorder (or simple up/down move if dnd-kit is too complex for this turn). Show video counts.

**Step 3: Theme Polish**
Update cloud sync input to dark muted background. Replace heavy warning banners with subtle inline variants.

**Step 4: Commit**
`git add web/src/pages/admin.tsx web/src/components/settings/CategorySettingsSection.tsx web/src/components/settings/CloudSyncSection.tsx && git commit -m "feat: polish admin directory and category settings"`
