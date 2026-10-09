import "server-only";
import { fetchQuery } from "convex/nextjs";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import { FAIR_HEAT_REFRESH_MS } from "@/lib/fair-heat";
import { fairMapEventSlugCandidates } from "@/lib/fair-map";
import { fairGatewaySecret, fairVisitorEnv } from "./visitor";

// SAJAM SUPER Korak 3 — GET /api/fair/heat/[eventSlug]: the heat levels of the
// public map. One Convex read a minute per event however many visitors look:
// the CDN keeps the answer 60 s (`s-maxage=60`, then serves it stale while one
// request refreshes it), and this server instance keeps it as long too, so a
// burst that reaches the function before the CDN has a copy still makes one call.

type GetMapHeat = typeof api.fairHeat.getMapHeat;
export type FairHeatPayload = NonNullable<FunctionReturnType<GetMapHeat>>;

export type FairHeatBackend = {
  getMapHeat(args: FunctionArgs<GetMapHeat>): Promise<FunctionReturnType<GetMapHeat>>;
};

export type FairHeatDeps = {
  now?: number;
  backend?: FairHeatBackend;
  gatewaySecret?: string | null;
  devTestFallback?: boolean;
};

const CACHE_CONTROL = `public, s-maxage=${FAIR_HEAT_REFRESH_MS / 1000}, stale-while-revalidate=300`;
const NO_STORE = "no-store";
const SLUG_PATTERN = /^[a-z0-9-]{1,120}$/;

const memo = new Map<string, { at: number; value: Promise<FairHeatPayload | null> }>();

/** Test hook: forget the cached answers. */
export function resetFairHeatMemo() {
  memo.clear();
}

async function readHeat(slug: string, now: number, backend: FairHeatBackend, gatewaySecret: string, devTestFallback: boolean) {
  for (const candidate of fairMapEventSlugCandidates(slug, devTestFallback)) {
    const value = await backend.getMapHeat({ gatewaySecret, eventSlug: candidate, at: now });
    if (value) return value;
  }
  return null;
}

function heatJson(body: unknown, status: number, cacheControl: string) {
  return Response.json(body, { status, headers: { "Cache-Control": cacheControl } });
}

export async function handleFairHeat(eventSlug: string, deps: FairHeatDeps = {}): Promise<Response> {
  if (!SLUG_PATTERN.test(eventSlug)) return heatJson({ ok: false, code: "INVALID_INPUT" }, 400, NO_STORE);
  const gatewaySecret = deps.gatewaySecret === undefined ? fairGatewaySecret(fairVisitorEnv()) : deps.gatewaySecret;
  if (!gatewaySecret) return heatJson({ ok: false, code: "SERVICE_UNAVAILABLE" }, 503, NO_STORE);
  const now = deps.now ?? Date.now();
  const backend = deps.backend ?? { getMapHeat: (args) => fetchQuery(api.fairHeat.getMapHeat, args) };
  const devTestFallback = deps.devTestFallback ?? process.env.NODE_ENV === "development";

  let entry = memo.get(eventSlug);
  if (!entry || now - entry.at >= FAIR_HEAT_REFRESH_MS) {
    entry = { at: now, value: readHeat(eventSlug, now, backend, gatewaySecret, devTestFallback) };
    memo.set(eventSlug, entry);
  }
  try {
    const value = await entry.value;
    if (!value) return heatJson({ ok: false, code: "FAIR_EVENT_NOT_FOUND" }, 404, NO_STORE);
    return heatJson({ ok: true, value }, 200, CACHE_CONTROL);
  } catch {
    // A failed read is not kept: the next request tries again.
    if (memo.get(eventSlug) === entry) memo.delete(eventSlug);
    return heatJson({ ok: false, code: "SERVICE_UNAVAILABLE" }, 503, NO_STORE);
  }
}
