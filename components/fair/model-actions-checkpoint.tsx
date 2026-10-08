"use client";

import Link from "next/link";
import { AnimatePresence } from "framer-motion";
import { ChevronRight, Mail, Star } from "lucide-react";
import { TbSteeringWheel } from "react-icons/tb";
import { useEffect, useId, useRef, useState } from "react";
import {
  FAIR_RATING_MAX,
  FAIR_RATING_MIN,
  FAIR_RATING_STEP,
  type FairErrorCode,
  type FairRatingState,
} from "@/lib/fair-contract";
import { postFair } from "@/lib/fair-client/fair-api";
import { fairErrorText } from "@/lib/fair-client/fair-errors";
import { fairHaptic } from "@/lib/fair-client/haptics";
import { useFairHistoryLayer } from "@/lib/fair-client/history-layer";
import { fmt, type FairModelDict } from "@/lib/i18n";
import { FairSheet } from "./fair-sheet";
import { LeadSheet } from "./lead-sheet";
import { useFairModelInteractions } from "./model-interactions";
import { fairRatingFromPosition, fairRatingText } from "./rating-position";

type LeadKind = "interest" | "testDrive";
type SheetKind = "rating" | LeadKind;

type Action = {
  kind: LeadKind;
  label: string;
};

type Dimension = "appearance" | "specifications" | "price";

const DIMENSIONS: Dimension[] = ["appearance", "specifications", "price"];

const icons = {
  interest: Mail,
  testDrive: TbSteeringWheel,
};

const KEY_COMMIT_MS = 400;

function clampRating(value: number) {
  return Math.min(FAIR_RATING_MAX, Math.max(FAIR_RATING_MIN, value));
}

/** One labelled row: label left, value and five half-step stars right (prototype stranica-modela-v2). */
function RatingRow({
  label,
  value,
  onChange,
  onCommit,
  valueAriaTemplate,
  size,
}: {
  label: string;
  value?: number;
  onChange: (value: number) => void;
  /** The gesture or key press is finished: the value may be sent. */
  onCommit?: (value: number) => void;
  valueAriaTemplate: string;
  size: "inline" | "sheet";
}) {
  const labelId = useId();
  const controlRef = useRef<HTMLDivElement>(null);
  const keyTimer = useRef<number | null>(null);
  const gestureRef = useRef<{
    pointerId: number | null;
    startX: number;
    startY: number;
    mode: "pending" | "rating" | "scroll";
  }>({ pointerId: null, startX: 0, startY: 0, mode: "pending" });
  const rating = value ?? 0;

  useEffect(() => () => {
    if (keyTimer.current !== null) window.clearTimeout(keyTimer.current);
  }, []);

  function resetGesture() {
    gestureRef.current = { pointerId: null, startX: 0, startY: 0, mode: "pending" };
  }

  function ratingFromPointer(clientX: number) {
    const bounds = controlRef.current?.getBoundingClientRect();
    if (!bounds?.width) return null;
    const next = fairRatingFromPosition((clientX - bounds.left) / bounds.width);
    if (next !== value) fairHaptic(8);
    onChange(next);
    return next;
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next =
      event.key === "Home"
        ? FAIR_RATING_MIN
        : event.key === "End"
          ? FAIR_RATING_MAX
          : event.key === "ArrowLeft"
            ? clampRating((value ?? FAIR_RATING_MIN + FAIR_RATING_STEP) - FAIR_RATING_STEP)
            : clampRating((value ?? FAIR_RATING_MIN - FAIR_RATING_STEP) + FAIR_RATING_STEP);
    onChange(next);
    if (!onCommit) return;
    if (keyTimer.current !== null) window.clearTimeout(keyTimer.current);
    keyTimer.current = window.setTimeout(() => {
      keyTimer.current = null;
      onCommit(next);
    }, KEY_COMMIT_MS);
  }

  return (
    <div className="fair-rate-row" data-size={size}>
      <span className="fair-rate-row__label" id={labelId}>
        {label}
      </span>
      <span className="fair-rate-row__control">
        <span className="fair-rate-row__value" aria-hidden="true">
          {value ? fairRatingText(value) : ""}
        </span>
        <div
          ref={controlRef}
          className="fair-star-slider"
          role="slider"
          tabIndex={0}
          aria-labelledby={labelId}
          aria-valuemin={FAIR_RATING_MIN}
          aria-valuemax={FAIR_RATING_MAX}
          aria-valuenow={value ?? undefined}
          aria-valuetext={value ? fmt(valueAriaTemplate, { value: fairRatingText(value) }) : undefined}
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
              const next = ratingFromPointer(event.clientX);
              if (next !== null) onCommit?.(next);
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
      </span>
    </div>
  );
}

