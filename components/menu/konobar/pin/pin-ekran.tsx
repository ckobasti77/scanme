"use client";

// ScanMe Menu V1 (K22) — the PIN sign-in of the waiter panel (master §10.6;
// mockup 09 with THREE fields, not six — mockups/README). A big keypad
// (64 px keys) that also works from a keyboard (digits, Backspace, Enter),
// three boxes that show how many digits are typed (a screen reader hears
// "Unete su 2 cifre od 3."), and one line that says what happened: wrong PIN
// with the attempts left, the lock with the time it ends (keys disabled
// until then), no network, PINs switched off. The Owner or a Manager signed
// in with their account may enter without a PIN.

import { Check, Delete, Info, LoaderCircle, LogIn, OctagonAlert, Store, TriangleAlert, WifiOff } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { fmt, srPluralCategory } from "@/lib/i18n/format";
import { menuKonobarSr } from "@/lib/i18n/sr/menu-konobar";
import { clockTime } from "@/lib/menu/elapsed-time";
import { PIN_PATTERN } from "@/lib/menu/pin-policy";
import { cn } from "@/lib/utils";
import { Dugme } from "../../zajednicko/dugme";
import { MenuPovrsina } from "../../zajednicko/povrsina";
import type { PinIshod, PinStanje } from "../model";
import { useSat } from "../use-sat";

const t = menuKonobarSr.pin;
const DUZINA = 3;
const TASTERI = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

export type PinEkranProps = {
  lokal: string;
  /** False when PINs are switched off on the deployment (no MENU_PIN_PEPPER). */
  pinDostupan: boolean;
  onPrijava(pin: string): Promise<PinIshod>;
  /** The signed-in Owner or Manager who may enter without a PIN. */
  nalog?: { ime: string } | null;
  onNalog?(): void;
  /** This device was signed in before and the sign-in ended (12 h, logout elsewhere, PIN reset). */
  istekla?: boolean;
  /** The server's instant (hydration); the lock line reads the panel clock. */
  pocetnoMs: number;
  /** Izlog only: a fixed clock start and a starting state. */
  izlogOd?: number;
  pocetnoStanje?: PinStanje;
  pocetniPin?: string;
};

function Poruka({ ton, ikonica: Ikonica, children, uloga }: { ton: "opasnost" | "upozorenje" | "info"; ikonica: typeof Info; children: ReactNode; uloga?: "alert" | "status" }) {
  const boje = {
    opasnost: "[--border:var(--mp-opasnost-ivica)] bg-[var(--mp-opasnost-meko)] [&>svg]:text-[var(--mp-opasnost)]",
    upozorenje: "[--border:var(--mp-upozorenje-ivica)] bg-[var(--mp-upozorenje-meko)] [&>svg]:text-[var(--mp-upozorenje)]",
    info: "[--border:var(--mp-info-ivica)] bg-[var(--mp-info-meko)] [&>svg]:text-[var(--mp-info)]",
  }[ton];
  return (
    <div role={uloga} className={cn("flex items-start gap-3 rounded-[var(--mp-radius-kontrola)] border px-4 py-2 text-base leading-snug text-[var(--mp-tekst)]", boje)}>
      <Ikonica aria-hidden="true" strokeWidth={2} className="mt-0.5 size-5 shrink-0" />
      <div className="grid min-w-0 gap-1">{children}</div>
    </div>
  );
}

