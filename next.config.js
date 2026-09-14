/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Lets parallel local builds use separate output dirs; production uses the default.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  experimental: {
    instrumentationHook: true,
  },
}

module.exports = nextConfig
