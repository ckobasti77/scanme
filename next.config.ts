import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";

function localDevelopmentOrigins() {
  const addresses = Object.values(networkInterfaces())
    .flatMap((entries) => entries ?? [])
    .filter((entry) => entry.family === "IPv4" && !entry.internal)
    .map((entry) => entry.address);

  return ["127.0.0.1", ...new Set(addresses)];
}

const nextConfig: NextConfig = {
  // Permit this computer's own LAN addresses in development so a phone can
  // load the client bundle and hydrate the interactive fair controls.
  allowedDevOrigins: localDevelopmentOrigins(),
  images: {
    // Venue gallery/program/performer images live in Convex file storage and
    // are served from the deployment's *.convex.cloud origin (TASK-09).
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.convex.cloud",
        pathname: "/api/storage/**",
      },
      // Fair model photos are stored as https://scanme.rs/fair/... ; the UI
      // renders them from the local public/fair/ path (fairLocalPhotoUrl), this
      // is only the fallback for a URL that reaches next/image unchanged.
      {
        protocol: "https",
        hostname: "scanme.rs",
        pathname: "/fair/**",
      },
    ],
  },
};

export default nextConfig;
