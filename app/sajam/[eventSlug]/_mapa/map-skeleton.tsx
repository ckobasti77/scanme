import { fairMapSr as dict } from "@/lib/i18n/sr/fair-map";
import styles from "./map-states.module.css";

/** Keeps the final map dimensions while the catalog loads (EDS §7). */
export function MapSkeleton() {
  return (
    <div className={styles.skeleton} aria-busy="true">
      <span className={styles.srOnly} role="status">
        {dict.loadingLabel}
      </span>
      <div className={styles.skeletonBar} />
      <div className={styles.skeletonBar} />
      <div className={styles.skeletonMap} />
    </div>
  );
}
