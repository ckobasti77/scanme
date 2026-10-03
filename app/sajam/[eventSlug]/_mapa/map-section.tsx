import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { FairEventMap } from "@/components/fair/map/fair-event-map";
import { buildFairMapView, fairMapForEventCode } from "@/lib/fair-map";
import { fairMapSr as dict } from "@/lib/i18n/sr/fair-map";
import { MapUnavailable } from "./map-unavailable";
import styles from "./map-states.module.css";

/** Streams in under the shell: catalog (by mapLocationId) + passport catalog, joined with the M0 geometry. */
export async function MapSection({ eventSlug, eventCode, display }: { eventSlug: string; eventCode: string; display: boolean }) {
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
    ]);
  } catch {
    return <MapUnavailable eventSlug={eventSlug} />;
  }
  const [map, passports] = data;
  const view = buildFairMapView(geometry, map?.stands ?? [], passports?.catalog ?? []);
  return <FairEventMap eventSlug={eventSlug} view={view} display={display} />;
}
