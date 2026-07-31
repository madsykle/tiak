import React, { useState } from "react";
import { DownloadJob, getDownloadUrl } from "../lib/api";
import StatusBadge from "./StatusBadge";
import { platformLabel, platformBadgeClass } from "../lib/utils";
import CategoryBadge from "./CategoryBadge";
import { Trash2, Play } from "lucide-react";

interface HistoryTableProps {
	jobs: DownloadJob[];
	onRetry: (id: string) => void;
	onRedownload: (id: string) => void;
	onPreview: (job: DownloadJob) => void;
	onDelete: (id: string) => void;
	retryingIds?: Set<string>;
	maxRetries?: number;
}

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

	const toggleExpand = (id: string) => {
		setExpandedRows((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	};

	const formatDate = (ts: number | null | undefined) => {
		if (!ts) return "—";
		return new Date(ts).toLocaleString("en-US", {
			month: "short",
			day: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		});
	};

	const getFileDateFolder = (ts: number) => {
		const date = new Date(ts);
		const yyyy = date.getFullYear();
		const mm = String(date.getMonth() + 1).padStart(2, "0");
		const dd = String(date.getDate()).padStart(2, "0");
		return `${yyyy}-${mm}-${dd}`;
	};

	if (jobs.length === 0) {
		return (
			<div className="text-center py-12 border border-dashed border-border-subtle rounded-xl bg-surface-subtle/30">
				<p className="text-sm text-content-muted">No history available</p>
			</div>
		);
	}

	return (
		<div className="overflow-hidden rounded-xl border border-border-subtle bg-surface shadow-sm">
			<div className="overflow-x-auto">
				<table className="min-w-full text-left text-sm whitespace-nowrap">
					<thead className="bg-surface-subtle border-b border-border-subtle text-xs uppercase tracking-wider text-content-muted font-medium">
						<tr>
							<th className="px-4 py-3">Date</th>
							<th className="px-4 py-3">Platform</th>
							<th className="px-4 py-3">Creator &amp; Caption</th>
							<th className="px-4 py-3">Category</th>
							<th className="px-4 py-3">Status</th>
							<th className="px-4 py-3 text-right">Actions</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-border-subtle bg-surface">
						{jobs.map((job, index) => {
							const uniqueKey = job.id
								? `${job.id}-${index}`
								: `fallback-${index}`;
							const isExpanded = expandedRows.has(uniqueKey);

							return (
								<React.Fragment key={uniqueKey}>
									<tr
										className="hover:bg-surface-subtle/50 transition-colors cursor-pointer"
										onClick={() => toggleExpand(uniqueKey)}
									>
										<td className="px-4 py-3 text-content-muted font-mono text-xs">
											{formatDate(job.createdAt)}
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

										<td className="px-4 py-3 max-w-[250px]">
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
													<span className="text-content-muted text-xs">—</span>
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
											<div
												className="flex justify-end gap-2"
												onClick={(e) => e.stopPropagation()}
											>
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
														{retryingIds.has(job.id) ? "Retrying..." : "Retry"}
													</button>
												)}
												{job.status === "done" &&
													job.filename &&
													job.completedAt && (
														<a
															href={getDownloadUrl(
																`data/${job.category || "default"}/${getFileDateFolder(job.completedAt)}/${job.filename}`,
															)}
															target="_blank"
															rel="noopener noreferrer"
															onClick={(e) => e.stopPropagation()}
															className="text-xs font-medium text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 px-2 py-1 rounded transition-colors"
														>
															Open
														</a>
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
										<tr className="bg-surface-subtle/30 border-b border-border-subtle">
											<td colSpan={6} className="px-4 py-4 whitespace-normal">
												<div className="flex flex-col gap-3 text-xs text-content">
													<div className="grid grid-cols-[80px_1fr] gap-2">
														<span className="font-semibold text-content-muted">
															URL:
														</span>
														<a
															href={job.url}
															target="_blank"
															rel="noopener noreferrer"
															className="text-blue-500 hover:underline break-all"
														>
															{job.url}
														</a>
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
					</tbody>
				</table>
			</div>
		</div>
	);
}
