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
        <h1 className="text-4xl font-bold text-red-500 mb-4">403</h1>
        <p className="text-xl text-content-muted">Access Denied. Admins only.</p>
      </div>
    );
  }

  return (
    <>
      <Head><title>Admin Dashboard - Tiak</title></Head>
      <div className="space-y-8 animate-in fade-in duration-500 pb-20">
        <header>
          <h1 className="text-3xl font-bold tracking-tight">System Dashboard</h1>
          <p className="text-content-muted mt-1">Global oversight and user management.</p>
        </header>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard title="Total Jobs" value={stats?.total_jobs || 0} icon="📊" />
          <StatCard title="Storage" value={usage ? formatBytes(usage.totalSize) : '...'} icon="💾" />
          <StatCard title="In Queue" value={stats?.queue_size || 0} color="text-blue-500" icon="⏳" />
          <StatCard title="Failed" value={stats?.failed_jobs || 0} color="text-red-500" icon="❌" />
        </div>

        <div className="grid md:grid-cols-2 gap-8">
            {/* User Management */}
            <div className="space-y-8">
              <section className="rounded-2xl border border-border-subtle bg-surface p-6 shadow-sm">
                  <h2 className="text-lg font-semibold mb-6 flex items-center gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                      User Directory
                  </h2>
                  <div className="space-y-4">
                      {users.map(u => (
                          <div key={u.id} className="flex items-center justify-between p-3 rounded-xl bg-surface-subtle/50 border border-border-subtle">
                              <div className="min-w-0">
                                  <p className="font-medium truncate">{u.username}</p>
                                  <p className="text-xs text-content-muted truncate">{u.email}</p>
                              </div>
                              <select 
                                  value={u.role}
                                  onChange={(e) => updateUserRole(u.id, e.target.value)}
                                  className="bg-surface-strong text-xs font-semibold rounded-lg border-none focus:ring-2 focus:ring-blue-500 py-1 pl-2 pr-8"
                                  disabled={u.username === 'nesbeer'}
                              >
                                  <option value="guest">Guest</option>
                                  <option value="premium_member">Premium</option>
                                  <option value="admin">Admin</option>
                              </select>
                          </div>
                      ))}
                  </div>
              </section>

              <section className="rounded-2xl border border-border-subtle bg-surface p-6 shadow-sm">
                  <h2 className="text-lg font-semibold mb-6 flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
                    Create New User
                  </h2>
                  <form onSubmit={handleCreateUser} className="space-y-4">
                      <input
                        type="text"
                        placeholder="Username"
                        className="w-full bg-surface-strong border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                        value={newUsername}
                        onChange={e => setNewUsername(e.target.value)}
                        required
                      />
                      <input
                        type="email"
                        placeholder="Email"
                        className="w-full bg-surface-strong border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                        value={newEmail}
                        onChange={e => setNewEmail(e.target.value)}
                        required
                      />
                      <input
                        type="password"
                        placeholder="Password"
                        className="w-full bg-surface-strong border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                        value={newPassword}
                        onChange={e => setNewPassword(e.target.value)}
                        required
                      />
                      <button
                        type="submit"
                        disabled={creating}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {creating ? 'Creating...' : 'Create Premium User'}
                      </button>
                      <p className="text-[10px] text-content-muted text-center italic">Newly created users default to Premium status.</p>
                  </form>
              </section>
            </div>

            {/* Platform Distribution */}
            <section className="rounded-2xl border border-border-subtle bg-surface p-6 shadow-sm">
                <h2 className="text-lg font-semibold mb-6">Platform Usage</h2>
                <div className="space-y-4">
                    {stats?.platforms.map(([p, count]) => (
                        <div key={p || 'unknown'} className="space-y-1">
                            <div className="flex justify-between text-xs font-medium">
                                <span className={platformBadgeClass(p || 'unknown')}>{platformLabel(p || 'unknown')}</span>
                                <span>{count} videos</span>
                            </div>
                            <div className="h-2 w-full bg-surface-strong rounded-full overflow-hidden">
                                <div 
                                    className="h-full bg-foreground transition-all duration-1000" 
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
    <div className="rounded-2xl border border-border-subtle bg-surface p-5 shadow-sm">
      <div className="text-2xl mb-2">{icon}</div>
      <p className="text-xs font-medium text-content-muted uppercase tracking-wider">{title}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
    </div>
  );
}
