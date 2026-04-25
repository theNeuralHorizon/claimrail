/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Don't advertise the framework version — middleware can't strip this
  // because Next re-adds it after middleware runs.
  poweredByHeader: false,
  experimental: {
    serverComponentsExternalPackages: ['postgres', '@electric-sql/pglite'],
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
};

export default nextConfig;
