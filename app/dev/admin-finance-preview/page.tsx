import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { FinanceSurface } from "@/components/admin/admin-finance";
import { adminFinanceSr as dict } from "@/lib/i18n/sr/admin-finance";
import { AdminViewModeOverride } from "@/components/admin/admin-ui";
import { parseViewModeParam } from "@/lib/admin-v1/view-mode";

export default async function AdminFinancePreviewPage({ searchParams }: { searchParams: Promise<{ prikaz?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { prikaz } = await searchParams;
  return <AdminShell previewIdentity={dict.previewBadge} activePathname="/admin/finansije"><AdminViewModeOverride value={parseViewModeParam(prikaz)}><FinanceSurface preview /></AdminViewModeOverride></AdminShell>;
}
