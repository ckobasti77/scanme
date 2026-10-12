import type { Metadata } from "next";
import { AdminQrErrorBoundary, AdminQrWorkspace } from "@/components/admin/admin-qr-workspace";
import { adminProductsSr } from "@/lib/i18n/sr/admin-products";

export const metadata: Metadata = {
  title: `${adminProductsSr.qrModuleTitle} | ScanMe Admin`,
  robots: { index: false, follow: false },
};

export default async function QrPage({ searchParams }: { searchParams: Promise<{ channel?: string; code?: string }> }) {
  const { channel, code } = await searchParams;
  return <AdminQrErrorBoundary><AdminQrWorkspace initialChannelId={channel} initialCode={code} /></AdminQrErrorBoundary>;
}
