"use client";

// ScanMe Menu V1 (K23) — the table view of the floor (master §10.3: "kolone po
// vrsti zahteva sa legendom"; mockups 08 and 12). One row per position, one
// column per kind of request, so every parallel state of a table is read side
// by side: the kind's icon, the exact time (`18:43`) and the wait (`čeka
// 08:12`), plus "još n" when more than one of that kind is open. Past the
// venue's threshold both lines turn the danger colour and the wait becomes the
// late chip with its clock icon and the word "kasni" (never colour alone).
// A dash means nothing is active — never "free"; that word exists only in the
// optional occupancy column ("Status stola"), and only when the module is on.
//
// A real <table> where the floor column is wide (768–1023 px without the side
// pane, and from 1280 px): the first cell of every row is a sticky button that
// chooses the table (`aria-pressed`) and also carries the zone and the seats,
// the status column (only with the module) comes right after it, then one
// column per kind (its icon and word in the header, the legend explains them)
// and who has the table. Elsewhere (a phone, and the narrow floor column of
// 1024–1279 px) a list of cards (mockup 12), one button per table whose name
// carries everything (pogled.ts opisMestaSale), so its inner visuals are
// aria-hidden. Both are rendered, CSS shows one. The parent swaps the side
// pane to the table detail on `onIzaberi`.

import { Check, ClockAlert } from "lucide-react";
import type { ReactNode } from "react";
import { fmt } from "@/lib/i18n/format";
import { menuKonobarSr } from "@/lib/i18n/sr/menu-konobar";
import { clockTime, elapsedSeconds, formatElapsed, isLate } from "@/lib/menu/elapsed-time";
import { reservationTiming } from "@/lib/menu/reservation-late";
import type { KindState, TableKind } from "@/lib/menu/table-summary";
import { cn } from "@/lib/utils";
import { KasnjenjeRezervacije } from "../rezervacije/kasnjenje";
import { gostiTekst } from "../rezervacije/tekst";
import { usePragKasnjenja } from "../prag";
import { KASNI_CIP, trajanjeZaCitac } from "../vreme";
import { VRSTA } from "../vrsta";
import { opisMestaSale, opisRezervacijeStola, sedistaTekst, type SalaMesto } from "./pogled";
import { ZauzetostOznaka } from "./zauzetost-oznaka";

const t = menuKonobarSr;
const tk = menuKonobarSr.sala;

/**
 * Where the states of a card go on a phone, by how much room they need: a
 * dash fits on the first line at any width, one short state from 360 px, two
 * from 480 px, more never (they take a full second line, so nothing scrolls
 * sideways and the zone never gets squeezed into a sliver).
 */
const RASPORED_LISTE = {
  uvek: { dugme: "grid-cols-[auto_minmax(0,1fr)_auto]", stanja: "justify-items-end" },
  od360: {
    dugme: "grid-cols-[auto_minmax(0,1fr)] min-[360px]:grid-cols-[auto_minmax(0,1fr)_auto]",
    stanja: "col-span-2 justify-items-start min-[360px]:col-span-1 min-[360px]:justify-items-end",
  },
  od480: {
    dugme: "grid-cols-[auto_minmax(0,1fr)] min-[480px]:grid-cols-[auto_minmax(0,1fr)_auto]",
    stanja: "col-span-2 justify-items-start min-[480px]:col-span-1 min-[480px]:justify-items-end",
  },
  nikad: { dugme: "grid-cols-[auto_minmax(0,1fr)]", stanja: "col-span-2 justify-items-start" },
} as const;

function rasporedListe(brojVrsta: number, kasni: boolean, oznaceno: boolean) {
  const tezina = Math.max(brojVrsta + (kasni ? 1 : 0), oznaceno ? 1 : 0);
  if (tezina === 0) return RASPORED_LISTE.uvek;
  if (tezina === 1) return RASPORED_LISTE.od360;
  if (tezina === 2) return RASPORED_LISTE.od480;
  return RASPORED_LISTE.nikad;
}

/** Who has the accepted requests of the table: "Vi" or the name, in the order they were taken. */
function konobari(mesto: SalaMesto): string {
  return mesto.summary.takers.map((taker) => (taker.isMe ? t.red.preuzetoVi : taker.name)).join(", ");
}

