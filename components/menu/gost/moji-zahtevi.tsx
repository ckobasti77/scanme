"use client";

// ScanMe Menu V1 (K21) — "Moji zahtevi" (master §8.4; K19-10): what this
// phone sent to this venue in the last 12 hours, newest first, each with its
// kind, place and time, the live status (icon + word), the order's lines and
// sum, and when it was accepted, finished or cancelled. A request that is
// still `Novi` can be cancelled after a confirmation; an accepted one only by
// the staff. Without a device there is nothing to show, and the page says how
// to start. K25: the reservations sent from this phone are the "Rezervacije"
// section above the requests (./rezervacija/moje-rezervacije.tsx); it is
// absent when the phone has none, and the page reads exactly as before.

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { fmt } from "@/lib/i18n/format";
import { menuDomenSr } from "@/lib/i18n/sr/menu-domen";
import { menuGostSr } from "@/lib/i18n/sr/menu-gost";
import type { GostOtkazIshod, GostZahtev } from "./model";
import { Iznos } from "./korpa/korpa";
import { MojeRezervacije } from "./rezervacija/moje-rezervacije";
import { vidljiveRezervacije, type MojaRezervacija, type OtkaziRezervaciju } from "./rezervacija/model";
import { brojStavki, IKONICA_VRSTE, porukaGreske, satBeograd, StatusZahteva } from "./stanje-zahteva";
import styles from "./gost.module.css";

const t = menuGostSr;
const PROZOR_MS = 12 * 60 * 60 * 1000;

/** The requests the phone shows: the last 12 hours, newest first (the query reads no clock). */
export function skoriZahtevi(zahtevi: readonly GostZahtev[], sadaMs: number): GostZahtev[] {
  return zahtevi.filter((zahtev) => zahtev.createdAt >= sadaMs - PROZOR_MS).sort((a, b) => b.createdAt - a.createdAt);
}

function naslovZahteva(zahtev: GostZahtev): string {
  const vrsta = menuDomenSr.requestKinds[zahtev.kind];
  if (zahtev.kind === "bill" && zahtev.paymentPreference) {
    return `${vrsta} · ${menuDomenSr.paymentPreferences[zahtev.paymentPreference]}`;
  }
  if (zahtev.kind === "order") {
    const kanal = zahtev.channel === "room_service" ? `${t.roomService.naslov} · ` : "";
    return `${vrsta} · ${kanal}${brojStavki(zahtev.items.length)}`;
  }
  return vrsta;
}

function Zahtev({
  zahtev,
  online,
  onOtkazi,
}: {
  zahtev: GostZahtev;
  online: boolean;
  onOtkazi: (id: string) => Promise<GostOtkazIshod>;
}) {
  const [pitanje, setPitanje] = useState(false);
  const [radi, setRadi] = useState(false);
  const [greska, setGreska] = useState<string | null>(null);
  const [otkazano, setOtkazano] = useState(false);
  // The question replaces "Otkaži": focus moves to the question when it opens and back to "Otkaži" on "Ne".
  const pitanjeRef = useRef<HTMLParagraphElement>(null);
  const otkaziRef = useRef<HTMLButtonElement>(null);
  const vratiFokus = useRef(false);
  const Ikonica = IKONICA_VRSTE[zahtev.kind];

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
    let ishod: GostOtkazIshod;
    try {
      ishod = await onOtkazi(zahtev.id);
    } catch {
      ishod = { ok: false, code: "network" };
    }
    setRadi(false);
    setPitanje(false);
    if (ishod.ok) setOtkazano(true);
    else setGreska(porukaGreske(ishod.code));
  };

  return (
    <li className={styles.zahtev} data-zahtev={zahtev.kind} data-status={zahtev.status}>
      <div className={styles.zahtevVrh}>
        <h3 className={styles.vrsta}>
          <Ikonica aria-hidden="true" className={styles.ikonica} />
          {naslovZahteva(zahtev)}
        </h3>
        <StatusZahteva status={zahtev.status} />
      </div>
      <p className={styles.zahtevMeta}>
        {fmt(t.zahtevi.mestoVreme, { mesto: zahtev.positionLabel, vreme: satBeograd(zahtev.createdAt) })}
      </p>
      {zahtev.items.length > 0 ? (
        <ul className={styles.stavke}>
          {zahtev.items.map((stavka, index) => (
            <li key={index} className={styles.stavka}>
              <span>
                {stavka.quantity} × {stavka.name}
                {stavka.variantName || stavka.addons.length > 0 ? (
                  <small>
                    {[stavka.variantName, ...stavka.addons.map((addon) => `+ ${addon.optionName}`)].filter(Boolean).join(", ")}
                  </small>
                ) : null}
                {stavka.note ? <small>{fmt(t.korpa.napomena, { tekst: stavka.note })}</small> : null}
              </span>
              <Iznos rsd={stavka.lineTotalRsd} />
            </li>
          ))}
          {zahtev.deliveryFeeRsd ? (
            <li className={styles.stavka}>
              <span>{t.korpa.dostava}</span>
              <Iznos rsd={zahtev.deliveryFeeRsd} />
            </li>
          ) : null}
          {zahtev.totalRsd !== null ? (
            <li className={`${styles.stavka} ${styles.zbirUkupno}`}>
              <strong>{t.korpa.ukupno}</strong>
              <Iznos rsd={zahtev.totalRsd} />
            </li>
          ) : null}
        </ul>
      ) : null}
      <ul className={styles.tok}>
        {zahtev.acceptedAt ? <li>{fmt(t.zahtevi.prihvacenU, { vreme: satBeograd(zahtev.acceptedAt) })}</li> : null}
        {zahtev.doneAt ? <li>{fmt(t.zahtevi.zavrsenU, { vreme: satBeograd(zahtev.doneAt) })}</li> : null}
        {zahtev.cancelledAt ? (
          <li>
            {fmt(zahtev.cancelledBy === "guest" ? t.zahtevi.otkazaliSteU : t.zahtevi.otkazaloOsobljeU, {
              vreme: satBeograd(zahtev.cancelledAt),
            })}
          </li>
        ) : null}
      </ul>
      {zahtev.status === "new" ? (
        pitanje ? (
          <div className={styles.prazno} role="group" aria-label={t.zahtevi.otkaziPitanje}>
            <p ref={pitanjeRef} tabIndex={-1} className={styles.linijaNaziv}>
              {t.zahtevi.otkaziPitanje}
            </p>
            <p className={styles.sitno}>{t.zahtevi.otkaziOpis}</p>
            <div className={styles.dvaDugmeta}>
              <button
                type="button"
                className={styles.dugmeSporedno}
                onClick={() => {
                  vratiFokus.current = true;
                  setPitanje(false);
                }}
              >
                {t.zahtevi.otkaziNe}
              </button>
              <button
                type="button"
                className={styles.dugme}
                disabled={!online || radi}
                aria-busy={radi || undefined}
                onClick={otkazi}
                data-otkazi-potvrda=""
              >
                {t.zahtevi.otkaziDa}
              </button>
            </div>
          </div>
        ) : (
          <div>
            <button
              ref={otkaziRef}
              type="button"
              className={styles.dugmeSporedno}
              disabled={!online}
              onClick={() => setPitanje(true)}
              data-otkazi=""
            >
              {t.zahtevi.otkazi}
            </button>
          </div>
        )
      ) : null}
      <p className={styles.sitno} role="status">
        {otkazano ? t.zahtevi.otkazano : null}
      </p>
      {greska ? (
        <p className={styles.greska} role="alert">
          {greska}
        </p>
      ) : null}
    </li>
  );
}

