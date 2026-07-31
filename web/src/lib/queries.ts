import {
	useQuery,
	useMutation,
	useQueryClient,
	type UseQueryOptions,
} from "@tanstack/react-query";
import { fetchWithAuth } from "./api";
import { API_BASE } from "./config";
import type {
	DownloadJob,
	HistoryResponse,
	AddJobResponse,
	RetryResponse,
	DiskUsage,
	DeleteFilesResponse,
	FileResponse,
	SyncStatus,
	AppSettings,
} from "./types";

// ============================================
// Query Keys
// ============================================
export const queryKeys = {
	jobs: ["jobs"] as const,
	history: ["history"] as const,
	files: ["files"] as const,
	usage: ["usage"] as const,
	categories: ["categories"] as const,
	settings: ["settings"] as const,
	syncStatus: ["syncStatus"] as const,
	auth: ["auth"] as const,
	search: (q: string) => ["search", q] as const,
	byCategory: (name: string) => ["byCategory", name] as const,
	byCreator: (name: string) => ["byCreator", name] as const,
	stats: ["stats"] as const,
	timeline: ["timeline"] as const,
};

// ============================================
// Auth Queries
// ============================================
export function useAuth() {
	return useQuery({
		queryKey: queryKeys.auth,
		queryFn: async () => {
			const res = await fetchWithAuth(`${API_BASE}/auth/me`);
			if (!res.ok) throw new Error("Not authenticated");
			return res.json() as Promise<{ username: string; role: string }>;
		},
		retry: false,
		staleTime: 5 * 60 * 1000,
	});
}

// ============================================
// Queue/Jobs Queries & Mutations
// ============================================
export function useJobs(options?: UseQueryOptions<DownloadJob[]>) {
	return useQuery({
		queryKey: queryKeys.jobs,
		queryFn: async () => {
			const res = await fetchWithAuth(`${API_BASE}/queue/list`);
			if (!res.ok) throw new Error("Failed to fetch jobs");
			return res.json() as Promise<DownloadJob[]>;
		},
		refetchInterval: 5000,
		...options,
	});
}

export function useHistory(page = 1, limit = 50) {
	return useQuery({
		queryKey: ["history", page, limit],
		queryFn: async () => {
			const res = await fetchWithAuth(
				`${API_BASE}/queue/history?page=${page}&limit=${limit}`,
			);
			if (!res.ok) throw new Error("Failed to fetch history");
			return res.json() as Promise<HistoryResponse>;
		},
		refetchInterval: 15000,
	});
}

export function useAddJob() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async ({ urls, category }: { urls: string; category: string }) => {
			const res = await fetchWithAuth(`${API_BASE}/queue/add`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ urls, category }),
			});
			if (!res.ok) throw new Error("Failed to add jobs");
			return res.json() as Promise<AddJobResponse>;
		},
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: queryKeys.jobs });
			qc.invalidateQueries({ queryKey: queryKeys.history });
		},
	});
}

export function useRetryJob() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (id: string) => {
			const res = await fetchWithAuth(`${API_BASE}/queue/retry/${id}`, {
				method: "POST",
			});
			if (!res.ok) throw new Error("Failed to retry");
			return res.json() as Promise<RetryResponse>;
		},
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: queryKeys.jobs });
			qc.invalidateQueries({ queryKey: queryKeys.history });
		},
	});
}

export function useRedownloadJob() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (id: string) => {
			const res = await fetchWithAuth(`${API_BASE}/queue/redownload/${id}`, {
				method: "POST",
			});
			if (!res.ok) throw new Error("Failed to redownload");
			return res.json() as Promise<RetryResponse>;
		},
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: queryKeys.jobs });
			qc.invalidateQueries({ queryKey: queryKeys.history });
		},
	});
}

export function useDeleteJob() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (id: string) => {
			const res = await fetchWithAuth(`${API_BASE}/queue/${id}`, {
				method: "DELETE",
			});
			if (!res.ok) throw new Error("Failed to delete");
		},
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: queryKeys.jobs });
			qc.invalidateQueries({ queryKey: queryKeys.history });
		},
	});
}

// ============================================
// Files Queries & Mutations
// ============================================
export function useFiles() {
	return useQuery({
		queryKey: queryKeys.files,
		queryFn: async () => {
			const res = await fetchWithAuth(`${API_BASE}/files`);
			if (!res.ok) throw new Error("Failed to fetch files");
			return res.json() as Promise<FileResponse>;
		},
		staleTime: 30000,
		refetchInterval: 60000,
	});
}

