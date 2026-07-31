"use client";

import { useEffect, useRef, useState } from "react";
import "media-chrome";
import {
	getFileInfo,
	FileInfo,
	getThumbnailUrl,
	getDownloadUrl,
} from "@/lib/api";
import { triggerInvisibleDownload } from "@/lib/utils";

type Props = {
	src: string;
	onClose: () => void;
	onNext?: () => void;
	onPrev?: () => void;
	hasNext?: boolean;
	hasPrev?: boolean;
	filename?: string;
	path?: string;
	onTogglePlayerType?: () => void;
};

export default function VideoPlayer({
	src,
	onClose,
	onNext,
	onPrev,
	hasNext,
	hasPrev,
	filename,
	path,
	onTogglePlayerType,
}: Props) {
	const mediaRef = useRef<HTMLVideoElement | null>(null);
	const [info, setInfo] = useState<FileInfo | null>(null);
	const [showInfo, setShowInfo] = useState(false);
	const [copied, setCopied] = useState(false);

	const copyIGCaption = async () => {
		if (!info) return;
		const categoryHashtag = info.category
			? info.category.toLowerCase().replace(/[^a-z0-9]/g, "")
			: "tiktok";
		const caption = `tt: @${info.creator || "unknown"}\n-\n#${categoryHashtag} #edit #fyp`;
		try {
			await navigator.clipboard.writeText(caption);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch (err) {
			console.error("Failed to copy", err);
		}
	};

	const handleDownload = () => {
		if (!path) return;
		triggerInvisibleDownload(getDownloadUrl(path));
	};

	useEffect(() => {
		if (path) {
			getFileInfo(path)
				.then(setInfo)
				.catch(() => setInfo({} as FileInfo));
		} else {
			setInfo(null);
		}
	}, [path]);

	// Update source when src changes
	useEffect(() => {
		if (mediaRef.current && src) {
			mediaRef.current.src = src;
			mediaRef.current.load();
			mediaRef.current.play().catch(() => {});
		}
	}, [src]);

	// Keyboard navigation
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
			if (e.key === "ArrowRight" && hasNext && onNext) onNext();
			if (e.key === "ArrowLeft" && hasPrev && onPrev) onPrev();
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [onClose, onNext, onPrev, hasNext, hasPrev]);

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-sm animate-in fade-in duration-200"
			onClick={onClose}
		>
			<div
				className="relative w-full h-full max-w-[95vw] max-h-[95vh] p-4 md:p-8 flex flex-col justify-center items-center"
				onClick={(e) => e.stopPropagation()}
			>
				{/* Header */}
				<div className="absolute top-0 left-0 right-0 p-4 z-20 flex justify-between items-start pointer-events-none mb-4">
					<h3 className="text-white/80 font-medium text-sm md:text-base drop-shadow-md truncate max-w-32 sm:max-w-md pointer-events-auto">
						{filename}
					</h3>
					<div className="flex flex-wrap items-center justify-end gap-2 pointer-events-auto">
						{path && (
							<button
								onClick={handleDownload}
								className="text-white/90 hover:text-white bg-white/10 hover:bg-white/20 border border-white/10 rounded-full px-3 py-2 transition-colors backdrop-blur-md flex items-center gap-1.5 text-xs font-medium shadow-sm"
								title="Download Video"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="14"
									height="14"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
								>
									<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
									<polyline points="7 10 12 15 17 10" />
									<line x1="12" y1="15" x2="12" y2="3" />
								</svg>
								<span className="hidden sm:inline">Download</span>
							</button>
						)}
						<button
							onClick={() => setShowInfo(!showInfo)}
							className={`text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-full p-2 transition-colors backdrop-blur-md ${showInfo ? "bg-white/30 text-white" : ""}`}
							title="Info & Analysis"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="20"
								height="20"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
							>
								<circle cx="12" cy="12" r="10" />
								<line x1="12" y1="16" x2="12" y2="12" />
								<line x1="12" y1="8" x2="12.01" y2="8" />
							</svg>
						</button>
						{info && Object.keys(info).length > 0 && (
							<button
								onClick={copyIGCaption}
								className={`text-xs font-medium px-3 py-2 rounded-full transition-colors backdrop-blur-md flex items-center gap-1.5 shadow-sm
                            ${copied ? "bg-emerald-500/90 text-white" : "bg-white/10 hover:bg-white/20 text-white/90 border border-white/10"}`}
								title="Copy IG Caption"
							>
								{copied ? (
									<>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											width="14"
											height="14"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											strokeWidth="2"
											strokeLinecap="round"
											strokeLinejoin="round"
										>
											<polyline points="20 6 9 17 4 12" />
										</svg>
										<span className="hidden sm:inline">Copied</span>
									</>
								) : (
									<>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											width="14"
											height="14"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											strokeWidth="2"
											strokeLinecap="round"
											strokeLinejoin="round"
										>
											<rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
											<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
										</svg>
										<span className="hidden sm:inline">Copy Caption</span>
									</>
								)}
							</button>
						)}
						<div className="w-px h-6 bg-white/20 mx-1"></div>
						{onTogglePlayerType && (
							<button
								onClick={onTogglePlayerType}
								className="text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-full px-3 py-2 transition-colors backdrop-blur-md flex items-center gap-1.5 text-xs font-medium shadow-sm"
								title="Switch Player"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="14"
									height="14"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
								>
									<rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
									<line x1="8" y1="21" x2="16" y2="21" />
									<line x1="12" y1="17" x2="12" y2="21" />
								</svg>
							</button>
						)}
						<button
							onClick={onClose}
							className="text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-full p-2 transition-colors backdrop-blur-md"
							title="Close"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="20"
								height="20"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
							>
								<line x1="18" y1="6" x2="6" y2="18" />
								<line x1="6" y1="6" x2="18" y2="18" />
							</svg>
						</button>
					</div>
				</div>

				{/* Info Panel */}
				{showInfo && (
					<div
						className="absolute top-20 right-4 bottom-20 w-80 bg-black/80 backdrop-blur-xl border border-white/10 rounded-xl p-4 z-40 overflow-y-auto text-white animate-in slide-in-from-right-4 shadow-2xl scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent"
						onClick={(e) => e.stopPropagation()}
					>
						{!info ? (
							<div className="flex h-full items-center justify-center text-white/50">
								<div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white"></div>
							</div>
						) : (
							<>
								<h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
									<span>Details</span>
									{info.status === "done" && (
										<span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] uppercase font-bold tracking-wider">
											Done
										</span>
									)}
								</h3>

								{info.category && (
									<div className="mb-5">
										<span className="text-[10px] text-white/50 uppercase tracking-wider font-semibold block mb-1">
											Category
										</span>
										<div className="flex items-center justify-between">
											<span className="text-sm font-medium">
												{info.category}
											</span>
										</div>
									</div>
								)}

								{info.creator && (
									<div className="mb-5">
										<span className="text-[10px] text-white/50 uppercase tracking-wider font-semibold block mb-1">
											Creator
										</span>
										<div className="flex items-center justify-between">
											<span className="text-sm font-medium">
												{info.creator}
											</span>
										</div>
									</div>
								)}

								{info.caption && (
									<div className="mb-5">
										<span className="text-[10px] text-white/50 uppercase tracking-wider font-semibold block mb-1">
											Caption
										</span>
										<p className="text-sm leading-relaxed text-white/90">
											{info.caption}
										</p>
									</div>
								)}

								{info.hashtags && (
									<div className="mb-5">
										<span className="text-[10px] text-white/50 uppercase tracking-wider font-semibold block mb-1">
											Hashtags
										</span>
										<p className="text-sm leading-relaxed text-white/90">
											{info.hashtags}
										</p>
									</div>
								)}

								{info.transcript && (
									<div className="mb-5">
										<span className="text-[10px] text-white/50 uppercase tracking-wider font-semibold block mb-1">
											Transcript
										</span>
										<p className="text-sm leading-relaxed text-white/90 max-h-32 overflow-y-auto pr-2 custom-scrollbar">
											{info.transcript}
										</p>
									</div>
								)}

								{info.visualDescription && (
									<div className="mb-5">
										<span className="text-[10px] text-white/50 uppercase tracking-wider font-semibold block mb-1">
											Visual Description
										</span>
										<p className="text-sm leading-relaxed text-white/90">
											{info.visualDescription}
										</p>
									</div>
								)}

								<div className="text-[10px] text-white/30 font-mono mt-8 pt-4 border-t border-white/10">
									ID: {info.jobId}
								</div>
							</>
						)}
					</div>
				)}

				{/* Video Container - Fixed sizing */}
				<div className="relative group w-full h-full flex items-center justify-center rounded-lg shadow-2xl ring-1 ring-white/10 overflow-hidden bg-black">
					{/* Prev Arrow */}
					{hasPrev && (
						<button
							onClick={(e) => {
								e.stopPropagation();
								onPrev?.();
							}}
							className="absolute left-4 top-1/2 -translate-y-1/2 z-20 p-3 bg-black/40 text-white/50 hover:text-white hover:bg-black/60 rounded-full transition-all opacity-0 group-hover:opacity-100 hover:scale-110"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="32"
								height="32"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
							>
								<path d="m15 18-6-6 6-6" />
							</svg>
						</button>
					)}

					{/* Next Arrow */}
					{hasNext && (
						<button
							onClick={(e) => {
								e.stopPropagation();
								onNext?.();
							}}
							className="absolute right-4 top-1/2 -translate-y-1/2 z-20 p-3 bg-black/40 text-white/50 hover:text-white hover:bg-black/60 rounded-full transition-all opacity-0 group-hover:opacity-100 hover:scale-110"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="32"
								height="32"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
							>
								<path d="m9 18 6-6-6-6" />
							</svg>
						</button>
					)}

					<media-controller className="w-full h-full flex flex-col">
						<video
							ref={mediaRef}
							src={src}
							poster={path ? getThumbnailUrl(path) : undefined}
							autoPlay
							playsInline
							preload="metadata"
							crossOrigin="anonymous"
							className="w-full h-full object-contain"
						/>
						<media-control-bar
							slot="bottom"
							className="bg-black/80 border-t border-white/10"
						>
							<media-play-button
								slot="start"
								className="w-10 h-10 text-white hover:text-white/80"
							></media-play-button>
							<media-seek-bar
								slot="center"
								className="flex-1 text-white accent-white"
							></media-seek-bar>
							<media-time-range
								slot="center"
								className="text-white/70 text-xs px-2 mx-2 font-mono"
							></media-time-range>
							<media-mute-button
								slot="end"
								className="w-10 h-10 text-white hover:text-white/80"
							></media-mute-button>
							<media-volume-range
								slot="end"
								className="w-24 accent-white"
							></media-volume-range>
							<media-fullscreen-button
								slot="end"
								className="w-10 h-10 text-white hover:text-white/80"
							></media-fullscreen-button>
						</media-control-bar>
					</media-controller>

					{/* Prev Arrow (duplicate for keyboard) */}
					{hasPrev && (
						<button
							onClick={(e) => {
								e.stopPropagation();
								onPrev?.();
							}}
							className="absolute left-4 top-1/2 -translate-y-1/2 z-20 p-3 bg-black/40 text-white/50 hover:text-white hover:bg-black/60 rounded-full transition-all opacity-0 group-hover:opacity-100 hover:scale-110"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="32"
								height="32"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
							>
								<path d="m15 18-6-6 6-6" />
							</svg>
						</button>
					)}

					{/* Next Arrow (duplicate for keyboard) */}
					{hasNext && (
						<button
							onClick={(e) => {
								e.stopPropagation();
								onNext?.();
							}}
							className="absolute right-4 top-1/2 -translate-y-1/2 z-20 p-3 bg-black/40 text-white/50 hover:text-white hover:bg-black/60 rounded-full transition-all opacity-0 group-hover:opacity-100 hover:scale-110"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="32"
								height="32"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
							>
								<path d="m9 18 6-6-6-6" />
							</svg>
						</button>
					)}
				</div>
			</div>
		</div>
	);
}
