import React, { useState, useEffect, useMemo, useCallback, useRef, useDeferredValue } from 'react';
import Head from 'next/head';
import { getSystemUsage, DiskUsage, getDownloadUrl, listCategories, moveFile, getStreamUrl, deleteFiles, zipFiles, fetchWithAuth } from '../lib/api';
import { API_BASE } from '../lib/config';
import BatchOperations from '../components/BatchOperations';
import EnhancedFilters from '../components/EnhancedFilters';
import FileDateSection from '../components/FileDateSection';
import FilePreviewModal from '../components/FilePreviewModal';
import { formatBytes } from '../lib/utils';
import { useVisibilityPolling } from '../hooks/useVisibilityPolling';

import type { FileItem, JobInfo, SortOption, SortDirection } from '../lib/types';

interface FileResponse {
  byDate: Record<string, FileItem[]>;
  byCategory: Record<string, Record<string, FileItem[]>>;
  lastScan: number;
  infoByKey?: Record<string, JobInfo>;
}

function formatDateHeader(dateStr: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return dateStr || 'Unsorted';
  }
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Client-side cache
let cachedResponse: { allFiles: FileItem[], usage: DiskUsage | null, timestamp: number } | null = null;

export default function FilesEnhanced() {
  // Data State
  const [allFiles, setAllFiles] = useState<FileItem[]>(cachedResponse?.allFiles || []);
  const [loading, setLoading] = useState(!cachedResponse);
  const [usage, setUsage] = useState<DiskUsage | null>(cachedResponse?.usage || null);
  const [categories, setCategories] = useState<string[]>(['default']);

  // UI State
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<SortOption>('time');
  const [sortDir, setSortDir] = useState<SortDirection>('desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [platformFilter, setPlatformFilter] = useState<string>('all');
  const [displayLimit, setDisplayLimit] = useState(50);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Preview State
  const [previewFile, setPreviewFile] = useState<FileItem | null>(null);
  const [previewSrc, setPreviewSrc] = useState('');
  const [playerType, setPlayerType] = useState<'native' | 'custom'>('custom');
  const deferredSearchQuery = useDeferredValue(searchQuery);

  useEffect(() => {
    const storedPlayer = localStorage.getItem('player_preference');
    if (storedPlayer === 'native' || storedPlayer === 'custom') {
      setPlayerType(storedPlayer);
    }
  }, []);

  const loadMoreRef = useRef<HTMLDivElement>(null);

  const showFeedback = useCallback((type: 'success' | 'error', text: string) => {
    setFeedback({ type, text });
    window.clearTimeout((showFeedback as typeof showFeedback & { timeoutId?: number }).timeoutId);
    (showFeedback as typeof showFeedback & { timeoutId?: number }).timeoutId = window.setTimeout(() => {
      setFeedback(null);
    }, 3000);
  }, []);

  // Infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
            setDisplayLimit((prev) => prev + 50);
        }
      },
      { rootMargin: '400px' }
    );
    if (loadMoreRef.current) {
        observer.observe(loadMoreRef.current);
    }
    return () => observer.disconnect();
  }, [loading, allFiles, categoryFilter, platformFilter, searchQuery]);

  useEffect(() => {
    setDisplayLimit(50);
  }, [categoryFilter, platformFilter, sortBy, sortDir, deferredSearchQuery]);

  // Fetch data
  const fetchCategories = useCallback(async () => {
    try {
      const cats = await listCategories();
      setCategories(cats);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const fetchFiles = useCallback(async (force = false) => {
      if (cachedResponse && !force && Date.now() - cachedResponse.timestamp < 30000) {
          setAllFiles(cachedResponse.allFiles);
          setUsage(cachedResponse.usage);
          setLoading(false);
          return;
      }

      setLoading(true);
      try {
          const res = await fetchWithAuth(`${API_BASE}/files`);

          if (!res.ok) throw new Error('Failed to fetch files');

          const data: FileResponse = await res.json();
          const flatten: FileItem[] = [];

          for (const dateKey in data.byDate) {
              const items = data.byDate[dateKey];
              items.forEach(item => {
                  const infoKey = `${item.category}/${dateKey}/${item.name}`;
                  const info = data.infoByKey?.[infoKey];

                  flatten.push({
                      ...item,
                      dateFolder: dateKey,
                      platform: info?.platform,
                      creator: info?.creator,
                      caption: info?.caption
                  });
              });
          }

          const nextUsage = await getSystemUsage().catch(() => null);
          cachedResponse = {
              allFiles: flatten,
              usage: nextUsage,
              timestamp: Date.now()
          };

          setAllFiles(flatten);
          setUsage(nextUsage);
          await fetchCategories();
      } catch (err) {
          console.error('Failed to fetch files:', err);
          showFeedback('error', 'Failed to refresh files');
      } finally {
          setLoading(false);
      }
  }, [fetchCategories, showFeedback]);

  useVisibilityPolling(() => fetchFiles(), 60000, { runImmediately: true });

  // Batch operations
  const handleBatchDelete = async () => {
    if (!confirm(`Delete ${selectedPaths.size} files? This action cannot be undone.`)) return;

    try {
      const paths = Array.from(selectedPaths);
      const result = await deleteFiles(paths);

      if (result.errors.length > 0) {
        console.warn('Some files could not be deleted:', result.errors);
        showFeedback('error', `Deleted ${result.deleted.length} file(s), but some deletions failed`);
      } else {
        showFeedback('success', `Deleted ${result.deleted.length} file(s)`);
      }

      const deletedSet = new Set(result.deleted);
      if (cachedResponse) {
        cachedResponse.allFiles = cachedResponse.allFiles.filter(f => !deletedSet.has(f.path));
      }
      setAllFiles(prev => prev.filter(f => !deletedSet.has(f.path)));
      setSelectedPaths(prev => {
        const next = new Set(prev);
        paths.forEach(p => next.delete(p));
        return next;
      });
      getSystemUsage().then(u => {
        setUsage(u);
        if (cachedResponse) {
          cachedResponse.usage = u;
        }
      }).catch(console.error);
    } catch (err) {
      console.error('Batch delete failed', err);
      showFeedback('error', 'Failed to delete selected files');
    }
  };

  const handleBatchZip = async () => {
    try {
      const paths = Array.from(selectedPaths);
      const blob = await zipFiles(paths);

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tiak-archive-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
      showFeedback('success', `Downloading ZIP for ${paths.length} file(s)`);
    } catch (err) {
      console.error('Batch ZIP failed', err);
      showFeedback('error', 'Failed to create ZIP');
    }
  };

  const handleBatchMove = async (targetCategory: string) => {
    const paths = Array.from(selectedPaths);
    let movedCount = 0;

    for (const path of paths) {
        try {
            await moveFile(path, targetCategory);
            movedCount++;
        } catch (e) {
            console.error(`Failed to move ${path}`, e);
        }
    }

    if (movedCount > 0) {
        setSelectedPaths(new Set());
        fetchFiles(true);
        showFeedback('success', `Moved ${movedCount} file(s) to ${targetCategory}`);
    } else {
        showFeedback('error', 'No files were moved');
    }
  };

  const handleSelectAll = () => {
    const allPaths = new Set(sortedFilesList.map(f => f.path));
    setSelectedPaths(allPaths);
  };

  const handleClearSelection = () => {
    setSelectedPaths(new Set());
  };

  const handleDownload = useCallback((path: string) => {
    const url = getDownloadUrl(path);
    const a = document.createElement('a');
    a.href = url;
    a.download = path.split('/').pop() || 'download';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, []);

  const openPreview = useCallback((file: FileItem) => {
    const url = getStreamUrl(file.path);
    setPreviewSrc(url);
    setPreviewFile(file);
  }, []);

  const togglePathSelection = useCallback((path: string) => {
    setSelectedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const closePreview = useCallback(() => {
    setPreviewFile(null);
    setPreviewSrc('');
  }, []);

  // Filter and sort
  const sortedFilesList = useMemo(() => {
    let filtered = allFiles;

    if (categoryFilter !== 'all') {
        filtered = filtered.filter(f => f.category === categoryFilter);
    }
    if (platformFilter !== 'all') {
        filtered = filtered.filter(f => f.platform === platformFilter);
    }

    if (deferredSearchQuery) {
      const q = deferredSearchQuery.toLowerCase();
      filtered = filtered.filter(f =>
        f.name.toLowerCase().includes(q) ||
        (f.creator && f.creator.toLowerCase().includes(q)) ||
        (f.caption && f.caption.toLowerCase().includes(q))
      );
    }

    return [...filtered].sort((a, b) => {
        if (sortBy === 'platform') {
          const pa = (a.platform || '').toLowerCase();
          const pb = (b.platform || '').toLowerCase();
          if (pa !== pb) {
            if (pa < pb) return sortDir === 'asc' ? -1 : 1;
            return sortDir === 'asc' ? 1 : -1;
          }
        }
        if (a.dateFolder !== b.dateFolder) {
            if (a.dateFolder < b.dateFolder) return sortDir === 'asc' ? -1 : 1;
            return sortDir === 'asc' ? 1 : -1;
        }

        let valA: string | number = a[sortBy === 'time' ? 'createdAt' : sortBy === 'platform' ? 'createdAt' : sortBy];
        let valB: string | number = b[sortBy === 'time' ? 'createdAt' : sortBy === 'platform' ? 'createdAt' : sortBy];

        if (sortBy === 'time' || sortBy === 'platform') {
          valA = new Date(valA).getTime();
          valB = new Date(valB).getTime();
        } else if (sortBy === 'name') {
          valA = (valA as string).toLowerCase();
          valB = (valB as string).toLowerCase();
        }

        if (valA < valB) return sortDir === 'asc' ? -1 : 1;
        if (valA > valB) return sortDir === 'asc' ? 1 : -1;
        return 0;
    });
  }, [allFiles, deferredSearchQuery, sortBy, sortDir, categoryFilter, platformFilter]);

  const navigatePreview = useCallback((direction: 'next' | 'prev') => {
    if (!previewFile) return;
    const currentIndex = sortedFilesList.findIndex(f => f.path === previewFile.path);
    if (currentIndex === -1) return;

    const nextIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
    if (nextIndex >= 0 && nextIndex < sortedFilesList.length) {
        openPreview(sortedFilesList[nextIndex]);
    }
  }, [openPreview, previewFile, sortedFilesList]);

  const previewIndex = useMemo(() => {
    if (!previewFile) return -1;
    return sortedFilesList.findIndex(file => file.path === previewFile.path);
  }, [previewFile, sortedFilesList]);

  const hasPrevPreview = previewIndex > 0;
  const hasNextPreview = previewIndex >= 0 && previewIndex < sortedFilesList.length - 1;

  useEffect(() => {
    if (!previewFile) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closePreview();
      } else if (event.key === 'ArrowRight') {
        navigatePreview('next');
      } else if (event.key === 'ArrowLeft') {
        navigatePreview('prev');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closePreview, navigatePreview, previewFile]);

  // Available platforms for filtering
  const availablePlatforms = useMemo(() => {
    const platforms = new Set<string>();
    allFiles.forEach(file => {
      if (file.platform) {
        platforms.add(file.platform);
      }
    });
    return Array.from(platforms).sort();
  }, [allFiles]);

  // Clear all filters
  const handleClearFilters = () => {
    setSearchQuery('');
    setCategoryFilter('all');
    setPlatformFilter('all');
    setSortBy('time');
    setSortDir('desc');
  };

  // Group files by date
  const groupedFiles = useMemo(() => {
    const groups: Record<string, FileItem[]> = {};
    sortedFilesList.forEach(file => {
      const key = file.dateFolder || 'Unsorted';
      if (!groups[key]) groups[key] = [];
      groups[key].push(file);
    });

    const sortedDates = Object.keys(groups).sort((a, b) => {
      if (a === 'Unsorted' || b === 'Unsorted') return a === 'Unsorted' ? 1 : -1;
      return sortDir === 'desc' ? b.localeCompare(a) : a.localeCompare(b);
    });

    return { groups, sortedDates };
  }, [sortedFilesList, sortDir]);

  // Paginated display
  const paginatedFiles = useMemo(() => {
    let renderedCount = 0;
    const result: { date: string; items: FileItem[] }[] = [];

    for (const date of groupedFiles.sortedDates) {
      if (renderedCount >= displayLimit) break;

      const items = groupedFiles.groups[date];
      const remaining = displayLimit - renderedCount;
      const itemsToShow = items.slice(0, remaining);

      if (itemsToShow.length > 0) {
        result.push({ date, items: itemsToShow });
        renderedCount += itemsToShow.length;
      }
    }

    return result;
  }, [groupedFiles, displayLimit]);

  const hasNext = useMemo(() => {
    let totalCount = 0;
    groupedFiles.sortedDates.forEach(date => {
      totalCount += groupedFiles.groups[date].length;
    });
    return displayLimit < totalCount;
  }, [groupedFiles, displayLimit]);

  return (
    <>
      <Head>
        <title>Files - Tiak</title>
      </Head>

      <div className="space-y-6 animate-in fade-in duration-500">
        <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-3xl font-extrabold tracking-tight text-gradient-purple font-display">Files</h1>
            {usage ? (
              <div className="mt-3 space-y-1.5 max-w-[280px]">
                <div className="flex justify-between text-[11px] font-mono text-content-muted">
                  <span>{formatBytes(usage.totalSize)} / 50 GB Used</span>
                  <span>{usage.fileCount} files</span>
                </div>
                <div className="h-1.5 w-full bg-surface-strong rounded-full overflow-hidden border border-border/30">
                  <div 
                    className="h-full bg-neon-purple rounded-full glow-purple transition-all duration-500"
                    style={{ width: `${Math.min(100, (usage.totalSize / (50 * 1024 * 1024 * 1024)) * 100)}%` }}
                  />
                </div>
              </div>
            ) : (
              <p className="text-sm text-content-muted mt-1">Loading space info...</p>
            )}
          </div>
          <button
            onClick={() => fetchFiles()}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-surface-subtle/50 text-sm font-medium hover:bg-surface-strong hover:scale-105 active:scale-95 transition-all duration-200 disabled:opacity-50"
            title="Refresh files manually"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={loading ? 'animate-spin' : ''}>
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
              <path d="M16 16h5v5" />
            </svg>
            <span>Refresh</span>
          </button>
        </header>

        {/* Enhanced Filters */}
        <EnhancedFilters
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          categoryFilter={categoryFilter}
          setCategoryFilter={setCategoryFilter}
          platformFilter={platformFilter}
          setPlatformFilter={setPlatformFilter}
          sortBy={sortBy}
          setSortBy={(value) => setSortBy(value as SortOption)}
          sortDir={sortDir}
          setSortDir={setSortDir}
          categories={categories}
          availablePlatforms={availablePlatforms}
          fileCount={sortedFilesList.length}
          onClearFilters={handleClearFilters}
        />

        {/* Batch Operations */}
        <BatchOperations
          selectedCount={selectedPaths.size}
          categories={categories}
          onDelete={handleBatchDelete}
          onZip={handleBatchZip}
          onMove={handleBatchMove}
          onSelectAll={handleSelectAll}
          onClearSelection={handleClearSelection}
          isLoading={loading}
        />

        {feedback && (
          <div
            className={`rounded-lg border px-4 py-3 text-sm ${
              feedback.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-red-200 bg-red-50 text-red-800'
            }`}
          >
            {feedback.text}
          </div>
        )}

        {/* Loading State */}
        {loading && sortedFilesList.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-content-muted">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-foreground"></div>
            <p className="mt-3">Loading files...</p>
          </div>
        ) : sortedFilesList.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-content-muted border border-dashed border-border-subtle rounded-xl bg-surface-subtle/30">
            <p className="text-lg font-medium mb-2">No files found</p>
            <p className="text-sm">Try adjusting your filters or upload some content</p>
          </div>
        ) : (
          <div className="space-y-12">
            {paginatedFiles.map(({ date, items }) => (
              <FileDateSection
                key={date}
                title={formatDateHeader(date)}
                items={items}
                totalCount={groupedFiles.groups[date].length}
                selectedPaths={selectedPaths}
                onToggleDateSelection={(dateItems) => {
                  const datePaths = dateItems.map(file => file.path);
                  const allSelected = datePaths.every(path => selectedPaths.has(path));
                  setSelectedPaths(prev => {
                    const next = new Set(prev);
                    datePaths.forEach(path => {
                      if (allSelected) {
                        next.delete(path);
                      } else {
                        next.add(path);
                      }
                    });
                    return next;
                  });
                }}
                onToggleFileSelection={togglePathSelection}
                onPreview={openPreview}
                onDownload={handleDownload}
              />
            ))}

            {/* Load more */}
            {hasNext && (
              <div ref={loadMoreRef} className="py-8 text-center">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-foreground mx-auto"></div>
                <p className="mt-3 text-sm text-content-muted">Loading more files...</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Video Preview Modal */}
      {previewFile && (
        <FilePreviewModal
          file={previewFile}
          src={previewSrc}
          playerType={playerType}
          hasPrev={hasPrevPreview}
          hasNext={hasNextPreview}
          onClose={closePreview}
          onPrev={() => navigatePreview('prev')}
          onNext={() => navigatePreview('next')}
          onTogglePlayerType={() => {
            const next = playerType === 'custom' ? 'native' : 'custom';
            setPlayerType(next);
            localStorage.setItem('player_preference', next);
          }}
        />
      )}
    </>
  );
}
