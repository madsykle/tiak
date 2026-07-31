"use client";

import { useState, useEffect, useMemo, useCallback, useRef, useDeferredValue } from "react";
import { RefreshCw } from "lucide-react";
import { getDownloadUrl, getStreamUrl, deleteFiles, zipFiles } from "@/lib/api";
import type { FileItem, SortOption, SortDirection } from "@/lib/types";
import BatchOperations from "@/components/BatchOperations";
import EnhancedFilters from "@/components/EnhancedFilters";
import FileDateSection from "@/components/FileDateSection";
import FilePreviewModal from "@/components/FilePreviewModal";
import { formatBytes, triggerInvisibleDownload } from "@/lib/utils";
import { useFiles, useUsage, useCategories, useMoveFile } from "@/lib/queries";

function formatDateHeader(dateStr: string) {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
		return dateStr || "Unsorted";
	}
	const [y, m, d] = dateStr.split("-").map(Number);
	const date = new Date(y, m - 1, d);
	return date.toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" });
}

export default function FilesPage() {
	const { data: filesData, refetch: refetchFiles } = useFiles();
	const { data: usage, refetch: refetchUsage } = useUsage();
	const { data: categories = ["default"] } = useCategories();
	const moveFileMutation = useMoveFile();

	const allFiles: FileItem[] = useMemo(() => {
		if (!filesData) return [];
		const flatten: FileItem[] = [];
		for (const dateKey in filesData.byDate) {
			const items = filesData.byDate[dateKey];
			items.forEach((item) => {
				const infoKey = `${item.category}/${dateKey}/${item.name}`;
				const info = filesData.infoByKey?.[infoKey];
				flatten.push({
					...item,
					dateFolder: dateKey,
					platform: info?.platform,
					creator: info?.creator,
					caption: info?.caption,
				});
			});
		}
		return flatten;
	}, [filesData]);

	const loading = !filesData;
	const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
	const [sortBy, setSortBy] = useState<SortOption>("time");
	const [sortDir, setSortDir] = useState<SortDirection>("desc");
	const [searchQuery, setSearchQuery] = useState("");
	const [categoryFilter, setCategoryFilter] = useState("all");
	const [platformFilter, setPlatformFilter] = useState<string>("all");
	const [displayLimit, setDisplayLimit] = useState(50);
	const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
	const [zipping, setZipping] = useState(false);
	const [previewFile, setPreviewFile] = useState<FileItem | null>(null);
	const [previewSrc, setPreviewSrc] = useState("");
	const deferredSearchQuery = useDeferredValue(searchQuery);
	const loadMoreRef = useRef<HTMLDivElement>(null);

	const showFeedback = useCallback((type: "success" | "error", text: string) => {
		setFeedback({ type, text });
	}, []);

	useEffect(() => {
		if (feedback) {
			const timer = setTimeout(() => setFeedback(null), 3000);
			return () => clearTimeout(timer);
		}
	}, [feedback]);

	useEffect(() => {
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0].isIntersecting) setDisplayLimit((prev) => prev + 50);
			},
			{ rootMargin: "400px" },
		);
		if (loadMoreRef.current) observer.observe(loadMoreRef.current);
		return () => observer.disconnect();
	}, [loading, allFiles, categoryFilter, platformFilter, searchQuery]);

	useEffect(() => setDisplayLimit(50), [categoryFilter, platformFilter, sortBy, sortDir, deferredSearchQuery]);

	const handleManualRefresh = () => {
		refetchFiles();
		refetchUsage();
	};

	const handleBatchDelete = async () => {
		if (!confirm(`Delete ${selectedPaths.size} files? This action cannot be undone.`)) return;
		try {
			const paths = Array.from(selectedPaths);
			const result = await deleteFiles(paths);
			if (result.errors.length > 0) {
				showFeedback("error", `Deleted ${result.deleted.length} file(s), but some deletions failed`);
			} else {
				showFeedback("success", `Deleted ${result.deleted.length} file(s)`);
			}
			setSelectedPaths((prev) => {
				const next = new Set(prev);
				paths.forEach((p) => next.delete(p));
				return next;
			});
			refetchFiles();
			refetchUsage();
		} catch {
			showFeedback("error", "Failed to delete selected files");
		}
	};

	const handleBatchZip = async () => {
		setZipping(true);
		try {
			const paths = Array.from(selectedPaths);
			const blob = await zipFiles(paths);
			const url = window.URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = `tiak-archive-${new Date().toISOString().slice(0, 10)}.zip`;
			document.body.appendChild(a);
			a.click();
			window.URL.revokeObjectURL(url);
			a.remove();
			showFeedback("success", `Downloading ZIP for ${paths.length} file(s)`);
		} catch {
			showFeedback("error", "Failed to create ZIP");
		} finally {
			setZipping(false);
		}
	};

	const handleBatchMove = async (targetCategory: string) => {
		const paths = Array.from(selectedPaths);
		let movedCount = 0;
		for (const path of paths) {
			try {
				await moveFileMutation.mutateAsync({ path, newCategory: targetCategory });
				movedCount++;
			} catch (e) {
				console.error(`Failed to move ${path}`, e);
			}
		}
		if (movedCount > 0) {
			setSelectedPaths(new Set());
			refetchFiles();
			showFeedback("success", `Moved ${movedCount} file(s) to ${targetCategory}`);
		} else {
			showFeedback("error", "No files were moved");
		}
	};

	const handleSelectAll = () => {
		const allPaths = new Set(sortedFilesList.map((f) => f.path));
		setSelectedPaths(allPaths);
	};

	const handleClearSelection = () => setSelectedPaths(new Set());

	const handleDownload = useCallback((path: string) => {
		triggerInvisibleDownload(getDownloadUrl(path));
	}, []);

	const openPreview = useCallback((file: FileItem) => {
		setPreviewSrc(getStreamUrl(file.path));
		setPreviewFile(file);
	}, []);

	const togglePathSelection = useCallback((path: string) => {
		setSelectedPaths((prev) => {
			const next = new Set(prev);
			if (next.has(path)) next.delete(path);
			else next.add(path);
			return next;
		});
	}, []);

	const closePreview = useCallback(() => {
		setPreviewFile(null);
		setPreviewSrc("");
	}, []);

	const sortedFilesList = useMemo(() => {
		let filtered = allFiles;
		if (categoryFilter !== "all") filtered = filtered.filter((f) => f.category === categoryFilter);
		if (platformFilter !== "all") filtered = filtered.filter((f) => f.platform === platformFilter);
		if (deferredSearchQuery) {
			const q = deferredSearchQuery.toLowerCase();
			filtered = filtered.filter(
				(f) =>
					f.name.toLowerCase().includes(q) ||
					(f.creator && f.creator.toLowerCase().includes(q)) ||
					(f.caption && f.caption.toLowerCase().includes(q)),
			);
		}
		return [...filtered].sort((a, b) => {
			if (sortBy === "platform") {
				const pa = (a.platform || "").toLowerCase();
				const pb = (b.platform || "").toLowerCase();
				if (pa !== pb) {
					if (pa < pb) return sortDir === "asc" ? -1 : 1;
					return sortDir === "asc" ? 1 : -1;
				}
			}
			if (a.dateFolder !== b.dateFolder) {
				if (a.dateFolder < b.dateFolder) return sortDir === "asc" ? -1 : 1;
				return sortDir === "asc" ? 1 : -1;
			}
			let valA: string | number = a[sortBy === "time" ? "createdAt" : sortBy === "platform" ? "createdAt" : sortBy];
			let valB: string | number = b[sortBy === "time" ? "createdAt" : sortBy === "platform" ? "createdAt" : sortBy];
			if (sortBy === "time" || sortBy === "platform") {
				valA = new Date(valA).getTime();
				valB = new Date(valB).getTime();
			} else if (sortBy === "name") {
				valA = (valA as string).toLowerCase();
				valB = (valB as string).toLowerCase();
			}
			if (valA < valB) return sortDir === "asc" ? -1 : 1;
			if (valA > valB) return sortDir === "asc" ? 1 : -1;
			return 0;
		});
	}, [allFiles, deferredSearchQuery, sortBy, sortDir, categoryFilter, platformFilter]);

	const navigatePreview = useCallback(
		(direction: "next" | "prev") => {
			if (!previewFile) return;
			const currentIndex = sortedFilesList.findIndex((f) => f.path === previewFile.path);
			if (currentIndex === -1) return;
			const nextIndex = direction === "next" ? currentIndex + 1 : currentIndex - 1;
			if (nextIndex >= 0 && nextIndex < sortedFilesList.length) {
				openPreview(sortedFilesList[nextIndex]);
			}
		},
		[openPreview, previewFile, sortedFilesList],
	);

	const previewIndex = useMemo(() => {
		if (!previewFile) return -1;
		return sortedFilesList.findIndex((file) => file.path === previewFile.path);
	}, [previewFile, sortedFilesList]);

	const hasPrevPreview = previewIndex > 0;
	const hasNextPreview = previewIndex >= 0 && previewIndex < sortedFilesList.length - 1;

	useEffect(() => {
		if (!previewFile) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") closePreview();
			else if (event.key === "ArrowRight") navigatePreview("next");
			else if (event.key === "ArrowLeft") navigatePreview("prev");
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [closePreview, navigatePreview, previewFile]);

	const availablePlatforms = useMemo(() => {
		const platforms = new Set<string>();
		allFiles.forEach((file) => {
			if (file.platform) platforms.add(file.platform);
		});
		return Array.from(platforms).sort();
	}, [allFiles]);

	const handleClearFilters = () => {
		setSearchQuery("");
		setCategoryFilter("all");
		setPlatformFilter("all");
		setSortBy("time");
		setSortDir("desc");
	};

	const groupedFiles = useMemo(() => {
		const groups: Record<string, FileItem[]> = {};
		sortedFilesList.forEach((file) => {
			const key = file.dateFolder || "Unsorted";
			if (!groups[key]) groups[key] = [];
			groups[key].push(file);
		});
		const sortedDates = Object.keys(groups).sort((a, b) => {
			if (a === "Unsorted" || b === "Unsorted") return a === "Unsorted" ? 1 : -1;
			return sortDir === "desc" ? b.localeCompare(a) : a.localeCompare(b);
		});
		return { groups, sortedDates };
	}, [sortedFilesList, sortDir]);

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
		groupedFiles.sortedDates.forEach((date) => {
			totalCount += groupedFiles.groups[date].length;
		});
		return displayLimit < totalCount;
	}, [groupedFiles, displayLimit]);

	return (
		<div className="space-y-6 animate-in fade-in duration-500">
			<header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
				<div className="flex-1 min-w-0">
					<h1 className="text-3xl font-extrabold tracking-tight text-gradient-accent font-display">Files</h1>
					{usage ? (
						<div className="mt-3 space-y-1.5 max-w-[280px]">
							<div className="flex justify-between text-[11px] font-mono text-content-muted">
								<span>{formatBytes(usage.totalSize)} / 50 GB Used</span>
								<span>{usage.fileCount} files</span>
							</div>
							<div className="h-1.5 w-full bg-surface-strong rounded-full overflow-hidden border border-border/30">
								<div
									className="h-full bg-accent rounded-full glow-accent transition-all duration-500"
									style={{ width: `${Math.min(100, (usage.totalSize / (50 * 1024 * 1024 * 1024)) * 100)}%` }}
								/>
							</div>
						</div>
					) : (
						<p className="text-sm text-content-muted mt-1">Loading space info...</p>
					)}
				</div>
				<button
					onClick={handleManualRefresh}
					disabled={loading}
					className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-surface-subtle/50 text-sm font-medium hover:bg-surface-strong hover:scale-105 active:scale-95 transition-all duration-200 disabled:opacity-50"
					title="Refresh files manually"
				>
					<RefreshCw width={14} height={14} strokeWidth={2.5} className={loading ? "animate-spin" : ""} />
					<span>Refresh</span>
				</button>
			</header>

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

			<BatchOperations
				selectedCount={selectedPaths.size}
				categories={categories}
				onDelete={handleBatchDelete}
				onZip={handleBatchZip}
				onMove={handleBatchMove}
				onSelectAll={handleSelectAll}
				onClearSelection={handleClearSelection}
				isLoading={loading}
				isZipping={zipping}
			/>

			{feedback && (
				<div
					className={`rounded-lg border px-4 py-3 text-sm ${
						feedback.type === "success"
							? "border-emerald-200 bg-emerald-50 text-emerald-800"
							: "border-red-200 bg-red-50 text-red-800"
					}`}
				>
					{feedback.text}
				</div>
			)}

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
								const datePaths = dateItems.map((file) => file.path);
								const allSelected = datePaths.every((path) => selectedPaths.has(path));
								setSelectedPaths((prev) => {
									const next = new Set(prev);
									datePaths.forEach((path) => {
										if (allSelected) next.delete(path);
										else next.add(path);
									});
									return next;
								});
							}}
							onToggleFileSelection={togglePathSelection}
							onPreview={openPreview}
							onDownload={handleDownload}
						/>
					))}
					{hasNext && (
						<div ref={loadMoreRef} className="py-8 text-center">
							<div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-foreground mx-auto"></div>
							<p className="mt-3 text-sm text-content-muted">Loading more files...</p>
						</div>
					)}
				</div>
			)}

			{previewFile && (
				<FilePreviewModal
					file={previewFile}
					src={previewSrc}
					hasPrev={hasPrevPreview}
					hasNext={hasNextPreview}
					onClose={closePreview}
					onPrev={() => navigatePreview("prev")}
					onNext={() => navigatePreview("next")}
					onTogglePlayerType={() => {}}
				/>
			)}
		</div>
	);
}
