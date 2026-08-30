// TASK-24 — the discriminator: while a flood hammers the LOAD space, measure
// mutation latency against the untouched QUOTA space. Row-scoped contention
// would leave these cold probes at idle latency (~100-200 ms); a
// deployment-level admission queue delays every mutation equally. Each probe
// reserve is released immediately, so the quota space's state is unchanged.
import { readFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

const seed = JSON.parse(readFileSync("scripts/load/out/seed.json", "utf8"));
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .map((l) => /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(l))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/\s+#.*$/, "").trim()]),
);
const convex = new ConvexHttpClient(env.NEXT_PUBLIC_CONVEX_URL);

const startDelay = Number(process.argv[2] ?? 15000);
const probes = Number(process.argv[3] ?? 10);
// "cold" (default): the untouched quota space. "hot": the LOAD space under
// flood, using spare guests the flood's worker partition never touches — a
// separate process + separate guest, same space/session rows.
const target = process.argv[4] === "hot" ? "hot" : "cold";
const code = target === "hot" ? seed.loadSpaceCode : seed.quotaSpaceCode;
const guestFor = (i) =>
  target === "hot"
    ? seed.guestKeys[195 + (i % 5)]
    : seed.attackGuestKeys[i % 20];
await sleep(startDelay);

for (let i = 0; i < probes; i += 1) {
  const guestKey = guestFor(i);
  const t0 = Date.now();
  try {
    const r = await convex.mutation(anyApi.memories.reserveUpload, {
      code,
      guestKey,
    });
    const reserveMs = Date.now() - t0;
    const t1 = Date.now();
    await convex.mutation(anyApi.memories.releaseReservation, {
      code,
      guestKey,
      photoId: r.photoId,
    });
    console.log(
      `${target}-probe ${i}: reserve=${reserveMs}ms release=${Date.now() - t1}ms`,
    );
  } catch (error) {
    console.log(
      `${target}-probe ${i}: ERR ${Date.now() - t0}ms ${String(error.message ?? error).slice(0, 100)}`,
    );
  }
  const tq = Date.now();
  try {
    await convex.query(anyApi.memoriesWall.wallView, { code });
    console.log(`${target}-query ${i}: ${Date.now() - tq}ms`);
  } catch {
    console.log(`${target}-query ${i}: ERR`);
  }
  await sleep(2000);
}
process.exit(0);
