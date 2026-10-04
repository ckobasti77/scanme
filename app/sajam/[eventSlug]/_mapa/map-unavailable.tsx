import { fairMapSr as dict } from "@/lib/i18n/sr/fair-map";
import styles from "./map-states.module.css";

/** Honest error state; the retry is a plain reload of the same page (works without JS). */
export function MapUnavailable({ eventSlug }: { eventSlug: string }) {
  return (
    <div className={styles.state} role="alert">
      <h2>{dict.errorTitle}</h2>
      <p>{dict.errorBody}</p>
      <a href={`/sajam/${eventSlug}`}>{dict.retry}</a>
    </div>
  );
}
