"use client";

import { ConvexProvider, type ConvexReactClient } from "convex/react";
import { getFunctionName, type FunctionReference } from "convex/server";
import { useMemo, type ReactNode } from "react";
import { api } from "@/convex/_generated/api";

// ADMIN v2 — dev preview only (`/dev/admin-cuvar-preview/<stanje>`): answers
// `admin.me` with a TEST identity, so the real layout and the real guard can be
// opened in every state without signing in. Every other query stays loading
// and nothing is sent to Convex.

export type AdminGuardPreviewState = "provera" | "neprijavljen" | "bez-prava" | "admin";

const ME: Record<AdminGuardPreviewState, unknown> = {
  provera: undefined,
  neprijavljen: { authenticated: false, isAdmin: false, email: null },
  "bez-prava": { authenticated: true, isAdmin: false, email: "test@example.invalid" },
  admin: { authenticated: true, isAdmin: true, email: "test.admin@example.invalid" },
};

function previewClient(state: AdminGuardPreviewState) {
  const me = getFunctionName(api.admin.me);
  return {
    watchQuery: (query: FunctionReference<"query">) => ({
      localQueryResult: () => (getFunctionName(query) === me ? ME[state] : undefined),
      onUpdate: () => () => undefined,
      journal: () => undefined,
    }),
  } as unknown as ConvexReactClient;
}

export function AdminGuardPreview({ state, children }: { state: AdminGuardPreviewState; children: ReactNode }) {
  const client = useMemo(() => previewClient(state), [state]);
  return <ConvexProvider client={client}>{children}</ConvexProvider>;
}
