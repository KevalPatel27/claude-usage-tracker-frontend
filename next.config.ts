import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Same-origin API proxy; health must target the backend /health route.
  // This keeps credentials same-origin and simplifies CORS
  async rewrites() {
    const backendUrl = process.env.BACKEND_URL || "http://localhost:4000";
    return [
      { source: "/api/backend-health", destination: `${backendUrl}/health` },
      {
        source: "/api/:path*",
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
