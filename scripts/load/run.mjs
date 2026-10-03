#!/usr/bin/env node
// =============================================================================
// TASK-24 — the 200-phone load harness. An OPERATOR tool, never part of
// `npm run check`: it drives a REAL Convex deployment over the real network
// and writes real photos into it. See scripts/load/README.md for the runbook
// and docs/perf/memories-load.md for the hypothesis it exists to falsify.
//
// Modes:
//   full   — the realistic night. N virtual guests, sequential per device /
//            concurrent across devices (the production queue shape), burst +
//            heavy-tail arrivals, full reserve → PUT → process protocol with
//            the client contract's retry rules (reserve once, renew on retry,
//            release nothing that committed). Engine `route` drives the real
//            Next.js /m/[code]/process route (sharp included); engine
//            `direct` performs the route's Convex half inline.
//   flood  — the escalation ladder: uploadContext → PUT variants →
//            commitProcessed at a fixed concurrency, pre-encoded variants,
//            no sharp stage — pure commit-path pressure, for when `full`
//            cannot reach enough concurrent commits to test H1 honestly.
//   quota  — the H2 attack: guests on the limit-3 space each fire K parallel
//            reserveUpload calls and drive every won slot to a commit; the
//            verdict is exact-3 per guest, checked against the deployment.
//
// Node ≥ 23 required (native TS type-stripping imports the real guest-cookie
// module — zero drift from the route's HMAC).
// =============================================================================

import { mkdirSync, readFileSync, writeFileSync, existsSync, createWriteStream } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { ConvexHttpClient, ConvexClient } from "convex/browser";
import { anyApi } from "convex/server";
import {
  buildGuestCookieValue,
  guestCookieName,
} from "../../lib/memories-guest-cookie.ts";
import { memoriesSr } from "../../lib/i18n/sr/memories.ts";
import { ensurePhotoPool, ensureFloodKit } from "./payloads.mjs";
import { summarize, buckets, percentiles } from "./stats.mjs";

const api = anyApi;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT_DIR = join(ROOT, "scripts", "load", "out");

// Client-contract constants (lib/memories-client/queue.ts / backend.ts).
const MAX_AUTO_ATTEMPTS = 6;
const BACKOFF_BASE_MS = 1000;
const BACKOFF_CAP_MS = 30_000;
const BACKOFF_JITTER_MS = 250;
const RETRYABLE_HTTP = new Set([408, 409, 425, 429, 500, 502, 503, 504]);
const PROCESS_TIMEOUT_MS = 90_000;
const PUT_TIMEOUT_MS = 120_000;

// -----------------------------------------------------------------------------
// Flags + env
// -----------------------------------------------------------------------------

function parseFlags(argv) {
  const flags = {
    mode: null,
    seedFile: join(OUT_DIR, "seed.json"),
    guests: 200,
    photos: 5,
    burstSec: 120,
    tailSec: 120,
    burstFrac: 0.6,
    engine: "route",
    target: null,
    port: 3100,
    floodTotal: 300,
    floodConcurrency: 24,
    attackGuests: 40,
    attackParallel: 8,
    pool: 24,
    longEdge: 2560,
    label: null,
    wall: true,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    const next = () => argv[++i];
    if (key === "--mode") flags.mode = next();
    else if (key === "--seed-file") flags.seedFile = next();
    else if (key === "--guests") flags.guests = Number(next());
    else if (key === "--photos") flags.photos = Number(next());
    else if (key === "--burst-sec") flags.burstSec = Number(next());
    else if (key === "--tail-sec") flags.tailSec = Number(next());
    else if (key === "--burst-frac") flags.burstFrac = Number(next());
    else if (key === "--engine") flags.engine = next();
    else if (key === "--target") flags.target = next();
    else if (key === "--port") flags.port = Number(next());
    else if (key === "--flood-total") flags.floodTotal = Number(next());
    else if (key === "--flood-concurrency") flags.floodConcurrency = Number(next());
    else if (key === "--attack-guests") flags.attackGuests = Number(next());
    else if (key === "--attack-parallel") flags.attackParallel = Number(next());
    else if (key === "--pool") flags.pool = Number(next());
    else if (key === "--long-edge") flags.longEdge = Number(next());
    else if (key === "--label") flags.label = next();
    else if (key === "--no-wall") flags.wall = false;
    // Multi-process flood: each process takes a disjoint rotated window of the
    // seeded guests so several load generators never share a guest row.
    else if (key === "--guest-offset") flags.guestOffset = Number(next());
    else if (key === "--guest-count") flags.guestCount = Number(next());
    else throw new Error(`unknown flag: ${key}`);
  }
  if (!["full", "flood", "quota"].includes(flags.mode ?? "")) {
    throw new Error("--mode full|flood|quota is required");
  }
  return flags;
}

