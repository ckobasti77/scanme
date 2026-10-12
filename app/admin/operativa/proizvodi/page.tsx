import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminProductsErrorBoundary, AdminProductsWorkspace } from "@/components/admin/admin-products";
import { legacySearchHref } from "@/lib/admin-v2/query/legacy-param";
import { adminProductsSr } from "@/lib/i18n/sr/admin-products";

export const metadata: Metadata = {
  title: `${adminProductsSr.pageTitle} | ScanMe Admin`,
  robots: { index: false, follow: false },
};

// ADMIN v2: the venue (`?venue=`) and the filters are read from the URL by the page itself; an older `?smf=` link becomes `?q=`.
export default async function ProductsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const legacy = legacySearchHref("/admin/operativa/proizvodi", params, "smf");
  if (legacy) redirect(legacy);
  const product = typeof params.product === "string" ? params.product : undefined;
  return <AdminProductsErrorBoundary><AdminProductsWorkspace initialProductId={product} /></AdminProductsErrorBoundary>;
}
