"use client";

import { useState } from "react";
import { FairBrandHero } from "./brand-hero";
import { FairBrandLeadSheet } from "./brand-lead-sheet";
import { FairBrandModelRow } from "./brand-model-row";
import { getDict } from "@/lib/i18n";
import { fmt } from "@/lib/i18n/format";
import type { FairBrandPageData } from "@/lib/fair-server/brand-page";
import styles from "./brand-page.module.css";

/** /sajam/<event>/brend/<brand>: header card + the "MODELI NA ŠTANDU" label row + one row per
 * packaged model. The page now owns its lead state end to end (card 05e): the hero buttons and
 * the row pills open `FairBrandLeadSheet` here, and `requested` marks the models this visitor
 * already sent in this session — no props arrive from the route anymore. */
export function FairBrandPage({ data }: { data: FairBrandPageData }) {
  const dict = getDict("fair-brand");
  const [sheet, setSheet] = useState<{ kind: "testDrive" | "interest"; preselectedIds: string[] } | null>(null);
  const [requestedIds, setRequestedIds] = useState<string[]>([]);
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
        onDrive={() => setSheet({ kind: "testDrive", preselectedIds: [] })}
        onInterest={() => setSheet({ kind: "interest", preselectedIds: [] })}
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
              requested={requestedIds.includes(model.id)}
              onDrive={(slugs) => {
                const picked = data.models.find((entry) => entry.slug === slugs[0]);
                setSheet({ kind: "testDrive", preselectedIds: picked ? [picked.id] : [] });
              }}
            />
          </li>
        ))}
      </ul>
      {sheet !== null && (
        <FairBrandLeadSheet
          kind={sheet.kind}
          brandName={data.brand.name}
          models={data.models}
          leadForms={data.leadForms}
          preselectedIds={sheet.preselectedIds}
          onClose={() => setSheet(null)}
          onSent={({ ids }) => {
            setRequestedIds((prev) => [...new Set([...prev, ...ids])]);
            setSheet(null);
          }}
        />
      )}
    </section>
  );
}