/** The kind's icon in its soft circle (decorative: the column or the table's name says the kind). */
function KrugVrste({ vrsta, className, ikonica }: { vrsta: TableKind; className: string; ikonica: string }) {
  const v = VRSTA[vrsta];
  const Ikonica = v.ikonica;
  return (
    <span aria-hidden="true" className={cn("grid shrink-0 place-items-center rounded-full", v.meko, className)}>
      <Ikonica aria-hidden="true" strokeWidth={2} className={cn(v.boja, ikonica)} />
    </span>
  );
}

/**
 * One active kind of one table: its icon and two lines, the exact time and the
 * wait. Late: the danger colour on both lines and the late chip. In the table
 * the screen reader hears one sentence instead of the ticking digits; in a
 * card (`lista`) everything is hidden because the button's name says it.
 */
function StanjeVrste({
  vrsta,
  stanje,
  sadaMs,
  kasni,
  lista = false,
}: {
  vrsta: TableKind;
  stanje: KindState;
  sadaMs: number;
  kasni: boolean;
  lista?: boolean;
}) {
  const sekunde = elapsedSeconds(stanje.oldestAt, sadaMs);
  const vreme = clockTime(stanje.oldestAt);
  return (
    <span className={cn("flex min-w-0 items-center", lista ? "gap-2.5" : "gap-2")}>
      {lista ? <KrugVrste vrsta={vrsta} className="size-9" ikonica="size-[1.125rem]" /> : null}
      <span
        className={cn(
          "grid min-w-0 justify-items-start leading-tight tabular-nums",
          kasni ? "text-[var(--mp-opasnost)]" : "text-[var(--mp-tekst)]",
        )}
      >
        {lista ? null : (
          <span className="sr-only">
            {fmt(t.vreme.citac, { vreme, trajanje: trajanjeZaCitac(sekunde) })}
            {kasni ? `, ${t.vreme.kasni}` : ""}
          </span>
        )}
        <span className="flex flex-wrap items-baseline gap-x-1.5">
          <span aria-hidden="true" className={cn("font-bold", lista ? "text-base" : "text-[1.0625rem]")}>
            {vreme}
          </span>
          {stanje.count > 1 ? (
            <span className={cn("text-[0.8125rem] font-semibold", kasni ? null : "text-[var(--mp-tekst-sporedni)]")}>
              {fmt(tk.jos, { n: stanje.count - 1 })}
            </span>
          ) : null}
        </span>
        <span
          aria-hidden="true"
          className={cn(
            "inline-flex w-fit flex-wrap items-center gap-x-1.5 text-[0.9375rem] font-semibold",
            kasni
              ? cn(KASNI_CIP, "mt-1 py-0.5", lista ? "-mx-1.5 px-1.5" : "-mx-2 px-2")
              : "text-[var(--mp-tekst-sporedni)]",
          )}
        >
          <span className="inline-flex items-center gap-1 whitespace-nowrap">
            {kasni ? <ClockAlert aria-hidden="true" strokeWidth={2} className="size-4 shrink-0" /> : null}
            {fmt(t.vreme.ceka, { ceka: formatElapsed(sekunde) })}
          </span>
          {kasni ? <span className="whitespace-nowrap font-bold">{t.vreme.kasni}</span> : null}
        </span>
      </span>
    </span>
  );
}

/** A dash that stands for "nothing here"; the words for it are in the sr-only sibling. */
function Crta() {
  return (
    <span aria-hidden="true" className="font-bold text-[var(--mp-tekst-sporedni)]">
      {tk.neutralno}
    </span>
  );
}

const CELIJA = "px-2.5 py-2.5 align-middle text-base text-[var(--mp-tekst)]";

function Zaglavlje({ children, prvo = false }: { children: ReactNode; prvo?: boolean }) {
  return (
    <th
      scope="col"
      className={cn(
        "whitespace-nowrap py-3 text-left text-sm font-bold text-[var(--mp-tekst)]",
        prvo ? "sticky left-0 z-10 bg-[var(--mp-povrsina-utisana)] px-4 shadow-[inset_-1px_0_0_var(--mp-ivica)]" : "px-3",
      )}
    >
      {children}
    </th>
  );
}

