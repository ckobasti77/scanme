"use client";

// ScanMe Menu V1 (K20) — the small pieces "Lokal i QR" shares: field styles, a
// labelled field, a segmented radio choice, the inline confirmation, the
// message boxes, the runner of an action (pending state + mapped error), the
// focus return of a drawer opened from state, and the pure grouping of the
// list. Panel tokens only (docs/menu/MENU-UX.md §2, §4); every text comes from
// the `menu-lokal` dictionary or from `menu-domen` (error codes).

import { CircleCheck, Info, OctagonAlert, Utensils, BedDouble, MapPin, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { fmt, srPluralCategory } from "@/lib/i18n/format";
import { menuDomenSr } from "@/lib/i18n/sr/menu-domen";
import { menuLokalSr } from "@/lib/i18n/sr/menu-lokal";
import { compareLabels, type FloorPositionKind } from "@/lib/menu/floor-layout";
import type { LokalIshod, LokalPozicija, LokalStranica, LokalZona } from "@/lib/menu/lokal/model";
import { cn } from "@/lib/utils";
import { Dugme } from "../zajednicko/dugme";

const t = menuLokalSr;

/** Text field, select and number field of the panel (the same recipe as the editor's fields). */
export const POLJE_KLASA =
  "h-[var(--mp-meta)] w-full min-w-0 rounded-[var(--mp-radius-kontrola)] border [--border:var(--mp-ivica-kontrole)] bg-[var(--mp-povrsina)] px-3 text-base text-[var(--mp-tekst)] placeholder:text-[var(--mp-tekst-sporedni)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mp-fokus)] aria-[invalid=true]:[--border:var(--mp-opasnost)] disabled:cursor-not-allowed disabled:bg-[var(--mp-povrsina-utisana)] disabled:text-[var(--mp-tekst-sporedni)] sm:text-[0.9375rem]";

export const OZNAKA_KLASA = "text-sm font-semibold text-[var(--mp-tekst)]";

/** The icon of a position kind. Decorative: the kind is always written next to it. */
export const IKONICE_VRSTE: Record<FloorPositionKind, LucideIcon> = {
  table: Utensils,
  room: BedDouble,
  other: MapPin,
};

export const VRSTE: readonly FloorPositionKind[] = ["table", "room", "other"];

export type Mnozina = { one: string; few: string; many: string };

/** "3 zone", "1 zona": the unit with the right Serbian plural. */
export function brojTekst(mnozina: Mnozina, n: number): string {
  return fmt(mnozina[srPluralCategory(n)], { n });
}

/** Serbian text of a machine error code; a code the domain does not know gets the generic, retryable message. */
export function porukaGreske(code: string): string {
  const poznate: Record<string, string | undefined> = menuDomenSr.errors;
  return poznate[code] ?? t.zajednicko.greskaOpsta;
}

/** What the guest and the owner call a page: the default page is "Meni". */
export function nazivStranice(stranica: LokalStranica): string {
  return stranica.isDefault ? t.kartice.otvara.meni : stranica.name;
}

export function sortirajZone(zones: readonly LokalZona[]): LokalZona[] {
  return [...zones].sort((a, b) => a.order - b.order || compareLabels(a.name, b.name));
}

export function sortirajPozicije(positions: readonly LokalPozicija[]): LokalPozicija[] {
  return [...positions].sort((a, b) => compareLabels(a.label, b.label) || a.order - b.order);
}

export type GrupaPozicija = { zona: LokalZona | null; pozicije: LokalPozicija[] };

/**
 * The positions in the order the list shows them. Without zones: one flat
 * group (zona null) and no zone anywhere (master §9.3). With zones: every zone
 * in its order, then "Bez zone" (only when it has positions).
 */
export function grupisiPozicije(zones: readonly LokalZona[], positions: readonly LokalPozicija[]): GrupaPozicija[] {
  if (zones.length === 0) return [{ zona: null, pozicije: sortirajPozicije(positions) }];
  const poZoni = new Map<string, LokalPozicija[]>(zones.map((zona) => [zona.id, []]));
  const bezZone: LokalPozicija[] = [];
  for (const pozicija of positions) {
    const lista = pozicija.zoneId === null ? undefined : poZoni.get(pozicija.zoneId);
    if (lista) lista.push(pozicija);
    else bezZone.push(pozicija);
  }
  const grupe: GrupaPozicija[] = sortirajZone(zones).map((zona) => ({
    zona,
    pozicije: sortirajPozicije(poZoni.get(zona.id) ?? []),
  }));
  if (bezZone.length > 0) grupe.push({ zona: null, pozicije: sortirajPozicije(bezZone) });
  return grupe;
}

/**
 * Runs one action at a time: `radi` is the key of the pending one, `greska`
 * the Serbian text of the last failure. Resolves to whether it succeeded.
 */
export function useRadnja() {
  const [radi, setRadi] = useState<string | null>(null);
  const [greska, setGreska] = useState<string | null>(null);
  const zauzeto = useRef(false);

  const pokreni = useCallback(async (kljuc: string, rad: () => Promise<LokalIshod>): Promise<boolean> => {
    if (zauzeto.current) return false;
    zauzeto.current = true;
    setRadi(kljuc);
    setGreska(null);
    let ishod: LokalIshod;
    try {
      ishod = await rad();
    } catch {
      ishod = { ok: false, code: "mreza" };
    }
    zauzeto.current = false;
    setRadi(null);
    if (!ishod.ok) {
      setGreska(porukaGreske(ishod.code));
      return false;
    }
    return true;
  }, []);

  const ocisti = useCallback(() => setGreska(null), []);
  return { radi, greska, pokreni, ocisti };
}

/**
 * Radix returns focus only to a Trigger, and these surfaces open from state:
 * remember what had focus when the content mounted and give it back when the
 * content is gone (or `rezervaId` when that element no longer exists, e.g. a
 * position that was just archived). Call it inside the content of the drawer.
 */
export function useVracanjeFokusa(rezervaId?: string) {
  const [meta] = useState<HTMLElement | null>(() => {
    if (typeof document === "undefined") return null;
    const aktivan = document.activeElement;
    return aktivan instanceof HTMLElement && aktivan !== document.body ? aktivan : null;
  });
  const ziv = useRef(false);
  useEffect(() => {
    ziv.current = true;
    return () => {
      ziv.current = false;
      // After Radix's own (no-op) focus return; skipped when the content mounted again (dev double effect).
      window.setTimeout(() => {
        if (ziv.current) return;
        if (meta?.isConnected) meta.focus({ preventScroll: true });
        else if (rezervaId) document.getElementById(rezervaId)?.focus({ preventScroll: true });
      }, 30);
    };
  }, [meta, rezervaId]);
}

/** A label, the control (given its aria attributes), a hint and the error under it. */
export function Polje({
  id,
  oznaka,
  nijeObavezno = false,
  pomoc,
  greska,
  className,
  children,
}: {
  id: string;
  oznaka: ReactNode;
  nijeObavezno?: boolean;
  pomoc?: ReactNode;
  greska?: string | null;
  className?: string;
  children: (aria: { id: string; "aria-invalid": true | undefined; "aria-describedby": string | undefined }) => ReactNode;
}) {
  const opis = [pomoc ? `${id}-pomoc` : null, greska ? `${id}-greska` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("grid content-start gap-1.5", className)}>
      <label htmlFor={id} className={OZNAKA_KLASA}>
        {oznaka}
        {nijeObavezno ? (
          <span className="font-normal text-[var(--mp-tekst-sporedni)]"> ({t.zajednicko.nijeObavezno})</span>
        ) : null}
      </label>
      {children({ id, "aria-invalid": greska ? true : undefined, "aria-describedby": opis })}
      {pomoc ? (
        <p id={`${id}-pomoc`} className="text-sm leading-snug text-[var(--mp-tekst-sporedni)]">
          {pomoc}
        </p>
      ) : null}
      {greska ? (
        <p id={`${id}-greska`} role="alert" className="text-sm font-medium text-[var(--mp-opasnost)]">
          {greska}
        </p>
      ) : null}
    </div>
  );
}

