import React from 'react';

interface CategoryBadgeProps {
  category: string;
  className?: string;
}

export default function CategoryBadge({ category, className = '' }: CategoryBadgeProps) {
  // Generate a consistent border color based on the category name
  const getBorderColor = (str: string) => {
    const colors = [
      'border-l-accent',
      'border-l-neon-cyan',
      'border-l-neon-pink',
      'border-l-neon-red',
      'border-l-emerald-500',
      'border-l-amber-500',
      'border-l-blue-500',
    ];
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  const displayCat = category || 'default';
  const borderColor = getBorderColor(displayCat);

  return (
    <span 
      className={`inline-flex items-center rounded-r-md rounded-l-sm bg-surface-strong px-2 py-0.5 border-y border-r border-border/50 border-l-[3px] ${borderColor} type-label text-content-muted shadow-sm ${className}`}
      title={displayCat}
    >
      {displayCat}
    </span>
  );
}
