"use client";

// ScanMe Menu V1 (K22) — the header of the waiter panel (plan K19 §5
// "Zaglavlje"; mockups 10, 13): the venue, the person signed in on this
// device ("U smeni", until when the sign-in holds), the number of active
// requests, the clock, the app theme switch (this local one hides the
// floating global one, so nothing covers the bottom navigation) and the
// person menu with "Odjavi se". K23 adds the sound switch (a device
// setting, master §8.5: it switches the sound off completely) and the zone
// control (only when the venue has zones).

import { LogOut, UserRound, Volume2, VolumeX, WifiOff } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { fmt, srPluralCategory } from "@/lib/i18n/format";
import { menuKonobarSr } from "@/lib/i18n/sr/menu-konobar";
import { clockTime } from "@/lib/menu/elapsed-time";
import { cn } from "@/lib/utils";
import { Dugme } from "../zajednicko/dugme";
import type { KonobarKorisnik } from "./model";

const t = { ...menuKonobarSr.zaglavlje, zvuk: menuKonobarSr.zvuk };

export function Zaglavlje({
  lokal,
  korisnik,
  aktivni,
  sadaMs,
  onOdjava,
  odjavljuje = false,
  offline = false,
  zvuk,
  zona,
}: {
  lokal: string;
  korisnik: KonobarKorisnik;
  /** Active requests (null while loading). */
  aktivni: number | null;
  sadaMs: number;
  onOdjava(): void;
  odjavljuje?: boolean;
  /** No connection: a persistent chip, so the reason never scrolls away. */
  offline?: boolean;
  /** K23: the sound of this device (on/off). */
  zvuk?: { ukljucen: boolean; onPrebaci(): void };
  /** K23: the zone control (only when the venue has zones). */
  zona?: ReactNode;
}) {
  const [otvoren, setOtvoren] = useState(false);
  const meniId = useId();
  const okidac = useRef<HTMLButtonElement>(null);
  const okvir = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!otvoren) return;
    function naKlik(event: PointerEvent) {
      if (okvir.current && !okvir.current.contains(event.target as Node)) setOtvoren(false);
    }
    function naTaster(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOtvoren(false);
        okidac.current?.focus();
      }
    }
    document.addEventListener("pointerdown", naKlik);
    document.addEventListener("keydown", naTaster);
    return () => {
      document.removeEventListener("pointerdown", naKlik);
      document.removeEventListener("keydown", naTaster);
    };
  }, [otvoren]);

  const aktivniTekst =
    aktivni === null ? null : aktivni === 0 ? t.bezAktivnih : fmt(t.aktivni[srPluralCategory(aktivni)], { n: aktivni });

  return (
    <header className="sticky top-0 z-30 border-b bg-[var(--mp-povrsina)] [--border:var(--mp-ivica)]">
      <div className="mx-auto flex min-h-16 max-w-[110rem] items-center gap-2 px-4 sm:gap-3 lg:px-6">
        <div className="grid min-w-0 flex-1 leading-tight">
          <p className="truncate text-[1.0625rem] font-bold text-[var(--mp-tekst)]">{lokal}</p>
          {offline ? (
            // The state stands under the name at every width (icon + colour + word), so it never squeezes the name and never loses its word.
            <p className="mt-0.5 inline-flex min-h-8 w-fit max-w-full items-center gap-1.5 rounded-full border px-2.5 text-sm font-bold text-[var(--mp-tekst)] [--border:var(--mp-upozorenje-ivica)] bg-[var(--mp-upozorenje-meko)]">
              <WifiOff aria-hidden="true" strokeWidth={2} className="size-4 shrink-0 text-[var(--mp-upozorenje)]" />
              <span className="truncate">{t.bezVeze}</span>
            </p>
          ) : (
            <p className="truncate text-sm text-[var(--mp-tekst-sporedni)]">{t.panel}</p>
          )}
        </div>

        {aktivniTekst !== null ? (
          <p
            className={cn(
              "inline-flex min-h-10 items-center gap-2 rounded-full border px-3 text-base font-bold tabular-nums",
              aktivni ? "[--border:var(--mp-info-ivica)] bg-[var(--mp-info-meko)] text-[var(--mp-tekst)]" : "[--border:var(--mp-ivica)] text-[var(--mp-tekst-sporedni)]",
            )}
            title={aktivniTekst}
          >
            <span aria-hidden="true" className={cn("size-2.5 rounded-full", aktivni ? "bg-[var(--mp-info)]" : "bg-[var(--mp-ivica-kontrole)]")} />
            <span aria-hidden="true" className="min-[420px]:hidden">{aktivni}</span>
            <span aria-hidden="true" className="hidden min-[420px]:inline">
              {aktivni ? fmt(t.aktivniKratko, { n: aktivni }) : aktivni}
            </span>
            <span className="sr-only">{aktivniTekst}</span>
          </p>
        ) : null}

        <p className="hidden text-[1.0625rem] font-bold tabular-nums text-[var(--mp-tekst)] md:block" aria-hidden="true">
          {clockTime(sadaMs)}
        </p>

        {zvuk ? (
          <button
            type="button"
            aria-pressed={zvuk.ukljucen}
            aria-label={t.zvuk.oznaka}
            title={zvuk.ukljucen ? t.zvuk.ukljucen : t.zvuk.iskljucen}
            onClick={zvuk.onPrebaci}
            data-zvuk={zvuk.ukljucen ? "ukljucen" : "iskljucen"}
            className={cn(
              "inline-flex min-h-12 min-w-12 items-center justify-center gap-2 rounded-full border px-3 text-base font-semibold [--button-radius:999px]",
              zvuk.ukljucen
                ? "[--border:var(--mp-ivica-kontrole)] text-[var(--mp-tekst)] hover:bg-[var(--mp-povrsina-utisana)]"
                : "[--border:var(--mp-upozorenje-ivica)] bg-[var(--mp-upozorenje-meko)] text-[var(--mp-tekst)]",
            )}
          >
            {zvuk.ukljucen ? (
              <Volume2 aria-hidden="true" strokeWidth={2} className="size-5 shrink-0" />
            ) : (
              <VolumeX aria-hidden="true" strokeWidth={2} className="size-5 shrink-0 text-[var(--mp-upozorenje)]" />
            )}
            <span aria-hidden="true" className="hidden whitespace-nowrap xl:inline">
              {zvuk.ukljucen ? t.zvuk.ukljucen : t.zvuk.iskljucen}
            </span>
          </button>
        ) : null}

        {zona}

        {/* On a narrow phone the theme switch moves into the person menu, so the header keeps the venue readable. */}
        <ThemeToggle placement="local" className="hidden rounded-full [--button-radius:999px] min-[480px]:inline-flex" />

        <div ref={okvir} className="relative">
          <button
            ref={okidac}
            type="button"
            aria-expanded={otvoren}
            aria-controls={meniId}
            aria-label={fmt(t.meniKorisnika, { ime: korisnik.displayName })}
            onClick={() => setOtvoren((staro) => !staro)}
            className="inline-flex min-h-12 max-w-[11rem] items-center gap-2 rounded-full border px-3 text-base font-semibold text-[var(--mp-tekst)] [--border:var(--mp-ivica-kontrole)] [--button-radius:999px] hover:bg-[var(--mp-povrsina-utisana)]"
          >
            <UserRound aria-hidden="true" strokeWidth={2} className="size-5 shrink-0" />
            <span className="hidden truncate min-[420px]:inline">{korisnik.displayName}</span>
          </button>
          {otvoren ? (
            <div
              id={meniId}
              className="absolute right-0 top-[calc(100%+0.5rem)] z-40 grid w-[17rem] gap-3 rounded-[var(--mp-radius-kartica)] border bg-[var(--mp-povrsina)] p-4 shadow-[var(--mp-senka-md)]"
            >
              <div className="grid gap-0.5">
                <p className="text-[1.0625rem] font-bold text-[var(--mp-tekst)]">{korisnik.displayName}</p>
                <p className="text-[0.9375rem] text-[var(--mp-tekst-sporedni)]">
                  {korisnik.kind === "account"
                    ? t.nalogom
                    : korisnik.expiresAt !== null
                      ? `${t.uSmeni} · ${fmt(t.vaziDo, { vreme: clockTime(korisnik.expiresAt) })}`
                      : t.uSmeni}
                </p>
              </div>
              <div className="flex items-center justify-between gap-3 min-[480px]:hidden">
                <span className="text-[0.9375rem] text-[var(--mp-tekst-sporedni)]">{t.tema}</span>
                <ThemeToggle placement="local" className="rounded-full [--button-radius:999px]" />
              </div>
              <Dugme vrsta="sekundarno" ikonica={LogOut} ucitava={odjavljuje} onClick={onOdjava} className="w-full">
                {korisnik.kind === "account" ? t.izlaz : odjavljuje ? t.odjavljuje : t.odjava}
              </Dugme>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
