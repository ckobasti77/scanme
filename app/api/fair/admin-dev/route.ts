import { handleFairAdminDev } from "@/lib/fair-server/admin-dev";

// Sajam 2026 (JOVAN-DELTA 2026-10-09): POST /api/fair/admin-dev — the "Admin
// alati" sheet on the public fair pages. Same-origin, no-store; 401 without a
// ScanMe session, 403 for a session that is not an admin. Logic lives in
// lib/fair-server/admin-dev.ts (tested).
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleFairAdminDev(request);
}