function loadEnv() {
  const file = join(ROOT, ".env.local");
  if (!existsSync(file)) {
    throw new Error(`.env.local missing at ${file} (copy it from the main checkout)`);
  }
  const env = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    env[match[1]] = match[2].replace(/\s+#.*$/, "").replace(/^"|"$/g, "").trim();
  }
  return env;
}

// -----------------------------------------------------------------------------
// Failure classification — every failure gets a cause, "some failed" is not
// a finding.
// -----------------------------------------------------------------------------

class HttpOutcomeError extends Error {
  constructor(status, code) {
    super(`process_http_${status}${code ? `:${code}` : ""}`);
    this.status = status;
    this.code = code;
  }
}

function classifyError(error) {
  if (error instanceof HttpOutcomeError) {
    if (error.code === "pipeline:blob_missing") {
      return { cls: "pipeline:blob_missing", retryable: true, resetStorage: true };
    }
    const cls = error.code ?? `http_${error.status}`;
    return { cls, retryable: RETRYABLE_HTTP.has(error.status) };
  }
  const data = error?.data;
  const msg = String(error?.message ?? error);
  if (typeof data === "string") {
    if (data === memoriesSr.rateLimited) return { cls: "rate_limited", retryable: true };
    if (data.startsWith("Dostigli ste limit")) {
      return { cls: "quota_refused", retryable: false, expected: true };
    }
    if (data === "pipeline:blob_missing") {
      return { cls: data, retryable: true, resetStorage: true };
    }
    if (data === "pipeline:wrong_state" || data === "pipeline:stale_run") {
      return { cls: data, retryable: true };
    }
    if (data.startsWith("pipeline:")) return { cls: data, retryable: false };
    return { cls: `refusal:${data.slice(0, 48)}`, retryable: false };
  }
  if (msg.startsWith("convex_client_timeout")) {
    // A reserve retry could double-book a quota slot (reserve-once contract),
    // so only the idempotent steps retry through a client-side timeout.
    return { cls: msg, retryable: !msg.endsWith(":reserve") };
  }
  if (/OptimisticConcurrencyControl|changed while this mutation|write conflict|conflicts with concurrent/i.test(msg)) {
    return { cls: "occ_exhausted", retryable: true };
  }
  if (/overloaded|too many requests|429/i.test(msg)) {
    return { cls: "overloaded", retryable: true };
  }
  if (error?.name === "TimeoutError" || error?.name === "AbortError" || /timed? ?out/i.test(msg)) {
    return { cls: "timeout", retryable: true };
  }
  if (/upload_http_(\d+)/.test(msg)) {
    const status = Number(/upload_http_(\d+)/.exec(msg)[1]);
    return { cls: `storage_http_${status}`, retryable: status >= 500 || status === 429 };
  }
  if (/fetch failed|network|ECONN|EAI_AGAIN|socket|other side closed/i.test(msg)) {
    return { cls: "network", retryable: true };
  }
  return { cls: `unknown:${msg.slice(0, 80)}`, retryable: true };
}

function backoffDelay(attempt) {
  const exp = Math.min(BACKOFF_BASE_MS * 2 ** Math.max(0, attempt - 1), BACKOFF_CAP_MS);
  return exp + Math.floor(Math.random() * BACKOFF_JITTER_MS);
}

