// CI namespace gate from RFC-001 §2.11: the two products' CSS custom-property
// namespaces must never cross. Fails if `--links-` appears anywhere under
// components/venue/**, or `--venue-` anywhere under components/scanme-links/**.
// A missing directory is a pass (components/venue does not exist yet).

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const CHECKS = [
  { dir: "components/venue", forbidden: "--links-" },
  { dir: "components/scanme-links", forbidden: "--venue-" },
];

async function collectFiles(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return null; // Directory does not exist — that is a pass, not an error.
  }
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...((await collectFiles(full)) ?? []));
    } else {
      files.push(full);
    }
  }
  return files;
}

const violations = [];
for (const { dir, forbidden } of CHECKS) {
  const files = await collectFiles(path.join(ROOT, dir));
  if (files === null) {
    console.log(`harness:namespace ${dir}: directory absent, skipped`);
    continue;
  }
  for (const file of files) {
    const content = await readFile(file, "utf8");
    if (!content.includes(forbidden)) continue;
    content.split("\n").forEach((line, index) => {
      if (line.includes(forbidden)) {
        violations.push(
          `${path.relative(ROOT, file)}:${index + 1} contains "${forbidden}": ${line.trim()}`,
        );
      }
    });
  }
  console.log(
    `harness:namespace ${dir}: ${files.length} file(s) scanned for "${forbidden}"`,
  );
}

if (violations.length > 0) {
  console.error(`harness:namespace FAILED — ${violations.length} violation(s):`);
  for (const violation of violations) console.error("  " + violation);
  process.exit(1);
}
console.log("harness:namespace passed — no cross-namespace tokens found");
