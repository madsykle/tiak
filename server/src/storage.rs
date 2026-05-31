use anyhow::{anyhow, Result};
use chrono::{DateTime, Local, Utc};
use regex::Regex;
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, OnceLock, RwLock};
use std::time::SystemTime;
use walkdir::WalkDir;

static DATE_REGEX: OnceLock<Regex> = OnceLock::new();
static WHITESPACE_REGEX: OnceLock<Regex> = OnceLock::new();

fn date_regex() -> &'static Regex {
    DATE_REGEX.get_or_init(|| Regex::new(r"^\d{4}-\d{2}-\d{2}$").unwrap())
}
fn whitespace_regex() -> &'static Regex {
    WHITESPACE_REGEX.get_or_init(|| Regex::new(r"\s+").unwrap())
}

/// Validates and canonicalizes a file path, ensuring it stays within DATA_ROOT.
/// Returns the canonical path on success, or an error if the path is outside data root.
pub fn validate_data_path(path_str: &str) -> Result<PathBuf> {
    let abs_path = Path::new(path_str)
        .canonicalize()
        .map_err(|_| anyhow!("Path does not exist or cannot be resolved: {}", path_str))?;
    let data_root = Path::new(DATA_ROOT)
        .canonicalize()
        .map_err(|_| anyhow!("DATA_ROOT does not exist"))?;
    if !abs_path.starts_with(&data_root) {
        return Err(anyhow!("Access denied: path outside data root"));
    }
    Ok(abs_path)
}

pub const DATA_ROOT: &str = "data";
pub const THUMBNAILS_ROOT: &str = "data/.thumbnails";
pub const DEFAULT_CATEGORY: &str = "default";

#[derive(Debug, Clone, Serialize)]
pub struct FileItem {
    pub path: String,
    pub name: String,
    pub size: u64,
    #[serde(rename = "createdAt")]
    pub created_at: DateTime<Utc>,
    #[serde(rename = "dateFolder")]
    pub date_folder: String,
    pub category: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct FileIndexResponse {
    #[serde(rename = "byDate")]
    pub by_date: std::collections::HashMap<String, Vec<FileItem>>, // Kept for backward compat, or maybe grouped by Category -> Date?
    #[serde(rename = "byCategory")]
    pub by_category:
        std::collections::HashMap<String, std::collections::HashMap<String, Vec<FileItem>>>,
    #[serde(rename = "lastScan")]
    pub last_scan: i64,
}

#[derive(Clone)]
pub struct FileIndex {
    files: Arc<RwLock<Vec<FileItem>>>,
    last_scan: Arc<RwLock<i64>>,
    cached_index: Arc<RwLock<Option<FileIndexResponse>>>,
}

impl FileIndex {
    pub fn new() -> Self {
        // Run migration on startup
        if let Err(e) = migrate_storage() {
            tracing::error!("Storage migration failed: {}", e);
        }

        Self {
            files: Arc::new(RwLock::new(Vec::new())),
            last_scan: Arc::new(RwLock::new(0)),
            cached_index: Arc::new(RwLock::new(None)),
        }
    }

