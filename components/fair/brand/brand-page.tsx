"use client";

import Link from "next/link";
import { AnimatePresence } from "framer-motion";
import { useState } from "react";
import { FAIR_PRIVACY_PATH } from "@/lib/fair-contract";
import { FairBrandHero } from "./brand-hero";
import { FairBrandLeadSheet } from "./brand-lead-sheet";
import { FairBrandLeadSuccess } from "./brand-lead-success";
import { FairBrandModelRow } from "./brand-model-row";
import { TbSteeringWheel } from "react-icons/tb";
import { FairBrandShowroom } from "./brand-showroom";
import type { FairSalonBrand } from "@/lib/fair-salon";
import { getDict } from "@/lib/i18n";
import { fmt } from "@/lib/i18n/format";
import type { FairBrandPageData } from "@/lib/fair-server/brand-page";
import passport from "../passport/stamp-passport.module.css";
import styles from "./brand-page.module.css";

/** /sajam/<event>/brend/<brand>: header card + the "MODELI NA ŠTANDU" label row + one row per
 * packaged model. The page owns its lead state: the hero buttons and the row pills open
 * `FairBrandLeadSheet` here, and `requested` marks the models this visitor already sent while on
 * the page. After a lead is sent the page keeps its `success` record and renders
 * `FairBrandLeadSuccess` in place of the hero + list until the visitor leaves the confirmation
 * or starts another lead. */
export function FairBrandPage({ data, salon, initialDrive = false }: {
  data: FairBrandPageData;
  /** Auto Expo: the brand salon replaces the header sheet (lib/fair-salon.ts). */
  salon?: { brand: FairSalonBrand } | null;
  /** `?voznja=1` from the entry tiles: the test-drive form opens on arrival. */
  initialDrive?: boolean;
}) {
  const dict = getDict("fair-brand");
  const modelDict = getDict("fair-model");
  const salonDict = getDict("fair-salon");
  const [sheet, setSheet] = useState<{ kind: "testDrive" | "interest"; preselectedIds: string[] } | null>(
    initialDrive ? { kind: "testDrive", preselectedIds: [] } : null,
  );
  const [requestedIds, setRequestedIds] = useState<string[]>([]);
  // What the sheet's onSent came with: the kind of the closed sheet, the ids it sent
  // and the contact line as the payload had it — FairBrandLeadSuccess renders these verbatim.
  const [success, setSuccess] = useState<{ kind: "testDrive" | "interest"; ids: string[]; contactLine: string } | null>(null);
  const openDrive = (modelId: string | null) => setSheet({ kind: "testDrive", preselectedIds: modelId ? [modelId] : [] });
  return (
    <>
    {/* The stamp passport's 560px column (same width, padding and paper variables as the
        passport and model pages), then the fair footer. */}
    <main className={salon && success === null ? styles.salonPage : `${passport.main} ${styles.page}`}>
      {/* Once a lead is sent, the confirmation screen from `success` replaces the hero +
          label row + list until the visitor leaves it; the sheet block stays below. */}
      {success === null ? (
        <>
          {salon ? (
            <FairBrandShowroom
              brand={salon.brand}
              models={data.models}
              eventSlug={data.eventSlug}
              requestedIds={requestedIds}
              onDrive={openDrive}
              onInterest={(modelId) => setSheet({ kind: "interest", preselectedIds: modelId ? [modelId] : [] })}
            />
          ) : (
          <>
          <FairBrandHero
            dict={dict}
            brandName={data.brand.name}
            standLabel={data.standLabel}
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
          )}
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
      <AnimatePresence>
      {sheet !== null && (
        <FairBrandLeadSheet
          key={sheet.kind}
          kind={sheet.kind}
          brandName={data.brand.name}
          standLabel={data.standLabel}
          models={data.models}
          leadForms={data.leadForms}
          dict={dict}
          preselectedIds={sheet.preselectedIds}
          onClose={() => setSheet(null)}
          onPartialSent={(ids) => setRequestedIds((prev) => [...new Set([...prev, ...ids])])}
          onSent={({ ids, contact }) => {
            setRequestedIds((prev) => [...new Set([...prev, ...ids])]);
            // The kind comes from the sheet this callback belongs to (non-null while
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
      </AnimatePresence>
      {salon && success === null ? <div className={styles.stickySpacer} aria-hidden="true" /> : null}
    </main>
    {salon && success === null && sheet === null ? (
      <div className={styles.sticky}>
        <button type="button" className={styles.leadPrimary} onClick={() => openDrive(null)}>
          <TbSteeringWheel aria-hidden="true" />
          {salonDict.stickyDrive}
        </button>
      </div>
    ) : null}
    <footer className="fair-footer">
      <span>{modelDict.poweredBy}</span>
      <Link prefetch={false} href={FAIR_PRIVACY_PATH} className="fair-dev-entry">{modelDict.privacyLink}</Link>
    </footer>
    </>
  );
}