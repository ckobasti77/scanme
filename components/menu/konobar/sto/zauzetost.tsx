"use client";

// ScanMe Menu V1 (K23) — Status stola in the table detail (master §9.4
// ZAKLJUČANO; MENU-UX §1.3): the optional occupancy module, set BY HAND in the
// context of the chosen table. It is rendered only when the venue uses the
// module (the detail decides), so there is no "Slobodan" by default: a table
// nobody marked is "Bez oznake" and the control starts with no state pressed.
// Four buttons — Slobodan, Zauzet, Rezervisan, Van upotrebe — each with its
// icon in its colour and the word; the current one is `aria-pressed` and shows
// an ink border, a soft fill AND a check, never colour alone. Pressing the
// current one does nothing; `Ukloni oznaku` (only on a marked table) returns
// the table to neutral. While a change is in flight the pressed button shows
// a spinner and the others ignore taps; offline every button is disabled. The
// system never changes this state by itself, and there is no table history
// (master §10.5).

import { Check, Eraser, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { fmt } from "@/lib/i18n/format";
import { menuKonobarSr } from "@/lib/i18n/sr/menu-konobar";
import { clockTime } from "@/lib/menu/elapsed-time";
import { OCCUPANCY_STATES, type OccupancyState, type OccupancyView } from "@/lib/menu/occupancy";
import { cn } from "@/lib/utils";
import { Dugme } from "../../zajednicko/dugme";
import { ZAUZETOST } from "../sala/zauzetost-oznaka";

const t = menuKonobarSr.sto;
const reci = menuKonobarSr.zauzetost;

export type ZauzetostStolaProps = {
  /** The current state, or "neutral" (nobody marked the table). */
  stanje: OccupancyView;
  /** Who set the state and when (null for a neutral table). */
  meta: { updatedAt: number; updatedBy: string | null } | null;
  /** A change is in flight: the pressed button shows a spinner, the others ignore taps. */
  radi: boolean;
  /** Offline: every button is disabled. */
  iskljuceno: boolean;
  /** null = back to neutral. */
  onPromena(stanje: OccupancyState | null): void;
};

/** "Zauzet · od 14:27 · Milan" (without the name when nobody is recorded), or "Bez oznake — Sto nije označen." */
function trenutnoTekst(stanje: OccupancyView, meta: ZauzetostStolaProps["meta"]): string {
  if (stanje === "neutral") return `${t.neutralno} — ${t.neutralnoOpis}`;
  if (!meta) return fmt(t.statusTrenutno, { stanje: reci[stanje] });
  // Built from the parts of the template, so a missing name leaves no trailing separator.
  const delovi = t.statusPromenio.split(" · ").filter((deo) => meta.updatedBy || !deo.includes("{ime}"));
  return fmt(delovi.join(" · "), { stanje: reci[stanje], vreme: clockTime(meta.updatedAt), ime: meta.updatedBy ?? "" });
}

const PLOCICA = [
  "relative flex min-h-12 cursor-pointer select-none flex-col items-center justify-center gap-1",
  "rounded-[var(--mp-radius-dugme)] [--button-radius:var(--mp-radius-dugme)] border px-2 py-2.5",
  "text-center text-[0.9375rem] font-semibold leading-tight text-[var(--mp-tekst)]",
  "transition-[background-color,border-color,box-shadow] duration-[var(--mp-trajanje-1)] ease-[var(--mp-kriva-ulaz)] motion-reduce:transition-none",
  "disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-wait",
].join(" ");

export function ZauzetostStola({ stanje, meta, radi, iskljuceno, onPromena }: ZauzetostStolaProps) {
  const [pritisnuto, setPritisnuto] = useState<OccupancyState | "ukloni" | null>(null);
  const naslovRef = useRef<HTMLHeadingElement>(null);
  const prethodno = useRef<OccupancyView>(stanje);

  // The `Ukloni oznaku` button leaves with the mark: focus goes to the heading, not to the page's top.
  useEffect(() => {
    if (prethodno.current !== "neutral" && stanje === "neutral" && pritisnuto === "ukloni") naslovRef.current?.focus();
    prethodno.current = stanje;
  }, [stanje, pritisnuto]);

  function promeni(sledece: OccupancyState | null) {
    if (radi || iskljuceno || sledece === stanje) return;
    setPritisnuto(sledece ?? "ukloni");
    onPromena(sledece);
  }

  return (
    <section aria-labelledby="sto-status" className="grid gap-3" data-sto-zauzetost>
      <div className="grid gap-1">
        <h2
          id="sto-status"
          ref={naslovRef}
          tabIndex={-1}
          className="scroll-mt-24 text-lg font-bold text-[var(--mp-tekst)] outline-none"
        >
          {t.status}
        </h2>
        <p className="text-[0.9375rem] text-[var(--mp-tekst-sporedni)]">{t.statusOpis}</p>
      </div>

      <p data-zauzetost-trenutno={stanje} className="text-base font-semibold text-[var(--mp-tekst)]">
        {trenutnoTekst(stanje, meta)}
      </p>

      <div role="group" aria-labelledby="sto-status" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {OCCUPANCY_STATES.map((stanjeDugmeta) => {
          const z = ZAUZETOST[stanjeDugmeta];
          const Ikonica = z.ikonica;
          const trenutno = stanje === stanjeDugmeta;
          const radiOvo = radi && pritisnuto === stanjeDugmeta;
          return (
            <button
              key={stanjeDugmeta}
              type="button"
              data-zauzetost-dugme={stanjeDugmeta}
              aria-pressed={trenutno}
              aria-busy={radiOvo || undefined}
              aria-disabled={radi || undefined}
              disabled={iskljuceno}
              onClick={() => promeni(stanjeDugmeta)}
              className={cn(
                PLOCICA,
                trenutno
                  ? cn("[--border:var(--mp-mastilo)] shadow-[inset_0_0_0_1px_var(--mp-mastilo)]", ZAUZETOST[stanjeDugmeta].meko)
                  : cn(
                      "[--border:var(--mp-ivica-kontrole)] bg-[var(--mp-povrsina)]",
                      radi ? "opacity-60" : "hover:bg-[var(--mp-povrsina-utisana)]",
                    ),
              )}
            >
              {radiOvo ? (
                <LoaderCircle aria-hidden="true" strokeWidth={2} className="size-5 shrink-0 animate-spin motion-reduce:animate-none" />
              ) : (
                <Ikonica aria-hidden="true" strokeWidth={2} className={cn("size-5 shrink-0", z.boja)} />
              )}
              <span>{reci[stanjeDugmeta]}</span>
              {trenutno ? (
                <Check aria-hidden="true" strokeWidth={2.5} className="absolute right-1.5 top-1.5 size-4 text-[var(--mp-tekst)]" />
              ) : null}
            </button>
          );
        })}
      </div>

      {stanje !== "neutral" ? (
        <Dugme
          vrsta="tiho"
          ikonica={Eraser}
          ucitava={radi && pritisnuto === "ukloni"}
          disabled={iskljuceno}
          onClick={() => promeni(null)}
          data-zauzetost-ukloni
          className="min-h-12 w-full sm:w-fit"
        >
          {t.ukloniOznaku}
        </Dugme>
      ) : null}
    </section>
  );
}
