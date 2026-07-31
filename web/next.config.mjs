import withBundleAnalyzerInit from '@next/bundle-analyzer';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  // Ensure we use SWC for transformations
  experimental: {
    forceSwcTransforms: true,
  },
  // Security: restrict origin access for dev
  allowedDevOrigins: ['localhost'],
};

const withBundleAnalyzer = withBundleAnalyzerInit({
  enabled: process.env.ANALYZE === 'true',
});

export default withBundleAnalyzer(nextConfig);
