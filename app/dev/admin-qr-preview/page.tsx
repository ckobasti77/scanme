import { notFound } from "next/navigation";
import { AdminQrPreview } from "@/components/admin/admin-qr";
import { AdminShell } from "@/components/admin/admin-shell";
import { getDict } from "@/lib/i18n";
import type { Metadata } from "next";
import { adminTitle } from "@/lib/admin-v2/frame/titles";

const dict = getDict("admin-products");

export const metadata: Metadata = { title: adminTitle(dict.qrModuleTitle), robots: { index: false, follow: false } };

export default function AdminQrPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <AdminShell previewIdentity={dict.fixtureIdentity} activePathname="/admin/operativa/qr"><AdminQrPreview /></AdminShell>;
}
