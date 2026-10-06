import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminEventSection } from "@/components/admin/events/event-section";
import { AdminEventsNotFound } from "@/components/admin/events/event-not-found";
import { eventBasePath, eventRedirectHref, eventSectionHref, eventSectionTitle, resolveEventSection } from "@/lib/admin-v1/event-sections";
import { adminEventsSr } from "@/lib/i18n/sr/admin-events";

// Admin UX A2 — `/admin/dogadjaji/[eventSlug]/<sekcija>[/<id>]`. One optional
// catch-all over the section registry (lib/admin-v1/event-sections.ts), shared
// with the dev preview: no segment → Pregled, a former Interakcije page →
// that exhibitor's page (`?izlagac=`) or the exhibitor list, with the filters
// the target reads; an unknown path → a "not found" state with a link back.

type Props = {
  params: Promise<{ eventSlug: string; section?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { section } = await params;
  return {
    title: `${eventSectionTitle(resolveEventSection(section))} | ScanMe Admin`,
    robots: { index: false, follow: false },
  };
}

export default async function EventSectionPage({ params, searchParams }: Props) {
  const { eventSlug, section } = await params;
  const base = eventBasePath(eventSlug);
  const resolved = resolveEventSection(section);
  if (resolved?.kind === "redirect") redirect(eventRedirectHref(base, resolved, await searchParams));
  if (!resolved) {
    return <AdminEventsNotFound title={adminEventsSr.sectionNotFoundTitle} body={adminEventsSr.sectionNotFoundBody} href={eventSectionHref(base, "pregled")} linkLabel={adminEventsSr.backToOverview} />;
  }
  return <AdminEventSection path={resolved.path} detailId={resolved.detailId} />;
}
