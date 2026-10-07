import "server-only";

import { createHash } from "node:crypto";
import { ConvexHttpClient } from "convex/browser";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import {
  FAIR_SHARE_CODE_PATTERN,
  FAIR_SHARE_COLLECTION_MAX_MODELS,
  type FairErrorCode,
  type FairShareChannel,
  type FairTrafficKind,
} from "@/lib/fair-contract";
import { fairPublicEventSlug } from "@/lib/fair-public-event";
import { fairGatewayError, fairGatewayJson, fairGatewayRequest } from "./gateway";
import { fairErrorCodeOf } from "./interactions";
import { fairVisitorForRequest, type FairVisitorEnv } from "./visitor";

type CreateShareCollection = typeof api.fairSharing.createShareCollection;
type RecordTraffic = typeof api.fairSharing.recordTraffic;
type GetModelsByIds = typeof api.fairPublic.getModelsByIds;

export type FairSharingBackend = {
  createShareCollection(args: FunctionArgs<CreateShareCollection>): Promise<FunctionReturnType<CreateShareCollection>>;
  recordTraffic(args: FunctionArgs<RecordTraffic>): Promise<FunctionReturnType<RecordTraffic>>;
  getModelsByIds(args: FunctionArgs<GetModelsByIds>): Promise<FunctionReturnType<GetModelsByIds>>;
};

export function convexFairSharingBackend(convexUrl: string): FairSharingBackend {
  const client = new ConvexHttpClient(convexUrl);
  return {
    createShareCollection: (args) => client.mutation(api.fairSharing.createShareCollection, args),
    recordTraffic: (args) => client.mutation(api.fairSharing.recordTraffic, args),
    getModelsByIds: (args) => client.query(api.fairPublic.getModelsByIds, args),
  };
}

function defaultBackend(): FairSharingBackend | null {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  return url ? convexFairSharingBackend(url) : null;
}

const STATUS: Partial<Record<FairErrorCode, number>> = {
  INVALID_INPUT: 400,
  FAIR_MODEL_NOT_FOUND: 404,
  EVENT_NOT_ACTIVE: 409,
  SUBMISSION_DUPLICATE: 409,
  RATE_LIMITED: 429,
};

const SHARE_CONTEXT = "scanme-fair-share-v1:";

export function fairShareCode(visitorHash: string, requestId: string): string {
  return createHash("sha256")
    .update(`${SHARE_CONTEXT}${visitorHash}:${requestId}`)
    .digest()
    .subarray(0, 18)
    .toString("base64url");
}

export function fairShareCodeHash(code: string): string {
  return createHash("sha256").update(`${SHARE_CONTEXT}${code}`).digest("hex");
}

