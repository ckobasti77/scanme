import type { Metadata } from "next";
import { AdminGuard } from "@/components/admin/admin-guard";
import { AdminQrErrorBoundary, AdminQrWorkspace } from "@/components/admin/admin-qr-workspace";
import { AdminShell } from "@/components/admin/admin-shell";
import { adminProductsSr } from "@/lib/i18n/sr/admin-products";

export const metadata: Metadata = {
  title: `${adminProductsSr.qrModuleTitle} | ScanMe Admin`,
  robots: { index: false, follow: false },
};

export default async function QrPage({ searchParams }: { searchParams: Promise<{ channel?: string; code?: string }> }) {
  const { channel, code } = await searchParams;
  return <AdminGuard><AdminShell><AdminQrErrorBoundary><AdminQrWorkspace initialChannelId={channel} initialCode={code} /></AdminQrErrorBoundary></AdminShell></AdminGuard>;
}
