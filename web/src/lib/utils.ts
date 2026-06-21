export function platformLabel(platform: string): string {
  const labels: Record<string, string> = { tiktok: 'TikTok', instagram: 'Instagram', youtube: 'YouTube' };
  return labels[platform] ?? platform;
}

export function platformBadgeClass(platform: string): string {
  const base = 'px-1.5 py-0.5 rounded text-[10px]';
  const colors: Record<string, string> = {
    tiktok: 'bg-zinc-900 text-white',
    instagram: 'bg-pink-500/15 text-pink-600',
    youtube: 'bg-red-500/15 text-red-600',
  };
  return `${base} ${colors[platform] ?? 'bg-surface-strong'}`;
}

export function formatBytes(bytes: number, decimals = 2): string {
  if (!+bytes) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export function triggerInvisibleDownload(url: string) {
  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  iframe.src = url;
  document.body.appendChild(iframe);
  
  // Remove the iframe after a reasonable timeout to clean up the DOM
  setTimeout(() => {
    if (document.body.contains(iframe)) {
      document.body.removeChild(iframe);
    }
  }, 10000);
}
