package storage

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"
)

const (
	DataRoot        = "data"
	ThumbnailsRoot  = "data/.thumbnails"
	DefaultCategory = "default"
)

var dateRegex = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)
var whitespaceRe = regexp.MustCompile(`\s+`)

type FileItem struct {
	Path       string    `json:"path"`
	Name       string    `json:"name"`
	Size       uint64    `json:"size"`
	CreatedAt  time.Time `json:"createdAt"`
	DateFolder string    `json:"dateFolder"`
	Category   string    `json:"category"`
}

type FileIndexResponse struct {
	ByDate     map[string][]FileItem            `json:"byDate"`
	ByCategory map[string]map[string][]FileItem `json:"byCategory"`
	LastScan   int64                            `json:"lastScan"`
}

type FileIndex struct {
	mu          sync.RWMutex
	files       []FileItem
	lastScan    int64
	cachedIndex *FileIndexResponse
	cacheMu     sync.RWMutex
}

func NewFileIndex() *FileIndex {
	return &FileIndex{}
}

func (fi *FileIndex) BuildIndex() error {
	root := filepath.Clean(DataRoot)
	var files []FileItem

	entries, err := os.ReadDir(root)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}

	for _, catEntry := range entries {
		if !catEntry.IsDir() || strings.HasPrefix(catEntry.Name(), ".") {
			continue
		}
		category := catEntry.Name()
		catPath := filepath.Join(root, category)
		filepath.WalkDir(catPath, func(path string, d os.DirEntry, err error) error {
			if err != nil || d.IsDir() {
				return nil
			}
			name := d.Name()
			if strings.Contains(name, "jobs.sqlite") || name == ".last_sync" {
				return nil
			}
			info, err := d.Info()
			if err != nil {
				return nil
			}
			rel, _ := filepath.Rel(catPath, path)
			parts := strings.SplitN(rel, string(os.PathSeparator), 2)
			dateFolder := ""
			if len(parts) > 1 {
				dateFolder = parts[0]
			}
			created := info.ModTime()
			if !dateRegex.MatchString(dateFolder) {
				dateFolder = created.Format("2006-01-02")
			}
			files = append(files, FileItem{
				Path:       path,
				Name:       name,
				Size:       uint64(info.Size()),
				CreatedAt:  created,
				DateFolder: dateFolder,
				Category:   category,
			})
			return nil
		})
	}

	fi.mu.Lock()
	fi.files = files
	fi.lastScan = time.Now().UnixMilli()
	fi.cachedIndex = nil
	fi.mu.Unlock()
	return nil
}

func (fi *FileIndex) GetIndex() FileIndexResponse {
	fi.cacheMu.RLock()
	if fi.cachedIndex != nil {
		resp := *fi.cachedIndex
		fi.cacheMu.RUnlock()
		return resp
	}
	fi.cacheMu.RUnlock()

	fi.mu.RLock()
	defer fi.mu.RUnlock()

	byDate := make(map[string][]FileItem)
	byCategory := make(map[string]map[string][]FileItem)

	for _, f := range fi.files {
		byDate[f.DateFolder] = append(byDate[f.DateFolder], f)
		if byCategory[f.Category] == nil {
			byCategory[f.Category] = make(map[string][]FileItem)
		}
		byCategory[f.Category][f.DateFolder] = append(byCategory[f.Category][f.DateFolder], f)
	}

	// Sort by date desc
	for k := range byDate {
		sort.Slice(byDate[k], func(i, j int) bool {
			return byDate[k][i].CreatedAt.After(byDate[k][j].CreatedAt)
		})
	}
	for _, m := range byCategory {
		for k := range m {
			sort.Slice(m[k], func(i, j int) bool {
				return m[k][i].CreatedAt.After(m[k][j].CreatedAt)
			})
		}
	}

	resp := FileIndexResponse{ByDate: byDate, ByCategory: byCategory, LastScan: fi.lastScan}
	fi.cacheMu.Lock()
	fi.cachedIndex = &resp
	fi.cacheMu.Unlock()
	return resp
}

