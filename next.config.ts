import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Venue gallery/program/performer images live in Convex file storage and
    // are served from the deployment's *.convex.cloud origin (TASK-09).
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.convex.cloud",
        pathname: "/api/storage/**",
      },
    ],
  },
};

export default nextConfig;
