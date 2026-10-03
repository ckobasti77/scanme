import { handleFairSponsoredAction } from "@/lib/fair-server/sponsored";

// Sajam 2026 B5: POST /api/fair/sponsored-action — `Pogledaj` / `Dodaj u garažu`
// on the garage sponsored strip (idempotent by requestId). The map and the
// displays never call it; a passive view is never recorded. Same-origin only,
// bounded strict JSON body, no-store; the visitor is the HMAC of the HttpOnly
// cookie, never a body field or URL parameter. Logic lives in
// lib/fair-server/sponsored.ts (tested).
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleFairSponsoredAction(request);
}
