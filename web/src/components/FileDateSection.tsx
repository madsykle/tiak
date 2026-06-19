import React, { memo } from 'react';
import FileCard from './FileCard';

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

export default memo(function FileDateSection({
  title,
  items,
  totalCount,
  selectedPaths,
  onToggleDateSelection,
  onToggleFileSelection,
  onPreview,
  onDownload,
}: FileDateSectionProps) {
  const allSelected = items.length > 0 && items.every(file => selectedPaths.has(file.path));

  return (
    <div>
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm py-3 px-2 -mx-2 mb-4 border-b border-border-subtle">
        <div className="flex items-baseline justify-between">
          <div className="flex items-baseline gap-3">
            <h2 className="text-lg font-semibold text-foreground tracking-tight">
              {title}
            </h2>
            <span className="text-xs text-content-muted font-medium">
              {totalCount} item{totalCount !== 1 ? 's' : ''}
            </span>
          </div>
          <button
            onClick={() => onToggleDateSelection(items)}
            className="text-xs font-medium text-blue-600 hover:text-blue-800"
          >
            {allSelected ? 'Deselect all' : 'Select all'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
        {items.map((file) => (
          <FileCard
            key={file.path}
            file={file}
            isSelected={selectedPaths.has(file.path)}
            onSelect={onToggleFileSelection}
            onPreview={onPreview}
            onDownload={onDownload}
          />
        ))}
      </div>
    </div>
  );
});
