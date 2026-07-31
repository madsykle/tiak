import type { ReactNode } from 'react';
import { Settings, RefreshCw, Database, Image as ImageIcon } from 'lucide-react';

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
        <Settings width={18} height={18} strokeWidth={2} className="text-foreground" />
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
          icon={<RefreshCw width={18} height={18} strokeWidth={2} className="text-current" />}
        />
        <ToolRow
          color="purple"
          title="Backfill Metadata"
          description="Re-fetch missing creator names and captions from original sources."
          running={backfillRunning}
          idleLabel="Run"
          runningLabel="Starting..."
          onClick={onBackfill}
          icon={<Database width={18} height={18} strokeWidth={2} className="text-current" />}
        />
        <ToolRow
          color="orange"
          title="Generate Thumbnails"
          description="Fast static previews for all existing videos. Fixes missing thumbnails."
          running={thumbBackfillRunning}
          idleLabel="Run"
          runningLabel="Starting..."
          onClick={onThumbBackfill}
          icon={<ImageIcon width={18} height={18} strokeWidth={2} className="text-current" />}
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
