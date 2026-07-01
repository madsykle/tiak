import { useState } from 'react';
import CloudPathPicker from './CloudPathPicker';

interface SyncStatus {
  status: string;
  lastRun: string | null;
  logs: string[];
  error: string | null;
  unsyncedCount: number;
}

interface CloudSyncSectionProps {
  syncDestination: string;
  syncMode: string;
  syncStatus: SyncStatus;
  saving: boolean;
  onSyncDestinationChange: (dest: string) => void;
  onSyncModeChange: (mode: string) => void;
  onSync: () => void;
  onSave?: (overrides?: { syncDest?: string; sMode?: string }) => void;
}

export default function CloudSyncSection({
  syncDestination,
  syncMode,
  syncStatus,
  saving,
  onSyncDestinationChange,
  onSyncModeChange,
  onSync,
  onSave,
}: CloudSyncSectionProps) {
  const [showPicker, setShowPicker] = useState(false);

  return (
    <div className="pt-6 border-t border-border-subtle">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium text-foreground flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.5 19a5.5 5.5 0 0 0 2.5-10.5 8.5 8.5 0 1 0-14 3h1.5"/><path d="M12 11v9"/><path d="m9 17 3 3 3-3"/></svg>
          Cloud Sync
        </h2>
        <div className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
          syncStatus.status === 'running' ? 'bg-blue-500/10 text-blue-500 border-blue-500/20 animate-pulse' :
          syncStatus.status === 'error' ? 'bg-accent/10 text-accent border-accent/20' :
          'bg-zinc-500/10 text-zinc-500 border-zinc-500/20'
        }`}>
          {syncStatus.status === 'running' ? 'Syncing...' : syncStatus.status === 'idle' ? 'Idle' : 'Error'}
        </div>
      </div>

      <div className="space-y-4">
        {syncStatus.unsyncedCount > 0 && (
          <div className={`flex items-center gap-2 text-xs animate-in slide-in-from-top-2 transition-all duration-300 ${syncStatus.status === 'running' ? 'text-zinc-500 opacity-50' : 'text-content-muted'}`}>
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={syncStatus.status === 'running' ? 'text-zinc-500' : 'text-amber-500'}><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <span><strong className={syncStatus.status === 'running' ? '' : 'text-foreground'}>{syncStatus.unsyncedCount} new file(s)</strong> waiting to sync.</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="syncDest" className="block text-xs font-medium text-content-muted uppercase tracking-wider mb-2">
              Destination Path
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                id="syncDest"
                value={syncDestination}
                onChange={(e) => onSyncDestinationChange(e.target.value)}
                placeholder="e.g. onedrive:backup"
                className="block flex-1 rounded-lg border border-border bg-surface/50 p-2 text-sm text-foreground focus:ring-1 focus:ring-foreground focus:border-foreground"
              />
              <button
                type="button"
                onClick={() => setShowPicker(true)}
                className="px-3 py-2 rounded-lg bg-surface-strong border border-border-subtle text-sm font-medium hover:border-foreground transition-colors"
              >
                Browse
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-content-muted uppercase tracking-wider mb-2">Sync Mode</label>
            <div className="flex gap-2 p-1 bg-surface-subtle/30 rounded-lg border border-border-subtle">
              <button onClick={() => onSyncModeChange('copy')} className={`flex-1 py-1 px-3 rounded-md text-xs font-medium transition-all ${syncMode === 'copy' ? 'bg-background text-foreground shadow-sm' : 'text-content-muted hover:text-foreground'}`}>
                Backup
              </button>
              <button onClick={() => onSyncModeChange('sync')} className={`flex-1 py-1 px-3 rounded-md text-xs font-medium transition-all ${syncMode === 'sync' ? 'bg-background text-foreground shadow-sm' : 'text-content-muted hover:text-foreground'}`}>
                Mirror
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-surface-subtle/30 border border-border-subtle p-4 space-y-3">
          <div className="flex justify-between items-center text-xs">
            <span className="text-content-muted uppercase font-bold tracking-widest">Last Run</span>
            <span className="font-mono text-foreground bg-surface-strong px-2 py-0.5 rounded">
              {syncStatus.lastRun ? new Date(syncStatus.lastRun).toLocaleString() : 'Never'}
            </span>
          </div>
          {syncStatus.error && (
            <div className="text-red-400 text-xs bg-accent/10 p-2 rounded-lg border border-accent/20">
              <strong>Error:</strong> {syncStatus.error}
            </div>
          )}
          {syncStatus.logs.length > 0 && (
            <details className="group">
              <summary className="cursor-pointer text-xs text-content-muted hover:text-foreground select-none flex items-center gap-1 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="group-open:rotate-90 transition-transform"><path d="m9 18 6-6-6-6"/></svg>
                View Activity Logs
              </summary>
              <div className="mt-3 max-h-40 overflow-y-auto rounded-lg bg-black p-3 text-[10px] text-zinc-400 font-mono whitespace-pre-wrap leading-relaxed scrollbar-thin scrollbar-thumb-white/10">
                {syncStatus.logs.slice().reverse().map((log, i) => (
                  <div key={i} className="mb-1 border-b border-white/5 pb-1 last:border-0">{log}</div>
                ))}
              </div>
            </details>
          )}
        </div>

        <div className="flex justify-end pt-2">
          <button
            onClick={onSync}
            disabled={syncStatus.status === 'running' || saving}
            className="inline-flex items-center gap-2 rounded-lg bg-surface-strong border border-border-subtle px-6 py-2 text-sm font-semibold text-foreground hover:border-foreground disabled:opacity-50 transition-all active:scale-95"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>
            {syncStatus.status === 'running' ? 'Syncing...' : 'Sync Now'}
          </button>
        </div>
      </div>

      {showPicker && (
        <CloudPathPicker
          currentPath={syncDestination}
          onClose={() => setShowPicker(false)}
          onSelect={(path) => {
            onSyncDestinationChange(path);
            setShowPicker(false);
            if (onSave) {
              // Wrap in setTimeout to ensure state is updated before saving
              setTimeout(() => onSave({ syncDest: path }), 0);
            }
          }}
        />
      )}
    </div>
  );
}
