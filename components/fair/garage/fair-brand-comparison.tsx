"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence } from "framer-motion";
import { ArrowLeft, CarFront, GitCompareArrows } from "lucide-react";
import { useState } from "react";
import type { FairPublicModel } from "@/lib/fair-contract";
import { fairLiveModelView, type FairGarageModelView } from "@/lib/fair-client/garage-view";
import { useFairHistoryLayer } from "@/lib/fair-client/history-layer";
import { fairModelPriceLabel, fairModelPriceValue } from "@/lib/fair-client/model-price";
import type { FairCompareOption } from "@/lib/fair-server/brand-compare";
import { fairEventThemeClass } from "@/lib/fair-theme";
import { fmt } from "@/lib/i18n/format";
import type { FairGarageDict, FairModelDict } from "@/lib/i18n/types";
import { FairEventShell } from "../event-shell";
import { FairCompareList, FairCompareSheet, fairBrandCompareHref } from "../model-compare-sheet";
import { FairComparisonTable, fairComparisonRows } from "./fair-comparison-table";
import styles from "./fair-garage.module.css";

/**
 * Same-brand comparison opened from a model page: the garage comparison table
 * with live data of two models the server checked, outside the garage. The
 * second model can be switched in place; "Nazad" returns to the first model.
 */
export function FairBrandComparison({
  routeEventSlug,
  event,
  base,
  partner,
  options,
  status,
  dict,
  modelDict,
}: {
  routeEventSlug: string;
  event: { id: string; title: string };
  base: FairPublicModel;
  partner: FairPublicModel | null;
  options: FairCompareOption[];
  status: "ready" | "refused" | "choose";
  dict: FairGarageDict;
  modelDict: FairModelDict;
}) {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const requestClose = useFairHistoryLayer(sheetOpen, () => setSheetOpen(false), "compare");
  const modelHref = `/sajam/${routeEventSlug}/model/${base.slug}`;
  const hrefFor = (option: FairCompareOption) => fairBrandCompareHref(routeEventSlug, base.slug, option.slug);
  const models = partner ? [fairLiveModelView(base, routeEventSlug), fairLiveModelView(partner, routeEventSlug)] : [];
  const rows = fairComparisonRows(models, dict.brandComparisonMissingValue);

  const price = (model: FairGarageModelView) => (
    <p className={styles.comparisonPriceBlock}>
      <small>{fairModelPriceLabel(routeEventSlug, model.brandName, modelDict)}</small>
      <strong>{fairModelPriceValue(model.priceText, modelDict)}</strong>
      {model.live?.priceSecondaryText ? <small>{model.live.priceSecondaryText}</small> : null}
    </p>
  );

  return (
    <div className={`fair-event ${fairEventThemeClass(routeEventSlug)} ${styles.comparisonPage}`} data-reveal="off">
      <FairEventShell
        eventId={event.id}
        eventSlug={routeEventSlug}
        eventTitle={dict.umbrellaTitle}
        eventName={event.title}
        dict={modelDict}
      />
      <div className={styles.comparisonHeader}>
        <div>
          <Link href={modelHref}>
            <ArrowLeft aria-hidden="true" />
            {dict.brandComparisonBack}
          </Link>
          <span>{base.brandName}</span>
        </div>
      </div>
      <main className={styles.comparisonMain}>
        <h1>{dict.comparisonTitle}</h1>

        {status === "ready" && partner ? (
          <FairComparisonTable
            models={models}
            rows={rows}
            dict={dict}
            price={price}
            cardAction={(_, index) =>
              index === 1 && options.length > 1 ? (
                <button
                  type="button"
                  className={styles.comparisonSwitch}
                  onClick={() => setSheetOpen(true)}
                  aria-haspopup="dialog"
                >
                  <GitCompareArrows aria-hidden="true" />
                  {dict.brandComparisonSwitch}
                </button>
              ) : null
            }
            specsFallback={<p className={styles.comparisonUnavailable}>{dict.comparisonUnavailable}</p>}
          />
        ) : (
          <section className={styles.comparisonMissing}>
            <CarFront aria-hidden="true" />
            <h2>{status === "refused" ? dict.brandComparisonRefusedTitle : dict.brandComparisonChooseTitle}</h2>
            <p>
              {status === "refused"
                ? dict.brandComparisonRefusedBody
                : fmt(dict.brandComparisonChooseBody, { brand: base.brandName })}
            </p>
            {options.length > 0 ? (
              <div className={styles.comparisonChoices}>
                <FairCompareList
                  options={options}
                  hrefFor={hrefFor}
                  onChoose={(href) => router.replace(href)}
                  dict={modelDict}
                />
              </div>
            ) : null}
            <Link href={modelHref}>{dict.brandComparisonBack}</Link>
          </section>
        )}
      </main>

      <AnimatePresence>
        {sheetOpen ? (
          <FairCompareSheet
            key="compare"
            brandName={base.brandName}
            options={options}
            currentId={partner?.id}
            hrefFor={hrefFor}
            replace
            onRequestClose={requestClose}
            dict={modelDict}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}
