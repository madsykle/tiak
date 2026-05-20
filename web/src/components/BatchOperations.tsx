import React, { useState } from 'react';
import SearchableSelect from './SearchableSelect';

interface BatchOperationsProps {
  selectedCount: number;
  categories: string[];
  onDelete: () => void;
  onZip: () => void;
  onMove: (targetCategory: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  isLoading?: boolean;
}

export default function BatchOperations({
  selectedCount,
  categories,
  onDelete,
  onZip,
  onMove,
  onSelectAll,
  onClearSelection,
  isLoading = false,
}: BatchOperationsProps) {
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [targetCategory, setTargetCategory] = useState('');

  const handleMoveSubmit = () => {
    if (targetCategory.trim()) {
      onMove(targetCategory);
      setShowMoveModal(false);
      setTargetCategory('');
    }
  };

  if (selectedCount === 0) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-border-subtle bg-surface p-4">
        <div className="text-sm text-content-muted">No files selected</div>
        <button
          onClick={onSelectAll}
          className="rounded-lg bg-surface-strong px-3 py-1.5 text-sm font-medium text-foreground hover:bg-surface-strong/80 transition-colors"
        >
          Select All
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4 rounded-lg border border-blue-200 bg-blue-50/30 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-foreground">
              {selectedCount} file{selectedCount !== 1 ? 's' : ''} selected
            </span>
            <button
              onClick={onClearSelection}
              className="text-xs text-content-muted hover:text-foreground transition-colors"
            >
              Clear selection
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onZip}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Download as ZIP
            </button>

            <button
              onClick={() => setShowMoveModal(true)}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
              Move
            </button>

            <button
              onClick={onDelete}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Delete
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-content-muted">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>Batch operations apply to all selected files</span>
        </div>
      </div>

      {/* Move Modal */}
      {showMoveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="relative w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-xl">
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-foreground">Move {selectedCount} files</h3>
              <p className="text-sm text-content-muted mt-1">Select a destination category</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-content mb-2">
                  Destination Category
                </label>
                <SearchableSelect
                  options={categories}
                  value={targetCategory}
                  onChange={setTargetCategory}
                  placeholder="Select or enter category"
                  className="w-full"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  onClick={() => {
                    setShowMoveModal(false);
                    setTargetCategory('');
                  }}
                  className="rounded-lg border border-border-subtle bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-subtle transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleMoveSubmit}
                  disabled={!targetCategory.trim() || isLoading}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Move Files
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}