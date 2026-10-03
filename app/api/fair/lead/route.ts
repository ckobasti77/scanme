import { handleFairLead } from "@/lib/fair-server/leads";

// Sajam 2026 B4: POST /api/fair/lead — `Zainteresovan sam` / `Probna vožnja` (idempotent by submissionId).
// Same-origin only, bounded strict JSON body, no-store; the visitor is the
// HMAC of the HttpOnly cookie, never a body field or URL parameter. The
// response never echoes a contact value. Logic lives in
// lib/fair-server/leads.ts (tested).
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleFairLead(request);
}
