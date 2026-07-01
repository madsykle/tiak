import type { ReactNode } from 'react';

interface MaintenanceToolsSectionProps {
  maintenanceRunning: boolean;
  backfillRunning: boolean;
  thumbBackfillRunning: boolean;
  onMaintenance: () => void;
  onBackfill: () => void;
  onThumbBackfill: () => void;
}

export default function MaintenanceToolsSection({
  maintenanceRunning,
  backfillRunning,
  thumbBackfillRunning,
  onMaintenance,
  onBackfill,
  onThumbBackfill,
}: MaintenanceToolsSectionProps) {
  return (
    <div className="pt-6 border-t border-border-subtle">
      <h2 className="text-lg font-medium text-foreground mb-4 flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a2 2 0 0 1 2.83 0l.3.3a2 2 0 0 1 0 2.83l-3.77 3.77a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a2 2 0 0 1 2.83 0l.3.3a2 2 0 0 1 0 2.83l-3.77 3.77a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a2 2 0 0 1 2.83 0l.3.3a2 2 0 0 1 0 2.83l-3.77 3.77a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a2 2 0 0 1 2.83 0l.3.3a2 2 0 0 1 0 2.83l-3.77 3.77a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0"/></svg>
        Maintenance & Tools
      </h2>
      <div className="grid grid-cols-1 gap-3">
        <ToolRow
          color="blue"
          title="Sync Database"
          description="Fix categories and rescan all local files to match the database."
          running={maintenanceRunning}
          idleLabel="Run"
          runningLabel="Running..."
          onClick={onMaintenance}
          icon={<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>}
        />
        <ToolRow
          color="purple"
          title="Backfill Metadata"
          description="Re-fetch missing creator names and captions from original sources."
          running={backfillRunning}
          idleLabel="Run"
          runningLabel="Starting..."
          onClick={onBackfill}
          icon={<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><path d="M12 18v-6"/><path d="m9 15 3 3 3-3"/></svg>}
        />
        <ToolRow
          color="orange"
          title="Generate Thumbnails"
          description="Fast static previews for all existing videos. Fixes missing thumbnails."
          running={thumbBackfillRunning}
          idleLabel="Run"
          runningLabel="Starting..."
          onClick={onThumbBackfill}
          icon={<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>}
        />
      </div>
    </div>
  );
}

interface ToolRowProps {
  color: 'blue' | 'purple' | 'orange';
  title: string;
  description: string;
  running: boolean;
  idleLabel: string;
  runningLabel: string;
  onClick: () => void;
  icon: ReactNode;
}

function ToolRow({ color, title, description, running, idleLabel, runningLabel, onClick, icon }: ToolRowProps) {
  const colorClass = color === 'blue' ? 'bg-blue-500/10 text-blue-500' : color === 'purple' ? 'bg-accent/10 text-accent' : 'bg-orange-500/10 text-orange-500';

  return (
    <div className="flex items-center justify-between p-4 rounded-xl border border-border-subtle bg-surface-subtle/50 hover:bg-surface-subtle transition-colors group">
      <div className="flex gap-3 items-start">
        <div className={`p-2 rounded-lg ${colorClass} mt-0.5`}>{icon}</div>
        <div>
          <h3 className="text-sm font-medium text-foreground">{title}</h3>
          <p className="text-xs text-content-muted mt-1 leading-relaxed">{description}</p>
        </div>
      </div>
      <button onClick={onClick} disabled={running} className="px-3 py-1.5 bg-background border border-border-subtle rounded-lg text-xs font-semibold hover:border-foreground transition-all disabled:opacity-50">
        {running ? runningLabel : idleLabel}
      </button>
    </div>
  );
}