// -----------------------------------------------------------------------------
// Protocol steps
// -----------------------------------------------------------------------------

// ConvexHttpClient has no per-call timeout, and a silently dead socket (seen
// on Windows with ~50 parallel keep-alive connections) hangs the await
// forever. Race every mutation against a generous deadline — far above the
// worst honest parking latency measured (~11 s at 96-way contention). The
// caller decides retryability: claim/commit are idempotent per photoId so a
// timed-out call is safely retried; a timed-out RESERVE is terminal for the
// harness (retrying could double-book a quota slot — the contract's
// reserve-once rule).
const MUTATION_TIMEOUT_MS = 60_000;
function withDeadline(promise, label) {
  let timer;
  const gate = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`convex_client_timeout:${label}`)),
      MUTATION_TIMEOUT_MS,
    );
  });
  return Promise.race([promise, gate]).finally(() => clearTimeout(timer));
}

// Every protocol mutation goes through here: `skipQueue` because
// ConvexHttpClient SERIALIZES queued mutations per client instance (a 48-way
// "flood" without it is a single-file line — the first ladder in
// docs/perf/memories-load.md measured exactly that artefact), and the
// deadline because a silently dead socket otherwise hangs the await forever.
function mut(ctx, label, fnRef, args) {
  return withDeadline(
    ctx.convex.mutation(fnRef, args, { skipQueue: true }),
    label,
  );
}

async function timed(ctx, step, fn) {
  const start = Date.now();
  try {
    const result = await fn();
    ctx.samples.push({ step, at: start - ctx.t0, ms: Date.now() - start, ok: true });
    return result;
  } catch (error) {
    ctx.samples.push({
      step,
      at: start - ctx.t0,
      ms: Date.now() - start,
      ok: false,
      cls: classifyError(error).cls,
    });
    const cls = classifyError(error).cls;
    ctx.errorLog[cls] ??= [];
    if (ctx.errorLog[cls].length < 5) {
      ctx.errorLog[cls].push(String(error?.message ?? error).slice(0, 300));
    }
    throw error;
  }
}

async function putBlob(url, data, contentType) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": contentType },
    body: data,
    signal: AbortSignal.timeout(PUT_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`upload_http_${response.status}`);
  const body = await response.json();
  if (typeof body.storageId !== "string") throw new Error("upload_bad_response");
  return body.storageId;
}

async function postProcess(ctx, device, item) {
  const response = await fetch(
    `${ctx.target}/m/${encodeURIComponent(device.code)}/process`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: `${guestCookieName(device.code)}=${device.cookie}`,
      },
      body: JSON.stringify({ photoId: item.photoId, storageId: item.storageId }),
      signal: AbortSignal.timeout(PROCESS_TIMEOUT_MS),
    },
  );
  let code;
  try {
    const body = await response.json();
    if (typeof body.code === "string") code = body.code;
  } catch {
    // Non-JSON body: the status is enough.
  }
  if (!response.ok) throw new HttpOutcomeError(response.status, code);
}

