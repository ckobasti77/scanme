import Link from "next/link";
import { CarFront, MapPin } from "lucide-react";
import type { FairModelDict } from "@/lib/i18n";
import { GarageBadge } from "./garage-controls";

export function FairEventShell({
  eventId,
  eventSlug,
  eventTitle,
  eventName,
  dict,
}: {
  eventId: string;
  eventSlug: string;
  eventTitle: string;
  eventName: string;
  dict: FairModelDict;
}) {
  return (
    <header className="fair-shell">
      <div className="fair-shell__inner">
        <div className="fair-event-lockup" aria-label={`${eventTitle}, ${eventName}`}>
          <span className="fair-event-lockup__mark" aria-hidden="true" />
          <span>
            <strong>{eventTitle}</strong>
            <small>{eventName}</small>
          </span>
        </div>

        <nav className="fair-shell__nav" aria-label={eventTitle}>
          <Link prefetch={false} href={`/sajam/${eventSlug}`}>
            <MapPin aria-hidden="true" />
            <span>{dict.mapNav}</span>
          </Link>
          <Link prefetch={false} href="/sajam/garaza" className="fair-garage-link">
            <span className="fair-garage-icon">
              <CarFront aria-hidden="true" />
              <GarageBadge eventId={eventId} ariaTemplate={dict.garageCountAria} />
            </span>
            <span>{dict.garageNav}</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}
