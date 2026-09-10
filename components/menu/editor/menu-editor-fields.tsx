"use client";

// The Menu editor's field primitives (TASK-51) — FORKED from
// components/venue/editor/venue-editor-fields.tsx: the control grammar every
// panel is built from, and where "constrained freedom" is physically
// enforced:
//
//  - BoundedSlider is the ONLY way a panel edits a clamped number. Its
//    `bounds` prop takes the SAME exported tuple the server clamps with
//    (MENU_BOUNDS / MENU_DESIGN_BOUNDS) — a panel cannot retype a range
//    because there is nowhere to type one.
//  - SwatchRow is the ONLY colour control: it renders the page palette's
//    roles as fixed swatches. No hex field, no colour picker exists here.
//  - Segmented/SelectField enumerate closed option sets; free text exists only
//    for genuinely free content (names, descriptions, variant labels).

import { ChevronDown } from "lucide-react";
import { useId, type ChangeEvent, type ReactNode } from "react";
import { fmt } from "@/lib/i18n";
import { menuEditorSr as dict } from "@/lib/i18n/sr/menu-editor";
import styles from "./menu-editor.module.css";

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
  suggestions,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  hint?: string;
  error?: string | null;
  maxLength?: number;
  type?: "text" | "url";
  /** Free text with a datalist of known values — for `productType`, a free
   * string whose known set is only a suggestion (RFC-003 §2.3, §5 Q2). */
  suggestions?: readonly string[];
}) {
  const id = useId();
  const listId = `${id}-list`;
  return (
    <Field label={label} htmlFor={id} hint={hint} error={error}>
      <input
        id={id}
        className={styles.fieldInput}
        type={type}
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        list={suggestions ? listId : undefined}
        aria-invalid={error ? true : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {suggestions ? (
        <datalist id={listId}>
          {suggestions.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
      ) : null}
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

// Minutes from midnight → "HH:MM" (the daypart windows, RFC-003 §2.5).
export function formatMinutes(value: number) {
  const clamped = Math.max(0, Math.min(1440, Math.round(value)));
  const hours = Math.floor(clamped / 60);
  const minutes = clamped % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
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
 * Bounded free-standing number entry — for content quantities (prices) where
 * a slider's resolution is useless. The min/max come from an exported bounds
 * tuple; values commit clamped on change.
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
