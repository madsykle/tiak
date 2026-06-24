import React from 'react';

export default function CategoryBadge({ category }: { category: string }) {
  return (
    <span className="inline-flex items-center rounded-r-md rounded-l-sm bg-surface-strong px-2 py-0.5 border-y border-r border-border/50 border-l-[3px] border-l-accent type-label text-content-muted shadow-sm">
      {category || 'default'}
    </span>
  );
}
