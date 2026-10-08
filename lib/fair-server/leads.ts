import "server-only";

import { ConvexHttpClient } from "convex/browser";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import {
  FAIR_LEAD_EMAIL_MAX,
  FAIR_LEAD_NAME_MAX,
  FAIR_LEAD_PHONE_MAX,
  type FairErrorCode,
  type FairLeadKind,
} from "@/lib/fair-contract";
import { fairMutationWithSession } from "./convex-session";
import { fairGatewayError, fairGatewayJson, fairGatewayRequest } from "./gateway";
import { fairBackendFailure } from "./interactions";
import { fairConvexVisitorForRequest, type FairVisitorEnv } from "./visitor";

// =============================================================================
// Sajam automobila 2026 — B4 lead gateway, POST /api/fair/lead (BACKEND-HANDOFF
// §4.2, §4.4, §7). Same contract as the B3 interaction gateway:
//   1. same-origin + bounded JSON body (lib/fair-server/gateway.ts);
//   2. strict body shape — unknown keys (a `visitorHash` too) are refused;
//   3. a declined consent stops HERE: the contact never leaves this process
//      (Convex refuses it again with CONSENT_REQUIRED, without storing);
//   4. visitor = HMAC of the HttpOnly cookie; one call to fairLeads.submitLead
//      with FAIR_GATEWAY_SECRET and the caller-IP HMAC (K1; no secret → no call);
//   5. `{ ok: true, value }` (never a contact value) or `{ ok: false, code,
//      details? }` — N5: `details` = { field, reason } of a refused field,
//      `required` of an unmet contact rule, `retryAfterMs` of a limit, and a
//      429 carries `Retry-After`; always `no-store`. Contact values are never
//      logged or echoed.
// =============================================================================

type SubmitLead = typeof api.fairLeads.submitLead;

/** The Convex surface the gateway calls (a fake in tests). */
export type FairLeadsBackend = {
  submitLead(args: FunctionArgs<SubmitLead>): Promise<FunctionReturnType<SubmitLead>>;
};

export function convexFairLeadsBackend(convexUrl: string): FairLeadsBackend {
  const client = new ConvexHttpClient(convexUrl);
  return { submitLead: (args) => fairMutationWithSession(client, api.fairLeads.submitLead, args) };
}

function defaultBackend(): FairLeadsBackend | null {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  return url ? convexFairLeadsBackend(url) : null;
}

const STATUS: Partial<Record<FairErrorCode, number>> = {
  INVALID_INPUT: 400,
  FEATURE_NOT_ENTITLED: 403,
  FAIR_MODEL_NOT_FOUND: 404,
  EVENT_NOT_ACTIVE: 409,
  SUBMISSION_DUPLICATE: 409,
  CONSENT_NOT_CONFIGURED: 409,
  // K3: the Convex hard switch FAIR_LEADS_ENABLED is off — the flow is closed, nothing was stored.
  LEADS_DISABLED: 409,
  CONSENT_REQUIRED: 422,
  CONTACT_REQUIREMENT_NOT_MET: 422,
  RATE_LIMITED: 429,
};

const KEYS = ["eventModelId", "kind", "submissionId", "contactName", "email", "phone", "consentAccepted", "consentVersion"];

function str(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

function optStr(value: unknown, max: number): value is string | undefined {
  return value === undefined || (typeof value === "string" && value.length <= max);
}

export function parseLead(body: Record<string, unknown>) {
  if (!Object.keys(body).every((key) => KEYS.includes(key))) return null;
  const kind = body.kind;
  if (kind !== "interest" && kind !== "test_drive") return null;
  if (!str(body.eventModelId, 64) || !str(body.submissionId, 80) || !str(body.contactName, FAIR_LEAD_NAME_MAX * 2)) return null;
  if (!optStr(body.email, FAIR_LEAD_EMAIL_MAX) || !optStr(body.phone, FAIR_LEAD_PHONE_MAX)) return null;
  if (typeof body.consentAccepted !== "boolean" || typeof body.consentVersion !== "number" || !Number.isInteger(body.consentVersion)) return null;
  return {
    eventModelId: body.eventModelId,
    kind: kind as FairLeadKind,
    submissionId: body.submissionId,
    contactName: body.contactName,
    ...(body.email ? { email: body.email } : {}),
    ...(body.phone ? { phone: body.phone } : {}),
    consentAccepted: body.consentAccepted,
    consentVersion: body.consentVersion,
  };
}

export type FairLeadDeps = { now?: number; env?: FairVisitorEnv; backend?: FairLeadsBackend | null };

/** POST /api/fair/lead — `Zainteresovan sam` (Starter+) or `Probna vožnja` (Advanced). */
export async function handleFairLead(request: Request, deps: FairLeadDeps = {}): Promise<Response> {
  const body = await fairGatewayRequest(request);
  if (!body.ok) return body.response;
  const value = body.value;
  const args = typeof value === "object" && value !== null && !Array.isArray(value) ? parseLead(value as Record<string, unknown>) : null;
  if (args === null) return fairGatewayError("INVALID_INPUT", 400);
  if (args.consentAccepted !== true) return fairGatewayError("CONSENT_REQUIRED", 422);
  const visitor = fairConvexVisitorForRequest(request, deps.now ?? Date.now(), deps.env);
  if (visitor.visitorHash === null) return fairGatewayError("VISITOR_UNAVAILABLE", 503);
  const backend = deps.backend === undefined ? defaultBackend() : deps.backend;
  if (!backend) return fairGatewayError("SERVICE_UNAVAILABLE", 503);
  try {
    const { visitorHash, gatewaySecret, ipHash } = visitor;
    const result = await backend.submitLead({ gatewaySecret, ipHash, visitorHash, ...args });
    return fairGatewayJson({ ok: true, value: result }, 200, visitor.setCookie);
  } catch (error) {
    return fairBackendFailure(error, STATUS);
  }
}
