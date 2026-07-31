import { useState, useEffect } from 'react';
import { Check, X, FolderOpen, ChevronUp, ChevronDown, Edit2, Trash2 } from 'lucide-react';

interface EditingCategory {
  original: string;
  current: string;
}

interface CategorySettingsSectionProps {
  categories: string[];
  newCatName: string;
  editingCat: EditingCategory | null;
  onNewCatNameChange: (value: string) => void;
  onAddCategory: () => void;
  onStartEditing: (name: string) => void;
  onEditingCatChange: (value: EditingCategory | null) => void;
  onSaveRename: () => void;
  onDeleteCategory: (name: string) => void;
}

export default function CategorySettingsSection({
  categories,
  newCatName,
  editingCat,
  onNewCatNameChange,
  onAddCategory,
  onStartEditing,
  onEditingCatChange,
  onSaveRename,
  onDeleteCategory,
}: CategorySettingsSectionProps) {
  const [localCategories, setLocalCategories] = useState(categories);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    setLocalCategories(categories);
  }, [categories]);

  const handleMove = (index: number, direction: 'up' | 'down') => {
    const newCats = [...localCategories];
    if (direction === 'up' && index > 0) {
      [newCats[index - 1], newCats[index]] = [newCats[index], newCats[index - 1]];
    } else if (direction === 'down' && index < newCats.length - 1) {
      [newCats[index + 1], newCats[index]] = [newCats[index], newCats[index + 1]];
    }
    setLocalCategories(newCats);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Categories</h2>
        <span className="text-xs font-medium px-2 py-1 bg-surface-strong text-content-muted rounded-full">
          {localCategories.length} Total
        </span>
      </div>
      <div className="space-y-4">
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="New Category Name"
            value={newCatName}
            onChange={(e) => onNewCatNameChange(e.target.value)}
            className="flex-1 min-w-0 rounded-md border border-border-subtle bg-transparent px-3 py-1.5 text-sm"
            onKeyDown={(e) => e.key === 'Enter' && onAddCategory()}
          />
          <button
            onClick={onAddCategory}
            disabled={!newCatName.trim()}
            className="shrink-0 whitespace-nowrap bg-accent text-white px-4 py-1.5 rounded-md text-sm font-semibold shadow-sm shadow-accent/20 hover:bg-accent/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Add Category
          </button>
        </div>

        <div className="flex flex-col gap-2">
          {(showAll ? localCategories : localCategories.slice(0, 5)).map((cat, index) => (
            <div key={cat} className="group flex items-center justify-between p-3 rounded-xl border border-border-subtle bg-surface hover:bg-surface-strong hover:border-border transition-all duration-200">
              {editingCat?.original === cat ? (
                <div className="flex flex-1 items-center gap-2 mr-2">
                  <input
                    type="text"
                    value={editingCat.current}
                    onChange={(e) => onEditingCatChange({ ...editingCat, current: e.target.value })}
                    className="flex-1 rounded-lg border border-accent bg-surface px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent/50"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') onSaveRename();
                      if (e.key === 'Escape') onEditingCatChange(null);
                    }}
                  />
                  <button onClick={onSaveRename} className="p-1.5 rounded-md bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 transition-colors">
                    <Check width={16} height={16} strokeWidth={2.5} className="text-current" />
                  </button>
                  <button onClick={() => onEditingCatChange(null)} className="p-1.5 rounded-md bg-accent/10 text-accent hover:bg-accent/20 transition-colors">
                    <X width={16} height={16} strokeWidth={2.5} className="text-current" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-3 min-w-0 pr-2">
                  <div className="h-8 w-8 shrink-0 rounded-lg bg-gradient-to-br from-accent/20 to-accent/5 flex items-center justify-center border border-accent/20">
                    <FolderOpen width={14} height={14} className="text-accent shrink-0" strokeWidth={2.5} />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-semibold text-foreground tracking-tight truncate block" title={cat}>{cat}</span>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-200 shrink-0">
                {editingCat?.original !== cat && (
                  <div className="flex items-center mr-2 bg-surface-strong rounded-md p-0.5">
                    <button 
                      onClick={() => handleMove(index, 'up')} 
                      disabled={index === 0}
                      className="text-content-muted hover:text-foreground disabled:opacity-30 p-1 hover:bg-surface rounded transition-colors" 
                      title="Move Up"
                    >
                      <ChevronUp width={14} height={14} strokeWidth={2.5} className="text-current" />
                    </button>
                    <button 
                      onClick={() => handleMove(index, 'down')} 
                      disabled={index === localCategories.length - 1}
                      className="text-content-muted hover:text-foreground disabled:opacity-30 p-1 hover:bg-surface rounded transition-colors" 
                      title="Move Down"
                    >
                      <ChevronDown width={14} height={14} strokeWidth={2.5} className="text-current" />
                    </button>
                  </div>
                )}
                {cat !== 'default' && editingCat?.original !== cat && (
                  <>
                    <button onClick={() => onStartEditing(cat)} className="text-blue-400 hover:text-blue-500 hover:bg-blue-500/10 p-1.5 rounded-md transition-colors" title="Rename">
                      <Edit2 width={14} height={14} strokeWidth={2.5} className="text-current" />
                    </button>
                    <button onClick={() => onDeleteCategory(cat)} className="text-red-400 hover:text-accent hover:bg-accent/10 p-1.5 rounded-md transition-colors" title="Delete">
                      <Trash2 width={14} height={14} strokeWidth={2.5} className="text-current" />
                    </button>
                  </>
                )}
                {cat === 'default' && (
                  <span className="text-[10px] uppercase tracking-wider font-bold text-content-muted bg-surface-strong px-2 py-1 rounded-md">Default</span>
                )}
              </div>
            </div>
          ))}
        </div>

        {localCategories.length > 5 && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="w-full py-2.5 mt-2 rounded-xl border border-border border-dashed text-sm font-medium text-content-muted hover:text-foreground hover:border-accent/50 hover:bg-accent/5 transition-all duration-200"
          >
            {showAll ? 'Show Less' : `Show All Categories (${localCategories.length})`}
          </button>
        )}
      </div>
    </div>
  );
}
