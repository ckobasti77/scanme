import { notFound } from "next/navigation";
import { AdminDebugSupportPreview } from "@/components/admin/admin-debug-support";
import {
  AdminSearchPreviewWorkspace,
  adminSearchCommandPreviewGroups,
} from "@/components/admin/admin-search";
import { AdminShell } from "@/components/admin/admin-shell";
import { adminV1Sr } from "@/lib/i18n/sr/admin-v1";
import { AdminViewModeOverride } from "@/components/admin/admin-ui";
import { parseViewModeParam } from "@/lib/admin-v1/view-mode";

export const dynamic = "force-dynamic";

export default async function Admin18PreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; state?: string; prikaz?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const { mode, state, prikaz } = await searchParams;
  const previewState = state === "loading" || state === "empty" || state === "error" ? state : "loaded";

  return (
    <AdminShell
      previewIdentity={adminV1Sr.fixtureIdentity}
      previewSearchGroups={adminSearchCommandPreviewGroups}
      activePathname={mode === "debug" ? "/admin/klijenti" : "/admin/pretraga"}
    >
      <AdminViewModeOverride value={parseViewModeParam(prikaz)}>
        {mode === "debug" ? <AdminDebugSupportPreview /> : <AdminSearchPreviewWorkspace initialState={previewState} />}
      </AdminViewModeOverride>
    </AdminShell>
  );
}
