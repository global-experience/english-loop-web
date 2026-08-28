import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vercel supplies its own Next.js build adapter. Next.js 16.3 currently
  // conflicts with that adapter when standalone output is enabled, while the
  // Docker image still needs standalone output.
  output: process.env.VERCEL ? undefined : "standalone",
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "microphone=(self), geolocation=()" },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
  async rewrites() {
    const apiOrigin = process.env.API_PROXY_ORIGIN?.replace(/\/$/, "");
    if (!apiOrigin) return [];
    return [{ source: "/backend/:path*", destination: `${apiOrigin}/:path*` }];
  },
};

export default nextConfig;