// One attempt of the full per-photo protocol. Mirrors the client contract:
// reserve exactly once per photo, renew (never re-reserve) when the upload URL
// is gone, success only on the server's word.
async function attemptPhoto(ctx, device, item, payload) {
  if (!item.photoId) {
    const reservation = await timed(ctx, "reserve", () =>
      mut(ctx, "reserve", api.memories.reserveUpload, {
        code: device.code,
        guestKey: device.guestKey,
      }),
    );
    item.photoId = reservation.photoId;
    item.uploadUrl = reservation.uploadUrl;
  }
  if (!item.storageId) {
    if (!item.uploadUrl) {
      const renewed = await timed(ctx, "renew", () =>
        mut(ctx, "renew", api.memories.renewUploadUrl, {
          code: device.code,
          guestKey: device.guestKey,
          photoId: item.photoId,
        }),
      );
      if (renewed.alreadyReady) {
        ctx.commitAt.set(item.photoId, Date.now());
        return;
      }
      item.uploadUrl = renewed.uploadUrl;
    }
    try {
      item.storageId = await timed(ctx, "put_original", () =>
        putBlob(item.uploadUrl, payload, "image/jpeg"),
      );
    } finally {
      item.uploadUrl = null;
    }
  }

  if (ctx.engine === "route") {
    await timed(ctx, "process", () => postProcess(ctx, device, item));
    ctx.commitAt.set(item.photoId, Date.now());
    return;
  }

  // Engine `direct` — the route's Convex half, inline.
  const context = await timed(ctx, "claim", () =>
    mut(ctx, "claim", api.memoriesPipeline.uploadContext, {
      secret: ctx.pipelineSecret,
      code: device.code,
      guestKey: device.guestKey,
      photoId: item.photoId,
      storageId: item.storageId,
    }),
  );
  if (context.alreadyReady) {
    ctx.commitAt.set(item.photoId, Date.now());
    return;
  }
  const kit = ctx.floodKit;
  const [avifRef, webpRef, thumbRef] = await timed(ctx, "put_variants", () =>
    Promise.all([
      putBlob(context.uploads.avif, kit.variants.avif.data, kit.variants.avif.contentType),
      putBlob(context.uploads.webp, kit.variants.webp.data, kit.variants.webp.contentType),
      putBlob(context.uploads.thumb, kit.variants.thumb.data, kit.variants.thumb.contentType),
    ]),
  );
  await timed(ctx, "commit", () =>
    mut(ctx, "commit", api.memoriesPipeline.commitProcessed, {
      secret: ctx.pipelineSecret,
      photoId: item.photoId,
      originalStorageId: item.storageId,
      variants: {
        avif: { ref: avifRef, width: kit.variants.avif.width, height: kit.variants.avif.height },
        webp: { ref: webpRef, width: kit.variants.webp.width, height: kit.variants.webp.height },
        thumb: { ref: thumbRef, width: kit.variants.thumb.width, height: kit.variants.thumb.height },
      },
    }),
  );
  ctx.commitAt.set(item.photoId, Date.now());
}

// Drive one photo to `ready` or a definitive failure, with the client's retry
// budget. Returns a classified outcome; every path is counted.
async function uploadOnePhoto(ctx, device, payload) {
  const item = { photoId: null, uploadUrl: null, storageId: null, attempt: 0 };
  for (;;) {
    try {
      await attemptPhoto(ctx, device, item, payload);
      ctx.committed += 1;
      return { ok: true, photoId: item.photoId };
    } catch (error) {
      const verdict = classifyError(error);
      if (!verdict.retryable) {
        ctx.failed += 1;
        return { ok: false, cls: verdict.cls, expected: verdict.expected === true };
      }
      if (verdict.resetStorage) item.storageId = null;
      item.attempt += 1;
      if (item.attempt >= MAX_AUTO_ATTEMPTS) {
        ctx.failed += 1;
        return { ok: false, cls: `exhausted:${verdict.cls}` };
      }
      await sleep(backoffDelay(item.attempt));
    }
  }
}

// -----------------------------------------------------------------------------
// The wall — subscribed for the whole run; part of the load, not an observer.
// -----------------------------------------------------------------------------

function startWall(ctx, code) {
  const client = new ConvexClient(ctx.convexUrl);
  const seen = new Set();
  const stats = {
    updates: 0,
    lagsMs: [],
    maxGapMs: 0,
    blankEvents: 0,
    lastCount: 0,
    lastPhotosLen: 0,
    timeline: [],
  };
  let lastUpdateAt = null;
  const unsubscribe = client.onUpdate(
    api.memoriesWall.wallFeed,
    { code },
    (feed) => {
      const now = Date.now();
      if (lastUpdateAt !== null) {
        stats.maxGapMs = Math.max(stats.maxGapMs, now - lastUpdateAt);
      }
      lastUpdateAt = now;
      stats.updates += 1;
      stats.lastCount = feed.count;
      stats.lastPhotosLen = feed.photos.length;
      if (feed.photos.length === 0 && feed.count > 0) stats.blankEvents += 1;
      stats.timeline.push({ at: now - ctx.t0, count: feed.count, window: feed.photos.length });
      for (const photo of feed.photos) {
        if (seen.has(photo.photoId)) continue;
        seen.add(photo.photoId);
        const committedAt = ctx.commitAt.get(photo.photoId);
        if (committedAt !== undefined) stats.lagsMs.push(now - committedAt);
      }
    },
    (error) => {
      stats.timeline.push({ at: Date.now() - ctx.t0, error: String(error).slice(0, 120) });
    },
  );
  return {
    stats,
    stop: async () => {
      unsubscribe();
      await client.close();
    },
  };
}