export function useUsage() {
	return useQuery({
		queryKey: queryKeys.usage,
		queryFn: async () => {
			const res = await fetchWithAuth(`${API_BASE}/system/usage`);
			if (!res.ok) throw new Error("Failed to fetch usage");
			return res.json() as Promise<DiskUsage>;
		},
		staleTime: 60000,
	});
}

export function useCategories() {
	return useQuery({
		queryKey: queryKeys.categories,
		queryFn: async () => {
			const res = await fetchWithAuth(`${API_BASE}/categories`);
			if (!res.ok) throw new Error("Failed to fetch categories");
			return res.json() as Promise<string[]>;
		},
		staleTime: 5 * 60 * 1000,
	});
}

export function useDeleteFiles() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (paths: string[]) => {
			const res = await fetchWithAuth(`${API_BASE}/files`, {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ paths }),
			});
			if (!res.ok) throw new Error("Failed to delete");
			return res.json() as Promise<DeleteFilesResponse>;
		},
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: queryKeys.files });
			qc.invalidateQueries({ queryKey: queryKeys.usage });
			qc.invalidateQueries({ queryKey: queryKeys.jobs });
		},
	});
}

export function useZipFiles() {
	return useMutation({
		mutationFn: async (paths: string[]) => {
			const res = await fetchWithAuth(`${API_BASE}/files/zip`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ paths }),
			});
			if (!res.ok) throw new Error("Failed to zip");
			return res.blob();
		},
	});
}

export function useMoveFile() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async ({
			path,
			newCategory,
			jobId,
		}: {
			path?: string;
			newCategory: string;
			jobId?: string;
		}) => {
			const body: { newCategory: string; path?: string; jobId?: string } = {
				newCategory,
			};
			if (path) body.path = path;
			if (jobId) body.jobId = jobId;

			const res = await fetchWithAuth(`${API_BASE}/files/move`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});
			if (!res.ok) throw new Error("Failed to move");
			return res.json() as Promise<{ success: boolean; newPath: string }>;
		},
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: queryKeys.files });
			qc.invalidateQueries({ queryKey: queryKeys.jobs });
		},
	});
}

export function useCreateCategory() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (name: string) => {
			const res = await fetchWithAuth(`${API_BASE}/categories`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name }),
			});
			if (!res.ok) throw new Error("Failed to create category");
		},
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: queryKeys.categories });
			qc.invalidateQueries({ queryKey: queryKeys.files });
		},
	});
}

export function useDeleteCategory() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (name: string) => {
			const res = await fetchWithAuth(`${API_BASE}/categories/${name}`, {
				method: "DELETE",
			});
			if (!res.ok) throw new Error("Failed to delete category");
		},
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: queryKeys.categories });
			qc.invalidateQueries({ queryKey: queryKeys.files });
		},
	});
}

export function useRenameCategory() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async ({ old, new: newName }: { old: string; new: string }) => {
			const res = await fetchWithAuth(`${API_BASE}/categories/rename`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ old, new: newName }),
			});
			if (!res.ok) throw new Error("Failed to rename category");
		},
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: queryKeys.categories });
			qc.invalidateQueries({ queryKey: queryKeys.files });
		},
	});
}

// ============================================
// Search Queries
// ============================================
export function useSearch(q: string) {
	return useQuery({
		queryKey: queryKeys.search(q),
		queryFn: async () => {
			const res = await fetchWithAuth(
				`${API_BASE}/videos/search?q=${encodeURIComponent(q)}`,
			);
			if (!res.ok) throw new Error("Search failed");
			return res.json() as Promise<DownloadJob[]>;
		},
		enabled: q.length > 0,
		staleTime: 30000,
	});
}

export function useByCategory(name: string) {
	return useQuery({
		queryKey: queryKeys.byCategory(name),
		queryFn: async () => {
			const res = await fetchWithAuth(
				`${API_BASE}/videos/category/${encodeURIComponent(name)}`,
			);
			if (!res.ok) throw new Error("Failed to fetch category");
			return res.json() as Promise<DownloadJob[]>;
		},
		enabled: !!name,
	});
}

