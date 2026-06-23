import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import { API_BASE } from '../lib/config';
import { listCategories, createCategory, deleteCategory, renameCategory, runMaintenance, backfillMetadata, backfillThumbnails, login, logout, getRole, signup } from '../lib/api';
import CategorySettingsSection from '../components/settings/CategorySettingsSection';
import MaintenanceToolsSection from '../components/settings/MaintenanceToolsSection';
import SystemInfoSection from '../components/settings/SystemInfoSection';
import CloudSyncSection from '../components/settings/CloudSyncSection';
import PlayerPreferencesSection from '../components/settings/PlayerPreferencesSection';
import { useVisibilityPolling } from '../hooks/useVisibilityPolling';

export default function Settings() {
  const [role, setRole] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');

  // Register state
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [maxConcurrent, setMaxConcurrent] = useState<number>(2);
  const [syncDestination, setSyncDestination] = useState<string>('onedrive:others/Edits');
  const [syncMode, setSyncMode] = useState<string>('copy');
  const [syncStatus, setSyncStatus] = useState<{ status: string, lastRun: string | null, logs: string[], error: string | null, unsyncedCount: number }>({ status: 'idle', lastRun: null, logs: [], error: null, unsyncedCount: 0 });
  const [playerType, setPlayerType] = useState<'native' | 'custom'>('custom');

  const [categories, setCategories] = useState<string[]>([]);
  const [newCatName, setNewCatName] = useState('');
  const [editingCat, setEditingCat] = useState<{ original: string, current: string } | null>(null);

  const [systemStats, setSystemStats] = useState<{ totalSize: number, fileCount: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [maintenanceRunning, setMaintenanceRunning] = useState(false);
  const [backfillRunning, setBackfillRunning] = useState(false);
  const [thumbBackfillRunning, setThumbBackfillRunning] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  useEffect(() => {
    setRole(getRole());
    const handleAuthChange = () => setRole(getRole());
    window.addEventListener('auth-change', handleAuthChange);
    return () => window.removeEventListener('auth-change', handleAuthChange);
  }, []);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoginLoading(true);
    
    if (isRegistering) {
      if (password !== confirmPassword) {
        setLoginError('Passwords do not match');
        setLoginLoading(false);
        return;
      }
      try {
        await signup(username, email, password);
        showMessage('success', 'Account created successfully! Please sign in.');
        setIsRegistering(false);
        setPassword('');
        setConfirmPassword('');
      } catch (err: unknown) {
        setLoginError(err instanceof Error ? err.message : 'Registration failed');
      } finally {
        setLoginLoading(false);
      }
    } else {
      try {
        await login(username, password);
      } catch (err: unknown) {
        setLoginError(err instanceof Error ? err.message : 'Login failed');
      } finally {
        setLoginLoading(false);
      }
    }
  };

  const showMessage = useCallback((type: 'success' | 'error', text: string) => {
    setMsg({ type, text });
  }, []);

  const fetchCategories = useCallback(async () => {
    if (role !== 'admin') return;
    try {
      const cats = await listCategories();
      setCategories(cats);
    } catch (e) {
      console.error('Failed to fetch categories', e);
    }
  }, [role]);

  const fetchSystemStats = useCallback(async () => {
    if (role !== 'admin') return;
    try {
      const res = await fetch(`${API_BASE}/system/usage`, {
        headers: { 'ngrok-skip-browser-warning': 'true', 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSystemStats(data);
      }
    } catch (e) {
      console.error('Failed to fetch system stats', e);
    }
  }, [role]);

  const fetchSettings = useCallback(async () => {
    if (role !== 'admin') {
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/settings`, {
        headers: { 'ngrok-skip-browser-warning': 'true', 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) {
        const data = await res.json();
        setMaxConcurrent(data.maxConcurrent);
        if (data.syncDestination) setSyncDestination(data.syncDestination);
        if (data.syncMode) setSyncMode(data.syncMode);
      }
    } catch (error) {
      console.error('Failed to fetch settings:', error);
      setMsg({ type: 'error', text: 'Failed to load settings' });
    } finally {
      setLoading(false);
    }
  }, [role]);

  useEffect(() => {
    if (role === 'admin') {
      fetchSettings();
      fetchCategories();
      fetchSystemStats();
    }
    const storedPlayer = localStorage.getItem('player_preference');
    if (storedPlayer === 'native' || storedPlayer === 'custom') {
      setPlayerType(storedPlayer);
    }
  }, [role, fetchCategories, fetchSettings, fetchSystemStats]);

  const fetchSyncStatus = useCallback(async () => {
    if (role !== 'admin') return;
    try {
      const res = await fetch(`${API_BASE}/sync/status`, {
        headers: { 'ngrok-skip-browser-warning': 'true', 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSyncStatus(data);
      }
    } catch (e) {
      console.error('Failed to fetch sync status', e);
    }
  }, [role]);

  // Fetch sync status immediately when role becomes 'admin'
  useEffect(() => {
    if (role === 'admin') {
      fetchSyncStatus();
    }
  }, [role, fetchSyncStatus]);

  useVisibilityPolling(fetchSyncStatus, 10000, { runImmediately: false });

  const handleSave = async (overrides?: { syncDest?: string; sMode?: string }) => {
    setSaving(true);
    setMsg(null);
    try {
      localStorage.setItem('player_preference', playerType);

      const res = await fetch(`${API_BASE}/settings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ 
          maxConcurrent, 
          syncDestination: overrides?.syncDest ?? syncDestination, 
          syncMode: overrides?.sMode ?? syncMode 
        }),
      });

      if (res.ok) {
        setMsg({ type: 'success', text: 'Saved' });
        setTimeout(() => setMsg(null), 3000);
      } else {
        setMsg({ type: 'error', text: 'Failed to save' });
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
      setMsg({ type: 'error', text: 'Error saving settings' });
    } finally {
      setSaving(false);
    }
  };

  const handleSync = async () => {
    setMsg(null);
    try {
      await fetch(`${API_BASE}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ maxConcurrent, syncDestination, syncMode }),
      });

      const res = await fetch(`${API_BASE}/sync/run`, {
        method: 'POST',
        headers: { 'ngrok-skip-browser-warning': 'true', 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });

      if (res.ok) {
        showMessage('success', 'Sync started');
        setTimeout(() => setMsg(null), 3000);
      } else {
        const data = await res.json();
        showMessage('error', data.error || 'Sync failed to start');
      }
    } catch {
      showMessage('error', 'Network error');
    }
  };

  const runBackgroundAction = useCallback(async (
    setRunning: (value: boolean) => void,
    action: () => Promise<void>,
    pendingText: string,
    successText: string,
    errorText: string,
  ) => {
    setRunning(true);
    showMessage('success', pendingText);
    try {
      await action();
      setTimeout(() => {
        setRunning(false);
        showMessage('success', successText);
      }, 2000);
    } catch {
      setRunning(false);
      showMessage('error', errorText);
    }
  }, [showMessage]);

  const handleMaintenance = async () => {
    if (maintenanceRunning) return;
    await runBackgroundAction(
      setMaintenanceRunning,
      runMaintenance,
      'Maintenance task started...',
      'Maintenance task queued.',
      'Failed to start maintenance',
    );
  };

  const handleBackfill = async () => {
    if (backfillRunning) return;
    await runBackgroundAction(
      setBackfillRunning,
      backfillMetadata,
      'Backfill started...',
      'Backfill process started in background.',
      'Failed to start backfill',
    );
  };

  const handleThumbBackfill = async () => {
    if (thumbBackfillRunning) return;
    await runBackgroundAction(
      setThumbBackfillRunning,
      backfillThumbnails,
      'Thumbnail backfill started...',
      'Thumbnail generation started in background.',
      'Failed to start thumbnail backfill',
    );
  };

  const handleAddCategory = async () => {
    if (!newCatName.trim()) return;
    try {
      await createCategory(newCatName.trim());
      setNewCatName('');
      fetchCategories();
      showMessage('success', 'Category created');
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : 'Failed to create category';
      showMessage('error', errMsg);
    }
  };

  const handleDeleteCategory = async (name: string) => {
    if (!confirm(`Delete category "${name}"? This will delete all files inside it!`)) return;
    try {
      await deleteCategory(name);
      fetchCategories();
      showMessage('success', 'Category deleted');
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : 'Failed to delete category';
      showMessage('error', errMsg);
    }
  };

  const startEditing = (name: string) => {
    setEditingCat({ original: name, current: name });
  };

  const saveRename = async () => {
    if (!editingCat || !editingCat.current.trim() || editingCat.current === editingCat.original) {
      setEditingCat(null);
      return;
    }
    try {
      await renameCategory(editingCat.original, editingCat.current.trim());
      setEditingCat(null);
      fetchCategories();
      showMessage('success', 'Category renamed');
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : 'Failed to rename category';
      showMessage('error', errMsg);
    }
  };

  if (role !== 'admin' && role !== 'premium_member') {
    return (
      <div className="max-w-md mx-auto py-12 animate-in fade-in duration-500">
        <h1 className="text-3xl font-extrabold tracking-tight text-gradient-purple font-display mb-8 text-center">
          Member Dashboard
        </h1>
        <div className="rounded-2xl border border-border bg-surface/40 p-6 shadow-md glass-premium">
          {/* Tab Switcher */}
          <div className="flex border-b border-border mb-6">
            <button
              type="button"
              onClick={() => { setIsRegistering(false); setLoginError(''); }}
              className={`flex-1 pb-3 text-sm font-semibold border-b-2 transition-all duration-200 ${
                !isRegistering
                  ? 'border-neon-purple text-neon-purple'
                  : 'border-transparent text-content-muted hover:text-foreground'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => { setIsRegistering(true); setLoginError(''); }}
              className={`flex-1 pb-3 text-sm font-semibold border-b-2 transition-all duration-200 ${
                isRegistering
                  ? 'border-neon-purple text-neon-purple'
                  : 'border-transparent text-content-muted hover:text-foreground'
              }`}
            >
              Register
            </button>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold mb-1 text-content-muted uppercase tracking-wider">Username</label>
              <input
                type="text"
                className="w-full bg-surface/40 border border-border rounded-xl px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-neon-purple/30 focus:border-neon-purple transition-all duration-200 placeholder-content-subtle"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Enter username"
                required
              />
            </div>
            
            {isRegistering && (
              <div className="animate-in slide-in-from-top-1 duration-200">
                <label className="block text-xs font-semibold mb-1 text-content-muted uppercase tracking-wider">Email Address</label>
                <input
                  type="email"
                  className="w-full bg-surface/40 border border-border rounded-xl px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-neon-purple/30 focus:border-neon-purple transition-all duration-200 placeholder-content-subtle"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  required
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold mb-1 text-content-muted uppercase tracking-wider">Password</label>
              <input
                type="password"
                className="w-full bg-surface/40 border border-border rounded-xl px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-neon-purple/30 focus:border-neon-purple transition-all duration-200 placeholder-content-subtle"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>

            {isRegistering && (
              <div className="animate-in slide-in-from-top-1 duration-200">
                <label className="block text-xs font-semibold mb-1 text-content-muted uppercase tracking-wider">Confirm Password</label>
                <input
                  type="password"
                  className="w-full bg-surface/40 border border-border rounded-xl px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-neon-purple/30 focus:border-neon-purple transition-all duration-200 placeholder-content-subtle"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>
            )}

            {loginError && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-xs font-semibold animate-in fade-in duration-200">
                {loginError}
              </div>
            )}
            
            {msg && msg.type === 'success' && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-xs font-semibold animate-in fade-in duration-200">
                {msg.text}
              </div>
            )}

             <button
              type="submit"
              disabled={loginLoading}
              className="w-full mt-6 bg-neon-purple hover:bg-neon-purple/90 text-white font-bold py-2.5 px-4 rounded-xl transition-all duration-200 shadow-md hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed glow-purple"
            >
              {loginLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  {isRegistering ? 'Creating account...' : 'Signing in...'}
                </span>
              ) : (
                isRegistering ? 'Create Account' : 'Sign In'
              )}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Settings - Tiak</title>
      </Head>

      <div className="max-w-xl mx-auto py-8 animate-in fade-in duration-500 pb-24">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Settings</h1>
          <button
            onClick={logout}
            className="text-sm font-medium text-red-500 hover:text-red-700 transition-colors"
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
                <h2 className="text-lg font-medium text-foreground mb-4">Download Settings</h2>
                <label htmlFor="maxConcurrent" className="block text-sm font-medium text-foreground mb-4">
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
                    <span className="text-xl font-mono font-medium text-foreground">{maxConcurrent}</span>
                  </div>
                </div>
                <p className="mt-3 text-xs text-content-muted">
                  Limit the number of simultaneous downloads (1-10) to manage bandwidth.
                </p>
              </div>

              <SystemInfoSection systemStats={systemStats} />

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
                    <span className={`text-sm font-medium ${msg.type === 'success' ? 'text-emerald-600' : 'text-red-600'} animate-in fade-in slide-in-from-left-2`}>
                      {msg.text}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => handleSave()}
                  disabled={saving}
                  className="inline-flex items-center justify-center rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background shadow-sm hover:bg-foreground/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
