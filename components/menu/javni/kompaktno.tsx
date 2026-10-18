"use client";

// ScanMe Menu V1 (K13) — layout `Kompaktno` (master §7.1, §15.2, §21.3): calm
// text for prestige restaurants, wine lists and large menus. No image and no
// icon, ever (the article rows never receive media); no cards, no shadows.
// Names lead to the price with a dotted leader. A thin sticky bar names the
// current section and opens the contents at every width; a short menu (up to
// MENU_KRATAK_SADRZAJ sections) also shows them as a line of links from 768 px.

import { List } from "lucide-react";
import { useRef } from "react";
import { menuJavniSr } from "@/lib/i18n/sr/menu-javni";
import { imaDetalj, sidroSekcije } from "@/lib/menu/public-view";
import { KompaktnaStavka } from "./artikal";
import type { LayoutProps } from "./tok";
import { useAktivnaSekcija } from "./use-aktivna-sekcija";
import styles from "./javni.module.css";

const t = menuJavniSr;

/** Up to this many sections the contents also show inline (a long index would push the menu off the first screen). */
export const MENU_KRATAK_SADRZAJ = 8;

export function Kompaktno({
  sekcije,
  sadaMs,
  nedostupni,
  onOtvori,
  ugradjen,
  alergeniUkljuceni,
}: Omit<LayoutProps, "slike"> & { alergeniUkljuceni: boolean }) {
  const ids = sekcije.map((sekcija) => sidroSekcije(sekcija.key));
  const aktivna = useAktivnaSekcija(ugradjen ? [] : ids, ids[0] ?? null);
  const sadrzajRef = useRef<HTMLDialogElement>(null);
  const tekuca = sekcije.find((sekcija) => sidroSekcije(sekcija.key) === aktivna) ?? sekcije[0];
  const tabIndex = ugradjen ? -1 : undefined;

  const indeks = (
    <ul className={styles.indeksLista}>
      {sekcije.map((sekcija) => (
        <li key={sekcija.key}>
          <a
            className={styles.indeksLink}
            href={`#${sidroSekcije(sekcija.key)}`}
            tabIndex={tabIndex}
            onClick={() => sadrzajRef.current?.close()}
          >
            {sekcija.name}
          </a>
        </li>
      ))}
    </ul>
  );

  return (
    <>
      {sekcije.length > 1 ? (
        <>
          <div className={styles.kompaktnoTraka}>
            <span className={styles.kompaktnoTekuca} aria-hidden="true">
              {tekuca?.name}
            </span>
            <button
              type="button"
              className={styles.sadrzajDugme}
              aria-haspopup="dialog"
              aria-label={t.navigacija.otvoriSadrzaj}
              tabIndex={tabIndex}
              onClick={() => sadrzajRef.current?.showModal()}
            >
              <List aria-hidden="true" className={styles.ikonicaLinka} />
              {t.navigacija.sadrzaj}
            </button>
          </div>
          {ugradjen ? null : (
            <dialog ref={sadrzajRef} className={styles.detalj} aria-labelledby="javni-sadrzaj-naslov">
              <div className={styles.detaljTelo}>
                <h2 id="javni-sadrzaj-naslov" className={`${styles.naslov} ${styles.stanjeNaslov}`}>
                  {t.stanja.sadrzajNaslov}
                </h2>
                <nav aria-label={t.navigacija.sekcije}>{indeks}</nav>
                <form method="dialog">
                  <button type="submit" className={styles.sadrzajDugme}>
                    {menuJavniSr.detalj.zatvori}
                  </button>
                </form>
              </div>
            </dialog>
          )}
          {sekcije.length <= MENU_KRATAK_SADRZAJ ? (
            <nav aria-label={t.navigacija.sekcije} className={`${styles.kompaktno} ${styles.indeks}`}>
              {indeks}
            </nav>
          ) : null}
        </>
      ) : null}
      <div className={styles.kompaktno} data-kompaktno="">
        {sekcije.map((sekcija) => (
          <section
            key={sekcija.key}
            id={sidroSekcije(sekcija.key)}
            className={styles.kSekcija}
            aria-labelledby={`${sidroSekcije(sekcija.key)}-naslov`}
          >
            <h2 id={`${sidroSekcije(sekcija.key)}-naslov`} className={`${styles.naslov} ${styles.kSekcijaNaslov}`}>
              {sekcija.name}
            </h2>
            {sekcija.description ? <p className={styles.kSekcijaOpis}>{sekcija.description}</p> : null}
            <ul className={styles.kLista}>
              {sekcija.articles.map((article) => (
                <KompaktnaStavka
                  key={article.key}
                  article={article}
                  sadaMs={sadaMs}
                  nedostupan={nedostupni.has(article.key)}
                  onOtvori={onOtvori && imaDetalj(article, "compact", alergeniUkljuceni) ? onOtvori : null}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
