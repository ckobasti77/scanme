"use client";

// ScanMe Menu V1 (K23) — one table in focus (master §10.5; mockup 07): a click
// on a position of the floor opens its context with what is current and the
// actions that belong to it. A card with the kind of place, its name (the H1,
// where focus lands), "Zona · 4 sedišta" and the QR card(s) it has; the active
// requests of the position in the queue's order, each with the live timer, the
// status in words and ONE main action (Preuzmi, Pregledaj, Završi — as on the
// queue card; the title opens the request); the reservation slot (K25, only
// when given); and, ONLY when the venue uses the optional occupancy module,
// Status stola. Without the module nothing about occupancy is rendered: no
// heading, no "Slobodan", no dash (master §9.4). No table history (master
// §10.5). A position that is gone (archived) is an honest state with the back
// button, never a blank screen.

import { ChevronLeft, ChevronRight, OctagonAlert, SearchX, WifiOff } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { fmt } from "@/lib/i18n/format";
import { menuKonobarSr } from "@/lib/i18n/sr/menu-konobar";
import type { OccupancyState } from "@/lib/menu/occupancy";
import { primaryAction, sortQueue, type QueueAction } from "@/lib/menu/waiter-queue";
import { cn } from "@/lib/utils";
import { Dugme } from "../../zajednicko/dugme";
import { PraznoStanje } from "../../zajednicko/stanja";
import type { KonobarDetaljMesta, KonobarZahtev } from "../model";
import { VremePar } from "../vreme";
import { StatusZahteva, VrstaIkonica, vrstaNaslov } from "../vrsta";
import { sedistaTekst, type SalaMesto } from "../sala/pogled";
import { ZauzetostStola } from "./zauzetost";

const t = menuKonobarSr.sto;
const red = menuKonobarSr.red;

// Preuzmi is the one green action, Završi the ink one, Pregledaj only opens (as on the queue card).
const VRSTA_DUGMETA = { accept: "akcent", complete: "primarno", review: "sekundarno" } as const;

export type DetaljStolaProps = {
  /** null = the position is gone (archived). */
  mesto: SalaMesto | null;
  /** The ACTIVE requests of this position, in any order (sorted here like the queue). */
  zahtevi: KonobarZahtev[];
  /** Its QR cards: undefined = loading, null = not available. */
  detaljMesta: KonobarDetaljMesta | null | undefined;
  sadaMs: number;
  /** The venue's occupancy module. */
  zauzetostUkljucena: boolean;
  /** The request whose action is in flight. */
  radiId: string | null;
  radiZauzetost: boolean;
  /** What the last action answered, in words (role=alert). */
  greska: string | null;
  /** Offline: actions wait for the connection. */
  radnjeIskljucene: boolean;
  /** Why the actions wait; shown once next to them. */
  razlogIskljucenja: string | null;
  /** What the back button returns to: the queue (wide screen) or the floor (phone). */
  nazad: "red" | "sala";
  onNazad(): void;
  /** Preuzmi / Završi from here. */
  onRadnja(zahtev: KonobarZahtev, radnja: QueueAction): void;
  /** Opens the request detail (Pregledaj, or the title). */
  onOtvoriZahtev(id: string): void;
  onZauzetost(stanje: OccupancyState | null): void;
  /** K25: rendered under the requests only when given. */
  rezervacija?: ReactNode;
};

