"use client";

// The purchase-flow SHELL (RFC-002 §2.3, TASK-33, restyled TASK-44).
//
// The shell is a FRAME and a RAIL: a warm glass panel (the same offer-surface
// language as /ponuda), a header, a four-step timeline on top, and a sticky
// bottom bar with the running total and the advance button. It does not change
// or disappear in any step — only the inner content swaps. The frame chrome
// (background, radius, shadow) and the sticky bar's glass come from the shared
// primitives in app/offer-surface.css (.offer-frame / .offer-dock), so this and
// /ponuda read one source of truth.
//
// The bottom bar splits two kinds of money and never sums them into one figure:
// recurring plan/service money (from the pricing engine) and one-time physical
// money (from lib/scanme-pricing.ts). Every number comes from those pure
// modules; nothing is computed here. On step 1 "Nazad" is disabled; on the last
// step "Dalje" becomes "Plati" and confirms the order.

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, CreditCard } from "lucide-react";
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

export function PurchaseShell({ initialSelection }: PurchaseShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  const [selection, setSelection] = useState<PurchaseSelection>(initialSelection);
  // Step 4 confirm lives in the shell so the sticky bar's "Plati" is the one
  // primary action across the whole flow (the checkout panel only presents).
  const [placed, setPlaced] = useState(false);

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
    if (step !== selection.step) {
      if (placed) setPlaced(false);
      setSelection((prev) => ({ ...prev, step }));
    }
  };

  const stepIndex = PURCHASE_STEPS.indexOf(selection.step);
  const canGoBack = stepIndex > 0;
  const isLastStep = stepIndex === PURCHASE_STEPS.length - 1;
  const hasServices = selection.services.length > 0;
  const goBack = () => {
    if (canGoBack) goToStep(PURCHASE_STEPS[stepIndex - 1]);
  };
  const advance = () => {
    if (isLastStep) {
      if (hasServices) setPlaced(true);
      return;
    }
    goToStep(PURCHASE_STEPS[stepIndex + 1]);
  };

  // On the final step the forward button pays; once the order is placed the
  // panel shows its summary and the forward button steps aside.
  const showForward = !(isLastStep && placed);

  return (
    <section className={`${styles.shell} offer-surface offer-frame`} aria-label={dict.title}>
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
                    {state === "done" ? (
                      <Check className={styles.stepCheck} strokeWidth={2.4} />
                    ) : (
                      step
                    )}
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
            className={styles.stepArea}
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
            transition={{ duration: reduceMotion ? 0.12 : 0.2, ease: "easeOut" }}
          >
            {/* All four steps are live (TASK-34..38). Each puts its own content
                INSIDE the shell; the frame and the sticky bar never re-mount. */}
            {selection.step === 1 ? (
              <StepServices selection={selection} onChange={setSelection} />
            ) : selection.step === 2 ? (
              <StepPlan selection={selection} onChange={setSelection} />
            ) : selection.step === 3 ? (
              <StepProducts selection={selection} onChange={setSelection} />
            ) : (
              <StepCheckout selection={selection} onChange={setSelection} placed={placed} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className={`${styles.bar} offer-dock`}>
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

        {showForward ? (
          <Button
            type="button"
            className={styles.next}
            onClick={advance}
            disabled={isLastStep && !hasServices}
          >
            {isLastStep ? (
              <>
                <CreditCard aria-hidden="true" className={styles.backIcon} />
                {dict.pay}
              </>
            ) : (
              <>
                {dict.next}
                <ArrowRight aria-hidden="true" className={styles.nextIcon} />
              </>
            )}
          </Button>
        ) : null}
      </div>
    </section>
  );
}
