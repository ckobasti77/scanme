import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      // next/image and next/link read browser/Next globals at module scope
      // that the edge-runtime test environment lacks; the render smoke only
      // needs their markup shape.
      "next/image": path.resolve(__dirname, "harness/vitest-stubs/next-image.tsx"),
      "next/link": path.resolve(__dirname, "harness/vitest-stubs/next-link.tsx"),
      "@": path.resolve(__dirname),
    },
  },
  test: {
    environment: "edge-runtime",
    include: [
      "convex/**/*.test.ts",
      "lib/**/*.test.ts",
      "components/venue/**/*.test.tsx",
    ],
  },
});