// -----------------------------------------------------------------------------
// The Next server (engine `route`): spawned as a child so the harness owns its
// lifetime and its stdout (the route logs per-photo transform timings).
// -----------------------------------------------------------------------------

async function startNextServer(ctx, port) {
  if (!existsSync(join(ROOT, ".next", "BUILD_ID"))) {
    throw new Error("no production build — run `npm run build` first");
  }
  const logFile = join(OUT_DIR, `next-${ctx.stamp}.log`);
  const log = createWriteStream(logFile);
  const child = spawn(
    process.execPath,
    [join(ROOT, "node_modules", "next", "dist", "bin", "next"), "start", "-p", String(port)],
    { cwd: ROOT, env: process.env, stdio: ["ignore", "pipe", "pipe"] },
  );
  const transform = [];
  const onLine = (chunk) => {
    const text = chunk.toString();
    log.write(text);
    for (const line of text.split("\n")) {
      const idx = line.indexOf('{"route":"m/process"');
      if (idx === -1) continue;
      try {
        transform.push(JSON.parse(line.slice(idx)));
      } catch {
        // partial line across chunks — the log file keeps the raw text.
      }
    }
  };
  child.stdout.on("data", onLine);
  child.stderr.on("data", onLine);

  const deadline = Date.now() + 90_000;
  for (;;) {
    try {
      await fetch(`http://127.0.0.1:${port}/m/probe`, { signal: AbortSignal.timeout(2000) });
      break;
    } catch {
      if (Date.now() > deadline) {
        child.kill();
        throw new Error(`next start did not come up on :${port} (see ${logFile})`);
      }
      await sleep(500);
    }
  }
  return {
    transform,
    logFile,
    stop: () => {
      child.kill();
    },
  };
}

// -----------------------------------------------------------------------------
// Arrival model — burst plus heavy tail; uniform arrivals are the one
// distribution that will not find the bug.
// -----------------------------------------------------------------------------

function arrivalOffsets(count, burstFrac, burstMs, tailMs) {
  const offsets = [];
  const burstCount = Math.round(count * burstFrac);
  for (let i = 0; i < count; i += 1) {
    if (i < burstCount) {
      offsets.push(Math.random() * burstMs);
    } else {
      // Exponential tail (mean tailMs/2) starting where the burst ends.
      const exp = -Math.log(1 - Math.random()) * (tailMs / 2);
      offsets.push(burstMs + Math.min(exp, tailMs * 2));
    }
  }
  // Shuffle so device index and arrival are uncorrelated.
  for (let i = offsets.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [offsets[i], offsets[j]] = [offsets[j], offsets[i]];
  }
  return offsets;
}

// -----------------------------------------------------------------------------
// Modes
// -----------------------------------------------------------------------------

function makeDevices(ctx, code, guestKeys, count) {
  return guestKeys.slice(0, count).map((guestKey) => ({
    code,
    guestKey,
    cookie: buildGuestCookieValue(guestKey, code, ctx.guestSecret),
  }));
}

