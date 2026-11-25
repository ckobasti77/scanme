"use client";

import Link from "next/link";
import { Info, ThumbsUp } from "lucide-react";
import { TbSteeringWheel } from "react-icons/tb";
import { fmt } from "@/lib/i18n/format";
import { fairModelSr } from "@/lib/i18n/sr/fair-model";
import type { FairBrandDict } from "@/lib/i18n/types";
import passport from "../passport/stamp-passport.module.css";
import styles from "./brand-hero.module.css";

/** Brand page header (docs/mockups/stranica-brenda-mockup.html .bcard): the brand passport sheet
 * of the stamp passport (paper sheet, eyebrow, brand name, dashed seal ring) carrying the brand
 * page's own content — eyebrow ("Brend · Štand <stand>" when the stand is known), model count
 * line, the test-drive and interest buttons of the model page, and the no-app hint. The seal
 * links to the brand's passport page and only shows when there is one. */
export function FairBrandHero({ dict, brandName, standLabel, modelCount, modelNames, eventSlug, brandSlug, hasPassport, onDrive, onInterest }: {
  dict: FairBrandDict;
  brandName: string;
  /** Stand label of the brand's exhibitor; absent shows the plain "Brend" eyebrow. */
  standLabel?: string;
  /** Packaged models on this brand's stand — every count noun on the brand page declines from this number. */
  modelCount: number;
  /** Comma-joined model names for the sub line (projection order, never re-sorted). */
  modelNames: string;
  eventSlug: string;
  brandSlug: string;
  hasPassport: boolean;
  onDrive: () => void;
  onInterest: () => void;
}) {
  return (
    <header className={passport.sheet}>
      <div className={passport.head}>
        <div className={passport.headText}>
          <div className={passport.eyebrow}>{standLabel ? fmt(dict.eyebrowWithStand, { stand: standLabel }) : dict.eyebrow}</div>
          <h1 className={passport.brand}>{brandName}</h1>
          <p className={styles.sub}>{dict.modelsOnStand(modelCount)} · {modelNames}</p>
        </div>
        {hasPassport && (
          <Link
            className={`${passport.sealBox} ${styles.seal}`}
            href={`/sajam/${eventSlug}/pasosi/${brandSlug}`}
            aria-label={fmt(dict.passportStampAria, { brand: brandName })}
          >
            <span className={passport.sealGhost} aria-hidden="true">
              <b>{dict.passportStampLabel}</b>
            </span>
          </Link>
        )}
      </div>
      {/* The model page's action buttons (`.fair-action-grid`), stacked as in the mockup: the
          test drive is the highlighted one, interest the plain one. */}
      <div className={`fair-action-grid ${styles.actions}`} data-layout="stack">
        <button type="button" data-highlight="true" onClick={onDrive}>
          <span className="fair-action-highlight__shine" aria-hidden="true" />
          <TbSteeringWheel aria-hidden="true" />
          <span>{dict.driveButton}</span>
        </button>
        <button type="button" onClick={onInterest}>
          <ThumbsUp aria-hidden="true" />
          <span>{fairModelSr.submitInterest}</span>
        </button>
      </div>
      <p className={styles.hint}><Info aria-hidden="true" />{dict.hint}</p>
    </header>
  );
}
