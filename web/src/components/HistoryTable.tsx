import React, { useState, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { DownloadJob, getDownloadUrl } from "../lib/api";
import StatusBadge from "./StatusBadge";
import { platformLabel, platformBadgeClass } from "../lib/utils";
import CategoryBadge from "./CategoryBadge";
import { Trash2, Play, ChevronDown } from "lucide-react";

interface HistoryTableProps {
	jobs: DownloadJob[];
	onRetry: (id: string) => void;
	onRedownload: (id: string) => void;
	onPreview: (job: DownloadJob) => void;
	onDelete: (id: string) => void;
	retryingIds?: Set<string>;
	maxRetries?: number;
}

const ROW_HEIGHT = 60;
const EXPANDED_ROW_HEIGHT = 200;

export default function HistoryTable({
	jobs,
	onRetry,
	onRedownload,
	onPreview,
	onDelete,
	retryingIds = new Set(),
	maxRetries = 5,
}: HistoryTableProps) {
	const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
	const parentRef = useRef<HTMLDivElement>(null);

	const formatDate = (ts: number | null | undefined) => {
		if (!ts) return "—";
		return new Date(ts).toLocaleString("en-US", {
			month: "short",
			day: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		});
	};

	const getFileDateFolder = (ts: number | null | undefined) => {
		if (!ts) return "unknown";
		const date = new Date(ts);
		const yyyy = date.getFullYear();
		const mm = String(date.getMonth() + 1).padStart(2, "0");
		const dd = String(date.getDate()).padStart(2, "0");
		return `${yyyy}-${mm}-${dd}`;
	};

	const toggleExpand = (id: string, e: React.MouseEvent) => {
		e.stopPropagation();
		setExpandedRows((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	};

	const rowVirtualizer = useVirtualizer({
		count: jobs.length,
		getScrollElement: () => parentRef.current,
		estimateSize: (index) => {
			const job = jobs[index];
			const uniqueKey = job.id ? `${job.id}-${index}` : `fallback-${index}`;
			return expandedRows.has(uniqueKey) ? EXPANDED_ROW_HEIGHT : ROW_HEIGHT;
		},
		overscan: 5,
	});

	if (jobs.length === 0) {
		return (
			<div className="text-center py-12 border border-dashed border-border-subtle rounded-xl bg-surface-subtle/30">
				<p className="text-sm text-content-muted">No history available</p>
			</div>
		);
	}

	return (
		<div className="overflow-hidden rounded-xl border border-border-subtle bg-surface shadow-sm">
			<div className="overflow-x-auto" ref={parentRef} style={{ height: 600 }}>
				<table className="w-full min-w-max text-left text-sm whitespace-nowrap border-collapse">
					<thead className="bg-surface-subtle border-b border-border-subtle text-xs uppercase tracking-wider text-content-muted font-medium sticky top-0 z-10">
						<tr>
							<th className="px-4 py-3 w-[120px]">Date</th>
							<th className="px-4 py-3 w-[100px]">Platform</th>
							<th className="px-4 py-3 min-w-[200px] max-w-[300px]">
								Creator & Caption
							</th>
							<th className="px-4 py-3 w-[120px]">Category</th>
							<th className="px-4 py-3 w-[100px]">Status</th>
							<th className="px-4 py-3 w-[200px] text-right">Actions</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-border-subtle bg-surface">
						<div
							style={{
								height: rowVirtualizer.getTotalSize(),
								width: "100%",
								position: "relative",
							}}
						>
							{rowVirtualizer.getVirtualItems().map((virtualRow) => {
								const job = jobs[virtualRow.index];
								const index = virtualRow.index;
								const uniqueKey = job.id
									? `${job.id}-${index}`
									: `fallback-${index}`;
								const isExpanded = expandedRows.has(uniqueKey);
								const rowHeight = isExpanded ? EXPANDED_ROW_HEIGHT : ROW_HEIGHT;

								return (
									<React.Fragment key={uniqueKey}>
										<tr
											className="hover:bg-surface-subtle/50 transition-colors"
											style={{
												position: "absolute",
												top: 0,
												left: 0,
												width: "100%",
												height: rowHeight,
												transform: `translateY(${virtualRow.start}px)`,
											}}
										>
											<td className="px-4 py-3 text-content-muted font-mono text-xs">
												<button
													onClick={(e) => toggleExpand(uniqueKey, e)}
													className="flex items-center gap-1 hover:text-foreground transition-colors"
													aria-label={isExpanded ? "Collapse" : "Expand"}
												>
													<ChevronDown
														width={14}
														height={14}
														strokeWidth={2}
														className={`text-content-muted transition-transform ${isExpanded ? "rotate-180" : ""}`}
													/>
													{formatDate(job.createdAt)}
												</button>
											</td>

											<td className="px-4 py-3">
												{job.platform && job.platform !== "unknown" ? (
													<span className={platformBadgeClass(job.platform)}>
														{platformLabel(job.platform)}
													</span>
												) : (
													<span className="text-content-muted text-xs">—</span>
												)}
											</td>

											<td className="px-4 py-3 max-w-[300px]">
												<div className="flex flex-col">
													{job.creator_name && (
														<span
															className="font-medium text-xs text-foreground truncate"
															title={job.creator_name}
														>
															{job.creator_name}
														</span>
													)}
													{job.caption && (
														<span
															className="text-[10px] text-content-muted truncate"
															title={job.caption}
														>
															{job.caption.length > 60
																? job.caption.substring(0, 60) + "..."
																: job.caption}
														</span>
													)}
													{!job.creator_name && !job.caption && (
														<span className="text-content-muted text-xs">
															—
														</span>
													)}
												</div>
											</td>

											<td className="px-4 py-3">
												<CategoryBadge category={job.category || "default"} />
											</td>

											<td className="px-4 py-3">
												<StatusBadge status={job.status} />
											</td>

											<td className="px-4 py-3 text-right">
												<div className="flex justify-end gap-2">
													{job.status === "failed" && (
														<button
															onClick={(e) => {
																e.stopPropagation();
																onRetry(job.id);
															}}
															disabled={
																retryingIds.has(job.id) ||
																job.retries >= maxRetries
															}
															className={`text-xs font-medium px-2 py-1 rounded transition-colors disabled:opacity-50 ${
																job.retries >= maxRetries
																	? "text-gray-400 cursor-not-allowed"
																	: "text-blue-600 hover:text-blue-700 hover:bg-blue-50"
															}`}
															title={
																job.retries >= maxRetries
																	? `Max retries (${maxRetries}) reached`
																	: `Retry (${job.retries}/${maxRetries})`
															}
														>
															{retryingIds.has(job.id)
																? "Retrying..."
																: job.retries >= maxRetries
																	? `Max (${job.retries})`
																	: `Retry (${job.retries}/${maxRetries})`}
														</button>
													)}
													{job.status === "missing" && (
														<button
															onClick={(e) => {
																e.stopPropagation();
																onRedownload(job.id);
															}}
															disabled={retryingIds.has(job.id)}
															className="text-xs font-medium text-orange-600 hover:text-orange-700 hover:bg-orange-50 px-2 py-1 rounded transition-colors disabled:opacity-50"
														>
															{retryingIds.has(job.id)
																? "Retrying..."
																: "Retry"}
														</button>
													)}
													{job.status === "done" && job.filename && (
														<button
															onClick={(e) => {
																e.stopPropagation();
																window.open(
																	getDownloadUrl(
																		`data/${job.category || "default"}/${getFileDateFolder(job.completedAt)}/${job.filename}`,
																	),
																	"_blank",
																	"noopener,noreferrer",
																);
															}}
															className="text-xs font-medium text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 px-2 py-1 rounded transition-colors"
														>
															Open
														</button>
													)}
													<button
														onClick={(e) => {
															e.stopPropagation();
															onDelete(job.id);
														}}
														className="text-xs font-medium text-gray-500 hover:text-red-600 hover:bg-red-50 px-2 py-1 rounded transition-colors"
														title="Delete from history"
													>
														<Trash2
															width={14}
															height={14}
															strokeWidth={2}
															className="text-current"
														/>
													</button>
												</div>
											</td>
										</tr>

										{isExpanded && (
											<tr
												className="bg-surface-subtle/30 border-b border-border-subtle"
												style={{
													position: "absolute",
													top: 0,
													left: 0,
													width: "100%",
													height: EXPANDED_ROW_HEIGHT,
													transform: `translateY(${virtualRow.start + ROW_HEIGHT}px)`,
												}}
											>
												<td colSpan={6} className="px-4 py-4 whitespace-normal">
													<div className="flex flex-col gap-3 text-xs text-content">
														<div className="grid grid-cols-[80px_1fr] gap-2">
															<span className="font-semibold text-content-muted">
																URL:
															</span>
															<button
																onClick={(e) => {
																	e.stopPropagation();
																	window.open(
																		job.url,
																		"_blank",
																		"noopener,noreferrer",
																	);
																}}
																className="text-blue-500 hover:underline break-all text-left font-normal bg-transparent p-0"
															>
																{job.url}
															</button>
														</div>
														<div className="grid grid-cols-[80px_1fr] gap-2">
															<span className="font-semibold text-content-muted">
																Filename:
															</span>
															<span className="font-mono text-[11px] bg-surface-strong px-1.5 py-0.5 rounded border border-border-subtle self-start break-all">
																{job.filename || "—"}
															</span>
														</div>
														{job.error && (
															<div className="grid grid-cols-[80px_1fr] gap-2">
																<span className="font-semibold text-accent">
																	Error:
																</span>
																<span className="text-red-600 break-words">
																	{job.error}
																</span>
															</div>
														)}
														<div className="grid grid-cols-[80px_1fr] gap-2 items-center">
															<span className="font-semibold text-content-muted">
																Options:
															</span>
															<div className="flex items-center gap-2">
																{job.status === "done" && job.filename && (
																	<button
																		onClick={(e) => {
																			e.stopPropagation();
																			onPreview(job);
																		}}
																		className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border-subtle bg-surface hover:bg-surface-strong transition-colors font-medium text-foreground"
																	>
																		<Play
																			width={12}
																			height={12}
																			className="text-current"
																		/>
																		Preview Video
																	</button>
																)}
																{job.status === "missing" && (
																	<span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-600/10">
																		File Expired/Missing
																	</span>
																)}
																{job.status !== "done" &&
																	job.status !== "missing" && (
																		<span className="text-content-muted italic">
																			None available
																		</span>
																	)}
															</div>
														</div>
													</div>
												</td>
											</tr>
										)}
									</React.Fragment>
								);
							})}
						</div>
					</tbody>
				</table>
			</div>
		</div>
	);
}
