import { handleFairFavorite } from "@/lib/fair-server/interactions";

// Sajam 2026 B3: POST /api/fair/passport/favorite — the changeable favorite of a completed brand passport.
// Same-origin only, bounded strict JSON body, no-store; the visitor is the
// HMAC of the HttpOnly cookie, never a body field or URL parameter. Logic
// lives in lib/fair-server/interactions.ts (tested).
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleFairFavorite(request);
}
