import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminQrErrorBoundary, AdminQrWorkspace } from "@/components/admin/admin-qr-workspace";
import { legacySearchHref } from "@/lib/admin-v2/query/legacy-param";
import { adminProductsSr } from "@/lib/i18n/sr/admin-products";

export const metadata: Metadata = {
  title: `${adminProductsSr.qrModuleTitle} | ScanMe Admin`,
  robots: { index: false, follow: false },
};

// ADMIN v2: the filters are read from the URL by the page itself; an older `?code=` link becomes `?q=`.
export default async function QrPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const legacy = legacySearchHref("/admin/operativa/qr", params, "code");
  if (legacy) redirect(legacy);
  const channel = typeof params.channel === "string" ? params.channel : undefined;
  return <AdminQrErrorBoundary><AdminQrWorkspace initialChannelId={channel} /></AdminQrErrorBoundary>;
}
