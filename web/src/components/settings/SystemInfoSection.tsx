import { formatBytes } from '../../lib/utils';

interface SystemInfoSectionProps {
  systemStats: { totalSize: number; fileCount: number } | null;
}

export default function SystemInfoSection({ systemStats }: SystemInfoSectionProps) {
  return (
    <div className="pt-6 border-t border-border-subtle">
      <h2 className="text-lg font-medium text-foreground mb-4 flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
        System Information
      </h2>
      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 rounded-xl border border-border-subtle bg-surface-subtle/30">
          <span className="text-[10px] text-content-muted uppercase font-bold tracking-wider block mb-1">Total Storage</span>
          <span className="text-xl font-mono font-medium text-foreground">{systemStats ? formatBytes(systemStats.totalSize) : '--'}</span>
        </div>
        <div className="p-4 rounded-xl border border-border-subtle bg-surface-subtle/30">
          <span className="text-[10px] text-content-muted uppercase font-bold tracking-wider block mb-1">Total Videos</span>
          <span className="text-xl font-mono font-medium text-foreground">{systemStats ? systemStats.fileCount : '--'}</span>
        </div>
      </div>
    </div>
  );
}
