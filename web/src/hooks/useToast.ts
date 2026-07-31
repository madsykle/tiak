"use client";

import { useState, useCallback } from "react";

type ToastType = "success" | "error" | "info" | "warning";

interface ToastState {
	msg: string;
	type: ToastType;
}

export function useToast() {
	const [toast, setToast] = useState<ToastState | null>(null);

	const showToast = useCallback((msg: string, type: ToastType = "info") => {
		setToast({ msg, type });
		setTimeout(() => setToast(null), 3000);
	}, []);

	return { toast, showToast };
}