    pub async fn build_index(&self) -> Result<()> {
        let root = Path::new(DATA_ROOT);
        let mut files = Vec::new();
        let timestamp = Utc::now().timestamp_millis();

        if root.exists() {
            let root_path = root.canonicalize().unwrap_or(root.to_path_buf());
            // Use a dedicated thread pool for filesystem I/O
            let entries = tokio::task::spawn_blocking(move || {
                let mut res = Vec::new();
                let date_regex = date_regex();

                // Read categories - collect first to avoid nested loops
                if let Ok(cats) = std::fs::read_dir(&root_path) {
                    let categories: Vec<(String, PathBuf)> = cats
                        .filter_map(|e| e.ok())
                        .filter(|entry| entry.path().is_dir())
                        .filter_map(|entry| {
                            let category = entry.file_name().to_string_lossy().to_string();
                            if category.starts_with('.') {
                                None // skip hidden folders like .thumbnails, .last_sync
                            } else {
                                Some((category, entry.path()))
                            }
                        })
                        .collect();

                    for (category, cat_path) in categories {
                        let walker = WalkDir::new(&cat_path)
                            .min_depth(1)
                            .max_depth(4) // data/category/date/file - limit depth for safety
                            .into_iter()
                            .filter_map(|e| e.ok())
                            .filter(|e| e.file_type().is_file());

                        for entry in walker {
                            let path = entry.path();
                            let name = entry.file_name().to_string_lossy().to_string();

                            // Skip system files
                            if name.contains("jobs.sqlite") || name == ".last_sync" {
                                continue;
                            }

                            if let Ok(meta) = entry.metadata() {
                                let size = meta.len();
                                let created: DateTime<Utc> =
                                    meta.created().unwrap_or(SystemTime::now()).into();

                                // Calculate dateFolder relative to DATA_ROOT
                                // Path: data/<category>/<date>/<file>
                                // Date folder is relative to category
                                let relative_to_cat = path.strip_prefix(&cat_path).unwrap_or(path);
                                let mut date_folder = relative_to_cat
                                    .components()
                                    .next()
                                    .map(|c| c.as_os_str().to_string_lossy().to_string())
                                    .unwrap_or_default();

                                // Check if date_folder is valid YYYY-MM-DD
                                // If not (e.g. file is in root of category), use created_at to simulate a date folder for grouping
                                if !date_regex.is_match(&date_folder) {
                                    date_folder = created.format("%Y-%m-%d").to_string();
                                }

                                res.push(FileItem {
                                    path: path.to_string_lossy().to_string(),
                                    name,
                                    size,
                                    created_at: created,
                                    date_folder,
                                    category: category.clone(),
                                });
                            }
                        }
                    }
                }
                res
            })
            .await?;
            files = entries;
        }

        // Update files and clear cache
        {
            let mut w = self.files.write().unwrap();
            *w = files;
        }
        {
            let mut t = self.last_scan.write().unwrap();
            *t = timestamp;
        }
        {
            let mut cache = self.cached_index.write().unwrap();
            *cache = None;
        }

        Ok(())
    }

    pub async fn build_index_if_stale(&self, min_age: std::time::Duration) -> Result<bool> {
        let last_scan = *self.last_scan.read().unwrap();
        let now = Utc::now().timestamp_millis();
        if last_scan > 0 && now - last_scan < min_age.as_millis() as i64 {
            return Ok(false);
        }

        self.build_index().await?;
        Ok(true)
    }

    pub fn get_index(&self) -> FileIndexResponse {
        {
            let cache = self.cached_index.read().unwrap();
            if let Some(ref cached) = *cache {
                return cached.clone();
            }
        }

        let files = self.files.read().unwrap();
        let last_scan = *self.last_scan.read().unwrap();

        // Use with_capacity to avoid reallocations
        let file_count = files.len();
        let mut by_date: std::collections::HashMap<String, Vec<FileItem>> =
            std::collections::HashMap::with_capacity(file_count / 10); // Approx 10 files per date
        let mut by_category: std::collections::HashMap<
            String,
            std::collections::HashMap<String, Vec<FileItem>>,
        > = std::collections::HashMap::with_capacity(16); // Assume <= 16 categories

        for file in files.iter() {
            // Populate by_date (flat view for backward compatibility or global timeline)
            by_date
                .entry(file.date_folder.clone())
                .or_insert_with(|| Vec::with_capacity(file_count / 10))
                .push(file.clone());

            // Populate by_category
            let cat_entry = by_category
                .entry(file.category.clone())
                .or_insert_with(|| std::collections::HashMap::with_capacity(file_count / 100));
            cat_entry
                .entry(file.date_folder.clone())
                .or_insert_with(|| Vec::with_capacity(10))
                .push(file.clone());
        }

        // Sort - only sort when needed (most files are already sorted by date folder)
        for list in by_date.values_mut() {
            if list.len() > 1 {
                list.sort_by(|a, b| b.created_at.cmp(&a.created_at));
            }
        }
        for cat_map in by_category.values_mut() {
            for list in cat_map.values_mut() {
                if list.len() > 1 {
                    list.sort_by(|a, b| b.created_at.cmp(&a.created_at));
                }
            }
        }

        let response = FileIndexResponse {
            by_date,
            by_category,
            last_scan,
        };

        {
            let mut cache = self.cached_index.write().unwrap();
            *cache = Some(response.clone());
        }

        response
    }

