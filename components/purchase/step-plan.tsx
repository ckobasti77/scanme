"use client";

// Step 2 of the purchase flow (RFC-002 §2.3, TASK-35, restyled TASK-44): two
// full-width columns inside the SAME shell. This is the money decision, so it is
// the most deliberate screen in the flow — the Premium column is elevated (an
// accent frame and a slow glow), Basic is calm and honest.
//
// Basic: a lead line + a short list, headed "Uključeno, ne plaćaš ništa."
// Premium: "Sve iz Basic-a" first, then items GROUPED BY THE SERVICE the buyer
// chose in step 1 (nothing they did not buy is shown), and always last, outside
// every group: "Sve buduće usluge automatski na Premium-u." Enterprise is a
// single quiet row below — never a third equal card, never a way into step 3.
//
// HARD RULE (RFC-002 §2.3): the Premium price is never divided by the number of
// services. It is the DELTA it adds to the buyer's current total — computed
// through the engine in step-plan-model.ts, not here.

import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Check, Sparkles } from "lucide-react";
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

/** The owned services whose Premium group actually has something to say, in the
 *  canonical display order — a service the buyer did not choose, or one with no
 *  group content, is never rendered (RFC-002 §2.3). */
function ownedPremiumGroups(selection: PurchaseSelection): ServiceId[] {
  const owned = new Set(selection.services.map((entry) => entry.service));
  return PURCHASE_SERVICE_ORDER.filter(
    (service) => owned.has(service) && dict.premiumGroups[service].length > 0,
  );
}

export function StepPlan({ selection, onChange }: StepPlanProps) {
  const reduce = useReducedMotion() ?? false;
  const period = planPeriodFor(selection);
  const delta = premiumDeltaRsd(selection, period);
  const current = currentTotalRsd(selection);

  const groups = ownedPremiumGroups(selection);
  const isPremium = selection.plan === "premium";
  const isBasic = selection.plan === "basic";

  return (
    <div className={styles.root}>
      <section
        className={`${styles.column} offer-glass offer-glass--panel`}
        data-selected={isBasic}
        aria-labelledby="plan-basic-heading"
      >
        <div className={styles.head}>
          <h2 id="plan-basic-heading" className={styles.columnTitle}>
            {dict.basicTitle}
          </h2>
          <span className={styles.includedLabel}>{dict.basicIncludedLabel}</span>
        </div>
        <p className={styles.lead}>{dict.basicLead}</p>

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
        className={`${styles.column} ${styles.premiumColumn} offer-glass offer-glass--panel`}
        data-selected={isPremium}
        aria-labelledby="plan-premium-heading"
      >
        {reduce ? null : (
          <motion.span
            aria-hidden="true"
            className={styles.premiumGlow}
            animate={{
              opacity: [0.45, 0.75, 0.45],
              backgroundPosition: ["0% 0%", "100% 100%", "0% 0%"],
            }}
            transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
          />
        )}
        <div className={styles.premiumInner}>
          <div className={styles.head}>
            <h2 id="plan-premium-heading" className={styles.columnTitle}>
              {dict.premiumTitle}
            </h2>
            <span className={styles.recommended}>
              <Sparkles size={11} aria-hidden="true" />
              {dict.premiumRecommended}
            </span>
          </div>

          <div className={styles.price}>
            <span className={styles.priceAmount}>+{formatRsd(delta)}</span>
            <span className={styles.priceUnit}>
              {purchaseSr.currency} {periodLabel(period)}
            </span>
          </div>
          {current !== null && current > 0 ? (
            <p className={styles.priceContext}>
              {fmt(dict.premiumOnCurrent, {
                current: formatRsd(current),
                currency: purchaseSr.currency,
              })}
            </p>
          ) : null}

          <p className={styles.lead}>{dict.premiumLead}</p>

          <ul className={styles.list}>
            <li className={styles.item} data-first="true">
              <Check className={styles.itemIcon} size={15} aria-hidden="true" data-premium="true" />
              {dict.premiumFirstItem}
            </li>

            {groups.map((service) => (
              <li key={service} className={styles.group}>
                <p className={styles.groupHeading}>{services[service].name}</p>
                <ul className={styles.list}>
                  {dict.premiumGroups[service].map((item) => (
                    <li key={item} className={styles.item}>
                      <Check
                        className={styles.itemIcon}
                        size={15}
                        aria-hidden="true"
                        data-premium="true"
                      />
                      {item}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>

          <p className={styles.futureLine}>
            <Sparkles size={13} aria-hidden="true" />
            {dict.premiumFutureLine}
          </p>

          <button
            type="button"
            className={`${styles.cta} ${styles.premiumCta}`}
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
        </div>
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
