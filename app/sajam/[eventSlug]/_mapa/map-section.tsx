import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { FairEventMap } from "@/components/fair/map/fair-event-map";
import { buildFairMapView, fairMapForEventCode } from "@/lib/fair-map";
import { fairMapSr as dict } from "@/lib/i18n/sr/fair-map";
import { MapUnavailable } from "./map-unavailable";
import styles from "./map-states.module.css";

/**
 * Streams in under the shell: catalog (by mapLocationId) + passport catalog,
 * joined with the M0 geometry, plus the B5 map rotation. The rotation read here
 * is only the first state: the client keeps it live over a Convex subscription
 * (K2) and picks the active 12 s slot from its clock — no polling, no write.
 */
export async function MapSection({
  eventSlug,
  eventCode,
  display,
  link,
}: {
  eventSlug: string;
  eventCode: string;
  display: boolean;
  /** N4: `?zona=` / `?stand=` deep link (validated against the map in the client). */
  link: { zona?: string | string[]; stand?: string | string[] };
}) {
  const geometry = fairMapForEventCode(eventCode);
  if (!geometry) {
    return (
      <div className={styles.state}>
        <h2>{dict.errorTitle}</h2>
        <p>{dict.listEmpty}</p>
      </div>
    );
  }
  let data;
  try {
    data = await Promise.all([
      fetchQuery(api.fairPublic.getEventMap, { eventSlug }),
      fetchQuery(api.fairPublic.getPassportCatalog, { eventSlug }),
      fetchQuery(api.fairPublic.getSponsoredMapRotation, { eventSlug }),
    ]);
  } catch {
    return <MapUnavailable eventSlug={eventSlug} />;
  }
  const [map, passports, rotation] = data;
  const view = buildFairMapView(geometry, map?.stands ?? [], passports?.catalog ?? [], map?.exhibitorsWithoutLocation ?? []);
  return <FairEventMap eventSlug={eventSlug} view={view} initialRotation={rotation} display={display} initialLink={link} />;
}
