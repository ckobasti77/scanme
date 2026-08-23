import { defineConfig, globalIgnores } from "eslint/config";
import nextPlugin from "@next/eslint-plugin-next";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

const eslintConfig = defineConfig([
  {
    files: ["**/*.{js,jsx,mjs,ts,tsx,mts,cts}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  ...tseslint.configs.recommended,
  nextPlugin.configs["core-web-vitals"],
  reactHooks.configs.flat["recommended-latest"],
  {
    rules: {
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-unused-expressions": "warn",
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "tmp/**",
    "next-env.d.ts",
    "convex/_generated/**",
    // Standalone business-card generators use Node CommonJS and Adobe ExtendScript.
    "scripts/build-business-card-concept.js",
    "scripts/build-business-card-reference-concept.js",
    "scripts/create-scanme-business-card-template.jsx",
  ]),
]);

export default eslintConfig;
