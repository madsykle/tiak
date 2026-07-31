import React, { memo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
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

const CARD_WIDTH = 200;
const CARD_HEIGHT = 280;
const GAP = 12;
const COLUMNS = 6; // xl:grid-cols-6

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
  const parentRef = useRef<HTMLDivElement>(null);
  const allSelected = items.length > 0 && items.every(file => selectedPaths.has(file.path));

  const rowVirtualizer = useVirtualizer({
    count: Math.ceil(items.length / COLUMNS),
    getScrollElement: () => parentRef.current,
    estimateSize: () => CARD_HEIGHT + GAP,
    overscan: 2,
  });

  const getItemStyle = (rowIndex: number, colIndex: number): React.CSSProperties => {
    const virtualRow = rowVirtualizer.getVirtualItems().find(v => v.index === rowIndex);
    if (!virtualRow) {
      return { position: 'absolute', top: -9999, left: -9999, width: CARD_WIDTH, height: CARD_HEIGHT };
    }
    
    return {
      position: 'absolute',
      top: virtualRow.start + rowIndex * GAP,
      left: colIndex * (CARD_WIDTH + GAP),
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
    };
  };

  if (items.length === 0) {
    return (
      <div className="py-12 text-center border border-dashed border-border-subtle rounded-xl bg-surface-subtle/30">
        <p className="text-sm text-content-muted">No files in this date</p>
      </div>
    );
  }

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

      <div 
        ref={parentRef} 
        className="relative" 
        style={{ 
          height: 600,
          width: '100%',
        }}
      >
        <div
          style={{
            height: rowVirtualizer.getTotalSize(),
            width: '100%',
            position: 'relative',
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const rowIndex = virtualRow.index;
            const startIdx = rowIndex * COLUMNS;
            const endIdx = Math.min(startIdx + COLUMNS, items.length);
            const rowItems = items.slice(startIdx, endIdx);

            return (
              <React.Fragment key={rowIndex}>
                {rowItems.map((file, colIndex) => (
                  <FileCard
                    key={file.path}
                    file={file}
                    isSelected={selectedPaths.has(file.path)}
                    onSelect={onToggleFileSelection}
                    onPreview={onPreview}
                    onDownload={onDownload}
                    style={getItemStyle(rowIndex, colIndex)}
                  />
                ))}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
});
