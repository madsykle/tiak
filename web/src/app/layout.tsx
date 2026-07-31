import type { Metadata } from "next";
import "@/styles/globals.css";
import localFont from "next/font/local";
import { QueryProvider } from "@/lib/query-provider";
import SWRegistration from "@/components/SWRegistration";

const geistSans = localFont({
	src: "./fonts/GeistVF.woff",
	variable: "--font-geist-sans",
	weight: "100 900",
});

const geistMono = localFont({
	src: "./fonts/GeistMonoVF.woff",
	variable: "--font-geist-mono",
	weight: "100 900",
});

export const metadata: Metadata = {
	title: "Tiak - Media Downloader",
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
					{children}
				</QueryProvider>
			</body>
		</html>
	);
}