export function PinEkran({
  lokal,
  pinDostupan,
  onPrijava,
  nalog = null,
  onNalog,
  istekla = false,
  pocetnoMs,
  izlogOd,
  pocetnoStanje = { kind: "unos" },
  pocetniPin = "",
}: PinEkranProps) {
  const [pin, setPin] = useState(pocetniPin.replace(/\D/g, "").slice(0, DUZINA));
  const [stanje, setStanje] = useState<PinStanje>(pocetnoStanje);
  const sadaMs = useSat(pocetnoMs, { izlogOd });
  const zakljucano = stanje.kind === "blokada" && stanje.lockedUntil > sadaMs;
  const proverava = stanje.kind === "proverava";
  const dostupan = pinDostupan && stanje.kind !== "nedostupno";
  const tasteriIskljuceni = !dostupan || zakljucano || proverava;
  const moze = !tasteriIskljuceni && PIN_PATTERN.test(pin);

  // The latest handlers for the keyboard listener (bound once).
  const radnje = useRef<{ dodaj(cifra: string): void; obrisi(): void; posalji(): Promise<void> } | null>(null);

  function dodaj(cifra: string) {
    if (tasteriIskljuceni) return;
    // The last message stays until the next attempt: removing it would move the keypad under the thumb.
    setPin((staro) => (staro.length >= DUZINA ? staro : staro + cifra));
  }

  function obrisi() {
    if (tasteriIskljuceni) return;
    setPin((staro) => staro.slice(0, -1));
  }

  async function posalji() {
    if (!moze) return;
    const unet = pin;
    setStanje({ kind: "proverava" });
    let ishod: PinIshod;
    try {
      ishod = await onPrijava(unet);
    } catch {
      ishod = { ok: false, stanje: { kind: "veza" } };
    }
    if (ishod.ok) return;
    setPin("");
    setStanje(ishod.stanje);
  }

  useEffect(() => {
    radnje.current = { dodaj, obrisi, posalji };
  });

  useEffect(() => {
    function naTaster(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const cilj = event.target as HTMLElement | null;
      if (cilj && (cilj.tagName === "INPUT" || cilj.tagName === "TEXTAREA" || cilj.isContentEditable)) return;
      if (/^[0-9]$/.test(event.key)) {
        event.preventDefault();
        radnje.current?.dodaj(event.key);
      } else if (event.key === "Backspace") {
        event.preventDefault();
        radnje.current?.obrisi();
      } else if (event.key === "Enter" && !(cilj instanceof HTMLButtonElement)) {
        event.preventDefault();
        void radnje.current?.posalji();
      }
    }
    window.addEventListener("keydown", naTaster);
    return () => window.removeEventListener("keydown", naTaster);
  }, []);

  const taster =
    "grid min-h-14 place-items-center rounded-[var(--mp-radius-dugme)] [--button-radius:var(--mp-radius-dugme)] border text-[1.625rem] font-bold tabular-nums text-[var(--mp-tekst)] [--border:var(--mp-ivica-kontrole)] bg-[var(--mp-povrsina)] transition-[background-color,transform] duration-[var(--mp-trajanje-1)] hover:bg-[var(--mp-povrsina-utisana)] active:scale-[0.97] motion-reduce:active:scale-100 [@media(min-height:900px)]:min-h-16 disabled:cursor-not-allowed disabled:[--border:var(--mp-ivica)] disabled:bg-[var(--mp-povrsina-utisana)] disabled:text-[var(--mp-tekst-sporedni)] disabled:hover:bg-[var(--mp-povrsina-utisana)]";

  return (
    <MenuPovrsina as="main" povrsina="konobar" className="grid min-h-[100dvh] justify-items-center px-4 pb-4 pt-4 sm:place-items-center sm:py-6">
      <div className="grid w-full max-w-[24rem] content-start gap-3 [@media(min-height:900px)]:gap-5">
        <div className="flex items-center justify-between gap-3">
          <BrandLogo width="6.25rem" />
          {/* The local switch hides the floating global one, which would cover the keypad on a phone. */}
          <ThemeToggle placement="local" className="rounded-full [--button-radius:999px]" />
        </div>

        <div className="flex items-center gap-4 rounded-[var(--mp-radius-kartica)] border bg-[var(--mp-povrsina-utisana)] px-4 py-2.5">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--mp-povrsina)]">
            <Store aria-hidden="true" strokeWidth={1.75} className="size-6 text-[var(--mp-tekst)]" />
          </span>
          <div className="grid min-w-0 gap-0.5">
            <p className="truncate text-lg font-bold leading-tight text-[var(--mp-tekst)]">{lokal}</p>
            <p className="text-[0.9375rem] text-[var(--mp-tekst-sporedni)]">{t.podnaslov}</p>
          </div>
        </div>

        <div className="grid gap-1 text-center">
          <h1 className="text-2xl font-bold leading-tight tracking-[-0.01em] text-[var(--mp-tekst)]">{t.naslov}</h1>
          {dostupan ? <p className="text-base text-[var(--mp-tekst-sporedni)]">{t.uputstvo}</p> : null}
        </div>

        {dostupan ? (
          <>
            <div className="grid gap-2">
              <div aria-hidden="true" className="grid grid-cols-3 gap-3" data-pin-polja>
                {Array.from({ length: DUZINA }, (_, indeks) => {
                  const puno = indeks < pin.length;
                  const tekuce = indeks === pin.length && !tasteriIskljuceni;
                  return (
                    <span
                      key={indeks}
                      data-puno={puno || undefined}
                      className={cn(
                        "grid h-14 place-items-center rounded-[var(--mp-radius-dugme)] border-2 [@media(min-height:900px)]:h-16 bg-[var(--mp-povrsina)]",
                        tekuce ? "[--border:var(--mp-mastilo)]" : "[--border:var(--mp-ivica-kontrole)]",
                      )}
                    >
                      <span
                        className={cn(
                          "size-4 rounded-full",
                          puno ? "bg-[var(--mp-mastilo)]" : "bg-[var(--mp-povrsina-utisana)]",
                        )}
                      />
                    </span>
                  );
                })}
              </div>
              <p className="sr-only" aria-live="polite">
                {fmt(t.uneto[srPluralCategory(pin.length)], { n: pin.length })}
              </p>
            </div>

            {/* A reserved slot: messages come and go without moving the keypad. */}
            <div className="min-h-[2.75rem]" data-pin-poruka>
              {stanje.kind === "pogresan" ? (
                <Poruka ton="opasnost" ikonica={OctagonAlert} uloga="alert">
                  <p className="font-semibold">
                    {fmt(t.pogresan[srPluralCategory(stanje.attemptsLeft)], { n: stanje.attemptsLeft })}
                  </p>
                </Poruka>
              ) : stanje.kind === "blokada" && zakljucano ? (
                <Poruka ton="opasnost" ikonica={OctagonAlert} uloga="alert">
                  <p className="font-semibold">{fmt(t.blokada, { vreme: clockTime(stanje.lockedUntil) })}</p>
                  <p className="text-[0.9375rem]">{t.blokadaOpis}</p>
                </Poruka>
              ) : stanje.kind === "veza" ? (
                <Poruka ton="upozorenje" ikonica={WifiOff} uloga="alert">
                  <p>{t.greska}</p>
                </Poruka>
              ) : stanje.kind === "previse" ? (
                <Poruka ton="upozorenje" ikonica={TriangleAlert} uloga="alert">
                  <p>{t.mreza}</p>
                </Poruka>
              ) : istekla && stanje.kind === "unos" ? (
                <Poruka ton="info" ikonica={Info} uloga="status">
                  <p>{t.istekla}</p>
                </Poruka>
              ) : null}
            </div>

            <div role="group" aria-label={t.tastatura} className="grid grid-cols-3 gap-2.5">
              {TASTERI.map((cifra) => (
                <button key={cifra} type="button" className={taster} disabled={tasteriIskljuceni} onClick={() => dodaj(cifra)}>
                  {cifra}
                </button>
              ))}
              <button
                type="button"
                className={cn(taster, "bg-[var(--mp-povrsina-utisana)]")}
                disabled={tasteriIskljuceni || pin.length === 0}
                onClick={obrisi}
                aria-label={t.obrisi}
                title={t.obrisi}
              >
                <Delete aria-hidden="true" strokeWidth={1.75} className="size-7" />
              </button>
              <button type="button" className={taster} disabled={tasteriIskljuceni} onClick={() => dodaj("0")}>
                0
              </button>
              <button
                type="button"
                className={cn(
                  taster,
                  "gap-0.5 text-base [--border:color-mix(in_oklab,var(--mp-akcent)_70%,var(--mp-mastilo))] bg-[var(--mp-akcent)] text-[var(--mp-na-akcentu)] hover:bg-[color-mix(in_oklab,var(--mp-akcent)_86%,white)]",
                )}
                disabled={!moze && !proverava}
                aria-disabled={proverava || undefined}
                aria-busy={proverava || undefined}
                onClick={() => void posalji()}
              >
                {proverava ? (
                  <LoaderCircle aria-hidden="true" strokeWidth={2} className="size-6 animate-spin motion-reduce:animate-none" />
                ) : (
                  <Check aria-hidden="true" strokeWidth={2.25} className="size-6" />
                )}
                <span className="text-[0.9375rem] leading-none">{t.prijava}</span>
                {proverava ? <span className="sr-only">{t.proverava}</span> : null}
              </button>
            </div>
          </>
        ) : (
          <Poruka ton="info" ikonica={Info} uloga="status">
            <p className="font-semibold">{t.bezPeppera}</p>
            <p className="text-[0.9375rem] text-[var(--mp-tekst-sporedni)]">{t.bezPepperaOpis}</p>
          </Poruka>
        )}

        {nalog && onNalog ? (
          <div className="grid gap-2 border-t pt-5 [--border:var(--mp-ivica)]">
            <Dugme vrsta="sekundarno" ikonica={LogIn} onClick={onNalog} className="w-full min-h-14 text-base">
              {fmt(t.nalog, { ime: nalog.ime })}
            </Dugme>
            <p className="text-center text-[0.9375rem] text-[var(--mp-tekst-sporedni)]">{t.nalogOpis}</p>
          </div>
        ) : null}

        {dostupan ? (
          <p className="flex items-center justify-center gap-2 text-[0.9375rem] text-[var(--mp-tekst-sporedni)]">
            <Info aria-hidden="true" strokeWidth={1.75} className="size-5" />
            {t.pomoc}
          </p>
        ) : null}
      </div>
    </MenuPovrsina>
  );
}