export function MojiZahtevi({
  zahtevi,
  sadaMs,
  online,
  meniHref,
  onOtkazi,
  rezervacije,
  onOtkaziRezervaciju,
}: {
  /** undefined = loading; null = this phone has no device here (no QR scanned). */
  zahtevi: readonly GostZahtev[] | null | undefined;
  sadaMs: number;
  online: boolean;
  meniHref: string;
  onOtkazi: (id: string) => Promise<GostOtkazIshod>;
  /** K25: this phone's reservations at the venue; absent/null/undefined = none to show (no section). */
  rezervacije?: readonly MojaRezervacija[] | null;
  /** K25: cancelling a reservation (the page's Server Action); without it the section is not shown. */
  onOtkaziRezervaciju?: OtkaziRezervaciju;
}) {
  const skori = zahtevi ? skoriZahtevi(zahtevi, sadaMs) : [];
  const rezervacijeZaPrikaz = rezervacije && onOtkaziRezervaciju ? vidljiveRezervacije(rezervacije, sadaMs) : [];
  const imaRezervacije = rezervacijeZaPrikaz.length > 0;
  return (
    <section className={styles.zahtevi} aria-labelledby="moji-zahtevi-naslov" data-moji-zahtevi="">
      <Link href={meniHref} className={styles.nazad}>
        <ChevronLeft aria-hidden="true" className={styles.ikonica} />
        {t.zahtevi.nazad}
      </Link>
      <h2 id="moji-zahtevi-naslov" className={styles.listNaslov}>
        {t.zahtevi.naslov}
      </h2>
      {imaRezervacije && onOtkaziRezervaciju ? (
        <MojeRezervacije rezervacije={rezervacijeZaPrikaz} sadaMs={sadaMs} online={online} onOtkazi={onOtkaziRezervaciju} />
      ) : null}
      {zahtevi === null ? (
        <div className={styles.prazno}>
          {imaRezervacije ? null : <p>{t.zahtevi.bezUredjaja}</p>}
          <Link href={meniHref} className={styles.dugmeSporedno}>
            {t.zahtevi.otvoriMeni}
          </Link>
        </div>
      ) : zahtevi === undefined ? (
        <p className={styles.zahteviUvod} role="status">
          {t.zahtevi.ucitava}
        </p>
      ) : skori.length === 0 ? (
        <div className={styles.prazno}>
          {imaRezervacije ? null : <p>{t.zahtevi.prazno}</p>}
          <Link href={meniHref} className={styles.dugmeSporedno}>
            {t.zahtevi.otvoriMeni}
          </Link>
        </div>
      ) : (
        <>
          <p className={styles.zahteviUvod}>{t.zahtevi.uvod}</p>
          <ul className={styles.zahteviLista}>
            {skori.map((zahtev) => (
              <Zahtev key={zahtev.id} zahtev={zahtev} online={online} onOtkazi={onOtkazi} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
