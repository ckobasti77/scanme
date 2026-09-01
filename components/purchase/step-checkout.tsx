"use client";

// Step 4 of the purchase flow (RFC-002 §2.3 step 4 / §2.5, TASK-38): checkout.
// It JOINS the flow into a purchase — the buyer REVIEWS the order the shell has
// been pricing live (services, plan, the two kinds of money kept apart), then
// confirms. Confirming shows the post-purchase SUMMARY: what was bought, WHERE
// to set each service up, and WHEN the first billing lands. An empty "hvala"
// screen is the missed opportunity this step exists to avoid — the buyer is most
// engaged at exactly this moment.
//
// The backend that writes the order, ensures the account/plan, and activates
// each service's ownership (leaving the tier to getEntitlement step 3, with zero
// entitlement rows) is `convex/checkout.ts` — fully built and tested. Wiring this
// button to call it live needs the buyer's AUTHENTICATED location, which the
// onboarding seam creates (RFC-002 §2.2 / orders.ts); until that lands the
// public flow presents the order and its next steps, and the ScanMe team
// provisions it — the manual-first flow (TASK-32). See docs/tasks/BLOCKED.md.
//
// NOTHING here computes money: every figure comes from step-checkout-model.ts,
// which reads the same engine call the shell's split-total bar makes.

import { ArrowRight, ArrowLeft, Check, Package, Wallet } from "lucide-react";
import { useState } from "react";
import styles from "./step-checkout.module.css";
import { fmt } from "@/lib/i18n/format";
import { purchaseSr } from "@/lib/i18n/sr/purchase";
import type { BillingPeriod } from "@/lib/pricing/engine";
import type { PurchaseSelection } from "@/lib/offer-url";
import { formatRsd } from "@/lib/scanme-pricing";
import { isServiceAvailable } from "./service-catalog";
import {
  checkoutTotals,
  hasSplitterLine,
  orderedServices,
  orderPeriod,
  periodOfService,
} from "./step-checkout-model";

const dict = purchaseSr.step4;
const serviceCopy = purchaseSr.step1.services;

interface StepCheckoutProps {
  selection: PurchaseSelection;
  onChange: (next: PurchaseSelection) => void;
}

function periodLabel(period: BillingPeriod): string {
  return period === "monthly" ? purchaseSr.perMonth : purchaseSr.perYear;
}

function planLabel(plan: PurchaseSelection["plan"]): string {
  if (plan === "premium") return purchaseSr.planPremium;
  if (plan === "enterprise") return purchaseSr.planEnterprise;
  return purchaseSr.planBasic;
}

/** The recurring split rendered as the shell renders it — two baskets, never
 *  summed (RFC-002 §2.3). */
function recurringSegments(recurring: { monthly: number; annual: number }): string[] {
  const segments: string[] = [];
  if (recurring.monthly > 0) {
    segments.push(`${formatRsd(recurring.monthly)} ${purchaseSr.currency} ${purchaseSr.perMonth}`);
  }
  if (recurring.annual > 0) {
    segments.push(`${formatRsd(recurring.annual)} ${purchaseSr.currency} ${purchaseSr.perYear}`);
  }
  return segments;
}

