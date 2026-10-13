import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminDebugSupportPreview } from "@/components/admin/admin-debug-support";
import {
  AdminSearchPreviewWorkspace,
  adminSearchCommandPreviewGroups,
} from "@/components/admin/admin-search";
import { AdminShell } from "@/components/admin/admin-shell";
import { adminTitle } from "@/lib/admin-v2/frame/titles";
import { adminSearchSr } from "@/lib/i18n/sr/admin-search";
import { adminV1Sr } from "@/lib/i18n/sr/admin-v1";
import { PREVIEW_GAME } from "@/components/admin/game/game-fixtures";

export const dynamic = "force-dynamic";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ mode?: string }> }): Promise<Metadata> {
  const { mode } = await searchParams;
  return { title: adminTitle(mode === "debug" ? adminSearchSr.debugMode : adminSearchSr.pageTitle), robots: { index: false, follow: false } };
}

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
      previewIdentity={adminV1Sr.fixtureIdentity} previewGame={PREVIEW_GAME}
      previewSearchGroups={adminSearchCommandPreviewGroups}
      activePathname={mode === "debug" ? "/admin/debug/preview" : "/admin/pretraga"}
    >
      {mode === "debug" ? <AdminDebugSupportPreview /> : <AdminSearchPreviewWorkspace initialState={previewState} />}
    </AdminShell>
  );
}