function ZahtevNaMestu({
  zahtev,
  mestoLabel,
  sadaMs,
  radi,
  radnjeIskljucene,
  razlogId,
  onOtvori,
  onRadnja,
}: {
  zahtev: KonobarZahtev;
  mestoLabel: string;
  sadaMs: number;
  radi: boolean;
  radnjeIskljucene: boolean;
  razlogId: string | undefined;
  onOtvori(): void;
  onRadnja(radnja: QueueAction): void;
}) {
  const radnja = primaryAction(zahtev);
  const naslov = vrstaNaslov(zahtev);
  return (
    <article
      data-zahtev={zahtev.id}
      data-status={zahtev.status}
      className={cn(
        "relative grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-[var(--mp-radius-kartica)] border bg-[var(--mp-povrsina)] p-4 shadow-[var(--mp-senka-xs)] [--border:var(--mp-ivica)]",
        zahtev.status === "accepted" && zahtev.acceptedBy?.isMe ? "[--border:var(--mp-mastilo)]" : null,
      )}
    >
      <span className="self-start">
        <VrstaIkonica vrsta={zahtev.kind} />
      </span>
      <div className="grid min-w-0 gap-1">
        <h3 className="min-w-0">
          <button
            type="button"
            onClick={onOtvori}
            aria-label={fmt(red.otvori, { vrsta: naslov, mesto: mestoLabel })}
            data-razvucen
            className="-mx-1 -my-[calc((var(--mp-meta)-1.5469rem)/2)] inline-flex min-h-[var(--mp-meta)] max-w-full items-center rounded-[var(--mp-radius-unutra)] px-1 text-left text-[1.125rem] font-bold leading-snug text-[var(--mp-tekst)] after:absolute after:inset-0 after:rounded-[var(--mp-radius-kartica)] after:content-[''] hover:underline hover:underline-offset-4"
          >
            <span className="min-w-0">
              {naslov}
              <ChevronRight aria-hidden="true" strokeWidth={2} className="ml-1 hidden size-4 text-[var(--mp-tekst-sporedni)] sm:inline-block sm:align-[-0.15em]" />
            </span>
          </button>
        </h3>
        <VremePar od={zahtev.createdAt} sadaMs={sadaMs} slozeno />
        <div className="pt-0.5">
          <StatusZahteva zahtev={zahtev} />
        </div>
      </div>
      <Dugme
        vrsta={VRSTA_DUGMETA[radnja]}
        ucitava={radi}
        disabled={radnjeIskljucene}
        aria-describedby={razlogId}
        aria-label={fmt(red.radnjaCitac, { radnja: red.radnja[radnja], vrsta: naslov, mesto: mestoLabel })}
        onClick={() => (radnja === "review" ? onOtvori() : onRadnja(radnja))}
        className="relative z-10 min-h-12 min-w-[6.5rem] px-4 text-base"
      >
        {red.radnja[radnja]}
      </Dugme>
    </article>
  );
}

