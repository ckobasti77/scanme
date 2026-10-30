import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { FinanceSurface } from "@/components/admin/admin-finance";
import { adminFinanceSr as dict } from "@/lib/i18n/sr/admin-finance";

export default function AdminFinancePreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <AdminShell previewIdentity={dict.previewBadge} activePathname="/admin/finansije"><FinanceSurface preview /></AdminShell>;
}