    pub fn add_file(&self, path: &Path) {
        if !path.exists() {
            return;
        }

        let path = path.canonicalize().unwrap_or(path.to_path_buf());

        // Quick add - only if path is within DATA_ROOT
        let root = Path::new(DATA_ROOT);
        let root_canon = root.canonicalize().unwrap_or(root.to_path_buf());
        if !path.starts_with(&root_canon) {
            return;
        }

        if let Ok(meta) = path.metadata() {
            let name = path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();
            let size = meta.len();
            let created: DateTime<Utc> = meta.created().unwrap_or(SystemTime::now()).into();

            // Determine category and date
            // Strip root
            let relative = path.strip_prefix(&root_canon).unwrap_or(&path);
            let mut components = relative.components();

            let category = components
                .next()
                .map(|c| c.as_os_str().to_string_lossy().to_string())
                .unwrap_or_else(|| DEFAULT_CATEGORY.to_string());

            let mut date_folder = components
                .next()
                .map(|c| c.as_os_str().to_string_lossy().to_string())
                .unwrap_or_default();

            // Validate date_folder
            if !date_regex().is_match(&date_folder) {
                date_folder = created.format("%Y-%m-%d").to_string();
            }

            let item = FileItem {
                path: path.to_string_lossy().to_string(),
                name,
                size,
                created_at: created,
                date_folder,
                category,
            };

            {
                let mut w = self.files.write().unwrap();
                if let Some(pos) = w.iter().position(|x| x.path == item.path) {
                    w[pos] = item;
                } else {
                    w.push(item);
                }
            }

            self.invalidate_cache_and_touch();
        }
    }

    pub fn remove_file(&self, path_str: &str) {
        {
            let mut w = self.files.write().unwrap();
            if let Some(pos) = w.iter().position(|x| x.path == path_str) {
                w.remove(pos);
            }
        }
        self.invalidate_cache_and_touch();
    }

    pub fn rename_category(&self, old_category: &str, new_category: &str) {
        let data_root = Path::new(DATA_ROOT)
            .canonicalize()
            .unwrap_or_else(|_| PathBuf::from(DATA_ROOT));

        {
            let mut files = self.files.write().unwrap();
            for file in files
                .iter_mut()
                .filter(|file| file.category == old_category)
            {
                let current_path = PathBuf::from(&file.path);
                if let Ok(relative) = current_path.strip_prefix(&data_root) {
                    let mut components = relative.components();
                    let _ = components.next();
                    let mut rest = PathBuf::new();
                    for component in components {
                        rest.push(component);
                    }
                    file.path = data_root
                        .join(new_category)
                        .join(rest)
                        .to_string_lossy()
                        .to_string();
                }
                file.category = new_category.to_string();
            }
        }

        self.invalidate_cache_and_touch();
    }

    pub fn remove_category(&self, category: &str) {
        {
            let mut files = self.files.write().unwrap();
            files.retain(|file| file.category != category);
        }

        self.invalidate_cache_and_touch();
    }

    pub fn count_files_after(&self, timestamp: DateTime<Utc>) -> usize {
        let files = self.files.read().unwrap();
        files.iter().filter(|f| f.created_at > timestamp).count()
    }

    pub fn find_file_by_name(&self, name: &str) -> Option<FileItem> {
        let files = self.files.read().unwrap();
        // Return first match. If duplicates exist, it might be ambiguous,
        // but for syncing we assume uniqueness or take latest.
        files.iter().find(|f| f.name == name).cloned()
    }

    fn invalidate_cache_and_touch(&self) {
        {
            let mut t = self.last_scan.write().unwrap();
            *t = Utc::now().timestamp_millis();
        }
        {
            let mut cache = self.cached_index.write().unwrap();
            *cache = None;
        }
    }
}

pub fn get_today_folder(category: Option<&str>) -> PathBuf {
    let now = Local::now();
    let folder_name = now.format("%Y-%m-%d").to_string();
    let cat = category.unwrap_or(DEFAULT_CATEGORY);

    let path = Path::new(DATA_ROOT).join(cat).join(folder_name);
    if !path.exists() {
        let _ = std::fs::create_dir_all(&path);
    }
    path
}

// Migration: Move old date folders into data/default/
pub fn migrate_storage() -> Result<()> {
    let root = Path::new(DATA_ROOT);
    if !root.exists() {
        return Ok(());
    }

    let default_cat = root.join(DEFAULT_CATEGORY);
    if !default_cat.exists() {
        fs::create_dir_all(&default_cat)?;
    }

    // Check for date-like folders in root
    for entry in fs::read_dir(root)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_dir() {
            let name = entry.file_name().to_string_lossy().to_string();
            // Simple check: starts with 20... (year) and is not "default"
            // Also ignore hidden files or "jobs.sqlite" parent dir if separate? (jobs.sqlite is file)
            if name != DEFAULT_CATEGORY && name.starts_with("20") && name.len() == 10 {
                // It's a date folder
                let new_path = default_cat.join(&name);
                tracing::info!("Migrating {} to {}", path.display(), new_path.display());
                fs::rename(path, new_path)?;
            }
        }
    }
    Ok(())
}

