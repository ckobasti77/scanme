// ScanMe Menu V1 (K25) — the way into reservations from the public menu
// (master §11.1, §11.2): one calm card above the footer, in the venue's own
// palette. A venue with the ScanMe form links to the form page; a venue with
// its own system links straight to it (same tab); a venue without reservations
// shows nothing. A server component with no client JavaScript — the plain menu
// link must stay as light as it was (the K14 JS budget).

import Link from "next/link";
import { ArrowUpRight, CalendarClock, ChevronRight } from "lucide-react";
import { fmt } from "@/lib/i18n/format";
import { menuGostSr } from "@/lib/i18n/sr/menu-gost";
import { normalizeExternalReservationUrl } from "@/lib/menu/external-url";
import type { PublicReservationEntry } from "@/lib/menu/reservation-config";
import styles from "./ulaz.module.css";

const t = menuGostSr.rezervacija;

export function UlazRezervacije({
  ulaz,
  lokal,
  href,
}: {
  ulaz: PublicReservationEntry;
  /** The venue's name (the venue's own system is named after it). */
  lokal: string;
  /** The form page of this venue (`/{slug}/meni/rezervacija`), with the guest's language. */
  href: string;
}) {
  if (ulaz.mode === "off") return null;

  if (ulaz.mode === "external") {
    const adresa = normalizeExternalReservationUrl(ulaz.url);
    if (!adresa) return null;
    return (
      <div className={styles.ulaz} data-rezervacija-ulaz="external">
        <a href={adresa} rel="noopener noreferrer" className={styles.ulazLink} aria-label={t.ulazEksterniCitac}>
          <CalendarClock aria-hidden="true" className={styles.ulazIkona} />
          <span className={styles.ulazTekst}>
            <span className={styles.ulazNaslov}>{t.ulaz}</span>
            <span className={styles.ulazOpis}>{fmt(t.eksterni.opis, { lokal })}</span>
          </span>
          <ArrowUpRight aria-hidden="true" className={styles.ulazStrelica} />
        </a>
      </div>
    );
  }

  return (
    <div className={styles.ulaz} data-rezervacija-ulaz="form">
      <Link href={href} className={styles.ulazLink}>
        <CalendarClock aria-hidden="true" className={styles.ulazIkona} />
        <span className={styles.ulazTekst}>
          <span className={styles.ulazNaslov}>{t.ulaz}</span>
          <span className={styles.ulazOpis}>{t.ulazOpis}</span>
        </span>
        <ChevronRight aria-hidden="true" className={styles.ulazStrelica} />
      </Link>
    </div>
  );
}