export function StepCheckout({ selection, onChange }: StepCheckoutProps) {
  const [placed, setPlaced] = useState(false);
  const services = orderedServices(selection);

  if (services.length === 0) {
    return (
      <div className={styles.root} data-slot="checkout">
        <div className={styles.empty}>
          <h2 className={styles.emptyTitle}>{dict.emptyTitle}</h2>
          <p className={styles.emptyBody}>{dict.emptyBody}</p>
          <button
            type="button"
            className={styles.secondaryCta}
            onClick={() => onChange({ ...selection, step: 1 })}
          >
            <ArrowLeft size={15} aria-hidden="true" />
            {dict.backToServices}
          </button>
        </div>
      </div>
    );
  }

  const totals = checkoutTotals(selection);
  const recurring = recurringSegments(totals.recurring);
  const period = orderPeriod(selection);
  const isPremium = selection.plan === "premium";

  if (placed) {
    return (
      <div className={styles.root} data-slot="checkout">
        <div className={styles.summary}>
          <div className={styles.summaryHead}>
            <span className={styles.check} aria-hidden="true">
              <Check size={20} />
            </span>
            <div>
              <h2 className={styles.summaryTitle}>{dict.summaryTitle}</h2>
              <p className={styles.summaryLead}>{dict.summaryLead}</p>
            </div>
          </div>

          <section className={styles.card} aria-labelledby="summary-services">
            <h3 id="summary-services" className={styles.cardTitle}>
              {dict.summaryServicesHeading}
            </h3>
            <ul className={styles.serviceList}>
              {services.map((service) => (
                <li key={service} className={styles.serviceRow}>
                  <div className={styles.serviceText}>
                    <span className={styles.serviceName}>{serviceCopy[service].name}</span>
                    <span className={styles.serviceHint}>
                      {isServiceAvailable(service)
                        ? dict.serviceConfigure[service]
                        : `${dict.serviceConfigure[service]} (${dict.summaryComingSoon})`}
                    </span>
                  </div>
                  {isServiceAvailable(service) ? (
                    <a className={styles.configureCta} href={dict.summaryConfigureAllHref}>
                      {dict.summaryConfigureCta}
                      <ArrowRight size={14} aria-hidden="true" />
                    </a>
                  ) : (
                    <span className={styles.soonTag}>{dict.summaryComingSoon}</span>
                  )}
                </li>
              ))}
            </ul>
            <p className={styles.configureHint}>{dict.summaryConfigureHint}</p>
          </section>

          <div className={styles.cardRow}>
            <section className={styles.card} aria-labelledby="summary-plan">
              <h3 id="summary-plan" className={styles.cardTitle}>
                {dict.summaryPlanHeading}
              </h3>
              <p className={styles.planName}>{planLabel(selection.plan)}</p>
              {isPremium ? <p className={styles.planNote}>{dict.planPremiumNote}</p> : null}
            </section>

            <section className={styles.card} aria-labelledby="summary-billing">
              <h3 id="summary-billing" className={styles.cardTitle}>
                {dict.summaryBillingHeading}
              </h3>
              {renderBilling(selection.plan, recurring, period)}
            </section>
          </div>

          <section className={styles.card} aria-labelledby="summary-next">
            <h3 id="summary-next" className={styles.cardTitle}>
              {dict.summaryNextTitle}
            </h3>
            <ol className={styles.nextList}>
              {dict.summaryNextSteps.map((step) => (
                <li key={step} className={styles.nextItem}>
                  {step}
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.root} data-slot="checkout">
      <div className={styles.review}>
        <header className={styles.reviewHead}>
          <h2 className={styles.reviewTitle}>{dict.reviewHeading}</h2>
          <p className={styles.reviewIntro}>{dict.reviewIntro}</p>
        </header>

        <section className={styles.card} aria-labelledby="review-services">
          <h3 id="review-services" className={styles.cardTitle}>
            {dict.servicesHeading}
          </h3>
          <ul className={styles.serviceList}>
            {services.map((service) => {
              const svcPeriod = periodOfService(selection, service);
              return (
                <li key={service} className={styles.serviceRow}>
                  <span className={styles.serviceName}>{serviceCopy[service].name}</span>
                  {svcPeriod ? (
                    <span className={styles.servicePeriod}>{periodLabel(svcPeriod)}</span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>

        <div className={styles.cardRow}>
          <section className={styles.card} aria-labelledby="review-plan">
            <h3 id="review-plan" className={styles.cardTitle}>
              {dict.planHeading}
            </h3>
            <p className={styles.planName}>{planLabel(selection.plan)}</p>
            {isPremium ? <p className={styles.planNote}>{dict.planPremiumNote}</p> : null}
          </section>

          <section className={styles.card} aria-labelledby="review-products">
            <h3 id="review-products" className={styles.cardTitle}>
              <Package size={15} aria-hidden="true" className={styles.cardIcon} />
              {dict.productsHeading}
            </h3>
            <p className={styles.plainLine}>
              {selection.products.length > 0
                ? fmt(dict.productsCount, { count: selection.products.length })
                : dict.productsNone}
            </p>
            {hasSplitterLine(selection) ? (
              <p className={styles.splitterNote}>{dict.splitterNote}</p>
            ) : null}
          </section>
        </div>

        <section className={styles.card} aria-labelledby="review-money">
          <h3 id="review-money" className={styles.cardTitle}>
            <Wallet size={15} aria-hidden="true" className={styles.cardIcon} />
            {dict.billingHeading}
          </h3>
          <dl className={styles.money}>
            <div className={styles.moneyRow}>
              <dt>{dict.recurringLabel}</dt>
              <dd>
                {recurring.length > 0
                  ? recurring.join("  ·  ")
                  : purchaseSr.emptyRecurring}
              </dd>
            </div>
            {totals.oneTimeRsd > 0 ? (
              <div className={styles.moneyRow}>
                <dt>{dict.oneTimeLabel}</dt>
                <dd>{`${formatRsd(totals.oneTimeRsd)} ${purchaseSr.currency} ${purchaseSr.oneTime}`}</dd>
              </div>
            ) : null}
          </dl>
          <div className={styles.billingLine}>{renderBilling(selection.plan, recurring, period)}</div>
        </section>

        <button type="button" className={styles.confirmCta} onClick={() => setPlaced(true)}>
          {dict.confirmCta}
          <ArrowRight size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

/** The first-billing line — Premium bills its plan period now and renews; Basic
 *  charges no plan (only the services the buyer chose). Kept in one place so the
 *  review and the summary phrase it identically. */
function renderBilling(
  plan: PurchaseSelection["plan"],
  recurring: string[],
  period: BillingPeriod | null,
) {
  if (plan === "basic") {
    return <p className={styles.billingText}>{dict.billingFreePlan}</p>;
  }
  const amount = recurring.join("  ·  ");
  return (
    <p className={styles.billingText}>
      {amount ? <span>{fmt(dict.billingNow, { amount })}</span> : null}
      {period ? (
        <span className={styles.billingRenews}>
          {" "}
          {fmt(dict.billingRenews, { period: periodLabel(period) })}
        </span>
      ) : null}
    </p>
  );
}
