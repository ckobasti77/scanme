"use client";

// ScanMe Menu V1 (K13) — layout `Tok` (master §7.1): the whole page as one
// continuous menu, with sticky anchor navigation to the sections. On a phone
// the navigation is a scrolling bar of section names at the top; from 1024 px
// the same list is a sticky index beside the reading column (one DOM, two
// arrangements). Sections render lazily (content-visibility) for long menus.

import { useEffect, useRef } from "react";
import { menuJavniSr } from "@/lib/i18n/sr/menu-javni";
import { izborMedija, sidroSekcije, type PublicImage } from "@/lib/menu/public-view";
import type { PublicSection } from "@/lib/menu/snapshot";
import { ArtikalRed } from "./artikal";
import { useAktivnaSekcija } from "./use-aktivna-sekcija";
import styles from "./javni.module.css";

const t = menuJavniSr;

export type LayoutProps = {
  sekcije: readonly PublicSection[];
  slike: Readonly<Record<string, PublicImage>>;
  sadaMs: number;
  nedostupni: ReadonlySet<string>;
  onOtvori: ((key: string) => void) | null;
  ugradjen: boolean;
};

/** The media column of a section: photos when any row has one, else icons when any has one. */
function vrstaMedija(sekcija: PublicSection, slike: Readonly<Record<string, PublicImage>>) {
  let ikonica = false;
  for (const article of sekcija.articles) {
    const vrsta = izborMedija(article, "flow", slike, sekcija.iconKey).vrsta;
    if (vrsta === "slika") return "slika";
    if (vrsta === "ikonica") ikonica = true;
  }
  return ikonica ? "ikonica" : undefined;
}

export function Tok({ sekcije, slike, sadaMs, nedostupni, onOtvori, ugradjen }: LayoutProps) {
  const ids = sekcije.map((sekcija) => sidroSekcije(sekcija.key));
  const aktivna = useAktivnaSekcija(ugradjen ? [] : ids, ids[0] ?? null);
  const listaRef = useRef<HTMLUListElement>(null);

  // Keep the active chip in view inside the scrolling bar (phones only: the
  // bar scrolls sideways; never scrolls the page itself).
  useEffect(() => {
    const lista = listaRef.current;
    if (!lista || !aktivna || lista.scrollWidth <= lista.clientWidth) return;
    const cip = lista.querySelector<HTMLElement>(`a[href="#${aktivna}"]`);
    if (!cip) return;
    const cilj = cip.offsetLeft - (lista.clientWidth - cip.offsetWidth) / 2;
    lista.scrollTo({ left: Math.max(0, cilj) });
  }, [aktivna]);

  return (
    <div className={styles.tok} data-tok="">
      {sekcije.length > 1 ? (
        <nav aria-label={t.navigacija.sekcije} className={styles.traka}>
          <ul ref={listaRef} className={styles.trakaLista}>
            {sekcije.map((sekcija) => {
              const id = sidroSekcije(sekcija.key);
              return (
                <li key={sekcija.key}>
                  <a
                    href={`#${id}`}
                    className={styles.cip}
                    aria-current={aktivna === id ? "true" : undefined}
                    tabIndex={ugradjen ? -1 : undefined}
                  >
                    {sekcija.name}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>
      ) : (
        <div />
      )}
      <div className={styles.sekcije}>
        {sekcije.map((sekcija) => (
          <section
            key={sekcija.key}
            id={sidroSekcije(sekcija.key)}
            className={styles.sekcija}
            aria-labelledby={`${sidroSekcije(sekcija.key)}-naslov`}
          >
            <h2 id={`${sidroSekcije(sekcija.key)}-naslov`} className={`${styles.naslov} ${styles.sekcijaNaslov}`}>
              {sekcija.name}
            </h2>
            {sekcija.description ? <p className={styles.sekcijaOpis}>{sekcija.description}</p> : null}
            <ul className={styles.lista} data-ima-medij={vrstaMedija(sekcija, slike)}>
              {sekcija.articles.map((article) => (
                <ArtikalRed
                  key={article.key}
                  article={article}
                  layout="flow"
                  slike={slike}
                  sadaMs={sadaMs}
                  nedostupan={nedostupni.has(article.key)}
                  sekcijaIkonica={sekcija.iconKey}
                  onOtvori={onOtvori}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
