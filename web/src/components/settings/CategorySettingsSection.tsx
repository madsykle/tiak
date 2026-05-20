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
  return (
    <div>
      <h2 className="text-lg font-medium text-foreground mb-4">Categories</h2>
      <div className="space-y-3">
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="New Category Name"
            value={newCatName}
            onChange={(e) => onNewCatNameChange(e.target.value)}
            className="flex-1 rounded-md border border-border-subtle bg-transparent px-3 py-1.5 text-sm"
            onKeyDown={(e) => e.key === 'Enter' && onAddCategory()}
          />
          <button
            onClick={onAddCategory}
            disabled={!newCatName.trim()}
            className="bg-foreground text-background px-3 py-1.5 rounded-md text-sm font-medium disabled:opacity-50"
          >
            Add
          </button>
        </div>

        <div className="border rounded-lg divide-y border-border-subtle">
          {categories.map(cat => (
            <div key={cat} className="flex items-center justify-between p-3">
              {editingCat?.original === cat ? (
                <div className="flex flex-1 items-center gap-2 mr-2">
                  <input
                    type="text"
                    value={editingCat.current}
                    onChange={(e) => onEditingCatChange({ ...editingCat, current: e.target.value })}
                    className="flex-1 rounded border border-blue-500 bg-surface px-2 py-1 text-sm"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') onSaveRename();
                      if (e.key === 'Escape') onEditingCatChange(null);
                    }}
                  />
                  <button onClick={onSaveRename} className="text-green-600 hover:text-green-500">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  </button>
                  <button onClick={() => onEditingCatChange(null)} className="text-red-500 hover:text-red-400">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
              ) : (
                <span className="text-sm font-medium">{cat}</span>
              )}

              {cat !== 'default' && editingCat?.original !== cat && (
                <div className="flex items-center gap-2">
                  <button onClick={() => onStartEditing(cat)} className="text-content-muted hover:text-foreground p-1" title="Rename">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
                  </button>
                  <button onClick={() => onDeleteCategory(cat)} className="text-red-400 hover:text-red-500 p-1" title="Delete">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                  </button>
                </div>
              )}
              {cat === 'default' && (
                <span className="text-xs text-content-muted italic">Default</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
