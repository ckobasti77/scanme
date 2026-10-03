import "server-only";

import { ConvexHttpClient } from "convex/browser";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { FairErrorCode, FairSponsoredActionKind } from "@/lib/fair-contract";
import { fairGatewayError, fairGatewayJson, fairGatewayRequest } from "./gateway";
import { fairErrorCodeOf } from "./interactions";
import { fairVisitorForRequest, type FairVisitorEnv } from "./visitor";

// =============================================================================
// Sajam automobila 2026 — B5 garage sponsored action gateway,
// POST /api/fair/sponsored-action (BACKEND-HANDOFF §4.2, §5.7, §7;
// JOVAN-DELTA §2). Same contract as the B3/B4 gateways:
//   1. same-origin + bounded JSON body (lib/fair-server/gateway.ts);
//   2. strict body — only `garage` and `open_model | garage_add`; unknown keys
//      (a `visitorHash` too) are refused. The map and displays have no write;
//   3. visitor = HMAC of the HttpOnly cookie; one call to
//      fairInteractions.recordSponsoredAction (never the QR scan pipeline);
//   4. `{ ok: true, value }` or `{ ok: false, code }`, always `no-store`.
// =============================================================================

type RecordSponsoredAction = typeof api.fairInteractions.recordSponsoredAction;

/** The Convex surface the gateway calls (a fake in tests). */
export type FairSponsoredBackend = {
  recordSponsoredAction(args: FunctionArgs<RecordSponsoredAction>): Promise<FunctionReturnType<RecordSponsoredAction>>;
};

export function convexFairSponsoredBackend(convexUrl: string): FairSponsoredBackend {
  const client = new ConvexHttpClient(convexUrl);
  return { recordSponsoredAction: (args) => client.mutation(api.fairInteractions.recordSponsoredAction, args) };
}

function defaultBackend(): FairSponsoredBackend | null {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  return url ? convexFairSponsoredBackend(url) : null;
}

const STATUS: Partial<Record<FairErrorCode, number>> = {
  INVALID_INPUT: 400,
  FEATURE_NOT_ENTITLED: 403,
  FAIR_MODEL_NOT_FOUND: 404,
  EVENT_NOT_ACTIVE: 409,
  SUBMISSION_DUPLICATE: 409,
  RATE_LIMITED: 429,
};

const KEYS = ["eventModelId", "surface", "kind", "requestId"];

function str(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

export function parseSponsoredAction(body: Record<string, unknown>) {
  if (!Object.keys(body).every((key) => KEYS.includes(key))) return null;
  if (body.surface !== "garage") return null;
  if (body.kind !== "open_model" && body.kind !== "garage_add") return null;
  if (!str(body.eventModelId, 64) || !str(body.requestId, 80)) return null;
  return { eventModelId: body.eventModelId, surface: "garage" as const, kind: body.kind as FairSponsoredActionKind, requestId: body.requestId };
}

export type FairSponsoredDeps = { now?: number; env?: FairVisitorEnv; backend?: FairSponsoredBackend | null };

/** POST /api/fair/sponsored-action — `Pogledaj` / `Dodaj u garažu` on the garage sponsored strip. */
export async function handleFairSponsoredAction(request: Request, deps: FairSponsoredDeps = {}): Promise<Response> {
  const body = await fairGatewayRequest(request);
  if (!body.ok) return body.response;
  const value = body.value;
  const args = typeof value === "object" && value !== null && !Array.isArray(value) ? parseSponsoredAction(value as Record<string, unknown>) : null;
  if (args === null) return fairGatewayError("INVALID_INPUT", 400);
  const visitor = fairVisitorForRequest(request, deps.now ?? Date.now(), deps.env);
  if (visitor.visitorHash === null) return fairGatewayError("VISITOR_UNAVAILABLE", 503);
  const backend = deps.backend === undefined ? defaultBackend() : deps.backend;
  if (!backend) return fairGatewayError("SERVICE_UNAVAILABLE", 503);
  try {
    const result = await backend.recordSponsoredAction({ visitorHash: visitor.visitorHash, ...args });
    return fairGatewayJson({ ok: true, value: result }, 200, visitor.setCookie);
  } catch (error) {
    const code = fairErrorCodeOf(error);
    return code ? fairGatewayError(code, STATUS[code] ?? 400) : fairGatewayError("SERVICE_UNAVAILABLE", 502);
  }
}
