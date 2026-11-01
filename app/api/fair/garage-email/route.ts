import { handleFairGarageEmail } from "@/lib/fair-server/garage-email";

// AMF 1 Nov 2026: POST /api/fair/garage-email — "Sačuvaj garažu" (idempotent by submissionId).
// Logic lives in lib/fair-server/garage-email.ts (tested).
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleFairGarageEmail(request);
}
