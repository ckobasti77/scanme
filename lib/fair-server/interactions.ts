import "server-only";

import { ConvexHttpClient } from "convex/browser";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import {
  FAIR_ERROR_CODES,
  FAIR_LEAD_INPUT_REASONS,
  FAIR_SURVEY_MAX_QUESTIONS,
  type FairContactRequirement,
  type FairErrorCode,
  type FairErrorDetails,
} from "@/lib/fair-contract";
import { fairGatewayError, fairGatewayJson, fairGatewayRequest } from "./gateway";
import { fairConvexVisitorForRequest, warnOnce, type FairVisitorEnv } from "./visitor";

// =============================================================================
// Sajam automobila 2026 — B3 visitor interaction gateway (BACKEND-HANDOFF §4.2,
// §7). Every app/api/fair/** interaction route is one of the handlers below:
//   1. same-origin + bounded JSON body (lib/fair-server/gateway.ts);
//   2. strict body shape — unknown keys are refused, so a body can never
//      carry its own `visitorHash`;
//   3. visitor = HMAC of the HttpOnly cookie (minted here on first use);
//   4. one Convex call (convex/fairInteractions.ts) with that hash plus, K1,
//      FAIR_GATEWAY_SECRET and the caller-IP HMAC (no secret → no call,
//      503 VISITOR_UNAVAILABLE);
//   5. `{ ok: true, value }` or `{ ok: false, code }`, always `no-store`.
// The token never leaves this process; the hash goes only to Convex.
// =============================================================================

type Fn = typeof api.fairInteractions;

/** The Convex surface the gateway calls (a fake in tests). */
export type FairInteractionsBackend = {
  getMyModelState(args: FunctionArgs<Fn["getMyModelState"]>): Promise<FunctionReturnType<Fn["getMyModelState"]>>;
  getMyPassportProgress(args: FunctionArgs<Fn["getMyPassportProgress"]>): Promise<FunctionReturnType<Fn["getMyPassportProgress"]>>;
  upsertRating(args: FunctionArgs<Fn["upsertRating"]>): Promise<FunctionReturnType<Fn["upsertRating"]>>;
  upsertAudienceVote(args: FunctionArgs<Fn["upsertAudienceVote"]>): Promise<FunctionReturnType<Fn["upsertAudienceVote"]>>;
  submitSurvey(args: FunctionArgs<Fn["submitSurvey"]>): Promise<FunctionReturnType<Fn["submitSurvey"]>>;
  upsertBrandFavorite(args: FunctionArgs<Fn["upsertBrandFavorite"]>): Promise<FunctionReturnType<Fn["upsertBrandFavorite"]>>;
};

export function convexFairInteractionsBackend(convexUrl: string): FairInteractionsBackend {
  const client = new ConvexHttpClient(convexUrl);
  return {
    getMyModelState: (args) => client.query(api.fairInteractions.getMyModelState, args),
    getMyPassportProgress: (args) => client.query(api.fairInteractions.getMyPassportProgress, args),
    upsertRating: (args) => client.mutation(api.fairInteractions.upsertRating, args),
    upsertAudienceVote: (args) => client.mutation(api.fairInteractions.upsertAudienceVote, args),
    submitSurvey: (args) => client.mutation(api.fairInteractions.submitSurvey, args),
    upsertBrandFavorite: (args) => client.mutation(api.fairInteractions.upsertBrandFavorite, args),
  };
}

function defaultBackend(): FairInteractionsBackend | null {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  return url ? convexFairInteractionsBackend(url) : null;
}

const STATUS: Partial<Record<FairErrorCode, number>> = {
  INVALID_INPUT: 400,
  FAIR_MODEL_NOT_FOUND: 404,
  PASSPORT_NOT_ACTIVE: 404,
  FEATURE_NOT_ENTITLED: 403,
  RATE_LIMITED: 429,
  EVENT_NOT_ACTIVE: 409,
  QUESTION_NOT_OPEN: 409,
  SURVEY_NOT_OPEN: 409,
  SUBMISSION_DUPLICATE: 409,
  SURVEY_ALREADY_SUBMITTED: 409,
  PASSPORT_NOT_COMPLETE: 409,
};

const KNOWN_CODES = new Set<string>(FAIR_ERROR_CODES);

/** The stable code of a Convex failure (ConvexError data), or null. Never the message. */
export function fairErrorCodeOf(error: unknown): FairErrorCode | null {
  if (typeof error !== "object" || error === null || !("data" in error)) return null;
  const data = (error as { data: unknown }).data;
  if (typeof data !== "object" || data === null || !("code" in data)) return null;
  const code = (data as { code: unknown }).code;
  return typeof code === "string" && KNOWN_CODES.has(code) ? (code as FairErrorCode) : null;
}

