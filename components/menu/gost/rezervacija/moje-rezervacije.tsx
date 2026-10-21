"use client";

// ScanMe Menu V1 (K25) — the "Rezervacije" section of "Moji zahtevi" (master
// §11.7): the reservations sent from this phone, newest term first, each with
// its status (icon + word), the term, the guests, when it was sent, a change
// the venue proposed, and — while the reservation is not realized — `Otkaži`
// with a confirmation. No table, no staff names, no contact. The cancel goes
// through the page's Server Action (the HttpOnly device cookie proves the
// reservation is this phone's); the list itself is the live Convex
// subscription. Nothing is shown when the phone has no reservation here.

import { CalendarClock } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { fmt } from "@/lib/i18n/format";
import { menuGostSr } from "@/lib/i18n/sr/menu-gost";
import { clockTime } from "@/lib/menu/elapsed-time";
import { canGuestCancel } from "@/lib/menu/reservation-status";
import type { ReservationCancelResult } from "@/lib/menu/http/reservation";
import gost from "../gost.module.css";
import { gostiTekst, porukaOdbijanja, terminTekst, type MojaRezervacija, type OtkaziRezervaciju } from "./model";
import { StatusRezervacije } from "./status";
import styles from "./rezervacija.module.css";

const t = menuGostSr.rezervacija;

function Rezervacija({
  rezervacija,
  sadaMs,
  online,
  onOtkazi,
}: {
  rezervacija: MojaRezervacija;
  sadaMs: number;
  online: boolean;
  onOtkazi: OtkaziRezervaciju;
}) {
  const id = useId();
  const [pitanje, setPitanje] = useState(false);
  const [radi, setRadi] = useState(false);
  const [greska, setGreska] = useState<string | null>(null);
  const [otkazano, setOtkazano] = useState(false);
  // The question replaces "Otkaži": focus moves to the question when it opens and back to "Otkaži" on "Ne".
  const pitanjeRef = useRef<HTMLParagraphElement>(null);
  const otkaziRef = useRef<HTMLButtonElement>(null);
  const vratiFokus = useRef(false);

  useEffect(() => {
    if (pitanje) pitanjeRef.current?.focus();
    else if (vratiFokus.current) {
      vratiFokus.current = false;
      otkaziRef.current?.focus();
    }
  }, [pitanje]);

  const otkazi = async () => {
    setRadi(true);
    setGreska(null);
    let ishod: ReservationCancelResult;
    try {
      ishod = await onOtkazi(rezervacija.id);
    } catch {
      ishod = { ok: false, code: "network" };
    }
    setRadi(false);
    setPitanje(false);
    if (ishod.ok) setOtkazano(true);
    else setGreska(porukaOdbijanja(ishod.code));
  };

  return (
    <li className={gost.zahtev} data-rezervacija-moja={rezervacija.status}>
      <div className={gost.zahtevVrh}>
        <h4 id={`${id}-termin`} className={styles.mojaVrsta}>
          <CalendarClock aria-hidden="true" className={gost.ikonicaVelika} />
          <span>
            <span className={styles.mojaVrstaMala}>{t.moji.vrsta}</span>
            <span>{terminTekst(rezervacija.requestedAt, sadaMs)}</span>
          </span>
        </h4>
        <StatusRezervacije status={rezervacija.status} />
      </div>
      <p className={gost.zahtevMeta}>{gostiTekst(rezervacija.partySize)}</p>
      <p className={gost.zahtevMeta}>{fmt(t.moji.poslato, { vreme: clockTime(rezervacija.createdAt) })}</p>
      {rezervacija.status === "change_proposed" ? (
        <div className={styles.predlog} data-predlog="">
          {rezervacija.proposedAt !== null ? (
            <p className={styles.predlogNaslov}>{fmt(t.link.predlog, { termin: terminTekst(rezervacija.proposedAt, sadaMs) })}</p>
          ) : null}
          {rezervacija.proposalNote ? <p>{fmt(t.link.predlogPoruka, { poruka: rezervacija.proposalNote })}</p> : null}
          <p className={gost.sitno}>{t.link.predlogUputstvo}</p>
        </div>
      ) : null}
      {rezervacija.cancelledAt ? (
        <ul className={gost.tok}>
          <li>
            {fmt(rezervacija.cancelledBy === "guest" ? t.moji.otkazaliSte : t.moji.otkazaoLokal, {
              vreme: clockTime(rezervacija.cancelledAt),
            })}
          </li>
        </ul>
      ) : null}
      {canGuestCancel(rezervacija.status) && !otkazano ? (
        pitanje ? (
          <div className={gost.prazno} role="group" aria-label={t.link.otkaziPitanje}>
            <p ref={pitanjeRef} tabIndex={-1} className={gost.linijaNaziv}>
              {t.link.otkaziPitanje}
            </p>
            <p className={gost.sitno}>{t.link.otkaziOpis}</p>
            <div className={gost.dvaDugmeta}>
              <button
                type="button"
                className={gost.dugmeSporedno}
                onClick={() => {
                  vratiFokus.current = true;
                  setPitanje(false);
                }}
              >
                {t.link.otkaziNe}
              </button>
              <button
                type="button"
                className={gost.dugme}
                disabled={!online || radi}
                aria-busy={radi || undefined}
                onClick={otkazi}
                data-otkazi-rezervaciju-potvrda=""
              >
                {radi ? t.link.otkazuje : t.link.otkaziDa}
              </button>
            </div>
          </div>
        ) : (
          <div>
            <button
              ref={otkaziRef}
              type="button"
              className={gost.dugmeSporedno}
              disabled={!online}
              aria-describedby={`${id}-termin`}
              onClick={() => setPitanje(true)}
              data-otkazi-rezervaciju=""
            >
              {menuGostSr.zahtevi.otkazi}
            </button>
          </div>
        )
      ) : null}
      <p className={gost.sitno} role="status">
        {otkazano ? t.link.otkazano : null}
      </p>
      {greska ? (
        <p className={gost.greska} role="alert">
          {greska}
        </p>
      ) : null}
    </li>
  );
}

/** `rezervacije`: the ones to show (lib `vidljiveRezervacije`), in order. Nothing renders when it is empty. */
export function MojeRezervacije({
  rezervacije,
  sadaMs,
  online,
  onOtkazi,
}: {
  rezervacije: readonly MojaRezervacija[];
  sadaMs: number;
  online: boolean;
  onOtkazi: OtkaziRezervaciju;
}) {
  const id = useId();
  if (rezervacije.length === 0) return null;
  return (
    <section className={styles.moje} aria-labelledby={`${id}-naslov`} data-moje-rezervacije="">
      <h3 id={`${id}-naslov`} className={styles.podnaslov}>
        {t.moji.naslov}
      </h3>
      <ul className={gost.zahteviLista}>
        {rezervacije.map((rezervacija) => (
          <Rezervacija key={rezervacija.id} rezervacija={rezervacija} sadaMs={sadaMs} online={online} onOtkazi={onOtkazi} />
        ))}
      </ul>
    </section>
  );
}
