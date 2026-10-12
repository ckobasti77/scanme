import { notFound } from "next/navigation";
import { AdminProductsPreview } from "@/components/admin/admin-products-surface";
import { AdminShell } from "@/components/admin/admin-shell";
import { getDict } from "@/lib/i18n";
import type { Metadata } from "next";
import { adminTitle } from "@/lib/admin-v2/frame/titles";

const dict = getDict("admin-products");

export const metadata: Metadata = { title: adminTitle(dict.pageTitle), robots: { index: false, follow: false } };

export default function AdminProductsPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <AdminShell previewIdentity={dict.fixtureIdentity} activePathname="/admin/operativa/proizvodi"><AdminProductsPreview /></AdminShell>;
}
