"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Filter, Search, SlidersHorizontal } from "lucide-react";
import dynamic from "next/dynamic";
import { type DownloadJob, getHistory, getStreamUrl } from "@/lib/api";
import HistoryTable from "@/components/HistoryTable";
import HistoryToolbar from "@/components/HistoryToolbar";
import { useDeleteJob, useRedownloadJob, useRetryJob } from "@/lib/queries";

const VideoPlayer = dynamic(() => import("@/components/VideoPlayer"), { ssr: false });
type StatusFilter = "all" | "queued" | "downloading" | "done" | "failed" | "imported" | "missing";

export default function HistoryPage() {
	const [jobs, setJobs] = useState<DownloadJob[]>([]);
	const [total, setTotal] = useState(0);
	const [loading, setLoading] = useState(true);
	const [page, setPage] = useState(1);
	const [searchQuery, setSearchQuery] = useState("");
	const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
	const [retryFilter, setRetryFilter] = useState(false);
	const [retryingIds, setRetryingIds] = useState<Set<string>>(new Set());
	const [previewJob, setPreviewJob] = useState<(DownloadJob & { _computedPath?: string }) | null>(null);
	const [previewSrc, setPreviewSrc] = useState("");
	const pageSize = 50;
	const retryJobMutation = useRetryJob();
	const redownloadJobMutation = useRedownloadJob();
	const deleteJobMutation = useDeleteJob();

	const fetchData = useCallback(async () => { setLoading(true); try { const data = await getHistory(page, pageSize); setJobs(data.items); setTotal(data.total); } catch (error) { console.error(error); } finally { setLoading(false); } }, [page]);
	useEffect(() => { fetchData(); }, [fetchData]);
	const actOnJob = async (id: string, redownload = false) => { if (retryingIds.has(id)) return; setRetryingIds((previous) => new Set(previous).add(id)); try { await (redownload ? redownloadJobMutation : retryJobMutation).mutateAsync(id); fetchData(); } catch (error) { console.error(error); } finally { setRetryingIds((previous) => { const next = new Set(previous); next.delete(id); return next; }); } };
	const handleDelete = async (id: string) => { if (!confirm("Delete this history entry?")) return; try { await deleteJobMutation.mutateAsync(id); fetchData(); } catch (error) { console.error(error); } };
	const handlePreview = (job: DownloadJob) => { if (!job.filename) return; const path = `data/${job.category || "default"}/${new Date(job.completedAt || job.createdAt).toISOString().slice(0, 10)}/${job.filename}`; setPreviewSrc(getStreamUrl(path)); setPreviewJob({ ...job, _computedPath: path }); };
	const filteredJobs = useMemo(() => jobs.filter((job) => { const query = searchQuery.toLowerCase(); const matchesSearch = job.url.toLowerCase().includes(query) || Boolean(job.filename?.toLowerCase().includes(query)) || Boolean(job.creator_name?.toLowerCase().includes(query)); return matchesSearch && (statusFilter === "all" || job.status === statusFilter) && (!retryFilter || job.retries > 0); }), [jobs, searchQuery, statusFilter, retryFilter]);
	const totalPages = Math.max(1, Math.ceil(total / pageSize));

	return <div className="space-y-6"><header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="eyebrow">Your activity</p><h1 className="page-title mt-1">History</h1><p className="page-subtitle">Find, retry, or export past downloads.</p></div><HistoryToolbar onImportSuccess={fetchData} onImportError={(message) => console.error(message)} /></header><section className="app-card-muted p-3 sm:p-4"><div className="flex items-center gap-2"><div className="relative min-w-0 flex-1"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-content-subtle" /><input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search links, creators, or filenames" className="app-input w-full pl-9" aria-label="Search history" /></div><span className="hidden items-center gap-1 text-xs text-content-muted sm:flex"><Filter size={14} />{filteredJobs.length}</span></div><div className="mt-3 grid grid-cols-2 gap-2"><label className="relative"><SlidersHorizontal size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-content-subtle" /><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)} className="app-input w-full appearance-none pl-9" aria-label="Filter by status"><option value="all">All status</option><option value="done">Completed</option><option value="failed">Failed</option><option value="downloading">Downloading</option><option value="queued">Queued</option><option value="missing">Expired</option><option value="imported">Imported</option></select></label><button type="button" onClick={() => setRetryFilter((value) => !value)} className={`min-h-11 rounded-xl border text-sm font-medium transition ${retryFilter ? "border-accent bg-accent/10 text-accent" : "border-border bg-surface-subtle text-content-muted hover:text-foreground"}`}>{retryFilter ? "Showing retried" : "Only retried"}</button></div></section>{loading ? <div className="app-card-muted flex flex-col items-center justify-center gap-3 py-20 text-sm text-content-muted"><span className="size-6 animate-spin rounded-full border-2 border-border border-t-accent" />Loading history</div> : <><HistoryTable jobs={filteredJobs} onRetry={(id) => actOnJob(id)} onRedownload={(id) => actOnJob(id, true)} onPreview={handlePreview} onDelete={handleDelete} retryingIds={retryingIds} maxRetries={5} /><div className="flex items-center justify-between border-t border-border-subtle pt-4"><button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page === 1} className="button-secondary min-h-10 px-3 text-xs">Previous</button><span className="text-xs text-content-muted">Page <strong className="text-foreground">{page}</strong> of {totalPages}</span><button type="button" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={page >= totalPages} className="button-secondary min-h-10 px-3 text-xs">Next</button></div></>}{previewJob && <VideoPlayer src={previewSrc} onClose={() => { setPreviewJob(null); setPreviewSrc(""); }} filename={previewJob.filename || undefined} path={previewJob._computedPath} />}</div>;
}
