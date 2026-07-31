"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import InstallPrompt from "@/components/InstallPrompt";
import { useAuthState, useAppStore } from "@/store/app-store";
import { FolderOpen, History, Inbox, LayoutDashboard, Settings } from "lucide-react";
import Logo from "@/components/Logo";

interface LayoutProps {
	children: React.ReactNode;
}

const navItems = [
	{ label: "Queue", href: "/", icon: Inbox, show: () => true },
	{
		label: "Files",
		href: "/files",
		icon: FolderOpen,
		show: (role: string | null) => role === "admin" || role === "premium_member",
	},
	{
		label: "History",
		href: "/history",
		icon: History,
		show: (role: string | null) => role === "admin" || role === "premium_member",
	},
	{
		label: "Admin",
		href: "/admin",
		icon: LayoutDashboard,
		show: (role: string | null) => role === "admin",
	},
	{ label: "Settings", href: "/settings", icon: Settings, show: () => true },
];

export default function MainLayout({ children }: LayoutProps) {
	const pathname = usePathname();
	const { role } = useAuthState();
	const checkAuthSession = useAppStore((state) => state.checkAuth);
	const mainRef = useRef<HTMLElement>(null);

	useEffect(() => {
		checkAuthSession();
	}, [checkAuthSession]);

	useEffect(() => {
		mainRef.current?.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
	}, [pathname]);

	const visibleItems = navItems.filter((item) => item.show(role));
	const isActive = (href: string) =>
		href === "/" ? pathname === "/" : pathname?.startsWith(href);

	return (
		<div className="min-h-[100dvh] bg-background text-foreground lg:grid lg:grid-cols-[248px_1fr]">
			<aside className="hidden border-r border-border-subtle bg-surface/50 lg:flex lg:flex-col">
				<div className="flex h-20 items-center gap-3 border-b border-border-subtle px-6">
					<Logo className="size-10 text-accent" aria-hidden="true" />
					<div>
						<p className="text-sm font-semibold tracking-tight">Tiak</p>
						<p className="text-[10px] uppercase tracking-[0.16em] text-content-subtle">Media desk</p>
					</div>
				</div>
				<nav className="flex flex-1 flex-col gap-1 p-4" aria-label="Primary navigation">
					{visibleItems.map(({ href, label, icon: Icon }) => {
						const active = isActive(href);
						return (
							<Link
								key={href}
								href={href}
								aria-current={active ? "page" : undefined}
								className={`group flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm transition-colors ${
									active
										? "bg-accent/[0.12] font-semibold text-accent"
										: "text-content-muted hover:bg-surface-subtle hover:text-foreground"
								}`}
							>
								<Icon size={18} strokeWidth={active ? 2.4 : 1.8} />
								{label}
							</Link>
						);
					})}
				</nav>
				<div className="border-t border-border-subtle px-6 py-5">
					<p className="text-xs text-content-muted">{role ? role.replace("_", " ") : "Guest session"}</p>
					<p className="mt-1 text-[11px] leading-5 text-content-subtle">Your personal media workspace</p>
				</div>
			</aside>

			<div className="flex min-h-[100dvh] min-w-0 flex-col">
				<header className="safe-area-pt sticky top-0 z-30 border-b border-border-subtle bg-background/88 px-4 backdrop-blur-xl lg:hidden">
					<div className="mx-auto flex h-14 max-w-3xl items-center justify-between">
						<Link href="/" className="flex items-center gap-2.5" aria-label="Tiak home">
							<Logo className="size-9 text-accent" aria-hidden="true" />
							<span className="text-sm font-semibold tracking-tight">Tiak</span>
						</Link>
						<span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-content-subtle">
							{role ? role.replace("_", " ") : "Guest"}
						</span>
					</div>
				</header>

				<main ref={mainRef} className="min-w-0 flex-1 overflow-y-auto">
					<div className="mx-auto w-full max-w-7xl px-4 pb-32 pt-6 sm:px-6 sm:pt-8 lg:px-10 lg:pb-12">
						{children}
					</div>
				</main>

				<InstallPrompt />

				<nav className="safe-area-pb fixed inset-x-0 bottom-0 z-40 border-t border-border-subtle bg-surface/92 px-2 backdrop-blur-xl lg:hidden" aria-label="Mobile navigation">
					<ul className="mx-auto flex h-[4.4rem] max-w-xl items-stretch justify-around">
						{visibleItems.map(({ href, label, icon: Icon }) => {
							const active = isActive(href);
							return (
								<li key={href} className="min-w-0 flex-1">
									<Link
										href={href}
										aria-current={active ? "page" : undefined}
										className={`relative flex h-full flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors active:scale-95 ${
											active ? "text-accent" : "text-content-subtle"
										}`}
									>
										{active && <span className="absolute inset-x-5 top-0 h-0.5 rounded-full bg-accent" />}
										<Icon size={20} strokeWidth={active ? 2.4 : 1.8} />
										<span className="truncate px-1">{label}</span>
									</Link>
								</li>
							);
						})}
					</ul>
				</nav>
			</div>
		</div>
	);
}
