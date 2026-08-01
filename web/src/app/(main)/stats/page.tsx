"use client";

import { useMemo } from "react";
import {
	Activity,
	BarChart3,
	CalendarDays,
	CheckCircle2,
	Clock3,
	Download,
	FolderKanban,
	HardDrive,
	LoaderCircle,
	RefreshCw,
	TrendingUp,
	Video,
	XCircle,
} from "lucide-react";
import { useAuthState } from "@/store/app-store";
import { useFiles, useJobs } from "@/lib/queries";
import type { DownloadJob, FileItem } from "@/lib/types";
import { formatBytes, platformLabel } from "@/lib/utils";

const DAY_COUNT = 14;

function MetricCard({
	label,
	value,
	detail,
	icon: Icon,
	tone = "text-accent",
}: {
	label: string;
	value: string | number;
	detail: string;
	icon: typeof Activity;
	tone?: string;
}) {
	return (
		<div className="app-card-interactive app-card-muted p-4 sm:p-5">
			<div className="flex items-start justify-between gap-3">
				<span className={`flex size-9 items-center justify-center rounded-xl bg-accent/10 ${tone}`}>
					<Icon size={17} />
				</span>
				<TrendingUp size={15} className="text-content-subtle" aria-hidden="true" />
			</div>
			<p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.16em] text-content-subtle">{label}</p>
			<p className="mt-1 truncate font-mono text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{value}</p>
			<p className="mt-1 truncate text-xs text-content-muted">{detail}</p>
		</div>
	);
}

function ProgressRow({
	label,
	value,
	total,
	color = "bg-accent",
	suffix,
}: {
	label: string;
	value: number;
	total: number;
	color?: string;
	suffix?: string;
}) {
	const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
	return (
		<div>
			<div className="flex items-center justify-between gap-3 text-xs">
				<span className="truncate text-content-muted">{label}</span>
				<span className="shrink-0 font-mono text-content">
					{value}{suffix ? ` ${suffix}` : ""}
				</span>
			</div>
			<div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-strong">
				<div className={`h-full rounded-full ${color} transition-all duration-700`} style={{ width: `${percentage}%` }} />
			</div>
			<p className="mt-1 text-right text-[10px] text-content-subtle">{percentage}% of total</p>
		</div>
	);
}

