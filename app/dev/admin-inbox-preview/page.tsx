import { notFound } from "next/navigation";
import { AdminInboxPreview } from "@/components/admin/admin-inbox";
import { AdminShell } from "@/components/admin/admin-shell";
import { adminV1Sr } from "@/lib/i18n/sr/admin-v1";
import type { Metadata } from "next";
import { adminTitle } from "@/lib/admin-v2/frame/titles";
import { communicationsSr } from "@/lib/i18n/sr/communications";

export const metadata: Metadata = { title: adminTitle(communicationsSr.inboxTitle), robots: { index: false, follow: false } };

export default function AdminInboxPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <AdminShell previewIdentity={adminV1Sr.fixtureIdentity} activePathname="/admin/inbox"><AdminInboxPreview /></AdminShell>;
}
