import { API_BASE } from './config';

export interface DownloadJob {
  id: string;
  url: string;
  status: "queued" | "downloading" | "done" | "failed" | "imported" | "missing";
  filename: string | null;
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
  expiresAt?: number | null;
  retries: number;
  error: string | null;
  progress: number;
  eta: number | null;
  category: string;
  /** Source platform: tiktok | instagram | youtube | unknown (separate from category) */
  platform?: string | null;
  creator_name?: string;
  creator_avatar?: string;
  caption?: string;
}

export interface FileInfo {
  jobId: string;
  url: string;
  status: string;
  progress: number;
  category: string;
  platform?: string | null;
  creator?: string;
  caption?: string;
}

export function getToken(): string | null {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('token');
  }
  return null;
}

export function getRole(): string | null {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('role');
  }
  return null;
}

export function getGuestId(): string {
  if (typeof window !== 'undefined') {
    let id = localStorage.getItem('guest_id');
    if (!id) {
      id = `guest_${Math.random().toString(36).substring(2, 11)}`;
      localStorage.setItem('guest_id', id);
    }
    return id;
  }
  return 'unknown_guest';
}

export async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const headers = new Headers(options.headers || {});
  
  headers.set('ngrok-skip-browser-warning', 'true');
  headers.set('X-Guest-ID', getGuestId());

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('token');
      localStorage.removeItem('role');
      // Dispatch an event so layout/components can react
      window.dispatchEvent(new Event('auth-change'));
    }
  }
  return res;
}

export async function login(username: string, password: string): Promise<{ token: string; role: string }> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
    body: JSON.stringify({ username, password })
  });
  
  if (!res.ok) {
    throw new Error('Invalid credentials');
  }
  
  const data = await res.json();
  if (typeof window !== 'undefined') {
    localStorage.setItem('token', data.token);
    localStorage.setItem('role', data.role);
    window.dispatchEvent(new Event('auth-change'));
  }
  return data;
}

export async function logout(): Promise<void> {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    window.dispatchEvent(new Event('auth-change'));
  }
}

export async function signup(username: string, email: string, password: string): Promise<void> {
  const res = await fetch(`${API_BASE}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
    body: JSON.stringify({ username, email, password })
  });
  
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || 'Signup failed');
  }
}

export async function getFileInfo(path: string): Promise<FileInfo> {
  const res = await fetchWithAuth(`${API_BASE}/files/info?path=${encodeURIComponent(path)}`);
  if (!res.ok) {
    throw new Error('Failed to fetch file info');
  }
  return res.json();
}

export interface HistoryResponse {
  items: DownloadJob[];
  total: number;
  page: number;
  limit: number;
}

export interface DiskUsage {
  totalSize: number;
  fileCount: number;
}

export interface DeleteFilesResponse {
  deleted: string[];
  errors: string[];
}

export interface AddJobResponse {
  added: DownloadJob[];
  skipped: { url: string; reason: string; jobId?: string; finishedAt?: number }[];
}

export async function getHistory(page: number = 1, limit: number = 50): Promise<HistoryResponse> {
  // Use relative paths since API_BASE already includes /api
  const res = await fetchWithAuth(`${API_BASE}/queue/history?page=${page}&limit=${limit}`);
  if (!res.ok) {
    throw new Error('Failed to fetch history');
  }
  return res.json();
}

export async function retryJob(id: string): Promise<DownloadJob> {
  const res = await fetchWithAuth(`${API_BASE}/queue/retry/${id}`, {
    method: 'POST',
  });
  if (!res.ok) {
    throw new Error('Failed to retry job');
  }
  return res.json();
}

export async function redownloadJob(id: string): Promise<DownloadJob> {
  const res = await fetchWithAuth(`${API_BASE}/queue/redownload/${id}`, {
    method: 'POST',
  });
  if (!res.ok) {
    throw new Error('Failed to redownload job');
  }
  return res.json();
}

export async function deleteJob(id: string): Promise<void> {
  const res = await fetchWithAuth(`${API_BASE}/queue/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    throw new Error('Failed to delete job');
  }
}

export async function importHistory(file: File): Promise<{ imported: number; skipped: number }> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetchWithAuth(`${API_BASE}/queue/import`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to import history');
  }

  return res.json();
}

export async function getSystemUsage(): Promise<DiskUsage> {
  const res = await fetchWithAuth(`${API_BASE}/system/usage`);
  if (!res.ok) {
    throw new Error('Failed to fetch system usage');
  }
  return res.json();
}

export async function listCategories(): Promise<string[]> {
  const res = await fetchWithAuth(`${API_BASE}/categories`);
  if (!res.ok) throw new Error('Failed to list categories');
  return res.json();
}

export async function deleteFiles(paths: string[]): Promise<DeleteFilesResponse> {
  const res = await fetchWithAuth(`${API_BASE}/files`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paths })
  });
  if (!res.ok) {
    throw new Error('Failed to delete files');
  }
  return res.json();
}

export async function zipFiles(paths: string[]): Promise<Blob> {
  const res = await fetchWithAuth(`${API_BASE}/files/zip`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paths })
  });
  if (!res.ok) {
    throw new Error('Failed to create ZIP');
  }
  return res.blob();
}



export async function createCategory(name: string): Promise<void> {
  const res = await fetchWithAuth(`${API_BASE}/categories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });
  if (!res.ok) throw new Error('Failed to create category');
}

export async function deleteCategory(name: string): Promise<void> {
  const res = await fetchWithAuth(`${API_BASE}/categories/${name}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete category');
}

export async function renameCategory(oldName: string, newName: string): Promise<void> {
  const res = await fetchWithAuth(`${API_BASE}/categories/rename`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ old: oldName, new: newName })
  });
  if (!res.ok) throw new Error('Failed to rename category');
}

export async function moveFile(path: string | null, newCategory: string, jobId?: string): Promise<{ success: boolean; newPath: string }> {
  const body: { newCategory: string; path?: string; jobId?: string } = { newCategory };
  if (path) body.path = path;
  if (jobId) body.jobId = jobId;

  const res = await fetchWithAuth(`${API_BASE}/files/move`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error('Failed to move file');
  return res.json();
}

export async function runMaintenance(): Promise<void> {
  const res = await fetchWithAuth(`${API_BASE}/maintenance/fix-categories`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to start maintenance');
}

export async function backfillMetadata(): Promise<void> {
  const res = await fetchWithAuth(`${API_BASE}/maintenance/backfill-metadata`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to start metadata backfill');
}

export async function backfillThumbnails(): Promise<void> {
  const res = await fetchWithAuth(`${API_BASE}/maintenance/backfill-thumbnails`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to start thumbnail backfill');
}

export function getExportUrl(): string {
  return `${API_BASE}/queue/export`;
}

export function getStreamUrl(path: string): string {
  return `${API_BASE}/files/stream?path=${encodeURIComponent(path)}`;
}

export function getThumbnailUrl(path: string): string {
  return `${API_BASE}/files/thumbnail?path=${encodeURIComponent(path)}`;
}

export function getDownloadUrl(path: string): string {
  return `${API_BASE}/files/download?path=${encodeURIComponent(path)}`;
}

export function getPreviewUrl(dateFolder: string, filename: string): string {
  return getStreamUrl(`data/${dateFolder}/${filename}`);
}