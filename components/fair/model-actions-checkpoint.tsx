"use client";

import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  BarChart3,
  CarFront,
  ChevronRight,
  Mail,
  Star,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { FairModelDict } from "@/lib/i18n";

type SheetKind = "rating" | "interest" | "testDrive";

type Action = {
  kind: SheetKind;
  label: string;
};

const icons = {
  rating: Star,
  interest: Mail,
  testDrive: CarFront,
};

function RatingField({
  label,
  value,
  onChange,
}: {
  label: string;
  value?: number;
  onChange: (value: number) => void;
}) {
  return (
    <fieldset className="fair-rating-field">
      <legend>{label}</legend>
      <div>
        {[1, 2, 3, 4, 5].map((score) => (
          <button
            key={score}
            type="button"
            aria-label={`${label}: ${score}`}
            aria-pressed={value === score}
            onClick={() => onChange(score)}
          >
            <Star aria-hidden="true" />
            <span>{score}</span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function ActionSheet({
  kind,
  ratingMode,
  dict,
  onRequestClose,
}: {
  kind: SheetKind;
  ratingMode: "none" | "overall" | "dimensions";
  dict: FairModelDict;
  onRequestClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [ratingAttempted, setRatingAttempted] = useState(false);
  const [leadAttempted, setLeadAttempted] = useState(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.dataset.fairOverlayOpen = "true";
    closeRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      delete document.documentElement.dataset.fairOverlayOpen;
      previousFocus?.focus();
    };
  }, []);

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onRequestClose();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  const title =
    kind === "rating"
      ? dict.ratingSheetTitle
      : kind === "interest"
        ? dict.interestSheetTitle
        : dict.testDriveSheetTitle;

  return (
    <motion.div
      className="fair-sheet-backdrop"
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={reduceMotion ? { opacity: 1 } : { opacity: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.18, ease: "easeOut" }}
      onPointerDown={(event) => {
        if (event.currentTarget === event.target) onRequestClose();
      }}
    >
      <motion.div
        ref={dialogRef}
        className="fair-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fair-sheet-title"
        onKeyDown={handleKeyDown}
        initial={reduceMotion ? false : { y: 42, opacity: 0.92, scale: 0.985 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={reduceMotion ? { opacity: 1 } : { y: 34, opacity: 0, scale: 0.99 }}
        transition={
          reduceMotion
            ? { duration: 0 }
            : { duration: 0.34, ease: [0.22, 1, 0.36, 1] }
        }
      >
        <header>
          <h2 id="fair-sheet-title">{title}</h2>
          <button ref={closeRef} type="button" onClick={onRequestClose}>
            <X aria-hidden="true" />
            <span className="sr-only">{dict.closeSheet}</span>
          </button>
        </header>

        {kind === "rating" ? (
          <form
            className="fair-sheet__form"
            onSubmit={(event) => {
              event.preventDefault();
              setRatingAttempted(true);
            }}
          >
            {ratingMode === "overall" ? (
              <RatingField
                label={dict.overallRatingLabel}
                value={ratings.overall}
                onChange={(value) => setRatings({ overall: value })}
              />
            ) : (
              <>
                <RatingField
                  label={dict.designRatingLabel}
                  value={ratings.design}
                  onChange={(value) => setRatings((current) => ({ ...current, design: value }))}
                />
                <RatingField
                  label={dict.specificationsRatingLabel}
                  value={ratings.specifications}
                  onChange={(value) =>
                    setRatings((current) => ({ ...current, specifications: value }))
                  }
                />
                <RatingField
                  label={dict.priceRatingLabel}
                  value={ratings.price}
                  onChange={(value) => setRatings((current) => ({ ...current, price: value }))}
                />
              </>
            )}
            <button
              className="fair-sheet__primary"
              type="submit"
              disabled={ratingMode === "overall" && !ratings.overall}
            >
              {ratingMode === "overall" ? dict.saveRating : dict.saveRatings}
            </button>
            {ratingAttempted ? <p role="status">{dict.ratingNotSent}</p> : null}
          </form>
        ) : (
          <form
            className="fair-sheet__form"
            onSubmit={(event) => {
              event.preventDefault();
              setLeadAttempted(true);
            }}
          >
            <p className="fair-sheet__fixture-note">{dict.leadFixtureNotice}</p>
            <label>
              <span>{dict.fullNameLabel}</span>
              <input name="name" autoComplete="name" required />
            </label>
            {kind === "interest" ? (
              <label>
                <span>{dict.emailLabel}</span>
                <input name="email" type="email" autoComplete="email" required />
              </label>
            ) : null}
            <label>
              <span>{dict.phoneLabel}</span>
              <input name="phone" type="tel" autoComplete="tel" required />
            </label>
            {kind === "testDrive" ? (
              <label>
                <span>{dict.preferredDateLabel}</span>
                <input name="date" type="date" required />
              </label>
            ) : null}
            <button className="fair-sheet__primary" type="submit">
              {kind === "interest" ? dict.sendInterest : dict.sendTestDrive}
            </button>
            {leadAttempted ? <p role="status">{dict.leadNotSent}</p> : null}
          </form>
        )}
      </motion.div>
    </motion.div>
  );
}

export function ModelActionsCheckpoint({
  audience,
  actions,
  ratingMode,
  dict,
}: {
  audience?: { title: string; body: string; href: string };
  actions: Action[];
  ratingMode: "none" | "overall" | "dimensions";
  dict: FairModelDict;
}) {
  const [openSheet, setOpenSheet] = useState<SheetKind | null>(null);

  useEffect(() => {
    if (!openSheet) return;
    window.history.pushState({ fairSheet: openSheet }, "");
    const handlePopState = () => setOpenSheet(null);
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [openSheet]);

  function requestClose() {
    if (window.history.state?.fairSheet) window.history.back();
    else setOpenSheet(null);
  }

  return (
    <section className="fair-action-section">
      {audience ? (
        <Link
          className="fair-audience-action"
          href={audience.href}
          draggable={false}
          onDragStart={(event) => event.preventDefault()}
        >
          <BarChart3 aria-hidden="true" />
          <span>
            <strong>{audience.title}</strong>
            <small>{audience.body}</small>
          </span>
          <ChevronRight aria-hidden="true" />
        </Link>
      ) : null}

      {actions.length > 0 ? (
        <div className="fair-action-grid">
          {actions.map((action) => {
            const Icon = icons[action.kind];
            return (
              <button key={action.kind} type="button" onClick={() => setOpenSheet(action.kind)}>
                <Icon aria-hidden="true" />
                <span>{action.label}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      <AnimatePresence>
        {openSheet ? (
          <ActionSheet
            key={openSheet}
            kind={openSheet}
            ratingMode={ratingMode}
            dict={dict}
            onRequestClose={requestClose}
          />
        ) : null}
      </AnimatePresence>
    </section>
  );
}
