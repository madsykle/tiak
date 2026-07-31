import { formatBytes } from "../../lib/utils";
import { Info } from "lucide-react";

interface SystemInfoSectionProps {
	systemStats: { totalSize: number; fileCount: number } | null;
}

export default function SystemInfoSection({
	systemStats,
}: SystemInfoSectionProps) {
	return (
		<div className="pt-6 border-t border-border-subtle">
			<h2 className="text-lg font-medium text-foreground mb-4 flex items-center gap-2">
				<Info
					width={18}
					height={18}
					strokeWidth={2}
					className="text-foreground"
				/>
				System Information
			</h2>
			<div className="grid grid-cols-2 gap-4">
				<div className="p-4 rounded-xl border border-border-subtle bg-surface-subtle/30">
					<span className="text-[10px] text-content-muted uppercase font-bold tracking-wider block mb-1">
						Total Storage
					</span>
					<span className="text-xl font-mono font-medium text-foreground">
						{systemStats ? formatBytes(systemStats.totalSize) : "--"}
					</span>
				</div>
				<div className="p-4 rounded-xl border border-border-subtle bg-surface-subtle/30">
					<span className="text-[10px] text-content-muted uppercase font-bold tracking-wider block mb-1">
						Total Videos
					</span>
					<span className="text-xl font-mono font-medium text-foreground">
						{systemStats ? systemStats.fileCount : "--"}
					</span>
				</div>
			</div>
		</div>
	);
}