async function runFull(ctx, flags, seed) {
  const devices = makeDevices(ctx, seed.loadSpaceCode, seed.guestKeys, flags.guests);
  if (devices.length < flags.guests) {
    throw new Error(`seed has ${devices.length} guests; re-run seed with more`);
  }
  const offsets = arrivalOffsets(
    devices.length,
    flags.burstFrac,
    flags.burstSec * 1000,
    flags.tailSec * 1000,
  );
  const pool = await ensurePhotoPool(join(OUT_DIR, "payloads"), {
    count: flags.pool,
    longEdge: flags.longEdge,
  });
  console.log(
    `payload pool: ${pool.length} JPEGs, ${Math.round(pool.reduce((a, b) => a + b.length, 0) / pool.length / 1024)} KB avg`,
  );
  const outcomes = [];
  await Promise.all(
    devices.map(async (device, index) => {
      await sleep(offsets[index]);
      for (let p = 0; p < flags.photos; p += 1) {
        const payload = pool[(index * flags.photos + p) % pool.length];
        outcomes.push(await uploadOnePhoto(ctx, device, payload));
      }
    }),
  );
  return { attempted: devices.length * flags.photos, outcomes };
}

async function runFlood(ctx, flags, seed) {
  const offset = flags.guestOffset ?? 0;
  const rotated = [...seed.guestKeys.slice(offset), ...seed.guestKeys.slice(0, offset)];
  const keys = rotated.slice(0, flags.guestCount ?? rotated.length);
  const devices = makeDevices(ctx, seed.loadSpaceCode, keys, keys.length);
  const outcomes = [];
  let nextIndex = 0;
  await Promise.all(
    Array.from({ length: flags.floodConcurrency }, async (_, worker) => {
      for (let step = 0; ; step += 1) {
        const i = nextIndex;
        nextIndex += 1;
        if (i >= flags.floodTotal) return;
        // Each worker walks its own DISJOINT guest partition so no two
        // in-flight photos share a guest row — the measured contention is the
        // session/space rollup, never an artefact of two workers patching one
        // guest. (Requires guests ≥ concurrency.)
        const slice = Math.max(1, Math.floor(devices.length / flags.floodConcurrency));
        const device = devices[(worker * slice + (step % slice)) % devices.length];
        outcomes.push(await uploadOnePhoto(ctx, device, ctx.floodKit.original));
      }
    }),
  );
  return { attempted: flags.floodTotal, outcomes };
}

