import { notFound } from "next/navigation";
import { AdminDashboardFoundation } from "@/components/admin/admin-dashboard-foundation";
import { dashboardFixture } from "@/components/admin/admin-dashboard-fixtures";
import { DashboardPreviewSteps } from "@/components/admin/dashboard/dashboard-preview-steps";
import { AdminShell } from "@/components/admin/admin-shell";
import { PREVIEW_HUD } from "@/components/admin/events/preview-dashboard-fixtures";
import { PreviewDelay } from "@/components/admin/reveal/preview-delay";
import { adminV1Sr } from "@/lib/i18n/sr/admin-v1";
import type { Metadata } from "next";
import { adminTitle } from "@/lib/admin-v2/frame/titles";
import { PREVIEW_GAME } from "@/components/admin/game/game-fixtures";

export const metadata: Metadata = { title: adminTitle(adminV1Sr.dashboardTitle), robots: { index: false, follow: false } };

const MAX_AIM_LENGTH = 120;
// Dev preview: how long the first state stays before the data changes (`?sazvezdje=1|2`).
const STEP_DELAY_MS = 4000;

export default async function AdminDashboardPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; kasni?: string; sazvezdje?: string; nisan?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const { state: requested, kasni, sazvezdje, nisan } = await searchParams;
  // V3: `?kasni=<ms>` holds the skeleton that long, so its handover to the content can be seen.
  const delay = Math.min(10_000, Math.max(0, Number(kasni) || 0));
  const state = requested === "empty" || requested === "unavailable" || requested === "error" || requested === "loading" ? requested : "ready";
  // V2: `?nisan=<causeId>` aims at the star of that item without a mouse; empty or over-long is ignored.
  const previewAim = nisan && nisan.length <= MAX_AIM_LENGTH ? nisan : undefined;
  // V2: `?sazvezdje=1` resolves an item after a while, `?sazvezdje=2` brings a new one.
  const toStep = sazvezdje === "1" ? 1 : sazvezdje === "2" ? 2 : null;
  const fixture = dashboardFixture(state);
  return (
    <AdminShell previewIdentity={adminV1Sr.fixtureIdentity} previewGame={PREVIEW_GAME} activePathname="/admin" previewHud={PREVIEW_HUD}>
      <PreviewDelay ms={delay}>
        {toStep ? (
          <DashboardPreviewSteps fixtures={[fixture, dashboardFixture(state, toStep)]} delayMs={STEP_DELAY_MS} previewAim={previewAim} />
        ) : (
          <AdminDashboardFoundation initialNow={fixture.now} fixture={fixture} previewAim={previewAim} />
        )}
      </PreviewDelay>
    </AdminShell>
  );
}