const CONTACT_REQUIREMENTS: readonly FairContactRequirement[] = ["one_of", "email", "phone", "both"];
const INPUT_REASONS = new Set<string>(FAIR_LEAD_INPUT_REASONS);

/**
 * N5 — the details of a Convex failure the browser may see, or undefined.
 * Only FAIR_PUBLIC_ERROR_DETAIL_KEYS, each with a shape that cannot carry a
 * contact value or free text: `field` (an identifier), `required` (a contact
 * rule), `reason` (FAIR_LEAD_INPUT_REASONS), `retryAfterMs` (whole ms ≥ 0).
 */
export function fairPublicErrorDetails(error: unknown): FairErrorDetails | undefined {
  if (typeof error !== "object" || error === null || !("data" in error)) return undefined;
  const data = (error as { data: unknown }).data;
  if (typeof data !== "object" || data === null || !("details" in data)) return undefined;
  const raw = (data as { details: unknown }).details;
  if (typeof raw !== "object" || raw === null) return undefined;
  const { field, required, reason, retryAfterMs } = raw as Record<string, unknown>;
  const details: FairErrorDetails = {};
  if (typeof field === "string" && /^[A-Za-z]{1,40}$/.test(field)) details.field = field;
  if (typeof required === "string" && (CONTACT_REQUIREMENTS as readonly string[]).includes(required)) details.required = required;
  if (typeof reason === "string" && INPUT_REASONS.has(reason)) details.reason = reason;
  if (typeof retryAfterMs === "number" && Number.isFinite(retryAfterMs) && retryAfterMs >= 0) details.retryAfterMs = Math.ceil(retryAfterMs);
  return Object.keys(details).length ? details : undefined;
}

/**
 * The response for a failed Convex call: its stable code (N5: with the
 * whitelisted details; a 429 with `Retry-After`), or SERVICE_UNAVAILABLE.
 * K1: a refused gateway secret is a deploy problem, not the visitor's — the
 * browser sees SERVICE_UNAVAILABLE, the server log the code once (never the
 * secret).
 */
export function fairBackendFailure(error: unknown, status: Partial<Record<FairErrorCode, number>>): Response {
  const code = fairErrorCodeOf(error);
  if (code === "FAIR_GATEWAY_NOT_CONFIGURED" || code === "FAIR_GATEWAY_UNAUTHORIZED") {
    warnOnce(code);
    return fairGatewayError("SERVICE_UNAVAILABLE", 503);
  }
  return code ? fairGatewayError(code, status[code] ?? 400, fairPublicErrorDetails(error)) : fairGatewayError("SERVICE_UNAVAILABLE", 502);
}

// -----------------------------------------------------------------------------
// Strict body parsing
// -----------------------------------------------------------------------------

type Body = Record<string, unknown>;
const ID_MAX = 64;
const TEXT_MAX = 120;

function onlyKeys(body: Body, allowed: readonly string[]) {
  return Object.keys(body).every((key) => allowed.includes(key));
}

function str(value: unknown, max = ID_MAX): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

function optNum(value: unknown): value is number | undefined {
  return value === undefined || (typeof value === "number" && Number.isFinite(value));
}

export const parseModelState = (body: Body) =>
  onlyKeys(body, ["eventModelId"]) && str(body.eventModelId) ? { eventModelId: body.eventModelId } : null;

export const parsePassport = (body: Body) =>
  onlyKeys(body, ["eventSlug"]) && str(body.eventSlug, TEXT_MAX) ? { eventSlug: body.eventSlug } : null;

export function parseRating(body: Body) {
  const keys = ["eventModelId", "overall", "appearance", "specifications", "price"] as const;
  if (!onlyKeys(body, keys) || !str(body.eventModelId)) return null;
  if (!optNum(body.overall) || !optNum(body.appearance) || !optNum(body.specifications) || !optNum(body.price)) return null;
  return {
    eventModelId: body.eventModelId,
    ...(body.overall !== undefined ? { overall: body.overall } : {}),
    ...(body.appearance !== undefined ? { appearance: body.appearance } : {}),
    ...(body.specifications !== undefined ? { specifications: body.specifications } : {}),
    ...(body.price !== undefined ? { price: body.price } : {}),
  };
}