func (fi *FileIndex) AddFile(path string) {
	path = filepath.Clean(path)
	info, err := os.Stat(path)
	if err != nil {
		return
	}
	root := filepath.Clean(DataRoot)
	rel, _ := filepath.Rel(root, path)
	parts := strings.SplitN(rel, string(os.PathSeparator), 2)
	category := DefaultCategory
	if len(parts) > 0 {
		category = parts[0]
	}
	dateFolder := info.ModTime().Format("2006-01-02")
	item := FileItem{
		Path: path, Name: info.Name(), Size: uint64(info.Size()),
		CreatedAt: info.ModTime(), DateFolder: dateFolder, Category: category,
	}
	fi.mu.Lock()
	for i, f := range fi.files {
		if f.Path == item.Path {
			fi.files[i] = item
			fi.mu.Unlock()
			fi.InvalidateCache()
			return
		}
	}
	fi.files = append(fi.files, item)
	fi.mu.Unlock()
	fi.InvalidateCache()
}

func (fi *FileIndex) RemoveFile(path string) {
	fi.mu.Lock()
	for i, f := range fi.files {
		if f.Path == path {
			fi.files = append(fi.files[:i], fi.files[i+1:]...)
			break
		}
	}
	fi.mu.Unlock()
	fi.InvalidateCache()
}

func (fi *FileIndex) RenameCategory(old, new string) {
	root := filepath.Clean(DataRoot)
	fi.mu.Lock()
	for i := range fi.files {
		if fi.files[i].Category == old {
			p, _ := filepath.Rel(root, fi.files[i].Path)
			comps := strings.SplitN(p, string(os.PathSeparator), 2)
			rest := ""
			if len(comps) > 1 {
				rest = comps[1]
			}
			fi.files[i].Path = filepath.Join(root, new, rest)
			fi.files[i].Category = new
		}
	}
	fi.mu.Unlock()
	fi.InvalidateCache()
}

func (fi *FileIndex) RemoveCategory(category string) {
	fi.mu.Lock()
	n := 0
	for _, f := range fi.files {
		if f.Category != category {
			fi.files[n] = f
			n++
		}
	}
	fi.files = fi.files[:n]
	fi.mu.Unlock()
	fi.InvalidateCache()
}

func (fi *FileIndex) CountFilesAfter(t time.Time) int {
	fi.mu.RLock()
	defer fi.mu.RUnlock()
	count := 0
	for _, f := range fi.files {
		if f.CreatedAt.After(t) {
			count++
		}
	}
	return count
}

func (fi *FileIndex) FindFileByName(name string) *FileItem {
	fi.mu.RLock()
	defer fi.mu.RUnlock()
	for i := range fi.files {
		if fi.files[i].Name == name {
			return &fi.files[i]
		}
	}
	return nil
}

func (fi *FileIndex) InvalidateCache() {
	fi.cacheMu.Lock()
	fi.cachedIndex = nil
	fi.lastScan = time.Now().UnixMilli()
	fi.cacheMu.Unlock()
}

func GetTodayFolder(category string) string {
	if category == "" {
		category = DefaultCategory
	}
	dir := filepath.Join(DataRoot, category, time.Now().Format("2006-01-02"))
	os.MkdirAll(dir, 0755)
	return dir
}

func SanitizeCategoryName(name string) string {
	s := strings.TrimSpace(name)
	s = whitespaceRe.ReplaceAllString(s, "")
	return s
}

func CreateCategory(name string) error {
	sanitized := SanitizeCategoryName(name)
	if sanitized == "" {
		return fmt.Errorf("invalid category name")
	}
	path := filepath.Join(DataRoot, sanitized)
	if _, err := os.Stat(path); err == nil {
		return fmt.Errorf("category already exists")
	}
	return os.MkdirAll(path, 0755)
}