/** A choice of a few values as native radios that look segmented (one tab stop, arrows move). */
export function SegmentIzbor<T extends string>({
  oznaka,
  vrednosti,
  izabrano,
  onIzbor,
  ikonice,
}: {
  oznaka: string;
  vrednosti: readonly { vrednost: T; tekst: string }[];
  izabrano: T;
  onIzbor: (vrednost: T) => void;
  ikonice?: Partial<Record<T, LucideIcon>>;
}) {
  const ime = useId();
  return (
    <fieldset className="grid min-w-0 gap-1.5">
      <legend className={cn(OZNAKA_KLASA, "mb-1.5")}>{oznaka}</legend>
      <div className="flex min-w-0 flex-wrap gap-1 rounded-[var(--mp-radius-dugme)] border [--border:var(--mp-ivica)] bg-[var(--mp-povrsina-utisana)] p-[3px]">
        {vrednosti.map((stavka) => {
          const aktivno = stavka.vrednost === izabrano;
          const Ikonica: LucideIcon | undefined = ikonice?.[stavka.vrednost];
          return (
            <label
              key={stavka.vrednost}
              className={cn(
                "relative inline-flex min-h-[var(--mp-meta)] min-w-0 flex-1 cursor-pointer items-center justify-center gap-2 rounded-[var(--mp-radius-dugme)] px-3 py-1.5 text-center text-sm font-semibold leading-tight",
                "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--mp-fokus)]",
                aktivno
                  ? "bg-[var(--mp-mastilo)] text-[var(--mp-na-mastilu)]"
                  : "text-[var(--mp-tekst)] hover:bg-[var(--mp-povrsina)]",
              )}
            >
              <input
                type="radio"
                name={ime}
                value={stavka.vrednost}
                checked={aktivno}
                onChange={() => onIzbor(stavka.vrednost)}
                className="absolute inset-0 m-0 size-full cursor-[inherit] appearance-none opacity-0"
              />
              {Ikonica ? <Ikonica aria-hidden="true" strokeWidth={1.75} className="size-4 shrink-0" /> : null}
              {stavka.tekst}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** The choice of the kind: Sto / Soba / Ostalo. */
export function VrstaIzbor({
  izabrano,
  onIzbor,
  oznaka = t.vrste.oznaka,
}: {
  izabrano: FloorPositionKind;
  onIzbor: (vrsta: FloorPositionKind) => void;
  oznaka?: string;
}) {
  return (
    <SegmentIzbor
      oznaka={oznaka}
      izabrano={izabrano}
      onIzbor={onIzbor}
      vrednosti={VRSTE.map((vrsta) => ({ vrednost: vrsta, tekst: t.vrste[vrsta] }))}
      ikonice={IKONICE_VRSTE}
    />
  );
}

/** An error that blocks an action: announced at once, with an icon, the form stays as it is. */
export function PorukaGreske({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      role="alert"
      className={cn(
        "flex items-start gap-2 rounded-[var(--mp-radius-kontrola)] border px-3 py-2 text-sm font-medium text-[var(--mp-tekst)] [--border:var(--mp-opasnost-ivica)] bg-[var(--mp-opasnost-meko)]",
        className,
      )}
    >
      <OctagonAlert aria-hidden="true" strokeWidth={2} className="mt-0.5 size-4 shrink-0 text-[var(--mp-opasnost)]" />
      <span className="sr-only">{t.zajednicko.greskaOznaka}</span>
      <span className="min-w-0">{children}</span>
    </p>
  );
}

/**
 * A result that stays on the open surface (the surface itself keeps working).
 * The live region is always there and only its text changes, so a screen
 * reader announces the news politely; `tekst` null = nothing to say.
 */
export function PorukaUspeha({ tekst }: { tekst: string | null }) {
  return (
    <div role="status" aria-live="polite">
      {tekst ? (
        <p className="flex items-start gap-2 rounded-[var(--mp-radius-kontrola)] border px-3 py-2 text-sm font-medium text-[var(--mp-tekst)] [--border:var(--mp-uspeh-ivica)] bg-[var(--mp-uspeh-meko)]">
          <CircleCheck aria-hidden="true" strokeWidth={2} className="mt-0.5 size-4 shrink-0 text-[var(--mp-uspeh)]" />
          <span className="min-w-0">{tekst}</span>
        </p>
      ) : null}
    </div>
  );
}

/** A quiet explanation with an info icon. */
export function Napomena({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        "flex items-start gap-2 rounded-[var(--mp-radius-kontrola)] bg-[var(--mp-povrsina-utisana)] px-3 py-2.5 text-sm leading-relaxed text-[var(--mp-tekst)]",
        className,
      )}
    >
      <Info aria-hidden="true" strokeWidth={2} className="mt-0.5 size-4 shrink-0 text-[var(--mp-info)]" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}

/**
 * The step before a destructive action, on the spot: the consequence in
 * words, the safe answer first (it gets focus), the action second.
 */
export function Potvrda({
  tekst,
  potvrdi,
  odustani,
  radi,
  onPotvrdi,
  onOdustani,
}: {
  tekst: string;
  potvrdi: string;
  odustani: string;
  radi: boolean;
  onPotvrdi: () => void;
  onOdustani: () => void;
}) {
  const id = useId();
  const odustaniRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    odustaniRef.current?.focus();
  }, []);
  return (
    <div
      role="group"
      aria-labelledby={id}
      data-potvrda=""
      className="grid gap-3 rounded-[var(--mp-radius-kontrola)] border p-3 [--border:var(--mp-upozorenje-ivica)] bg-[var(--mp-upozorenje-meko)]"
    >
      <p id={id} className="text-sm font-medium leading-relaxed text-[var(--mp-tekst)]">
        {tekst}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Dugme ref={odustaniRef} vrsta="sekundarno" velicina="kompaktna" onClick={onOdustani}>
          {odustani}
        </Dugme>
        <Dugme vrsta="opasno" velicina="kompaktna" ucitava={radi} onClick={onPotvrdi}>
          {potvrdi}
        </Dugme>
      </div>
    </div>
  );
}
