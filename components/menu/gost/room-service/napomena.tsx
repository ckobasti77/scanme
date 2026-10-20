// ScanMe Menu V1 (K21) — the short note on the Room service page (master §5.3,
// §21.4): these prices are Room service prices, the delivery fee is added
// once per order, and — for anyone who is not in a room — that Room service
// is ordered from the room by scanning its QR code. Plus the honest state when
// Room service is not live. Server components, no client JavaScript.

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { fmt } from "@/lib/i18n/format";
import { menuGostSr } from "@/lib/i18n/sr/menu-gost";
import { formatRsd } from "../../menu-view";
import styles from "../gost.module.css";

const t = menuGostSr.roomService;

export function RoomServiceNapomena({
  dostavaRsd,
  izSobe,
  meniHref,
}: {
  dostavaRsd: number | null;
  /** The guest is not in a room that may order (show how Room service is ordered). */
  izSobe: boolean;
  meniHref: string;
}) {
  return (
    <div className={styles.napomenaRs} data-rs-napomena="">
      <Link href={meniHref} className={styles.nazad}>
        <ChevronLeft aria-hidden="true" className={styles.ikonica} />
        {menuGostSr.zahtevi.nazad}
      </Link>
      <h2 className={styles.listNaslov}>{t.naslov}</h2>
      <p>
        {t.cene}
        {dostavaRsd ? <> {fmt(t.dostava, { iznos: formatRsd(dostavaRsd) })}</> : null}
      </p>
      {izSobe ? <p>{t.izSobe}</p> : null}
    </div>
  );
}

export function RoomServiceNedostupan({ meniHref }: { meniHref: string }) {
  return (
    <section className={styles.zahtevi} data-stanje="rs-nedostupan">
      <h2 className={styles.listNaslov}>{t.nedostupanNaslov}</h2>
      <p className={styles.zahteviUvod}>{t.nedostupanOpis}</p>
      <div>
        <Link href={meniHref} className={styles.dugmeSporedno}>
          {menuGostSr.zahtevi.otvoriMeni}
        </Link>
      </div>
    </section>
  );
}
