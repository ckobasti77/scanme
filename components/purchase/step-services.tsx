"use client";

// Step 1 of the purchase flow (RFC-002 §2.3, TASK-34, restyled TASK-44) — three
// regions inside the shell's glass frame, 25% / 50% / 25%:
//
//   LEFT   an animated mesečno/godišnje toggle ON TOP (a real sliding pill), then
//          small service cards: icon, name, price, one sentence, an add button.
//   CENTER the bigger service mockup, flanked by what Basic gives and what
//          Premium adds for the focused service — the "why you'd pay" preview.
//   RIGHT  the living cart: each service its OWN accent icon (the same icon that
//          sits on its card), struck vs. real price, savings in dinars, and one
//          true "add the next service and save N more" line. Empty, it invites.
//
// Not one number is computed here. Every dinar comes from the engine through
// step-services-model.ts; the component only chooses which field to show.

import { motion, useReducedMotion } from "framer-motion";
import {
  Boxes,
  Check,
  Images,
  Link2,
  PartyPopper,
  Plus,
  ScanLine,
  Sparkles,
  Star,
  Store,
  TrendingUp,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import { Component, useMemo, useState, type ReactNode } from "react";
import { fmt } from "@/lib/i18n/format";
import { purchaseSr } from "@/lib/i18n/sr/purchase";
import type { BillingPeriod, PackageId, ServiceId } from "@/lib/pricing/engine";
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
import styles from "./step-services.module.css";

const dict = purchaseSr.step1;

// One symbolic lucide icon per service — the SAME icon on the card and in the
// cart, rendered in the accent color (RFC-002 §2.3 / TASK-44).
const SERVICE_ICONS: Record<ServiceId, LucideIcon> = {
  links: Link2,
  venue: PartyPopper,
  memories: Images,
  menu: UtensilsCrossed,
  review: Star,
};

const PACKAGE_ICONS: Record<PackageId, LucideIcon> = {
  dogadjaj: Sparkles,
  lokal: Store,
  kompletan: Boxes,
};

/** The centre shows the REAL public page of a service; some (Venue) reach for
 *  Convex data a fixture cannot satisfy. Rather than let that take the whole
 *  page down, the preview degrades to a calm placeholder — an error state, not a
 *  crash. Keyed by service in the render so switching away resets it. */
class PreviewBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function PreviewFallback({ service }: { service: ServiceId }) {
  const Icon = SERVICE_ICONS[service];
  return (
    <div className={styles.previewFallback} role="img" aria-label={dict.services[service].name}>
      <span className={styles.previewFallbackIcon} aria-hidden="true">
        <Icon size={26} strokeWidth={1.6} />
      </span>
      <p className={styles.previewFallbackName}>{dict.services[service].name}</p>
      <p className={styles.previewFallbackBody}>{dict.previewUnavailable}</p>
    </div>
  );
}

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

/** The sliding monthly/annual switch — one pill that ANIMATES between the two
 *  sides (framer-motion shared layout), not two buttons (TASK-44). */
function PeriodToggle({
  period,
  onChange,
  reduce,
}: {
  period: BillingPeriod;
  onChange: (next: BillingPeriod) => void;
  reduce: boolean;
}) {
  const options: BillingPeriod[] = ["monthly", "annual"];
  return (
    <div className={styles.toggle} role="group" aria-label={dict.toggleLabel}>
      {options.map((option) => {
        const active = period === option;
        return (
          <button
            key={option}
            type="button"
            className={styles.toggleOption}
            data-active={active}
            aria-pressed={active}
            onClick={() => onChange(option)}
          >
            {active ? (
              <motion.span
                layoutId="periodPill"
                className={styles.togglePill}
                transition={
                  reduce
                    ? { duration: 0 }
                    : { type: "spring", stiffness: 460, damping: 38 }
                }
              />
            ) : null}
            <span className={styles.toggleText}>
              {option === "monthly" ? dict.periodMonthly : dict.periodAnnual}
            </span>
          </button>
        );
      })}
    </div>
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

  const activeCopy = dict.services[active];
  const premiumItems = purchaseSr.step2.premiumGroups[active];

  return (
    <div className={styles.grid}>
      {/* LEFT — toggle on top, then the small cards */}
      <div className={`${styles.left} offer-glass offer-glass--panel`} data-slot="left">
        <PeriodToggle period={period} onChange={setGlobalPeriod} reduce={reduce} />

        <ul className={styles.cards}>
          {PURCHASE_SERVICE_ORDER.map((service) => {
            const copy = dict.services[service];
            const available = isServiceAvailable(service);
            const selected = isSelected(selection, service);
            const Icon = SERVICE_ICONS[service];
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
                  <span className={styles.cardIcon} aria-hidden="true">
                    <Icon size={18} strokeWidth={1.7} />
                  </span>
                  <span className={styles.cardBody}>
                    <span className={styles.cardName}>{copy.name}</span>
                    <span className={styles.cardTagline}>{copy.tagline}</span>
                    <span className={styles.cardPrice}>
                      {available ? (
                        <AnimatedPrice text={priceText} reduce={reduce} />
                      ) : (
                        <span className={styles.soonBadge}>{dict.soon}</span>
                      )}
                    </span>
                  </span>
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
                      <Check size={16} aria-hidden="true" strokeWidth={2.2} />
                    ) : (
                      <Plus size={16} aria-hidden="true" strokeWidth={2.2} />
                    )}
                  </button>
                </div>
              </li>
            );
          })}

          {/* Combo cards — same list, badged. Selecting one is a shortcut to its
              member services; the engine awards the package price (RFC-002 §2.1). */}
          {PURCHASE_COMBOS.map((combo) => {
            const copy = dict.packages[combo.id];
            const complete = isPackageComplete(selection, combo.services);
            const comboPrice = priceServices(combo.services, period);
            const priceText = fmt(dict.fromPrice, {
              price: formatRsd(comboPrice.servicesChargedRsd),
              period: periodLabel(period),
            });
            const previewService = combo.services[0];
            const Icon = PACKAGE_ICONS[combo.id];
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
                  <span className={styles.cardIcon} data-combo="true" aria-hidden="true">
                    <Icon size={18} strokeWidth={1.7} />
                  </span>
                  <span className={styles.cardBody}>
                    <span className={styles.cardName}>
                      {copy.name}
                      <span className={styles.comboBadge}>{dict.comboBadge}</span>
                    </span>
                    <span className={styles.cardTagline}>{copy.note}</span>
                    <span className={styles.cardPrice}>
                      {combo.available ? (
                        <AnimatedPrice text={priceText} reduce={reduce} />
                      ) : (
                        <span className={styles.soonBadge}>{dict.soon}</span>
                      )}
                      {comboPrice.savingsRsd > 0 && combo.available ? (
                        <span className={styles.cardSave}>
                          −{formatRsd(comboPrice.savingsRsd)}
                        </span>
                      ) : null}
                    </span>
                  </span>
                  <button
                    type="button"
                    className={styles.addButton}
                    data-selected={complete}
                    disabled={!combo.available}
                    aria-label={
                      complete ? `${dict.inCart}: ${copy.name}` : `${dict.add}: ${copy.name}`
                    }
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
                      <Check size={16} aria-hidden="true" strokeWidth={2.2} />
                    ) : (
                      <Plus size={16} aria-hidden="true" strokeWidth={2.2} />
                    )}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* CENTER — the bigger mockup, flanked by Basic / Premium value */}
      <div className={styles.center} data-slot="center">
        <section className={styles.value} data-tier="basic" aria-label={dict.basicSideHeading}>
          <p className={styles.valueHeading}>{dict.basicSideHeading}</p>
          <ul className={styles.valueList}>
            {activeCopy.benefits.map((benefit) => (
              <li key={benefit} className={styles.valueItem}>
                <Check size={13} aria-hidden="true" className={styles.valueTick} />
                {benefit}
              </li>
            ))}
          </ul>
        </section>

        <div className={styles.stage}>
          <PreviewBoundary key={active} fallback={<PreviewFallback service={active} />}>
            <ServicePreview service={active} />
          </PreviewBoundary>
        </div>

        <section className={styles.value} data-tier="premium" aria-label={dict.premiumSideHeading}>
          <p className={styles.valueHeading} data-premium="true">
            <Sparkles size={12} aria-hidden="true" />
            {dict.premiumSideHeading}
          </p>
          <ul className={styles.valueList}>
            {premiumItems.map((item) => (
              <li key={item} className={styles.valueItem}>
                <Check size={13} aria-hidden="true" className={styles.valueTick} data-premium="true" />
                {item}
              </li>
            ))}
            <li className={styles.valueItem} data-future="true">
              <Check size={13} aria-hidden="true" className={styles.valueTick} data-premium="true" />
              {dict.premiumFutureShort}
            </li>
          </ul>
        </section>
      </div>

      {/* RIGHT — the living cart */}
      <div className={`${styles.right} offer-glass offer-glass--panel`} data-slot="right">
        <h2 className={styles.cartTitle}>{dict.cartTitle}</h2>
        {breakdown === null ? (
          <EmptyCart onPick={focus} reduce={reduce} />
        ) : (
          <>
            <ul className={styles.lines}>
              {breakdown.lines.map((line) => {
                const copy = dict.services[line.service];
                const Icon = SERVICE_ICONS[line.service];
                return (
                  <li key={`${line.service}-${line.period}`} className={styles.line}>
                    <span className={styles.lineIcon} aria-hidden="true">
                      <Icon size={15} strokeWidth={1.7} />
                    </span>
                    <span className={styles.lineMain}>
                      <span className={styles.lineName}>
                        {copy.name}
                        {line.packageId ? (
                          <span className={styles.packageTag}>
                            {dict.packages[line.packageId].name}
                          </span>
                        ) : null}
                      </span>
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
              <span className={styles.savings}>
                <TrendingUp size={14} aria-hidden="true" />
                {fmt(dict.cartSavings, { amount: formatRsd(breakdown.savingsRsd) })}
              </span>
            ) : null}

            {nudge ? (
              <button
                type="button"
                className={styles.nudge}
                onClick={() => add(nudge.service)}
              >
                <span className={styles.nudgeIcon} aria-hidden="true">
                  <Plus size={14} strokeWidth={2.2} />
                </span>
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
    </div>
  );
}

/** The empty cart is the first thing a buyer sees — not a blank box. A soft scan
 *  ring pulses over the five service icons; tapping one focuses that service so
 *  the mockup and its Basic/Premium value slide into view (TASK-44). */
function EmptyCart({
  onPick,
  reduce,
}: {
  onPick: (service: ServiceId) => void;
  reduce: boolean;
}) {
  return (
    <div className={styles.empty}>
      <div className={styles.emptyGlyph} aria-hidden="true">
        <motion.span
          className={styles.emptyRing}
          animate={reduce ? undefined : { scale: [1, 1.08, 1], opacity: [0.7, 0.35, 0.7] }}
          transition={reduce ? undefined : { duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        />
        <ScanLine className={styles.emptyScan} size={26} strokeWidth={1.6} />
      </div>
      <p className={styles.emptyTitle}>{dict.cartEmptyTitle}</p>
      <p className={styles.emptyBody}>{dict.cartEmptyBody}</p>
      <div className={styles.emptyPicks}>
        {PURCHASE_SERVICE_ORDER.map((service, index) => {
          const Icon = SERVICE_ICONS[service];
          return (
            <motion.button
              key={service}
              type="button"
              className={styles.emptyPick}
              aria-label={fmt(dict.previewLabel, { name: dict.services[service].name })}
              onClick={() => onPick(service)}
              initial={reduce ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={reduce ? { duration: 0 } : { delay: 0.05 * index, duration: 0.28 }}
            >
              <Icon size={16} strokeWidth={1.7} />
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
