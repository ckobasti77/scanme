"use client";

// ScanMe Menu V1 (K25) — one reservation in focus (master §11.3; plan K24-2,
// K24-4, K24-11, §2.5; the sketch "detalj rezervacije u istom panou"). It opens
// in the SAME contextual pane as a request (a phone: the whole screen, with its
// back button). It shows what the decision needs: the term and the guests, the
// guest's name, the contact (`Pozovi` as a tel: link, `Piši` as a mailto: link —
// plain links, nothing is sent from here), the guest's note, when it was sent,
// who decided, the table, and the other reservations of the same table that day.
// The actions follow the status:
//   Nova               Prihvati · Predloži izmenu (date, time, a message) · Odbij (confirmed)
//   Predložena izmena  Gost prihvata predlog · Odbij (confirmed)
//   Prihvaćena         Gosti su stigli · the table (Poveži / Promeni / Ukloni) · Otkaži rezervaciju (confirmed)
//   the rest           read-only lines
// The table is always chosen by the staff, from the floor's active positions;
// nothing is picked automatically. Nothing here promises or messages the guest:
// `Javite gostu` leaves room for the reply (K26).

import { Armchair, ChevronLeft, ChevronRight, CircleCheck, CircleSlash, Mail, OctagonAlert, Phone, Replace, SearchX, Unlink } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { fmt } from "@/lib/i18n/format";
import { menuDomenSr } from "@/lib/i18n/sr/menu-domen";
import { menuKonobarSr } from "@/lib/i18n/sr/menu-konobar";
import { clockTime } from "@/lib/menu/elapsed-time";
import { canBindPosition, isOpenReservationStatus } from "@/lib/menu/reservation-status";
import { Dugme } from "../../zajednicko/dugme";
import { PraznoStanje, UcitavanjeStanje } from "../../zajednicko/stanja";
import type { KonobarRezervacija, KonobarRezervacijaDetalj, KonobarSala } from "../model";
import { StatusRezervacije, VrstaIkonica } from "../vrsta";
import { KasnjenjeRezervacije } from "./kasnjenje";
import { PredlogIzmene } from "./predlog-izmene";
import { gostiTekst, terminSaGostima, terminTekst } from "./tekst";
import { VezivanjeStola } from "./vezivanje-stola";

const t = menuKonobarSr.rezervacije.detalj;
const d = menuDomenSr;

export type RezDetaljRadnja = "prihvati" | "odbij" | "predlozi" | "gostPrihvata" | "otkazi" | "poveziSto" | "ukloniSto" | "stigli";

type Otvoreno = "predlog" | "odbij" | "otkazi" | "sto";

export type DetaljRezervacijeProps = {
  /** undefined = loading; null = not available (another venue, gone). */
  detalj: KonobarRezervacijaDetalj | null | undefined;
  /** The floor (the table picker); undefined = still loading. */
  sala: Pick<KonobarSala, "zones" | "positions"> | undefined;
  sadaMs: number;
  /** How long the venue holds a reservation after its time (minutes). */
  holdMin: number;
  /** The venue's optional occupancy module (the arrival hint). */
  zauzetostUkljucena: boolean;
  radi: RezDetaljRadnja | null;
  /** What the last action answered, in words (role=alert). */
  greska: string | null;
  radnjeIskljucene: boolean;
  /** Why the actions wait (offline); shown next to them. */
  razlogIskljucenja?: string | null;
  onNazad(): void;
  onPrihvati(): void;
  onOdbij(): void;
  onPredlozi(proposedAt: number, poruka: string | null): void;
  onGostPrihvata(): void;
  onOtkazi(): void;
  /** The table, chosen by hand (null = remove it). */
  onPoveziSto(positionId: string | null): void;
  onGostiStigli(): void;
  onOtvoriDrugu(id: string): void;
  /** Where the back button returns when the reservation was opened from a table (default: the queue). */
  nazadNa?: { oznaka: string; citac: string };
  /** K26: the reply to the guest goes here. */
  odgovor?: ReactNode;
  /** Izlog and tests: a panel that starts open. */
  pocetno?: { otvoreno?: Otvoreno };
};

/** `tel:` target of a phone number: digits and a leading plus only. */
export function telefonHref(telefon: string): string {
  return `tel:${telefon.replace(/[^\d+]/g, "")}`;
}

/**
 * `mailto:` target of an address: everything but the `@` is percent-encoded, so a guest's text can
 * never add a header, a fragment or another recipient (`,` `;`).
 */
