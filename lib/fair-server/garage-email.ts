import "server-only";

import { createHmac } from "node:crypto";
import { ConvexHttpClient } from "convex/browser";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import {
  FAIR_GARAGE_MAX_MODELS,
  FAIR_SHARE_CODE_PATTERN,
  normalizeFairLeadEmail,
  type FairErrorCode,
} from "@/lib/fair-contract";
import { renderFairGarageEmail } from "@/lib/fair-garage-email";
import { fairPublicEventSlug } from "@/lib/fair-public-event";
import { fairGarageSr } from "@/lib/i18n/sr/fair-garage";
import { fairMutationWithSession } from "./convex-session";
import { fairGatewayError, fairGatewayJson, fairGatewayRequest } from "./gateway";
import { fairBackendFailure } from "./interactions";
import { fairShareCode, fairShareCodeHash } from "./sharing";
import { fairConvexVisitorForRequest, fairVisitorEnv, resolveFairVisitorSecret, type FairVisitorEnv } from "./visitor";

// AMF 1 Nov 2026 — POST /api/fair/garage-email ("Sačuvaj garažu"). Same
// gateway as the other visitor routes: same-origin bounded JSON, the visitor
// from the HttpOnly cookie, FAIR_GATEWAY_SECRET + caller-IP HMAC to Convex.
// Body: { email, consent, eventSlug, eventModelIds, submissionId }. Only
// published models of that event are kept (deduplicated, at most the garage
// maximum); the email is rendered here and queued by
// convex/fairGarageEmail.ts. The `?vrati=` code is derived like a share code
// (visitor hash + submissionId), so a retry renders the same link. The
// response never echoes the address; nothing here logs it.

type RequestGarageEmail = typeof api.fairGarageEmail.requestGarageEmail;
type GetModelsByIds = typeof api.fairPublic.getModelsByIds;

export type FairGarageEmailBackend = {
  requestGarageEmail(args: FunctionArgs<RequestGarageEmail>): Promise<FunctionReturnType<RequestGarageEmail>>;
  getModelsByIds(args: FunctionArgs<GetModelsByIds>): Promise<FunctionReturnType<GetModelsByIds>>;
};

function defaultBackend(): FairGarageEmailBackend | null {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) return null;
  const client = new ConvexHttpClient(url);
  return {
    requestGarageEmail: (args) => fairMutationWithSession(client, api.fairGarageEmail.requestGarageEmail, args),
    getModelsByIds: (args) => client.query(api.fairPublic.getModelsByIds, args),
  };
}

const STATUS: Partial<Record<FairErrorCode, number>> = {
  INVALID_INPUT: 400,
  FAIR_MODEL_NOT_FOUND: 404,
  EVENT_NOT_ACTIVE: 409,
  RATE_LIMITED: 429,
};

const EMAIL_HASH_CONTEXT = "scanme-fair-garage-email-v1:";

/** Address HMAC for the send log and the per-address limit (the address itself is never kept). */
export function fairGarageEmailHash(email: string, secret: string): string {
  return createHmac("sha256", secret).update(`${EMAIL_HASH_CONTEXT}${email}`).digest("hex");
}

type GarageEmailBody = { email: string; eventSlug: string; eventModelIds: string[]; submissionId: string };

const str = (value: unknown, max: number): value is string => typeof value === "string" && value.length > 0 && value.length <= max;

export function parseGarageEmailBody(value: unknown): GarageEmailBody | "INVALID_EMAIL" | "CONSENT_REQUIRED" | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const keys = ["email", "consent", "eventSlug", "eventModelIds", "submissionId"];
  if (!Object.keys(body).every((key) => keys.includes(key))) return null;
  if (!str(body.eventSlug, 80) || !str(body.submissionId, 80)) return null;
  if (!Array.isArray(body.eventModelIds) || body.eventModelIds.length < 1 || body.eventModelIds.length > FAIR_GARAGE_MAX_MODELS) return null;
  if (!body.eventModelIds.every((id) => str(id, 64))) return null;
  const email = typeof body.email === "string" ? normalizeFairLeadEmail(body.email) : null;
  if (!email) return "INVALID_EMAIL";
  if (body.consent !== true) return "CONSENT_REQUIRED";
  return { email, eventSlug: body.eventSlug, eventModelIds: [...new Set(body.eventModelIds as string[])], submissionId: body.submissionId };
}

export type FairGarageEmailDeps = { now?: number; env?: FairVisitorEnv; backend?: FairGarageEmailBackend | null };

export async function handleFairGarageEmail(request: Request, deps: FairGarageEmailDeps = {}): Promise<Response> {
  const body = await fairGatewayRequest(request);
  if (!body.ok) return body.response;
  const args = parseGarageEmailBody(body.value);
  if (args === "INVALID_EMAIL") return fairGatewayError("INVALID_INPUT", 400, { field: "email" });
  if (args === "CONSENT_REQUIRED") return fairGatewayError("INVALID_INPUT", 400, { field: "consent" });
  if (!args) return fairGatewayError("INVALID_INPUT", 400);
  const env = deps.env ?? fairVisitorEnv();
  const visitor = fairConvexVisitorForRequest(request, deps.now ?? Date.now(), env);
  if (visitor.visitorHash === null) return fairGatewayError("VISITOR_UNAVAILABLE", 503);
  const backend = deps.backend === undefined ? defaultBackend() : deps.backend;
  if (!backend) return fairGatewayError("SERVICE_UNAVAILABLE", 503);
  // A visitor hash exists, so the visitor secret resolved; it also keys the address HMAC.
  const secret = resolveFairVisitorSecret(env);
  if (!("secret" in secret)) return fairGatewayError("VISITOR_UNAVAILABLE", 503);
  const code = fairShareCode(visitor.visitorHash, args.submissionId);
  if (!FAIR_SHARE_CODE_PATTERN.test(code)) return fairGatewayError("SERVICE_UNAVAILABLE", 503);
  try {
    // Published models of this event only (getModelsByIds projects published models), in garage order.
    const publicSlug = fairPublicEventSlug(args.eventSlug);
    const found = await backend.getModelsByIds({ ids: args.eventModelIds });
    const byId = new Map(found.map((model) => [model.id, model]));
    const models = args.eventModelIds
      .map((id) => byId.get(id))
      .filter((model): model is NonNullable<typeof model> => model !== undefined && fairPublicEventSlug(model.eventSlug) === publicSlug)
      .slice(0, FAIR_GARAGE_MAX_MODELS);
    if (models.length === 0) return fairGatewayError("INVALID_INPUT", 400, { field: "eventModelIds" });
    const eventId = models[0].eventId;
    const eventModels = models.filter((model) => model.eventId === eventId);

    const origin = new URL(request.url).origin;
    const garageUrl = `${origin}/sajam/${publicSlug}/garaza?vrati=${code}`;
    const email = renderFairGarageEmail({ models: eventModels, baseUrl: origin, garageUrl, publicEventSlug: publicSlug, dict: fairGarageSr });
    const value = await backend.requestGarageEmail({
      gatewaySecret: visitor.gatewaySecret,
      ipHash: visitor.ipHash,
      visitorHash: visitor.visitorHash,
      submissionId: args.submissionId,
      email: args.email,
      emailHash: fairGarageEmailHash(args.email, secret.secret),
      consentAccepted: true,
      eventId,
      eventModelIds: eventModels.map((model) => model.id),
      codeHash: fairShareCodeHash(code),
      ...email,
    });
    return fairGatewayJson({ ok: true, value }, 200, visitor.setCookie);
  } catch (error) {
    return fairBackendFailure(error, STATUS);
  }
}
