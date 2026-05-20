import React, { useState, useRef, useEffect } from 'react';

interface SearchableSelectProps {
  options: string[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  includeAllOption?: boolean;
  allOptionLabel?: string;
  allowCreation?: boolean;
}

export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Select...',
  className = '',
  includeAllOption = false,
  allOptionLabel = 'All Categories',
  allowCreation = true
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredOptions = options.filter(option =>
    option.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const displayValue = includeAllOption && value === 'all' 
    ? allOptionLabel 
    : value;

  const handleSelect = (val: string) => {
    onChange(val);
    setIsOpen(false);
    setSearchTerm('');
  };

  return (
    <div className={`relative ${className}`} ref={wrapperRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex h-9 w-full items-center justify-between rounded-lg border border-border-subtle bg-surface px-3 py-2 text-sm text-foreground focus:border-foreground focus:ring-1 focus:ring-foreground hover:bg-surface-subtle transition-all"
      >
        <span className="truncate">{displayValue || placeholder}</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`ml-2 h-4 w-4 shrink-0 opacity-50 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 z-50 mt-1 w-full min-w-[200px] rounded-xl border border-border bg-surface shadow-xl animate-in fade-in zoom-in-95 duration-100 origin-top">
          <div className="p-2">
            <div className="relative mb-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="absolute left-2.5 top-1/2 -translate-y-1/2 opacity-50"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                autoFocus
                type="text"
                className="h-8 w-full rounded-md border-border-subtle bg-surface-subtle pl-8 pr-3 text-xs focus:border-foreground focus:ring-0"
                placeholder="Search categories..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setIsOpen(false);
                }}
              />
            </div>

            <div className="max-h-[240px] overflow-y-auto overflow-x-hidden scrollbar-thin">
              {includeAllOption && !searchTerm && (
                <button
                  onClick={() => handleSelect('all')}
                  className={`flex w-full items-center rounded-md px-2 py-1.5 text-sm transition-colors ${
                    value === 'all' ? 'bg-surface-strong text-foreground' : 'hover:bg-surface-subtle text-content-muted hover:text-foreground'
                  }`}
                >
                  {allOptionLabel}
                </button>
              )}

              {filteredOptions.length > 0 ? (
                filteredOptions.map((option) => (
                  <button
                    key={option}
                    onClick={() => handleSelect(option)}
                    className={`flex w-full items-center rounded-md px-2 py-1.5 text-sm transition-colors ${
                      value === option ? 'bg-surface-strong text-foreground' : 'hover:bg-surface-subtle text-content-muted hover:text-foreground'
                    }`}
                  >
                    <span className="truncate">{option}</span>
                  </button>
                ))
              ) : (searchTerm && allowCreation) ? (
                <button
                  onClick={() => handleSelect(searchTerm)}
                  className="flex w-full flex-col items-start rounded-md px-2 py-2 text-sm text-foreground hover:bg-surface-subtle transition-colors border border-dashed border-border-subtle mt-1"
                >
                  <span className="text-[10px] uppercase tracking-wider text-content-subtle font-semibold mb-0.5">Create new category</span>
                  <span className="truncate font-medium text-emerald-600 dark:text-emerald-400">&quot;{searchTerm}&quot;</span>
                </button>
              ) : (
                <div className="px-2 py-4 text-center text-xs text-content-subtle">
                  No categories found
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
