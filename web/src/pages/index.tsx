import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { deleteJob, DownloadJob, AddJobResponse, listCategories, getRole, getDownloadUrl, fetchWithAuth } from '../lib/api';
import { API_BASE } from '../lib/config';
import SearchableSelect from '../components/SearchableSelect';
import { platformLabel, platformBadgeClass } from '../lib/utils';
import { useVisibilityPolling } from '../hooks/useVisibilityPolling';

export default function Queue() {
  const router = useRouter();
  const [urls, setUrls] = useState('');
  const [jobs, setJobs] = useState<DownloadJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [skipped, setSkipped] = useState<{ url: string; reason: string; filename?: string; category?: string; dateFolder?: string }[]>([]);

  const [categories, setCategories] = useState<string[]>(['default']);
  const [selectedCategory, setSelectedCategory] = useState('default');
  const [refreshing, setRefreshing] = useState(false);
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    setRole(getRole());
    const handleAuthChange = () => setRole(getRole());
    window.addEventListener('auth-change', handleAuthChange);
    return () => window.removeEventListener('auth-change', handleAuthChange);
  }, []);

  // Handle Share Target
  useEffect(() => {
    if (router.isReady && router.query.share_url) {
        const sharedUrl = router.query.share_url as string;
        setUrls(sharedUrl); // Prefill immediately
        
        // Auto-resolve
        resolveUrl(sharedUrl).then(resolved => {
            if (resolved && resolved !== sharedUrl) {
                setUrls(resolved);
            }
        });
        
        router.replace('/', undefined, { shallow: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, router.query]);

  const fetchCategories = async () => {
      try {
          const cats = await listCategories();
          setCategories(cats);
      } catch (e) {
          console.error(e);
      }
  };

  const resolveUrl = async (url: string): Promise<string | null> => {
    try {
        const res = await fetchWithAuth(`${API_BASE}/files/resolve`, { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });
        if (res.ok) {
            const data = await res.json();
            return data.url;
        }
    } catch (e) {
        console.error("Resolve failed", e);
    }
    return null;
  };

  const fetchJobs = async () => {
    try {
      const res = await fetchWithAuth(`${API_BASE}/queue/list`);
      if (res.ok) {
        const data = await res.json();
        setJobs(data);
      }
    } catch (error) {
      console.error('Failed to fetch jobs:', error);
    }
  };

  const handleManualRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchJobs();
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  useVisibilityPolling(fetchJobs, 5000, { runImmediately: true });

  const handleSubmit = async () => {
    if (!urls.trim()) return;
    setLoading(true);
    setSkipped([]);
    try {
      const res = await fetchWithAuth(`${API_BASE}/queue/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls, category: selectedCategory }),
      });
      
      if (res.ok) {
        const data: AddJobResponse = await res.json();
        if (data.added.length > 0) {
            setUrls('');
            fetchJobs();
        } else {
            setUrls('');
        }
        
        if (data.skipped.length > 0) {
            setSkipped(data.skipped.map(s => ({
              url: s.url,
              reason: s.reason,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              filename: (s as any).filename,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              category: (s as any).category,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              dateFolder: (s as any).dateFolder
            })));
        }
      } else {
         alert('Failed to add jobs');
      }
    } catch (error) {
      console.error('Failed to add jobs:', error);
      alert('Failed to add jobs');
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = async (id: string) => {
    try {
      await fetchWithAuth(`${API_BASE}/queue/retry/${id}`, {
        method: 'POST'
      });
      fetchJobs();
    } catch (error) {
      console.error('Failed to retry job:', error);
    }
  };

  const handleCancel = async (id: string) => {
    if (!confirm('Cancel this download?')) return;
    try {
      await deleteJob(id);
      fetchJobs();
    } catch (error) {
      console.error('Failed to cancel job:', error);
      alert('Failed to cancel job');
    }
  };

  const getJobDownloadPath = (job: DownloadJob) => {
    if (!job.filename) return '';
    const dateMs = job.completedAt || job.startedAt || job.createdAt;
    const d = new Date(dateMs);
    const dateStr = d.toISOString().split('T')[0];
    return `data/${job.category}/${dateStr}/${job.filename}`;
  };

  return (
    <>
      <Head>
        <title>Queue - Tiak</title>
      </Head>

      <div className="space-y-8 animate-in fade-in duration-500">
        <header className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Queue</h1>
            <div className="flex items-center gap-2">
              <button
                onClick={handleManualRefresh}
                disabled={refreshing}
                className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-surface-strong text-sm font-medium hover:bg-surface-subtle transition-colors disabled:opacity-50"
                title="Refresh jobs manually"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={refreshing ? 'animate-spin' : ''}>
                  <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                  <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                  <path d="M16 16h5v5" />
                </svg>
                <span>Refresh</span>
              </button>
              <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" title="Live updates active"></div>
            </div>
        </header>

        {/* Input Area */}
        <div className="space-y-4">
            <div className="group relative rounded-xl border border-border bg-surface p-1 shadow-sm focus-within:ring-2 focus-within:ring-foreground/5 transition-all">
                <textarea
                className="block w-full rounded-lg border-0 bg-transparent p-4 text-foreground placeholder:text-content-muted focus:ring-0 sm:text-sm resize-none"
                placeholder="Paste URLs here (YouTube, TikTok, Instagram – one per line)..."
                rows={3}
                value={urls}
                onChange={(e) => setUrls(e.target.value)}
                />
                <div className="flex justify-between items-center border-t border-border-subtle p-2 bg-surface-subtle/30 rounded-b-lg gap-2">
                    {role === 'admin' ? (
                      <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xs text-content-muted whitespace-nowrap">Category:</span>
                          <SearchableSelect
                              options={categories}
                              value={selectedCategory}
                              onChange={(val) => {
                                  setSelectedCategory(val);
                                  if (!categories.includes(val)) {
                                      setCategories(prev => [...prev, val].sort());
                                  }
                              }}
                              className="min-w-[140px]"
                          />
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xs text-content-muted whitespace-nowrap">Auto-deletes in 5 minutes</span>
                      </div>
                    )}

                    <button
                        onClick={handleSubmit}
                        disabled={loading || !urls.trim()}
                        className="inline-flex shrink-0 items-center justify-center rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background shadow-sm hover:bg-foreground/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"
                    >
                        {loading ? 'Adding...' : 'Add to Queue'}
                    </button>
                </div>
            </div>

            {/* Skipped Feedback */}
            {skipped.length > 0 && (
                <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 text-sm text-orange-800 animate-in slide-in-from-top-2 shadow-sm">
                    <div className="font-semibold mb-2 flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                        Skipped {skipped.length} duplicate(s):
                    </div>
                    <ul className="space-y-2">
                        {skipped.map((s, i) => (
                            <li key={i} className="flex items-center justify-between gap-4 p-2 bg-white/50 rounded-md border border-orange-100">
                                <span className="truncate flex-1">
                                    <span className="font-mono text-[10px] opacity-70 block leading-none mb-1">{s.url}</span>
                                    <span className="font-medium">{s.reason}</span>
                                </span>
                                {s.filename && s.category && s.dateFolder && (
                                    <a
                                      href={getDownloadUrl(`data/${s.category}/${s.dateFolder}/${s.filename}`)}
                                      className="shrink-0 rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 shadow-sm transition-colors"
                                      download
                                    >
                                      Download Now
                                    </a>
                                )}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>

        {/* Queue List */}
        <div className="space-y-4">
            <h2 className="text-sm font-medium text-content-muted uppercase tracking-wider">Active Downloads</h2>
            
            {jobs.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border-subtle bg-surface-subtle/30 py-12 text-center">
                    <p className="text-sm text-content-muted">Queue is empty</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {jobs.map((job) => (
                        <div key={job.id} className="relative overflow-hidden rounded-xl border border-border-subtle bg-surface p-4 shadow-sm transition-all hover:shadow-md">
                            {/* Progress Background */}
                            {job.status === 'downloading' && (
                                <div 
                                    className="absolute bottom-0 left-0 top-0 bg-blue-50/50 transition-all duration-300 ease-linear"
                                    style={{ width: `${job.progress || 0}%` }}
                                ></div>
                            )}
                            
                            <div className="relative z-10 flex items-start justify-between gap-4">
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className={`inline-flex h-2 w-2 rounded-full ${
                                            job.status === 'done' ? 'bg-emerald-500' :
                                            job.status === 'downloading' ? 'bg-blue-500' :
                                            job.status === 'failed' ? 'bg-red-500' : 'bg-zinc-300'
                                        }`} />
                                        <p className="truncate text-sm font-medium text-foreground" title={job.url}>{job.url}</p>
                                    </div>
                                    
                                    <div className="flex items-center gap-3 text-xs text-content-muted">
                                        <span className="capitalize">{job.status}</span>
                                        {job.category && role === 'admin' && (
                                            <>
                                                <span>•</span>
                                                <span className="px-1.5 py-0.5 rounded bg-surface-strong text-[10px]">{job.category}</span>
                                            </>
                                        )}
                                        {job.platform && job.platform !== 'unknown' && (
                                            <>
                                                <span>•</span>
                                                <span className={platformBadgeClass(job.platform)}>{platformLabel(job.platform)}</span>
                                            </>
                                        )}
                                        {job.status === 'downloading' && (
                                            <>
                                                <span>•</span>
                                                <span>{job.progress?.toFixed(1)}%</span>
                                                <span>•</span>
                                                <span>{job.eta || '--:--'}</span>
                                            </>
                                        )}
                                        {job.filename && (
                                            <>
                                                <span>•</span>
                                                <span className="truncate max-w-[200px]">{job.filename}</span>
                                            </>
                                        )}
                                        {job.error && (
                                            <span className="text-red-500 truncate max-w-[200px]">{job.error}</span>
                                        )}
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                  {job.status === 'done' && job.filename && (
                                    <a
                                      href={getDownloadUrl(getJobDownloadPath(job))}
                                      className="shrink-0 rounded-md bg-blue-500 px-3 py-1 text-xs font-medium text-white hover:bg-blue-600 transition-colors"
                                      download
                                    >
                                      Download File
                                    </a>
                                  )}
                                  {(job.status === 'queued' || job.status === 'downloading') && (
                                    <button
                                      onClick={() => handleCancel(job.id)}
                                      className="shrink-0 rounded-md bg-surface-subtle px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors"
                                    >
                                      Cancel
                                    </button>
                                  )}
                                  {job.status === 'failed' && (
                                    <button
                                        onClick={() => handleRetry(job.id)}
                                        className="shrink-0 rounded-md bg-surface-subtle px-2 py-1 text-xs font-medium text-foreground hover:bg-surface-strong transition-colors"
                                    >
                                        Retry
                                    </button>
                                  )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
      </div>
    </>
  );
}
