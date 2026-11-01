import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AdminFrameGate } from "@/components/admin/frame/admin-frame-gate";

// ADMIN v2 — the persistent admin layout: the guard and the frame (sidebar,
// navbar, screen) are rendered once here and stay mounted while the pages
// change. `/admin/login` and the Links editor stay without the frame
// (lib/admin-v2/frame/routes.ts). The title is the fallback of a page that
// sets none.
export const metadata: Metadata = {
  title: "ScanMe Admin",
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminFrameGate>{children}</AdminFrameGate>;
}
