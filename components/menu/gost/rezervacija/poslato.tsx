"use client";

// ScanMe Menu V1 (K25) — what the guest sees right after the request was sent
// (master §11.2, §11.7). It says plainly that the request was SENT and that
// the venue will answer — never that a table is free or reserved. The cancel
// link is shown once, here, as a full address built on the phone (the server
// only hands over the token); it stays visible as text so the guest can copy
// it by hand if the button cannot. The result of copying is announced.

import Link from "next/link";
import { CalendarCheck, Copy } from "lucide-react";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { menuGostSr } from "@/lib/i18n/sr/menu-gost";
import { reservationLinkPath } from "@/lib/menu/http/reservation";
import { gostiTekst, terminTekst, type PoslatiZahtev } from "./model";
import styles from "./rezervacija.module.css";

const t = menuGostSr.rezervacija;

const bezPretplate = () => () => {};
/** The address of this site as the browser knows it; empty on the server (the path shows until then). */
const poreklo = () => window.location.origin;
const bezPorekla = () => "";

export function RezervacijaPoslato({
  slug,
  poslato,
  sadaMs,
  meniHref,
  mojiZahteviHref,
  putanjaLinka,
}: {
  slug: string;
  poslato: PoslatiZahtev;
  sadaMs: number;
  meniHref: string;
  mojiZahteviHref: string;
  /** The path shown as the cancel link instead of the real link page of this venue (the izlog's own page). */
  putanjaLinka?: string;
}) {
  const id = useId();
  const naslov = useRef<HTMLHeadingElement>(null);
  const polje = useRef<HTMLInputElement>(null);
  const origin = useSyncExternalStore(bezPretplate, poreklo, bezPorekla);
  const [poruka, setPoruka] = useState<{ greska: boolean; tekst: string } | null>(null);
  const putanja = putanjaLinka ?? reservationLinkPath(slug, poslato.cancelToken);
  const link = `${origin}${putanja}`;

  // The confirmation takes the reading position, so a screen reader starts at "Zahtev je poslat".
  useEffect(() => {
    naslov.current?.focus();
  }, []);

  const kopiraj = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setPoruka({ greska: false, tekst: t.poslato.kopirano });
    } catch {
      // No clipboard (an insecure page, a refusal): the link is selected, so a long press copies it.
      polje.current?.select();
      setPoruka({ greska: true, tekst: t.poslato.kopiranjeNeuspelo });
    }
  };

  return (
    <section className={styles.strana} aria-labelledby={`${id}-naslov`} data-rezervacija-poslato="">
      <span className={styles.potvrdaZnak}>
        <CalendarCheck aria-hidden="true" className={styles.ikonicaVelika} />
      </span>
      <h2 id={`${id}-naslov`} ref={naslov} tabIndex={-1} className={styles.naslov}>
        {t.poslato.naslov}
      </h2>
      <div className={styles.uvodBlok}>
        <p className={styles.uvod}>{t.poslato.opis}</p>
        <p className={styles.napomenaJaka}>{t.poslato.nijePotvrda}</p>
        {poslato.deduped ? (
          <p className={styles.obavestenje} role="status">
            {t.poslato.ponovljeno}
          </p>
        ) : null}
      </div>

      <dl className={styles.pojedinosti}>
        <div>
          <dt>{t.link.termin}</dt>
          <dd>{terminTekst(poslato.requestedAt, sadaMs)}</dd>
        </div>
        <div>
          <dt>{t.link.gosti}</dt>
          <dd>{gostiTekst(poslato.partySize)}</dd>
        </div>
      </dl>

      <div className={styles.linkKutija}>
        <h3 id={`${id}-link-naslov`} className={styles.podnaslov}>
          {t.poslato.linkNaslov}
        </h3>
        <p className={styles.pomoc}>{t.poslato.linkOpis}</p>
        <input
          ref={polje}
          type="text"
          readOnly
          className={styles.kontrola}
          value={link}
          aria-labelledby={`${id}-link-naslov`}
          spellCheck={false}
          autoCapitalize="off"
          onFocus={(event) => event.currentTarget.select()}
          data-link-otkazivanja=""
        />
        <button type="button" className={styles.dugmeSporedno} onClick={kopiraj}>
          <Copy aria-hidden="true" className={styles.ikonica} />
          {t.poslato.kopiraj}
        </button>
        <p className={poruka?.greska ? styles.greskaPolja : styles.pomoc} role="status" aria-live="polite">
          {poruka?.tekst ?? ""}
        </p>
      </div>

      <div className={styles.radnje}>
        <Link href={mojiZahteviHref} className={styles.dugme}>
          {t.poslato.mojiZahtevi}
        </Link>
        <Link href={meniHref} className={styles.dugmeSporedno}>
          {t.poslato.nazadNaMeni}
        </Link>
      </div>
    </section>
  );
}