export function mejlHref(email: string): string {
  return `mailto:${encodeURIComponent(email.trim()).replace(/%40/g, "@")}`;
}

function Cinjenica({ naslov, children }: { naslov: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-[0.9375rem] text-[var(--mp-tekst-sporedni)]">{naslov}</dt>
      <dd className="text-[1.125rem] font-semibold text-[var(--mp-tekst)]">{children}</dd>
    </div>
  );
}

/** The question before an irreversible answer (Odbij, Otkaži): the question takes focus, both answers are in view. */
function PotvrdaRadnje({
  refPano,
  pitanje,
  opis,
  da,
  ne,
  ucitava,
  iskljuceno,
  onDa,
  onNe,
}: {
  refPano: RefObject<HTMLDivElement | null>;
  pitanje: string;
  opis: string;
  da: string;
  ne: string;
  ucitava: boolean;
  iskljuceno: boolean;
  onDa(): void;
  onNe(): void;
}) {
  return (
    <div
      ref={refPano}
      data-potvrda
      className="grid scroll-mb-28 scroll-mt-24 gap-3 rounded-[var(--mp-radius-kontrola)] border p-4 [--border:var(--mp-opasnost-ivica)] bg-[var(--mp-opasnost-meko)]"
    >
      <p data-fokus tabIndex={-1} className="text-[1.0625rem] font-bold text-[var(--mp-tekst)] outline-none">
        {pitanje}
      </p>
      <p className="text-[0.9375rem] text-[var(--mp-tekst)]">{opis}</p>
      <div className="grid grid-cols-2 gap-3">
        <Dugme vrsta="sekundarno" onClick={onNe} className="min-h-12">
          {ne}
        </Dugme>
        <Dugme vrsta="opasno" ikonica={CircleSlash} ucitava={ucitava} disabled={iskljuceno} onClick={onDa} className="min-h-12">
          {da}
        </Dugme>
      </div>
    </div>
  );
}

function DrugaNaStolu({ red, sadaMs, onOtvori }: { red: KonobarRezervacija; sadaMs: number; onOtvori(): void }) {
  return (
    <button
      type="button"
      onClick={onOtvori}
      aria-label={fmt(menuKonobarSr.rezervacije.otvoriCitac, { ime: red.guestName, termin: terminTekst(red.requestedAt, sadaMs) })}
      className="grid min-h-12 w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-[var(--mp-radius-kontrola)] border bg-[var(--mp-povrsina-utisana)] p-3 text-left [--border:var(--mp-ivica)] hover:bg-[color-mix(in_oklab,var(--mp-povrsina-utisana)_80%,var(--mp-mastilo)_6%)]"
    >
      <VrstaIkonica vrsta="reservation" />
      <span className="grid min-w-0 gap-1">
        <span className="break-words text-base font-bold leading-snug text-[var(--mp-tekst)]">{red.guestName}</span>
        <span className="text-[0.9375rem] tabular-nums text-[var(--mp-tekst)]">{terminSaGostima(red, sadaMs)}</span>
        <span>
          <StatusRezervacije status={red.status} velicina="mala" />
        </span>
      </span>
      <ChevronRight aria-hidden="true" strokeWidth={2} className="size-5 text-[var(--mp-tekst-sporedni)]" />
    </button>
  );
}

