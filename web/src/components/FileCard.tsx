import React from 'react';
import LazyThumbnail from './LazyThumbnail';
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

  return (
    <div
      className={`group relative overflow-hidden rounded-xl border ${
        isSelected
          ? 'border-blue-500 bg-blue-50/30 ring-1 ring-blue-500'
          : 'border-border-subtle bg-surface hover:border-border hover:shadow-sm'
      } transition-all duration-200 cursor-default`}
      onClick={handleCardClick}
    >
      {/* Selection Overlay */}
      {isSelected && (
        <div className="absolute inset-0 bg-blue-500/5 z-0"></div>
      )}

      {/* Checkbox */}
      <div className="absolute top-3 left-3 z-10">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onSelect(file.path)}
          onClick={handleCheckboxClick}
          className="h-4 w-4 rounded border-border bg-white text-blue-600 focus:ring-blue-500"
        />
      </div>

      {/* Thumbnail */}
      <div className="relative aspect-video overflow-hidden bg-surface-strong">
        <LazyThumbnail
          src={getThumbnailUrl(file.path)}
          alt={file.name}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />

        {/* Play Button for Videos */}
        {isVideo && (
          <button
            onClick={handlePreviewClick}
            className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <div className="rounded-full bg-white/90 p-3 shadow-lg">
              <svg className="h-6 w-6 text-foreground" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </button>
        )}

        {/* File Type Indicator */}
        <div className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-xs text-white">
          {isVideo ? 'VIDEO' : isImage ? 'IMAGE' : 'FILE'}
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {/* File Name */}
        <div className="mb-2">
          <h3 className="line-clamp-2 text-sm font-medium text-foreground">
            {file.name}
          </h3>
        </div>

        {/* Metadata */}
        <div className="space-y-2 text-xs text-content-muted">
          {/* Platform Badge */}
          {file.platform && (
            <div className="flex items-center gap-1">
              <span className={platformBadgeClass(file.platform)}>
                {platformLabel(file.platform)}
              </span>
              {file.creator && (
                <>
                  <span className="mx-1">•</span>
                  <span className="truncate" title={file.creator}>
                    {file.creator}
                  </span>
                </>
              )}
            </div>
          )}

          {/* Caption Preview */}
          {file.caption && (
            <p className="line-clamp-2 text-xs text-content">
              {file.caption}
            </p>
          )}

          {/* File Info */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span>{formatBytes(file.size)}</span>
              <span>•</span>
              <span>{date}</span>
            </div>

            <div className="flex items-center gap-1">
              {/* Category Badge */}
              <span className="rounded bg-surface-strong px-1.5 py-0.5 text-[10px] font-medium">
                {file.category}
              </span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-3 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={handlePreviewClick}
            className="flex-1 rounded-lg border border-border-subtle bg-surface px-2 py-1.5 text-xs font-medium text-foreground hover:bg-surface-subtle transition-colors"
          >
            Preview
          </button>
          <button
            onClick={handleDownloadClick}
            className="flex-1 rounded-lg bg-foreground px-2 py-1.5 text-xs font-medium text-background hover:bg-foreground/90 transition-colors"
          >
            Download
          </button>
        </div>
      </div>
    </div>
  );
});
