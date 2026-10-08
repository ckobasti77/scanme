import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FairAdminTools } from "@/components/fair/admin/fair-admin-tools";
import { FairEventShell } from "@/components/fair/event-shell";
import { FairPassportExperience } from "@/components/fair/passport/fair-passport";
import { loadFairPassportPage } from "@/lib/fair-server/passport-page";
import { fairEventThemeClass } from "@/lib/fair-theme";
import { fairModelSr } from "@/lib/i18n/sr/fair-model";
import { fairPassportSr as dict } from "@/lib/i18n/sr/fair-passport";

type RouteParams = { eventSlug: string };
type RouteSearchParams = Record<string, string | string[] | undefined>;

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: dict.metaTitle.replace("{event}", "Sajam automobila"),
  description: dict.metaDescription,
  robots: { index: false, follow: false },
};

export default async function FairPassportsPage({
  params,
  searchParams,
}: {
  params: Promise<RouteParams>;
  searchParams: Promise<RouteSearchParams>;
}) {
  const [{ eventSlug }, query] = await Promise.all([params, searchParams]);
  const devTools = process.env.NODE_ENV === "development" && (Array.isArray(query.dev) ? query.dev[0] : query.dev) === "1";
  const data = await loadFairPassportPage(eventSlug).catch(() => null);
  if (!data) notFound();

  return (
    <div
      className={`fair-event ${fairEventThemeClass(eventSlug)}`}
      data-reveal="off"
    >
      <FairEventShell
        eventId={data.event.id}
        eventSlug={eventSlug}
        eventTitle={dict.umbrellaTitle}
        eventName={data.event.title}
        dict={fairModelSr}
        current="passports"
        adminTools={<FairAdminTools event={{ id: data.event.id, slug: eventSlug, dataSlug: data.event.slug, title: data.event.title }} />}
      />
      <FairPassportExperience
        event={{ id: data.event.id, publicSlug: eventSlug, dataSlug: data.event.slug, title: data.event.title }}
        catalog={data.catalog}
        models={data.models}
        dict={dict}
        devTools={devTools}
        showDevEntry={process.env.NODE_ENV === "development"}
      />
    </div>
  );
}
