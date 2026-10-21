import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import AdminLayout from "@/app/admin/layout";
import { AdminGuardPreview, type AdminGuardPreviewState } from "@/components/admin/frame/admin-guard-preview";

// ADMIN v2 — the real admin layout (app/admin/layout.tsx: the guard and the
// frame) in each state of the guard, without signing in:
// `/dev/admin-cuvar-preview/provera | neprijavljen | bez-prava | admin`.
// The identity is a TEST answer of `admin.me`; not available in production.
export const metadata: Metadata = { title: "Čuvar (TEST) | ScanMe Admin", robots: { index: false, follow: false } };

const STATES: readonly AdminGuardPreviewState[] = ["provera", "neprijavljen", "bez-prava", "admin"];

export default async function AdminGuardPreviewLayout({ children, params }: { children: ReactNode; params: Promise<{ stanje: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { stanje } = await params;
  const state = STATES.find((item) => item === stanje);
  if (!state) notFound();
  return (
    <AdminGuardPreview state={state}>
      <AdminLayout>{children}</AdminLayout>
    </AdminGuardPreview>
  );
}
