"use client";

import Link from "next/link";
import { AnimatePresence } from "framer-motion";
import {
  BarChart3,
  ChevronRight,
  Mail,
  Star,
} from "lucide-react";
import { TbSteeringWheel } from "react-icons/tb";
import { useEffect, useRef, useState } from "react";
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

type SheetKind = "rating" | "interest" | "testDrive";

type Action = {
  kind: SheetKind;
  label: string;
};

type Dimension = "appearance" | "specifications" | "price";

const icons = {
  rating: Star,
  interest: Mail,
  testDrive: TbSteeringWheel,
};

const KEY_COMMIT_MS = 400;

function clampRating(value: number) {
  return Math.min(FAIR_RATING_MAX, Math.max(FAIR_RATING_MIN, value));
}

function RatingField({
  label,
  value,
  onChange,
  onCommit,
  valueAriaTemplate,
}: {
  label: string;
  value?: number;
  onChange: (value: number) => void;
  /** The gesture or key press is finished: the value may be sent. */
  onCommit?: (value: number) => void;
  valueAriaTemplate: string;
}) {
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
    const position = Math.min(1, Math.max(0, (clientX - bounds.left) / bounds.width));
    const next = clampRating(Math.round((position * FAIR_RATING_MAX) / FAIR_RATING_STEP) * FAIR_RATING_STEP);
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
    <fieldset className="fair-rating-field">
      <legend>{label}</legend>
      <div
        ref={controlRef}
        className="fair-star-slider"
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={FAIR_RATING_MIN}
        aria-valuemax={FAIR_RATING_MAX}
        aria-valuenow={value ?? undefined}
        aria-valuetext={value ? fmt(valueAriaTemplate, { value: value.toLocaleString("sr-Latn-RS") }) : undefined}
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
    </fieldset>
  );
}

/** Starter: one overall rating, sent when the gesture ends; success only after the server answered. */
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
    setDraft(undefined);
    if (result.ok) {
      setRating(result.value);
      setStatus("saved");
      fairHaptic(10);
    } else {
      setFailed({ value: next, code: result.code });
      setStatus("error");
    }
  }

  return (
    <div className="fair-starter-rating">
      <RatingField
        label={dict.rateModel}
        value={value}
        onChange={setDraft}
        onCommit={(next) => void commit(next)}
        valueAriaTemplate={dict.ratingValueAria}
      />
      <span className="fair-starter-rating__status" role="status" data-state={status}>
        {status === "saving" ? dict.ratingSaving : null}
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

/** Advanced: three optional dimensions (no fourth overall), prefilled with the visitor's own values. */
function RatingSheet({
  dict,
  onRequestClose,
}: {
  dict: FairModelDict;
  onRequestClose: (afterClose?: () => void) => void;
}) {
  const { live, model, modelState, setRating, showToast } = useFairModelInteractions();
  const [values, setValues] = useState<Partial<Record<Dimension, number>>>(() => {
    if (modelState.status !== "ready" || modelState.value.rating.mode !== "dimensions") return {};
    const { appearance, specifications, price } = modelState.value.rating;
    return { appearance, specifications, price };
  });
  const [status, setStatus] = useState<"idle" | "sending" | "error">("idle");
  const [errorCode, setErrorCode] = useState<FairErrorCode | null>(null);
  const hasValue = Object.values(values).some((value) => value !== undefined);
  const fields: Array<{ key: Dimension; label: string }> = [
    { key: "appearance", label: dict.designRatingLabel },
    { key: "specifications", label: dict.specificationsRatingLabel },
    { key: "price", label: dict.priceRatingLabel },
  ];

  async function submit() {
    if (!hasValue || status === "sending") return;
    if (!live) {
      onRequestClose();
      return;
    }
    setStatus("sending");
    setErrorCode(null);
    const body = Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined));
    const result = await postFair<FairRatingState>("/api/fair/rating", { eventModelId: model.id, ...body });
    if (!result.ok) {
      setStatus("error");
      setErrorCode(result.code);
      return;
    }
    setRating(result.value);
    fairHaptic(10);
    onRequestClose(() => showToast(dict.ratingsSaved));
  }

  return (
    <FairSheet
      variant="bottom"
      titleId="fair-rating-title"
      title={dict.ratingSheetTitle}
      closable={status !== "sending"}
      closeLabel={dict.closeSheet}
      onRequestClose={() => onRequestClose()}
    >
      <form
        className="fair-sheet__form"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {fields.map((field) => (
          <RatingField
            key={field.key}
            label={field.label}
            value={values[field.key]}
            onChange={(value) => setValues((current) => ({ ...current, [field.key]: value }))}
            valueAriaTemplate={dict.ratingValueAria}
          />
        ))}
        {status === "error" && errorCode ? (
          <p className="fair-inline-error" role="alert">
            {fairErrorText(errorCode, dict)}
          </p>
        ) : null}
        <button
          className="fair-sheet__primary"
          type="submit"
          disabled={!hasValue || status === "sending"}
          aria-busy={status === "sending" || undefined}
        >
          {status === "sending" ? dict.ratingSaving : dict.saveRatings}
        </button>
      </form>
    </FairSheet>
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
  const { leadForms } = useFairModelInteractions();
  const [openSheet, setOpenSheet] = useState<SheetKind | null>(null);
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

      {ratingMode === "overall" ? <StarterRating dict={dict} /> : null}

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
