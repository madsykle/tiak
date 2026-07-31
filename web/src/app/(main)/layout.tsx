"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import InstallPrompt from "@/components/InstallPrompt";
import { useAuthState, useAppStore } from "@/store/app-store";
import {
	Inbox,
	Settings,
	FolderOpen,
	History,
	LayoutDashboard,
} from "lucide-react";

interface LayoutProps {
	children: React.ReactNode;
}

export default function MainLayout({ children }: LayoutProps) {
	const pathname = usePathname();
	const { role } = useAuthState();
	const checkAuthSession = useAppStore((s) => s.checkAuth);

	useEffect(() => {
		checkAuthSession();
	}, [checkAuthSession]);

	const mainRef = useRef<HTMLElement>(null);
	useEffect(() => {
		mainRef.current?.scrollTo(0, 0);
	}, [pathname]);

	const isActive = (href: string) => {
		if (href === "/" && pathname === "/") return true;
		if (href !== "/" && pathname?.startsWith(href)) return true;
		return false;
	};

	const navItems = [
		{
			label: "Queue",
			href: "/",
			show: true,
			icon: (active: boolean) => (
				<Inbox
					width={24}
					height={24}
					strokeWidth={active ? 2.5 : 2}
					className={active ? "text-foreground" : "text-content-subtle"}
				/>
			),
		},
		{
			label: "Admin",
			href: "/admin",
			show: role === "admin",
			icon: (active: boolean) => (
				<LayoutDashboard
					width={24}
					height={24}
					strokeWidth={active ? 2.5 : 2}
					className={active ? "text-foreground" : "text-content-subtle"}
				/>
			),
		},
		{
			label: "Files",
			href: "/files",
			show: role === "admin" || role === "premium_member",
			icon: (active: boolean) => (
				<FolderOpen
					width={24}
					height={24}
					strokeWidth={active ? 2.5 : 2}
					className={active ? "text-foreground" : "text-content-subtle"}
				/>
			),
		},
		{
			label: "History",
			href: "/history",
			show: role === "admin" || role === "premium_member",
			icon: (active: boolean) => (
				<History
					width={24}
					height={24}
					strokeWidth={active ? 2.5 : 2}
					className={active ? "text-foreground" : "text-content-subtle"}
				/>
			),
		},
		{
			label: "Settings",
			href: "/settings",
			show: true,
			icon: (active: boolean) => (
				<Settings
					width={24}
					height={24}
					strokeWidth={active ? 2.5 : 2}
					className={active ? "text-foreground" : "text-content-subtle"}
				/>
			),
		},
	];

	const visibleItems = navItems.filter((item) => item.show);

	return (
		<div className="flex flex-col h-[100dvh] bg-background text-foreground">
			<main ref={mainRef} className="flex-1 overflow-y-auto w-full">
				<div className="max-w-screen-md mx-auto px-4 py-6 md:px-8 md:py-8 pb-32">
					{children}
				</div>
			</main>

			<InstallPrompt />

			<nav className="fixed bottom-0 left-0 right-0 z-40 bg-surface/80 backdrop-blur-xl border-t border-border-subtle safe-area-pb">
				<div className="max-w-screen-md mx-auto">
					<ul className="flex justify-around items-center h-20 md:h-24">
						{visibleItems.map((item) => {
							const active = isActive(item.href);
							return (
								<li key={item.href} className="flex-1 h-full relative">
									{active && (
										<div className="absolute top-0 left-0 right-0 h-[3px] bg-accent rounded-b-sm shadow-[0_0_8px_rgba(139,92,246,0.6)]"></div>
									)}
									<Link
										href={item.href}
										className="flex flex-col items-center justify-center h-full w-full active:scale-95 transition-transform duration-200"
									>
										<div className="mb-1">{item.icon(active)}</div>
										<span
											className={`text-[10px] md:text-xs font-medium tracking-wide ${
												active ? "text-foreground" : "text-content-muted"
											}`}
										>
											{item.label}
										</span>
									</Link>
								</li>
							);
						})}
					</ul>
				</div>
			</nav>
		</div>
	);
}
