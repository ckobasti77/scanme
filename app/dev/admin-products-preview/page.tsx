import { notFound } from "next/navigation";
import { AdminProductsPreview } from "@/components/admin/admin-products-surface";
import { AdminShell } from "@/components/admin/admin-shell";
import { getDict } from "@/lib/i18n";

const dict = getDict("admin-products");

export default function AdminProductsPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <AdminShell previewIdentity={dict.fixtureIdentity} activePathname="/admin/operativa/proizvodi"><AdminProductsPreview /></AdminShell>;
}
