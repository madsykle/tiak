import { HardDrive, Info, Video } from "lucide-react";
import { formatBytes } from "../../lib/utils";

interface SystemInfoSectionProps { systemStats: { totalSize: number; fileCount: number } | null; }

export default function SystemInfoSection({ systemStats }: SystemInfoSectionProps) {
	return <section className="space-y-4 border-t border-border-subtle pt-6"><div><p className="eyebrow">Workspace</p><h2 className="type-section-header mt-1 flex items-center gap-2"><Info size={17} className="text-accent" />Storage overview</h2></div><div className="grid grid-cols-2 gap-2"><div className="app-card-muted p-4"><HardDrive size={16} className="mb-3 text-accent" /><p className="text-xs text-content-muted">Total storage</p><p className="mt-1 font-mono text-lg font-semibold">{systemStats ? formatBytes(systemStats.totalSize) : "Loading"}</p></div><div className="app-card-muted p-4"><Video size={16} className="mb-3 text-accent" /><p className="text-xs text-content-muted">Total videos</p><p className="mt-1 font-mono text-lg font-semibold">{systemStats ? systemStats.fileCount : "Loading"}</p></div></div></section>;
}
