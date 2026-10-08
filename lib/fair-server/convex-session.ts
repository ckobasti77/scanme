import "server-only";

import type { ConvexHttpClient } from "convex/browser";
import type { FunctionReference, FunctionReturnType, OptionalRestArgs } from "convex/server";
import { ConvexError } from "convex/values";

// =============================================================================
// Sajam 2026 — admin exclusion for every fair write (JOVAN-DELTA 2026-10-09).
// Same rule as the scan in app/r/[cardCode]/route.ts (B2): the signed-in
// ScanMe session rides the call and Convex alone decides whether it is an
// admin (fairSessionAdminUserId) — never a request flag. Visitors have no
// session cookie, so their call is the same single anonymous call as before.
// A stale token must not break a visitor action: on an auth failure retry
// once anonymously. A fair error (ConvexError) is the answer and is never
// retried — an anonymous retry would count the admin like a visitor.
// =============================================================================

/** The Convex Auth JWT of this request, or null (no session, or no request scope). */
export async function fairSessionToken(): Promise<string | null> {
  try {
    // Loaded on use: the gateway tests run the handlers with a fake backend
    // and never reach the Next request scope this needs.
    const { convexAuthNextjsToken } = await import("@convex-dev/auth/nextjs/server");
    return (await convexAuthNextjsToken()) ?? null;
  } catch {
    return null;
  }
}

export async function fairMutationWithSession<Mutation extends FunctionReference<"mutation">>(
  client: ConvexHttpClient,
  mutation: Mutation,
  ...args: OptionalRestArgs<Mutation>
): Promise<FunctionReturnType<Mutation>> {
  const token = await fairSessionToken();
  if (token) {
    client.setAuth(token);
    try {
      return await client.mutation(mutation, ...args);
    } catch (error) {
      if (error instanceof ConvexError) throw error;
    } finally {
      client.clearAuth();
    }
  }
  return client.mutation(mutation, ...args);
}
