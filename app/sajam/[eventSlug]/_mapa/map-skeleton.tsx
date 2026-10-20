import { fairMapSr as dict } from "@/lib/i18n/sr/fair-map";
import { AMF_HALL_ANCHORS, AMF_TOPOGRAPHIC_SIZE, fairMapContourPath } from "@/lib/fair-map/topography";
import styles from "./map-states.module.css";

/**
 * Keeps the final map layout while the catalog loads (EDS §7): intro, search,
 * zones, filters and the map; on a computer the fixed right panel too, so
 * nothing moves when the content arrives.
 */
export function MapSkeleton({ autoMoto = false }: { autoMoto?: boolean }) {
  if (autoMoto) return (
    <div className={styles.topographicSkeleton} aria-busy="true">
      <span className={styles.srOnly} role="status">{dict.loadingLabel}</span>
      <div className={styles.topographicBar} aria-hidden="true"><span /><span /><span /></div>
      <svg className={styles.topographicPlan} viewBox={`0 0 ${AMF_TOPOGRAPHIC_SIZE.width} ${AMF_TOPOGRAPHIC_SIZE.height}`} aria-hidden="true">
        {AMF_HALL_ANCHORS.map((item) => <path key={item.key} d={fairMapContourPath(item, 0)} />)}
      </svg>
      <div className={styles.topographicFooter} aria-hidden="true" />
    </div>
  );
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
