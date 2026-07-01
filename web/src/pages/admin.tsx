import { useState, useEffect } from 'react';
import Head from 'next/head';
import { API_BASE } from '../lib/config';
import { fetchWithAuth, getRole, getSystemUsage, DiskUsage } from '../lib/api';
import { platformLabel, platformBadgeClass, formatBytes } from '../lib/utils';

interface UserInfo {
  id: string;
  username: string;
  email: string;
  role: string;
}

interface Stats {
  total_jobs: number;
  done_jobs: number;
  failed_jobs: number;
  queue_size: number;
  categories: [string, number][];
  platforms: [string | null, number][];
}

export default function AdminDashboard() {
  const [role, setRole] = useState<string | null>(null);
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [usage, setUsage] = useState<DiskUsage | null>(null);
  const [loading, setLoading] = useState(true);

  // Create User State
  const [newUsername, setNewUsername] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchData = async () => {
    try {
      const [uRes, sRes, usageData] = await Promise.all([
        fetchWithAuth(`${API_BASE}/admin/users`),
        fetchWithAuth(`${API_BASE}/admin/stats`),
        getSystemUsage()
      ]);

      if (uRes.ok) setUsers(await uRes.json());
      if (sRes.ok) setStats(await sRes.json());
      setUsage(usageData);
    } catch (e) {
      console.error("Failed to load admin data", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const currentRole = getRole();
    setRole(currentRole);
    if (currentRole === 'admin') {
      fetchData();
    } else {
      setLoading(false);
    }
  }, []);

  const updateUserRole = async (userId: string, newRole: string) => {
    try {
      const res = await fetchWithAuth(`${API_BASE}/admin/users/${userId}/role`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole })
      });
      if (res.ok) fetchData();
    } catch {
      alert("Failed to update role");
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetchWithAuth(`${API_BASE}/admin/users/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: newUsername, email: newEmail, password: newPassword })
      });
      if (res.ok) {
        setNewUsername('');
        setNewEmail('');
        setNewPassword('');
        fetchData();
        alert("User created successfully!");
      } else {
        const msg = await res.text();
        alert(`Failed: ${msg}`);
      }
    } catch {
      alert("Failed to create user");
    } finally {
      setCreating(false);
    }
  };

  if (loading) return <div className="flex h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div></div>;

  if (role !== 'admin') {
    return (
      <div className="flex h-[80vh] flex-col items-center justify-center text-center">
        <h1 className="text-4xl font-bold text-accent mb-4">403</h1>
        <p className="text-xl text-content-muted">Access Denied. Admins only.</p>
      </div>
    );
  }

  return (
    <>
      <Head><title>Admin Dashboard - Tiak</title></Head>
      <div className="space-y-8 animate-in fade-in duration-500 pb-20">
        <header>
          <h1 className="text-3xl font-extrabold tracking-tight text-gradient-accent font-display">System Dashboard</h1>
          <p className="text-content-muted mt-1">Global oversight and user management.</p>
        </header>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard title="Total Jobs" value={stats?.total_jobs || 0} icon="📊" />
          <StatCard title="Storage" value={usage ? formatBytes(usage.totalSize) : '...'} icon="💾" />
          <StatCard title="In Queue" value={stats?.queue_size || 0} color="text-gradient-accent" icon="⏳" />
          <StatCard title="Failed" value={stats?.failed_jobs || 0} color="text-gradient-accent" icon="❌" />
        </div>

        <div className="grid md:grid-cols-2 gap-8">
            {/* User Management */}
            <div className="space-y-8">
              <section className="rounded-2xl border border-border bg-surface/40 p-6 shadow-md glass-premium">
                  <div className="flex items-center justify-between mb-6">
                      <h2 className="text-lg font-bold flex items-center gap-2">
                          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                          User Directory
                      </h2>
                      <span className="text-xs font-semibold text-content-muted bg-surface-strong px-2 py-1 rounded-full border border-border/50">
                        Total Users: {users.filter(u => !u.email.includes('test_') && !u.email.includes('example.com')).length}
                      </span>
                  </div>
                  <div className="space-y-4">
                      {users.filter(u => !u.email.includes('test_') && !u.email.includes('example.com')).map(u => (
                          <div key={u.id} className="flex items-center justify-between p-3 rounded-xl bg-surface/40 border border-border/80">
                              <div className="min-w-0">
                                  <p className="font-semibold truncate text-sm">{u.username}</p>
                                  <p className="text-xs text-content-muted truncate">{u.email}</p>
                              </div>
                              <select 
                                  value={u.role}
                                  onChange={(e) => updateUserRole(u.id, e.target.value)}
                                  className={`text-xs font-bold rounded-full py-1 pl-3 pr-8 transition-all duration-200 focus:outline-none focus:ring-2 cursor-pointer ${
                                    u.role === 'admin' ? 'bg-accent text-white border border-accent focus:ring-accent/30' :
                                    u.role === 'premium_member' ? 'bg-accent/10 text-accent border border-accent/20 focus:ring-accent/30' :
                                    'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20 focus:ring-zinc-500/30'
                                  }`}
                                  disabled={u.username === 'nesbeer'}
                              >
                                  <option value="guest" className="bg-background text-foreground">Guest</option>
                                  <option value="premium_member" className="bg-background text-foreground">Premium</option>
                                  <option value="admin" className="bg-background text-foreground">Admin</option>
                              </select>
                          </div>
                      ))}
                  </div>
              </section>

              <section className="rounded-2xl border border-border bg-surface/40 p-6 shadow-md glass-premium">
                  <h2 className="text-lg font-bold mb-6 flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
                    Create New User
                  </h2>
                  <form onSubmit={handleCreateUser} className="space-y-4">
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-content-muted uppercase tracking-wider block">Username</label>
                        <input
                          type="text"
                          className="w-full bg-surface/40 border border-border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent/30 focus:border-accent transition-all placeholder-content-subtle"
                          value={newUsername}
                          onChange={e => setNewUsername(e.target.value)}
                          required
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-content-muted uppercase tracking-wider block">Email</label>
                        <input
                          type="email"
                          className="w-full bg-surface/40 border border-border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent/30 focus:border-accent transition-all placeholder-content-subtle"
                          value={newEmail}
                          onChange={e => setNewEmail(e.target.value)}
                          required
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-content-muted uppercase tracking-wider block">Password</label>
                        <input
                          type="password"
                          className="w-full bg-surface/40 border border-border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent/30 focus:border-accent transition-all placeholder-content-subtle"
                          value={newPassword}
                          onChange={e => setNewPassword(e.target.value)}
                          required
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={creating}
                        className="w-full bg-accent hover:bg-accent/90 text-white font-bold py-2.5 rounded-xl shadow-md transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 glow-accent mt-2"
                      >
                        {creating ? 'Creating...' : 'Create Premium User'}
                      </button>
                      <p className="text-[10px] text-content-muted text-center italic">Newly created users default to Premium status.</p>
                  </form>
              </section>
            </div>

            {/* Platform Distribution */}
            <section className="rounded-2xl border border-border bg-surface/40 p-6 shadow-md glass-premium">
                <h2 className="text-lg font-bold mb-6">Platform Usage</h2>
                <div className="space-y-5">
                    {stats?.platforms.map(([p, count]) => (
                        <div key={p || 'unknown'} className="space-y-1.5">
                            <div className="flex justify-between text-xs font-semibold">
                                <span className={platformBadgeClass(p || 'unknown')}>{platformLabel(p || 'unknown')}</span>
                                <span className="font-mono text-content-muted">{count} video{count !== 1 ? 's' : ''}</span>
                            </div>
                            <div className="h-2 w-full bg-surface-strong rounded-full overflow-hidden border border-border/30">
                                <div 
                                    className={`h-full transition-all duration-1000 ${
                                      p === 'youtube' ? 'bg-accent glow-accent' :
                                      p === 'tiktok' ? 'bg-accent glow-accent' :
                                      p === 'instagram' ? 'bg-accent glow-accent' :
                                      'bg-accent glow-accent'
                                    }`} 
                                    style={{ width: `${(count / (stats.done_jobs || 1)) * 100}%` }}
                                ></div>
                            </div>
                        </div>
                    ))}
                </div>
            </section>
        </div>
      </div>
    </>
  );
}

function StatCard({ title, value, color = "text-foreground", icon }: { title: string, value: string | number, color?: string, icon: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface/40 p-5 shadow-md glass-premium hover-scale transition-all duration-300 hover:border-accent/30 hover:glow-accent">
      <div className="text-2xl mb-2">{icon}</div>
      <p className="text-xs font-semibold text-content-muted uppercase tracking-wider">{title}</p>
      <p className={`text-2xl font-extrabold mt-1 tracking-tight ${color}`}>{value}</p>
    </div>
  );
}
