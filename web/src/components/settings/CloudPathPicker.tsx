import { useState, useEffect } from 'react';
import { API_BASE } from '../../lib/config';

interface RcloneEntry {
  Path: string;
  Name: string;
  IsDir: boolean;
}

interface CloudPathPickerProps {
  currentPath: string;
  onSelect: (path: string) => void;
  onClose: () => void;
}

export default function CloudPathPicker({ currentPath, onSelect, onClose }: CloudPathPickerProps) {
  const [path, setPath] = useState(currentPath.includes(':') ? currentPath.split(':')[0] + ':' : 'onedrive:');
  const [entries, setEntries] = useState<RcloneEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDirectory(path);
  }, [path]);

  const fetchDirectory = async (targetPath: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/rclone/ls?path=${encodeURIComponent(targetPath)}`, {
        headers: {
          'ngrok-skip-browser-warning': 'true',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setEntries(data.entries || []);
      } else {
        const text = await res.text();
        setError(text || 'Failed to list directory');
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  const handleNavigate = (entryName: string) => {
    // Determine remote vs path
    let newPath = '';
    if (path.endsWith(':')) {
      newPath = path + entryName;
    } else if (path.endsWith('/')) {
      newPath = path + entryName;
    } else {
      newPath = path + '/' + entryName;
    }
    setPath(newPath);
  };

  const handleGoUp = () => {
    if (path.endsWith(':')) return; // Already at remote root
    const parts = path.split('/');
    if (parts.length === 1) {
      // Just remote:folder -> go to remote:
      setPath(path.split(':')[0] + ':');
    } else {
      parts.pop();
      setPath(parts.join('/'));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-surface border border-border w-full max-w-md rounded-2xl shadow-2xl flex flex-col max-h-[80vh] overflow-hidden">
        <div className="p-4 border-b border-border-subtle flex items-center justify-between bg-surface-strong/50">
          <h3 className="text-lg font-semibold tracking-tight text-foreground">Select Cloud Folder</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-content-muted hover:bg-white/5 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>
        
        <div className="p-3 border-b border-border-subtle flex gap-2 items-center bg-surface-subtle">
          <button 
            onClick={handleGoUp} 
            disabled={path.endsWith(':')}
            className="p-1.5 rounded-lg border border-border bg-surface-strong hover:border-border-strong disabled:opacity-50 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m18 15-6-6-6 6"/></svg>
          </button>
          <input
            type="text"
            value={path}
            onChange={(e) => setPath(e.target.value)}
            className="flex-1 rounded-lg border border-border bg-surface/50 p-2 text-sm text-foreground focus:ring-1 focus:ring-accent focus:border-accent"
          />
          <button onClick={() => fetchDirectory(path)} className="p-2 rounded-lg bg-accent/10 text-accent hover:bg-accent/20 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-content-muted">
              <span className="h-6 w-6 animate-spin rounded-full border-2 border-content-muted border-t-transparent" />
              <span className="text-sm">Loading directories...</span>
            </div>
          ) : error ? (
            <div className="p-4 m-2 text-sm text-red-400 bg-accent/10 border border-accent/20 rounded-xl">
              {error}
            </div>
          ) : entries.length === 0 ? (
            <div className="py-12 text-center text-sm text-content-muted">
              Empty directory.
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {entries.map(entry => (
                <button
                  key={entry.Path}
                  onClick={() => handleNavigate(entry.Name)}
                  className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-surface-strong hover:text-accent transition-colors text-left group"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" className="text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>
                  <span className="text-sm font-medium text-foreground group-hover:text-accent transition-colors">{entry.Name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-border-subtle bg-surface-strong/50 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium text-content-muted hover:text-foreground hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onSelect(path)}
            className="px-6 py-2 rounded-xl text-sm font-semibold text-white bg-accent hover:bg-accent/90 shadow-lg shadow-accent/20 transition-all active:scale-95"
          >
            Select Here
          </button>
        </div>
      </div>
    </div>
  );
}