/** Starter: one overall rating in one row, sent when the gesture ends; only an error is shown in text. */
function StarterRating({ dict }: { dict: FairModelDict }) {
  const { live, model, modelState, setRating } = useFairModelInteractions();
  const serverValue =
    modelState.status === "ready" && modelState.value.rating.mode === "overall"
      ? modelState.value.rating.overall
      : undefined;
  const [draft, setDraft] = useState<number | undefined>();
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [failed, setFailed] = useState<{ value: number; code: FairErrorCode } | null>(null);
  const requestRef = useRef(0);
  const value = draft ?? serverValue;

  async function commit(next: number) {
    if (!live) return;
    const request = ++requestRef.current;
    setStatus("saving");
    setFailed(null);
    const result = await postFair<FairRatingState>("/api/fair/rating", { eventModelId: model.id, overall: next });
    if (request !== requestRef.current) return;
    if (result.ok) {
      setDraft(undefined);
      setRating(result.value);
      setStatus("saved");
      fairHaptic(10);
    } else {
      setFailed({ value: next, code: result.code });
      setStatus("error");
    }
  }

  return (
    <div className="fair-rate-card fair-starter-rating">
      <RatingRow
        label={dict.rateModel}
        value={value}
        onChange={setDraft}
        onCommit={(next) => void commit(next)}
        valueAriaTemplate={dict.ratingValueAria}
        size="inline"
      />
      <span
        className={status === "error" ? "fair-starter-rating__status" : "sr-only"}
        role="status"
        data-state={status}
      >
        {status === "saved" ? dict.ratingSaved : null}
        {status === "error" && failed ? (
          <>
            {fairErrorText(failed.code, dict)}{" "}
            <button type="button" onClick={() => void commit(failed.value)}>
              {dict.actionRetry}
            </button>
          </>
        ) : null}
      </span>
    </div>
  );
}

function dimensionValues(rating: FairRatingState | null): Partial<Record<Dimension, number>> {
  if (!rating || rating.mode !== "dimensions") return {};
  return { appearance: rating.appearance, specifications: rating.specifications, price: rating.price };
}

/** Advanced: one row that opens the sheet; once rated it summarises "Izgled 4,5 · Spec. 4 · Cena 3,5". */
function AdvancedRatingRow({ dict, onOpen }: { dict: FairModelDict; onOpen: () => void }) {
  const { modelState } = useFairModelInteractions();
  const values = dimensionValues(modelState.status === "ready" ? modelState.value.rating : null);
  const short: Record<Dimension, string> = {
    appearance: dict.ratingSummaryAppearance,
    specifications: dict.ratingSummarySpecifications,
    price: dict.ratingSummaryPrice,
  };
  const rated = DIMENSIONS.filter((dimension) => values[dimension] !== undefined);

  return (
    <button type="button" className="fair-rate-card fair-rate-open" onClick={onOpen} aria-haspopup="dialog">
      <span className="fair-rate-open__label">{dict.rateModel}</span>
      {rated.length > 0 ? (
        <span className="fair-rate-open__summary">
          {rated.map((dimension, index) => (
            <span key={dimension}>
              {index > 0 ? " · " : null}
              {short[dimension]} <b>{fairRatingText(values[dimension] as number)}</b>
            </span>
          ))}
        </span>
      ) : (
        <span className="fair-rate-open__empty" aria-label={dict.ratingSummaryEmpty}>
          {[0, 1, 2, 3, 4].map((index) => (
            <Star key={index} aria-hidden="true" />
          ))}
        </span>
      )}
      <ChevronRight className="fair-rate-open__chevron" aria-hidden="true" />
    </button>
  );
}

