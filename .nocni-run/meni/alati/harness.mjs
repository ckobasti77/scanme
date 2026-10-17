// Gate "harness" for the MENI night run: runs `node harness/run.mjs check`
// (same as `npm run harness:check`) and retries ONLY the known start-up flake:
// under load right after `next build`, the harness dev server sometimes answers
// /dev/template-gallery?harness=1 (and even /) with 404 before its routes are
// registered, and the harness then times out waiting for [data-case-id]
// (seen in K04 and K06; a plain rerun passed every time).
// A golden mismatch or any other failure is reported at once, without retry.
import { spawnSync } from "node:child_process";

const FLAKE = /waiting for locator\('\[data-case-id\]'\)|Dev server did not answer/;
const WAITS_S = [0, 45, 90];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let last = { code: 1, out: "" };
for (let i = 0; i < WAITS_S.length; i++) {
  if (WAITS_S[i] > 0) {
    console.log(`[harness] attempt ${i + 1}/${WAITS_S.length} in ${WAITS_S[i]} s (dev server start-up flake, not a golden mismatch)`);
    await sleep(WAITS_S[i] * 1000);
  }
  const r = spawnSync(process.execPath, ["harness/run.mjs", "check"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  last = { code: r.status ?? 1, out: (r.stdout || "") + (r.stderr || "") };
  if (last.code === 0) {
    process.stdout.write(last.out);
    if (i > 0) console.log(`[harness] passed on attempt ${i + 1}`);
    process.exit(0);
  }
  if (!FLAKE.test(last.out)) break;
  console.log(`[harness] attempt ${i + 1} hit the start-up flake`);
}
process.stdout.write(last.out);
process.exit(last.code || 1);
