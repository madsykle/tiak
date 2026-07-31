import React from "react";
import { ListFilter, Search, SlidersHorizontal, X } from "lucide-react";
import SearchableSelect from "./SearchableSelect";

interface EnhancedFiltersProps {
	searchQuery: string;
	setSearchQuery: (query: string) => void;
	categoryFilter: string;
	setCategoryFilter: (category: string) => void;
	platformFilter: string;
	setPlatformFilter: (platform: string) => void;
	sortBy: string;
	setSortBy: (sortBy: string) => void;
	sortDir: "asc" | "desc";
	setSortDir: (dir: "asc" | "desc") => void;
	categories: string[];
	availablePlatforms: string[];
	fileCount: number;
	onClearFilters: () => void;
}

export default function EnhancedFilters({
	searchQuery,
	setSearchQuery,
	categoryFilter,
	setCategoryFilter,
	platformFilter,
	setPlatformFilter,
	sortBy,
	setSortBy,
	sortDir,
	setSortDir,
	categories,
	availablePlatforms,
	fileCount,
	onClearFilters,
}: EnhancedFiltersProps) {
	const hasActiveFilters = searchQuery.trim() !== "" || categoryFilter !== "all" || platformFilter !== "all";
	const sortValue = `${sortBy}-${sortDir}`;

	return (
		<section className="app-card-muted p-3 sm:p-4" aria-label="File filters">
			<div className="flex items-center gap-2">
				<div className="relative min-w-0 flex-1">
					<Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-content-subtle" size={16} />
					<input
						value={searchQuery}
						onChange={(event) => setSearchQuery(event.target.value)}
						placeholder="Search files"
						className="app-input w-full pl-9 pr-9"
						aria-label="Search files"
					/>
					{searchQuery && (
						<button type="button" onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-content-muted hover:bg-surface-strong hover:text-foreground" aria-label="Clear search">
							<X size={14} />
						</button>
					)}
				</div>
				<span className="hidden items-center gap-1 text-xs text-content-muted sm:flex"><ListFilter size={14} />{fileCount}</span>
			</div>

			<div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
				<SearchableSelect options={categories} value={categoryFilter} onChange={setCategoryFilter} placeholder="Category" className="w-full" includeAllOption allOptionLabel="All categories" allowCreation={false} />
				<SearchableSelect options={availablePlatforms} value={platformFilter} onChange={setPlatformFilter} placeholder="Platform" className="w-full" includeAllOption allOptionLabel="All platforms" allowCreation={false} />
				<label className="relative col-span-2 sm:col-span-1">
					<SlidersHorizontal className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-content-subtle" size={14} />
					<select value={sortValue} onChange={(event) => { const [field, direction] = event.target.value.split("-"); setSortBy(field); setSortDir(direction as "asc" | "desc"); }} className="app-input w-full appearance-none pl-9 pr-3" aria-label="Sort files">
						<option value="time-desc">Newest first</option>
						<option value="time-asc">Oldest first</option>
						<option value="name-asc">Name A-Z</option>
						<option value="name-desc">Name Z-A</option>
						<option value="size-desc">Largest first</option>
						<option value="size-asc">Smallest first</option>
						<option value="platform-asc">Platform</option>
					</select>
				</label>
			</div>

			{hasActiveFilters && (
				<div className="mt-3 flex items-center justify-between gap-3 border-t border-border-subtle pt-3 text-xs">
					<span className="text-content-muted">{fileCount} matching file{fileCount === 1 ? "" : "s"}</span>
					<button type="button" onClick={onClearFilters} className="font-semibold text-accent hover:text-foreground">Clear filters</button>
				</div>
			)}
		</section>
	);
}
