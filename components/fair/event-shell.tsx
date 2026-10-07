import Link from "next/link";
import { CarFront, MapPin, Stamp } from "lucide-react";
import type { FairModelDict } from "@/lib/i18n";
import { GarageBadge } from "./garage-controls";

export function FairEventShell({
  eventId,
  eventSlug,
  eventTitle,
  eventName,
  dict,
  current,
}: {
  eventId: string;
  eventSlug: string;
  eventTitle: string;
  eventName: string;
  dict: FairModelDict;
  current?: "map" | "passports" | "garage";
}) {
  const publicEventName = eventName
    .replace(/^TEST\s+/i, "")
    .replace(/\s+2026\s*$/i, "")
    .trim();
  return (
    <header className="fair-shell">
      <div className="fair-shell__inner">
        <div className="fair-event-lockup" aria-label={`${eventTitle}, ${publicEventName}`}>
          <span className="fair-event-lockup__mark" aria-hidden="true" />
          <span>
            <strong>{eventTitle}</strong>
            <small>{publicEventName}</small>
          </span>
        </div>

        <nav className="fair-shell__nav" aria-label={eventTitle}>
          {current === "map" ? (
            <span className="fair-shell__current" aria-current="page"><MapPin aria-hidden="true" /><span>{dict.mapNav}</span></span>
          ) : (
            <Link prefetch={false} href={`/sajam/${eventSlug}`}><MapPin aria-hidden="true" /><span>{dict.mapNav}</span></Link>
          )}
          {current === "passports" ? (
            <span className="fair-shell__current" aria-current="page"><Stamp aria-hidden="true" /><span>{dict.passportsNav}</span></span>
          ) : (
            <Link prefetch={false} href={`/sajam/${eventSlug}/pasosi`}><Stamp aria-hidden="true" /><span>{dict.passportsNav}</span></Link>
          )}
          {current === "garage" ? (
            <span className="fair-garage-link fair-shell__current" aria-current="page">
              <span className="fair-garage-icon" data-garage-target><CarFront aria-hidden="true" /><GarageBadge eventId={eventId} eventSlug={eventSlug} ariaTemplate={dict.garageCountAria} /></span>
              <span>{dict.garageNav}</span>
            </span>
          ) : (
            <Link prefetch={false} href={`/sajam/${eventSlug}/garaza`} className="fair-garage-link">
              <span className="fair-garage-icon" data-garage-target><CarFront aria-hidden="true" /><GarageBadge eventId={eventId} eventSlug={eventSlug} ariaTemplate={dict.garageCountAria} /></span>
              <span>{dict.garageNav}</span>
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