export function DetaljStola({
  mesto,
  zahtevi,
  detaljMesta,
  sadaMs,
  zauzetostUkljucena,
  radiId,
  radiZauzetost,
  greska,
  radnjeIskljucene,
  razlogIskljucenja,
  nazad,
  onNazad,
  onRadnja,
  onOtvoriZahtev,
  onZauzetost,
  rezervacija,
}: DetaljStolaProps) {
  const naslovRef = useRef<HTMLHeadingElement>(null);
  const id = mesto?.id ?? null;

  // A newly opened table starts at its name (the place of reading), without a ring.
  useEffect(() => {
    naslovRef.current?.focus({ preventScroll: false });
  }, [id]);

  const nazadDugme = (
    <button
      type="button"
      onClick={onNazad}
      aria-label={nazad === "red" ? t.nazadRedCitac : t.nazadSalaCitac}
      className="-ml-2 inline-flex min-h-12 items-center gap-1 justify-self-start rounded-[var(--mp-radius-dugme)] px-2 text-[1.0625rem] font-bold text-[var(--mp-tekst)] hover:bg-[var(--mp-povrsina-utisana)]"
    >
      <ChevronLeft aria-hidden="true" strokeWidth={2.25} className="size-6" />
      {nazad === "red" ? t.nazadRed : t.nazadSala}
    </button>
  );

  if (mesto === null) {
    return (
      <section className="grid content-start gap-4" data-sto-nestao>
        {nazadDugme}
        <h1 ref={naslovRef} tabIndex={-1} className="sr-only">
          {t.nestao.naslov}
        </h1>
        <PraznoStanje ikonica={SearchX} nivo={2} naslov={t.nestao.naslov} opis={t.nestao.opis} />
      </section>
    );
  }

  const aktivni = sortQueue(zahtevi);
  const opis = [mesto.zoneName, sedistaTekst(mesto.seats)].filter(Boolean).join(" · ");
  const kartice =
    detaljMesta && detaljMesta.cards.length > 0
      ? detaljMesta.cards.map((kartica) => fmt(t.kartica, { naziv: kartica.label })).join(", ")
      : t.bezKartice;
  const razlogId = radnjeIskljucene && razlogIskljucenja ? "sto-razlog" : undefined;

  return (
    <section aria-labelledby="sto-naslov" className="grid content-start gap-6" data-sto={mesto.id}>
      {nazadDugme}

      <header className="grid gap-1 rounded-[var(--mp-radius-kartica)] border bg-[var(--mp-povrsina)] px-4 py-3 shadow-[var(--mp-senka-xs)] [--border:var(--mp-ivica)] sm:gap-1.5 sm:p-5">
        {/* The kind word only when the name does not already say it ("Soba" over "204", not "Sto" over "Sto 3"). */}
        {mesto.label.toLocaleLowerCase("sr-Latn").startsWith(t.vrsta[mesto.kind].toLocaleLowerCase("sr-Latn")) ? null : (
          <p className="text-[0.9375rem] font-semibold text-[var(--mp-tekst-sporedni)]">{t.vrsta[mesto.kind]}</p>
        )}
        <h1
          id="sto-naslov"
          ref={naslovRef}
          tabIndex={-1}
          className="scroll-mt-24 break-words text-[1.75rem] font-bold leading-tight tracking-[-0.01em] text-[var(--mp-tekst)] outline-none sm:text-[2rem]"
        >
          {mesto.label}
        </h1>
        {opis ? <p className="text-[1.125rem] text-[var(--mp-tekst-sporedni)]">{opis}</p> : null}
        {detaljMesta === undefined ? (
          <p role="status" className="text-[0.9375rem] text-[var(--mp-tekst-sporedni)]">
            {t.karticaUcitava}
          </p>
        ) : (
          <p data-sto-kartice className="text-[0.9375rem] text-[var(--mp-tekst-sporedni)]">
            {kartice}
          </p>
        )}
      </header>

      <section aria-labelledby="sto-aktivni" className="grid gap-3" data-sto-zahtevi>
        <h2 id="sto-aktivni" className="text-lg font-bold text-[var(--mp-tekst)]">
          {t.aktivni}
        </h2>

        {greska ? (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-[var(--mp-radius-kontrola)] border px-4 py-3 text-base text-[var(--mp-tekst)] [--border:var(--mp-opasnost-ivica)] bg-[var(--mp-opasnost-meko)]"
          >
            <OctagonAlert aria-hidden="true" strokeWidth={2} className="mt-0.5 size-5 shrink-0 text-[var(--mp-opasnost)]" />
            <p>{greska}</p>
          </div>
        ) : null}

        {razlogId ? (
          <p id={razlogId} className="flex items-start gap-2 text-[0.9375rem] text-[var(--mp-tekst-sporedni)]">
            <WifiOff aria-hidden="true" strokeWidth={2} className="mt-0.5 size-4 shrink-0" />
            {razlogIskljucenja}
          </p>
        ) : null}

        {aktivni.length === 0 ? (
          <p className="text-base text-[var(--mp-tekst-sporedni)]">{t.nemaAktivnih[mesto.kind]}</p>
        ) : (
          <ul className="grid gap-3">
            {aktivni.map((zahtev) => (
              <li key={zahtev.id}>
                <ZahtevNaMestu
                  zahtev={zahtev}
                  mestoLabel={mesto.label}
                  sadaMs={sadaMs}
                  radi={radiId === zahtev.id}
                  radnjeIskljucene={radnjeIskljucene}
                  razlogId={razlogId}
                  onOtvori={() => onOtvoriZahtev(zahtev.id)}
                  onRadnja={(radnja) => onRadnja(zahtev, radnja)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {rezervacija}

      {zauzetostUkljucena ? (
        <ZauzetostStola
          stanje={mesto.occupancy}
          meta={mesto.occupancyMeta}
          radi={radiZauzetost}
          iskljuceno={radnjeIskljucene}
          onPromena={onZauzetost}
          sadaMs={sadaMs}
        />
      ) : null}
    </section>
  );
}