function CelijaVrste({
  vrsta,
  mesto,
  sadaMs,
  prag,
}: {
  vrsta: TableKind;
  mesto: SalaMesto;
  sadaMs: number;
  prag: number;
}) {
  const stanje = mesto.summary.kinds[vrsta];
  if (!stanje) {
    return (
      <td className={CELIJA}>
        <Crta />
        <span className="sr-only">{tk.neutralnoCitac}</span>
      </td>
    );
  }
  const kasni = isLate(stanje.oldestAt, sadaMs, prag);
  return (
    <td data-stanje={vrsta} data-kasni={kasni ? "" : undefined} className={CELIJA}>
      <StanjeVrste vrsta={vrsta} stanje={stanje} sadaMs={sadaMs} kasni={kasni} />
    </td>
  );
}

/**
 * K25: the cell of the reservation column — the guest, the term and the guests
 * ("Ivana B." / "18:02 · 5 osoba"), the live lateness once the term has come
 * (the same chip as the queue: calm in the hold, red "kasni" after it), or a
 * dash. Not a request: it carries its own marks (`data-rez-celija`,
 * `data-rez-kasni`), because its threshold is the venue's hold. In the table the
 * screen reader hears one sentence (pogled.ts opisRezervacijeStola).
 */
function CelijaRezervacije({ mesto, sadaMs }: { mesto: SalaMesto; sadaMs: number }) {
  const rezervacija = mesto.rezervacija;
  if (!rezervacija) {
    return (
      <td className={CELIJA}>
        <Crta />
        <span className="sr-only">{tk.nemaRezervacijeCitac}</span>
      </td>
    );
  }
  const { row, more, holdMin } = rezervacija;
  const kasni = reservationTiming(row.requestedAt, holdMin, sadaMs).phase === "kasni";
  return (
    <td data-rez-celija={row.id} data-rez-kasni={kasni ? "" : undefined} className={CELIJA}>
      <span className="sr-only">{opisRezervacijeStola(rezervacija, sadaMs)}</span>
      <div aria-hidden="true" className="grid min-w-0 justify-items-start gap-0.5 leading-tight">
        <span className="max-w-[10rem] break-words text-[1.0625rem] font-bold text-[var(--mp-tekst)]">{row.guestName}</span>
        <span className="text-[0.9375rem] font-semibold text-[var(--mp-tekst-sporedni)]">
          {clockTime(row.requestedAt)} · {gostiTekst(row.partySize)}
          {more > 0 ? ` · +${more}` : ""}
        </span>
        <KasnjenjeRezervacije requestedAt={row.requestedAt} holdMin={holdMin} sadaMs={sadaMs} />
      </div>
    </td>
  );
}

function RedTabele({
  mesto,
  izabran,
  sadaMs,
  prag,
  onIzaberi,
  prikaziZonu,
  zauzetost,
  vrste,
}: {
  mesto: SalaMesto;
  izabran: boolean;
  sadaMs: number;
  prag: number;
  onIzaberi(id: string): void;
  prikaziZonu: boolean;
  zauzetost: boolean;
  vrste: readonly TableKind[];
}) {
  const opis = [prikaziZonu ? (mesto.zoneName ?? tk.bezZone) : null, sedistaTekst(mesto.seats)].filter(Boolean).join(" · ");
  const ko = konobari(mesto);
  return (
    <tr className={cn("group", izabran ? "bg-[var(--mp-akcent-meko)]" : "hover:bg-[var(--mp-povrsina-utisana)]")}>
      <th
        scope="row"
        className={cn(
          // Sticky: the table name stays in view while the kinds scroll sideways.
          "sticky left-0 z-10 h-px p-0 text-left font-normal shadow-[inset_-1px_0_0_var(--mp-ivica)]",
          izabran
            ? "bg-[var(--mp-akcent-meko)] shadow-[inset_0.25rem_0_0_var(--mp-mastilo),inset_-1px_0_0_var(--mp-ivica)]"
            : "bg-[var(--mp-povrsina)] group-hover:bg-[var(--mp-povrsina-utisana)]",
        )}
      >
        <button
          type="button"
          onClick={() => onIzaberi(mesto.id)}
          aria-pressed={izabran}
          aria-label={opisMestaSale(mesto, sadaMs)}
          data-mesto={mesto.id}
          className="grid h-full min-h-12 w-full min-w-[9rem] content-center gap-0.5 px-4 py-2 text-left text-[var(--mp-tekst)] focus-visible:-outline-offset-4!"
        >
          <span className="inline-flex items-center gap-2 text-base font-bold">
            {mesto.label}
            {izabran ? <Check aria-hidden="true" strokeWidth={2} className="size-4 shrink-0" /> : null}
          </span>
          {opis ? <span className="text-sm font-normal text-[var(--mp-tekst-sporedni)]">{opis}</span> : null}
        </button>
      </th>
      {zauzetost ? (
        <td className={CELIJA}>
          {mesto.occupancy !== "neutral" ? (
            <ZauzetostOznaka stanje={mesto.occupancy} />
          ) : (
            <>
              <Crta />
              <span className="sr-only">{t.sto.neutralno}</span>
            </>
          )}
        </td>
      ) : null}
      {vrste.map((vrsta) =>
        vrsta === "reservation" ? (
          <CelijaRezervacije key={vrsta} mesto={mesto} sadaMs={sadaMs} />
        ) : (
          <CelijaVrste key={vrsta} vrsta={vrsta} mesto={mesto} sadaMs={sadaMs} prag={prag} />
        ),
      )}
      <td className={cn(CELIJA, "max-w-[12rem] break-words")}>{ko || <Crta />}</td>
    </tr>
  );
}

