import { Suspense } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import { AdminFinanceErrorBoundary, FinanceSurface } from "@/components/admin/admin-finance";
import { AdminLoadingState, AdminPanel } from "@/components/admin/admin-primitives";

export default async function FinancePage({ searchParams }: { searchParams: Promise<{ account?: string }> }) {
  const { account } = await searchParams;
  return <AdminFinanceErrorBoundary><Suspense fallback={<AdminPanel><AdminLoadingState /></AdminPanel>}><FinanceSurface accountId={account as Id<"accounts"> | undefined} /></Suspense></AdminFinanceErrorBoundary>;
}
