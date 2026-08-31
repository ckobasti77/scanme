"use client";

// Step 2 of the purchase flow (RFC-002 §2.3, TASK-35): two full-width columns
// inside the SAME shell — not a new page (TASK-33's frame still owns the
// header, timeline, and sticky total bar; this only fills the content slot).
//
// Basic: a flat list headed "Uključeno, ne plaćaš ništa." Premium: "Sve iz
// Basic-a" first, then new items GROUPED BY THE SERVICE the buyer chose in
// step 1 (nothing they did not buy is shown), and always last, outside every
// group: "Sve buduće usluge automatski na Premium-u." Enterprise is a single
// quiet row below both columns — a dead end to the contact form, never a
// third equal card and never a way into step 3.
//
// HARD RULE (RFC-002 §2.3): the Premium price is never divided by the number
// of services. It is shown as the DELTA it adds to the buyer's current total
// — computed through the engine in step-plan-model.ts, not here.

import { ArrowRight, Check } from "lucide-react";
import { fmt } from "@/lib/i18n/format";
import { purchaseSr } from "@/lib/i18n/sr/purchase";
import type { BillingPeriod, ServiceId } from "@/lib/pricing/engine";
import type { PurchaseSelection } from "@/lib/offer-url";
import { ENTERPRISE_CONTACT_HREF } from "@/lib/offer-contact";
import { formatRsd } from "@/lib/scanme-pricing";
import { PURCHASE_SERVICE_ORDER } from "./service-catalog";
import { currentTotalRsd, planPeriodFor, premiumDeltaRsd, withPlan } from "./step-plan-model";
import styles from "./step-plan.module.css";

const dict = purchaseSr.step2;
const services = purchaseSr.step1.services;

interface StepPlanProps {
  selection: PurchaseSelection;
  onChange: (next: PurchaseSelection) => void;
}

function periodLabel(period: BillingPeriod): string {
  return period === "monthly" ? purchaseSr.perMonth : purchaseSr.perYear;
}

/** The owned services whose Premium group actually has something to say,
 *  in the canonical display order — a service the buyer did not choose, or
 *  one with no group content, is never rendered (RFC-002 §2.3). */
function ownedPremiumGroups(selection: PurchaseSelection): ServiceId[] {
  const owned = new Set(selection.services.map((entry) => entry.service));
  return PURCHASE_SERVICE_ORDER.filter(
    (service) => owned.has(service) && dict.premiumGroups[service].length > 0,
  );
}

export function StepPlan({ selection, onChange }: StepPlanProps) {
  const period = planPeriodFor(selection);
  const delta = premiumDeltaRsd(selection, period);
  const current = currentTotalRsd(selection);
  const deltaText =
    current !== null && current > 0
      ? fmt(dict.premiumDeltaWithCurrent, {
          amount: formatRsd(delta),
          currency: purchaseSr.currency,
          period: periodLabel(period),
          current: formatRsd(current),
        })
      : fmt(dict.premiumDeltaOnly, {
          amount: formatRsd(delta),
          currency: purchaseSr.currency,
          period: periodLabel(period),
        });

  const groups = ownedPremiumGroups(selection);
  const isPremium = selection.plan === "premium";
  const isBasic = selection.plan === "basic";

  return (
    <div className={styles.root} data-slot="full">
      <section className={styles.column} aria-labelledby="plan-basic-heading">
        <div className={styles.columnHead}>
          <h2 id="plan-basic-heading" className={styles.columnTitle}>
            {dict.basicTitle}
          </h2>
          <span className={styles.includedLabel}>{dict.basicIncludedLabel}</span>
        </div>

        <ul className={styles.list}>
          {dict.basicItems.map((item) => (
            <li key={item} className={styles.item}>
              <Check className={styles.itemIcon} size={15} aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>

        <button
          type="button"
          className={styles.cta}
          data-selected={isBasic}
          onClick={() => onChange(withPlan(selection, "basic"))}
        >
          {isBasic ? (
            <>
              <Check size={15} aria-hidden="true" />
              {dict.basicSelected}
            </>
          ) : (
            dict.basicCta
          )}
        </button>
      </section>

      <section
        className={`${styles.column} ${styles.premiumColumn}`}
        aria-labelledby="plan-premium-heading"
      >
        <div className={styles.columnHead}>
          <h2 id="plan-premium-heading" className={styles.columnTitle}>
            {dict.premiumTitle}
          </h2>
          <span className={styles.delta}>{deltaText}</span>
        </div>

        <ul className={styles.list}>
          <li className={styles.item}>
            <Check className={styles.itemIcon} size={15} aria-hidden="true" />
            {dict.premiumFirstItem}
          </li>

          {groups.map((service) => (
            <li key={service} className={styles.group}>
              <p className={styles.groupHeading}>{services[service].name}</p>
              <ul className={styles.list}>
                {dict.premiumGroups[service].map((item) => (
                  <li key={item} className={styles.item}>
                    <Check className={styles.itemIcon} size={15} aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>

        <p className={styles.futureLine}>{dict.premiumFutureLine}</p>

        <button
          type="button"
          className={styles.cta}
          data-selected={isPremium}
          onClick={() => onChange(withPlan(selection, "premium"))}
        >
          {isPremium ? (
            <>
              <Check size={15} aria-hidden="true" />
              {dict.premiumSelected}
            </>
          ) : (
            dict.premiumCta
          )}
        </button>
      </section>

      <div className={styles.enterpriseRow}>
        <a className={styles.enterpriseLink} href={ENTERPRISE_CONTACT_HREF}>
          {dict.enterpriseRow}
          <ArrowRight size={14} aria-hidden="true" />
        </a>
      </div>
    </div>
  );
}
