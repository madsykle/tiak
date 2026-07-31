"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Download, ExternalLink, Info, Monitor, X } from "lucide-react";
import { getDownloadUrl } from "@/lib/api";
import { formatBytes } from "@/lib/utils";

type FilePreviewItem = { path: string; name: string; size: number; category: string };

interface FilePreviewModalProps {
	file: FilePreviewItem;
	src: string;
	playerType?: "native" | "custom";
	hasPrev: boolean;
	hasNext: boolean;
	onClose: () => void;
	onPrev: () => void;
	onNext: () => void;
	onTogglePlayerType: () => void;
}

export default function FilePreviewModal({ file, src, playerType = "custom", hasPrev, hasNext, onClose, onPrev, onNext, onTogglePlayerType }: FilePreviewModalProps) {
	const videoRef = useRef<HTMLVideoElement>(null);
	const [isPlaying, setIsPlaying] = useState(true);
	const isImage = /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(file.name);

	useEffect(() => {
		setIsPlaying(true);
	}, [src]);

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") onClose();
			if (event.key === "ArrowLeft" && hasPrev) onPrev();
			if (event.key === "ArrowRight" && hasNext) onNext();
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [hasNext, hasPrev, onClose, onNext, onPrev]);

	return (
		<div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 p-0 backdrop-blur-sm sm:items-center sm:p-5" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="preview-title">
			<div className="relative flex h-[92dvh] w-full max-w-5xl flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-[#101419] shadow-2xl sm:h-[min(760px,92dvh)] sm:rounded-3xl" onClick={(event) => event.stopPropagation()}>
				<header className="flex min-h-16 items-center justify-between gap-3 border-b border-white/10 px-4 sm:px-6">
					<div className="min-w-0"><p className="eyebrow text-white/45">Preview</p><h2 id="preview-title" className="truncate text-sm font-semibold text-white sm:text-base">{file.name}</h2></div>
					<div className="flex items-center gap-1.5"><button type="button" onClick={onClose} className="rounded-xl p-2.5 text-white/65 hover:bg-white/10 hover:text-white" aria-label="Close preview"><X size={20} /></button>{!isImage && <button type="button" onClick={onTogglePlayerType} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 text-xs font-semibold text-white/75 hover:bg-white/10 hover:text-white" aria-label={`Switch to ${playerType === "custom" ? "native" : "custom"} player`}><Monitor size={15} /><span className="hidden sm:inline">{playerType === "custom" ? "Native player" : "Custom player"}</span></button>}</div>
				</header>
				<div className="relative flex min-h-0 flex-1 items-center justify-center bg-black px-3 py-5 sm:px-12">
					<div className="relative h-full min-h-[min(16rem,42dvh)] w-full">
					<button type="button" onClick={onPrev} disabled={!hasPrev} className="absolute left-3 top-1/2 z-10 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 disabled:pointer-events-none disabled:opacity-20" aria-label="Previous preview"><ChevronLeft size={24} /></button>
					{isImage ? <Image className="rounded-xl object-contain" src={src} alt={`Preview of ${file.name}`} fill unoptimized sizes="100vw" /> : <><video ref={videoRef} className="h-full w-full rounded-xl object-contain" src={src} controls={playerType === "native"} autoPlay playsInline preload="metadata" aria-label={`Preview of ${file.name}`} onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} />{playerType === "custom" && <button type="button" onClick={() => { const video = videoRef.current; if (!video) return; if (video.paused) void video.play(); else video.pause(); }} className="absolute bottom-5 left-1/2 z-20 -translate-x-1/2 rounded-full bg-white/90 px-4 py-2 text-xs font-semibold text-background shadow-xl hover:bg-white" aria-label={isPlaying ? "Pause video" : "Play video"}>{isPlaying ? "Pause" : "Play"}</button>}</>}
					<div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/80 to-transparent" />
					<button type="button" onClick={onNext} disabled={!hasNext} className="absolute right-3 top-1/2 z-10 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 disabled:pointer-events-none disabled:opacity-20" aria-label="Next preview"><ChevronRight size={24} /></button>
					{!isImage && <div className="absolute bottom-4 left-4 right-4 flex items-center justify-center gap-2 text-[11px] text-white/60 sm:hidden"><Monitor size={13} />{playerType === "custom" ? "Custom player" : "Native player"}</div>}
					</div>
				</div>
				<footer className="flex flex-col gap-3 border-t border-white/10 bg-[#151b21] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"><div className="flex min-w-0 items-center gap-3 text-xs text-white/55"><Info size={15} className="shrink-0 text-accent" /><span className="truncate">{file.category} • {formatBytes(file.size)}</span></div><div className="grid grid-cols-2 gap-2 sm:flex"><a href={src} target="_blank" rel="noreferrer" className="button-secondary min-h-10 border-white/10 bg-white/5 px-3 text-xs text-white hover:bg-white/10"><ExternalLink size={14} />Open</a><a href={getDownloadUrl(file.path)} download={file.name} className="button-primary min-h-10 px-3 text-xs"><Download size={14} />Download</a></div></footer>
			</div>
		</div>
	);
}
