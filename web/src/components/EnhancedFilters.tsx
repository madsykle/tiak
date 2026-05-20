import React from 'react';
import SearchableSelect from './SearchableSelect';

interface EnhancedFiltersProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  categoryFilter: string;
  setCategoryFilter: (category: string) => void;
  platformFilter: string;
  setPlatformFilter: (platform: string) => void;
  sortBy: string;
  setSortBy: (sortBy: string) => void;
  sortDir: 'asc' | 'desc';
  setSortDir: (dir: 'asc' | 'desc') => void;
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
  const hasActiveFilters =
    searchQuery.trim() !== '' ||
    categoryFilter !== 'all' ||
    platformFilter !== 'all';

  const sortOptions = [
    { value: 'time', label: 'Date (Newest)' },
    { value: 'time-asc', label: 'Date (Oldest)' },
    { value: 'name', label: 'Name (A-Z)' },
    { value: 'name-desc', label: 'Name (Z-A)' },
    { value: 'size', label: 'Size (Largest)' },
    { value: 'size-asc', label: 'Size (Smallest)' },
    { value: 'platform', label: 'Platform' },
  ];

  const handleSortChange = (value: string) => {
    if (value.includes('-')) {
      const [field, dir] = value.split('-');
      setSortBy(field);
      setSortDir(dir as 'asc' | 'desc');
    } else {
      setSortBy(value);
      setSortDir(value === 'time' || value === 'size' ? 'desc' : 'asc');
    }
  };

  
  return (
    <div className="space-y-4">
      {/* Search Bar */}
      <div className="group relative">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
          <svg className="h-4 w-4 text-content-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search files by name..."
          className="block w-full rounded-lg border border-border bg-surface py-2.5 pl-10 pr-10 text-foreground placeholder:text-content-muted focus:border-foreground/30 focus:outline-none focus:ring-2 focus:ring-foreground/10 transition-all"
        />
        {searchQuery.trim() && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute inset-y-0 right-0 flex items-center pr-3 text-content-muted hover:text-foreground transition-colors"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Category Filter */}
        <div className="min-w-[160px]">
          <SearchableSelect
            options={categories}
            value={categoryFilter}
            onChange={setCategoryFilter}
            placeholder="All categories"
            className="w-full"
            includeAllOption
            allOptionLabel="All categories"
            allowCreation={false}
          />
        </div>

        {/* Platform Filter */}
        <div className="min-w-[140px]">
          <SearchableSelect
            options={availablePlatforms}
            value={platformFilter}
            onChange={setPlatformFilter}
            placeholder="All platforms"
            className="w-full"
            includeAllOption
            allOptionLabel="All platforms"
            allowCreation={false}
          />
        </div>

        {/* Sort Dropdown */}
        <div className="relative min-w-[160px]">
          <select
            value={sortDir === 'desc' && sortBy !== 'platform' ? sortBy : `${sortBy}${sortDir === 'asc' && sortBy !== 'platform' ? '-asc' : ''}`}
            onChange={(e) => handleSortChange(e.target.value)}
            className="w-full appearance-none rounded-lg border border-border bg-surface py-2.5 pl-3 pr-8 text-foreground focus:border-foreground/30 focus:outline-none focus:ring-2 focus:ring-foreground/10 transition-all"
          >
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
            <svg className="h-4 w-4 text-content-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        {/* Active Filters Indicator */}
        {hasActiveFilters && (
          <>
            <div className="flex items-center gap-2 rounded-lg bg-blue-100 px-3 py-1.5 text-xs font-medium text-blue-800">
              <span className="flex h-2 w-2 rounded-full bg-blue-500"></span>
              <span>{fileCount} result{fileCount !== 1 ? 's' : ''}</span>
              <button
                onClick={onClearFilters}
                className="ml-1 text-blue-700 hover:text-blue-900 transition-colors"
                title="Clear all filters"
              >
                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </>
        )}

        {/* Filter Count */}
        <div className="ml-auto text-xs text-content-muted">
          Showing {fileCount} file{fileCount !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Active Filters Display */}
      {hasActiveFilters && (
        <div className="flex flex-wrap gap-2">
          {searchQuery.trim() && (
            <div className="flex items-center gap-1 rounded-full bg-surface-strong px-3 py-1 text-xs">
              <span className="text-content">Search:</span>
              <span className="font-medium text-foreground">{searchQuery}</span>
              <button
                onClick={() => setSearchQuery('')}
                className="ml-1 text-content-muted hover:text-foreground transition-colors"
              >
                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}

          {categoryFilter !== 'all' && (
            <div className="flex items-center gap-1 rounded-full bg-surface-strong px-3 py-1 text-xs">
              <span className="text-content">Category:</span>
              <span className="font-medium text-foreground">{categoryFilter}</span>
              <button
                onClick={() => setCategoryFilter('all')}
                className="ml-1 text-content-muted hover:text-foreground transition-colors"
              >
                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}

          {platformFilter !== 'all' && (
            <div className="flex items-center gap-1 rounded-full bg-surface-strong px-3 py-1 text-xs">
              <span className="text-content">Platform:</span>
              <span className="font-medium text-foreground">{platformFilter}</span>
              <button
                onClick={() => setPlatformFilter('all')}
                className="ml-1 text-content-muted hover:text-foreground transition-colors"
              >
                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