function RedListe({
  mesto,
  izabran,
  sadaMs,
  prag,
  onIzaberi,
  prikaziZonu,
  zauzetost,
  vrste,
}: {
  mesto: SalaMesto;
  izabran: boolean;
  sadaMs: number;
  prag: number;
  onIzaberi(id: string): void;
  prikaziZonu: boolean;
  zauzetost: boolean;
  vrste: readonly TableKind[];
}) {
  const aktivne = vrste.flatMap((vrsta) => {
    const stanje = mesto.summary.kinds[vrsta];
    return stanje ? [{ vrsta, stanje, kasni: isLate(stanje.oldestAt, sadaMs, prag) }] : [];
  });
  // K25: the bound reservation is one more state of the card (its own hold decides when it is late).
  const rezervacija = vrste.includes("reservation") ? (mesto.rezervacija ?? null) : null;
  const rezervacijaKasni = rezervacija
    ? reservationTiming(rezervacija.row.requestedAt, rezervacija.holdMin, sadaMs).phase === "kasni"
    : false;
  const zona = prikaziZonu ? (mesto.zoneName ?? tk.bezZone) : null;
  const sedista = sedistaTekst(mesto.seats);
  const oznaka = zauzetost && mesto.occupancy !== "neutral" ? mesto.occupancy : null;
  const raspored = rasporedListe(
    aktivne.length + (rezervacija ? 1 : 0),
    aktivne.some((aktivna) => aktivna.kasni) || rezervacijaKasni,
    oznaka !== null,
  );
  return (
    <li>
      <button
        type="button"
        onClick={() => onIzaberi(mesto.id)}
        aria-pressed={izabran}
        aria-label={opisMestaSale(mesto, sadaMs)}
        data-mesto={mesto.id}
        className={cn(
          "grid min-h-16 w-full items-center gap-x-3 gap-y-2 rounded-[var(--mp-radius-kartica)] border p-3 text-left",
          raspored.dugme,
          izabran
            ? "bg-[var(--mp-akcent-meko)] [--border:var(--mp-mastilo)]"
            : "bg-[var(--mp-povrsina)] [--border:var(--mp-ivica)]",
        )}
      >
        <span
          aria-hidden="true"
          className="inline-flex min-h-11 min-w-[4.5rem] items-center justify-center gap-1 break-words rounded-[var(--mp-radius-unutra)] bg-[var(--mp-povrsina-utisana)] px-2.5 py-2 text-center text-base font-bold leading-tight text-[var(--mp-tekst)]"
        >
          {mesto.label}
          {izabran ? <Check aria-hidden="true" strokeWidth={2} className="size-4 shrink-0" /> : null}
        </span>
        <span aria-hidden="true" className="grid min-w-0 gap-0.5 leading-snug">
          {zona ? (
            <span
              className={cn(
                "break-words text-base font-bold",
                mesto.zoneName ? "text-[var(--mp-tekst)]" : "text-[var(--mp-tekst-sporedni)]",
              )}
            >
              {zona}
            </span>
          ) : null}
          {sedista ? <span className="text-[0.9375rem] text-[var(--mp-tekst-sporedni)]">{sedista}</span> : null}
        </span>
        <span aria-hidden="true" className={cn("grid min-w-0 gap-2", raspored.stanja)}>
          {aktivne.length > 0 || rezervacija ? (
            <span className="flex flex-wrap gap-x-4 gap-y-2">
              {aktivne.map(({ vrsta, stanje, kasni }) => (
                <span key={vrsta} data-lista-stanje={vrsta} data-lista-kasni={kasni ? "" : undefined}>
                  <StanjeVrste vrsta={vrsta} stanje={stanje} sadaMs={sadaMs} kasni={kasni} lista />
                </span>
              ))}
              {rezervacija ? (
                <span data-lista-rez={rezervacija.row.id} data-lista-rez-kasni={rezervacijaKasni ? "" : undefined} className="flex min-w-0 items-center gap-2.5">
                  <KrugVrste vrsta="reservation" className="size-9" ikonica="size-[1.125rem]" />
                  <span className="grid min-w-0 justify-items-start gap-0.5 leading-tight">
                    <span className="max-w-[9rem] break-words text-base font-bold text-[var(--mp-tekst)]">{rezervacija.row.guestName}</span>
                    <span className="text-[0.9375rem] font-semibold tabular-nums text-[var(--mp-tekst-sporedni)]">
                      {clockTime(rezervacija.row.requestedAt)} · {gostiTekst(rezervacija.row.partySize)}
                    </span>
                    <KasnjenjeRezervacije requestedAt={rezervacija.row.requestedAt} holdMin={rezervacija.holdMin} sadaMs={sadaMs} />
                  </span>
                </span>
              ) : null}
            </span>
          ) : (
            <Crta />
          )}
          {oznaka ? <ZauzetostOznaka stanje={oznaka} /> : null}
        </span>
      </button>
    </li>
  );
}

