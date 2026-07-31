"use client";

import { useState, useEffect } from "react";
import { Users, UserPlus, RefreshCw } from "lucide-react";
import { getRole } from "@/lib/api";
import { formatBytes } from "@/lib/utils";
import { useToast } from "@/hooks/useToast";
import {
	useStats,
	useUsers,
	useUsage,
	useUpdateUserRole,
	useCreateUser,
} from "@/lib/queries";

function StatCard({
	title,
	value,
	color = "text-foreground",
	icon,
}: {
	title: string;
	value: string | number;
	color?: string;
	icon: string;
}) {
	return (
		<div className="rounded-2xl border border-border bg-surface/40 p-5 shadow-md glass-premium hover-scale transition-all duration-300 hover:border-accent/30 hover:glow-accent">
			<div className="text-2xl mb-2">{icon}</div>
			<p className="text-xs font-semibold text-content-muted uppercase tracking-wider">
				{title}
			</p>
			<p className={`text-2xl font-extrabold mt-1 tracking-tight ${color}`}>
				{value}
			</p>
		</div>
	);
}

export default function AdminPage() {
	const [role, setRole] = useState<string | null>(null);
	const [newUsername, setNewUsername] = useState("");
	const [newEmail, setNewEmail] = useState("");
	const [newPassword, setNewPassword] = useState("");
	const { showToast } = useToast();

	const { data: stats } = useStats();
	const { data: users = [] } = useUsers();
	const { data: usage } = useUsage();
	const updateRoleMutation = useUpdateUserRole();
	const createUserMutation = useCreateUser();

	useEffect(() => {
		setRole(getRole());
	}, []);

	if (!role) {
		return (
			<div className="flex h-screen items-center justify-center">
				<RefreshCw className="h-8 w-8 animate-spin text-accent" />
			</div>
		);
	}

	if (role !== "admin") {
		return (
			<div className="flex h-[80vh] flex-col items-center justify-center text-center">
				<h1 className="text-4xl font-bold text-accent mb-4">403</h1>
				<p className="text-xl text-content-muted">
					Access Denied. Admins only.
				</p>
			</div>
		);
	}

	const updateUserRole = async (userId: string, newRole: string) => {
		try {
			await updateRoleMutation.mutateAsync({ userId, role: newRole });
			showToast("Role updated", "success");
		} catch {
			showToast("Failed to update role", "error");
		}
	};

	const handleCreateUser = async (e: React.FormEvent) => {
		e.preventDefault();
		try {
			await createUserMutation.mutateAsync({
				username: newUsername,
				email: newEmail,
				password: newPassword,
			});
			setNewUsername("");
			setNewEmail("");
			setNewPassword("");
			showToast("User created successfully!", "success");
		} catch {
			showToast("Failed to create user", "error");
		}
	};

	const filteredUsers = users.filter(
		(u) => !u.email.includes("test_") && !u.email.includes("example.com"),
	);

	return (
		<div className="space-y-8 animate-in fade-in duration-500 pb-20">
			<header>
				<h1 className="text-3xl font-extrabold tracking-tight text-gradient-accent font-display">
					System Dashboard
				</h1>
				<p className="text-content-muted mt-1">
					Global oversight and user management.
				</p>
			</header>

			{/* Stats Grid */}
			<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
				<StatCard title="Total Jobs" value={stats?.total || 0} icon="📊" />
				<StatCard
					title="Storage"
					value={usage ? formatBytes(usage.totalSize) : "..."}
					icon="💾"
				/>
				<StatCard
					title="In Queue"
					value={stats?.queued || 0}
					color="text-gradient-accent"
					icon="⏳"
				/>
				<StatCard
					title="Failed"
					value={stats?.failed || 0}
					color="text-gradient-accent"
					icon="❌"
				/>
			</div>

			<div className="grid md:grid-cols-2 gap-8">
				{/* User Management */}
				<div className="space-y-8">
					<section className="rounded-2xl border border-border bg-surface/40 p-6 shadow-md glass-premium">
						<div className="flex items-center justify-between mb-6">
							<h2 className="text-lg font-bold flex items-center gap-2">
								<Users
									width={20}
									height={20}
									strokeWidth={2.5}
									className="text-current"
								/>
								User Directory
							</h2>
							<span className="text-xs font-semibold text-content-muted bg-surface-strong px-2 py-1 rounded-full border border-border/50">
								Total Users: {filteredUsers.length}
							</span>
						</div>
						<div className="space-y-4">
							{filteredUsers.map((u) => (
								<div
									key={u.id}
									className="flex items-center justify-between p-3 rounded-xl bg-surface/40 border border-border/80"
								>
									<div className="min-w-0">
										<p className="font-semibold truncate text-sm">
											{u.username}
										</p>
										<p className="text-xs text-content-muted truncate">
											{u.email}
										</p>
									</div>
									<select
										value={u.role}
										onChange={(e) => updateUserRole(u.id, e.target.value)}
										className={`text-xs font-bold rounded-full py-1 pl-3 pr-8 transition-all duration-200 focus:outline-none focus:ring-2 cursor-pointer ${
											u.role === "admin"
												? "bg-accent text-white border border-accent focus:ring-accent/30"
												: u.role === "premium_member"
													? "bg-accent/10 text-accent border border-accent/20 focus:ring-accent/30"
													: "bg-zinc-500/10 text-zinc-400 border border-zinc-500/20 focus:ring-zinc-500/30"
										}`}
										disabled={u.username === "nesbeer"}
									>
										<option value="guest">Guest</option>
										<option value="premium_member">Premium</option>
										<option value="admin">Admin</option>
									</select>
								</div>
							))}
						</div>
					</section>

					<section className="rounded-2xl border border-border bg-surface/40 p-6 shadow-md glass-premium">
						<h2 className="text-lg font-bold mb-6 flex items-center gap-2">
							<UserPlus
								width={20}
								height={20}
								strokeWidth={2.5}
								className="text-current"
							/>
							Create New User
						</h2>
						<form onSubmit={handleCreateUser} className="space-y-4">
							<div className="space-y-1.5">
								<label className="text-xs font-semibold text-content-muted uppercase tracking-wider block">
									Username
								</label>
								<input
									type="text"
									className="w-full bg-surface/40 border border-border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent/30 focus:border-accent transition-all placeholder-content-subtle"
									value={newUsername}
									onChange={(e) => setNewUsername(e.target.value)}
									required
								/>
							</div>
							<div className="space-y-1.5">
								<label className="text-xs font-semibold text-content-muted uppercase tracking-wider block">
									Email
								</label>
								<input
									type="email"
									className="w-full bg-surface/40 border border-border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent/30 focus:border-accent transition-all placeholder-content-subtle"
									value={newEmail}
									onChange={(e) => setNewEmail(e.target.value)}
									required
								/>
							</div>
							<div className="space-y-1.5">
								<label className="text-xs font-semibold text-content-muted uppercase tracking-wider block">
									Password
								</label>
								<input
									type="password"
									className="w-full bg-surface/40 border border-border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent/30 focus:border-accent transition-all placeholder-content-subtle"
									value={newPassword}
									onChange={(e) => setNewPassword(e.target.value)}
									required
								/>
							</div>
							<button
								type="submit"
								disabled={createUserMutation.isPending}
								className="w-full bg-accent hover:bg-accent/90 text-white font-bold py-2.5 rounded-xl shadow-md transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 glow-accent mt-2"
							>
								{createUserMutation.isPending
									? "Creating..."
									: "Create Premium User"}
							</button>
							<p className="text-[10px] text-content-muted text-center italic">
								Newly created users default to Premium status.
							</p>
						</form>
					</section>
				</div>

				{/* Stats Breakdown */}
				<section className="rounded-2xl border border-border bg-surface/40 p-6 shadow-md glass-premium">
					<h2 className="text-lg font-bold mb-6">Queue Breakdown</h2>
					<div className="space-y-5">
						{stats && (
							<>
								<div className="space-y-1.5">
									<div className="flex justify-between text-xs font-semibold">
										<span className="text-emerald-500">Done</span>
										<span className="font-mono text-content-muted">
											{stats.done} video{stats.done !== 1 ? "s" : ""}
										</span>
									</div>
									<div className="h-2 w-full bg-surface-strong rounded-full overflow-hidden border border-border/30">
										<div
											className="h-full bg-emerald-500 transition-all duration-1000"
											style={{
												width: `${(stats.done / (stats.total || 1)) * 100}%`,
											}}
										/>
									</div>
								</div>
								<div className="space-y-1.5">
									<div className="flex justify-between text-xs font-semibold">
										<span className="text-accent">Failed</span>
										<span className="font-mono text-content-muted">
											{stats.failed} video{stats.failed !== 1 ? "s" : ""}
										</span>
									</div>
									<div className="h-2 w-full bg-surface-strong rounded-full overflow-hidden border border-border/30">
										<div
											className="h-full bg-accent transition-all duration-1000"
											style={{
												width: `${(stats.failed / (stats.total || 1)) * 100}%`,
											}}
										/>
									</div>
								</div>
								<div className="space-y-1.5">
									<div className="flex justify-between text-xs font-semibold">
										<span className="text-amber-500">Queued</span>
										<span className="font-mono text-content-muted">
											{stats.queued} video{stats.queued !== 1 ? "s" : ""}
										</span>
									</div>
									<div className="h-2 w-full bg-surface-strong rounded-full overflow-hidden border border-border/30">
										<div
											className="h-full bg-amber-500 transition-all duration-1000"
											style={{
												width: `${(stats.queued / (stats.total || 1)) * 100}%`,
											}}
										/>
									</div>
								</div>
							</>
						)}
					</div>
				</section>
			</div>
		</div>
	);
}
