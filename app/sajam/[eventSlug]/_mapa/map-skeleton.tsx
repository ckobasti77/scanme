import { fairMapSr as dict } from "@/lib/i18n/sr/fair-map";
import styles from "./map-states.module.css";

/**
 * Keeps the final map layout while the catalog loads (EDS §7): intro, search,
 * zones, filters and the map; on a computer the fixed right panel too, so
 * nothing moves when the content arrives.
 */
export function MapSkeleton() {
  return (
    <div className={styles.skeleton} aria-busy="true">
      <span className={styles.srOnly} role="status">
        {dict.loadingLabel}
      </span>
      <div className={styles.skeletonMain}>
        <div className={styles.skeletonIntro} />
        <div className={styles.skeletonBar} />
        <div className={styles.skeletonPill} />
        <div className={styles.skeletonChips}>
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className={styles.skeletonMap} />
      </div>
      <div className={styles.skeletonPanel} aria-hidden="true">
        <div className={styles.skeletonCard} />
        <div className={styles.skeletonCardSmall} />
      </div>
    </div>
  );
}
