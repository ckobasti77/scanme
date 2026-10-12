import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { PREVIEW_HUD } from "@/components/admin/events/preview-dashboard-fixtures";
import { AdminFrame } from "@/components/admin/frame/admin-frame";
import { adminV1Sr } from "@/lib/i18n/sr/admin-v1";

// ADMIN v2 — one persistent admin frame over every dev preview surface
// (`/dev/admin-okvir-preview/<oblast>`), the same way app/admin/layout.tsx
// holds it over the real pages. The frame is in this layout, so moving
// between the areas does not remount it: this is where the persistent frame
// and the page transitions are checked without signing in. TEST fixtures
// only; not available in production.
export const metadata: Metadata = { title: "Okvir (TEST) | ScanMe Admin", robots: { index: false, follow: false } };

export default function AdminFramePreviewLayout({ children }: { children: ReactNode }) {
  if (process.env.NODE_ENV === "production") notFound();
  return <AdminFrame previewIdentity={adminV1Sr.fixtureIdentity} previewHud={PREVIEW_HUD}>{children}</AdminFrame>;
}
