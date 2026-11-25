"use client";

import { useState } from "react";
import { FairBrandHero } from "./brand-hero";
import { FairBrandLeadSheet } from "./brand-lead-sheet";
import { FairBrandLeadSuccess } from "./brand-lead-success";
import { FairBrandModelRow } from "./brand-model-row";
import { getDict } from "@/lib/i18n";
import { fmt } from "@/lib/i18n/format";
import type { FairBrandPageData } from "@/lib/fair-server/brand-page";
import styles from "./brand-page.module.css";

/** /sajam/<event>/brend/<brand>: header card + the "MODELI NA ŠTANDU" label row + one row per
 * packaged model. The page now owns its lead state end to end (card 05e): the hero buttons and
 * the row pills open `FairBrandLeadSheet` here, and `requested` marks the models this visitor
 * already sent in this session — no props arrive from the route anymore. After a lead is sent
 * the page keeps its `success` record (card 06b) and renders `FairBrandLeadSuccess` in place of
 * the hero + list until the visitor leaves the confirmation or starts another lead. */
export function FairBrandPage({ data }: { data: FairBrandPageData }) {
  const dict = getDict("fair-brand");
  const [sheet, setSheet] = useState<{ kind: "testDrive" | "interest"; preselectedIds: string[] } | null>(null);
  const [requestedIds, setRequestedIds] = useState<string[]>([]);
  // What the sheet's onSent came with (card 06b): the kind of the closed sheet, the ids it sent
  // and the contact line as the payload had it — FairBrandLeadSuccess renders these verbatim.
  const [success, setSuccess] = useState<{ kind: "testDrive" | "interest"; ids: string[]; contactLine: string } | null>(null);
  return (
    <section className={styles.page}>
      {/* Card 06b: once a lead is sent, the confirmation screen from `success` replaces the
          hero + label row + list for the rest of the visit; the sheet block stays below. */}
      {success === null ? (
        <>
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
        </>
      ) : (
        // Sent models in the brand's own order (success.ids is the pick order, not the stand
        // order); priceText travels as the string the card carries, never reparsed.
        <FairBrandLeadSuccess
          kind={success.kind}
          brandName={data.brand.name}
          models={data.models.filter((model) => success.ids.includes(model.id))}
          contactLine={success.contactLine}
          dict={dict}
          onAnother={() => {
            setSuccess(null);
            setSheet({ kind: "testDrive", preselectedIds: [] });
          }}
          onBack={() => {
            setSuccess(null);
            window.scrollTo({ top: 0 });
          }}
        />
      )}
      {sheet !== null && (
        <FairBrandLeadSheet
          kind={sheet.kind}
          brandName={data.brand.name}
          models={data.models}
          leadForms={data.leadForms}
          dict={dict}
          preselectedIds={sheet.preselectedIds}
          onClose={() => setSheet(null)}
          onSent={({ ids, contact }) => {
            setRequestedIds((prev) => [...new Set([...prev, ...ids])]);
            // Card 06b: the kind comes from the sheet this callback belongs to (non-null while
            // it renders); the contact line is "<ime> · <telefon ili email>" as the payload had it.
            setSuccess({
              kind: sheet!.kind,
              ids,
              contactLine: `${contact.contactName} · ${contact.phone ?? contact.email ?? ""}`,
            });
            setSheet(null);
          }}
        />
      )}
    </section>
  );
}