export const parseVote = (body: Body) =>
  onlyKeys(body, ["questionId", "optionId"]) && str(body.questionId) && str(body.optionId) ? { questionId: body.questionId, optionId: body.optionId } : null;

export function parseSurvey(body: Body) {
  if (!onlyKeys(body, ["surveyId", "submissionId", "answers"]) || !str(body.surveyId) || !str(body.submissionId, 80)) return null;
  if (!Array.isArray(body.answers) || body.answers.length > FAIR_SURVEY_MAX_QUESTIONS) return null;
  const answers: Array<{ questionId: string; value: string }> = [];
  for (const raw of body.answers as unknown[]) {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
    const answer = raw as Body;
    if (!onlyKeys(answer, ["questionId", "value"]) || !str(answer.questionId) || !str(answer.value)) return null;
    answers.push({ questionId: answer.questionId, value: answer.value });
  }
  return { surveyId: body.surveyId, submissionId: body.submissionId, answers };
}

export const parseFavorite = (body: Body) =>
  onlyKeys(body, ["passportId", "eventModelId"]) && str(body.passportId) && str(body.eventModelId)
    ? { passportId: body.passportId, eventModelId: body.eventModelId }
    : null;

// -----------------------------------------------------------------------------
// Handlers
// -----------------------------------------------------------------------------

export type FairInteractionDeps = { now?: number; env?: FairVisitorEnv; backend?: FairInteractionsBackend | null };

/** What every visitor-specific Convex call carries (server-side only). */
export type FairConvexAuth = { visitorHash: string; gatewaySecret: string; ipHash: string };

async function handle<T>(
  request: Request,
  deps: FairInteractionDeps,
  parse: (body: Body) => T | null,
  run: (backend: FairInteractionsBackend, auth: FairConvexAuth, args: T) => Promise<unknown>,
): Promise<Response> {
  const body = await fairGatewayRequest(request);
  if (!body.ok) return body.response;
  const value = body.value;
  const args = typeof value === "object" && value !== null && !Array.isArray(value) ? parse(value as Body) : null;
  if (args === null) return fairGatewayError("INVALID_INPUT", 400);
  const visitor = fairConvexVisitorForRequest(request, deps.now ?? Date.now(), deps.env);
  if (visitor.visitorHash === null) return fairGatewayError("VISITOR_UNAVAILABLE", 503);
  const backend = deps.backend === undefined ? defaultBackend() : deps.backend;
  if (!backend) return fairGatewayError("SERVICE_UNAVAILABLE", 503);
  try {
    const { visitorHash, gatewaySecret, ipHash } = visitor;
    const result = await run(backend, { visitorHash, gatewaySecret, ipHash }, args);
    return fairGatewayJson({ ok: true, value: result }, 200, visitor.setCookie);
  } catch (error) {
    return fairBackendFailure(error, STATUS);
  }
}

/** POST /api/fair/model-state — own rating, own votes with results, survey state, passport N/M. */
export const handleFairModelState = (request: Request, deps: FairInteractionDeps = {}) =>
  handle(request, deps, parseModelState, (backend, { visitorHash, gatewaySecret }, args) => backend.getMyModelState({ gatewaySecret, visitorHash, ...args }));

/** POST /api/fair/passport — every active passport of the event with the visitor's progress. */
export const handleFairPassport = (request: Request, deps: FairInteractionDeps = {}) =>
  handle(request, deps, parsePassport, (backend, { visitorHash, gatewaySecret }, args) => backend.getMyPassportProgress({ gatewaySecret, visitorHash, ...args }));

/** POST /api/fair/rating */
export const handleFairRating = (request: Request, deps: FairInteractionDeps = {}) =>
  handle(request, deps, parseRating, (backend, auth, args) => backend.upsertRating({ ...auth, ...args }));

/** POST /api/fair/audience-vote */
export const handleFairAudienceVote = (request: Request, deps: FairInteractionDeps = {}) =>
  handle(request, deps, parseVote, (backend, auth, args) => backend.upsertAudienceVote({ ...auth, ...args }));

/** POST /api/fair/survey */
export const handleFairSurvey = (request: Request, deps: FairInteractionDeps = {}) =>
  handle(request, deps, parseSurvey, (backend, auth, args) => backend.submitSurvey({ ...auth, ...args }));

/** POST /api/fair/passport/favorite */
export const handleFairFavorite = (request: Request, deps: FairInteractionDeps = {}) =>
  handle(request, deps, parseFavorite, (backend, auth, args) => backend.upsertBrandFavorite({ ...auth, ...args }));
