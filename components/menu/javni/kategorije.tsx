"use client";

// ScanMe Menu V1 (K13) — layout `Kategorije` (master §7.1): the page opens on
// a visual choice of category; a category then shows its articles, with a
// clear way back. The chosen category lives in the URL fragment (#k-…): the
// tiles are plain links, the phone's Back button returns to the grid, a link
// to a category can be shared, and it works before JavaScript arrives. Only
// the chosen category is in the DOM, so a large menu stays light.

import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { fmt, srPluralCategory } from "@/lib/i18n/format";
import { menuJavniSr } from "@/lib/i18n/sr/menu-javni";
import {
  kategorijaIzHesa,
  kategorije as karticeKategorija,
  sidroKategorije,
  sledecaKategorija,
} from "@/lib/menu/public-view";
import { ArtikalKartica } from "./artikal";
import { JavniGlif } from "./glif";
import type { LayoutProps } from "./tok";
import styles from "./javni.module.css";

const t = menuJavniSr;

function pretplatiHes(promena: () => void) {
  window.addEventListener("hashchange", promena);
  return () => window.removeEventListener("hashchange", promena);
}

export function Kategorije({
  sekcije,
  slike,
  sadaMs,
  nedostupni,
  onOtvori,
  ugradjen,
  pocetnaKategorija = null,
}: LayoutProps & {
  /** The category open on the server render (the izlog; the URL fragment never reaches the server). */
  pocetnaKategorija?: string | null;
}) {
  const pocetniHes = pocetnaKategorija ? `#${sidroKategorije(pocetnaKategorija)}` : "";
  const hes = useSyncExternalStore(
    ugradjen ? () => () => {} : pretplatiHes,
    () => (ugradjen ? pocetniHes : window.location.hash || pocetniHes),
    () => pocetniHes,
  );
  const izabrana = kategorijaIzHesa(hes, sekcije);
  const sekcija = izabrana ? sekcije.find((row) => row.key === izabrana) ?? null : null;
  const naslovRef = useRef<HTMLHeadingElement>(null);
  const prethodna = useRef<string | null>(izabrana);

  // Entering a category moves the focus to its heading; going back to the grid
  // returns it to the tile of the category just left (WCAG 2.4.3).
  useEffect(() => {
    const bila = prethodna.current;
    if (bila === izabrana) return;
    prethodna.current = izabrana;
    if (izabrana) naslovRef.current?.focus({ preventScroll: false });
    else if (bila) document.querySelector<HTMLElement>(`a[href="#${sidroKategorije(bila)}"]`)?.focus();
  }, [izabrana]);

  const tabIndex = ugradjen ? -1 : undefined;

  if (!sekcija) {
    const kartice = karticeKategorija(sekcije, slike);
    return (
      <div className={styles.kategorije} data-kategorije="mreza">
        <nav aria-label={t.navigacija.kategorije}>
          <ul className={styles.mreza}>
            {kartice.map((kartica) => (
              <li key={kartica.key}>
                <a className={styles.plocica} href={`#${sidroKategorije(kartica.key)}`} tabIndex={tabIndex}>
                  <span className={styles.medij} aria-hidden="true">
                    {kartica.slika ? (
                      <Image src={kartica.slika.thumbUrl} alt="" width={360} height={270} loading="lazy" unoptimized />
                    ) : (
                      <JavniGlif iconKey={kartica.iconKey} className={styles.glif} />
                    )}
                  </span>
                  <span className={`${styles.naslov} ${styles.plocicaNaziv}`}>{kartica.naziv}</span>
                  <span className={styles.plocicaBroj}>
                    {fmt(t.kategorije.artikli[srPluralCategory(kartica.broj)], { n: kartica.broj })}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    );
  }

  const sledeca = sledecaKategorija(sekcije, sekcija.key);
  const prikazane = sekcije.filter((row) => row.articles.length > 0);
  return (
    <div className={styles.kategorije} data-kategorije="kategorija">
      <section className={styles.kategorija} aria-labelledby="javni-kategorija-naslov">
        <nav aria-label={t.navigacija.kategorije} className={styles.kategorijeIndeks}>
          <ul className={styles.trakaLista}>
            {prikazane.map((row) => (
              <li key={row.key}>
                <a
                  href={`#${sidroKategorije(row.key)}`}
                  className={styles.cip}
                  aria-current={row.key === sekcija.key ? "true" : undefined}
                  tabIndex={tabIndex}
                >
                  {row.name}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className={styles.kategorijaZaglavlje}>
          <a className={styles.kategorijaNazad} href="#" tabIndex={tabIndex}>
            <ChevronLeft aria-hidden="true" className={styles.ikonicaLinka} />
            {t.navigacija.sveKategorije}
          </a>
          <h2
            id="javni-kategorija-naslov"
            ref={naslovRef}
            tabIndex={-1}
            className={`${styles.naslov} ${styles.kategorijaNaslov}`}
          >
            {sekcija.name}
          </h2>
          {sekcija.description ? <p className={styles.sekcijaOpis}>{sekcija.description}</p> : null}
        </div>
        <div>
          <ul className={styles.kartice}>
            {sekcija.articles.map((article) => (
              <ArtikalKartica
                key={article.key}
                article={article}
                layout="categories"
                slike={slike}
                sadaMs={sadaMs}
                nedostupan={nedostupni.has(article.key)}
                sekcijaIkonica={sekcija.iconKey}
                onOtvori={onOtvori}
              />
            ))}
          </ul>
          <p className={styles.sledeca}>
            <a className={styles.kategorijaNazad} href="#" tabIndex={tabIndex}>
              <ChevronLeft aria-hidden="true" className={styles.ikonicaLinka} />
              {t.navigacija.sveKategorije}
            </a>
            {sledeca ? (
              <a className={styles.sledecaLink} href={`#${sidroKategorije(sledeca.key)}`} tabIndex={tabIndex}>
                {fmt(t.navigacija.sledeca, { naziv: sledeca.name })}
                <ChevronRight aria-hidden="true" className={styles.ikonicaLinka} />
              </a>
            ) : null}
          </p>
        </div>
      </section>
    </div>
  );
}
