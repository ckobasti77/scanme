// ScanMe Menu V1 (K25) — the page behind a reservation's cancel link (master
// §11.7; plan docs/meni/planovi/K24.md K24-6): the term, the guests and the
// status in the guest's words, a change the venue proposed, and the way to
// cancel — until the reservation is realized. A server component with no
// client JavaScript: the cancel is a form posting to a Server Action, and the
// confirmation is a second page state (`?potvrda=1`), so it works without
// JavaScript too. A wrong link shows nothing about any reservation.

import Link from "next/link";
import { CalendarClock, ChevronLeft, CircleAlert, CircleCheck } from "lucide-react";
import type { ReservationLinkView } from "@/convex/menuReservations";
import { fmt } from "@/lib/i18n/format";
import { menuGostSr } from "@/lib/i18n/sr/menu-gost";
import { gostiTekst, porukaOdbijanja, terminTekst } from "./model";
import { StatusRezervacije } from "./status";
import styles from "./rezervacija.module.css";

const t = menuGostSr.rezervacija;

export type LinkOtkazivanjaProps = {
  /** The reservation behind the link; null = the link is not valid (nothing else is known). */
  pogled: ReservationLinkView | null;
  sadaMs: number;
  /** The confirmation step is open (`?potvrda=1`). */
  potvrda: boolean;
  /** Back from a cancel (`?otkazano=1`): said only when the reservation really is cancelled. */
  otkazano: boolean;
  /** The refusal of a cancel that did not go through (`?neuspelo=<code>`), already validated. */
  neuspelo: Parameters<typeof porukaOdbijanja>[0] | null;
  /** The Server Action bound to this venue and token; the confirmation's form posts to it. */
  otkazi?: () => Promise<void>;
  /** The link to the confirmation step. */
  potvrdaHref: string;
  /** The link back to this page without a step. */
  linkHref: string;
  meniHref: string;
};

export function LinkOtkazivanja({ pogled, sadaMs, potvrda, otkazano, neuspelo, otkazi, potvrdaHref, linkHref, meniHref }: LinkOtkazivanjaProps) {
  if (!pogled) {
    return (
      <section className={styles.strana} aria-labelledby="rezervacija-link-naslov" data-rezervacija-link="nevazeci">
        <h2 id="rezervacija-link-naslov" className={styles.naslov}>
          {t.link.nevazeciNaslov}
        </h2>
        <p className={styles.uvod}>{t.link.nevazeciOpis}</p>
        <div className={styles.radnje}>
          <Link href={meniHref} className={styles.dugmeSporedno}>
            {t.link.nazadNaMeni}
          </Link>
        </div>
      </section>
    );
  }

  const otkazana = pogled.status === "cancelled";
  return (
    <section className={styles.strana} aria-labelledby="rezervacija-link-naslov" data-rezervacija-link={pogled.status}>
      <h2 id="rezervacija-link-naslov" className={styles.naslov}>
        {t.link.naslov}
      </h2>

      {otkazano && otkazana ? (
        <p className={styles.uspeh} role="status" data-otkazano="">
          <CircleCheck aria-hidden="true" className={styles.ikonica} />
          {t.link.otkazano}
        </p>
      ) : null}
      {neuspelo ? (
        <p className={styles.sazetakNaslov} role="alert" data-neuspelo="">
          <CircleAlert aria-hidden="true" className={styles.ikonica} />
          {porukaOdbijanja(neuspelo)}
        </p>
      ) : null}

      <dl className={styles.pojedinosti}>
        <div>
          <dt>{t.link.termin}</dt>
          <dd>{terminTekst(pogled.requestedAt, sadaMs)}</dd>
        </div>
        <div>
          <dt>{t.link.gosti}</dt>
          <dd>{gostiTekst(pogled.partySize)}</dd>
        </div>
        <div>
          <dt>{t.link.status}</dt>
          <dd>
            <StatusRezervacije status={pogled.status} />
          </dd>
        </div>
      </dl>

      {pogled.status === "change_proposed" ? (
        <div className={styles.predlog} data-predlog="">
          {pogled.proposedAt !== null ? (
            <p className={styles.predlogNaslov}>
              <CalendarClock aria-hidden="true" className={styles.ikonica} />
              {fmt(t.link.predlog, { termin: terminTekst(pogled.proposedAt, sadaMs) })}
            </p>
          ) : null}
          {pogled.proposalNote ? <p>{fmt(t.link.predlogPoruka, { poruka: pogled.proposalNote })}</p> : null}
          <p className={styles.pomoc}>{t.link.predlogUputstvo}</p>
        </div>
      ) : null}

      {pogled.canCancel ? (
        potvrda && otkazi ? (
          <form action={otkazi} className={styles.potvrdaOkvir} aria-labelledby="rezervacija-otkazi-pitanje">
            <p id="rezervacija-otkazi-pitanje" className={styles.podnaslov}>
              {t.link.otkaziPitanje}
            </p>
            <p className={styles.pomoc}>{t.link.otkaziOpis}</p>
            <div className={styles.radnje}>
              <button type="submit" className={styles.dugme} data-otkazi-potvrda="">
                {t.link.otkaziDa}
              </button>
              <Link href={linkHref} className={styles.dugmeSporedno} prefetch={false}>
                {t.link.otkaziNe}
              </Link>
            </div>
          </form>
        ) : (
          <div className={styles.radnje}>
            <Link href={potvrdaHref} className={styles.dugmeSporedno} prefetch={false} data-otkazi="">
              {t.link.otkazi}
            </Link>
          </div>
        )
      ) : otkazana ? null : (
        <p className={styles.pomoc}>{t.link.nemozeOtkazati}</p>
      )}

      <Link href={meniHref} className={styles.nazad}>
        <ChevronLeft aria-hidden="true" className={styles.ikonica} />
        {t.link.nazadNaMeni}
      </Link>
    </section>
  );
}
