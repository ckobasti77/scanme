"use client";

import Link from "next/link";
import { fmt } from "@/lib/i18n/format";
import { fairModelSr } from "@/lib/i18n/sr/fair-model";
import type { FairBrandDict } from "@/lib/i18n/types";
import styles from "./brand-hero.module.css";

// Stroke icons copied from docs/mockups/stranica-brenda-mockup.html (IC.steer / IC.mail / IC.info).
function SteerIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="2.2" />
      <path d="M12 21s-7-4.2-7-9" />
      <path d="M12 21s7-4.2 7-9" />
      <path d="M12 9.8V3" />
      <path d="m5.1 10.5 5.1-2.2" />
      <path d="m13.8 8.3 5.1 2.2" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="M3.5 7.5 12 13l8.5-5.5" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 8h.01" />
    </svg>
  );
}

/** Brand page header (docs/mockups/stranica-brenda-mockup.html .bcard): the brand postcard —
 * eyebrow, 44px brand name, dashed passport stamp, model count line, the drive CTA + interest
 * button, and the no-app hint. `onDrive`/`onInterest` are optional until card 05/06 wires the
 * forms into the route; the stamp only shows when the brand has a passport page to open. */
export function FairBrandHero({ dict, brandName, modelCount, modelNames, eventSlug, brandSlug, hasPassport, onDrive, onInterest }: {
  dict: FairBrandDict;
  brandName: string;
  /** Packaged models on this brand's stand — every count noun on the brand page declines from this number. */
  modelCount: number;
  /** Comma-joined model names for the sub line (projection order, never re-sorted). */
  modelNames: string;
  eventSlug: string;
  brandSlug: string;
  hasPassport: boolean;
  /** Optional until the drive form (card 05) and interest form (card 06) open from the route. */
  onDrive?: () => void;
  onInterest?: () => void;
}) {
  return (
    <header className={styles.card}>
      <div className={styles.top}>
        <div>
          <span className={styles.eyebrow}>{dict.eyebrow}</span>
          <h1 className={styles.name}>{brandName}</h1>
          <p className={styles.sub}>{dict.modelsOnStand(modelCount)} · {modelNames}</p>
        </div>
        {hasPassport && (
          <Link
            className={`${styles.stamp} ${styles.stampLink}`}
            href={`/sajam/${eventSlug}/pasosi/${brandSlug}`}
            aria-label={fmt(dict.passportStampAria, { brand: brandName })}
          ><span>{dict.passportStampLabel}</span></Link>
        )}
      </div>
      <div className={styles.btns}>
        <button type="button" className={`${styles.btn} ${styles.drive}`} onClick={() => onDrive?.()}>
          <SteerIcon />{dict.driveButton}
        </button>
        <button type="button" className={`${styles.btn} ${styles.interest}`} onClick={() => onInterest?.()}>
          <MailIcon />{fairModelSr.submitInterest}
        </button>
      </div>
      <p className={styles.hint}><InfoIcon />{dict.hint}</p>
    </header>
  );
}
