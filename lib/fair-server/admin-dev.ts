import "server-only";

import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { fairSessionToken } from "./convex-session";
import { fairGatewayError, fairGatewayJson, fairGatewayRequest } from "./gateway";
import { fairBackendFailure } from "./interactions";
import { fairConvexVisitorForRequest, type FairVisitorEnv } from "./visitor";

// =============================================================================
// Sajam 2026 — POST /api/fair/admin-dev, the one endpoint of the "Admin alati"
// sheet (JOVAN-DELTA 2026-10-09). Same-origin gateway like every fair route,
// then: no ScanMe session → 401, a session that is not an admin → 403. Only
// then the call goes to convex/fairAdminDev.ts with the session (requireAdmin
// is checked again there) plus the gateway secret and the cookie's visitor
// hash, so every action works on the admin's own phone only.
// =============================================================================

type Body = Record<string, unknown>;

/** Admin-only "Pregled kao paket"; absent = the real package (read in admin-session.ts). */
export const FAIR_ADMIN_PREVIEW_COOKIE = "scanme_fair_admin_preview";

export type FairAdminDevAction =
  | { action: "state"; eventId: string; eventModelId?: string }
  | { action: "stamps"; eventId: string; eventModelIds: string[] }
  | { action: "scan"; eventId: string; eventModelId: string }
  | { action: "reset"; eventId: string; scope: "passport" | "answers" | "all" }
  | { action: "openQuestion"; questionId: string }
  | { action: "preview"; tier: "free" | "starter" | "advanced" | null };

type Visitor = { visitorHash: string; gatewaySecret: string; ipHash: string };

/** The Convex surface (a fake in tests). `token` is the admin's session JWT. */
export type FairAdminDevBackend = {
  isAdmin(token: string): Promise<boolean>;
  run(token: string, visitor: Visitor, action: FairAdminDevAction): Promise<unknown>;
};

export function convexFairAdminDevBackend(convexUrl: string): FairAdminDevBackend {
  const client = (token: string) => {
    const convex = new ConvexHttpClient(convexUrl);
    convex.setAuth(token);
    return convex;
  };
  return {
    async isAdmin(token) {
      try {
        return (await client(token).query(api.admin.me, {})).isAdmin;
      } catch {
        return false;
      }
    },
    run(token, visitor, action) {
      const convex = client(token);
      const auth = { gatewaySecret: visitor.gatewaySecret, visitorHash: visitor.visitorHash };
      switch (action.action) {
        case "state":
          return convex.query(api.fairAdminDev.devState, { ...auth, eventId: action.eventId, ...(action.eventModelId ? { eventModelId: action.eventModelId } : {}) });
        case "stamps":
          return convex.mutation(api.fairAdminDev.grantStamps, { ...auth, ipHash: visitor.ipHash, eventId: action.eventId, eventModelIds: action.eventModelIds });
        case "scan":
          return convex.mutation(api.fairAdminDev.simulateScan, { ...auth, ipHash: visitor.ipHash, eventId: action.eventId, eventModelId: action.eventModelId });
        case "reset":
          return convex.mutation(api.fairAdminDev.resetMine, { ...auth, eventId: action.eventId, scope: action.scope });
        case "openQuestion":
          return convex.mutation(api.fairInteractionsAdmin.openAudienceQuestionNow, { questionId: action.questionId as never });
        case "preview":
          return Promise.resolve(null);
      }
    },
  };
}

function defaultBackend(): FairAdminDevBackend | null {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  return url ? convexFairAdminDevBackend(url) : null;
}

const ID_MAX = 64;
const str = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= ID_MAX;

export function parseFairAdminDevAction(body: Body): FairAdminDevAction | null {
  switch (body.action) {
    case "state":
      return str(body.eventId) && (body.eventModelId === undefined || str(body.eventModelId))
        ? { action: "state", eventId: body.eventId, ...(body.eventModelId ? { eventModelId: body.eventModelId as string } : {}) }
        : null;
    case "stamps":
      return str(body.eventId) && Array.isArray(body.eventModelIds) && body.eventModelIds.length > 0 && body.eventModelIds.length <= 40 && body.eventModelIds.every(str)
        ? { action: "stamps", eventId: body.eventId, eventModelIds: body.eventModelIds as string[] }
        : null;
    case "scan":
      return str(body.eventId) && str(body.eventModelId) ? { action: "scan", eventId: body.eventId, eventModelId: body.eventModelId } : null;
    case "reset":
      return str(body.eventId) && (body.scope === "passport" || body.scope === "answers" || body.scope === "all")
        ? { action: "reset", eventId: body.eventId, scope: body.scope }
        : null;
    case "openQuestion":
      return str(body.questionId) ? { action: "openQuestion", questionId: body.questionId } : null;
    case "preview":
      return body.tier === null || body.tier === "free" || body.tier === "starter" || body.tier === "advanced" ? { action: "preview", tier: body.tier } : null;
    default:
      return null;
  }
}

export type FairAdminDevDeps = {
  now?: number;
  env?: FairVisitorEnv;
  sessionToken?: () => Promise<string | null>;
  backend?: FairAdminDevBackend | null;
};

export async function handleFairAdminDev(request: Request, deps: FairAdminDevDeps = {}): Promise<Response> {
  const body = await fairGatewayRequest(request);
  if (!body.ok) return body.response;
  const token = await (deps.sessionToken ?? fairSessionToken)();
  if (!token) return fairGatewayJson({ ok: false, code: "ADMIN_SESSION_REQUIRED" }, 401);
  const backend = deps.backend === undefined ? defaultBackend() : deps.backend;
  if (!backend) return fairGatewayError("SERVICE_UNAVAILABLE", 503);
  if (!(await backend.isAdmin(token))) return fairGatewayJson({ ok: false, code: "ADMIN_REQUIRED" }, 403);
  const value = body.value;
  const action = typeof value === "object" && value !== null && !Array.isArray(value) ? parseFairAdminDevAction(value as Body) : null;
  if (!action) return fairGatewayError("INVALID_INPUT", 400);
  // "Pregled kao paket": only this admin browser's cookie, never data.
  if (action.action === "preview") {
    const response = fairGatewayJson({ ok: true, value: null });
    response.headers.append("Set-Cookie", action.tier
      ? `${FAIR_ADMIN_PREVIEW_COOKIE}=${action.tier}; Path=/; Max-Age=86400; SameSite=Lax; HttpOnly`
      : `${FAIR_ADMIN_PREVIEW_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax; HttpOnly`);
    return response;
  }
  const visitor = fairConvexVisitorForRequest(request, deps.now ?? Date.now(), deps.env);
  if (visitor.visitorHash === null) return fairGatewayError("VISITOR_UNAVAILABLE", 503);
  try {
    const { visitorHash, gatewaySecret, ipHash } = visitor;
    const result = await backend.run(token, { visitorHash, gatewaySecret, ipHash }, action);
    return fairGatewayJson({ ok: true, value: result ?? null }, 200, visitor.setCookie);
  } catch (error) {
    return fairBackendFailure(error, { INVALID_INPUT: 400, FAIR_MODEL_NOT_FOUND: 404 });
  }
}
