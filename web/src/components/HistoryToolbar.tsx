import React, { useRef, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { getExportUrl, importHistory } from '../lib/api';
import { triggerInvisibleDownload } from '../lib/utils';

interface HistoryToolbarProps {
  onImportSuccess: (msg: string) => void;
  onImportError: (msg: string) => void;
}

export default function HistoryToolbar({ onImportSuccess, onImportError }: HistoryToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  const handleExport = () => {
    // Trigger download invisibly
    triggerInvisibleDownload(getExportUrl());
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const result = await importHistory(file);
      onImportSuccess(`Imported: ${result.imported}, Skipped: ${result.skipped}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Import failed';
      onImportError(message);
    } finally {
      setImporting(false);
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
      <input
        type="file"
        accept=".json"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
      />
      
      <button
        onClick={handleExport}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-surface border border-border px-4 py-2.5 text-sm font-semibold text-foreground shadow-sm hover:bg-surface-subtle transition-all active:scale-95 w-full sm:w-auto"
      >
        <Download width={16} height={16} strokeWidth={2.5} className="text-current" />
        <span>Export History</span>
      </button>

      <button
        onClick={handleImportClick}
        disabled={importing}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-surface border border-border px-4 py-2.5 text-sm font-semibold text-foreground shadow-sm hover:bg-surface-subtle transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none w-full sm:w-auto"
      >
        {importing ? (
             <div className="h-4 w-4 border-2 border-foreground border-t-transparent rounded-full animate-spin"></div>
        ) : (
             <Upload width={16} height={16} strokeWidth={2.5} className="text-current" />
        )}
        <span>{importing ? 'Importing...' : 'Import History'}</span>
      </button>
    </div>
  );
}
