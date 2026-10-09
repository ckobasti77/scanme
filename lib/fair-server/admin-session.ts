import "server-only";

import { cookies } from "next/headers";
import { cache } from "react";
import { deriveFairCapabilities } from "@/lib/fair-entitlements";
import type { FairModelCapabilities, FairPackageTier } from "@/lib/fair-contract";
import { FAIR_ADMIN_PREVIEW_COOKIE, convexFairAdminDevBackend } from "./admin-dev";
import { fairSessionToken } from "./convex-session";

// =============================================================================
// Sajam 2026 — who sees the admin DEV tools (JOVAN-DELTA 2026-10-09). Decided
// on the server for every request: a ScanMe session whose user Convex reports
// as admin (api.admin.me). A visitor has no session cookie, so there is no
// extra Convex call for them and the tools are never rendered or shipped.
// =============================================================================

export type FairAdminPreview = "free" | "starter" | "advanced";

export const fairIsAdminRequest = cache(async (): Promise<boolean> => {
  const token = await fairSessionToken();
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!token || !url) return false;
  return convexFairAdminDevBackend(url).isAdmin(token);
});

/** The preview package of this admin's browser; read only after the admin check. */
export async function fairAdminPreview(): Promise<FairAdminPreview | null> {
  if (!(await fairIsAdminRequest())) return null;
  const value = (await cookies()).get(FAIR_ADMIN_PREVIEW_COOKIE)?.value;
  return value === "free" || value === "starter" || value === "advanced" ? value : null;
}

const PREVIEW_TIER: Record<FairAdminPreview, FairPackageTier> = { free: "included", starter: "starter", advanced: "advanced" };

/**
 * What the page would show in the preview package — display only. Leads open
 * with the package; questions, survey and sponsorship need their real content,
 * so they appear only where the model already has it. Every action still goes
 * to Convex, which checks the real package.
 */
export function fairPreviewCapabilities(preview: FairAdminPreview, real: FairModelCapabilities): FairModelCapabilities {
  return deriveFairCapabilities(PREVIEW_TIER[preview], {
    hasOpenAudienceQuestions: real.hasAudienceQuestions,
    hasPublishedSurvey: real.hasSurvey,
    inPublishedSponsoredSnapshot: real.isSponsored,
    interestLeadEnabled: true,
    testDriveLeadEnabled: true,
  });
}
