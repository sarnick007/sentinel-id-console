/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Content-Security-Policy-Report-Only', value: "default-src 'self'; img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com; connect-src 'self' https:; frame-ancestors 'self'; base-uri 'self'; form-action 'self'; object-src 'none'" },
]

const nextConfig = {
  typescript: {
    ignoreBuildErrors: false,
  },
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }]
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
