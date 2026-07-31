import React from "react";

interface CategoryBadgeProps {
	category: string;
	className?: string;
}

export default function CategoryBadge({ category, className = "" }: CategoryBadgeProps) {
	const displayCat = category || "default";

	return (
		<span
			className={`inline-flex max-w-full items-center truncate rounded-md border border-accent/25 bg-accent/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-accent ${className}`}
			title={displayCat}
		>
			{displayCat}
		</span>
	);
}
