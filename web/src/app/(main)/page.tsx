"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Clock3, Download, HelpCircle, Link2, RefreshCw, X, Zap } from "lucide-react";
import dynamic from "next/dynamic";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useAuthState } from "@/store/app-store";
import { fetchWithAuth, getDownloadUrl, getPreviewUrl, type DownloadJob } from "@/lib/api";
import { API_BASE } from "@/lib/config";
import SearchableSelect from "@/components/SearchableSelect";
import HistoryTable from "@/components/HistoryTable";
import { platformLabel, platformBadgeClass, triggerInvisibleDownload } from "@/lib/utils";
import { useVisibilityPolling } from "@/hooks/useVisibilityPolling";
import { useAddJob, useCategories, useDeleteJob, useHistory, useJobs, useRedownloadJob, useRetryJob } from "@/lib/queries";

const VideoPlayer = dynamic(() => import("@/components/VideoPlayer"), { ssr: false });


export default function QueuePage() {
	const router = useRouter();
	const queryClient = useQueryClient();
	const { role } = useAuthState();
	const [urls, setUrls] = useState("");
	const [selectedCategory, setSelectedCategory] = useState("default");
	const [previewJob, setPreviewJob] = useState<DownloadJob | null>(null);
	const [previewSrc, setPreviewSrc] = useState("");
	const [retryingIds, setRetryingIds] = useState<Set<string>>(new Set());
	const [retryError, setRetryError] = useState<string | null>(null);
	const [skipped, setSkipped] = useState<{ url: string; reason: string; filename?: string; category?: string; dateFolder?: string }[]>([]);
	const clipboardRef = useRef("");
	const { data: jobs = [] } = useJobs();
	const { data: categories = ["default"] } = useCategories();
	const { data: historyData } = useHistory(1, 8);
	const addJobMutation = useAddJob();
	const retryJobMutation = useRetryJob();
	const redownloadJobMutation = useRedownloadJob();
	const deleteJobMutation = useDeleteJob();

	useEffect(() => { if (categories.length && !categories.includes(selectedCategory)) setSelectedCategory(categories[0]); }, [categories, selectedCategory]);
	useEffect(() => { if (!retryError) return; const timer = setTimeout(() => setRetryError(null), 5000); return () => clearTimeout(timer); }, [retryError]);

	const resolveUrl = async (url: string) => {
		try { const response = await fetchWithAuth(`${API_BASE}/files/resolve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) }); if (response.ok) return (await response.json()).url as string; } catch { /* Clipboard/share resolution is optional. */ }
		return null;
	};

	useEffect(() => {
		const params = new URLSearchParams(window.location.search);
		const sharedUrl = params.get("share_url");
		if (!sharedUrl) return;
		setUrls(sharedUrl);
		resolveUrl(sharedUrl).then((resolved) => { if (resolved && resolved !== sharedUrl) setUrls(resolved); });
		params.delete("share_url");
		window.history.replaceState(null, "", params.toString() ? `?${params}` : window.location.pathname);
	}, [router]);

	const fetchClipboard = useCallback(async () => {
		if (!navigator.clipboard?.readText) return;
		try { const text = (await navigator.clipboard.readText()).trim(); if (text && text !== clipboardRef.current && /^https?:\/\//.test(text)) { clipboardRef.current = text; setUrls((current) => current ? `${current}\n${text}` : text); } } catch { /* Clipboard permission is commonly unavailable on mobile. */ }
	}, []);
	useVisibilityPolling(fetchClipboard, 1500, { runImmediately: true });

	const refresh = () => { queryClient.invalidateQueries({ queryKey: ["jobs"] }); queryClient.invalidateQueries({ queryKey: ["history"] }); };
	const addJob = async () => {
		if (!urls.trim()) return;
		try { const result = await addJobMutation.mutateAsync({ urls, category: selectedCategory }); if (result.added.length) setUrls(""); if (result.skipped.length) setSkipped(result.skipped); } catch (error) { setRetryError(error instanceof Error ? error.message : "Could not add these links"); }
	};
	const retry = async (id: string, redownload = false) => {
		if (retryingIds.has(id)) return;
		setRetryingIds((current) => new Set(current).add(id)); setRetryError(null);
		try { await (redownload ? redownloadJobMutation : retryJobMutation).mutateAsync(id); } catch (error) { setRetryError(error instanceof Error ? error.message : "Action failed"); } finally { setRetryingIds((current) => { const next = new Set(current); next.delete(id); return next; }); }
	};
	const cancel = async (id: string) => { if (!confirm("Cancel this download?")) return; try { await deleteJobMutation.mutateAsync(id); } catch { setRetryError("Could not cancel the download"); } };
	const removeHistory = async (id: string) => { if (!confirm("Delete this history entry?")) return; try { await deleteJobMutation.mutateAsync(id); } catch { setRetryError("Could not delete this entry"); } };
	const preview = (job: DownloadJob) => { if (!job.filename) return; const date = new Date(job.completedAt || job.createdAt).toISOString().slice(0, 10); setPreviewSrc(getPreviewUrl(date, job.filename)); setPreviewJob(job); };
	const downloadPath = (job: DownloadJob) => job.filename ? `data/${job.category || "default"}/${new Date(job.completedAt || job.createdAt).toISOString().slice(0, 10)}/${job.filename}` : "";
	const activeJobs = jobs.filter((job) => job.status === "queued" || job.status === "downloading");

	return <div className="space-y-7">
		<header className="flex items-start justify-between gap-4"><div><p className="eyebrow">Capture and process</p><h1 className="page-title mt-1">Queue</h1><p className="page-subtitle">Drop in a link and Tiak handles the rest.</p></div><button type="button" onClick={refresh} className="button-secondary min-h-10 px-3 text-xs" aria-label="Refresh queue"><RefreshCw size={15} /> <span className="hidden sm:inline">Refresh</span></button></header>

		<section className="app-card relative overflow-visible border-accent/25 bg-gradient-to-br from-accent/10 via-surface to-surface p-4 sm:p-6"><div className="flex items-center gap-2 text-xs font-semibold text-accent"><Zap size={15} />Fast capture</div><h2 className="mt-3 max-w-xl text-xl font-semibold tracking-tight sm:text-2xl">Paste links. Keep the source.</h2><p className="mt-2 max-w-lg text-sm leading-6 text-content-muted">Add one or more video links. Your downloads will stay organized by category.</p><div className="relative z-10 mt-5 overflow-visible rounded-2xl border border-border bg-background/45 focus-within:border-accent/70 focus-within:ring-4 focus-within:ring-accent/10"><textarea value={urls} onChange={(event) => setUrls(event.target.value)} rows={4} placeholder="Paste YouTube, TikTok, or Instagram links" className="block min-h-28 w-full resize-none border-0 bg-transparent p-4 text-sm leading-6 text-foreground placeholder:text-content-subtle focus:outline-none focus:ring-0" aria-label="Links to download" /><div className="relative z-20 flex flex-col gap-3 border-t border-border-subtle bg-surface-subtle/55 p-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex min-w-0 items-center gap-2 text-xs text-content-muted">{role === "admin" ? <SearchableSelect options={categories} value={selectedCategory} onChange={setSelectedCategory} className="min-w-0 flex-1 sm:w-44" /> : <><Clock3 size={14} className="shrink-0 text-accent" /><span>Guest links expire after 5 minutes</span></>}</div><button type="button" onClick={addJob} disabled={addJobMutation.isPending || !urls.trim()} className="button-primary w-full sm:w-auto">{addJobMutation.isPending ? "Adding links" : "Add to queue"}</button></div></div><div className="mt-4 flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-content-subtle"><span className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-background/35 px-2.5 py-1.5"><Link2 size={12} /> One link per line</span><span className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-background/35 px-2.5 py-1.5"><Download size={12} /> Auto organized</span></div></section>

		{skipped.length > 0 && <section className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4"><div className="flex items-center gap-2 text-sm font-semibold text-amber-200"><HelpCircle size={16} />{skipped.length} link{skipped.length === 1 ? "" : "s"} already in your library</div><div className="mt-3 grid gap-2">{skipped.map((item, index) => <div key={`${item.url}-${index}`} className="flex items-center justify-between gap-3 rounded-xl bg-background/20 p-3 text-xs"><span className="min-w-0"><span className="block truncate text-content-muted">{item.url}</span><span className="mt-1 block text-amber-100">{item.reason}</span></span>{item.filename && item.category && item.dateFolder && <button type="button" onClick={() => triggerInvisibleDownload(getDownloadUrl(`data/${item.category}/${item.dateFolder}/${item.filename}`))} className="button-secondary min-h-9 shrink-0 border-amber-300/20 bg-amber-100/10 px-3 text-xs text-amber-100">Download</button>}</div>)}</div></section>}
		{retryError && <div className="flex items-start gap-3 rounded-2xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-200"><HelpCircle size={17} className="mt-0.5 shrink-0" /><span className="min-w-0 flex-1">{retryError}</span><button type="button" onClick={() => setRetryError(null)} aria-label="Dismiss error" className="text-red-200/70 hover:text-red-100"><X size={16} /></button></div>}

		<section className="space-y-3"><div className="flex items-end justify-between"><div><p className="eyebrow">Live status</p><h2 className="type-section-header mt-1">Active downloads</h2></div><span className="text-xs text-content-muted">{activeJobs.length} active</span></div>{activeJobs.length === 0 ? <div className="app-card-muted flex flex-col items-center justify-center px-4 py-14 text-center"><span className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-accent/10 text-accent"><CheckCircle2 size={24} /></span><h3 className="text-sm font-semibold">Queue is clear</h3><p className="mt-1 max-w-xs text-xs leading-5 text-content-muted">Paste a link above to start building your library.</p></div> : <div className="grid gap-2">{activeJobs.map((job) => <article key={job.id} className="app-card relative overflow-hidden p-4"><div className="absolute inset-y-0 left-0 bg-accent/[0.08] transition-all" style={{ width: job.status === "downloading" ? `${job.progress || 0}%` : "0%" }} /><div className="relative"><div className="flex items-start gap-3"><span className={`mt-1.5 size-2 shrink-0 rounded-full ${job.status === "downloading" ? "bg-accent shadow-[0_0_0_4px_rgb(var(--accent)/0.12)]" : "bg-content-subtle"}`} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium" title={job.url}>{job.url}</p><div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-content-muted"><span className="capitalize">{job.status}</span>{job.platform && job.platform !== "unknown" && <span className={platformBadgeClass(job.platform)}>{platformLabel(job.platform)}</span>}{job.status === "downloading" && <span>{job.progress?.toFixed(0)}% {job.eta ? ` / ${job.eta}` : ""}</span>}</div></div><button type="button" onClick={() => cancel(job.id)} className="button-secondary min-h-9 shrink-0 px-2.5 text-xs text-red-300 hover:border-red-300/40">Cancel</button></div></div></article>)}</div>}</section>

		{role !== "admin" && <section className="space-y-3 border-t border-border-subtle pt-6"><div className="flex items-end justify-between"><div><p className="eyebrow">Your latest files</p><h2 className="type-section-header mt-1">Recent history</h2></div><span className="text-xs text-content-muted">{historyData?.total || 0} total</span></div><HistoryTable jobs={historyData?.items || []} onRetry={(id) => retry(id)} onRedownload={(id) => retry(id, true)} onPreview={preview} onDelete={removeHistory} retryingIds={retryingIds} maxRetries={5} /></section>}

		{previewJob && <VideoPlayer src={previewSrc} onClose={() => { setPreviewJob(null); setPreviewSrc(""); }} filename={previewJob.filename || undefined} path={downloadPath(previewJob)} />}
	</div>;
}