export function TabelaSale({
  mesta,
  sadaMs,
  izabranoId,
  onIzaberi,
  prikaziZonu,
  zauzetost,
  vrste,
}: {
  /** Already filtered by zone and search, already sorted. */
  mesta: SalaMesto[];
  /** The panel clock (ms). */
  sadaMs: number;
  /** The chosen table. */
  izabranoId: string | null;
  /** Choosing a table: the parent swaps the side pane to the table detail. */
  onIzaberi(id: string): void;
  /** The venue has zones: the "Zona" column and the zone line of a card. */
  prikaziZonu: boolean;
  /** The occupancy module is on: the "Status stola" column. */
  zauzetost: boolean;
  /** Kind columns in order (call, order, bill; K25: reservation when the venue takes reservations). */
  vrste: readonly TableKind[];
}) {
  const prag = usePragKasnjenja();
  return (
    <>
      <div className="hidden overflow-x-auto rounded-[var(--mp-radius-kartica)] border bg-[var(--mp-povrsina)] [--border:var(--mp-ivica)] md:block lg:hidden xl:block">
        <table className="w-full border-collapse text-left tabular-nums">
          <caption className="sr-only">{tk.tabela}</caption>
          <thead>
            <tr className="border-b bg-[var(--mp-povrsina-utisana)]">
              <Zaglavlje prvo>{tk.kolone.sto}</Zaglavlje>
              {zauzetost ? <Zaglavlje>{tk.kolone.status}</Zaglavlje> : null}
              {vrste.map((vrsta) => (
                <Zaglavlje key={vrsta}>
                  <span className="inline-flex items-center gap-2">
                    <KrugVrste vrsta={vrsta} className="size-7" ikonica="size-4" />
                    {tk.kolone[vrsta]}
                  </span>
                </Zaglavlje>
              ))}
              <Zaglavlje>{tk.kolone.konobar}</Zaglavlje>
            </tr>
          </thead>
          <tbody className="divide-y">
            {mesta.map((mesto) => (
              <RedTabele
                key={mesto.id}
                mesto={mesto}
                izabran={izabranoId === mesto.id}
                sadaMs={sadaMs}
                prag={prag}
                onIzaberi={onIzaberi}
                prikaziZonu={prikaziZonu}
                zauzetost={zauzetost}
                vrste={vrste}
              />
            ))}
          </tbody>
        </table>
      </div>
      <ul className="grid gap-2 md:hidden lg:grid xl:hidden">
        {mesta.map((mesto) => (
          <RedListe
            key={mesto.id}
            mesto={mesto}
            izabran={izabranoId === mesto.id}
            sadaMs={sadaMs}
            prag={prag}
            onIzaberi={onIzaberi}
            prikaziZonu={prikaziZonu}
            zauzetost={zauzetost}
            vrste={vrste}
          />
        ))}
      </ul>
    </>
  );
}
