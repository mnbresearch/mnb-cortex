/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
];
const nextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  images: {
    // hostname "**" made /_next/image an OPEN PROXY: anyone could pass any
    // https URL and have this domain fetch, transform and serve it. On Hobby
    // that is a 1000-transformation monthly quota a stranger can exhaust in
    // minutes, after which images degrade site-wide — and it lends the domain
    // to serving arbitrary third-party content. Only hosts actually used.
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "*.googleusercontent.com" },
      { protocol: "https", hostname: "cortex.mnbresearch.com" },
      { protocol: "https", hostname: "mnbresearch.com" },
      { protocol: "https", hostname: "*.mnbresearch.com" },
    ],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};
export default nextConfig;