func DeleteCategory(name string) error {
	sanitized := SanitizeCategoryName(name)
	if sanitized == "" || sanitized == DefaultCategory {
		return fmt.Errorf("cannot delete default category")
	}
	path := filepath.Join(DataRoot, sanitized)
	abs, err := filepath.Abs(path)
	if err != nil {
		return err
	}
	root, _ := filepath.Abs(DataRoot)
	if !strings.HasPrefix(abs, root) || abs == root {
		return fmt.Errorf("access denied")
	}
	return os.RemoveAll(abs)
}

func RenameCategory(old, new string) error {
	sOld := SanitizeCategoryName(old)
	sNew := SanitizeCategoryName(new)
	if sOld == "" || sOld == DefaultCategory {
		return fmt.Errorf("cannot rename default category")
	}
	if sNew == "" || sNew == DefaultCategory {
		return fmt.Errorf("invalid new category name")
	}
	oldPath := filepath.Join(DataRoot, sOld)
	newPath := filepath.Join(DataRoot, sNew)
	absOld, _ := filepath.Abs(oldPath)
	absNew, _ := filepath.Abs(newPath)
	root, _ := filepath.Abs(DataRoot)
	if !strings.HasPrefix(absOld, root) {
		return fmt.Errorf("access denied")
	}
	if _, err := os.Stat(absNew); err == nil {
		return fmt.Errorf("target already exists")
	}
	return os.Rename(absOld, absNew)
}

func GetDiskUsage() (uint64, int, error) {
	root := filepath.Clean(DataRoot)
	var totalSize uint64
	var count int
	err := filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		name := d.Name()
		if strings.HasPrefix(name, ".") || strings.Contains(name, "jobs.sqlite") {
			if d.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		if !d.IsDir() {
			info, err := d.Info()
			if err == nil {
				totalSize += uint64(info.Size())
				count++
			}
		}
		return nil
	})
	return totalSize, count, err
}

func ListCategories() []string {
	var cats []string
	entries, err := os.ReadDir(DataRoot)
	if err != nil {
		return []string{DefaultCategory}
	}
	for _, e := range entries {
		if e.IsDir() && !strings.HasPrefix(e.Name(), ".") {
			cats = append(cats, e.Name())
		}
	}
	if len(cats) == 0 {
		cats = append(cats, DefaultCategory)
	}
	return cats
}

func ValidateDataPath(path string) (string, error) {
	abs, err := filepath.Abs(path)
	if err != nil {
		return "", fmt.Errorf("path does not exist: %s", path)
	}
	root, _ := filepath.Abs(DataRoot)
	if !strings.HasPrefix(abs, root) {
		return "", fmt.Errorf("access denied: path outside data root")
	}
	if _, err := os.Stat(abs); err != nil {
		return "", fmt.Errorf("file not found")
	}
	return abs, nil
}

func MoveFileOnDisk(absPath, newCategory string) (string, error) {
	sanitized := SanitizeCategoryName(newCategory)
	if sanitized == "" {
		return "", fmt.Errorf("invalid category name")
	}
	absPath, err := filepath.Abs(absPath)
	if err != nil {
		return "", err
	}
	root, _ := filepath.Abs(DataRoot)
	if !strings.HasPrefix(absPath, root) {
		return "", fmt.Errorf("access denied")
	}
	if _, err := os.Stat(absPath); err != nil {
		return "", fmt.Errorf("file not found")
	}
	rel, _ := filepath.Rel(root, absPath)
	comps := strings.SplitN(rel, string(os.PathSeparator), 2)
	rest := ""
	if len(comps) > 1 {
		rest = comps[1]
	}
	// Skip old category component
	if i := strings.Index(rest, string(os.PathSeparator)); i != -1 {
		rest = rest[i+1:]
	} else {
		rest = ""
	}
	newAbs := filepath.Join(root, sanitized, rest)
	os.MkdirAll(filepath.Dir(newAbs), 0755)
	if err := os.Rename(absPath, newAbs); err != nil {
		return "", err
	}
	return newAbs, nil
}
