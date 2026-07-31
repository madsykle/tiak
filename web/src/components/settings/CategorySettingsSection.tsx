import { useEffect, useState } from "react";
import { Check, ChevronDown, ChevronUp, Edit2, FolderOpen, Plus, Trash2, X } from "lucide-react";

interface EditingCategory { original: string; current: string; }
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

export default function CategorySettingsSection({ categories, newCatName, editingCat, onNewCatNameChange, onAddCategory, onStartEditing, onEditingCatChange, onSaveRename, onDeleteCategory }: CategorySettingsSectionProps) {
	const [localCategories, setLocalCategories] = useState(categories);
	const [showAll, setShowAll] = useState(false);
	useEffect(() => setLocalCategories(categories), [categories]);

	const handleMove = (index: number, direction: "up" | "down") => {
		const next = [...localCategories];
		const target = direction === "up" ? index - 1 : index + 1;
		if (target < 0 || target >= next.length) return;
		[next[index], next[target]] = [next[target], next[index]];
		setLocalCategories(next);
	};

	return (
		<section className="space-y-4">
			<div className="flex items-end justify-between gap-3">
				<div><p className="eyebrow">Library structure</p><h2 className="type-section-header mt-1">Categories</h2></div>
				<span className="rounded-full bg-surface-strong px-2.5 py-1 text-xs text-content-muted">{localCategories.length} total</span>
			</div>
			<div className="flex flex-col gap-2 sm:flex-row">
				<input type="text" placeholder="New Category Name" value={newCatName} onChange={(event) => onNewCatNameChange(event.target.value)} onKeyDown={(event) => event.key === "Enter" && onAddCategory()} className="app-input min-w-0 flex-1" />
				<button type="button" onClick={onAddCategory} disabled={!newCatName.trim()} className="button-primary shrink-0"><Plus size={16} />Add</button>
			</div>
			<div className="flex flex-col gap-2">
				{(showAll ? localCategories : localCategories.slice(0, 5)).map((category, index) => (
					<div key={category} className="app-card-muted flex min-h-14 items-center justify-between gap-3 px-3 py-2.5">
						{editingCat?.original === category ? (
							<div className="flex min-w-0 flex-1 items-center gap-2">
								<input autoFocus value={editingCat.current} onChange={(event) => onEditingCatChange({ ...editingCat, current: event.target.value })} onKeyDown={(event) => { if (event.key === "Enter") onSaveRename(); if (event.key === "Escape") onEditingCatChange(null); }} className="app-input min-w-0 flex-1" />
								<button type="button" onClick={onSaveRename} className="rounded-lg bg-emerald-400/[0.12] p-2 text-emerald-300" aria-label="Save category"><Check size={16} /></button>
								<button type="button" onClick={() => onEditingCatChange(null)} className="rounded-lg bg-red-400/[0.12] p-2 text-red-300" aria-label="Cancel edit"><X size={16} /></button>
							</div>
						) : (
							<div className="flex min-w-0 items-center gap-3"><span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent"><FolderOpen size={15} /></span><span className="truncate text-sm font-medium">{category}</span></div>
						)}
						{editingCat?.original !== category && <div className="flex shrink-0 items-center gap-1">
							<div className="hidden items-center rounded-lg bg-surface-strong p-0.5 sm:flex"><button type="button" onClick={() => handleMove(index, "up")} disabled={index === 0} className="rounded-md p-1.5 text-content-muted hover:text-foreground disabled:opacity-30" title="Move Up"><ChevronUp size={14} /></button><button type="button" onClick={() => handleMove(index, "down")} disabled={index === localCategories.length - 1} className="rounded-md p-1.5 text-content-muted hover:text-foreground disabled:opacity-30" title="Move Down"><ChevronDown size={14} /></button></div>
							{category !== "default" ? <><button type="button" onClick={() => onStartEditing(category)} className="rounded-lg p-2 text-content-muted hover:bg-surface-strong hover:text-foreground" title="Rename"><Edit2 size={15} /></button><button type="button" onClick={() => onDeleteCategory(category)} className="rounded-lg p-2 text-content-muted hover:bg-red-400/[0.12] hover:text-red-300" title="Delete"><Trash2 size={15} /></button></> : <span className="rounded-md bg-surface-strong px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-content-subtle">Default</span>}
						</div>}
					</div>
				))}
			</div>
			{localCategories.length > 5 && <button type="button" onClick={() => setShowAll(!showAll)} className="w-full rounded-xl border border-dashed border-border py-2.5 text-xs font-semibold text-content-muted hover:border-accent hover:text-accent">{showAll ? "Show less" : `Show all categories (${localCategories.length})`}</button>}
		</section>
	);
}