async function runQuota(ctx, flags, seed) {
  const devices = makeDevices(
    ctx,
    seed.quotaSpaceCode,
    seed.attackGuestKeys,
    flags.attackGuests,
  );
  const perGuest = [];
  await Promise.all(
    devices.map(async (device) => {
      await sleep(Math.random() * 2000);
      const attempts = await Promise.all(
        Array.from({ length: flags.attackParallel }, () =>
          uploadOnePhoto(ctx, device, ctx.floodKit.original),
        ),
      );
      perGuest.push({
        guest: device.guestKey.slice(0, 8),
        committed: attempts.filter((a) => a.ok).length,
        quotaRefused: attempts.filter((a) => a.cls === "quota_refused").length,
        otherFailed: attempts.filter((a) => !a.ok && a.cls !== "quota_refused").length,
      });
    }),
  );
  return { attempted: devices.length * flags.attackParallel, perGuest };
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

async function main() {
  const flags = parseFlags(process.argv);
  const env = loadEnv();
  const convexUrl = env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) throw new Error("NEXT_PUBLIC_CONVEX_URL missing from .env.local");
  if (!existsSync(flags.seedFile)) {
    throw new Error(
      `seed file missing: ${flags.seedFile}\n  npx convex run memoriesLoadSeed:seed '{}' > "${flags.seedFile}"`,
    );
  }
  const seed = JSON.parse(readFileSync(flags.seedFile, "utf8"));
  mkdirSync(OUT_DIR, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const ctx = {
    stamp,
    convexUrl,
    convex: new ConvexHttpClient(convexUrl),
    guestSecret: env.SCANME_GUEST_SECRET,
    pipelineSecret: env.SCANME_PIPELINE_SECRET,
    engine: flags.mode === "full" ? flags.engine : "direct",
    target: flags.target ?? `http://127.0.0.1:${flags.port}`,
    t0: Date.now(),
    samples: [],
    errorLog: {},
    commitAt: new Map(),
    committed: 0,
    failed: 0,
    floodKit: null,
  };
  if (!ctx.guestSecret || !ctx.pipelineSecret) {
    throw new Error("SCANME_GUEST_SECRET / SCANME_PIPELINE_SECRET missing from .env.local");
  }
  if (ctx.engine === "direct" || flags.mode !== "full") {
    ctx.floodKit = await ensureFloodKit(join(OUT_DIR, "payloads"));
  }

  let nextServer = null;
  if (flags.mode === "full" && ctx.engine === "route" && !flags.target) {
    console.log(`starting next on :${flags.port} …`);
    nextServer = await startNextServer(ctx, flags.port);
  }

  const wallCode =
    flags.mode === "quota" ? seed.quotaSpaceCode : seed.loadSpaceCode;
  const wall = flags.wall ? startWall(ctx, wallCode) : null;

  const progress = setInterval(() => {
    const elapsed = Math.round((Date.now() - ctx.t0) / 1000);
    console.log(
      `[${elapsed}s] committed=${ctx.committed} failed=${ctx.failed} wall=${wall ? `${wall.stats.updates}u/${wall.stats.lastCount}c` : "off"}`,
    );
  }, 5000);

  console.log(
    `mode=${flags.mode} engine=${ctx.engine} deployment=${env.CONVEX_DEPLOYMENT ?? convexUrl}`,
  );
  ctx.t0 = Date.now();
  let result;
  try {
    if (flags.mode === "full") result = await runFull(ctx, flags, seed);
    else if (flags.mode === "flood") result = await runFlood(ctx, flags, seed);
    else result = await runQuota(ctx, flags, seed);
  } finally {
    clearInterval(progress);
    // Leave the wall subscribed briefly so trailing reactive updates land.
    if (wall) await sleep(3000);
    if (wall) await wall.stop();
    if (nextServer) nextServer.stop();
  }
  const wallStats = wall
    ? {
        updates: wall.stats.updates,
        lag: percentiles(wall.stats.lagsMs),
        maxGapMs: wall.stats.maxGapMs,
        blankEvents: wall.stats.blankEvents,
        finalCount: wall.stats.lastCount,
        finalWindow: wall.stats.lastPhotosLen,
      }
    : null;

  const commitStep = ctx.engine === "route" ? "process" : "commit";
  const report = {
    config: { ...flags, deployment: env.CONVEX_DEPLOYMENT ?? convexUrl, engine: ctx.engine },
    startedAt: new Date(ctx.t0).toISOString(),
    durationSec: Math.round((Date.now() - ctx.t0) / 1000),
    attempted: result.attempted,
    committed: ctx.committed,
    failed: ctx.failed,
    steps: summarize(ctx.samples),
    commitCurve: buckets(ctx.samples, commitStep),
    wall: wallStats,
    perGuest: result.perGuest ?? undefined,
    transform: nextServer
      ? {
          count: nextServer.transform.length,
          prepareMs: percentiles(nextServer.transform.map((t) => t.prepareMs)),
          avifMs: percentiles(nextServer.transform.map((t) => t.avifMs)),
          webpMs: percentiles(nextServer.transform.map((t) => t.webpMs)),
          avgAvifKb: nextServer.transform.length
            ? Math.round(
                nextServer.transform.reduce((a, t) => a + t.avifBytes, 0) /
                  nextServer.transform.length /
                  1024,
              )
            : null,
        }
      : undefined,
    errorSamples: ctx.errorLog,
  };

  const outFile = join(
    OUT_DIR,
    `${stamp}-${flags.mode}${flags.label ? `-${flags.label}` : ""}.json`,
  );
  writeFileSync(outFile, JSON.stringify(report, null, 2));
  console.log("\n=== RESULT ===");
  console.log(JSON.stringify({ ...report, wall: wallStats, errorSamples: undefined }, null, 2));
  console.log(`\nwritten: ${outFile}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
