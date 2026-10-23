import { notFound } from "next/navigation";
import { AdminDashboardFoundation } from "@/components/admin/admin-dashboard-foundation";
import { dashboardFixture } from "@/components/admin/admin-dashboard-fixtures";
import { AdminShell } from "@/components/admin/admin-shell";
import { adminV1Sr } from "@/lib/i18n/sr/admin-v1";

export default async function AdminDashboardPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const requested = (await searchParams).state;
  const state = requested === "empty" || requested === "unavailable" || requested === "error" || requested === "loading" ? requested : "ready";
  const fixture = dashboardFixture(state);
  return (
    <AdminShell previewIdentity={adminV1Sr.fixtureIdentity} activePathname="/admin">
      <AdminDashboardFoundation initialNow={fixture.now} fixture={fixture} />
    </AdminShell>
  );
}
