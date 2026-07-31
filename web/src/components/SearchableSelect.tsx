import React, { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";

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

export default function SearchableSelect({ options, value, onChange, placeholder = "Select...", className = "", includeAllOption = false, allOptionLabel = "All categories", allowCreation = true }: SearchableSelectProps) {
	const [isOpen, setIsOpen] = useState(false);
	const [searchTerm, setSearchTerm] = useState("");
	const wrapperRef = useRef<HTMLDivElement>(null);
	const filteredOptions = options.filter((option) => option.toLowerCase().includes(searchTerm.toLowerCase()));
	const displayValue = includeAllOption && value === "all" ? allOptionLabel : value;

	useEffect(() => {
		const onPointerDown = (event: MouseEvent) => { if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) setIsOpen(false); };
		const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setIsOpen(false); };
		document.addEventListener("mousedown", onPointerDown);
		document.addEventListener("keydown", onKeyDown);
		return () => { document.removeEventListener("mousedown", onPointerDown); document.removeEventListener("keydown", onKeyDown); };
	}, []);

	const choose = (next: string) => { onChange(next); setSearchTerm(""); setIsOpen(false); };

	return (
		<div ref={wrapperRef} className={`relative ${className}`}>
			<button type="button" onClick={() => setIsOpen((open) => !open)} className="app-input flex w-full items-center justify-between gap-2 text-left" aria-haspopup="listbox" aria-expanded={isOpen}>
				<span className={`truncate ${displayValue ? "text-foreground" : "text-content-subtle"}`}>{displayValue || placeholder}</span><ChevronDown size={16} className={`shrink-0 text-content-subtle transition-transform ${isOpen ? "rotate-180" : ""}`} />
			</button>
			{isOpen && <div className="absolute left-0 top-full z-50 mt-2 w-full min-w-[12rem] overflow-hidden rounded-xl border border-border bg-surface p-2 shadow-2xl">
				<div className="relative mb-2"><Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-content-subtle" /><input autoFocus value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search" className="app-input h-9 min-h-9 w-full pl-8 text-xs" aria-label="Search options" /></div>
				<div className="max-h-56 overflow-y-auto" role="listbox">
					{includeAllOption && !searchTerm && <Option active={value === "all"} label={allOptionLabel} onClick={() => choose("all")} />}
					{filteredOptions.map((option) => <Option key={option} active={value === option} label={option} onClick={() => choose(option)} />)}
					{filteredOptions.length === 0 && searchTerm && allowCreation && <Option label={`Create "${searchTerm}"`} onClick={() => choose(searchTerm)} />}
					{filteredOptions.length === 0 && !allowCreation && <p className="px-2 py-4 text-center text-xs text-content-subtle">No matches</p>}
				</div>
			</div>}
		</div>
	);
}

function Option({ label, active = false, onClick }: { label: string; active?: boolean; onClick: () => void }) {
	return <button type="button" role="option" aria-selected={active} onClick={onClick} className={`flex min-h-10 w-full items-center justify-between rounded-lg px-2.5 text-left text-sm transition-colors ${active ? "bg-accent/[0.12] text-accent" : "text-content-muted hover:bg-surface-subtle hover:text-foreground"}`}><span className="truncate">{label}</span>{active && <Check size={14} />}</button>;
}
