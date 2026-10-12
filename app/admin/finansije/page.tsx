import { Suspense } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import { AdminFinanceErrorBoundary, FinanceSurface } from "@/components/admin/admin-finance";
import { AdminLoadingState, AdminPanel } from "@/components/admin/admin-primitives";
import type { Metadata } from "next";
import { adminTitle } from "@/lib/admin-v2/frame/titles";
import { adminFinanceSr } from "@/lib/i18n/sr/admin-finance";

export const metadata: Metadata = { title: adminTitle(adminFinanceSr.pageTitle), robots: { index: false, follow: false } };

export default async function FinancePage({ searchParams }: { searchParams: Promise<{ account?: string }> }) {
  const { account } = await searchParams;
  return <AdminFinanceErrorBoundary><Suspense fallback={<AdminPanel><AdminLoadingState /></AdminPanel>}><FinanceSurface accountId={account as Id<"accounts"> | undefined} /></Suspense></AdminFinanceErrorBoundary>;
}
