// ScanMe Menu V1 (K22) — one request in the work queue (mockup 10): the kind
// (icon + colour + word), the table and zone, the live timer, the status in
// words, and ONE main action of at least 48 px on the right (Preuzmi for a
// call or a bill, Pregledaj for an order, Završi for a request I took). The
// title opens the detail and its target stretches over the whole card (a
// big, forgiving tap area); the action sits above it. Two tab stops per card.
//
// K33: the card is memoised. The shared clock ticks every second; the only thing a tick
// changes on the card is its timer (a leaf that reads SatKontekst) and, once, the
// "Novo" mark 15 s after the request came. So a tick redraws the card only when
// `jeSvez` turns over; the callbacks are the panel's (stable, they take the id).

import { ChevronRight } from "lucide-react";
import { memo } from "react";
import { fmt } from "@/lib/i18n/format";
import { menuKonobarSr } from "@/lib/i18n/sr/menu-konobar";
import { primaryAction, type QueueAction } from "@/lib/menu/waiter-queue";
import { cn } from "@/lib/utils";
import { Dugme } from "../../zajednicko/dugme";
import stil from "../konobar.module.css";
import type { KonobarZahtev } from "../model";
import { VremePar } from "../vreme";
import { StatusZahteva, VrstaIkonica, mestoTekst, vrstaNaslov } from "../vrsta";

const t = menuKonobarSr.red;
/** A request younger than this is marked "Novo" in the queue. */
const SVEZ_MS = 15_000;

// Preuzmi is the one green action (mockup 10), Završi the ink one, Pregledaj only opens.
const VRSTA_DUGMETA = { accept: "akcent", complete: "primarno", review: "sekundarno" } as const;

export type KarticaZahtevaProps = {
  zahtev: KonobarZahtev;
  /** The clock: the card reads it only for the "Novo" mark; its timer reads SatKontekst. */
  sadaMs: number;
  /** The action in flight for this card (spinner, clicks ignored). */
  radi: boolean;
  onOtvori(id: string): void;
  onRadnja(zahtev: KonobarZahtev, radnja: QueueAction): void;
  /** Offline: actions wait for the connection (the reason is in the strip above the queue). */
  radnjeIskljucene: boolean;
  /** K23: the reminder of this request is flashing now (master §8.5). */
  podsetnik?: boolean;
};

/** A request this young is marked "Novo". */
export function jeSvez(zahtev: Pick<KonobarZahtev, "status" | "createdAt">, sadaMs: number): boolean {
  return zahtev.status === "new" && sadaMs - zahtev.createdAt < SVEZ_MS;
}

/** The comparison of memo(): the card is redrawn when its data, its state or its "Novo" mark change, never for the clock alone. */
export function karticaZahtevaJednaka(a: KarticaZahtevaProps, b: KarticaZahtevaProps): boolean {
  return (
    a.zahtev === b.zahtev &&
    a.radi === b.radi &&
    a.radnjeIskljucene === b.radnjeIskljucene &&
    Boolean(a.podsetnik) === Boolean(b.podsetnik) &&
    a.onOtvori === b.onOtvori &&
    a.onRadnja === b.onRadnja &&
    jeSvez(a.zahtev, a.sadaMs) === jeSvez(b.zahtev, b.sadaMs)
  );
}

export const KarticaZahteva = memo(function KarticaZahteva({
  zahtev,
  sadaMs,
  radi,
  onOtvori,
  onRadnja,
  radnjeIskljucene,
  podsetnik = false,
}: KarticaZahtevaProps) {
  const radnja = primaryAction(zahtev);
  const naslov = vrstaNaslov(zahtev);
  const mesto = mestoTekst(zahtev);
  const svez = jeSvez(zahtev, sadaMs);
  return (
    <article
      data-zahtev={zahtev.id}
      data-status={zahtev.status}
      data-svez={svez || undefined}
      data-podsetnik={podsetnik || undefined}
      className={cn(
        "@container/kartica relative grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-[var(--mp-radius-kartica)] border bg-[var(--mp-povrsina)] p-4 shadow-[var(--mp-senka-xs)] sm:gap-4",
        zahtev.status === "accepted" && zahtev.acceptedBy?.isMe ? "[--border:var(--mp-mastilo)]" : null,
        svez ? "[--border:var(--mp-info)] ring-2 ring-[var(--mp-info-ivica)]" : null,
        podsetnik ? stil.podsetnik : null,
      )}
    >
      <span className="self-start">
        <VrstaIkonica vrsta={zahtev.kind} />
      </span>
      <div className="grid min-w-0 gap-1">
        <h3 className="min-w-0">
          <button
            type="button"
            onClick={() => onOtvori(zahtev.id)}
            aria-label={fmt(t.otvori, { vrsta: naslov, mesto })}
            data-razvucen
            className="-mx-1 -my-[calc((var(--mp-meta)-1.5469rem)/2)] inline-flex min-h-[var(--mp-meta)] scroll-mb-28 scroll-mt-24 max-w-full items-center gap-1 rounded-[var(--mp-radius-unutra)] px-1 text-left text-[1.125rem] font-bold leading-snug text-[var(--mp-tekst)] after:absolute after:inset-0 after:rounded-[var(--mp-radius-kartica)] after:content-[''] hover:underline hover:underline-offset-4"
          >
            <span className="min-w-0">
              {naslov}
              <ChevronRight aria-hidden="true" strokeWidth={2} className="ml-1 hidden size-4 text-[var(--mp-tekst-sporedni)] sm:inline-block sm:align-[-0.15em]" />
            </span>
            </button>
        </h3>
        <p className="text-base font-semibold leading-snug text-[var(--mp-tekst)]">{mesto}</p>
        <VremePar od={zahtev.createdAt} sadaMs={sadaMs} slozeno />
        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          <StatusZahteva zahtev={zahtev} />
          {svez ? (
            <span className="rounded-full bg-[var(--mp-info)] px-2.5 py-0.5 text-sm font-bold text-[var(--mp-na-mastilu)]">
              {t.novo}
            </span>
          ) : null}
        </div>
      </div>
      <Dugme
        vrsta={VRSTA_DUGMETA[radnja]}
        ucitava={radi}
        disabled={radnjeIskljucene}
        onClick={() => onRadnja(zahtev, radnja)}
        aria-label={fmt(t.radnjaCitac, { radnja: t.radnja[radnja], vrsta: naslov, mesto })}
        className="relative z-10 min-h-12 min-w-[6.5rem] scroll-mb-28 px-4 text-base @[30rem]/kartica:min-w-[8.5rem]"
      >
        {t.radnja[radnja]}
      </Dugme>
    </article>
  );
}, karticaZahtevaJednaka);
