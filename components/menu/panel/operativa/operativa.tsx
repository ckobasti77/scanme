"use client";

// ScanMe Menu V1 (K27) — Operativa of the client panel (master §13.5; plan
// docs/meni/planovi/K24.md §4.3): a read-only overview for the Owner and the
// Managers of what is happening in the venue and what the staff is doing — the
// active requests and who took them, who is on shift, today's reservations —
// with filters by kind, waiter and zone. It is NOT a second waiter panel: there
// is no accepting, finishing, cancelling or reassigning here. The one action is
// a quiet reminder ("Podseti konobara") to the waiter who took a request.
//
// Presentational: the route (operativa-ruta.tsx) and the izlog pass the data
// (`podaci`), the device clock (`nowMs`) and the filters; all the arithmetic
// (late, reminder allowed, today's reservations) is lib/menu/operations-view.ts.

import {
  ArrowUpRight,
  BellOff,
  BellRing,
  CalendarCheck,
  CalendarSync,
  CircleCheck,
  CircleDot,
  CircleSlash,
  CircleX,
  LoaderCircle,
  OctagonAlert,
  PanelRightOpen,
  SearchX,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useRef, useState, type ReactNode } from "react";
import { fmt, srPluralCategory } from "@/lib/i18n/format";
import { menuDomenSr } from "@/lib/i18n/sr/menu-domen";
import { menuPanelSr } from "@/lib/i18n/sr/menu-panel";
import { clockTime } from "@/lib/menu/elapsed-time";
import { MENU_PING_COOLDOWN_MS } from "@/lib/menu/limits";
import {
  BEZ_FILTERA,
  operacijeView,
  type OperacijeFilteri,
  type OperacijePodaci,
  type OperacijeRed,
  type OperacijeView,
  type PingStanje,
} from "@/lib/menu/operations-view";
import type { MenuReservationStatus } from "@/lib/menu/reservation-status";
import { cn } from "@/lib/utils";
import { Napomena } from "../../lokal/zajednicko";
import { Dugme } from "../../zajednicko/dugme";
import { Kartica } from "../../zajednicko/kartica";
import { OkvirSekcije } from "../../zajednicko/okvir-sekcije";
import { PraznoStanje } from "../../zajednicko/stanja";
import { StatusOznaka, type StatusTon } from "../../zajednicko/status-oznaka";
import { ZaglavljeSaStatusom } from "../../zajednicko/zaglavlje-sa-statusom";
import { porukaKoda } from "../cuvanje";
import { DetaljFioka, KasniOznaka, StatusZahteva, VrstaIkona, koTekst, mestoTekst, vremeTekst } from "./detalj";
import { Filteri } from "./filteri";

const t = menuPanelSr.operativa;
const d = menuDomenSr;

/** What the reminder answered: `lastAt` comes with "too soon" (when the last one went out). */
export type OperativaPingIshod = { ok: true; sentAt: number } | { ok: false; code: string; lastAt?: number };

/** What the read-only detail adds to a row (an order's lines and the card the guest scanned). */
export type OperativaDetalj = {
  sourceLabel: string | null;
  subtotalRsd: number | null;
  deliveryFeeRsd: number | null;
  items: {
    name: string;
    variantName: string | null;
    addons: string[];
    quantity: number;
    lineTotalRsd: number;
    note: string | null;
  }[];
};

export type OperativaProps = {
  podaci: OperacijePodaci;
  /** The device clock, ticking once a second. */
  nowMs: number;
  filteri: OperacijeFilteri;
  onFilteri(filteri: OperacijeFilteri): void;
  /** The request whose detail is open. */
  izabranId: string | null;
  onIzaberi(id: string | null): void;
  /** undefined = loading. */
  detalj: OperativaDetalj | null | undefined;
  onPing(id: string): Promise<OperativaPingIshod>;
  /** Where "Uđi u konobarski panel" leads. */
  konobarHref: string;
  /** Izlog: the drawer with the filters (telephone) starts open. */
  pocetnoFilteriOtvoreni?: boolean;
};

// --- the reminder -------------------------------------------------------------

/** What this device knows about the reminder of one request, before the subscription says it. */
type PingLokalno = { radi: boolean; poslatU: number | null; kod: string | null };

async function pingIshod(onPing: (id: string) => Promise<OperativaPingIshod>, id: string): Promise<OperativaPingIshod> {
  try {
    return await onPing(id);
  } catch {
    return { ok: false, code: "mreza" };
  }
}

