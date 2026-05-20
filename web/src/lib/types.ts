// Shared type definitions for the Tiak application

// File-related types
export interface FileItem {
  path: string;
  name: string;
  size: number;
  createdAt: number;
  dateFolder: string;
  category: string;
  platform?: string;
  creator?: string;
  caption?: string;
}

export interface FileIndexResponse {
  byDate: Record<string, FileItem[]>;
  byCategory: Record<string, Record<string, FileItem[]>>;
  lastScan: number;
  infoByKey?: Record<string, JobInfo>;
}

export interface JobInfo {
  platform: string;
  creator?: string;
  caption?: string;
}

// Queue/Download types
export interface DownloadJob {
  id: string;
  url: string;
  status: "queued" | "downloading" | "done" | "failed" | "imported" | "missing";
  filename: string | null;
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
  retries: number;
  error: string | null;
  progress: number;
  eta: number | null;
  category: string;
  platform?: string | null;
  creator_name?: string;
  creator_avatar?: string;
  caption?: string;
}

export interface HistoryResponse {
  items: DownloadJob[];
  total: number;
  page: number;
  limit: number;
}

export interface AddJobResponse {
  added: DownloadJob[];
  skipped: { url: string; reason: string; jobId?: string; finishedAt?: number }[];
}

// System types
export interface DiskUsage {
  totalSize: number;
  fileCount: number;
}

export interface DeleteFilesResponse {
  deleted: string[];
  errors: string[];
}

// Settings types
export interface AppSettings {
  maxConcurrent?: number;
  syncDestination?: string;
  syncMode?: string;
  playerType?: 'native' | 'custom';
}

export interface SyncStatus {
  status: string;
  lastRun: string | null;
  logs: string[];
  error: string | null;
  unsyncedCount: number;
}

// Category types
export interface CategoryOperationResponse {
  success: boolean;
  message?: string;
}

// Timeline types
export interface TimelineEntry {
  date: string;
  files: FileItem[];
  count: number;
}

// Filter/Sort types
export type SortOption = 'name' | 'size' | 'time' | 'platform';
export type SortDirection = 'asc' | 'desc';

// API response wrapper
export interface ApiResponse<T> {
  data?: T;
  error?: string;
  timestamp: number;
}

// Helper type for API calls
export type ApiFunction<T, Args extends unknown[] = []> = (...args: Args) => Promise<T>;

// React component props with shared types
export interface WithFileItems {
  files: FileItem[];
  selectedPaths: Set<string>;
  onFileSelect?: (path: string) => void;
  onPreview?: (file: FileItem) => void;
}

export interface WithCategories {
  categories: string[];
  selectedCategory?: string;
  onCategoryChange?: (category: string) => void;
}