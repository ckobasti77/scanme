import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { AdminClientProfilePreview } from "@/components/admin/admin-client-profile";
import { AdminClientsPreview } from "@/components/admin/admin-clients";
import { dashboardFixture } from "@/components/admin/admin-dashboard-fixtures";
import { AdminDashboardFoundation } from "@/components/admin/admin-dashboard-foundation";
import { AdminEventsPreview } from "@/components/admin/admin-events-preview";
import { FinanceSurface } from "@/components/admin/admin-finance";
import { AdminInboxPreview } from "@/components/admin/admin-inbox";
import { AdminOrdersPreview } from "@/components/admin/admin-orders";
import { AdminProductsPreview } from "@/components/admin/admin-products-surface";
import { AdminQrPreview } from "@/components/admin/admin-qr";
import { AdminSearchPreviewWorkspace } from "@/components/admin/admin-search";
import { AdminServiceOperations } from "@/components/admin/admin-service-operations";
import { AdminSettingsWorkspace } from "@/components/admin/admin-settings";
import { AdminTasksPreview } from "@/components/admin/admin-tasks";
import { AdminTeamPreview } from "@/components/admin/admin-team";
import { resolveEventSection, type ResolvedEventSection } from "@/lib/admin-v1/event-sections";
import { ADMIN_FRAME_PREVIEW_BASE } from "@/lib/admin-v2/frame/routes";

// ADMIN v2 — the pages of the persistent frame preview: the same preview
// surfaces as the single `/dev/admin-*-preview` routes, on the admin's own
// paths under one layout (`/dev/admin-okvir-preview/klijenti` =
// `/admin/klijenti`). No Convex data, TEST fixtures only.

function surface(path: string): ReactNode | null {
  switch (path) {
    case "": {
      const fixture = dashboardFixture("ready");
      return <AdminDashboardFoundation initialNow={fixture.now} fixture={fixture} />;
    }
    case "klijenti": return <AdminClientsPreview mode="loaded" />;
    case "klijenti/profil": return <AdminClientProfilePreview />;
    case "inbox": return <AdminInboxPreview />;
    case "zadaci": return <AdminTasksPreview />;
    case "operativa/proizvodi": return <AdminProductsPreview />;
    case "operativa/qr": return <AdminQrPreview />;
    case "operativa/porudzbine": return <AdminOrdersPreview />;
    case "usluge/links": return <AdminServiceOperations serviceType="scanme_links" preview />;
    case "usluge/review": return <AdminServiceOperations serviceType="google_review" preview />;
    case "usluge/meni": return <AdminServiceOperations serviceType="scanme_menu" preview />;
    case "finansije": return <FinanceSurface preview />;
    case "tim": return <AdminTeamPreview />;
    case "pretraga": return <AdminSearchPreviewWorkspace initialState="loaded" />;
    case "podesavanja": return <AdminSettingsWorkspace preview />;
    default: return null;
  }
}

export default async function AdminFramePreviewPage({ params }: { params: Promise<{ ruta?: string[] }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { ruta = [] } = await params;
  if (ruta[0] === "dogadjaji") {
    const resolved = resolveEventSection(ruta.slice(1));
    // No segment or a former Interakcije page: the target section is shown without a redirect.
    const shown: ResolvedEventSection | null = resolved?.kind === "redirect" ? { kind: "section", path: resolved.path } : resolved;
    return <AdminEventsPreview section={shown} base={`${ADMIN_FRAME_PREVIEW_BASE}/dogadjaji`} />;
  }
  const content = surface(ruta.join("/"));
  if (!content) notFound();
  return content;
}
