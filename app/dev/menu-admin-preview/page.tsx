// Dev-only admin Menu subpage preview (TASK-58 browser QA): mounts the REAL
// MenuAdminSubpage (the `menu` case of components/admin/location-admin.tsx)
// for a real business, against the real Convex deployment and the browser's
// real admin session — every mutation, audit row and export is the shipped
// path. Needed because the real route /admin/customers/<id>/menu returns 404
// while subpageActive("menu") is false (RFC-003 §3 Risk 8: the flip is
// TASK-61). Unavailable in production, mirroring app/dev/customers-preview.
//
//   /dev/menu-admin-preview?businessId=<businesses id>

import { notFound } from "next/navigation";
import { MenuAdminPreview } from "./menu-admin-preview";

export const dynamic = "force-dynamic";

export default async function MenuAdminPreviewPage({
  searchParams,
}: PageProps<"/dev/menu-admin-preview">) {
  if (process.env.NODE_ENV === "production") notFound();
  const resolved = await searchParams;
  const businessId =
    typeof resolved.businessId === "string" ? resolved.businessId : null;
  return <MenuAdminPreview businessId={businessId} />;
}
