import { Suspense } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import { AdminGuard } from "@/components/admin/admin-guard";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminFinanceErrorBoundary, FinanceSurface } from "@/components/admin/admin-finance";
import { AdminLoadingState, AdminPanel } from "@/components/admin/admin-primitives";

export default async function FinancePage({ searchParams }: { searchParams: Promise<{ account?: string }> }) {
  const { account } = await searchParams;
  return <AdminGuard><AdminShell><AdminFinanceErrorBoundary><Suspense fallback={<AdminPanel><AdminLoadingState /></AdminPanel>}><FinanceSurface accountId={account as Id<"accounts"> | undefined} /></Suspense></AdminFinanceErrorBoundary></AdminShell></AdminGuard>;
}
