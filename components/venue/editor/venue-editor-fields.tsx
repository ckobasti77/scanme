"use client";

// The Venue editor's field primitives (TASK-12) — the control grammar every
// panel is built from, and where "constrained freedom" (TASK-10 STEP 5) is
// physically enforced:
//
//  - BoundedSlider is the ONLY way a panel edits a clamped number. Its
//    `bounds` prop takes the SAME exported tuple the server clamps with
//    (VENUE_BLOCK_BOUNDS / VENUE_DESIGN_BOUNDS) — a panel cannot retype a
//    range because there is nowhere to type one.
//  - SwatchRow is the ONLY colour control: it renders the page palette's
//    roles as fixed swatches. No hex field, no colour picker exists here.
//  - Segmented/SelectField enumerate closed option sets; free text exists only
//    for genuinely free content (headings, names, messages).

import { ChevronDown } from "lucide-react";
import {
  useId,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { fmt } from "@/lib/i18n";
import { venueEditorSr as dict } from "@/lib/i18n/sr/venue-editor";
import styles from "./venue-editor.module.css";

// ---------------------------------------------------------------------------
// Field chrome
// ---------------------------------------------------------------------------

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <div className={styles.fieldGroup}>
      <label className={styles.fieldLabel} htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error ? (
        <p className={styles.fieldError} role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className={styles.fieldHint}>{hint}</p>
      ) : null}
    </div>
  );
}

