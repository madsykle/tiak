"use client";

import { useState, useCallback } from "react";

type ToastType = "success" | "error" | "info" | "warning";

interface Toast {
	msg: string;
	type: ToastType;
}

export function useToast() {
	const [toast, setToast] = useState<Toast | null>(null);

	const showToast = useCallback((msg: string, type: ToastType = "info") => {
		setToast({ msg, type });
		setTimeout(() => setToast(null), 3000);
	}, []);

	return { toast, showToast };
}

export const toast = {
	success: (msg: string) => console.log("success:", msg),
	error: (msg: string) => console.error("error:", msg),
	info: (msg: string) => console.info("info:", msg),
	warning: (msg: string) => console.warn("warning:", msg),
};
