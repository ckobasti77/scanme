"use client";

// ScanMe Menu V1 (K30) — a segmented choice of the Analitika section (period,
// the metric of the trend chart). Real radio inputs (arrow keys, one tab stop),
// the recipe of `SegmentIzbor` in components/menu/lokal/zajednicko.tsx, plus
// locked options: a Premium option on Standard stays visible with a lock icon,
// is disabled and points to the sentence that says why (MENU-UX §9).

import { Lock } from "lucide-react";
import { useId } from "react";
import { cn } from "@/lib/utils";

export type SegmentOpcija<T extends string> = { vrednost: T; tekst: string; zakljucano?: boolean };

export function Segment<T extends string>({
  oznaka,
  opcije,
  izabrano,
  onIzbor,
  razlogId,
  skrivenaOznaka = false,
  className,
}: {
  oznaka: string;
  opcije: readonly SegmentOpcija<T>[];
  izabrano: T;
  onIzbor: (vrednost: T) => void;
  /** The id of the sentence that explains the locked options. */
  razlogId?: string;
  /** The legend is read by screen readers only (a visible heading already names the choice). */
  skrivenaOznaka?: boolean;
  className?: string;
}) {
  const ime = useId();
  return (
    <fieldset className={cn("grid min-w-0 gap-1.5", className)}>
      <legend className={cn("mb-1.5 text-sm font-semibold text-[var(--mp-tekst)]", skrivenaOznaka && "sr-only")}>{oznaka}</legend>
      <div className="grid min-w-0 grid-cols-2 gap-1 rounded-[var(--mp-radius-kontrola)] border sm:flex sm:flex-wrap sm:rounded-[var(--mp-radius-dugme)] [--border:var(--mp-ivica)] bg-[var(--mp-povrsina-utisana)] p-[3px]">
        {opcije.map((opcija) => {
          const aktivno = opcija.vrednost === izabrano;
          return (
            <label
              key={opcija.vrednost}
              data-opcija={opcija.vrednost}
              data-zakljucano={opcija.zakljucano ? "" : undefined}
              className={cn(
                "relative inline-flex min-h-[var(--mp-meta)] min-w-0 flex-auto items-center justify-center gap-1.5 rounded-[var(--mp-radius-dugme)] px-3 py-1.5 text-center text-sm font-semibold leading-tight",
                "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--mp-fokus)]",
                opcija.zakljucano
                  ? "cursor-not-allowed text-[var(--mp-tekst-sporedni)]"
                  : aktivno
                    ? "cursor-pointer bg-[var(--mp-mastilo)] text-[var(--mp-na-mastilu)]"
                    : "cursor-pointer text-[var(--mp-tekst)] hover:bg-[var(--mp-povrsina)]",
              )}
            >
              <input
                type="radio"
                name={ime}
                value={opcija.vrednost}
                checked={aktivno}
                disabled={opcija.zakljucano}
                aria-describedby={opcija.zakljucano ? razlogId : undefined}
                onChange={() => onIzbor(opcija.vrednost)}
                className="absolute inset-0 m-0 size-full cursor-[inherit] appearance-none opacity-0"
              />
              {opcija.zakljucano ? <Lock aria-hidden="true" strokeWidth={2} className="size-3.5 shrink-0" /> : null}
              {opcija.tekst}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
