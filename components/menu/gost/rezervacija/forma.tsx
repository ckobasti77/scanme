"use client";

// ScanMe Menu V1 (K25) — the guest's reservation form (master §11.2; plan
// docs/meni/planovi/K24.md). Name, a date and a time inside the venue's working
// hours (15-minute grid, in the future, at most 60 days ahead), the number of
// guests, the contact the venue asks for and an optional note. The guest never
// chooses a table: the venue does. Nothing here promises a free table; the
// form only sends a request and says so.
//
// The request is checked on the phone with the SAME function the server uses
// (lib/menu/reservation-form.ts), and the server's own field refusals are
// shown the same way. One send attempt has one key: a retry of the same request
// after a lost answer keeps it, so the venue gets the request once. Every
// word is from the dictionary; the colours are the venue's (`--menu-*`).

import Link from "next/link";
import { ChevronLeft, CircleAlert, Minus, Plus } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type MouseEvent } from "react";
import { fmt } from "@/lib/i18n/format";
import { menuGostSr } from "@/lib/i18n/sr/menu-gost";
import {
  needsEmail,
  needsPhone,
  RESERVATION_EMAIL_MAX,
  RESERVATION_NAME_MAX,
  RESERVATION_NOTE_MAX,
  RESERVATION_PARTY_MAX,
  RESERVATION_PARTY_MIN,
  RESERVATION_PHONE_MAX,
  type ReservationContactMode,
  type ReservationField,
  type ReservationFieldErrors,
} from "@/lib/menu/reservation-form";
import type { WorkingHours } from "@/lib/menu/working-hours";
import { postaviAnalitiku, trackJavni, type JavniAnalitika } from "@/lib/menu/analitika/track";
import { useMinutniSat } from "../../javni/use-minutni-sat";
import {
  gostiTekst,
  opcijeDatuma,
  opcijeVremena,
  pokusajZa,
  POCETNE_VREDNOSTI,
  porukaOdbijanja,
  sastaviUnos,
  type Odbijeno,
  type Pokusaj,
  type PoslatiZahtev,
  type RezervacijaAkcije,
  type VrednostiForme,
} from "./model";
import { RezervacijaPoslato } from "./poslato";
import styles from "./rezervacija.module.css";

const t = menuGostSr.rezervacija;

export type RezervacijaFormaProps = {
  slug: string;
  kontakt: ReservationContactMode;
  radnoVreme: WorkingHours;
  /** The server's instant (read in the loader); the phone moves on minute by minute when `satUzivo`. */
  sadaMs: number;
  akcije: RezervacijaAkcije;
  meniHref: string;
  mojiZahteviHref: string;
  /** The real route: the clock moves on. The izlog keeps its fixed instant. */
  satUzivo?: boolean;
  /** The path shown as the cancel link of a sent request instead of the real link page (the izlog's own page). */
  putanjaLinka?: string;
  /** The izlog's starting state: filled values and a refusal; a guest starts empty. */
  pocetno?: { vrednosti?: Partial<VrednostiForme>; odbijeno?: Odbijeno };
  /** K29: the live route's analytics context (a sent request is a step of the conversion flow); absent in the izlog. */
  analitika?: JavniAnalitika | null;
};

/** The control each field's error and the summary's link point at. */
const POLJE_KONTROLE: Record<ReservationField, string> = {
  guestName: "ime",
  requestedAt: "vreme",
  partySize: "gosti",
  contactEmail: "email",
  contactPhone: "telefon",
  note: "napomena",
};

const OZNAKA_POLJA: Record<ReservationField, string> = {
  guestName: t.ime,
  requestedAt: t.vreme,
  partySize: t.brojGostiju,
  contactEmail: t.email,
  contactPhone: t.telefon,
  note: t.napomena,
};

const REDOSLED_POLJA: readonly ReservationField[] = ["guestName", "requestedAt", "partySize", "contactEmail", "contactPhone", "note"];

function opisi(...ids: (string | false | null | undefined)[]): string | undefined {
  const spisak = ids.filter((id): id is string => typeof id === "string");
  return spisak.length > 0 ? spisak.join(" ") : undefined;
}

