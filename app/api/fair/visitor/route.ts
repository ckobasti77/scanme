import { handleFairVisitorBootstrap } from "@/lib/fair-server/gateway";

// Sajam 2026 B2: POST /api/fair/visitor — the direct-visit bootstrap of the
// anonymous fair visitor cookie (HttpOnly; Secure; SameSite=Lax; Path=/).
// Same-origin only, bounded body, no-store; the response never carries the
// token or its hash. Logic lives in lib/fair-server/gateway.ts (tested).
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleFairVisitorBootstrap(request);
}
