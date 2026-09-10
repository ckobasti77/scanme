// Regenerate lib/pricing/golden.json from lib/pricing/constants.ts
// (RFC-002 §2.1, TASK-01). Mirrors `harness/run.mjs capture`: the checker and
// the capturer are the same code, so a regenerated table is by construction the
// table the check expects.
//
//   npm run pricing:golden
//
// It runs the golden test with UPDATE_PRICING_GOLDEN=1, which makes the test
// write the file before asserting against it. A cross-platform env var without
// adding a dependency — npm scripts cannot set one portably.

import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const vitestBin = path.join(ROOT, "node_modules", "vitest", "vitest.mjs");

const child = spawn(process.execPath, [vitestBin, "run", "lib/pricing/golden.test.ts"], {
  cwd: ROOT,
  stdio: "inherit",
  env: { ...process.env, UPDATE_PRICING_GOLDEN: "1" },
});

child.on("exit", (code) => {
  process.exit(code ?? 1);
});
