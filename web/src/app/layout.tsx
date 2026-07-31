import type { Metadata, Viewport } from "next";
import "@/styles/globals.css";
import localFont from "next/font/local";
import { QueryProvider } from "@/lib/query-provider";
import SWRegistration from "@/components/SWRegistration";
import SplashScreen from "@/components/SplashScreen";

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
		applicationName: "Tiak",
		manifest: "/manifest.json",
		appleWebApp: {
			capable: true,
			statusBarStyle: "black-translucent",
			title: "Tiak",
		},
		icons: {
			icon: [
				{ url: "/favicon.ico", type: "image/x-icon" },
				{ url: "/icons/tiak-mark.svg", type: "image/svg+xml" },
			],
			apple: "/icons/icon-180x180.png",
		},
};

export const viewport: Viewport = {
	colorScheme: "dark",
	themeColor: "#0b0e12",
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
					<SplashScreen />
					<SWRegistration />
					{children}
				</QueryProvider>
			</body>
		</html>
	);
}