/** A reminder this device just sent counts at once, even before the subscription brings it back. */
function efektivanPing(red: OperacijeRed, lokalno: PingLokalno | undefined, nowMs: number): PingStanje {
  const poslatU = lokalno?.poslatU ?? null;
  if (red.ping.moze && poslatU !== null && nowMs - poslatU < MENU_PING_COOLDOWN_MS) {
    return { moze: false, razlog: "poslat", ponovoOd: poslatU + MENU_PING_COOLDOWN_MS };
  }
  return red.ping;
}

/**
 * The reminder as the card and the drawer show it: `info` (what was sent, why
 * not, what failed — a polite status line that is always in the page) and
 * `dugme`. A request nobody took has neither; an account-taken one has the
 * reason only; a reminder inside the 5 minutes keeps the (disabled) button, so
 * focus is not lost when it was just pressed.
 */
function pingPrikaz({
  red,
  lokalno,
  nowMs,
  sufiks,
  onPosalji,
}: {
  red: OperacijeRed;
  lokalno: PingLokalno | undefined;
  nowMs: number;
  /** Keeps the ids of the card and of the drawer apart. */
  sufiks: string;
  onPosalji(id: string): void;
}): { info: ReactNode; dugme: ReactNode; imaInfo: boolean } {
  const stanje = efektivanPing(red, lokalno, nowMs);
  if (!stanje.moze && stanje.razlog === "nepreuzet") return { info: null, dugme: null, imaInfo: false };

  const lokalnoU = lokalno?.poslatU ?? null;
  const poslatU = Math.max(red.lastPing?.at ?? 0, lokalnoU ?? 0) || null;
  const videno = red.lastPing !== null && red.lastPing.seen && red.lastPing.at >= (lokalnoU ?? 0);
  const poslato = poslatU !== null ? fmt(videno ? t.ping.vidjen : t.ping.poslat, { vreme: clockTime(poslatU) }) : null;
  const razlog = stanje.moze
    ? null
    : stanje.razlog === "poslat"
      ? fmt(t.ping.razlozi.poslat, { vreme: clockTime(stanje.ponovoOd) })
      : t.ping.razlozi.nalog;
  const razlogId = `${red.id}-${sufiks}-razlog`;
  const radi = lokalno?.radi === true;
  const kod = lokalno?.kod ?? null;
  const ime = red.acceptedBy !== null && red.acceptedBy.name.trim() !== "" ? red.acceptedBy.name : t.red.bezImena;

  const info = (
    <div className="min-w-0 text-sm leading-snug text-[var(--mp-tekst-sporedni)]">
      <p role="status" aria-live="polite">
        {poslato !== null ? (
          <span className="inline-flex items-start gap-1.5 font-medium text-[var(--mp-tekst)]">
            <CircleCheck aria-hidden="true" strokeWidth={2} className="mt-0.5 size-4 shrink-0 text-[var(--mp-uspeh)]" />
            <span className="min-w-0">{poslato}</span>
          </span>
        ) : null}
      </p>
      {razlog !== null ? (
        <p id={razlogId} className={cn(poslato !== null && "mt-1")}>
          {razlog}
        </p>
      ) : null}
      {kod !== null ? (
        <p role="alert" className="mt-1 flex items-start gap-1.5 font-medium text-[var(--mp-tekst)]">
          <OctagonAlert aria-hidden="true" strokeWidth={2} className="mt-0.5 size-4 shrink-0 text-[var(--mp-opasnost)]" />
          <span className="min-w-0">{porukaKoda(kod, t.ping.greska)}</span>
        </p>
      ) : null}
    </div>
  );

  const dugme =
    stanje.moze || stanje.razlog === "poslat" ? (
      <Dugme
        vrsta="sekundarno"
        velicina="kompaktna"
        ikonica={radi ? undefined : BellRing}
        aria-label={
          radi ? undefined : fmt(t.ping.dugmeCitac, { ime, vrsta: d.requestKinds[red.kind], mesto: mestoTekst(red) })
        }
        aria-busy={radi || undefined}
        aria-disabled={radi || !stanje.moze || undefined}
        aria-describedby={stanje.moze ? undefined : razlogId}
        onClick={radi || !stanje.moze ? undefined : () => onPosalji(red.id)}
        className="aria-disabled:opacity-50"
      >
        {radi ? (
          <>
            <LoaderCircle aria-hidden="true" strokeWidth={1.75} className="animate-spin motion-reduce:animate-none" />
            {t.ping.salje}
          </>
        ) : (
          t.ping.dugme
        )}
      </Dugme>
    ) : null;

  // The polite region stays in the page (so a later "Podsetnik poslat" is announced); it is framed only when it says something.
  return { info, dugme, imaInfo: poslato !== null || razlog !== null || kod !== null };
}

