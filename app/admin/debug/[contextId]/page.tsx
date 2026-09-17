import type { Metadata } from "next";
import { AdminDebugSupport } from "@/components/admin/admin-debug-support";
import { AdminGuard } from "@/components/admin/admin-guard";
import { AdminShell } from "@/components/admin/admin-shell";
import type { Id } from "@/convex/_generated/dataModel";
import { adminSearchSr } from "@/lib/i18n/sr/admin-search";

export const metadata: Metadata = {
  title: `${adminSearchSr.debugMode} | ScanMe Admin`,
  robots: { index: false, follow: false },
};

export default async function AdminDebugPage({
  params,
}: {
  params: Promise<{ contextId: string }>;
}) {
  const { contextId } = await params;
  return (
    <AdminGuard>
      <AdminShell>
        <AdminDebugSupport contextId={contextId as Id<"adminDebugContexts">} />
      </AdminShell>
    </AdminGuard>
  );
}