export function DetaljRezervacije({
  detalj,
  sala,
  sadaMs,
  holdMin,
  zauzetostUkljucena,
  radi,
  greska,
  radnjeIskljucene,
  razlogIskljucenja,
  onNazad,
  onPrihvati,
  onOdbij,
  onPredlozi,
  onGostPrihvata,
  onOtkazi,
  onPoveziSto,
  onGostiStigli,
  onOtvoriDrugu,
  nazadNa,
  odgovor,
  pocetno,
}: DetaljRezervacijeProps) {
  const [otvoreno, setOtvoreno] = useState<Otvoreno | null>(pocetno?.otvoreno ?? null);
  const [prethodniRadi, setPrethodniRadi] = useState(radi);
  const rootRef = useRef<HTMLElement>(null);
  const naslovRef = useRef<HTMLHeadingElement>(null);
  const panoRef = useRef<HTMLDivElement>(null);
  const prethodnoOtvoreno = useRef<Otvoreno | null>(null);
  const id = detalj?.reservation.id ?? null;

  // An action that finished without an error closes the panel it came from (a failed one keeps it, as typed).
  if (prethodniRadi !== radi) {
    setPrethodniRadi(radi);
    if (radi === null && prethodniRadi !== null && greska === null) setOtvoreno(null);
  }

  // A newly opened reservation starts at its title (the place of reading), without a ring.
  useEffect(() => {
    if (id) naslovRef.current?.focus({ preventScroll: false });
  }, [id]);

  // An opened panel comes into view and takes focus; a closed one gives focus back to its opener.
  useEffect(() => {
    const pre = prethodnoOtvoreno.current;
    prethodnoOtvoreno.current = otvoreno;
    if (otvoreno) {
      panoRef.current?.scrollIntoView({ block: "nearest" });
      panoRef.current?.querySelector<HTMLElement>("[data-fokus], select, button")?.focus({ preventScroll: true });
    } else if (pre) {
      rootRef.current?.querySelector<HTMLElement>(`[data-otvarac="${pre}"]`)?.focus({ preventScroll: true });
    }
  }, [otvoreno]);

  const nazad = (
    <button
      type="button"
      onClick={onNazad}
      aria-label={nazadNa?.citac ?? t.nazadCitac}
      className="-ml-2 inline-flex min-h-12 items-center gap-1 justify-self-start rounded-[var(--mp-radius-dugme)] px-2 text-[1.0625rem] font-bold text-[var(--mp-tekst)] hover:bg-[var(--mp-povrsina-utisana)]"
    >
      <ChevronLeft aria-hidden="true" strokeWidth={2.25} className="size-6" />
      {nazadNa?.oznaka ?? t.nazad}
    </button>
  );

  if (detalj === undefined) {
    return (
      <section className="grid content-start gap-4" aria-busy="true">
        {nazad}
        <h1 className="sr-only">{t.ucitava}</h1>
        <UcitavanjeStanje oblik="forma" redova={4} oznaka={t.ucitava} />
      </section>
    );
  }
  if (detalj === null) {
    return (
      <section className="grid content-start gap-4">
        {nazad}
        <h1 className="sr-only">{t.nestala.naslov}</h1>
        <PraznoStanje ikonica={SearchX} nivo={2} naslov={t.nestala.naslov} opis={t.nestala.opis} />
      </section>
    );
  }

  const r = detalj.reservation;
  const otvorena = isOpenReservationStatus(r.status);
  const mozeSto = canBindPosition(r.status);
  const razlogId = razlogIskljucenja ? "rez-razlog" : undefined;
  const blokirano = radnjeIskljucene;
  /** One action in flight: the others wait; the one in flight shows its spinner. */
  const zauzet = (radnja: RezDetaljRadnja) => blokirano || (radi !== null && radi !== radnja);
  const prebaci = (pano: Otvoreno) => setOtvoreno((staro) => (staro === pano ? null : pano));
  const stigliHint = r.positionId ? (zauzetostUkljucena ? t.stigliZauzetost : null) : t.stigliBezStola;
  const pokazujeJavite = !(r.status === "arrived" || (r.status === "cancelled" && r.cancelledBy === "guest"));
  const odluka =
    r.decidedAt !== null && (r.status === "accepted" || r.status === "declined" || r.status === "change_proposed")
      ? r.decidedBy
        ? fmt(t.odluka, { status: d.reservationStatuses[r.status], ime: r.decidedBy, vreme: clockTime(r.decidedAt) })
        : `${d.reservationStatuses[r.status]} · ${clockTime(r.decidedAt)}`
      : null;
  const zavrsnaLinija =
    r.status === "arrived"
      ? r.arrivedAt !== null
        ? fmt(t.realizovana, { vreme: clockTime(r.arrivedAt) })
        : d.reservationStatuses.arrived
      : r.status === "declined"
        ? r.decidedAt !== null
          ? fmt(t.odbijena, { vreme: clockTime(r.decidedAt) })
          : d.reservationStatuses.declined
        : r.cancelledAt !== null
          ? fmt(r.cancelledBy === "guest" ? t.otkazanaGost : t.otkazanaOsoblje, { vreme: clockTime(r.cancelledAt) })
          : d.reservationStatuses.cancelled;

  return (
    <section ref={rootRef} aria-labelledby="rez-detalj-naslov" className="grid content-start gap-5" data-detalj-rezervacije={r.id}>
      {nazad}

      <article className="grid gap-5 rounded-[var(--mp-radius-kartica)] border bg-[var(--mp-povrsina)] p-5 shadow-[var(--mp-senka-xs)]">
        <header className="flex items-start gap-4">
          <VrstaIkonica vrsta="reservation" velika />
          <div className="grid min-w-0 gap-1.5">
            <h1
              id="rez-detalj-naslov"
              ref={naslovRef}
              tabIndex={-1}
              className="scroll-mt-24 text-2xl font-bold leading-tight tracking-[-0.01em] text-[var(--mp-tekst)] outline-none"
            >
              {t.naslov}
            </h1>
            <div>
              <StatusRezervacije status={r.status} />
            </div>
          </div>
        </header>

        <dl className="grid grid-cols-2 divide-x border-y py-4 [--border:var(--mp-ivica)]" data-rez-termin>
          <div className="grid gap-1 pr-4">
            <dt className="text-[0.9375rem] text-[var(--mp-tekst-sporedni)]">{t.termin}</dt>
            <dd className="break-words text-[1.375rem] font-bold leading-tight tabular-nums text-[var(--mp-tekst)]">{terminTekst(r.requestedAt, sadaMs)}</dd>
          </div>
          <div className="grid gap-1 pl-4">
            <dt className="text-[0.9375rem] text-[var(--mp-tekst-sporedni)]">{t.gosti}</dt>
            <dd className="text-[1.375rem] font-bold leading-tight text-[var(--mp-tekst)]">{gostiTekst(r.partySize)}</dd>
          </div>
        </dl>

        {r.status === "accepted" ? <KasnjenjeRezervacije requestedAt={r.requestedAt} holdMin={holdMin} sadaMs={sadaMs} /> : null}

        <dl className="grid gap-4 text-base">
          <Cinjenica naslov={t.ime}>
            <span className="break-words">{r.guestName}</span>
          </Cinjenica>

          {r.contactPhone || r.contactEmail ? (
            <div className="grid gap-1.5">
              <dt className="text-[0.9375rem] text-[var(--mp-tekst-sporedni)]">{t.kontakt}</dt>
              <dd className="grid gap-2">
                {r.contactPhone ? (
                  <span className="flex items-center justify-between gap-3">
                    <span className="min-w-0 break-all text-[1.125rem] font-semibold tabular-nums text-[var(--mp-tekst)]">{r.contactPhone}</span>
                    <Dugme asChild vrsta="sekundarno" className="min-h-12 px-4">
                      <a href={telefonHref(r.contactPhone)} aria-label={fmt(t.pozoviCitac, { telefon: r.contactPhone })}>
                        <Phone aria-hidden="true" strokeWidth={1.75} />
                        {t.pozovi}
                      </a>
                    </Dugme>
                  </span>
                ) : null}
                {r.contactEmail ? (
                  <span className="flex items-center justify-between gap-3">
                    <span className="min-w-0 break-all text-[1.125rem] font-semibold text-[var(--mp-tekst)]">{r.contactEmail}</span>
                    <Dugme asChild vrsta="sekundarno" className="min-h-12 px-4">
                      <a href={mejlHref(r.contactEmail)} aria-label={fmt(t.pisiCitac, { email: r.contactEmail })}>
                        <Mail aria-hidden="true" strokeWidth={1.75} />
                        {t.pisi}
                      </a>
                    </Dugme>
                  </span>
                ) : null}
              </dd>
            </div>
          ) : null}

          <Cinjenica naslov={t.napomena}>
            {r.note ? (
              <span className="whitespace-pre-line break-words">{r.note}</span>
            ) : (
              <span className="font-normal text-[var(--mp-tekst-sporedni)]">{t.bezNapomene}</span>
            )}
          </Cinjenica>

          {r.status === "change_proposed" && r.proposedAt !== null ? (
            <Cinjenica naslov={t.predlogNaslov}>
              <span className="grid gap-1">
                <span className="tabular-nums">{fmt(t.predlogTermin, { termin: terminTekst(r.proposedAt, sadaMs) })}</span>
                {r.proposalNote ? <span className="whitespace-pre-line break-words font-normal">{r.proposalNote}</span> : null}
              </span>
            </Cinjenica>
          ) : null}

          <Cinjenica naslov={t.sto}>
            <span className="grid gap-1">
              <span className="inline-flex items-center gap-2">
                <Armchair aria-hidden="true" strokeWidth={2} className="size-5 shrink-0 text-[var(--mp-tekst-sporedni)]" />
                {r.positionLabel ?? <span className="font-normal text-[var(--mp-tekst-sporedni)]">{t.bezStola}</span>}
              </span>
              {r.positionLabel && r.boundBy ? <span className="text-[0.9375rem] font-normal text-[var(--mp-tekst-sporedni)]">{fmt(t.vezao, { ime: r.boundBy })}</span> : null}
            </span>
          </Cinjenica>
        </dl>

        <div className="grid gap-1" data-rez-poslato>
          <p className="text-[0.9375rem] text-[var(--mp-tekst-sporedni)]">{fmt(t.poslato, { vreme: clockTime(r.createdAt) })}</p>
          {odluka ? <p className="text-[1.0625rem] font-semibold text-[var(--mp-tekst)]">{odluka}</p> : null}
        </div>

        {mozeSto ? (
          <div className="flex flex-wrap gap-2" data-rez-sto-radnje>
            <Dugme
              vrsta="sekundarno"
              ikonica={r.positionId ? Replace : Armchair}
              data-otvarac="sto"
              aria-expanded={otvoreno === "sto"}
              disabled={blokirano || !sala || (radi !== null && radi !== "poveziSto")}
              onClick={() => prebaci("sto")}
              className="min-h-12"
            >
              {r.positionId ? t.promeniSto : t.poveziSto}
            </Dugme>
            {r.positionId ? (
              <Dugme
                vrsta="tiho"
                ikonica={Unlink}
                ucitava={radi === "ukloniSto"}
                disabled={zauzet("ukloniSto")}
                onClick={() => onPoveziSto(null)}
                className="min-h-12"
              >
                {t.ukloniSto}
              </Dugme>
            ) : null}
          </div>
        ) : null}

        {otvoreno === "sto" && mozeSto && sala ? (
          <div ref={panoRef}>
            <VezivanjeStola
              sala={sala}
              trenutnoId={r.positionId}
              iskljuceno={blokirano}
              radi={radi === "poveziSto"}
              onIzaberi={(positionId) => onPoveziSto(positionId)}
              onOdustani={() => setOtvoreno(null)}
            />
          </div>
        ) : null}

        {otvoreno === "predlog" && (r.status === "new" || r.status === "change_proposed") ? (
          <div ref={panoRef}>
            <PredlogIzmene
              zahtevaniTermin={r.requestedAt}
              sadaMs={sadaMs}
              radi={radi === "predlozi"}
              iskljuceno={blokirano}
              onSacuvaj={onPredlozi}
              onOdustani={() => setOtvoreno(null)}
            />
          </div>
        ) : null}

        {greska ? (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-[var(--mp-radius-kontrola)] border px-4 py-3 text-base text-[var(--mp-tekst)] [--border:var(--mp-opasnost-ivica)] bg-[var(--mp-opasnost-meko)]"
          >
            <OctagonAlert aria-hidden="true" strokeWidth={2} className="mt-0.5 size-5 shrink-0 text-[var(--mp-opasnost)]" />
            <p>{greska}</p>
          </div>
        ) : null}

        {otvorena ? (
          <div
            data-radnje-detalja
            className="sticky bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-10 -mx-5 -mb-5 grid gap-3 rounded-b-[var(--mp-radius-kartica)] border-t bg-[var(--mp-povrsina)] px-5 pb-5 pt-4 shadow-[0_-8px_24px_rgb(0_0_0/0.06)] [--border:var(--mp-ivica)] lg:bottom-[-1.25rem]"
          >
            {razlogIskljucenja ? (
              <p id={razlogId} className="text-[0.9375rem] text-[var(--mp-tekst-sporedni)]">
                {razlogIskljucenja}
              </p>
            ) : null}

            {r.status === "new" ? (
              <div className="grid grid-cols-2 gap-3">
                <Dugme
                  vrsta="akcent"
                  ucitava={radi === "prihvati"}
                  disabled={zauzet("prihvati")}
                  aria-describedby={razlogId}
                  onClick={onPrihvati}
                  className="min-h-14 w-full whitespace-normal px-3 text-[1.0625rem] leading-tight"
                >
                  {t.prihvati}
                </Dugme>
                <Dugme
                  vrsta="sekundarno"
                  data-otvarac="predlog"
                  aria-expanded={otvoreno === "predlog"}
                  disabled={zauzet("predlozi")}
                  aria-describedby={razlogId}
                  onClick={() => prebaci("predlog")}
                  className="min-h-14 w-full whitespace-normal px-3 text-[1.0625rem] leading-tight"
                >
                  {t.predlozi}
                </Dugme>
              </div>
            ) : null}

            {r.status === "change_proposed" ? (
              <div className="grid gap-2">
                <Dugme
                  vrsta="akcent"
                  ucitava={radi === "gostPrihvata"}
                  disabled={zauzet("gostPrihvata")}
                  aria-describedby={razlogId}
                  onClick={onGostPrihvata}
                  className="min-h-14 w-full whitespace-normal px-3 text-[1.0625rem] leading-tight"
                >
                  {t.gostPrihvata}
                </Dugme>
                <p className="text-[0.9375rem] text-[var(--mp-tekst-sporedni)]">{t.gostPrihvataOpis}</p>
              </div>
            ) : null}

            {r.status === "accepted" ? (
              <div className="grid gap-2">
                <Dugme
                  vrsta="akcent"
                  ucitava={radi === "stigli"}
                  disabled={zauzet("stigli")}
                  aria-describedby={razlogId}
                  onClick={onGostiStigli}
                  className="min-h-14 w-full whitespace-normal px-3 text-[1.0625rem] leading-tight"
                >
                  {t.stigli}
                </Dugme>
                {stigliHint ? <p className="text-[0.9375rem] text-[var(--mp-tekst-sporedni)]">{stigliHint}</p> : null}
              </div>
            ) : null}

            {r.status === "new" || r.status === "change_proposed" ? (
              otvoreno === "odbij" ? (
                <PotvrdaRadnje
                  refPano={panoRef}
                  pitanje={t.odbijPitanje}
                  opis={t.odbijOpis}
                  da={t.odbijDa}
                  ne={t.odbijNe}
                  ucitava={radi === "odbij"}
                  iskljuceno={blokirano}
                  onDa={onOdbij}
                  onNe={() => setOtvoreno(null)}
                />
              ) : (
                <Dugme
                  vrsta="tiho"
                  ikonica={CircleSlash}
                  data-otvarac="odbij"
                  disabled={zauzet("odbij")}
                  onClick={() => setOtvoreno("odbij")}
                  className="min-h-12 w-full text-[var(--mp-opasnost)]"
                >
                  {t.odbij}
                </Dugme>
              )
            ) : null}

            {r.status === "accepted" ? (
              otvoreno === "otkazi" ? (
                <PotvrdaRadnje
                  refPano={panoRef}
                  pitanje={t.otkaziPitanje}
                  opis={t.otkaziOpis}
                  da={t.otkaziDa}
                  ne={t.otkaziNe}
                  ucitava={radi === "otkazi"}
                  iskljuceno={blokirano}
                  onDa={onOtkazi}
                  onNe={() => setOtvoreno(null)}
                />
              ) : (
                <Dugme
                  vrsta="tiho"
                  ikonica={CircleSlash}
                  data-otvarac="otkazi"
                  disabled={zauzet("otkazi")}
                  onClick={() => setOtvoreno("otkazi")}
                  className="min-h-12 w-full text-[var(--mp-opasnost)]"
                >
                  {t.otkazi}
                </Dugme>
              )
            ) : null}
          </div>
        ) : (
          <p className="inline-flex items-center gap-2 text-base font-semibold text-[var(--mp-tekst)]" data-rez-zavrseno>
            {r.status === "arrived" ? (
              <CircleCheck aria-hidden="true" strokeWidth={2} className="size-5 shrink-0 text-[var(--mp-uspeh)]" />
            ) : (
              <CircleSlash aria-hidden="true" strokeWidth={2} className="size-5 shrink-0 text-[var(--mp-tekst-sporedni)]" />
            )}
            {zavrsnaLinija}
          </p>
        )}
      </article>

      {r.positionId && detalj.sameTable.length > 0 ? (
        <section aria-labelledby="rez-drugi" className="grid gap-3">
          <h2 id="rez-drugi" className="text-lg font-bold text-[var(--mp-tekst)]">
            {t.drugeNaStolu}
          </h2>
          <ul className="grid gap-2">
            {detalj.sameTable.map((druga) => (
              <li key={druga.id}>
                <DrugaNaStolu red={druga} sadaMs={sadaMs} onOtvori={() => onOtvoriDrugu(druga.id)} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {pokazujeJavite ? (
        <section aria-labelledby="rez-javite" className="grid gap-2 rounded-[var(--mp-radius-kartica)] border border-dashed p-4 [--border:var(--mp-ivica-kontrole)]" data-javite-gostu>
          <h2 id="rez-javite" className="text-lg font-bold text-[var(--mp-tekst)]">
            {t.javiteGostu}
          </h2>
          <p className="text-base text-[var(--mp-tekst-sporedni)]">{t.javiteGostuOpis}</p>
          {odgovor}
        </section>
      ) : null}
    </section>
  );
}
