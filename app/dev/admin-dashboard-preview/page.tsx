import { notFound } from "next/navigation";
import { AdminDashboardFoundation } from "@/components/admin/admin-dashboard-foundation";
import { dashboardFixture } from "@/components/admin/admin-dashboard-fixtures";
import { AdminShell } from "@/components/admin/admin-shell";
import { PREVIEW_HUD } from "@/components/admin/events/preview-dashboard-fixtures";
import { PreviewDelay } from "@/components/admin/reveal/preview-delay";
import { adminV1Sr } from "@/lib/i18n/sr/admin-v1";
import type { Metadata } from "next";
import { adminTitle } from "@/lib/admin-v2/frame/titles";

export const metadata: Metadata = { title: adminTitle(adminV1Sr.dashboardTitle), robots: { index: false, follow: false } };

export default async function AdminDashboardPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; kasni?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const { state: requested, kasni } = await searchParams;
  // V3: `?kasni=<ms>` holds the skeleton that long, so its handover to the content can be seen.
  const delay = Math.min(10_000, Math.max(0, Number(kasni) || 0));
  const state = requested === "empty" || requested === "unavailable" || requested === "error" || requested === "loading" ? requested : "ready";
  const fixture = dashboardFixture(state);
  return (
    <AdminShell previewIdentity={adminV1Sr.fixtureIdentity} activePathname="/admin" previewHud={PREVIEW_HUD}>
      <PreviewDelay ms={delay}><AdminDashboardFoundation initialNow={fixture.now} fixture={fixture} /></PreviewDelay>
    </AdminShell>
  );
}
