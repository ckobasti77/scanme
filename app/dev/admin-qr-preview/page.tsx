import { notFound } from "next/navigation";
import { AdminQrPreview } from "@/components/admin/admin-qr";
import { AdminShell } from "@/components/admin/admin-shell";
import { getDict } from "@/lib/i18n";

const dict = getDict("admin-products");

export default function AdminQrPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <AdminShell previewIdentity={dict.fixtureIdentity} activePathname="/admin/operativa/qr"><AdminQrPreview /></AdminShell>;
}
