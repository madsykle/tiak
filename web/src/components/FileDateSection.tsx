import React, { memo } from "react";
import { CheckSquare, Square } from "lucide-react";
import FileCard from "./FileCard";

type FileItem = {
	path: string;
	name: string;
	size: number;
	createdAt: number;
	dateFolder: string;
	category: string;
	platform?: string;
	creator?: string;
	caption?: string;
};

interface FileDateSectionProps {
	title: string;
	items: FileItem[];
	totalCount: number;
	selectedPaths: Set<string>;
	onToggleDateSelection: (items: FileItem[]) => void;
	onToggleFileSelection: (path: string) => void;
	onPreview: (file: FileItem) => void;
	onDownload: (path: string, name: string) => void;
}

export default memo(function FileDateSection({ title, items, totalCount, selectedPaths, onToggleDateSelection, onToggleFileSelection, onPreview, onDownload }: FileDateSectionProps) {
	if (items.length === 0) return null;
	const allSelected = items.every((file) => selectedPaths.has(file.path));

	return (
		<section className="space-y-3">
			<header className="sticky top-0 z-20 -mx-1 flex items-center justify-between gap-3 border-b border-border-subtle bg-background/92 px-1 py-3 backdrop-blur-xl">
				<div className="min-w-0"><h2 className="truncate text-base font-semibold tracking-tight text-foreground sm:text-lg">{title}</h2><p className="mt-0.5 text-xs text-content-muted">{totalCount} item{totalCount === 1 ? "" : "s"}</p></div>
				<button type="button" onClick={() => onToggleDateSelection(items)} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold text-accent hover:bg-accent/10" aria-label={allSelected ? `Deselect all files from ${title}` : `Select all files from ${title}`}>
					{allSelected ? <CheckSquare size={15} /> : <Square size={15} />}{allSelected ? "Deselect" : "Select"}
				</button>
			</header>
			<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
				{items.map((file) => <FileCard key={file.path} file={file} isSelected={selectedPaths.has(file.path)} onSelect={onToggleFileSelection} onPreview={onPreview} onDownload={onDownload} />)}
			</div>
		</section>
	);
});
