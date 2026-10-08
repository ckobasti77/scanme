#!/usr/bin/env node
// Runs one convex/fairSetup.ts internal function with a JSON payload read from
// a file (docs/events/sajam-automobila-2026/RUNBOOK-EVENT-SETUP.md).
// `npx convex run` has no --file option and the B1 payload is too long for
// cmd.exe (8191 chars) and gets mangled by PowerShell quoting, so the Convex
// CLI is spawned directly with an argument array (no shell).
//
//   node scripts/events/fair-setup-run.mjs <function> [--payload <file.json>] [--actor <email>] [--event <code>] [--prod]

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const MAX_ARG_LENGTH = 30_000; // Windows CreateProcess limit is 32 767.
const FUNCTIONS = new Set(["bootstrapEvent", "importDryRun", "importCommit", "publishEventModels"]);

const argv = process.argv.slice(2);
const fn = argv.shift();
if (!fn || !FUNCTIONS.has(fn)) {
  console.error(`Usage: fair-setup-run.mjs <${[...FUNCTIONS].join("|")}> [--payload file] [--actor email] [--event code] [--prod]`);
  process.exit(2);
}
const args = {};
let prod = false;
while (argv.length) {
  const flag = argv.shift();
  if (flag === "--prod") prod = true;
  else if (flag === "--payload") args.payload = JSON.parse(readFileSync(argv.shift(), "utf8"));
  else if (flag === "--actor") args.actorEmail = argv.shift();
  else if (flag === "--event") args.eventCode = argv.shift();
  else {
    console.error(`Unknown option ${flag}`);
    process.exit(2);
  }
}

const json = JSON.stringify(args);
if (json.length > MAX_ARG_LENGTH) {
  console.error(`Arguments are ${json.length} chars (max ${MAX_ARG_LENGTH}); split the payload.`);
  process.exit(2);
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const cli = path.join(root, "node_modules", "convex", "bin", "main.js");
const result = spawnSync(process.execPath, [cli, "run", `fairSetup:${fn}`, json, ...(prod ? ["--prod"] : [])], { cwd: root, stdio: "inherit" });
process.exit(result.status ?? 1);
