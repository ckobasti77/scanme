import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { FinanceSurface } from "@/components/admin/admin-finance";
import { adminFinanceSr as dict } from "@/lib/i18n/sr/admin-finance";
import type { Metadata } from "next";
import { adminTitle } from "@/lib/admin-v2/frame/titles";
import { PREVIEW_GAME } from "@/components/admin/game/game-fixtures";

export const metadata: Metadata = { title: adminTitle(dict.pageTitle), robots: { index: false, follow: false } };

export default function AdminFinancePreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <AdminShell previewIdentity={dict.previewBadge} previewGame={PREVIEW_GAME} activePathname="/admin/finansije"><FinanceSurface preview /></AdminShell>;
}
