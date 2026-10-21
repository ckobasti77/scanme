// ScanMe Menu V1 (K25) — the page of a venue that takes reservations through
// its own system (master §11.6): ScanMe only links to it and stores nothing of
// it. A plain link in the same tab; only an https address without credentials
// is ever written into a page (lib/menu/external-url.ts). A server component.

import Link from "next/link";
import { ArrowUpRight, ChevronLeft } from "lucide-react";
import { fmt } from "@/lib/i18n/format";
import { menuGostSr } from "@/lib/i18n/sr/menu-gost";
import { normalizeExternalReservationUrl } from "@/lib/menu/external-url";
import styles from "./rezervacija.module.css";

const t = menuGostSr.rezervacija;

export function RezervacijaEksterni({ lokal, url, meniHref }: { lokal: string; url: string; meniHref: string }) {
  const adresa = normalizeExternalReservationUrl(url);
  return (
    <section className={styles.strana} aria-labelledby="rezervacija-eksterni-naslov" data-rezervacija-eksterni="">
      <Link href={meniHref} className={styles.nazad}>
        <ChevronLeft aria-hidden="true" className={styles.ikonica} />
        {t.poslato.nazadNaMeni}
      </Link>
      <h2 id="rezervacija-eksterni-naslov" className={styles.naslov}>
        {t.eksterni.naslov}
      </h2>
      <p className={styles.uvod}>{fmt(t.eksterni.opis, { lokal })}</p>
      {adresa ? (
        <div className={styles.radnje}>
          <a href={adresa} rel="noopener noreferrer" className={styles.dugme}>
            {t.eksterni.dugme}
            <ArrowUpRight aria-hidden="true" className={styles.ikonica} />
          </a>
        </div>
      ) : null}
    </section>
  );
}