export function useByCreator(name: string) {
	return useQuery({
		queryKey: queryKeys.byCreator(name),
		queryFn: async () => {
			const res = await fetchWithAuth(
				`${API_BASE}/videos/creator/${encodeURIComponent(name)}`,
			);
			if (!res.ok) throw new Error("Failed to fetch creator");
			return res.json() as Promise<DownloadJob[]>;
		},
		enabled: !!name,
	});
}

// ============================================
// Admin Queries & Mutations
// ============================================
export function useStats() {
	return useQuery({
		queryKey: queryKeys.stats,
		queryFn: async () => {
			const res = await fetchWithAuth(`${API_BASE}/admin/stats`);
			if (!res.ok) throw new Error("Failed to fetch stats");
			return res.json() as Promise<{
				total: number;
				queued: number;
				downloading: number;
				done: number;
				failed: number;
				missing: number;
			}>;
		},
		staleTime: 30000,
	});
}

export function useTimeline() {
	return useQuery({
		queryKey: queryKeys.timeline,
		queryFn: async () => {
			const res = await fetchWithAuth(`${API_BASE}/timeline`);
			if (!res.ok) throw new Error("Failed to fetch timeline");
			return res.json() as Promise<DownloadJob[]>;
		},
		staleTime: 60000,
	});
}

export function useSyncStatus() {
	return useQuery({
		queryKey: queryKeys.syncStatus,
		queryFn: async () => {
			const res = await fetchWithAuth(`${API_BASE}/sync/status`);
			if (!res.ok) throw new Error("Failed to fetch sync status");
			return res.json() as Promise<SyncStatus>;
		},
		refetchInterval: 10000,
	});
}

export function useSettings() {
	return useQuery({
		queryKey: queryKeys.settings,
		queryFn: async () => {
			const res = await fetchWithAuth(`${API_BASE}/settings`);
			if (!res.ok) throw new Error("Failed to fetch settings");
			return res.json() as Promise<AppSettings>;
		},
		staleTime: 60000,
	});
}

export function useUpdateSettings() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (settings: Partial<AppSettings>) => {
			const res = await fetchWithAuth(`${API_BASE}/settings`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(settings),
			});
			if (!res.ok) throw new Error("Failed to update settings");
			return res.json() as Promise<AppSettings>;
		},
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: queryKeys.settings });
		},
	});
}

export function useRunSync() {
	return useMutation({
		mutationFn: async () => {
			const res = await fetchWithAuth(`${API_BASE}/sync/run`, {
				method: "POST",
			});
			if (!res.ok) throw new Error("Sync failed");
			return res.json();
		},
	});
}

export function useRunMaintenance() {
	return useMutation({
		mutationFn: async () => {
			const res = await fetchWithAuth(
				`${API_BASE}/maintenance/fix-categories`,
				{ method: "POST" },
			);
			if (!res.ok) throw new Error("Maintenance failed");
			return res.json();
		},
	});
}

export function useBackfillMetadata() {
	return useMutation({
		mutationFn: async () => {
			const res = await fetchWithAuth(
				`${API_BASE}/maintenance/backfill-metadata`,
				{ method: "POST" },
			);
			if (!res.ok) throw new Error("Backfill failed");
			return res.json();
		},
	});
}

export function useBackfillThumbnails() {
	return useMutation({
		mutationFn: async () => {
			const res = await fetchWithAuth(
				`${API_BASE}/maintenance/backfill-thumbnails`,
				{ method: "POST" },
			);
			if (!res.ok) throw new Error("Thumbnail backfill failed");
			return res.json();
		},
	});
}

// ============================================
// Import/Export
// ============================================
export function useExportJobs() {
	return useMutation({
		mutationFn: async () => {
			const res = await fetchWithAuth(`${API_BASE}/queue/export`);
			if (!res.ok) throw new Error("Export failed");
			return res.blob();
		},
	});
}

export function useImportJobs() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (file: File) => {
			const formData = new FormData();
			formData.append("file", file);
			const res = await fetchWithAuth(`${API_BASE}/queue/import`, {
				method: "POST",
				body: formData,
			});
			if (!res.ok) throw new Error("Import failed");
			return res.json() as Promise<{ imported: number; skipped: number }>;
		},
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: queryKeys.jobs });
			qc.invalidateQueries({ queryKey: queryKeys.history });
		},
	});
}
