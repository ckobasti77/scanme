"use client";

import { FairBrandHero } from "./brand-hero";
import { FairBrandModelRow } from "./brand-model-row";
import { getDict } from "@/lib/i18n";
import { fmt } from "@/lib/i18n/format";
import type { FairBrandPageData } from "@/lib/fair-server/brand-page";
import styles from "./brand-page.module.css";

/** /sajam/<event>/brend/<brand>: header card + the "MODELI NA ŠTANDU" label row + one row per
 * packaged model. `onDrive`/`onInterest` arrive from the route once cards 05/06 add the forms,
 * `requestedSlugs` (cards 06/07) marks the models this visitor already applied for. */
export function FairBrandPage({ data, requestedSlugs = [], onDrive, onInterest }: {
  data: FairBrandPageData;
  /** Slugs this visitor already submitted in this session — their pills read "Prijavljeno". */
  requestedSlugs?: readonly string[];
  onDrive?: (slugs: string[]) => void;
  onInterest?: () => void;
}) {
  const dict = getDict("fair-brand");
  return (
    <section className={styles.page}>
      <FairBrandHero
        dict={dict}
        brandName={data.brand.name}
        modelCount={data.models.length}
        modelNames={data.models.map((model) => model.name).join(", ")}
        eventSlug={data.eventSlug}
        brandSlug={data.brandSlug}
        hasPassport={data.hasPassport}
        onDrive={onDrive ? () => onDrive([]) : undefined}
        onInterest={onInterest}
      />
      <div className={styles.lbl}>
        <span>{dict.modelsOnStandLabel}</span>
        <span>{fmt("{count} {unit}", { count: String(data.models.length), unit: dict.modelsOnStandWord(data.models.length) })}</span>
      </div>
      <ul className={styles.list}>
        {data.models.map((model) => (
          <li key={model.id}>
            <FairBrandModelRow
              dict={dict}
              model={model}
              brandName={data.brand.name}
              eventSlug={data.eventSlug}
              requested={requestedSlugs.includes(model.slug)}
              onDrive={onDrive}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
