"use client";

import { useState, useEffect, useCallback } from "react";
import CategorySettingsSection from "@/components/settings/CategorySettingsSection";
import MaintenanceToolsSection from "@/components/settings/MaintenanceToolsSection";
import SystemInfoSection from "@/components/settings/SystemInfoSection";
import CloudSyncSection from "@/components/settings/CloudSyncSection";
import PlayerPreferencesSection from "@/components/settings/PlayerPreferencesSection";
import { useVisibilityPolling } from "@/hooks/useVisibilityPolling";
import { fetchWithAuth } from "@/lib/api";
import { API_BASE } from "@/lib/config";
import { useAuthState, useAppStore } from "@/store/app-store";
import {
	useCategories,
	useCreateCategory,
	useDeleteCategory,
	useRenameCategory,
	useSettings,
	useUpdateSettings,
	useRunSync,
	useRunMaintenance,
	useBackfillMetadata,
	useBackfillThumbnails,
	useUsage,
} from "@/lib/queries";

const normalizeSyncDestination = (destination: string) =>
	destination.trim().toLowerCase() === "onedrive:others/edits"
		? "onedrive:EDITS"
		: destination;

export default function SettingsPage() {
	const { role, login, logout, signup } = useAuthState();
	const settings = useAppStore((s) => s.settings);
	const updateSetting = useAppStore((s) => s.updateSetting);
	const updateSettings = useAppStore((s) => s.updateSettings);
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const [loginLoading, setLoginLoading] = useState(false);
	const [loginError, setLoginError] = useState("");

	const [isRegistering, setIsRegistering] = useState(false);
	const [email, setEmail] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");

	const [syncDestination, setSyncDestination] = useState(
		normalizeSyncDestination(settings.syncDestination || ""),
	);
	const [syncMode, setSyncMode] = useState(settings.syncMode || "copy");
	const [syncStatus, setSyncStatus] = useState<{
		status: string;
		lastRun: string | null;
		logs: string[];
		error: string | null;
		unsyncedCount: number;
	}>({
		status: "idle",
		lastRun: null,
		logs: [],
		error: null,
		unsyncedCount: 0,
	});
	const [maxConcurrent, setMaxConcurrent] = useState<number>(
		settings.maxConcurrent || 2,
	);

	const [playerType, setPlayerType] = useState<"native" | "custom">(
		settings.playerType || "custom",
	);
	const [newCatName, setNewCatName] = useState("");
	const [editingCat, setEditingCat] = useState<{
		original: string;
		current: string;
	} | null>(null);

	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [maintenanceRunning, setMaintenanceRunning] = useState(false);
	const [backfillRunning, setBackfillRunning] = useState(false);
	const [thumbBackfillRunning, setThumbBackfillRunning] = useState(false);
	const [msg, setMsg] = useState<{
		type: "success" | "error";
		text: string;
	} | null>(null);

	// TanStack Query hooks
	const { data: categories = [] } = useCategories(role === "admin");
	const { data: settingsData } = useSettings();
	const { data: usage } = useUsage();
	const createCategoryMutation = useCreateCategory();
	const deleteCategoryMutation = useDeleteCategory();
	const renameCategoryMutation = useRenameCategory();
	const updateSettingsMutation = useUpdateSettings();
	const syncMutation = useRunSync();
	const maintenanceMutation = useRunMaintenance();
	const backfillMutation = useBackfillMetadata();
	const thumbBackfillMutation = useBackfillThumbnails();

	useEffect(() => {
		if (settingsData) {
			if (settingsData.maxConcurrent !== undefined)
				setMaxConcurrent(settingsData.maxConcurrent);
			if (settingsData.syncDestination)
				setSyncDestination(normalizeSyncDestination(settingsData.syncDestination));
			if (settingsData.syncMode) setSyncMode(settingsData.syncMode);
			setLoading(false);
		}
	}, [settingsData]);

	const fetchSyncStatus = useCallback(async () => {
		if (role !== "admin") return;
		try {
			const res = await fetchWithAuth(`${API_BASE}/sync/status`);
			if (res.ok) {
				const responseData: unknown = await res.json();
				const data =
					responseData && typeof responseData === "object"
						? (responseData as Record<string, unknown>)
						: {};
				setSyncStatus({
					status: typeof data.status === "string" ? data.status : "idle",
					lastRun: typeof data.lastRun === "string" ? data.lastRun : null,
					logs: Array.isArray(data.logs)
						? data.logs.filter((log): log is string => typeof log === "string")
						: [],
					error: typeof data.error === "string" ? data.error : null,
					unsyncedCount:
						typeof data.unsyncedCount === "number" ? data.unsyncedCount : 0,
				});
			}
		} catch {
			console.error("Failed to fetch sync status");
		}
	}, [role]);

	useEffect(() => {
		if (role === "admin") {
			fetchSyncStatus();
		}
	}, [role, fetchSyncStatus]);

	useVisibilityPolling(fetchSyncStatus, syncStatus.status === "running" ? 2000 : 10000, {
		runImmediately: false,
	});

	useEffect(() => {
		if (syncStatus.status === "running") {
			void fetchSyncStatus();
		}
	}, [syncStatus.status, fetchSyncStatus]);

	const showMessage = useCallback((type: "success" | "error", text: string) => {
		setMsg({ type, text });
	}, []);

	const handleAuth = async (e: React.FormEvent) => {
		e.preventDefault();
		setLoginError("");
		setLoginLoading(true);

		if (isRegistering) {
			if (password !== confirmPassword) {
				setLoginError("Passwords do not match");
				setLoginLoading(false);
				return;
			}
			try {
				await signup(username, email, password);
				showMessage("success", "Account created successfully!");
				setIsRegistering(false);
				setPassword("");
				setConfirmPassword("");
			} catch (err: unknown) {
				setLoginError(
					err instanceof Error ? err.message : "Registration failed",
				);
			} finally {
				setLoginLoading(false);
			}
		} else {
			try {
				await login(username, password);
			} catch (err: unknown) {
				setLoginError(err instanceof Error ? err.message : "Login failed");
			} finally {
				setLoginLoading(false);
			}
		}
	};

	const handleSave = async (overrides?: {
		syncDest?: string;
		sMode?: string;
	}) => {
		setSaving(true);
		setMsg(null);
		try {
			updateSetting("playerType", playerType);
			localStorage.setItem("player_preference", playerType);
			await updateSettingsMutation.mutateAsync({
				maxConcurrent,
				syncDestination: overrides?.syncDest ?? syncDestination,
				syncMode: overrides?.sMode ?? syncMode,
			});
			updateSettings({
				maxConcurrent,
				syncDestination: overrides?.syncDest ?? syncDestination,
				syncMode: overrides?.sMode ?? syncMode,
				playerType,
			});
			setMsg({ type: "success", text: "Saved" });
			setTimeout(() => setMsg(null), 3000);
		} catch {
			setMsg({ type: "error", text: "Failed to save" });
		} finally {
			setSaving(false);
		}
	};

	const handleSync = async () => {
		setMsg(null);
		setSaving(true);
		try {
			// Persist the currently selected mode before starting the run. Without
			// this, the backend could still use the previous mode (usually copy).
			await updateSettingsMutation.mutateAsync({
				maxConcurrent,
				syncDestination,
				syncMode,
			});
			updateSettings({ maxConcurrent, syncDestination, syncMode, playerType });
			await syncMutation.mutateAsync();
			await fetchSyncStatus();
			showMessage("success", "Sync started");
		} catch {
			showMessage("error", "Sync failed");
		} finally {
			setSaving(false);
		}
	};

	const runBackgroundAction = useCallback(
		async (
			setRunning: (value: boolean) => void,
			action: () => Promise<void>,
			pendingText: string,
			successText: string,
			errorText: string,
		) => {
			setRunning(true);
			showMessage("success", pendingText);
			try {
				await action();
				setTimeout(() => {
					setRunning(false);
					showMessage("success", successText);
				}, 2000);
			} catch {
				setRunning(false);
				showMessage("error", errorText);
			}
		},
		[showMessage],
	);

	const handleMaintenance = () => {
		if (maintenanceRunning) return;
		runBackgroundAction(
			setMaintenanceRunning,
			maintenanceMutation.mutateAsync,
			"Maintenance task started...",
			"Maintenance task queued.",
			"Failed to start maintenance",
		);
	};

	const handleBackfill = () => {
		if (backfillRunning) return;
		runBackgroundAction(
			setBackfillRunning,
			backfillMutation.mutateAsync,
			"Backfill started...",
			"Backfill process started in background.",
			"Failed to start backfill",
		);
	};

	const handleThumbBackfill = () => {
		if (thumbBackfillRunning) return;
		runBackgroundAction(
			setThumbBackfillRunning,
			thumbBackfillMutation.mutateAsync,
			"Thumbnail backfill started...",
			"Thumbnail generation started in background.",
			"Failed to start thumbnail backfill",
		);
	};

	const handleAddCategory = async () => {
		if (!newCatName.trim()) return;
		try {
			await createCategoryMutation.mutateAsync(newCatName.trim());
			setNewCatName("");
			showMessage("success", "Category created");
		} catch (e: unknown) {
			const errMsg =
				e instanceof Error ? e.message : "Failed to create category";
			showMessage("error", errMsg);
		}
	};

	const handleDeleteCategory = async (name: string) => {
		if (
			!confirm(
				`Delete category "${name}"? This will delete all files inside it!`,
			)
		)
			return;
		try {
			await deleteCategoryMutation.mutateAsync(name);
			showMessage("success", "Category deleted");
		} catch (e: unknown) {
			const errMsg =
				e instanceof Error ? e.message : "Failed to delete category";
			showMessage("error", errMsg);
		}
	};

	const startEditing = (name: string) => {
		setEditingCat({ original: name, current: name });
	};

	const saveRename = async () => {
		if (
			!editingCat ||
			!editingCat.current.trim() ||
			editingCat.current === editingCat.original
		) {
			setEditingCat(null);
			return;
		}
		try {
			await renameCategoryMutation.mutateAsync({
				old: editingCat.original,
				new: editingCat.current.trim(),
			});
			setEditingCat(null);
			showMessage("success", "Category renamed");
		} catch (e: unknown) {
			const errMsg =
				e instanceof Error ? e.message : "Failed to rename category";
			showMessage("error", errMsg);
		}
	};

	if (role !== "admin" && role !== "premium_member") {
		return (
			<div className="max-w-md mx-auto py-12 animate-in fade-in duration-500">
				<h1 className="page-title mb-8 text-center">
					Member Dashboard
				</h1>
				<div className="app-card p-5 sm:p-6">
					<div className="flex border-b border-border mb-6">
						<button
							type="button"
							onClick={() => {
								setIsRegistering(false);
								setLoginError("");
							}}
							className={`flex-1 pb-3 text-sm font-semibold border-b-2 transition-all duration-200 ${
								!isRegistering
									? "border-accent text-accent"
									: "border-transparent text-content-muted hover:text-foreground"
							}`}
						>
							Sign In
						</button>
						<button
							type="button"
							onClick={() => {
								setIsRegistering(true);
								setLoginError("");
							}}
							className={`flex-1 pb-3 text-sm font-semibold border-b-2 transition-all duration-200 ${
								isRegistering
									? "border-accent text-accent"
									: "border-transparent text-content-muted hover:text-foreground"
							}`}
						>
							Register
						</button>
					</div>

					<form onSubmit={handleAuth} className="space-y-4">
						<div>
							<label className="block text-xs font-semibold mb-1 text-content-muted uppercase tracking-wider">
								Username
							</label>
							<input
								type="text"
								className="w-full bg-surface/40 border border-border rounded-xl px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent/30 focus:border-accent transition-all duration-200 placeholder-content-subtle"
								value={username}
								onChange={(e) => setUsername(e.target.value)}
								placeholder="Enter username"
								required
							/>
						</div>

						{isRegistering && (
							<div className="animate-in slide-in-from-top-1 duration-200">
								<label className="block text-xs font-semibold mb-1 text-content-muted uppercase tracking-wider">
									Email Address
								</label>
								<input
									type="email"
									className="w-full bg-surface/40 border border-border rounded-xl px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent/30 focus:border-accent transition-all duration-200 placeholder-content-subtle"
									value={email}
									onChange={(e) => setEmail(e.target.value)}
									placeholder="name@example.com"
									required
								/>
							</div>
						)}

						<div>
							<label className="block text-xs font-semibold mb-1 text-content-muted uppercase tracking-wider">
								Password
							</label>
							<input
								type="password"
								className="w-full bg-surface/40 border border-border rounded-xl px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent/30 focus:border-accent transition-all duration-200 placeholder-content-subtle"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								placeholder="Password"
								required
							/>
						</div>

						{isRegistering && (
							<div className="animate-in slide-in-from-top-1 duration-200">
								<label className="block text-xs font-semibold mb-1 text-content-muted uppercase tracking-wider">
									Confirm Password
								</label>
								<input
									type="password"
									className="w-full bg-surface/40 border border-border rounded-xl px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent/30 focus:border-accent transition-all duration-200 placeholder-content-subtle"
									value={confirmPassword}
									onChange={(e) => setConfirmPassword(e.target.value)}
									placeholder="Confirm password"
									required
								/>
							</div>
						)}

						{loginError && (
							<div className="p-3 bg-accent/10 border border-accent/20 text-red-400 rounded-xl text-xs font-semibold animate-in fade-in">
								{loginError}
							</div>
						)}

						{msg && msg.type === "success" && (
							<div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-xs font-semibold animate-in fade-in">
								{msg.text}
							</div>
						)}

						<button
							type="submit"
							disabled={loginLoading}
							className="w-full mt-6 bg-accent hover:bg-accent/90 text-white font-bold py-2.5 px-4 rounded-xl transition-all duration-200 shadow-md hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed glow-accent"
						>
							{loginLoading ? (
								<span className="flex items-center justify-center gap-2">
									<span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
									{isRegistering ? "Creating account..." : "Signing in..."}
								</span>
							) : isRegistering ? (
								"Create Account"
							) : (
								"Sign In"
							)}
						</button>
					</form>
				</div>
			</div>
		);
	}

	return (
		<div className="max-w-xl mx-auto py-8 animate-in fade-in duration-500 pb-24">
			<div className="flex justify-between items-center mb-8">
				<h1 className="text-2xl font-semibold tracking-tight text-foreground">
					Settings
				</h1>
				<button
					onClick={logout}
					className="button-secondary min-h-9 border-red-400/25 px-3 text-xs text-red-300 hover:bg-red-400/10"
				>
					Sign Out
				</button>
			</div>

			{loading ? (
				<div className="flex justify-center py-20">
					<div className="h-6 w-6 border-2 border-foreground border-t-transparent rounded-full animate-spin"></div>
				</div>
			) : (
				<div className="rounded-xl border border-border-subtle bg-surface p-6 shadow-sm">
					<div className="space-y-8">
						<CategorySettingsSection
							categories={categories}
							newCatName={newCatName}
							editingCat={editingCat}
							onNewCatNameChange={setNewCatName}
							onAddCategory={handleAddCategory}
							onStartEditing={startEditing}
							onEditingCatChange={setEditingCat}
							onSaveRename={saveRename}
							onDeleteCategory={handleDeleteCategory}
						/>

						<MaintenanceToolsSection
							maintenanceRunning={maintenanceRunning}
							backfillRunning={backfillRunning}
							thumbBackfillRunning={thumbBackfillRunning}
							onMaintenance={handleMaintenance}
							onBackfill={handleBackfill}
							onThumbBackfill={handleThumbBackfill}
						/>

						<div className="pt-6 border-t border-border-subtle">
							<h2 className="text-lg font-medium text-foreground mb-4">
								Download Settings
							</h2>
							<label
								htmlFor="maxConcurrent"
								className="block text-sm font-medium text-foreground mb-4"
							>
								Max Concurrent Downloads
							</label>
							<div className="flex items-center gap-6">
								<div className="flex-1 relative">
									<input
										type="range"
										id="maxConcurrentRange"
										min="1"
										max="10"
										value={maxConcurrent}
										onChange={(e) => setMaxConcurrent(parseInt(e.target.value))}
										className="w-full h-2 bg-surface-strong rounded-lg appearance-none cursor-pointer accent-foreground"
									/>
								</div>
								<div className="w-12 text-right">
									<span className="text-xl font-mono font-medium text-foreground">
										{maxConcurrent}
									</span>
								</div>
							</div>
							<p className="mt-3 text-xs text-content-muted">
								Limit the number of simultaneous downloads (1-10) to manage
								bandwidth.
							</p>
						</div>

						<SystemInfoSection systemStats={usage || null} />

						<CloudSyncSection
							syncDestination={syncDestination}
							syncMode={syncMode}
							syncStatus={syncStatus}
							saving={saving}
							onSyncDestinationChange={setSyncDestination}
							onSyncModeChange={setSyncMode}
							onSync={handleSync}
							onSave={handleSave}
						/>

						<PlayerPreferencesSection
							playerType={playerType}
							onPlayerTypeChange={setPlayerType}
						/>

						<div className="pt-6 border-t border-border-subtle flex items-center justify-between">
							<div className="h-6">
								{msg && (
									<span
										className={`text-sm font-medium ${
											msg.type === "success"
												? "text-emerald-300"
												: "text-red-300"
										} animate-in fade-in slide-in-from-left-2`}
									>
										{msg.text}
									</span>
								)}
							</div>
							<button
								onClick={() => handleSave()}
								disabled={saving}
								className="inline-flex items-center justify-center rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background shadow-sm hover:bg-foreground/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"
							>
								{saving ? "Saving..." : "Save Changes"}
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
