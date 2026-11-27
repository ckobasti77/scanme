import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FairBrandPage } from "@/components/fair/brand/brand-page";
import { FairEventShell } from "@/components/fair/event-shell";
import { loadFairBrandPage } from "@/lib/fair-server/brand-page";
import { fairSalonBrand } from "@/lib/fair-salon";
import { fairEventThemeClass } from "@/lib/fair-theme";
import { fmt } from "@/lib/i18n/format";
import { fairModelSr } from "@/lib/i18n/sr/fair-model";
import { fairPassportSr as dict } from "@/lib/i18n/sr/fair-passport";

type RouteParams = { eventSlug: string; brandSlug: string };

// Same freshness as the passport route (app/sajam/[eventSlug]/pasosi/[brandSlug]/page.tsx):
// brand and model data change without a deploy.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<RouteParams> }): Promise<Metadata> {
  const { eventSlug, brandSlug } = await params;
  const data = await loadFairBrandPage(eventSlug, brandSlug);
  if (!data) return { title: fairModelSr.notFoundTitle, robots: { index: false, follow: false } };
  return {
    // Card rule: "<brand name> | <fair name>" — `metaTitle` is "{model} | {event}".
    title: fmt(fairModelSr.metaTitle, { model: data.brand.name, event: data.eventName }),
    robots: { index: false, follow: false },
  };
}

export default async function FairBrandPageRoute({
  params,
  searchParams,
}: {
  params: Promise<RouteParams>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ eventSlug, brandSlug }, query] = await Promise.all([params, searchParams]);
  const data = await loadFairBrandPage(eventSlug, brandSlug);
  if (!data) notFound();
  // Auto Expo: the brand page is the brand's salon (lib/fair-salon.ts).
  const salonBrand = fairSalonBrand(eventSlug, brandSlug);
  const salon = salonBrand ? { brand: salonBrand } : null;
  const drive = (Array.isArray(query.voznja) ? query.voznja[0] : query.voznja) === "1";

  return (
    <div className={`fair-event ${fairEventThemeClass(eventSlug)}`} data-reveal="off">
      <FairEventShell
        eventId={data.eventId}
        eventSlug={eventSlug}
        eventTitle={dict.umbrellaTitle}
        eventName={data.eventName}
        dict={fairModelSr}
        {...(salon ? { currentBrand: brandSlug } : { current: "passports" as const })}
      />
      <FairBrandPage data={data} salon={salon} initialDrive={drive} />
    </div>
  );
}