/**
 * The reminder in the drawer: the same states as on the card; nothing at all for a
 * request nobody took. What the reminder is (a quiet message, no sound) is written
 * here once, next to the button, and only when there is a button.
 */
export function PingDetalja({
  red,
  lokalno,
  nowMs,
  onPosalji,
}: {
  red: OperacijeRed;
  lokalno: PingLokalno | undefined;
  nowMs: number;
  onPosalji(id: string): void;
}) {
  const prikaz = pingPrikaz({ red, lokalno, nowMs, sufiks: "detalj", onPosalji });
  if (prikaz.info === null && prikaz.dugme === null) return null;
  return (
    <div className="grid justify-items-start gap-3 border-t pt-4 [--border:var(--mp-ivica)]">
      {prikaz.info}
      {prikaz.dugme}
      {prikaz.dugme !== null ? (
        <p className="text-sm leading-snug text-[var(--mp-tekst-sporedni)]">{t.ping.objasnjenje}</p>
      ) : null}
    </div>
  );
}

// --- the cards ----------------------------------------------------------------

function ZahtevKartica({
  red,
  nowMs,
  lokalno,
  onPosalji,
  onDetalj,
}: {
  red: OperacijeRed;
  nowMs: number;
  lokalno: PingLokalno | undefined;
  onPosalji(id: string): void;
  onDetalj(id: string): void;
}) {
  const prikaz = pingPrikaz({ red, lokalno, nowMs, sufiks: "kartica", onPosalji });
  return (
    <li
      data-zahtev={red.id}
      data-status={red.status}
      data-kasni={red.kasni || undefined}
      className={cn(
        "grid gap-3 rounded-[var(--mp-radius-kartica)] border bg-[var(--mp-povrsina)] p-4 shadow-[var(--mp-senka-xs)] sm:p-5",
        red.kasni ? "[--border:var(--mp-opasnost-ivica)]" : "[--border:var(--mp-ivica)]",
      )}
    >
      {/* One dense row on a wide screen (an overview of many requests), stacked on a phone. */}
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-x-6">
        <div className="flex min-w-0 items-start gap-3">
          <VrstaIkona vrsta={red.kind} />
          <div className="grid min-w-0 flex-1 gap-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <p className="text-base font-semibold leading-snug text-[var(--mp-tekst)]">{d.requestKinds[red.kind]}</p>
              <StatusZahteva status={red.status} />
            </div>
            <p className="text-sm leading-snug text-[var(--mp-tekst-sporedni)] [overflow-wrap:anywhere]">
              {mestoTekst(red)}
            </p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[var(--mp-tekst)]">
              <p className="[overflow-wrap:anywhere]">{koTekst(red)}</p>
              <p className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 tabular-nums">
                {vremeTekst(red.createdAt, nowMs)}
                {red.kasni ? <KasniOznaka /> : null}
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          <Dugme
            vrsta="tiho"
            velicina="kompaktna"
            ikonica={PanelRightOpen}
            aria-label={fmt(t.red.detaljCitac, { vrsta: d.requestKinds[red.kind], mesto: mestoTekst(red) })}
            onClick={() => onDetalj(red.id)}
          >
            {t.red.detalj}
          </Dugme>
          {prikaz.dugme}
        </div>
      </div>

      {prikaz.info ? (
        <div className={cn("min-w-0", prikaz.imaInfo && "border-t pt-3 [--border:var(--mp-ivica)]")}>{prikaz.info}</div>
      ) : null}
    </li>
  );
}

/** "4 čekaju da ih neko preuzme · 3 su kod osoblja": all the active requests, whatever the filters say. */
function sazetakZahteva(podaci: OperacijePodaci): string {
  const nova = podaci.requests.filter((zahtev) => zahtev.status === "new").length;
  const kodOsoblja = podaci.requests.filter((zahtev) => zahtev.status === "accepted").length;
  return [
    nova > 0 ? fmt(t.zahtevi.cekajuPreuzimanje[srPluralCategory(nova)], { n: nova }) : null,
    kodOsoblja > 0 ? fmt(t.zahtevi.kodOsoblja[srPluralCategory(kodOsoblja)], { n: kodOsoblja }) : null,
  ]
    .filter((deo): deo is string => deo !== null)
    .join(" · ");
}

