import { notFound } from "next/navigation";
import { AdminProductsPreview } from "@/components/admin/admin-products-surface";
import { AdminShell } from "@/components/admin/admin-shell";
import { getDict } from "@/lib/i18n";
import { AdminViewModeOverride } from "@/components/admin/admin-ui";
import { parseViewModeParam } from "@/lib/admin-v1/view-mode";

const dict = getDict("admin-products");

export default async function AdminProductsPreviewPage({ searchParams }: { searchParams: Promise<{ prikaz?: string; venue?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { prikaz, venue } = await searchParams;
  return <AdminShell previewIdentity={dict.fixtureIdentity} activePathname="/admin/operativa/proizvodi"><AdminViewModeOverride value={parseViewModeParam(prikaz)}><AdminProductsPreview venueId={venue} /></AdminViewModeOverride></AdminShell>;
}
