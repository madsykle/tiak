import React from 'react';
import LazyThumbnail from './LazyThumbnail';
import CategoryBadge from './CategoryBadge';
import { formatBytes, platformBadgeClass, platformLabel } from '../lib/utils';
import { getThumbnailUrl } from '../lib/api';

interface FileCardProps {
  file: FileCardItem;
  isSelected: boolean;
  onSelect: (path: string) => void;
  onPreview: (file: FileCardItem) => void;
  onDownload: (path: string, name: string) => void;
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

export default React.memo(function FileCard({
  file,
  isSelected,
  onSelect,
  onPreview,
  onDownload,
}: FileCardProps) {
  const date = new Date(file.createdAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const isVideo = file.name.toLowerCase().match(/\.(mp4|mov|avi|mkv|webm|flv|wmv)$/);
  const isImage = file.name.toLowerCase().match(/\.(jpg|jpeg|png|gif|bmp|webp)$/);

  const handleCardClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, input, a')) {
      return;
    }
    if (isVideo || isImage) {
      onPreview(file);
    }
  };

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const handleDownloadClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDownload(file.path, file.name);
  };

  const handlePreviewClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onPreview(file);
  };

  let cardStyle = "border-border/60 bg-surface/40 hover:border-accent/30 hover:glow-accent";
  if (isSelected) {
    cardStyle = "border-accent bg-accent/10 ring-1 ring-accent/40 glow-accent";
  }

  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border glass-premium hover-scale transition-all duration-300 cursor-default ${cardStyle}`}
      onClick={handleCardClick}
    >
      {/* Selection Overlay */}
      {isSelected && (
        <div className="absolute inset-0 bg-accent/5 z-0"></div>
      )}

      {/* Checkbox */}
      <div className="absolute top-3 left-3 z-10">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onSelect(file.path)}
          onClick={handleCheckboxClick}
          className="h-4 w-4 rounded border-border bg-surface text-accent focus:ring-accent/30 focus:ring-1"
        />
      </div>

      {/* Thumbnail */}
      <div className="relative aspect-[4/5] overflow-hidden bg-surface-strong">
        {/* Category Badge Overlay */}
        <div className="absolute top-2 right-2 z-20 shadow-md">
          <CategoryBadge category={file.category} />
        </div>

        <LazyThumbnail
          src={getThumbnailUrl(file.path)}
          alt={file.name}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />

        {/* Play Button for Videos */}
        {isVideo && (
          <button
            onClick={handlePreviewClick}
            className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
          >
            <div className="rounded-full bg-white/90 p-3 shadow-lg hover:scale-110 active:scale-95 transition-transform">
              <svg className="h-6 w-6 text-background" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </button>
        )}

        {/* File Type Indicator */}
        <div className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-white z-10">
          {isVideo ? 'VIDEO' : isImage ? 'IMAGE' : 'FILE'}
        </div>
      </div>

      {/* Content */}
      <div className="p-4 relative z-10 flex flex-col justify-between" style={{ minHeight: '120px' }}>
        <div className="space-y-2.5 text-xs text-content-muted">
          {/* Platform and Creator */}
          {(file.platform || file.creator) && (
            <div className="flex items-center gap-1.5">
              {file.platform && (
                <span className={platformBadgeClass(file.platform)}>
                  {platformLabel(file.platform)}
                </span>
              )}
              {file.creator && (
                <span className="truncate font-medium text-foreground" title={file.creator}>
                  @{file.creator}
                </span>
              )}
            </div>
          )}

          {/* Caption or Filename Fallback */}
          {file.caption ? (
            <p className="line-clamp-2 text-[11px] leading-relaxed text-content-muted" title={file.caption}>
              {file.caption}
            </p>
          ) : !file.creator ? (
            <div className="mb-2">
              <h3 className="line-clamp-2 text-sm font-semibold text-foreground tracking-tight leading-tight" title={file.name}>
                {file.name}
              </h3>
            </div>
          ) : null}
        </div>

        {/* File Info */}
        <div className="flex items-center justify-between border-t border-border/40 pt-2 text-[11px] text-content-muted mt-2">
          <div className="flex items-center gap-1.5 font-mono">
            <span>{formatBytes(file.size)}</span>
            <span className="text-content-subtle">•</span>
            <span>{date}</span>
          </div>
        </div>

        {/* Actions - visible by default on mobile, hover-only on desktop */}
        <div className="mt-4 flex flex-col gap-2 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-200">
          <button
            onClick={handlePreviewClick}
            className="w-full rounded-xl border border-border bg-surface-subtle/50 px-2 py-2 text-xs font-semibold text-foreground hover:bg-surface-strong hover:scale-[1.02] active:scale-[0.98] transition-all duration-150"
          >
            Preview
          </button>
          <button
            onClick={handleDownloadClick}
            className="w-full rounded-xl bg-accent hover:bg-accent/90 px-2 py-2 text-xs font-bold text-white shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all duration-150"
          >
            Download
          </button>
        </div>
      </div>
    </div>
  );
});
