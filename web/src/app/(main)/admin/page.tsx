"use client";

import { useState } from "react";
import { Activity, HardDrive, Plus, RefreshCw, ShieldCheck, UserPlus, Users, Video } from "lucide-react";
import { useAuthState } from "@/store/app-store";
import { formatBytes } from "@/lib/utils";
import { useToast } from "@/hooks/useToast";
import { useCreateUser, useStats, useUpdateUserRole, useUsage, useUsers } from "@/lib/queries";

function Metric({ label, value, icon: Icon, tone = "text-foreground" }: { label: string; value: string | number; icon: typeof Video; tone?: string }) {
	return <div className="app-card-muted p-4 sm:p-5"><Icon size={17} className="text-accent" /><p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.15em] text-content-subtle">{label}</p><p className={`mt-1 font-mono text-2xl font-semibold tracking-tight ${tone}`}>{value}</p></div>;
}

export default function AdminPage() {
	const { role } = useAuthState();
	const { showToast } = useToast();
	const [newUsername, setNewUsername] = useState("");
	const [newEmail, setNewEmail] = useState("");
	const [newPassword, setNewPassword] = useState("");
	const { data: stats } = useStats();
	const { data: users = [] } = useUsers();
	const { data: usage } = useUsage();
	const updateRoleMutation = useUpdateUserRole();
	const createUserMutation = useCreateUser();

	if (!role) return <div className="flex min-h-[60dvh] items-center justify-center text-content-muted"><RefreshCw size={22} className="animate-spin text-accent" /></div>;
	if (role !== "admin") return <div className="app-card mx-auto flex min-h-[40dvh] max-w-md flex-col items-center justify-center p-8 text-center"><ShieldCheck size={32} className="text-accent" /><h1 className="mt-4 text-2xl font-semibold">Admin access required</h1><p className="mt-2 text-sm text-content-muted">This workspace is available to administrators only.</p></div>;

	const filteredUsers = users.filter((user) => !user.email.includes("test_") && !user.email.includes("example.com"));
	const updateRole = async (userId: string, nextRole: string) => { try { await updateRoleMutation.mutateAsync({ userId, role: nextRole }); showToast("Role updated", "success"); } catch { showToast("Failed to update role", "error"); } };
	const createUser = async (event: React.FormEvent) => { event.preventDefault(); try { await createUserMutation.mutateAsync({ username: newUsername, email: newEmail, password: newPassword }); setNewUsername(""); setNewEmail(""); setNewPassword(""); showToast("User created", "success"); } catch { showToast("Failed to create user", "error"); } };

	return <div className="space-y-7"><header><p className="eyebrow">System control</p><h1 className="page-title mt-1">Admin</h1><p className="page-subtitle">Keep an eye on the queue, storage, and member access.</p></header><section className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3"><Metric label="Total jobs" value={stats?.total || 0} icon={Activity} /><Metric label="Storage" value={usage ? formatBytes(usage.totalSize) : "Loading"} icon={HardDrive} /><Metric label="In queue" value={stats?.queued || 0} icon={Video} tone="text-accent" /><Metric label="Failed" value={stats?.failed || 0} icon={Activity} tone="text-red-300" /></section><div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]"><section className="app-card p-4 sm:p-6"><div className="flex items-end justify-between gap-3"><div><p className="eyebrow">Access control</p><h2 className="type-section-header mt-1 flex items-center gap-2"><Users size={17} className="text-accent" />Member directory</h2></div><span className="text-xs text-content-muted">{filteredUsers.length} members</span></div><div className="mt-5 space-y-2">{filteredUsers.map((user) => <div key={user.id} className="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface-subtle/45 p-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-xs font-semibold text-accent">{user.username.slice(0, 1).toUpperCase()}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{user.username}</p><p className="truncate text-xs text-content-muted">{user.email}</p></div><select value={user.role} onChange={(event) => updateRole(user.id, event.target.value)} disabled={user.username === "nesbeer"} className="min-h-9 max-w-[7.5rem] rounded-lg border border-border bg-surface px-2 text-xs font-semibold text-foreground" aria-label={`Role for ${user.username}`}><option value="guest">Guest</option><option value="premium_member">Premium</option><option value="admin">Admin</option></select></div>)}</div></section><div className="space-y-4"><section className="app-card p-4 sm:p-6"><div><p className="eyebrow">Provisioning</p><h2 className="type-section-header mt-1 flex items-center gap-2"><UserPlus size={17} className="text-accent" />Create member</h2></div><form onSubmit={createUser} className="mt-5 space-y-3"><label className="block text-xs font-semibold text-content-muted">Username<input value={newUsername} onChange={(event) => setNewUsername(event.target.value)} className="app-input mt-2 w-full" required /></label><label className="block text-xs font-semibold text-content-muted">Email<input type="email" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} className="app-input mt-2 w-full" required /></label><label className="block text-xs font-semibold text-content-muted">Password<input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="app-input mt-2 w-full" required /></label><button type="submit" disabled={createUserMutation.isPending} className="button-primary w-full"> <Plus size={16} />{createUserMutation.isPending ? "Creating" : "Create premium user"}</button></form></section><section className="app-card p-4 sm:p-6"><div><p className="eyebrow">Queue health</p><h2 className="type-section-header mt-1">Breakdown</h2></div><div className="mt-5 space-y-4">{stats && <><Breakdown label="Completed" value={stats.done} total={stats.total} tone="bg-emerald-400" /><Breakdown label="Queued" value={stats.queued} total={stats.total} tone="bg-amber-400" /><Breakdown label="Failed" value={stats.failed} total={stats.total} tone="bg-red-400" /></>}</div></section></div></div></div>;
}

function Breakdown({ label, value, total, tone }: { label: string; value: number; total: number; tone: string }) { return <div><div className="flex items-center justify-between text-xs"><span className="text-content-muted">{label}</span><span className="font-mono text-content">{value}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-strong"><div className={`h-full ${tone}`} style={{ width: `${Math.min(100, (value / (total || 1)) * 100)}%` }} /></div></div>; }