export function RezervacijaForma({
  slug,
  kontakt,
  radnoVreme,
  sadaMs,
  akcije,
  meniHref,
  mojiZahteviHref,
  satUzivo = false,
  putanjaLinka,
  pocetno,
  analitika = null,
}: RezervacijaFormaProps) {
  const id = useId();
  const sada = useMinutniSat(sadaMs, satUzivo);
  const [vrednosti, setVrednosti] = useState<VrednostiForme>({ ...POCETNE_VREDNOSTI, ...pocetno?.vrednosti });
  const [greske, setGreske] = useState<ReservationFieldErrors>(pocetno?.odbijeno?.fieldErrors ?? {});
  const [odbijeno, setOdbijeno] = useState<Odbijeno | null>(pocetno?.odbijeno ?? null);
  const [radi, setRadi] = useState(false);
  const [poslato, setPoslato] = useState<PoslatiZahtev | null>(null);
  const [fokusSazetka, setFokusSazetka] = useState(0);
  const pokusaj = useRef<Pokusaj | null>(null);
  const saljeSe = useRef(false);
  const sazetak = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (fokusSazetka > 0) sazetak.current?.focus();
  }, [fokusSazetka]);

  // The days and terms the venue offers right now; a choice that is gone (the day passed) falls away.
  // K34: memoized — they change with the minute clock and the chosen day, not on every keystroke.
  const datumi = useMemo(() => opcijeDatuma(radnoVreme, sada), [radnoVreme, sada]);
  const datum = datumi.some((opcija) => opcija.vrednost === vrednosti.datum) ? vrednosti.datum : (datumi[0]?.vrednost ?? "");
  const termini = useMemo(() => (datum ? opcijeVremena(datum, radnoVreme, sada) : []), [datum, radnoVreme, sada]);
  const vreme = termini.some((opcija) => opcija.vrednost === vrednosti.vreme) ? vrednosti.vreme : "";

  const promeni = (promena: Partial<VrednostiForme>) => setVrednosti((tekuce) => ({ ...tekuce, ...promena }));

  const posalji = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saljeSe.current) return;
    const sadaSlanja = satUzivo ? Date.now() : sadaMs;
    const sastavljeno = sastaviUnos({ ...vrednosti, datum, vreme }, kontakt, radnoVreme, sadaSlanja);
    if (!sastavljeno.ok) {
      setGreske(sastavljeno.fieldErrors);
      setOdbijeno({ ok: false, code: sastavljeno.code, fieldErrors: sastavljeno.fieldErrors });
      setFokusSazetka((n) => n + 1);
      return;
    }
    // The same request again keeps its key (the venue gets it once); a changed one is a new attempt.
    pokusaj.current = pokusajZa(pokusaj.current, sastavljeno.unos);
    saljeSe.current = true;
    setRadi(true);
    setOdbijeno(null);
    setGreske({});
    let ishod: Odbijeno | PoslatiZahtev;
    try {
      ishod = await akcije.posalji(slug, { clientRequestId: pokusaj.current.kljuc, ...sastavljeno.unos });
    } catch {
      ishod = { ok: false, code: "network" };
    }
    saljeSe.current = false;
    setRadi(false);
    if (ishod.ok) {
      pokusaj.current = null;
      setPoslato(ishod);
      if (analitika && !ishod.deduped) {
        postaviAnalitiku(analitika);
        trackJavni({ vrsta: "korak", korak: "rezervacija" });
      }
      return;
    }
    setOdbijeno(ishod);
    setGreske(ishod.fieldErrors ?? {});
    setFokusSazetka((n) => n + 1);
  };

  if (poslato) {
    return (
      <RezervacijaPoslato
        slug={slug}
        poslato={poslato}
        sadaMs={sada}
        meniHref={meniHref}
        mojiZahteviHref={mojiZahteviHref}
        putanjaLinka={putanjaLinka}
      />
    );
  }

  const idPolja = (polje: string) => `${id}-${polje}`;
  const greskaPolja = (polje: ReservationField) => {
    const problem = greske[polje];
    return problem ? t.greskePolja[problem] : null;
  };
  const poljaSaGreskom = REDOSLED_POLJA.filter((polje) => greske[polje] !== undefined);
  const naslovSazetka = odbijeno ? (poljaSaGreskom.length > 0 ? t.greskaForme : porukaOdbijanja(odbijeno.code)) : null;
  const fokusiraj = (polje: ReservationField) => (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    document.getElementById(idPolja(POLJE_KONTROLE[polje]))?.focus();
  };

  const imeGreska = greskaPolja("guestName");
  const vremeGreska = greskaPolja("requestedAt");
  const gostiGreska = greskaPolja("partySize");
  const emailGreska = greskaPolja("contactEmail");
  const telefonGreska = greskaPolja("contactPhone");
  const napomenaGreska = greskaPolja("note");

  const greskaRed = (idGreske: string, tekst: string | null) =>
    tekst ? (
      <p id={idGreske} className={styles.greskaPolja}>
        <CircleAlert aria-hidden="true" className={styles.ikonica} />
        {tekst}
      </p>
    ) : null;

  return (
    <section className={styles.strana} aria-labelledby={idPolja("naslov")} data-rezervacija="">
      <Link href={meniHref} className={styles.nazad}>
        <ChevronLeft aria-hidden="true" className={styles.ikonica} />
        {t.poslato.nazadNaMeni}
      </Link>
      <h2 id={idPolja("naslov")} className={styles.naslov}>
        {t.naslov}
      </h2>
      <div className={styles.uvodBlok}>
        <p className={styles.uvod}>{t.uvod}</p>
        <p className={styles.sitno}>{t.bezStola}</p>
      </div>

      {datumi.length === 0 ? (
        <p className={styles.obavestenje} role="status" data-nema-termina="">
          {t.nemaTermina}
        </p>
      ) : (
        <form className={styles.forma} method="post" noValidate onSubmit={posalji} aria-busy={radi || undefined}>
          {naslovSazetka ? (
            <div ref={sazetak} className={styles.sazetak} role="alert" tabIndex={-1} data-sazetak="">
              <p className={styles.sazetakNaslov}>
                <CircleAlert aria-hidden="true" className={styles.ikonica} />
                {naslovSazetka}
              </p>
              {poljaSaGreskom.length > 0 ? (
                <ul className={styles.sazetakLista}>
                  {poljaSaGreskom.map((polje) => (
                    <li key={polje}>
                      <a href={`#${idPolja(POLJE_KONTROLE[polje])}`} onClick={fokusiraj(polje)}>
                        {OZNAKA_POLJA[polje]}
                      </a>
                      <span>{greskaPolja(polje)}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          <div className={styles.polje}>
            <label htmlFor={idPolja("ime")} className={styles.oznaka}>
              {t.ime}
            </label>
            <input
              id={idPolja("ime")}
              name="ime"
              type="text"
              className={styles.kontrola}
              autoComplete="name"
              placeholder={t.imePrimer}
              maxLength={RESERVATION_NAME_MAX}
              value={vrednosti.ime}
              onChange={(event) => promeni({ ime: event.target.value })}
              aria-required="true"
              aria-invalid={imeGreska ? "true" : undefined}
              aria-describedby={opisi(imeGreska && idPolja("ime-greska"))}
            />
            {greskaRed(idPolja("ime-greska"), imeGreska)}
          </div>

          <div className={styles.dvaPolja}>
            <div className={styles.polje}>
              <label htmlFor={idPolja("datum")} className={styles.oznaka}>
                {t.datum}
              </label>
              <select
                id={idPolja("datum")}
                name="datum"
                className={styles.kontrola}
                value={datum}
                onChange={(event) => promeni({ datum: event.target.value, vreme: "" })}
                aria-required="true"
              >
                {datumi.map((opcija) => (
                  <option key={opcija.vrednost} value={opcija.vrednost}>
                    {opcija.oznaka}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.polje}>
              <label htmlFor={idPolja("vreme")} className={styles.oznaka}>
                {t.vreme}
              </label>
              <select
                id={idPolja("vreme")}
                name="vreme"
                className={styles.kontrola}
                value={vreme}
                onChange={(event) => promeni({ vreme: event.target.value })}
                aria-required="true"
                aria-invalid={vremeGreska ? "true" : undefined}
                aria-describedby={opisi(idPolja("vreme-opis"), vremeGreska && idPolja("vreme-greska"))}
              >
                <option value="" disabled>
                  {t.izaberiVreme}
                </option>
                {termini.map((opcija) => (
                  <option key={opcija.vrednost} value={opcija.vrednost}>
                    {opcija.oznaka}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p id={idPolja("vreme-opis")} className={styles.pomoc}>
            {termini.length === 0 ? t.bezTermina : t.vremeOpis}
          </p>
          {greskaRed(idPolja("vreme-greska"), vremeGreska)}

          <div
            className={styles.polje}
            role="group"
            aria-labelledby={idPolja("gosti-oznaka")}
            aria-describedby={opisi(gostiGreska && idPolja("gosti-greska"))}
          >
            <span id={idPolja("gosti-oznaka")} className={styles.oznaka}>
              {t.brojGostiju}
            </span>
            <div className={styles.koraci}>
              <button
                type="button"
                id={idPolja("gosti")}
                className={styles.korak}
                aria-label={t.manje}
                disabled={vrednosti.gosti <= RESERVATION_PARTY_MIN}
                onClick={() => promeni({ gosti: Math.max(RESERVATION_PARTY_MIN, vrednosti.gosti - 1) })}
              >
                <Minus aria-hidden="true" className={styles.ikonica} />
              </button>
              <output className={styles.vrednost} aria-live="polite">
                {gostiTekst(vrednosti.gosti)}
              </output>
              <button
                type="button"
                className={styles.korak}
                aria-label={t.vise}
                disabled={vrednosti.gosti >= RESERVATION_PARTY_MAX}
                onClick={() => promeni({ gosti: Math.min(RESERVATION_PARTY_MAX, vrednosti.gosti + 1) })}
              >
                <Plus aria-hidden="true" className={styles.ikonica} />
              </button>
            </div>
            {greskaRed(idPolja("gosti-greska"), gostiGreska)}
          </div>

          <p className={`${styles.pomoc} ${styles.pomocUzPolje}`}>{t.kontaktOpis[kontakt]}</p>
          {needsEmail(kontakt) ? (
            <div className={styles.polje}>
              <label htmlFor={idPolja("email")} className={styles.oznaka}>
                {t.email}
              </label>
              <input
                id={idPolja("email")}
                name="email"
                type="email"
                className={styles.kontrola}
                autoComplete="email"
                inputMode="email"
                placeholder={t.emailPrimer}
                maxLength={RESERVATION_EMAIL_MAX}
                value={vrednosti.email}
                onChange={(event) => promeni({ email: event.target.value })}
                aria-required="true"
                aria-invalid={emailGreska ? "true" : undefined}
                aria-describedby={opisi(emailGreska && idPolja("email-greska"))}
              />
              {greskaRed(idPolja("email-greska"), emailGreska)}
            </div>
          ) : null}
          {needsPhone(kontakt) ? (
            <div className={styles.polje}>
              <label htmlFor={idPolja("telefon")} className={styles.oznaka}>
                {t.telefon}
              </label>
              <input
                id={idPolja("telefon")}
                name="telefon"
                type="tel"
                className={styles.kontrola}
                autoComplete="tel"
                inputMode="tel"
                placeholder={t.telefonPrimer}
                maxLength={RESERVATION_PHONE_MAX}
                value={vrednosti.telefon}
                onChange={(event) => promeni({ telefon: event.target.value })}
                aria-required="true"
                aria-invalid={telefonGreska ? "true" : undefined}
                aria-describedby={opisi(telefonGreska && idPolja("telefon-greska"))}
              />
              {greskaRed(idPolja("telefon-greska"), telefonGreska)}
            </div>
          ) : null}

          <div className={styles.polje}>
            <label htmlFor={idPolja("napomena")} className={styles.oznaka}>
              {t.napomena}
              <span className={styles.opciono}>{t.opciono}</span>
            </label>
            <textarea
              id={idPolja("napomena")}
              name="napomena"
              className={styles.kontrola}
              rows={3}
              maxLength={RESERVATION_NOTE_MAX}
              value={vrednosti.napomena}
              onChange={(event) => promeni({ napomena: event.target.value })}
              aria-invalid={napomenaGreska ? "true" : undefined}
              aria-describedby={opisi(idPolja("napomena-opis"), idPolja("napomena-broj"), napomenaGreska && idPolja("napomena-greska"))}
            />
            <p id={idPolja("napomena-opis")} className={styles.pomoc}>
              {t.napomenaOpis}
            </p>
            <p id={idPolja("napomena-broj")} className={styles.pomoc}>
              {fmt(t.napomenaBroj, { n: vrednosti.napomena.length, max: RESERVATION_NOTE_MAX })}
            </p>
            {greskaRed(idPolja("napomena-greska"), napomenaGreska)}
          </div>

          <button type="submit" className={styles.dugme} disabled={radi} aria-busy={radi || undefined}>
            {radi ? t.saljeSe : t.posalji}
          </button>
          <p className={styles.vizuelnoSkriveno} role="status">
            {radi ? t.saljeSe : ""}
          </p>
        </form>
      )}
    </section>
  );
}