function str(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

function parseCreate(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (!Object.keys(body).every((key) => key === "eventModelIds" || key === "requestId")) return null;
  if (!Array.isArray(body.eventModelIds) || body.eventModelIds.length < 1 || body.eventModelIds.length > FAIR_SHARE_COLLECTION_MAX_MODELS) return null;
  if (!str(body.requestId, 80)) return null;
  const eventModelIds: string[] = [];
  for (const value of body.eventModelIds) {
    if (!str(value, 64) || eventModelIds.includes(value)) return null;
    eventModelIds.push(value);
  }
  return { eventModelIds, requestId: body.requestId };
}

function parseTraffic(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const keys = ["kind", "requestId", "eventModelId", "shareCollectionId", "channel", "modelCount"];
  if (!Object.keys(body).every((key) => keys.includes(key))) return null;
  if (body.kind !== "direct_view" && body.kind !== "share_action" && body.kind !== "share_open") return null;
  if (!str(body.requestId, 80)) return null;
  if (body.eventModelId !== undefined && !str(body.eventModelId, 64)) return null;
  if (body.shareCollectionId !== undefined && !str(body.shareCollectionId, 64)) return null;
  if (
    body.channel !== undefined &&
    body.channel !== "native" &&
    body.channel !== "whatsapp" &&
    body.channel !== "viber" &&
    body.channel !== "copy"
  ) return null;
  if (body.modelCount !== undefined && (!Number.isInteger(body.modelCount) || Number(body.modelCount) < 1 || Number(body.modelCount) > FAIR_SHARE_COLLECTION_MAX_MODELS)) return null;
  if (body.kind === "direct_view" && (!body.eventModelId || body.shareCollectionId || body.channel || body.modelCount)) return null;
  if (body.kind === "share_open" && (!body.shareCollectionId || body.eventModelId || body.channel || body.modelCount)) return null;
  if (body.kind === "share_action") {
    if (!body.channel || body.modelCount === undefined) return null;
    if ((Number(body.modelCount) === 1 && (!body.eventModelId || body.shareCollectionId)) ||
        (Number(body.modelCount) > 1 && (!body.shareCollectionId || body.eventModelId))) return null;
  }
  return {
    kind: body.kind as FairTrafficKind,
    requestId: body.requestId,
    ...(body.eventModelId ? { eventModelId: body.eventModelId } : {}),
    ...(body.shareCollectionId ? { shareCollectionId: body.shareCollectionId } : {}),
    ...(body.channel ? { channel: body.channel as FairShareChannel } : {}),
    ...(body.modelCount ? { modelCount: Number(body.modelCount) } : {}),
  };
}

// Shared collections live under their event's public slug. The collection
// mutation returns only the event id, so the slug comes from the first model;
// when that read fails the legacy path still redirects to the right event.
async function sharePath(backend: FairSharingBackend, eventModelId: string, shareCode: string) {
  try {
    const [model] = await backend.getModelsByIds({ ids: [eventModelId] });
    if (model) return `/sajam/${fairPublicEventSlug(model.eventSlug)}/deli/${shareCode}`;
  } catch {
    // Fall through to the legacy redirecting path.
  }
  return `/sajam/deli/${shareCode}`;
}

export type FairSharingDeps = { now?: number; env?: FairVisitorEnv; backend?: FairSharingBackend | null };

export async function handleCreateShareCollection(request: Request, deps: FairSharingDeps = {}): Promise<Response> {
  const body = await fairGatewayRequest(request);
  if (!body.ok) return body.response;
  const args = parseCreate(body.value);
  if (!args) return fairGatewayError("INVALID_INPUT", 400);
  const visitor = fairVisitorForRequest(request, deps.now ?? Date.now(), deps.env);
  if (visitor.visitorHash === null) return fairGatewayError("VISITOR_UNAVAILABLE", 503);
  const backend = deps.backend === undefined ? defaultBackend() : deps.backend;
  if (!backend) return fairGatewayError("SERVICE_UNAVAILABLE", 503);
  const shareCode = fairShareCode(visitor.visitorHash, args.requestId);
  if (!FAIR_SHARE_CODE_PATTERN.test(shareCode)) return fairGatewayError("SERVICE_UNAVAILABLE", 503);
  try {
    const value = await backend.createShareCollection({
      visitorHash: visitor.visitorHash,
      eventModelIds: args.eventModelIds,
      codeHash: fairShareCodeHash(shareCode),
      requestId: args.requestId,
    });
    return fairGatewayJson({ ok: true, value: { ...value, shareCode, url: `${new URL(request.url).origin}${await sharePath(backend, args.eventModelIds[0], shareCode)}` } }, 200, visitor.setCookie);
  } catch (error) {
    const code = fairErrorCodeOf(error);
    return code ? fairGatewayError(code, STATUS[code] ?? 400) : fairGatewayError("SERVICE_UNAVAILABLE", 502);
  }
}

export async function handleFairTraffic(request: Request, deps: FairSharingDeps = {}): Promise<Response> {
  const body = await fairGatewayRequest(request);
  if (!body.ok) return body.response;
  const args = parseTraffic(body.value);
  if (!args) return fairGatewayError("INVALID_INPUT", 400);
  const visitor = fairVisitorForRequest(request, deps.now ?? Date.now(), deps.env);
  if (visitor.visitorHash === null) return fairGatewayError("VISITOR_UNAVAILABLE", 503);
  const backend = deps.backend === undefined ? defaultBackend() : deps.backend;
  if (!backend) return fairGatewayError("SERVICE_UNAVAILABLE", 503);
  try {
    const value = await backend.recordTraffic({ visitorHash: visitor.visitorHash, ...args });
    return fairGatewayJson({ ok: true, value }, 200, visitor.setCookie);
  } catch (error) {
    const code = fairErrorCodeOf(error);
    return code ? fairGatewayError(code, STATUS[code] ?? 400) : fairGatewayError("SERVICE_UNAVAILABLE", 502);
  }
}
