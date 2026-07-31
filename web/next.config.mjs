import withBundleAnalyzerInit from "@next/bundle-analyzer";

/** @type {import('next').NextConfig} */
const nextConfig = {
	reactStrictMode: true,
	output: "standalone",
	experimental: {
		forceSwcTransforms: true,
	},
	allowedDevOrigins: ["localhost"],
	images: {
		remotePatterns: [
			{
				protocol: "https",
				hostname: "**",
			},
			{
				protocol: "http",
				hostname: "**",
			},
		],
		formats: ["image/avif", "image/webp"],
	},
};

const withBundleAnalyzer = withBundleAnalyzerInit({
	enabled: process.env.ANALYZE === "true",
});

export default withBundleAnalyzer(nextConfig);
