import React from "react";
import { Check, Download, File, Image as ImageIcon, Play, Video } from "lucide-react";
import Thumbnail from "./Thumbnail";
import CategoryBadge from "./CategoryBadge";
import { formatBytes, platformBadgeClass, platformLabel } from "../lib/utils";

interface FileCardProps {
	file: FileCardItem;
	isSelected: boolean;
	onSelect: (path: string) => void;
	onPreview: (file: FileCardItem) => void;
	onDownload: (path: string, name: string) => void;
	style?: React.CSSProperties;
}

type FileCardItem = {
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

export default React.memo(function FileCard({ file, isSelected, onSelect, onPreview, onDownload, style }: FileCardProps) {
	const extension = file.name.split(".").pop()?.toLowerCase() || "file";
	const isVideo = /^(mp4|mov|avi|mkv|webm|flv|wmv)$/.test(extension);
	const isImage = /^(jpg|jpeg|png|gif|bmp|webp)$/.test(extension);
	const date = new Date(file.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" });
	const typeLabel = isVideo ? "Video" : isImage ? "Image" : "File";

	return (
		<article style={style} className={`group relative overflow-hidden rounded-2xl border bg-surface transition duration-200 ${isSelected ? "border-accent ring-2 ring-accent/20" : "border-border/70 hover:-translate-y-0.5 hover:border-accent/50"}`}>
			<div className="relative aspect-[4/5] overflow-hidden bg-surface-strong">
				<Thumbnail path={file.path} alt={file.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
				<div className="absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-2 p-2.5">
					<label className={`flex size-9 cursor-pointer items-center justify-center rounded-xl border backdrop-blur-md transition ${isSelected ? "border-accent bg-accent text-background" : "border-white/20 bg-black/45 text-white hover:bg-black/65"}`}>
						<input type="checkbox" checked={isSelected} onChange={() => onSelect(file.path)} className="sr-only" aria-label={`Select ${file.name}`} />
						{isSelected ? <Check size={16} strokeWidth={2.5} /> : <span className="size-3 rounded border border-white/80" />}
					</label>
					<CategoryBadge category={file.category} className="max-w-[62%] border-white/20 bg-black/45 text-white" />
				</div>
				<div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/80 to-transparent px-2.5 pb-2.5 pt-8 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/80">
					<span className="flex items-center gap-1.5">{isVideo ? <Video size={13} /> : isImage ? <ImageIcon size={13} /> : <File size={13} />}{typeLabel}</span>
					<span>{extension}</span>
				</div>
				{(isVideo || isImage) && <button type="button" onClick={() => onPreview(file)} className="absolute inset-0 z-10 flex items-center justify-center bg-black/20 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100" aria-label={`Preview ${file.name}`}><span className="flex size-12 items-center justify-center rounded-full bg-white text-background shadow-xl"><Play size={20} fill="currentColor" /></span></button>}
			</div>

			<div className="flex min-h-[9.25rem] flex-col gap-3 p-3">
				<div className="min-w-0">
					<div className="mb-1 flex min-w-0 items-center gap-1.5">
						{file.platform && <span className={platformBadgeClass(file.platform)}>{platformLabel(file.platform)}</span>}
						{file.creator && <span className="truncate text-xs font-medium text-foreground">@{file.creator}</span>}
					</div>
					{file.caption ? <p className="line-clamp-2 text-xs leading-5 text-content-muted" title={file.caption}>{file.caption}</p> : <h3 className="line-clamp-2 text-sm font-semibold leading-5 text-foreground" title={file.name}>{file.name}</h3>}
				</div>
				<div className="mt-auto flex items-center justify-between gap-2 border-t border-border-subtle pt-2 text-[11px] text-content-muted">
					<span>{formatBytes(file.size)}</span><span>{date}</span>
				</div>
				<div className="grid grid-cols-2 gap-2">
					<button type="button" onClick={() => onPreview(file)} disabled={!isVideo && !isImage} className="button-secondary min-h-9 px-2 text-xs disabled:opacity-40">Preview</button>
					<button type="button" onClick={() => onDownload(file.path, file.name)} className="button-primary min-h-9 px-2 text-xs"><Download size={14} />Save</button>
				</div>
			</div>
		</article>
	);
});
