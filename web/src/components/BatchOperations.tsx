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
      <div className="flex items-center justify-between rounded-xl border border-border bg-surface/30 p-4 glass-premium">
        <div className="text-sm text-content-muted">No files selected</div>
        <button
          onClick={onSelectAll}
          className="rounded-xl border border-border bg-surface-subtle/50 px-4 py-2 text-xs font-semibold text-foreground hover:bg-surface-strong hover:scale-[1.02] active:scale-[0.98] transition-all duration-150"
        >
          Select All
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4 rounded-xl border border-neon-purple/20 bg-neon-purple/5 p-4 glow-purple glass-premium">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-foreground">
              {selectedCount} file{selectedCount !== 1 ? 's' : ''} selected
            </span>
            <button
              onClick={onClearSelection}
              className="text-xs font-medium text-content-muted hover:text-foreground transition-colors"
            >
              Clear selection
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={onZip}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-2 text-xs font-bold shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              ZIP Selected
            </button>

            <button
              onClick={() => setShowMoveModal(true)}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 rounded-xl bg-neon-purple hover:bg-neon-purple/90 text-white px-3.5 py-2 text-xs font-bold shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed glow-purple"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
              Move
            </button>

            <button
              onClick={onDelete}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white px-3.5 py-2 text-xs font-bold shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Delete
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-content-muted">
          <svg className="w-3.5 h-3.5 text-neon-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>Batch operations apply to all selected files</span>
        </div>
      </div>

      {/* Move Modal */}
      {showMoveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-md rounded-2xl border border-border bg-surface/85 p-6 shadow-xl glass-premium animate-in zoom-in-95 duration-150">
            <div className="mb-4">
              <h3 className="text-lg font-bold text-foreground">Move {selectedCount} files</h3>
              <p className="text-sm text-content-muted mt-1">Select a destination category</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-content-muted mb-2">
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
                  className="rounded-xl border border-border bg-surface-subtle/50 px-4 py-2.5 text-xs font-semibold text-foreground hover:bg-surface-strong hover:scale-[1.02] active:scale-[0.98] transition-all duration-150"
                >
                  Cancel
                </button>
                <button
                  onClick={handleMoveSubmit}
                  disabled={!targetCategory.trim() || isLoading}
                  className="rounded-xl bg-neon-purple hover:bg-neon-purple/90 text-white px-5 py-2.5 text-xs font-bold shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed glow-purple"
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