function ZahteviLista({
  view,
  nowMs,
  pingovi,
  onPosalji,
  onDetalj,
  onOcisti,
}: {
  view: OperacijeView;
  nowMs: number;
  pingovi: Record<string, PingLokalno>;
  onPosalji(id: string): void;
  onDetalj(id: string): void;
  onOcisti(): void;
}) {
  if (view.ukupno === 0) {
    return <PraznoStanje nivo={3} ikonica={BellOff} naslov={t.zahtevi.prazno} opis={t.zahtevi.praznoOpis} />;
  }
  if (view.redovi.length === 0) {
    return (
      <PraznoStanje
        nivo={3}
        ikonica={SearchX}
        naslov={t.zahtevi.praznoFilter}
        opis={t.zahtevi.praznoFilterOpis}
        akcija={<Dugme onClick={onOcisti}>{t.filteri.ocisti}</Dugme>}
      />
    );
  }
  return (
    <ul className="grid gap-3">
      {view.redovi.map((red) => (
        <ZahtevKartica
          key={red.id}
          red={red}
          nowMs={nowMs}
          lokalno={pingovi[red.id]}
          onPosalji={onPosalji}
          onDetalj={onDetalj}
        />
      ))}
    </ul>
  );
}

// --- the right column: staff on shift, today's reservations --------------------

function USmeni({ uSmeni, imaZone }: { uSmeni: OperacijeView["uSmeni"]; imaZone: boolean }) {
  return (
    <Kartica>
      <OkvirSekcije naslov={t.smena.naslov} nivo={2}>
        {uSmeni.length === 0 ? (
          <p className="text-sm leading-relaxed text-[var(--mp-tekst-sporedni)]">{t.smena.prazno}</p>
        ) : (
          <ul className="grid gap-3">
            {uSmeni.map((smena) => (
              <li key={smena.staffId} className="flex items-start justify-between gap-3">
                <div className="grid min-w-0 gap-0.5">
                  <p className="font-semibold leading-snug text-[var(--mp-tekst)] [overflow-wrap:anywhere]">{smena.ime}</p>
                  {imaZone ? (
                    <p className="text-sm leading-snug text-[var(--mp-tekst-sporedni)]">{smena.zona ?? t.smena.bezZone}</p>
                  ) : null}
                </div>
                <p className="whitespace-nowrap text-sm tabular-nums text-[var(--mp-tekst-sporedni)]">
                  {fmt(t.smena.od, { vreme: clockTime(smena.od) })}
                </p>
              </li>
            ))}
          </ul>
        )}
      </OkvirSekcije>
    </Kartica>
  );
}

// An icon AND a word, never colour alone (master §10.4); the icons are the waiter panel's, copied.
const STATUS_REZERVACIJE: Record<MenuReservationStatus, { ikonica: LucideIcon; ton: StatusTon }> = {
  new: { ikonica: CircleDot, ton: "info" },
  change_proposed: { ikonica: CalendarSync, ton: "neutralno" },
  accepted: { ikonica: CalendarCheck, ton: "uspeh" },
  declined: { ikonica: CircleX, ton: "neutralno" },
  arrived: { ikonica: CircleCheck, ton: "uspeh" },
  cancelled: { ikonica: CircleSlash, ton: "neutralno" },
};

