import { fairMapSr as dict } from "@/lib/i18n/sr/fair-map";
import { AUTO_MOTO_FEST_2026_MAP } from "@/lib/fair-map/auto-moto-fest-2026";
import { fairMapPointsAttr } from "@/lib/fair-map/shape";
import styles from "./map-states.module.css";

/**
 * Keeps the final map layout while the catalog loads (EDS §7): intro, search,
 * zones, filters and the map; on a computer the fixed right panel too, so
 * nothing moves when the content arrives.
 */
export function MapSkeleton({ autoMoto = false }: { autoMoto?: boolean }) {
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
        <div className={styles.skeletonMap}>
          {autoMoto ? (
            <>
              <svg className={styles.skeletonPlan} viewBox="0 0 1375 1080" aria-hidden="true">
                {AUTO_MOTO_FEST_2026_MAP.zones[0].locations.map((location) => <polygon key={location.id} points={fairMapPointsAttr(location.polygon)} />)}
              </svg>
              <p className={styles.skeletonLabel} aria-hidden="true">{dict.loadingLabel}</p>
            </>
          ) : null}
        </div>
      </div>
      <div className={styles.skeletonPanel} aria-hidden="true">
        <div className={styles.skeletonCard} />
        <div className={styles.skeletonCardSmall} />
      </div>
    </div>
  );
}
