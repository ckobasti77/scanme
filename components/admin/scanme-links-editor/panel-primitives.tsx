import { LockKeyhole } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function EditorPanel({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-col">
      <div className="border-b border-[var(--editor-line)] px-5 py-6">
        <h1 className="text-xl font-semibold tracking-[-0.04em]">{title}</h1>
        <p className="mt-2 text-xs leading-5 text-[var(--editor-muted)]">
          {description}
        </p>
      </div>
      <div className="flex-1 px-5 py-5">{children}</div>
      {footer ? (
        <div className="sticky bottom-0 border-t border-[var(--editor-line)] bg-[var(--editor-surface)] px-5 py-4">
          {footer}
        </div>
      ) : null}
    </div>
  );
}

export function PanelSection({
  title,
  description,
  action,
  children,
  className,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "border-b border-[var(--editor-line)] pb-6 last:border-b-0 last:pb-0 [&+&]:pt-6",
        className,
      )}
    >
      {title || description || action ? (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title ? (
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em]">
                {title}
              </h2>
            ) : null}
            {description ? (
              <p className="mt-1.5 text-xs leading-5 text-[var(--editor-muted)]">
                {description}
              </p>
            ) : null}
          </div>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function LockedPanel({
  onChooseStyle,
}: {
  onChooseStyle: () => void;
}) {
  return (
    <div className="grid min-h-[420px] place-items-center py-8 text-center">
      <div className="max-w-[260px]">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl border border-[var(--editor-line)] bg-[var(--editor-surface-raised)]">
          <LockKeyhole className="size-5" />
        </span>
        <h2 className="mt-5 text-base font-semibold tracking-[-0.03em]">
          Prvo izaberite početni stil
        </h2>
        <p className="mt-2 text-xs leading-5 text-[var(--editor-muted)]">
          Kada postavite osnovu stranice, sve vrednosti možete menjati zasebno.
        </p>
        <Button
          type="button"
          onClick={onChooseStyle}
          className="mt-5 h-11 rounded-xl px-5"
        >
          Otvori Brze stilove
        </Button>
      </div>
    </div>
  );
}

export function ChoiceCard({
  selected,
  disabled,
  onClick,
  children,
  className,
  label,
}: {
  selected?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "relative min-h-11 rounded-xl border bg-[var(--editor-surface-raised)] text-left transition-[border-color,background-color,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2",
        selected
          ? "border-black ring-2 ring-[var(--editor-lime)] ring-offset-1"
          : "border-[var(--editor-line)] hover:border-[var(--editor-line-strong)] hover:bg-white",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function NativeSwitch({
  checked,
  onCheckedChange,
  label,
  disabled,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative h-7 w-12 shrink-0 rounded-full border border-[var(--editor-line-strong)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2",
        checked ? "bg-[var(--editor-lime)]" : "bg-black/10",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 size-5 rounded-full border border-black/10 bg-white shadow-sm transition-transform",
          checked ? "translate-x-[22px]" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="grid grid-flow-col rounded-xl border border-[var(--editor-line)] bg-black/[0.025] p-1"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "min-h-10 rounded-lg px-3 text-xs font-medium transition-colors",
            value === option.value
              ? "bg-[var(--editor-lime)] text-black shadow-sm"
              : "text-[var(--editor-muted)] hover:bg-white/70 hover:text-[var(--editor-ink)]",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
