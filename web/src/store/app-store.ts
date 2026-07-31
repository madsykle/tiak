// Zustand store for auth and app settings - replaces localStorage + event pattern
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { AppSettings, SyncStatus } from "@/lib/types";
import {
	checkAuthSession,
	login as apiLogin,
	logout as apiLogout,
	signup as apiSignup,
} from "@/lib/api";

interface AuthState {
	role: string | null;
	token: string | null;
	guestId: string | null;
	isAuthenticated: boolean;
	isLoading: boolean;
	error: string | null;
}

interface AppState extends AuthState {
	settings: AppSettings;
	syncStatus: SyncStatus;
	login: (username: string, password: string) => Promise<void>;
	logout: () => Promise<void>;
	signup: (username: string, email: string, password: string) => Promise<void>;
	checkAuth: () => Promise<void>;
	updateSetting: <K extends keyof AppSettings>(
		key: K,
		value: AppSettings[K],
	) => void;
	updateSettings: (settings: Partial<AppSettings>) => void;
	updateSyncStatus: (status: Partial<SyncStatus>) => void;
}

export const useAppStore = create<AppState>()(
	persist(
		(set) => ({
			role: null,
			token:
				typeof window !== "undefined" ? localStorage.getItem("token") : null,
			guestId:
				typeof window !== "undefined" ? localStorage.getItem("guest_id") : null,
			isAuthenticated: false,
			isLoading: false,
			error: null,
			settings: {
				maxConcurrent: 2,
				syncDestination: "onedrive:others/Edits",
				syncMode: "copy",
				playerType: "custom",
			},
			syncStatus: {
				status: "idle",
				lastRun: null,
				logs: [],
				error: null,
				unsyncedCount: 0,
			},
			login: async (username: string, password: string) => {
				set({ isLoading: true, error: null });
				try {
					const data = await apiLogin(username, password);
					set({
						role: data.role,
						token: data.token,
						isAuthenticated: true,
						isLoading: false,
					});
					window.dispatchEvent(new Event("auth-change"));
				} catch (err: unknown) {
					set({
						error: err instanceof Error ? err.message : "Login failed",
						isLoading: false,
					});
					throw err;
				}
			},
			logout: async () => {
				set({ isLoading: true });
				try {
					await apiLogout();
					set({
						role: null,
						token: null,
						isAuthenticated: false,
						isLoading: false,
					});
					window.dispatchEvent(new Event("auth-change"));
				} catch (err: unknown) {
					set({
						error: err instanceof Error ? err.message : "Logout failed",
						isLoading: false,
					});
					throw err;
				}
			},
			signup: async (username: string, email: string, password: string) => {
				set({ isLoading: true, error: null });
				try {
					await apiSignup(username, email, password);
					const data = await apiLogin(username, password);
					set({
						role: data.role,
						token: data.token,
						isAuthenticated: true,
						isLoading: false,
					});
					window.dispatchEvent(new Event("auth-change"));
				} catch (err: unknown) {
					set({
						error: err instanceof Error ? err.message : "Signup failed",
						isLoading: false,
					});
					throw err;
				}
			},
			checkAuth: async () => {
				set({ isLoading: true });
				try {
					const session = await checkAuthSession();
					set({
						role: session?.role ?? null,
						isAuthenticated: !!session && session.role !== "guest",
						isLoading: false,
					});
				} catch {
					set({ role: "guest", isAuthenticated: false, isLoading: false });
				}
			},
			updateSetting: <K extends keyof AppSettings>(
				key: K,
				value: AppSettings[K],
			) => {
				set((state) => ({
					settings: { ...state.settings, [key]: value },
				}));
			},
			updateSettings: (settings: Partial<AppSettings>) => {
				set((state) => ({
					settings: { ...state.settings, ...settings },
				}));
			},
			updateSyncStatus: (status: Partial<SyncStatus>) => {
				set((state) => ({
					syncStatus: { ...state.syncStatus, ...status },
				}));
			},
		}),
		{ name: "tiak-app-store" },
	),
);

// Selectors - hooks for consuming store slices
export const useAuthState = () => {
	const {
		role,
		token,
		isAuthenticated,
		isLoading,
		error,
		login,
		logout,
		signup,
		checkAuth,
	} = useAppStore();
	return {
		role,
		token,
		isAuthenticated,
		isLoading,
		error,
		login,
		logout,
		signup,
		checkAuth,
	};
};

export const useAppSettings = () => {
	const settings = useAppStore((s) => s.settings);
	const updateSetting = useAppStore((s) => s.updateSetting);
	const updateSettings = useAppStore((s) => s.updateSettings);
	return { settings, updateSetting, updateSettings };
};

export const useSyncState = () => {
	const syncStatus = useAppStore((s) => s.syncStatus);
	const updateSyncStatus = useAppStore((s) => s.updateSyncStatus);
	return { syncStatus, updateSyncStatus };
};
