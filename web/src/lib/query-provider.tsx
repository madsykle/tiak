"use client";

import dynamic from "next/dynamic";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, ReactNode } from "react";

// Only load devtools in development
const ReactQueryDevtools = dynamic(
	() =>
		import("@tanstack/react-query-devtools").then((mod) => mod.ReactQueryDevtools),
	{
		ssr: false,
		loading: () => null,
	},
);

export function QueryProvider({ children }: { children: ReactNode }) {
	const [queryClient] = useState(
		() =>
			new QueryClient({
				defaultOptions: {
					queries: {
						staleTime: 30_000,
						gcTime: 5 * 60 * 1000,
						refetchOnWindowFocus: true,
						refetchOnReconnect: true,
						retry: 1,
						throwOnError: false,
					},
					mutations: {
						retry: 0,
					},
				},
			}),
	);

	return (
		<QueryClientProvider client={queryClient}>
			{children}
			{process.env.NODE_ENV === "development" && (
				<ReactQueryDevtools initialIsOpen={false} />
			)}
		</QueryClientProvider>
	);
}