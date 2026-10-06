import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { AdminEventsPreview } from "@/components/admin/admin-events-preview";
import { eventRedirectHref, eventSectionTitle, resolveEventSection, type ResolvedEventSection } from "@/lib/admin-v1/event-sections";
import { parseAdminQuery } from "@/lib/admin-v1/query-state";

// Admin UX A2 — the `Događaji` sections with TEST fixtures, on the same paths
// as `/admin/dogadjaji/[eventSlug]/<sekcija>`, without Convex. No segment
// shows Pregled; a former Interakcije page redirects like the admin does.
// Not available in production.

type Props = {
  params: Promise<{ section?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { section } = await params;
  return { title: `${eventSectionTitle(resolveEventSection(section))} | ScanMe Admin`, robots: { index: false, follow: false } };
}

export default async function AdminEventsPreviewPage({ params, searchParams }: Props) {
  if (process.env.NODE_ENV === "production") notFound();
  const { section } = await params;
  const resolved = resolveEventSection(section);
  if (resolved?.kind === "redirect" && section?.length) {
    const query = await searchParams;
    redirect(eventRedirectHref("/dev/admin-events-preview", resolved, query, parseAdminQuery(query, ["dogadjaj"])));
  }
  const shown: ResolvedEventSection | null = resolved?.kind === "redirect" ? { kind: "section", path: resolved.path } : resolved;
  return (
    <Suspense>
      <AdminEventsPreview section={shown} />
    </Suspense>
  );
}
