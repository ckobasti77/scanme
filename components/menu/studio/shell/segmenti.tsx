"use client";

// ScanMe Menu V1 — a segmented switch as ARIA tabs (K10): `Ponuda / Izgled`
// and, on a phone, `Struktura / Uredi / Pregled`. Arrow keys move between the
// tabs and activate them; Tab leaves the group (one tab stop).

import { useRef, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

export function Segmenti<T extends string>({
  oznaka,
  vrednosti,
  izabrano,
  onIzbor,
  kontrolise,
  idPrefiks,
  className,
}: {
  oznaka: string;
  vrednosti: readonly { vrednost: T; tekst: string }[];
  izabrano: T;
  onIzbor: (vrednost: T) => void;
  /** Id of the panel the tabs control. */
  kontrolise?: string;
  idPrefiks: string;
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const naTaster = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const pomak = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    let cilj = index + pomak;
    if (event.key === "Home") cilj = 0;
    else if (event.key === "End") cilj = vrednosti.length - 1;
    else if (pomak === 0) return;
    event.preventDefault();
    cilj = (cilj + vrednosti.length) % vrednosti.length;
    onIzbor(vrednosti[cilj].vrednost);
    refs.current[cilj]?.focus();
  };
  return (
    <div
      role="tablist"
      aria-label={oznaka}
      className={cn(
        "inline-flex min-w-0 gap-1 rounded-[var(--mp-radius-dugme)] border [--border:var(--mp-ivica)] bg-[var(--mp-povrsina-utisana)] p-[3px]",
        className,
      )}
    >
      {vrednosti.map((stavka, index) => {
        const aktivno = stavka.vrednost === izabrano;
        return (
          <button
            key={stavka.vrednost}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="button"
            role="tab"
            id={`${idPrefiks}-${stavka.vrednost}`}
            aria-selected={aktivno}
            aria-controls={kontrolise}
            tabIndex={aktivno ? 0 : -1}
            onClick={() => onIzbor(stavka.vrednost)}
            onKeyDown={(event) => naTaster(event, index)}
            className={cn(
              "inline-flex min-h-[var(--mp-meta)] min-w-0 flex-1 items-center justify-center whitespace-nowrap rounded-[var(--mp-radius-dugme)] px-4 text-sm font-semibold [--button-radius:var(--mp-radius-dugme)]",
              "transition-colors duration-[var(--mp-trajanje-1)] motion-reduce:transition-none",
              aktivno
                ? "bg-[var(--mp-mastilo)] text-[var(--mp-na-mastilu)]"
                : "text-[var(--mp-tekst)] hover:bg-[var(--mp-povrsina)]",
            )}
          >
            {stavka.tekst}
          </button>
        );
      })}
    </div>
  );
}
