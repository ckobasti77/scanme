import "server-only";

import { ConvexHttpClient } from "convex/browser";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import { FAIR_MAX_MODEL_IDS_PER_READ } from "@/lib/fair-contract";
import { fairGatewayError, fairGatewayJson, fairGatewayRequest } from "./gateway";

type GetModelsByIds = typeof api.fairPublic.getModelsByIds;

export type FairGarageBackend = {
  getModelsByIds(
    args: FunctionArgs<GetModelsByIds>,
  ): Promise<FunctionReturnType<GetModelsByIds>>;
};

export function convexFairGarageBackend(convexUrl: string): FairGarageBackend {
  const client = new ConvexHttpClient(convexUrl);
  return {
    getModelsByIds: (args) => client.query(api.fairPublic.getModelsByIds, args),
  };
}

function defaultBackend(): FairGarageBackend | null {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  return url ? convexFairGarageBackend(url) : null;
}

function parseModelIds(value: unknown): { ids: string[] } | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((key) => key !== "ids") || !Array.isArray(body.ids)) return null;
  if (body.ids.length > FAIR_MAX_MODEL_IDS_PER_READ) return null;
  const ids: string[] = [];
  for (const candidate of body.ids) {
    if (typeof candidate !== "string" || candidate.length === 0 || candidate.length > 64) {
      return null;
    }
    if (!ids.includes(candidate)) ids.push(candidate);
  }
  return { ids };
}

/** Refreshes last-known local garage cards. It has no visitor identity and performs no writes. */
export async function handleFairGarageModels(
  request: Request,
  backend: FairGarageBackend | null = defaultBackend(),
): Promise<Response> {
  const body = await fairGatewayRequest(request);
  if (!body.ok) return body.response;
  const args = parseModelIds(body.value);
  if (!args) return fairGatewayError("INVALID_INPUT", 400);
  if (!backend) return fairGatewayError("SERVICE_UNAVAILABLE", 503);
  try {
    const models = await backend.getModelsByIds(args);
    return fairGatewayJson({ ok: true, value: models });
  } catch {
    return fairGatewayError("SERVICE_UNAVAILABLE", 502);
  }
}
