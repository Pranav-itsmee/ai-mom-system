/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  compiler: {
    reactRemoveProperties: false,
  },
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
  async rewrites() {
    const backend = process.env.BACKEND_URL || 'http://localhost:5000';
    return [
      {
        source: '/api/:path*',
        destination: `${backend}/api/:path*`,
      },
      {
        source: '/auth/:path*',
        destination: `${backend}/auth/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
