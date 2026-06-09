import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import { deleteJob, DownloadJob, AddJobResponse, listCategories, getRole, getDownloadUrl, fetchWithAuth, getHistory, retryJob, redownloadJob, getPreviewUrl } from '../lib/api';
import { API_BASE } from '../lib/config';
import SearchableSelect from '../components/SearchableSelect';
import HistoryTable from '../components/HistoryTable';
import { platformLabel, platformBadgeClass } from '../lib/utils';
import { useVisibilityPolling } from '../hooks/useVisibilityPolling';

const CustomVideoPlayer = dynamic(() => import('../components/CustomVideoPlayer'), { ssr: false });

function ExpiryCountdown({ expiresAt }: { expiresAt: number }) {
  const [timeLeft, setTimeLeft] = useState(expiresAt - Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(expiresAt - Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);

  if (timeLeft <= 0) return <span className="text-[10px] text-red-500 font-medium italic">Expired</span>;

  const totalDuration = 5 * 60 * 1000; // 5 minutes
  const percentage = Math.max(0, Math.min(100, (timeLeft / totalDuration) * 100));
  
  const minutes = Math.floor(timeLeft / 60000);
  const seconds = Math.floor((timeLeft % 60000) / 1000);

  return (
    <div className="flex items-center gap-2 min-w-[80px]">
        <div className="h-1 w-12 bg-surface-strong rounded-full overflow-hidden">
            <div 
                className={`h-full transition-all duration-1000 ease-linear ${percentage < 20 ? 'bg-red-500' : 'bg-orange-400'}`}
                style={{ width: `${percentage}%` }}
            />
        </div>
        <span className="text-[10px] tabular-nums font-medium text-content-muted">
            {minutes}:{seconds.toString().padStart(2, '0')}
        </span>
    </div>
  );
}

export default function Queue() {
  const router = useRouter();
  const [urls, setUrls] = useState('');
  const [jobs, setJobs] = useState<DownloadJob[]>([]);
  const [historyJobs, setHistoryJobs] = useState<DownloadJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [skipped, setSkipped] = useState<{ url: string; reason: string; filename?: string; category?: string; dateFolder?: string }[]>([]);

  const [categories, setCategories] = useState<string[]>(['default']);
  const [selectedCategory, setSelectedCategory] = useState('default');
  const [refreshing, setRefreshing] = useState(false);
  const [role, setRole] = useState<string | null>(null);

  // Preview Modal State
  const [previewJob, setPreviewJob] = useState<DownloadJob | null>(null);
  const [previewSrc, setPreviewSrc] = useState('');

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

  const fetchHistory = useCallback(async () => {
    try {
      const data = await getHistory(1, 10);
      setHistoryJobs(data.items);
    } catch (err) {
      console.error('Failed to fetch history:', err);
    }
  }, []);

  const handleManualRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([fetchJobs(), fetchHistory()]);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchCategories();
    fetchHistory();
  }, [fetchHistory]);

  useVisibilityPolling(fetchJobs, 5000, { runImmediately: true });
  useVisibilityPolling(fetchHistory, 15000, { runImmediately: false });

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

  const [retryingIds, setRetryingIds] = useState<Set<string>>(new Set());

  const handleRetry = async (id: string) => {
    setRetryingIds(prev => new Set(prev).add(id));
    try {
      await retryJob(id);
      fetchJobs();
      fetchHistory();
    } catch (error) {
      console.error('Failed to retry job:', error);
      alert('Failed to retry job');
    } finally {
      setRetryingIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleRedownload = async (id: string) => {
    setRetryingIds(prev => new Set(prev).add(id));
    try {
      await redownloadJob(id);
      fetchJobs();
      fetchHistory();
    } catch (error) {
      console.error('Failed to redownload job:', error);
      alert('Failed to redownload job');
    } finally {
      setRetryingIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleCancel = async (id: string) => {
    if (!confirm('Cancel this download?')) return;
    try {
      await deleteJob(id);
      fetchJobs();
      fetchHistory();
    } catch (error) {
      console.error('Failed to cancel job:', error);
      alert('Failed to cancel job');
    }
  };

  const handleDeleteHistory = async (id: string) => {
    if (!confirm('Delete this history entry?')) return;
    try {
      await deleteJob(id);
      fetchHistory();
    } catch (error) {
      console.error('Failed to delete history:', error);
    }
  };

  const handlePreview = (job: DownloadJob) => {
    if (!job.filename) return;
    const ts = job.completedAt || job.createdAt;
    const date = new Date(ts);
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const dateFolder = `${yyyy}-${mm}-${dd}`;
    setPreviewSrc(getPreviewUrl(dateFolder, job.filename));
    setPreviewJob(job);
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
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-extrabold tracking-tight text-gradient-purple font-display">Queue</h1>
              {role && (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                  role === 'admin' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' :
                  role === 'premium_member' ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' :
                  'bg-content-subtle/10 text-content-muted border border-border'
                }`}>
                  {role.replace('_member', '').replace('guest', 'Guest')}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleManualRefresh}
                disabled={refreshing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-surface-subtle/50 text-sm font-medium hover:bg-surface-strong hover:scale-105 active:scale-95 transition-all duration-200 disabled:opacity-50"
                title="Refresh jobs manually"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={refreshing ? 'animate-spin' : ''}>
                  <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                  <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                  <path d="M16 16h5v5" />
                </svg>
                <span>Refresh</span>
              </button>
              <div className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse glow-cyan" title="Live updates active"></div>
            </div>
        </header>

        {/* Input Area */}
        <div className="space-y-4">
            <div className="group relative rounded-xl border border-border bg-surface p-1 shadow-md focus-within:border-neon-purple/50 focus-within:ring-1 focus-within:ring-neon-purple/30 transition-all duration-300">
                <textarea
                className="block w-full rounded-lg border-0 bg-transparent p-4 text-foreground placeholder:text-content-subtle focus:ring-0 sm:text-sm resize-none font-sans"
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
                        className="inline-flex shrink-0 items-center justify-center rounded-lg bg-neon-purple hover:bg-neon-purple/90 px-5 py-2 text-sm font-semibold text-white shadow-lg active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
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
                    {jobs.map((job) => {
                        const isYoutube = job.platform === 'youtube';
                        const isTiktok = job.platform === 'tiktok';
                        const isInstagram = job.platform === 'instagram';
                        
                        let cardGlow = "hover:glow-purple border-purple-500/10";
                        let progressBg = "bg-purple-500/10";
                        let statusColor = "bg-purple-500";
                        if (isYoutube) {
                          cardGlow = "hover:glow-red border-red-500/15";
                          progressBg = "bg-red-500/15";
                          statusColor = "bg-red-500 glow-red";
                        } else if (isTiktok) {
                          cardGlow = "hover:glow-cyan border-cyan-500/15";
                          progressBg = "bg-cyan-500/15";
                          statusColor = "bg-cyan-500 glow-cyan";
                        } else if (isInstagram) {
                          cardGlow = "hover:glow-pink border-pink-500/15";
                          progressBg = "bg-pink-500/15";
                          statusColor = "bg-pink-500 glow-pink";
                        }

                        return (
                          <div key={job.id} className={`relative overflow-hidden rounded-2xl border bg-surface/50 p-4 shadow-md transition-all duration-300 hover-scale glass-premium ${cardGlow}`}>
                              {/* Progress Background */}
                              {job.status === 'downloading' && (
                                  <div 
                                      className={`absolute bottom-0 left-0 top-0 ${progressBg} transition-all duration-300 ease-linear`}
                                      style={{ width: `${job.progress || 0}%` }}
                                  ></div>
                              )}
                              
                              <div className="relative z-10 flex items-start justify-between gap-4">
                                  <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-2 mb-1">
                                          <span className={`inline-flex h-2 w-2 rounded-full ${
                                              job.status === 'done' ? 'bg-emerald-500' :
                                              job.status === 'downloading' ? statusColor :
                                              job.status === 'failed' ? 'bg-red-500' :
                                              job.status === 'missing' ? 'bg-zinc-500' : 'bg-zinc-400'
                                          }`} />
                                          <p className="truncate text-sm font-medium text-foreground" title={job.url}>{job.url}</p>
                                      </div>
                                      
                                      <div className="flex items-center gap-3 text-xs text-content-muted">
                                          <span className="capitalize">{job.status === 'missing' ? 'Expired' : job.status}</span>
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
                                          {job.expiresAt && job.status === 'done' && (
                                              <>
                                                  <span>•</span>
                                                  <ExpiryCountdown expiresAt={job.expiresAt} />
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
                                        className="shrink-0 rounded-lg bg-neon-purple hover:bg-neon-purple/90 px-3.5 py-1.5 text-xs font-semibold text-white shadow-md transition-all duration-200 active:scale-95"
                                        download
                                      >
                                        Download File
                                      </a>
                                    )}
                                    {(job.status === 'queued' || job.status === 'downloading') && (
                                      <button
                                        onClick={() => handleCancel(job.id)}
                                        className="shrink-0 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-500/20 hover:text-red-300 transition-all duration-200 active:scale-95"
                                      >
                                        Cancel
                                      </button>
                                    )}
                                    {(job.status === 'failed' || job.status === 'missing') && (
                                      <button
                                          onClick={() => handleRetry(job.id)}
                                          disabled={retryingIds.has(job.id)}
                                          className="shrink-0 rounded-lg bg-surface-strong/50 border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-surface-strong hover:scale-105 active:scale-95 transition-all duration-200 disabled:opacity-50"
                                      >
                                          {retryingIds.has(job.id) ? 'Retrying...' : `Retry${job.retries > 0 ? ` (${job.retries})` : ''}`}
                                      </button>
                                    )}
                                  </div>
                              </div>
                          </div>
                        );
                    })}
                </div>
            )}
        </div>

        {/* History Section for Guests/Non-admins */}
        {role !== 'admin' && (
            <div className="space-y-4 pt-4 border-t border-border-subtle">
                <div className="flex items-center justify-between">
                    <h2 className="text-sm font-medium text-content-muted uppercase tracking-wider">Recent History</h2>
                </div>
                <HistoryTable 
                    jobs={historyJobs}
                    onRetry={handleRetry}
                    onRedownload={handleRedownload}
                    onPreview={handlePreview}
                    onDelete={handleDeleteHistory}
                    retryingIds={retryingIds}
                />
            </div>
        )}

        {previewJob && (
          <CustomVideoPlayer 
            src={previewSrc}
            onClose={() => {
                setPreviewJob(null);
                setPreviewSrc('');
            }}
          />
        )}
      </div>
    </>
  );
}
