import { notFound } from "next/navigation";
import { AdminDebugSupportPreview } from "@/components/admin/admin-debug-support";
import {
  AdminSearchPreviewWorkspace,
  adminSearchCommandPreviewGroups,
} from "@/components/admin/admin-search";
import { AdminShell } from "@/components/admin/admin-shell";
import { adminV1Sr } from "@/lib/i18n/sr/admin-v1";

export const dynamic = "force-dynamic";

export default async function Admin18PreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; state?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const { mode, state } = await searchParams;
  const previewState = state === "loading" || state === "empty" || state === "error" ? state : "loaded";

  return (
    <AdminShell
      previewIdentity={adminV1Sr.fixtureIdentity}
      previewSearchGroups={adminSearchCommandPreviewGroups}
      activePathname={mode === "debug" ? "/admin/klijenti" : "/admin/pretraga"}
    >
      {mode === "debug" ? <AdminDebugSupportPreview /> : <AdminSearchPreviewWorkspace initialState={previewState} />}
    </AdminShell>
  );
}