/** Advanced sheet: three optional dimensions, each saved on change through the rating API; "Gotovo" only closes. */
function RatingSheet({
  dict,
  onRequestClose,
}: {
  dict: FairModelDict;
  onRequestClose: (afterClose?: () => void) => void;
}) {
  const { live, model, modelState, setRating } = useFairModelInteractions();
  const [values, setValues] = useState<Partial<Record<Dimension, number>>>(() =>
    dimensionValues(modelState.status === "ready" ? modelState.value.rating : null),
  );
  const [failed, setFailed] = useState<Partial<Record<Dimension, { value: number; code: FairErrorCode }>>>({});
  const requests = useRef<Record<Dimension, number>>({ appearance: 0, specifications: 0, price: 0 });
  const fields: Array<{ key: Dimension; label: string }> = [
    { key: "appearance", label: dict.designRatingLabel },
    { key: "specifications", label: dict.specificationsRatingLabel },
    { key: "price", label: dict.priceRatingLabel },
  ];

  async function commit(dimension: Dimension, next: number) {
    if (!live) return;
    const request = ++requests.current[dimension];
    setFailed((current) => ({ ...current, [dimension]: undefined }));
    const result = await postFair<FairRatingState>("/api/fair/rating", { eventModelId: model.id, [dimension]: next });
    if (request !== requests.current[dimension]) return;
    if (result.ok) {
      setRating(result.value);
      fairHaptic(10);
    } else {
      setFailed((current) => ({ ...current, [dimension]: { value: next, code: result.code } }));
    }
  }

  return (
    <FairSheet
      variant="bottom"
      titleId="fair-rating-title"
      eyebrow={model.brandName}
      title={fmt(dict.ratingSheetModelTitle, { model: model.displayName })}
      closable
      closeLabel={dict.closeSheet}
      onRequestClose={() => onRequestClose()}
    >
      <div className="fair-rating-sheet">
        {fields.map((field) => {
          const error = failed[field.key];
          return (
            <div key={field.key} className="fair-rating-sheet__row">
              <RatingRow
                label={field.label}
                value={values[field.key]}
                onChange={(value) => setValues((current) => ({ ...current, [field.key]: value }))}
                onCommit={(value) => void commit(field.key, value)}
                valueAriaTemplate={dict.ratingValueAria}
                size="sheet"
              />
              {error ? (
                <p className="fair-inline-error" role="alert">
                  {fairErrorText(error.code, dict)}{" "}
                  <button type="button" onClick={() => void commit(field.key, error.value)}>
                    {dict.actionRetry}
                  </button>
                </p>
              ) : null}
            </div>
          );
        })}
        <button className="fair-sheet__primary fair-rating-sheet__done" type="button" onClick={() => onRequestClose()}>
          {dict.ratingDone}
        </button>
      </div>
    </FairSheet>
  );
}

export function ModelActionsCheckpoint({
  audience,
  actions,
  ratingMode,
  dict,
}: {
  audience?: { eyebrow: string; question: string; href: string };
  actions: Action[];
  ratingMode: "none" | "overall" | "dimensions";
  dict: FairModelDict;
}) {
  const { leadForms } = useFairModelInteractions();
  const [openSheet, setOpenSheet] = useState<SheetKind | null>(null);
  const requestClose = useFairHistoryLayer(
    openSheet !== null,
    () => setOpenSheet(null),
    "model-action",
  );

  if (!audience && ratingMode === "none" && actions.length === 0) return null;

  return (
    <section className="fair-action-section">
      {audience ? (
        <Link
          className="fair-audience-action"
          href={audience.href}
          draggable={false}
          onDragStart={(event) => event.preventDefault()}
        >
          <span className="fair-live-dot" aria-hidden="true" />
          <span className="fair-audience-action__copy">
            <small>{audience.eyebrow}</small>
            <strong>{audience.question}</strong>
          </span>
          <ChevronRight aria-hidden="true" />
        </Link>
      ) : null}

      {ratingMode === "overall" ? <StarterRating dict={dict} /> : null}
      {ratingMode === "dimensions" ? <AdvancedRatingRow dict={dict} onOpen={() => setOpenSheet("rating")} /> : null}

      {actions.length > 0 ? (
        <div className="fair-action-grid" data-count={actions.length}>
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
        {openSheet === "rating" ? (
          <RatingSheet key="rating" dict={dict} onRequestClose={requestClose} />
        ) : openSheet ? (
          <LeadSheet
            key={openSheet}
            kind={openSheet}
            form={openSheet === "interest" ? leadForms.interest : leadForms.testDrive}
            onRequestClose={requestClose}
          />
        ) : null}
      </AnimatePresence>
    </section>
  );
}
