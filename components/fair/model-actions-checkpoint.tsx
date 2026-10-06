"use client";

import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  BarChart3,
  ChevronRight,
  Mail,
  Star,
  X,
} from "lucide-react";
import { TbSteeringWheel } from "react-icons/tb";
import { useEffect, useRef, useState } from "react";
import { useFairHistoryLayer } from "@/lib/fair-client/history-layer";
import { fmt, type FairModelDict } from "@/lib/i18n";

type SheetKind = "rating" | "interest" | "testDrive";

type Action = {
  kind: SheetKind;
  label: string;
};

const icons = {
  rating: Star,
  interest: Mail,
  testDrive: TbSteeringWheel,
};

function RatingField({
  label,
  value,
  onChange,
  valueAriaTemplate,
}: {
  label: string;
  value?: number;
  onChange: (value: number) => void;
  valueAriaTemplate: string;
}) {
  const controlRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<{
    pointerId: number | null;
    startX: number;
    startY: number;
    mode: "pending" | "rating" | "scroll";
  }>({ pointerId: null, startX: 0, startY: 0, mode: "pending" });
  const rating = value ?? 0;

  function resetGesture() {
    gestureRef.current = { pointerId: null, startX: 0, startY: 0, mode: "pending" };
  }

  function ratingFromPointer(clientX: number) {
    const bounds = controlRef.current?.getBoundingClientRect();
    if (!bounds?.width) return;
    const position = Math.min(1, Math.max(0, (clientX - bounds.left) / bounds.width));
    onChange(Math.min(5, Math.max(0.5, Math.round(position * 10) / 2)));
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "Home") onChange(0.5);
    else if (event.key === "End") onChange(5);
    else if (event.key === "ArrowLeft") onChange(Math.max(0.5, rating - 0.5));
    else onChange(Math.min(5, rating + 0.5));
  }

  return (
    <fieldset className="fair-rating-field">
      <legend>{label}</legend>
      <div
        ref={controlRef}
        className="fair-star-slider"
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={5}
        aria-valuenow={rating}
        aria-valuetext={fmt(valueAriaTemplate, { value: rating.toLocaleString("sr-Latn-RS") })}
        onKeyDown={handleKeyDown}
        onPointerDown={(event) => {
          gestureRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            mode: "pending",
          };
        }}
        onPointerMove={(event) => {
          const gesture = gestureRef.current;
          if (gesture.pointerId !== event.pointerId || gesture.mode === "scroll") return;
          const deltaX = Math.abs(event.clientX - gesture.startX);
          const deltaY = Math.abs(event.clientY - gesture.startY);

          if (gesture.mode === "pending" && deltaY > 7 && deltaY > deltaX) {
            gesture.mode = "scroll";
            return;
          }
          if (gesture.mode === "pending" && deltaX > 7 && deltaX >= deltaY) {
            gesture.mode = "rating";
            event.currentTarget.setPointerCapture(event.pointerId);
          }
          if (gesture.mode === "rating") ratingFromPointer(event.clientX);
        }}
        onPointerUp={(event) => {
          const gesture = gestureRef.current;
          if (gesture.pointerId === event.pointerId && gesture.mode !== "scroll") {
            ratingFromPointer(event.clientX);
          }
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
          resetGesture();
        }}
        onPointerCancel={resetGesture}
      >
        {[0, 1, 2, 3, 4].map((index) => {
          const fill = Math.min(1, Math.max(0, rating - index)) * 100;
          return (
            <span key={index} className="fair-star-slider__star" aria-hidden="true">
              <Star className="fair-star-slider__outline" />
              <span className="fair-star-slider__fill" style={{ width: `${fill}%` }}>
                <Star />
              </span>
            </span>
          );
        })}
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

    return () => {
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
      transition={{ duration: reduceMotion ? 0 : 0.24, ease: "easeOut" }}
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
        initial={reduceMotion ? false : { y: "100%" }}
        animate={{ y: 0 }}
        exit={reduceMotion ? { y: 0 } : { y: "100%" }}
        transition={
          reduceMotion
            ? { duration: 0 }
            : { duration: 0.54, ease: [0.22, 1, 0.36, 1] }
        }
        onAnimationComplete={() => closeRef.current?.focus({ preventScroll: true })}
      >
        <header>
          <h2 id="fair-sheet-title">{title}</h2>
          <button ref={closeRef} type="button" onClick={() => onRequestClose()}>
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
                valueAriaTemplate={dict.ratingValueAria}
              />
            ) : (
              <>
                <RatingField
                  label={dict.designRatingLabel}
                  value={ratings.design}
                  onChange={(value) => setRatings((current) => ({ ...current, design: value }))}
                  valueAriaTemplate={dict.ratingValueAria}
                />
                <RatingField
                  label={dict.specificationsRatingLabel}
                  value={ratings.specifications}
                  onChange={(value) =>
                    setRatings((current) => ({ ...current, specifications: value }))
                  }
                  valueAriaTemplate={dict.ratingValueAria}
                />
                <RatingField
                  label={dict.priceRatingLabel}
                  value={ratings.price}
                  onChange={(value) => setRatings((current) => ({ ...current, price: value }))}
                  valueAriaTemplate={dict.ratingValueAria}
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
  const [starterRating, setStarterRating] = useState<number>();
  const sheetActions =
    ratingMode === "overall" ? actions.filter((action) => action.kind !== "rating") : actions;
  const requestClose = useFairHistoryLayer(
    openSheet !== null,
    () => setOpenSheet(null),
    "model-action",
  );

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

      {ratingMode === "overall" ? (
        <div className="fair-starter-rating">
          <RatingField
            label={dict.rateModel}
            value={starterRating}
            onChange={setStarterRating}
            valueAriaTemplate={dict.ratingValueAria}
          />
        </div>
      ) : null}

      {sheetActions.length > 0 ? (
        <div className="fair-action-grid" data-count={sheetActions.length}>
          {sheetActions.map((action) => {
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
