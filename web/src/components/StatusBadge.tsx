import React from "react";

interface StatusBadgeProps {
	status: "queued" | "downloading" | "done" | "completed" | "failed" | "missing" | "imported";
}

const styles: Record<StatusBadgeProps["status"], string> = {
	queued: "bg-surface-strong text-content-muted ring-border",
	downloading: "bg-accent/[0.12] text-accent ring-accent/[0.25]",
	done: "bg-emerald-400/[0.12] text-emerald-300 ring-emerald-400/[0.25]",
	completed: "bg-emerald-400/[0.12] text-emerald-300 ring-emerald-400/[0.25]",
	failed: "bg-red-400/[0.12] text-red-300 ring-red-400/[0.25]",
	missing: "bg-amber-400/[0.12] text-amber-300 ring-amber-400/[0.25]",
	imported: "bg-sky-400/[0.12] text-sky-300 ring-sky-400/[0.25]",
};

const labels: Record<StatusBadgeProps["status"], string> = {
	queued: "Queued",
	downloading: "Downloading",
	done: "Completed",
	completed: "Completed",
	failed: "Failed",
	missing: "Expired",
	imported: "Imported",
};

export default function StatusBadge({ status }: StatusBadgeProps) {
	return (
		<span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-wide ring-1 ring-inset ${styles[status] || styles.queued}`}>
			{labels[status] || status}
		</span>
	);
}