export function SubHeading({ children }: { children: ReactNode }) {
  return <h4 className={styles.fieldSubHeading}>{children}</h4>;
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  hint,
  error,
  maxLength,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  hint?: string;
  error?: string | null;
  maxLength?: number;
  type?: "text" | "url";
}) {
  const id = useId();
  return (
    <Field label={label} htmlFor={id} hint={hint} error={error}>
      <input
        id={id}
        className={styles.fieldInput}
        type={type}
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        aria-invalid={error ? true : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}

export function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
  hint,
  error,
  rows = 5,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  hint?: string;
  error?: string | null;
  rows?: number;
}) {
  const id = useId();
  return (
    <Field label={label} htmlFor={id} hint={hint} error={error}>
      <textarea
        id={id}
        className={`${styles.fieldInput} ${styles.fieldTextarea}`}
        value={value}
        placeholder={placeholder}
        rows={rows}
        aria-invalid={error ? true : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}

// ---------------------------------------------------------------------------
// Bounded numbers
// ---------------------------------------------------------------------------

export function formatPx(value: number) {
  return fmt(dict.pxValue, { value });
}

export function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

export function formatPlain(value: number) {
  return String(value);
}

/**
 * The bounded numeric control. `bounds` is the inclusive [min, max] tuple
 * exported next to the clamp that enforces it server-side — pass the export,
 * never a literal.
 */
export function BoundedSlider({
  label,
  value,
  bounds,
  step = 1,
  onChange,
  format = formatPx,
}: {
  label: string;
  value: number;
  bounds: readonly [number, number];
  step?: number;
  onChange: (next: number) => void;
  format?: (value: number) => string;
}) {
  const id = useId();
  const [min, max] = bounds;
  return (
    <div className={styles.fieldGroup}>
      <div className={styles.fieldLabelRow}>
        <label className={styles.fieldLabel} htmlFor={id}>
          {label}
        </label>
        <output className={styles.fieldValue} htmlFor={id}>
          {format(value)}
        </output>
      </div>
      <input
        id={id}
        className={styles.slider}
        type="range"
        min={min}
        max={max}
        step={step}
        value={Math.min(max, Math.max(min, value))}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}

/**
 * Bounded free-standing number entry — for content quantities (capacity,
 * price, coordinates) where a slider's resolution is useless. The min/max
 * still come from an exported bounds tuple where one exists; values commit
 * clamped on change.
 */
export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  hint,
  error,
}: {
  label: string;
  value: number | "";
  onChange: (next: number | "") => void;
  min: number;
  max: number;
  step?: number;
  hint?: string;
  error?: string | null;
}) {
  const id = useId();
  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const raw = event.target.value;
    if (raw === "") {
      onChange("");
      return;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;
    onChange(Math.min(max, Math.max(min, parsed)));
  }
  return (
    <Field label={label} htmlFor={id} hint={hint} error={error}>
      <input
        id={id}
        className={styles.fieldInput}
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-invalid={error ? true : undefined}
        onChange={handleChange}
      />
    </Field>
  );
}

// ---------------------------------------------------------------------------
// Closed option sets
// ---------------------------------------------------------------------------

export type SegmentedOption<T extends string> = { value: T; label: string };

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (next: T) => void;
}) {
  const id = useId();
  return (
    <div className={styles.fieldGroup}>
      <span className={styles.fieldLabel} id={id}>
        {label}
      </span>
      <div className={styles.segmented} role="group" aria-labelledby={id}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={styles.segmentedButton}
            aria-pressed={option.value === value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  hint,
}: {
  label: string;
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (next: T) => void;
  hint?: string;
}) {
  const id = useId();
  return (
    <Field label={label} htmlFor={id} hint={hint}>
      <span className={styles.selectWrap}>
        <select
          id={id}
          className={styles.fieldInput}
          value={value}
          onChange={(event) => onChange(event.target.value as T)}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown className={styles.selectChevron} aria-hidden="true" />
      </span>
    </Field>
  );
}

export function ToggleRow({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className={styles.fieldGroup}>
      <div className={styles.toggleRow}>
        <label className={styles.fieldLabel} htmlFor={id}>
          {label}
        </label>
        <button
          id={id}
          type="button"
          role="switch"
          aria-checked={checked}
          className={styles.toggleSwitch}
          onClick={() => onChange(!checked)}
        >
          <span className={styles.toggleKnob} aria-hidden="true" />
        </button>
      </div>
      {hint ? <p className={styles.fieldHint}>{hint}</p> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Palette colours
// ---------------------------------------------------------------------------

export type PaletteSwatch = { key: string; label: string; color: string };

/**
 * The one colour control: the current page palette's roles as swatches.
 * `value` is the stored hex; a swatch is "active" when it matches. The
 * optional inherit action clears the override back to the palette default.
 */
export function SwatchRow({
  label,
  value,
  swatches,
  onPick,
  onInherit,
}: {
  label: string;
  value: string | undefined;
  swatches: readonly PaletteSwatch[];
  onPick: (color: string) => void;
  onInherit?: () => void;
}) {
  const id = useId();
  return (
    <div className={styles.fieldGroup}>
      <span className={styles.fieldLabel} id={id}>
        {label}
      </span>
      <div className={styles.swatchRow} role="group" aria-labelledby={id}>
        {onInherit ? (
          <button
            type="button"
            className={styles.swatchInherit}
            aria-pressed={value === undefined}
            onClick={onInherit}
          >
            {dict.inheritOption}
          </button>
        ) : null}
        {swatches.map((swatch) => (
          <button
            key={swatch.key}
            type="button"
            className={styles.swatchButton}
            style={{ "--ve-swatch": swatch.color } as React.CSSProperties}
            aria-pressed={
              value !== undefined &&
              value.toLowerCase() === swatch.color.toLowerCase()
            }
            aria-label={`${swatch.label} (${swatch.color})`}
            title={swatch.label}
            onClick={() => onPick(swatch.color)}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Date/time (stored as ms timestamps, edited in the browser's local zone)
// ---------------------------------------------------------------------------

function msToLocalInput(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

export function DateTimeField({
  label,
  value,
  onChange,
  hint,
  error,
}: {
  label: string;
  value: number | undefined;
  onChange: (next: number | undefined) => void;
  hint?: string;
  error?: string | null;
}) {
  const id = useId();
  // Keep the raw text while the owner is mid-edit so partial input does not
  // snap back; commit only parseable values.
  const [draft, setDraft] = useState<string | null>(null);
  const display = draft ?? (value !== undefined ? msToLocalInput(value) : "");
  return (
    <Field label={label} htmlFor={id} hint={hint} error={error}>
      <input
        id={id}
        className={styles.fieldInput}
        type="datetime-local"
        value={display}
        aria-invalid={error ? true : undefined}
        onChange={(event) => {
          const raw = event.target.value;
          setDraft(raw);
          if (raw === "") {
            onChange(undefined);
            return;
          }
          const parsed = new Date(raw).getTime();
          if (Number.isFinite(parsed)) onChange(parsed);
        }}
        onBlur={() => setDraft(null)}
      />
    </Field>
  );
}