function RezervacijeDanas({
  rezervacije,
  skraceno,
}: {
  rezervacije: OperacijeView["rezervacijeDanas"];
  skraceno: boolean;
}) {
  return (
    <Kartica>
      <OkvirSekcije naslov={t.rezervacije.naslov} nivo={2}>
        {rezervacije.length === 0 ? (
          <p className="text-sm leading-relaxed text-[var(--mp-tekst-sporedni)]">{t.rezervacije.prazno}</p>
        ) : (
          <ul className="grid gap-3">
            {rezervacije.map((rezervacija) => {
              const { ikonica, ton } = STATUS_REZERVACIJE[rezervacija.status];
              return (
                <li
                  key={rezervacija.id}
                  data-rezervacija={rezervacija.id}
                  className="grid gap-1.5 border-t pt-3 first:border-t-0 first:pt-0 [--border:var(--mp-ivica)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-semibold leading-snug tabular-nums text-[var(--mp-tekst)]">
                      {fmt(t.rezervacije.gosti, {
                        vreme: clockTime(rezervacija.requestedAt),
                        gosti: fmt(d.guests[srPluralCategory(rezervacija.partySize)], { n: rezervacija.partySize }),
                      })}
                    </p>
                    <p className="text-right text-sm leading-snug text-[var(--mp-tekst-sporedni)]">
                      {rezervacija.positionLabel ?? t.rezervacije.bezStola}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusOznaka ton={ton} ikonica={ikonica} velicina="mala">
                      {d.reservationStatuses[rezervacija.status]}
                    </StatusOznaka>
                    {rezervacija.faza === "kasni" ? <KasniOznaka>{t.rezervacije.kasni}</KasniOznaka> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {skraceno ? <Napomena>{t.rezervacije.skraceno}</Napomena> : null}
      </OkvirSekcije>
    </Kartica>
  );
}

// --- the screen -----------------------------------------------------------------

export function Operativa({
  podaci,
  nowMs,
  filteri,
  onFilteri,
  izabranId,
  onIzaberi,
  detalj,
  onPing,
  konobarHref,
  pocetnoFilteriOtvoreni = false,
}: OperativaProps) {
  const view = operacijeView(podaci, filteri, nowMs);
  const imaZone = podaci.zones.length > 0;

  // The reminders of this device: pending, just sent, failed. One at a time per request.
  const [pingovi, setPingovi] = useState<Record<string, PingLokalno>>({});
  const zauzeto = useRef<Set<string>>(new Set());
  const posalji = useCallback(
    async (id: string) => {
      if (zauzeto.current.has(id)) return;
      zauzeto.current.add(id);
      setPingovi((tekuci) => ({ ...tekuci, [id]: { radi: true, poslatU: tekuci[id]?.poslatU ?? null, kod: null } }));
      const ishod = await pingIshod(onPing, id);
      zauzeto.current.delete(id);
      setPingovi((tekuci) => ({
        ...tekuci,
        [id]: ishod.ok
          ? { radi: false, poslatU: ishod.sentAt, kod: null }
          : { radi: false, poslatU: ishod.lastAt ?? tekuci[id]?.poslatU ?? null, kod: ishod.code },
      }));
    },
    [onPing],
  );

  // The drawer keeps showing the request it was opened for while it slides out.
  const [zadnjiId, setZadnjiId] = useState<string | null>(izabranId);
  if (izabranId !== null && izabranId !== zadnjiId) setZadnjiId(izabranId);
  const idDetalja = izabranId ?? zadnjiId;
  const redDetalja = idDetalja === null ? null : (view.redovi.find((red) => red.id === idDetalja) ?? null);

  return (
    <div data-operativa="" className="grid gap-6">
      <ZaglavljeSaStatusom
        naslov={menuPanelSr.sekcije.operativa}
        opis={t.opis}
        radnje={
          <Dugme asChild vrsta="sekundarno">
            <Link href={konobarHref}>
              <ArrowUpRight aria-hidden="true" strokeWidth={1.75} />
              {t.konobarskiPanel}
            </Link>
          </Dugme>
        }
      />

      <Filteri
        filteri={view.filteri}
        opcije={view.opcije}
        aktivnih={view.aktivnihFiltera}
        onFilteri={onFilteri}
        pocetnoOtvoreni={pocetnoFilteriOtvoreni}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start xl:grid-cols-[minmax(0,1fr)_22rem]">
        <OkvirSekcije
          naslov={t.zahtevi.naslov}
          radnje={
            view.ukupno > 0 ? (
              <p
                aria-live="polite"
                className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm tabular-nums text-[var(--mp-tekst)]"
              >
                <span>{sazetakZahteva(podaci)}</span>
                {view.kasni > 0 ? (
                  <KasniOznaka>{fmt(t.zahtevi.kasni[srPluralCategory(view.kasni)], { n: view.kasni })}</KasniOznaka>
                ) : null}
                {view.aktivnihFiltera > 0 ? (
                  <span className="text-[var(--mp-tekst-sporedni)]">
                    {fmt(t.zahtevi.broj, { n: view.redovi.length, ukupno: view.ukupno })}
                  </span>
                ) : null}
              </p>
            ) : undefined
          }
        >
          <ZahteviLista
            view={view}
            nowMs={nowMs}
            pingovi={pingovi}
            onPosalji={posalji}
            onDetalj={onIzaberi}
            onOcisti={() => onFilteri(BEZ_FILTERA)}
          />
          {view.skraceno ? <Napomena>{t.zahtevi.skraceno}</Napomena> : null}
        </OkvirSekcije>

        <div className="grid gap-6">
          <USmeni uSmeni={view.uSmeni} imaZone={imaZone} />
          <RezervacijeDanas rezervacije={view.rezervacijeDanas} skraceno={podaci.reservationsTruncated} />
        </div>
      </div>

      <DetaljFioka
        otvoreno={izabranId !== null}
        onZatvori={() => onIzaberi(null)}
        red={redDetalja}
        detalj={detalj}
        nowMs={nowMs}
        imaZone={imaZone}
        ping={
          redDetalja === null ? null : (
            <PingDetalja red={redDetalja} lokalno={pingovi[redDetalja.id]} nowMs={nowMs} onPosalji={posalji} />
          )
        }
      />
    </div>
  );
}
