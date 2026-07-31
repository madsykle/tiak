"use client";

import Image from "next/image";
import { useState } from "react";

interface ThumbnailProps {
  path: string;
  alt?: string;
  width?: number;
  height?: number;
  className?: string;
  priority?: boolean;
}

export default function Thumbnail({
  path,
  alt = "Thumbnail",
  width = 200,
  height = 150,
  className = "",
  priority = false,
}: ThumbnailProps) {
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState(false);

  if (error) {
    return (
      <div
        className={`bg-surface-strong rounded-lg flex items-center justify-center ${className}`}
        style={{ width, height }}
      >
        <svg
          className="w-8 h-8 text-content-muted"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      </div>
    );
  }

  const thumbnailUrl = `/api/files/thumbnail?path=${encodeURIComponent(path)}`;

  return (
    <div
      className={`relative overflow-hidden rounded-lg bg-surface-strong ${className}`}
      style={{ width, height }}
    >
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </div>
      )}
      <Image
        src={thumbnailUrl}
        alt={alt}
        width={width}
        height={height}
        className={`transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
        priority={priority}
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
      />
    </div>
  );
}