pub fn sanitize_category_name(name: &str) -> String {
    let sanitized: String = name
        .trim()
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '_' || c == ' ' || c == '-' {
                c
            } else {
                ' '
            }
        })
        .collect();

    // Replace multiple spaces with single space
    let cleaned = whitespace_regex().replace_all(&sanitized, " ").to_string();

    // Trim spaces from ends
    cleaned.trim().to_string()
}

pub fn create_category(name: &str) -> Result<()> {
    let sanitized = sanitize_category_name(name);
    if sanitized.is_empty() {
        return Err(anyhow::anyhow!("Invalid category name"));
    }

    let path = Path::new(DATA_ROOT).join(&sanitized);
    if path.exists() {
        return Err(anyhow::anyhow!("Category already exists"));
    }
    fs::create_dir_all(path)?;
    Ok(())
}

pub fn delete_category(name: &str) -> Result<()> {
    let sanitized = sanitize_category_name(name);
    if sanitized.is_empty() || sanitized == DEFAULT_CATEGORY {
        return Err(anyhow::anyhow!("Cannot delete default category"));
    }
    let data_root = Path::new(DATA_ROOT)
        .canonicalize()
        .map_err(|_| anyhow::anyhow!("DATA_ROOT does not exist"))?;
    let path = data_root.join(&sanitized);
    let path_canon = path.canonicalize()
        .map_err(|_| anyhow::anyhow!("Category not found"))?;
    if !path_canon.starts_with(&data_root) || path_canon == data_root {
        return Err(anyhow::anyhow!("Access denied"));
    }
    fs::remove_dir_all(path_canon)?;
    Ok(())
}

pub fn rename_category(old: &str, new: &str) -> Result<()> {
    let sanitized_old = sanitize_category_name(old);
    let sanitized_new = sanitize_category_name(new);
    if sanitized_old.is_empty() || sanitized_old == DEFAULT_CATEGORY {
        return Err(anyhow::anyhow!("Cannot rename default category"));
    }
    if sanitized_new.is_empty() || sanitized_new == DEFAULT_CATEGORY {
        return Err(anyhow::anyhow!("Invalid new category name"));
    }

    let data_root = Path::new(DATA_ROOT)
        .canonicalize()
        .map_err(|_| anyhow::anyhow!("DATA_ROOT does not exist"))?;
    let old_path = data_root.join(&sanitized_old);
    let new_path = data_root.join(&sanitized_new);

    let old_path_canon = old_path.canonicalize()
        .map_err(|_| anyhow::anyhow!("Category not found"))?;
    if !old_path_canon.starts_with(&data_root) || old_path_canon == data_root {
        return Err(anyhow::anyhow!("Access denied"));
    }
    if new_path.exists() {
        return Err(anyhow::anyhow!("Target category name already exists"));
    }

    fs::rename(old_path_canon, new_path)?;
    Ok(())
}

pub async fn get_disk_usage() -> Result<(u64, usize)> {
    let root = Path::new(DATA_ROOT);
    if !root.exists() {
        return Ok((0, 0));
    }

    let root_path = root.to_path_buf();
    let result = tokio::task::spawn_blocking(move || {
        let mut total_size = 0;
        let mut count = 0;

        for entry in WalkDir::new(&root_path).into_iter().filter_map(|e| e.ok()) {
            if entry.file_type().is_file() {
                if entry.file_name().to_string_lossy().contains("jobs.sqlite") {
                    continue;
                }
                count += 1;
                total_size += entry.metadata().map(|m| m.len()).unwrap_or(0);
            }
        }
        (total_size, count)
    })
    .await?;

    Ok(result)
}

pub fn list_categories() -> Vec<String> {
    let root = Path::new(DATA_ROOT);
    let mut cats = Vec::new();
    if let Ok(entries) = fs::read_dir(root) {
        for entry in entries.flatten() {
            if entry.path().is_dir() {
                cats.push(entry.file_name().to_string_lossy().to_string());
            }
        }
    }
    if cats.is_empty() {
        cats.push(DEFAULT_CATEGORY.to_string());
    }
    cats
}

