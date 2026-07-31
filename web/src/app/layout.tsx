import type { Metadata } from "next";
import "@/styles/globals.css";
import localFont from "next/font/local";
import { QueryProvider } from "@/lib/query-provider";
import Layout from "@/components/Layout";
import SWRegistration from "@/components/SWRegistration";

const geistSans = localFont({
	src: "../pages/fonts/GeistVF.woff",
	variable: "--font-geist-sans",
	weight: "100 900",
});

const geistMono = localFont({
	src: "../pages/fonts/GeistMonoVF.woff",
	variable: "--font-geist-mono",
	weight: "100 900",
});

export const metadata: Metadata = {
	title: "Tiak Downloader",
	description:
		"Download and manage media from TikTok, Instagram, YouTube and more",
};

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<html
			lang="en"
			className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}
		>
			<body className="bg-background text-foreground">
				<QueryProvider>
					<SWRegistration />
					<Layout>{children}</Layout>
				</QueryProvider>
			</body>
		</html>
	);
}
