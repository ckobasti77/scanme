import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Standalone business-card generators use Node CommonJS and Adobe ExtendScript.
    "scripts/build-business-card-concept.js",
    "scripts/build-business-card-reference-concept.js",
    "scripts/create-scanme-business-card-template.jsx",
  ]),
]);

export default eslintConfig;