pub async fn move_file_on_disk(abs_path: &Path, new_category: &str) -> Result<PathBuf> {
    let sanitized_category = sanitize_category_name(new_category);
    let data_root = Path::new(DATA_ROOT)
        .canonicalize()
        .unwrap_or_else(|_| PathBuf::from(DATA_ROOT));
    move_file_on_disk_internal(abs_path, &sanitized_category, &data_root).await
}

async fn move_file_on_disk_internal(
    abs_path: &Path,
    new_category: &str,
    data_root: &Path,
) -> Result<PathBuf> {
    // Ensure abs_path is absolute and starts with data_root
    let abs_path_canon = abs_path.canonicalize()?;
    if !abs_path_canon.starts_with(data_root) {
        return Err(anyhow::anyhow!("Access denied: Path outside data root"));
    }

    if !abs_path_canon.exists() {
        return Err(anyhow::anyhow!("File not found"));
    }

    // Validate target category
    let sanitized_new_category = sanitize_category_name(new_category);
    if sanitized_new_category.is_empty() {
        return Err(anyhow::anyhow!("Invalid category name"));
    }
    let target_cat_path = data_root.join(&sanitized_new_category);
    if !target_cat_path.exists() {
        tokio::fs::create_dir_all(&target_cat_path).await?;
    }
    let target_cat_path_canon = target_cat_path.canonicalize()?;
    if !target_cat_path_canon.starts_with(data_root) {
        return Err(anyhow::anyhow!("Access denied: Target path outside data root"));
    }

    // Calculate relative path to preserve structure
    // e.g. data/old_cat/date/file -> old_cat/date/file
    let relative = abs_path_canon.strip_prefix(data_root)?;

    // Skip the old category component
    // relative: old_cat/date/file
    // components: [old_cat, date, file]
    let mut components = relative.components();
    let _old_cat = components.next();

    // Reconstruct path inside new category
    // new_path: data/new_cat/date/file
    let mut rest = PathBuf::new();
    for c in components {
        rest.push(c);
    }

    let new_abs_path = target_cat_path_canon.join(rest);

    // Create parent directories if needed
    if let Some(parent) = new_abs_path.parent() {
        if !parent.exists() {
            tokio::fs::create_dir_all(parent).await?;
        }
    }

    tracing::info!(
        "Moving file (disk): {:?} -> {:?}",
        abs_path_canon,
        new_abs_path
    );
    tokio::fs::rename(&abs_path_canon, &new_abs_path).await?;

    Ok(new_abs_path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::File;
    use tempfile::TempDir;

    #[tokio::test]
    async fn test_move_file_structure() -> Result<()> {
        let temp_dir = TempDir::new()?;
        let root = temp_dir.path();

        // Setup: root/default/2024-02-02/test.txt
        let old_cat = root.join("default");
        let date_folder = old_cat.join("2024-02-02");
        tokio::fs::create_dir_all(&date_folder).await?;
        let file_path = date_folder.join("test.txt");
        File::create(&file_path)?;

        // Target: root/NewCat/2024-02-02/test.txt
        let new_cat = "NewCat";

        let new_path = move_file_on_disk_internal(&file_path, new_cat, root).await?;

        assert!(new_path.exists());
        assert!(!file_path.exists());

        let expected = root.join("NewCat").join("2024-02-02").join("test.txt");
        assert_eq!(new_path.canonicalize()?, expected.canonicalize()?);

        Ok(())
    }

    #[tokio::test]
    async fn test_move_file_root_category() -> Result<()> {
        let temp_dir = TempDir::new()?;
        let root = temp_dir.path();

        // Setup: root/default/test.txt (no date folder)
        let old_cat = root.join("default");
        tokio::fs::create_dir_all(&old_cat).await?;
        let file_path = old_cat.join("test.txt");
        File::create(&file_path)?;

        // Target: root/NewCat/test.txt
        let new_cat = "NewCat";

        let new_path = move_file_on_disk_internal(&file_path, new_cat, root).await?;

        assert!(new_path.exists());
        assert!(!file_path.exists());

        let expected = root.join("NewCat").join("test.txt");
        assert_eq!(new_path.canonicalize()?, expected.canonicalize()?);

        Ok(())
    }
}
