"use client";

import { useEffect, useState } from "react";
import Logo from "@/components/Logo";

export default function SplashScreen() {
	const [exiting, setExiting] = useState(false);
	const [visible, setVisible] = useState(true);

	useEffect(() => {
		const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		const exitDelay = reducedMotion ? 0 : 850;
		const removeDelay = reducedMotion ? 80 : 1_200;
		const exitTimer = window.setTimeout(() => setExiting(true), exitDelay);
		const removeTimer = window.setTimeout(() => setVisible(false), removeDelay);

		return () => {
			window.clearTimeout(exitTimer);
			window.clearTimeout(removeTimer);
		};
	}, []);

	if (!visible) return null;

	return (
		<div
			className={`tiak-splash ${exiting ? "tiak-splash-exit" : ""}`}
			role="status"
			aria-label="Loading Tiak"
		>
			<div className="tiak-splash-grid" aria-hidden="true" />
			<div className="tiak-splash-content">
				<div className="tiak-splash-mark">
					<Logo className="size-24 text-accent sm:size-28" />
				</div>
				<div className="tiak-splash-wordmark">Tiak</div>
				<p className="tiak-splash-caption">Your media desk</p>
			</div>
			<div className="tiak-splash-progress" aria-hidden="true">
				<span />
			</div>
		</div>
	);
}
