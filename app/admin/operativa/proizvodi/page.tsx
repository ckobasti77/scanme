import type { Metadata } from "next";
import { AdminGuard } from "@/components/admin/admin-guard";
import { AdminProductsErrorBoundary, AdminProductsWorkspace } from "@/components/admin/admin-products";
import { AdminShell } from "@/components/admin/admin-shell";
import { adminProductsSr } from "@/lib/i18n/sr/admin-products";

export const metadata: Metadata = {
  title: `${adminProductsSr.pageTitle} | ScanMe Admin`,
  robots: { index: false, follow: false },
};

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ venue?: string; product?: string; smf?: string }> }) {
  const { venue, product, smf } = await searchParams;
  return <AdminGuard><AdminShell><AdminProductsErrorBoundary><AdminProductsWorkspace initialVenueId={venue} initialProductId={product} initialSmfCode={smf} /></AdminProductsErrorBoundary></AdminShell></AdminGuard>;
}
