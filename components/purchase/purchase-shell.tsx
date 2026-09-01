"use client";

// The purchase-flow SHELL (RFC-002 §2.3, TASK-33).
//
// The shell is a FRAME and a RAIL: a rounded panel, a header, a four-step
// timeline on top, and a sticky bottom bar with the running total and the
// advance button. It does not change or disappear in any step — only the inner
// content swaps. That is the load-bearing property: the three configurator
// panels of steps 1 and 3, the full-width plan columns of step 2, and the
// checkout of step 4 are what the steps put INSIDE the shell; they are not the
// shell. If moving to step 2 tore the frame or the bar off the screen, this
// component would be wrong — so the frame and the bar live OUTSIDE the switch.
//
// The bottom bar splits two kinds of money and never sums them into one figure:
// recurring plan/service money (from the pricing engine) and one-time physical
// money (from the physical-product half of lib/scanme-pricing.ts). Every number
// comes from those pure modules; nothing is computed here.

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./purchase-shell.module.css";
import { Button } from "@/components/ui/button";
import { fmt } from "@/lib/i18n/format";
import { purchaseSr as dict } from "@/lib/i18n/sr/purchase";
import {
  PURCHASE_STEPS,
  encodePurchaseSelection,
  type PurchaseSelection,
  type PurchaseStep,
} from "@/lib/offer-url";
import { type PriceBreakdown } from "@/lib/pricing/engine";
import { recurringByPeriod } from "@/lib/pricing/summary";
import { computeProductsOneTime, formatRsd } from "@/lib/scanme-pricing";
import { StepCheckout } from "./step-checkout";
import { StepPlan } from "./step-plan";
import { StepProducts } from "./step-products";
import { StepServices } from "./step-services";
import { priceSelection } from "./step-services-model";

interface PurchaseShellProps {
  initialSelection: PurchaseSelection;
}

/** Steps 1 and 3 lay three panels inside the shell; step 2 goes full width;
 *  step 4 is a centered checkout. Only the panels differ — the shell does not. */
function stepLayoutClass(step: PurchaseStep): string {
  if (step === 2) return styles.stepFull;
  if (step === 4) return styles.stepCheckout;
  return styles.stepPanels;
}

export function PurchaseShell({ initialSelection }: PurchaseShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  const [selection, setSelection] = useState<PurchaseSelection>(initialSelection);

  // State lives in the URL so a configuration is shareable by link (RFC-002
  // §2.3). Replace (not push) so stepping back and forth is not history spam;
  // skip the very first render, whose URL already carries this state.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const query = encodePurchaseSelection(selection).toString();
    router.replace(`${pathname}?${query}`, { scroll: false });
  }, [selection, pathname, router]);

  // One breakdown, shared by the split-total bar and the step-1 cart, so they
  // can never disagree (RFC-002 §2.1). The engine is the only source.
  const breakdown: PriceBreakdown | null = useMemo(
    () => priceSelection(selection),
    [selection],
  );

  const recurring = useMemo(
    () => (breakdown ? recurringByPeriod(breakdown) : { monthly: 0, annual: 0 }),
    [breakdown],
  );
  const oneTimeRsd = useMemo(
    () => computeProductsOneTime(selection.products),
    [selection.products],
  );

  const recurringSegments: string[] = [];
  if (recurring.monthly > 0) {
    recurringSegments.push(`${formatRsd(recurring.monthly)} ${dict.currency} ${dict.perMonth}`);
  }
  if (recurring.annual > 0) {
    recurringSegments.push(`${formatRsd(recurring.annual)} ${dict.currency} ${dict.perYear}`);
  }
  if (breakdown?.planLine.onRequest) {
    recurringSegments.push(dict.planOnRequest);
  }

  const goToStep = (step: PurchaseStep) => {
    if (step !== selection.step) setSelection((prev) => ({ ...prev, step }));
  };

  const stepIndex = PURCHASE_STEPS.indexOf(selection.step);
  const canGoBack = stepIndex > 0;
  const isLastStep = stepIndex === PURCHASE_STEPS.length - 1;
  const goBack = () => {
    if (canGoBack) goToStep(PURCHASE_STEPS[stepIndex - 1]);
  };
  const goNext = () => {
    if (!isLastStep) goToStep(PURCHASE_STEPS[stepIndex + 1]);
  };

  return (
    <section className={styles.shell} aria-label={dict.title}>
      <header className={styles.header}>
        <div className={styles.heading}>
          <p className={styles.eyebrow}>{dict.eyebrow}</p>
          <h1 className={styles.title}>{dict.title}</h1>
        </div>
        <p className={styles.indicator} aria-live="polite">
          {fmt(dict.stepIndicator, { current: selection.step, total: PURCHASE_STEPS.length })}
        </p>
      </header>

      <nav className={styles.timeline} aria-label={dict.title}>
        <ol className={styles.steps}>
          {dict.steps.map((copy, index) => {
            const step = PURCHASE_STEPS[index];
            const state =
              index === stepIndex ? "current" : index < stepIndex ? "done" : "upcoming";
            return (
              <li key={step} className={styles.stepItem}>
                <button
                  type="button"
                  className={styles.stepButton}
                  data-state={state}
                  aria-current={state === "current" ? "step" : undefined}
                  aria-label={fmt(dict.goToStep, { n: step, label: copy.label })}
                  onClick={() => goToStep(step)}
                >
                  <span className={styles.stepNumber} aria-hidden="true">
                    {step}
                  </span>
                  <span className={styles.stepLabel}>{copy.label}</span>
                </button>
                {index < dict.steps.length - 1 ? (
                  <span className={styles.stepConnector} data-done={index < stepIndex} aria-hidden="true" />
                ) : null}
              </li>
            );
          })}
        </ol>
      </nav>

      <div className={styles.content}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={selection.step}
            className={stepLayoutClass(selection.step)}
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
            transition={{ duration: reduceMotion ? 0.12 : 0.2, ease: "easeOut" }}
          >
            {/* All four steps are live (TASK-34..36, TASK-38). Each puts its own
                content INSIDE the shell; the frame and the sticky bar never
                re-mount around them. */}
            {selection.step === 1 ? (
              <StepServices selection={selection} onChange={setSelection} />
            ) : selection.step === 2 ? (
              <StepPlan selection={selection} onChange={setSelection} />
            ) : selection.step === 3 ? (
              <StepProducts selection={selection} onChange={setSelection} />
            ) : (
              <StepCheckout selection={selection} onChange={setSelection} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className={styles.bar}>
        <Button
          type="button"
          variant="ghost"
          className={styles.back}
          onClick={goBack}
          disabled={!canGoBack}
        >
          <ArrowLeft aria-hidden="true" className={styles.backIcon} />
          {dict.back}
        </Button>

        <div className={styles.total} aria-live="polite">
          <span className={styles.totalLabel}>{dict.totalLabel}</span>
          <span className={styles.money}>
            <span className={styles.recurring}>
              {recurringSegments.length > 0
                ? recurringSegments.join("  ·  ")
                : dict.emptyRecurring}
            </span>
            {oneTimeRsd > 0 ? (
              <span className={styles.onetime}>
                {`+ ${formatRsd(oneTimeRsd)} ${dict.currency} ${dict.oneTime}`}
              </span>
            ) : null}
          </span>
        </div>

        <Button type="button" className={styles.next} onClick={goNext} disabled={isLastStep}>
          {isLastStep ? dict.finish : dict.next}
          {!isLastStep ? <ArrowRight aria-hidden="true" className={styles.nextIcon} /> : null}
        </Button>
      </div>
    </section>
  );
}
