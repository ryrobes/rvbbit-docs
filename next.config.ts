import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: ["127.0.0.1"],
  async redirects() {
    // Short tweet/print-friendly aliases → real docs pages.
    return [
      { source: "/quickstart", destination: "/docs/quickstart", permanent: true },
      { source: "/existing-postgres", destination: "/docs/existing-postgres", permanent: true },
      { source: "/free", destination: "/buy/clover-free", permanent: true },
      { source: "/what-is-semantic-sql", destination: "/semantic-sql", permanent: true }
    ];
  },
  async headers() {
    return [
      {
        source: "/alice/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable"
          }
        ]
      }
    ];
  },
  turbopack: {
    root: process.cwd()
  }
};

export default nextConfig;