function dateLabel(date: string) {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
	const parsed = new Date(`${date}T00:00:00`);
	return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function flattenFiles(filesData: { byDate: Record<string, FileItem[]> } | undefined) {
	if (!filesData) return [];
	return Object.entries(filesData.byDate ?? {}).flatMap(([date, items]) =>
		items.map((item) => ({
			...item,
			dateFolder: item.dateFolder || date,
			category: item.category || "default",
		})),
	);
}

function getStatusCount(jobs: DownloadJob[], status: DownloadJob["status"]) {
	return jobs.filter((job) => job.status === status).length;
}

export default function StatsPage() {
	const { role } = useAuthState();
	const canViewStats = role === "admin" || role === "premium_member";
	const filesQuery = useFiles(canViewStats);
	const jobsQuery = useJobs({ enabled: canViewStats });
	const files = useMemo(() => flattenFiles(filesQuery.data), [filesQuery.data]);
	const jobs = useMemo(() => jobsQuery.data ?? [], [jobsQuery.data]);

	const summary = useMemo(() => {
		const categoryCounts = new Map<string, number>();
		const platformCounts = new Map<string, number>();
		const dateCounts = new Map<string, number>();
		let totalBytes = 0;

		files.forEach((file) => {
			totalBytes += file.size;
			categoryCounts.set(file.category, (categoryCounts.get(file.category) ?? 0) + 1);
			dateCounts.set(file.dateFolder, (dateCounts.get(file.dateFolder) ?? 0) + 1);
		});
		jobs.forEach((job) => {
			const platform = job.platform?.trim() || "unknown";
			platformCounts.set(platform, (platformCounts.get(platform) ?? 0) + 1);
		});

		const sortedCategories = [...categoryCounts.entries()].sort((a, b) => b[1] - a[1]);
		const sortedPlatforms = [...platformCounts.entries()].sort((a, b) => b[1] - a[1]);
		const sortedDates = [...dateCounts.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-DAY_COUNT);
		const done = getStatusCount(jobs, "done");
		const failed = getStatusCount(jobs, "failed");
		const missing = getStatusCount(jobs, "missing");
		const terminalJobs = done + failed + missing;

		return {
			totalBytes,
			categoryCounts: sortedCategories,
			platformCounts: sortedPlatforms,
			dateCounts: sortedDates,
			done,
			failed,
			missing,
			queued: getStatusCount(jobs, "queued"),
			downloading: getStatusCount(jobs, "downloading"),
			completionRate: terminalJobs > 0 ? Math.round((done / terminalJobs) * 100) : 0,
		};
	}, [files, jobs]);

	const refresh = async () => {
		await Promise.all([filesQuery.refetch(), jobsQuery.refetch()]);
	};

	if (!canViewStats) {
		return (
			<div className="app-card mx-auto flex min-h-[40dvh] max-w-md flex-col items-center justify-center p-8 text-center">
				<BarChart3 size={32} className="text-accent" />
				<h1 className="mt-4 text-2xl font-semibold">Member stats</h1>
				<p className="mt-2 text-sm leading-6 text-content-muted">Sign in as a premium member to see your library activity and download trends.</p>
			</div>
		);
	}

	const loading = filesQuery.isLoading || jobsQuery.isLoading;
	const hasData = files.length > 0 || jobs.length > 0;
	const maxActivity = Math.max(...summary.dateCounts.map(([, count]) => count), 1);
	const categoryTotal = summary.categoryCounts.reduce((total, [, count]) => total + count, 0);
	const platformTotal = summary.platformCounts.reduce((total, [, count]) => total + count, 0);

	return (
		<div className="space-y-7">
			<header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
				<div>
					<p className="eyebrow">Library pulse</p>
					<h1 className="page-title mt-1">Statistics</h1>
					<p className="page-subtitle">A quick read on your saved media and download activity.</p>
				</div>
				<button type="button" onClick={refresh} disabled={loading} className="button-secondary min-h-10 self-start px-3 text-xs sm:self-auto">
					<RefreshCw size={14} className={loading ? "animate-spin" : ""} />
					Refresh
				</button>
			</header>

			{filesQuery.isError || jobsQuery.isError ? (
				<div className="rounded-2xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-200">
					Some statistics could not be loaded. Try refreshing the dashboard.
				</div>
			) : null}

			<section className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3" aria-label="Summary statistics">
				<MetricCard label="Saved media" value={loading ? "—" : files.length} detail="Files in your library" icon={Video} />
				<MetricCard label="Storage used" value={loading ? "—" : formatBytes(summary.totalBytes)} detail="Across saved media" icon={HardDrive} />
				<MetricCard label="Success rate" value={loading ? "—" : `${summary.completionRate}%`} detail="Completed terminal jobs" icon={CheckCircle2} tone="text-emerald-300" />
				<MetricCard label="In motion" value={loading ? "—" : summary.queued + summary.downloading} detail={`${summary.downloading} downloading now`} icon={Activity} tone="text-amber-300" />
			</section>

			{!loading && !hasData ? (
				<div className="app-card-muted flex flex-col items-center justify-center px-6 py-20 text-center">
					<span className="flex size-12 items-center justify-center rounded-2xl bg-accent/10 text-accent"><BarChart3 size={24} /></span>
					<h2 className="mt-4 text-base font-semibold">Your stats are waiting</h2>
					<p className="mt-2 max-w-sm text-sm leading-6 text-content-muted">Add a download or save some media and this dashboard will start building your activity picture.</p>
				</div>
			) : (
				<>
					<div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
						<section className="app-card p-4 sm:p-6" aria-labelledby="activity-heading">
							<div className="flex items-end justify-between gap-3">
								<div>
									<p className="eyebrow">Last {DAY_COUNT} active days</p>
									<h2 id="activity-heading" className="type-section-header mt-1 flex items-center gap-2"><CalendarDays size={17} className="text-accent" />Saved media activity</h2>
								</div>
								<span className="text-xs text-content-muted">{files.length} saved</span>
							</div>
							{summary.dateCounts.length > 0 ? (
								<div className="mt-8 flex h-48 items-end gap-2 border-b border-border-subtle pb-0 sm:gap-3">
									{summary.dateCounts.map(([date, count]) => (
										<div key={date} className="group flex min-w-0 flex-1 flex-col items-center justify-end gap-2">
											<span className="rounded-md bg-surface-strong px-1.5 py-1 text-[10px] font-semibold text-foreground opacity-0 transition-opacity group-hover:opacity-100">{count}</span>
											<div className="flex h-32 w-full items-end justify-center">
												<div className="w-full max-w-8 rounded-t-lg bg-accent/80 transition-all duration-700 group-hover:bg-accent" style={{ height: `${Math.max(10, (count / maxActivity) * 100)}%` }} />
											</div>
											<span className="max-w-full truncate text-[10px] text-content-subtle">{dateLabel(date)}</span>
										</div>
									))}
								</div>
							) : (
								<div className="flex h-48 items-center justify-center text-sm text-content-muted">No completed media yet.</div>
							)}
						</section>

						<section className="app-card p-4 sm:p-6" aria-labelledby="queue-heading">
							<div>
								<p className="eyebrow">Job health</p>
								<h2 id="queue-heading" className="type-section-header mt-1 flex items-center gap-2"><LoaderCircle size={17} className="text-accent" />Queue breakdown</h2>
							</div>
							<div className="mt-6 space-y-5">
								<ProgressRow label="Completed" value={summary.done} total={jobs.length} color="bg-emerald-400" />
								<ProgressRow label="Queued" value={summary.queued} total={jobs.length} color="bg-amber-400" />
								<ProgressRow label="Downloading" value={summary.downloading} total={jobs.length} color="bg-accent" />
								<ProgressRow label="Failed or expired" value={summary.failed + summary.missing} total={jobs.length} color="bg-red-400" />
							</div>
						</section>
				</div>

					<div className="grid gap-4 lg:grid-cols-2">
						<section className="app-card p-4 sm:p-6" aria-labelledby="category-heading">
							<div className="flex items-end justify-between gap-3">
								<div>
									<p className="eyebrow">Organization</p>
									<h2 id="category-heading" className="type-section-header mt-1 flex items-center gap-2"><FolderKanban size={17} className="text-accent" />By category</h2>
								</div>
								<span className="text-xs text-content-muted">{summary.categoryCounts.length} categories</span>
							</div>
							<div className="mt-6 space-y-4">
								{summary.categoryCounts.slice(0, 6).map(([category, count]) => <ProgressRow key={category} label={category} value={count} total={categoryTotal} />)}
								{summary.categoryCounts.length === 0 && <p className="text-sm text-content-muted">No categorized files yet.</p>}
								{summary.categoryCounts.length > 6 && <p className="text-xs text-content-subtle">Showing the 6 most used categories.</p>}
							</div>
						</section>

						<section className="app-card p-4 sm:p-6" aria-labelledby="platform-heading">
							<div className="flex items-end justify-between gap-3">
								<div>
									<p className="eyebrow">Source mix</p>
									<h2 id="platform-heading" className="type-section-header mt-1 flex items-center gap-2"><Download size={17} className="text-accent" />By platform</h2>
								</div>
								<span className="text-xs text-content-muted">{platformTotal} tracked jobs</span>
							</div>
							<div className="mt-6 space-y-4">
								{summary.platformCounts.slice(0, 6).map(([platform, count]) => <ProgressRow key={platform} label={platform === "unknown" ? "Unknown source" : platformLabel(platform)} value={count} total={platformTotal} />)}
								{summary.platformCounts.length === 0 && <p className="text-sm text-content-muted">Platform data will appear after your first download.</p>}
							</div>
						</section>
					</div>

					<section className="app-card-muted grid gap-4 p-4 sm:grid-cols-3 sm:p-5" aria-label="Additional statistics">
						<div className="flex items-center gap-3"><span className="flex size-9 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-300"><CheckCircle2 size={17} /></span><div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-content-subtle">Completed</p><p className="mt-1 font-mono text-lg font-semibold">{summary.done}</p></div></div>
						<div className="flex items-center gap-3"><span className="flex size-9 items-center justify-center rounded-xl bg-amber-400/10 text-amber-300"><Clock3 size={17} /></span><div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-content-subtle">Waiting</p><p className="mt-1 font-mono text-lg font-semibold">{summary.queued}</p></div></div>
						<div className="flex items-center gap-3"><span className="flex size-9 items-center justify-center rounded-xl bg-red-400/10 text-red-300"><XCircle size={17} /></span><div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-content-subtle">Needs attention</p><p className="mt-1 font-mono text-lg font-semibold">{summary.failed + summary.missing}</p></div></div>
					</section>
				</>
			)}
		</div>
	);
}
