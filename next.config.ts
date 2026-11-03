import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Proxy /api/* and /v1/* requests to the backend
  // This keeps credentials same-origin and simplifies CORS
  async rewrites() {
    const backendUrl = process.env.BACKEND_URL || "http://localhost:4000";
    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
