// ScanMe Menu V1 — switch and checkbox (K07). Real form elements (an
// <input type="checkbox">, the switch with role="switch"), visually replaced
// but still the click and focus target, so keyboard, forms and screen readers
// work without script. The whole label row is the target (≥ --mp-meta high).
// The "on" state is position + fill + a check mark, never colour alone; the
// track boundary keeps 3:1 in both themes (WCAG 1.4.11).

import { Check } from "lucide-react";
import { useId, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type NativeCheckboxProps = Omit<ComponentProps<"input">, "type" | "role" | "children">;

const fokus =
  "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--mp-fokus)] peer-focus-visible:outline-solid";

export function Prekidac({
  naziv,
  opis,
  oznaka,
  className,
  id,
  "aria-describedby": describedByCaller,
  ...input
}: NativeCheckboxProps & {
  naziv: ReactNode;
  /** Stays fully readable when the switch is disabled: it is the reason (e.g. "Dostupno uz Premium nalog."). */
  opis?: ReactNode;
  /** A label beside the name, e.g. <StatusOznaka ikonica={Lock}>Premium</StatusOznaka>. */
  oznaka?: ReactNode;
}) {
  const generated = useId();
  const inputId = id ?? generated;
  const opisId = opis ? `${inputId}-opis` : undefined;
  const describedBy = [opisId, describedByCaller].filter(Boolean).join(" ") || undefined;
  return (
    <label
      htmlFor={inputId}
      data-prekidac=""
      className={cn(
        "group flex min-h-[var(--mp-meta)] cursor-pointer items-start gap-3 py-2 has-[:disabled]:cursor-not-allowed",
        className,
      )}
    >
      <span className="relative mt-0.5 inline-flex h-7 w-12 shrink-0 group-has-[:disabled]:opacity-55">
        <input
          id={inputId}
          type="checkbox"
          role="switch"
          className="peer absolute inset-0 z-10 m-0 size-full cursor-[inherit] appearance-none opacity-0"
          {...input}
          aria-describedby={describedBy}
        />
        <span
          aria-hidden="true"
          className={cn(
            "absolute inset-0 rounded-full border-2 [--border:var(--mp-ivica-kontrole)] bg-[var(--mp-povrsina)]",
            "transition-colors duration-[var(--mp-trajanje-2)] motion-reduce:transition-none",
            "peer-checked:[--border:var(--mp-mastilo)] peer-checked:bg-[var(--mp-akcent)]",
            fokus,
          )}
        />
        <span
          aria-hidden="true"
          className={cn(
            "absolute top-1 left-1 grid size-5 place-items-center rounded-full bg-[var(--mp-ivica-kontrole)] text-transparent",
            "transition-[transform,background-color,color] duration-[var(--mp-trajanje-2)] ease-[var(--mp-kriva-ulaz)] motion-reduce:transition-none",
            "peer-checked:translate-x-5 peer-checked:bg-[var(--mp-na-akcentu)] peer-checked:text-[var(--mp-akcent)]",
          )}
        >
          <Check strokeWidth={3} className="size-3" />
        </span>
      </span>
      <span className="grid min-w-0 gap-0.5 pt-0.5">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-medium leading-snug text-[var(--mp-tekst)] group-has-[:disabled]:opacity-55">{naziv}</span>
          {oznaka}
        </span>
        {opis ? (
          <span id={opisId} className="text-sm leading-relaxed text-[var(--mp-tekst-sporedni)]">
            {opis}
          </span>
        ) : null}
      </span>
    </label>
  );
}

export function PoljePotvrde({
  naziv,
  opis,
  greska,
  className,
  id,
  "aria-describedby": describedByCaller,
  ...input
}: NativeCheckboxProps & {
  naziv: ReactNode;
  opis?: ReactNode;
  /** Shown below, announced, and linked with aria-describedby + aria-invalid. */
  greska?: ReactNode;
}) {
  const generated = useId();
  const inputId = id ?? generated;
  const opisId = opis ? `${inputId}-opis` : undefined;
  const greskaId = greska ? `${inputId}-greska` : undefined;
  const describedBy = [opisId, greskaId, describedByCaller].filter(Boolean).join(" ") || undefined;
  return (
    <div data-polje-potvrde="" className={cn("grid gap-1", className)}>
      <label
        htmlFor={inputId}
        className="flex min-h-[var(--mp-meta)] cursor-pointer items-start gap-3 py-2 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-55"
      >
        <span className="relative mt-0.5 inline-flex size-6 shrink-0">
          <input
            id={inputId}
            type="checkbox"
            className="peer absolute inset-0 z-10 m-0 size-full cursor-[inherit] appearance-none opacity-0"
            {...input}
            aria-describedby={describedBy}
            aria-invalid={greska ? true : input["aria-invalid"]}
          />
          <span
            aria-hidden="true"
            className={cn(
              "absolute inset-0 rounded-[0.375rem] border-2 [--border:var(--mp-ivica-kontrole)] bg-[var(--mp-povrsina)]",
              "peer-checked:[--border:var(--mp-mastilo)] peer-checked:bg-[var(--mp-mastilo)]",
              greska && "[--border:var(--mp-opasnost)]",
              fokus,
            )}
          />
          <Check
            aria-hidden="true"
            strokeWidth={3}
            className="pointer-events-none absolute inset-0 m-auto size-4 text-[var(--mp-na-mastilu)] opacity-0 peer-checked:opacity-100"
          />
        </span>
        <span className="grid min-w-0 gap-0.5 pt-0.5">
          <span className="font-medium leading-snug text-[var(--mp-tekst)]">{naziv}</span>
          {opis ? (
            <span id={opisId} className="text-sm leading-relaxed text-[var(--mp-tekst-sporedni)]">
              {opis}
            </span>
          ) : null}
        </span>
      </label>
      {greska ? (
        <p id={greskaId} role="alert" className="pl-9 text-sm font-medium text-[var(--mp-opasnost)]">
          {greska}
        </p>
      ) : null}
    </div>
  );
}
