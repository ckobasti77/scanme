import type { ReactNode } from "react";
import Link from "next/link";
import { CarFront, MapPin, Stamp } from "lucide-react";
import type { FairModelDict } from "@/lib/i18n";
import { GarageBadge } from "./garage-controls";
import { RememberFairShell } from "./event-shell-memory";
import { FAIR_PUBLIC_MAP_ENABLED } from "@/lib/fair-contract";
import { fairSalonEvent } from "@/lib/fair-salon";
import { FairBrandIcon } from "./brand-icons";
import { getDict } from "@/lib/i18n";
import { fmt } from "@/lib/i18n/format";

export function FairEventShell({
  eventId,
  eventSlug,
  eventTitle,
  eventName,
  dict,
  current,
  currentBrand,
  adminTools,
}: {
  eventId: string;
  eventSlug: string;
  eventTitle: string;
  eventName: string;
  dict: FairModelDict;
  current?: "map" | "passports" | "garage";
  /** Brand salon open right now (`brandSlug`), for events with a salon (lib/fair-salon.ts). */
  currentBrand?: string;
  /** Admin DEV tools (components/fair/admin): null for every visitor. */
  adminTools?: ReactNode;
}) {
  const demo = eventSlug === "demo-auto-moto-fest-2026";
  // Auto Expo: the "Mapa" item becomes one item per brand salon (owner, 27. 11.).
  const salon = fairSalonEvent(eventSlug);
  const mapEnabled = !salon && (FAIR_PUBLIC_MAP_ENABLED || demo);
  const baseSlug = eventSlug.replace(/^test-/, "");
  const salonName = {
    name: baseSlug.replace(/-\d{4}$/, "").replace(/-/g, " "),
    year: baseSlug.match(/-(\d{4})$/)?.[1] ?? "",
    full: eventName || baseSlug.replace(/-/g, " "),
  };
  const baseEventName = demo || eventSlug.replace(/^test-/, "") === "auto-moto-fest-2026" ? dict.autoMotoEventName : eventName
    .replace(/^TEST\s+/i, "")
    .replace(/\s+2026\s*$/i, "")
    .trim();
  const publicEventName = demo ? fmt(getDict("fair-demo").headerLabel, { event: baseEventName }) : baseEventName;
  return (
    <header className="fair-shell">
      <div className="fair-shell__inner">
        {salon ? (
          // With the map gone, the lockup is the way back to the entry with the brand tiles. It
          // reads like the fair's own logo: "AUTO EXPO" over the year (from the slug, so the
          // loading shell shows it too).
          <Link href={`/sajam/${eventSlug}`} className="fair-event-lockup" aria-label={salonName.full}>
            <span className="fair-event-lockup__mark" aria-hidden="true" />
            <span>
              <strong>{salonName.name}</strong>
              <small>{salonName.year}</small>
            </span>
          </Link>
        ) : (
          <div className="fair-event-lockup" aria-label={`${eventTitle}, ${publicEventName}`}>
            <span className="fair-event-lockup__mark" aria-hidden="true" />
            <span>
              <strong>{eventTitle}</strong>
              <small>{publicEventName}</small>
            </span>
          </div>
        )}

        <nav className="fair-shell__nav" aria-label={eventTitle}>
          {salon?.brands.map((brand) =>
            currentBrand === brand.brandSlug ? (
              <span key={brand.brandSlug} className="fair-shell__current" aria-current="page"><FairBrandIcon brandSlug={brand.brandSlug} aria-hidden="true" /><span>{brand.name}</span></span>
            ) : (
              <Link key={brand.brandSlug} href={`/sajam/${eventSlug}/brend/${brand.brandSlug}`}><FairBrandIcon brandSlug={brand.brandSlug} aria-hidden="true" /><span>{brand.name}</span></Link>
            ),
          )}
          {!mapEnabled ? null : current === "map" ? (
            <span className="fair-shell__current" aria-current="page"><MapPin aria-hidden="true" /><span>{dict.mapNav}</span></span>
          ) : (
            <Link href={`/sajam/${eventSlug}${demo ? "/mapa" : ""}`}><MapPin aria-hidden="true" /><span>{dict.mapNav}</span></Link>
          )}
          {current === "passports" ? (
            <span className="fair-shell__current" aria-current="page"><Stamp aria-hidden="true" /><span>{dict.passportsNav}</span></span>
          ) : (
            <Link href={`/sajam/${eventSlug}/pasosi`}><Stamp aria-hidden="true" /><span>{dict.passportsNav}</span></Link>
          )}
          {current === "garage" ? (
            <span className="fair-garage-link fair-shell__current" aria-current="page">
              <span className="fair-garage-icon" data-garage-target><CarFront aria-hidden="true" /><GarageBadge eventId={eventId} eventSlug={eventSlug} ariaTemplate={dict.garageCountAria} /></span>
              <span>{dict.garageNav}</span>
            </span>
          ) : (
            <Link href={`/sajam/${eventSlug}/garaza`} className="fair-garage-link">
              <span className="fair-garage-icon" data-garage-target><CarFront aria-hidden="true" /><GarageBadge eventId={eventId} eventSlug={eventSlug} ariaTemplate={dict.garageCountAria} /></span>
              <span>{dict.garageNav}</span>
            </Link>
          )}
        </nav>
      </div>
      {adminTools}
      {eventId ? <RememberFairShell eventSlug={eventSlug} eventId={eventId} eventName={eventName} /> : null}
    </header>
  );
}
