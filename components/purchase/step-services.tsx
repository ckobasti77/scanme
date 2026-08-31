"use client";

// Step 1 of the purchase flow (RFC-002 §2.3, TASK-34) — the first panel the
// TASK-33 shell was built to hold. Three regions inside the shell's grid:
//
//   LEFT   the mesečno/godišnje toggle ON TOP (it changes every price on
//          screen), then the five service cards + the three combo cards.
//   CENTER a read-only live preview of the selected service's REAL page.
//   RIGHT  the living cart: struck prices, savings IN DINARS, and one true
//          "add the next service and save N more" line.
//
// Not one number is computed here. Every dinar comes from the engine through
// step-services-model.ts; the component only chooses which field to show. The
// cart total therefore always equals what the engine returns, and equals the
// shell's split-total bar (same breakdown).

import { motion, useReducedMotion } from "framer-motion";
import { Check, Plus, Sparkles, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import { fmt } from "@/lib/i18n/format";
import { purchaseSr } from "@/lib/i18n/sr/purchase";
import type { BillingPeriod } from "@/lib/pricing/engine";
import type { ServiceId } from "@/lib/pricing/engine";
import type { PurchaseSelection } from "@/lib/offer-url";
import { formatRsd } from "@/lib/scanme-pricing";
import {
  PURCHASE_COMBOS,
  PURCHASE_SERVICE_ORDER,
  UNAVAILABLE_SERVICES,
  isServiceAvailable,
} from "./service-catalog";
import { ServicePreview } from "./service-preview";
import {
  bestNudge,
  commonPeriod,
  isPackageComplete,
  isSelected,
  priceSelection,
  priceServices,
  serviceListPrice,
  withPackage,
  withPeriodMode,
  withService,
  withoutService,
} from "./step-services-model";
import shellStyles from "./purchase-shell.module.css";
import styles from "./step-services.module.css";

const dict = purchaseSr.step1;

interface StepServicesProps {
  selection: PurchaseSelection;
  onChange: (next: PurchaseSelection) => void;
}

function periodLabel(period: BillingPeriod): string {
  return period === "monthly" ? dict.perMonth : dict.perYear;
}

/** A price that animates in when it changes (the period toggle). Keyed on the
 *  text so a new value remounts and plays the enter transition — no exit phase,
 *  which is what keeps it from ever stalling on a stale value. */
function AnimatedPrice({ text, reduce }: { text: string; reduce: boolean }) {
  return (
    <motion.span
      key={text}
      style={{ display: "inline-block" }}
      initial={reduce ? false : { opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduce ? 0.1 : 0.18, ease: "easeOut" }}
    >
      {text}
    </motion.span>
  );
}

export function StepServices({ selection, onChange }: StepServicesProps) {
  const reduce = useReducedMotion() ?? false;

  // One global period for step 1. It initializes from the cart (if uniform) and
  // otherwise defaults to monthly, so the annual switch reveals the saving.
  const [period, setPeriod] = useState<BillingPeriod>(
    () => commonPeriod(selection) ?? "monthly",
  );
  const [active, setActive] = useState<ServiceId>(
    () => selection.services[0]?.service ?? "links",
  );

  const breakdown = useMemo(() => priceSelection(selection), [selection]);
  const nudge = useMemo(
    () => bestNudge(selection, period, { exclude: UNAVAILABLE_SERVICES }),
    [selection, period],
  );

  const setGlobalPeriod = (next: BillingPeriod) => {
    setPeriod(next);
    onChange(withPeriodMode(selection, next));
  };

  const focus = (service: ServiceId) => setActive(service);

  const add = (service: ServiceId) => {
    onChange(withService(selection, service, period));
    setActive(service);
  };
  const remove = (service: ServiceId) => onChange(withoutService(selection, service));

  return (
    <>
      {/* LEFT — toggle on top, then the cards */}
      <div className={`${shellStyles.panel} ${styles.panel} ${styles.list}`} data-slot="left">
        <div
          className={styles.toggle}
          role="group"
          aria-label={dict.toggleLabel}
        >
          <button
            type="button"
            className={styles.toggleOption}
            data-active={period === "monthly"}
            aria-pressed={period === "monthly"}
            onClick={() => setGlobalPeriod("monthly")}
          >
            {dict.periodMonthly}
          </button>
          <button
            type="button"
            className={styles.toggleOption}
            data-active={period === "annual"}
            aria-pressed={period === "annual"}
            onClick={() => setGlobalPeriod("annual")}
          >
            {dict.periodAnnual}
          </button>
        </div>

        <ul className={styles.cards}>
          {PURCHASE_SERVICE_ORDER.map((service) => {
            const copy = dict.services[service];
            const available = isServiceAvailable(service);
            const selected = isSelected(selection, service);
            const priceText = fmt(dict.fromPrice, {
              price: formatRsd(serviceListPrice(service, period)),
              period: periodLabel(period),
            });
            return (
              <li key={service}>
                <div
                  className={styles.card}
                  role="button"
                  tabIndex={0}
                  data-active={active === service}
                  data-selected={selected}
                  aria-pressed={active === service}
                  onClick={() => focus(service)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      focus(service);
                    }
                  }}
                >
                  <div className={styles.cardHead}>
                    <h3 className={styles.cardName}>{copy.name}</h3>
                    <span className={styles.cardPrice}>
                      {available ? (
                        <AnimatedPrice text={priceText} reduce={reduce} />
                      ) : (
                        <span className={styles.soonBadge}>{dict.soon}</span>
                      )}
                    </span>
                  </div>
                  <p className={styles.cardTagline}>{copy.tagline}</p>
                  <ul className={styles.benefits}>
                    {copy.benefits.map((benefit) => (
                      <li key={benefit} className={styles.benefit}>
                        <Check className={styles.benefitIcon} size={14} aria-hidden="true" />
                        {benefit}
                      </li>
                    ))}
                  </ul>
                  {copy.premiumExtra ? (
                    <p className={styles.premium}>
                      <span className={styles.premiumLabel}>{dict.premiumPrefix}</span>{" "}
                      {copy.premiumExtra}
                    </p>
                  ) : null}
                  {available ? null : <p className={styles.soonNote}>{dict.soonNote}</p>}
                  <div className={styles.cardActions}>
                    <button
                      type="button"
                      className={styles.addButton}
                      data-selected={selected}
                      disabled={!available}
                      aria-label={
                        selected ? `${dict.inCart}: ${copy.name}` : `${dict.add}: ${copy.name}`
                      }
                      onClick={(event) => {
                        event.stopPropagation();
                        if (!available) return;
                        if (selected) remove(service);
                        else add(service);
                      }}
                    >
                      {selected ? (
                        <>
                          <Check size={15} aria-hidden="true" />
                          {dict.inCart}
                        </>
                      ) : (
                        <>
                          <Plus size={15} aria-hidden="true" />
                          {dict.add}
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </li>
            );
          })}

          {/* Combo cards — same list, a little wider, badged. Selecting one is a
              shortcut to its member services; the engine awards the package
              price on its own (RFC-002 §2.1). */}
          {PURCHASE_COMBOS.map((combo) => {
            const copy = dict.packages[combo.id];
            const complete = isPackageComplete(selection, combo.services);
            const comboPrice = priceServices(combo.services, period);
            const priceText = fmt(dict.fromPrice, {
              price: formatRsd(comboPrice.servicesChargedRsd),
              period: periodLabel(period),
            });
            const previewService = combo.services[0];
            return (
              <li key={combo.id}>
                <div
                  className={`${styles.card} ${styles.comboCard}`}
                  role="button"
                  tabIndex={0}
                  data-active={active === previewService}
                  data-selected={complete}
                  onClick={() => focus(previewService)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      focus(previewService);
                    }
                  }}
                >
                  <span className={styles.comboBadge}>{dict.comboBadge}</span>
                  <div className={styles.cardHead}>
                    <h3 className={styles.cardName}>{copy.name}</h3>
                    <span className={styles.cardPrice}>
                      {combo.available ? (
                        <AnimatedPrice text={priceText} reduce={reduce} />
                      ) : (
                        <span className={styles.soonBadge}>{dict.soon}</span>
                      )}
                    </span>
                  </div>
                  <p className={styles.cardTagline}>{copy.note}</p>
                  {comboPrice.savingsRsd > 0 && combo.available ? (
                    <p className={styles.premium}>
                      <span className={styles.premiumLabel}>
                        {fmt(dict.cartSavings, { amount: formatRsd(comboPrice.savingsRsd) })}
                      </span>
                    </p>
                  ) : null}
                  {combo.available ? null : (
                    <p className={styles.soonNote}>{dict.comboSoonNote}</p>
                  )}
                  <div className={styles.cardActions}>
                    <button
                      type="button"
                      className={styles.addButton}
                      data-selected={complete}
                      disabled={!combo.available}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (!combo.available) return;
                        onChange(
                          complete
                            ? combo.services.reduce(
                                (sel, service) => withoutService(sel, service),
                                selection,
                              )
                            : withPackage(selection, combo.services, period),
                        );
                        setActive(previewService);
                      }}
                    >
                      {complete ? (
                        <>
                          <Check size={15} aria-hidden="true" />
                          {dict.inCart}
                        </>
                      ) : (
                        <>
                          <Plus size={15} aria-hidden="true" />
                          {dict.add}
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* CENTER — the live, read-only preview of the active service */}
      <div
        className={`${shellStyles.panel} ${styles.panel} ${styles.preview}`}
        data-slot="center"
      >
        <ServicePreview service={active} />
      </div>

      {/* RIGHT — the living cart */}
      <div className={`${shellStyles.panel} ${styles.panel} ${styles.cart}`} data-slot="right">
        <h2 className={styles.cartTitle}>{dict.cartTitle}</h2>
        {breakdown === null ? (
          <p className={styles.cartEmpty}>{dict.cartEmpty}</p>
        ) : (
          <>
            <ul className={styles.lines}>
              {breakdown.lines.map((line) => {
                const copy = dict.services[line.service];
                return (
                  <li key={`${line.service}-${line.period}`} className={styles.line}>
                    <span className={styles.lineMain}>
                      <span className={styles.lineName}>{copy.name}</span>
                      {line.packageId ? (
                        <span className={styles.packageTag}>
                          {dict.packages[line.packageId].name}
                        </span>
                      ) : null}
                      <br />
                      <span className={styles.linePeriod}>{periodLabel(line.period)}</span>
                    </span>
                    <span className={styles.linePrices}>
                      {line.discountRsd > 0 ? (
                        <span
                          className={styles.lineWas}
                          aria-label={fmt(dict.cartWas, { price: formatRsd(line.listRsd) })}
                        >
                          {formatRsd(line.listRsd)}
                        </span>
                      ) : null}
                      <span className={styles.lineNow}>
                        {formatRsd(line.chargedRsd)} {purchaseSr.currency}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>

            {breakdown.savingsRsd > 0 ? (
              <>
                <span className={styles.cartDivider} aria-hidden="true" />
                <span className={styles.savings}>
                  {fmt(dict.cartSavings, { amount: formatRsd(breakdown.savingsRsd) })}
                </span>
              </>
            ) : null}

            {nudge ? (
              <button
                type="button"
                className={styles.nudge}
                onClick={() => add(nudge.service)}
              >
                <TrendingUp className={styles.nudgeIcon} size={16} aria-hidden="true" />
                {fmt(dict.cartNudge, {
                  service: dict.services[nudge.service].name,
                  amount: formatRsd(nudge.additionalSavingsRsd),
                })}
              </button>
            ) : (
              <p className={styles.cartHint}>
                <Sparkles size={13} aria-hidden="true" /> {dict.cartHint}
              </p>
            )}
          </>
        )}
      </div>
    </>
  );
}
