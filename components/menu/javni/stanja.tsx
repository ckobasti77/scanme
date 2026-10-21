// ScanMe Menu V1 (K13) — the honest states of the public menu (plan K12-13,
// K12-14): an empty page, a page that is not available, a menu taken down
// while a guest has it open, and a calm note that a newer version exists.

import Link from "next/link";
import { menuJavniSr } from "@/lib/i18n/sr/menu-javni";
import styles from "./javni.module.css";

const t = menuJavniSr;

export function PraznaStranica({ meniHref }: { meniHref: string | null }) {
  return (
    <section className={styles.stanje} data-stanje="prazno">
      <h2 className={`${styles.naslov} ${styles.stanjeNaslov}`}>{t.stanja.praznoNaslov}</h2>
      <p className={styles.stanjeOpis}>{t.stanja.praznoOpis}</p>
      {meniHref ? null : <p className={styles.stanjeOpis}>{t.stanja.praznoPitajte}</p>}
      {meniHref ? (
        <Link className={styles.stanjeLink} href={meniHref}>
          {t.stanja.otvoriMeni}
        </Link>
      ) : null}
    </section>
  );
}

export function PrazanMeni() {
  return (
    <section className={styles.stanje} data-stanje="prazan-meni">
      <h2 className={`${styles.naslov} ${styles.stanjeNaslov}`}>{t.stanja.praznoMeniNaslov}</h2>
      <p className={styles.stanjeOpis}>{t.stanja.praznoMeniOpis}</p>
      <p className={styles.stanjeOpis}>{t.stanja.praznoPitajte}</p>
    </section>
  );
}

export function StranicaNedostupna({ meniHref }: { meniHref: string }) {
  return (
    <section className={styles.stanje} data-stanje="nedostupna">
      <h2 className={`${styles.naslov} ${styles.stanjeNaslov}`}>{t.stanja.nedostupnaNaslov}</h2>
      <p className={styles.stanjeOpis}>{t.stanja.nedostupnaOpis}</p>
      <Link className={styles.stanjeLink} href={meniHref}>
        {t.stanja.otvoriMeni}
      </Link>
    </section>
  );
}

export function MeniNijeDostupan() {
  return (
    <section className={styles.stanje} data-stanje="nije-dostupan" role="status">
      <h2 className={`${styles.naslov} ${styles.stanjeNaslov}`}>{t.stanja.nijeDostupanNaslov}</h2>
      <p className={styles.stanjeOpis}>{t.stanja.nijeDostupanOpis}</p>
    </section>
  );
}

export function NovaVerzija({ onPrikazi }: { onPrikazi: () => void }) {
  return (
    <div className={styles.novaVerzija} role="status">
      <span>{t.stanja.novaVerzija}</span>
      <button type="button" className={styles.novaVerzijaDugme} onClick={onPrikazi}>
        {t.stanja.prikaziNovu}
      </button>
    </div>
  );
}
