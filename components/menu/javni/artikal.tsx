// ScanMe Menu V1 (K13) — the parts of an article on the public menu: media,
// price, badges, "Privremeno nedostupno", and the three row shapes (Tok row,
// Kategorije card, Kompaktno line). Presentational; the rules are in
// lib/menu/public-view.ts. The price is the signature (MENU-UX §1.2): whole
// dinars with a thousands dot, tabular figures, on one right edge, never wrapped.

import Image from "next/image";
import { CircleSlash } from "lucide-react";
import { menuDomenSr } from "@/lib/i18n/sr/menu-domen";
import { menuJavniSr } from "@/lib/i18n/sr/menu-javni";
import {
  cenaPrikaz,
  izborMedija,
  kolicinaTekst,
  oznakeArtikla,
  sidroArtikla,
  type CenaPrikaz,
  type IzborMedija,
  type PublicImage,
} from "@/lib/menu/public-view";
import type { MenuLayout } from "@/lib/menu/presentation";
import type { PublicArticle } from "@/lib/menu/snapshot";
import { formatRsd } from "../menu-view";
import { Upozorenje } from "./alergeni";
import { JavniGlif } from "./glif";
import { EurIznos } from "./jezik-valuta";
import { useUpozorenje } from "./kontekst";
import styles from "./javni.module.css";

const t = menuJavniSr;

// -----------------------------------------------------------------------------
// Media
// -----------------------------------------------------------------------------

export function Medij({
  izbor,
  px,
  rezerva = null,
  className,
}: {
  izbor: IzborMedija;
  px: number;
  /** The section's icon, when the article's own key is not in the icon set. */
  rezerva?: string | null;
  className?: string;
}) {
  if (izbor.vrsta === "bez") return null;
  return (
    <span className={className ? `${styles.medij} ${className}` : styles.medij} aria-hidden="true">
      {izbor.vrsta === "slika" ? (
        <Image src={izbor.slika.thumbUrl} alt="" width={px * 2} height={px * 2} loading="lazy" unoptimized />
      ) : (
        <JavniGlif iconKey={izbor.iconKey} rezerva={rezerva} className={styles.glif} />
      )}
    </span>
  );
}

// -----------------------------------------------------------------------------
// Price
// -----------------------------------------------------------------------------

// The amount as plain text plus a small "RSD": the fewest elements a 400-article
// page can carry. A promotion adds the struck regular price, named for screen readers.
function Iznos({ rsd, akcijska }: { rsd: number; akcijska: number | null }) {
  return (
    <>
      {akcijska !== null ? (
        <del className={styles.redovna}>
          <span className={styles.vizuelnoSkriveno}>{t.artikal.redovnaCena} </span>
          {formatRsd(rsd)}
        </del>
      ) : null}
      {akcijska !== null ? <span className={styles.vizuelnoSkriveno}>{t.artikal.akcijskaCena} </span> : null}
      {formatRsd(akcijska ?? rsd)}
      <span className={styles.valuta}>{t.valuta.rsd}</span>
      <EurIznos rsd={akcijska ?? rsd} />
    </>
  );
}

/** The price column: one line for a base price, one line per variant. */
export function Cena({ cena, className }: { cena: CenaPrikaz; className?: string }) {
  if (cena.vrsta === "bez") return null;
  const klasa = className ? `${styles.cena} ${className}` : styles.cena;
  if (cena.vrsta === "osnovna") {
    return (
      <p className={klasa}>
        <Iznos rsd={cena.rsd} akcijska={cena.akcijska} />
      </p>
    );
  }
  return (
    <ul className={`${klasa} ${styles.cenaLista}`}>
      {cena.stavke.map((stavka) => (
        <li key={stavka.key} className={styles.cenaStavka}>
          <span className={styles.cenaOznaka}>{stavka.naziv}</span>
          <span>
            <Iznos rsd={stavka.rsd} akcijska={stavka.akcijska} />
          </span>
        </li>
      ))}
    </ul>
  );
}

// -----------------------------------------------------------------------------
// Badges and the live state
// -----------------------------------------------------------------------------

export function Oznake({ article, sadaMs }: { article: PublicArticle; sadaMs: number }) {
  const oznake = oznakeArtikla(article, sadaMs);
  if (oznake.length === 0) return null;
  return (
    <ul className={styles.oznake}>
      {oznake.map((oznaka) =>
        oznaka.vrsta === "akcija" ? (
          <li key="akcija" className={`${styles.oznaka} ${styles.oznakaAkcija}`}>
            {menuDomenSr.promoLabels.promo}
          </li>
        ) : (
          <li
            key={oznaka.kod}
            className={oznaka.kod === "recommended" ? `${styles.oznaka} ${styles.oznakaIstaknuta}` : styles.oznaka}
          >
            {menuDomenSr.tags[oznaka.kod as keyof typeof menuDomenSr.tags] ?? oznaka.kod}
          </li>
        ),
      )}
    </ul>
  );
}

/** "Privremeno nedostupno" in words; `Kompaktno` shows no icon at all, so there it is text only. */
export function Nedostupno({ bezIkonice = false }: { bezIkonice?: boolean }) {
  return (
    <p className={styles.nedostupno}>
      {bezIkonice ? null : <CircleSlash aria-hidden="true" className={styles.nedostupnoIkonica} />}
      {menuDomenSr.unavailable}
    </p>
  );
}

// -----------------------------------------------------------------------------
// Rows
// -----------------------------------------------------------------------------

export type ArtikalProps = {
  article: PublicArticle;
  layout: MenuLayout;
  slike: Readonly<Record<string, PublicImage>>;
  sadaMs: number;
  nedostupan: boolean;
  /** The section's icon, for an article without its own. */
  sekcijaIkonica?: string | null;
  /** Opens the detail; null = the row is not interactive (editor preview, a plain wine line). */
  onOtvori: ((key: string) => void) | null;
};

function Naziv({ article, onOtvori, className }: Pick<ArtikalProps, "article" | "onOtvori"> & { className: string }) {
  const kolicina = kolicinaTekst(article);
  const tekst = (
    <>
      {article.name}
      {kolicina ? (
        <span className={styles.kolicina}>
          {" "}
          {kolicina}
        </span>
      ) : null}
    </>
  );
  return (
    <h3 className={className}>
      {onOtvori ? (
        <button
          type="button"
          className={styles.otvori}
          aria-haspopup="dialog"
          onClick={() => onOtvori(article.key)}
        >
          {tekst}
        </button>
      ) : (
        tekst
      )}
    </h3>
  );
}

/** Tok: [media] name, description, badges | price. */
export function ArtikalRed({ article, layout, slike, sadaMs, nedostupan, sekcijaIkonica = null, onOtvori }: ArtikalProps) {
  const izbor = izborMedija(article, layout, slike, sekcijaIkonica);
  const upozorenje = useUpozorenje(article);
  return (
    <li
      id={sidroArtikla(article.key)}
      className={styles.red}
      data-artikal=""
      data-medij={izbor.vrsta === "bez" ? undefined : izbor.vrsta}
      data-nedostupno={nedostupan ? "" : undefined}
      data-upozorenje={upozorenje?.vrsta}
    >
      <Medij izbor={izbor} px={96} rezerva={sekcijaIkonica} />
      <div className={styles.redTelo}>
        <Naziv article={article} onOtvori={onOtvori} className={styles.nazivArtikla} />
        {article.description ? <p className={styles.opis}>{article.description}</p> : null}
        <Oznake article={article} sadaMs={sadaMs} />
        <Upozorenje upozorenje={upozorenje} />
        {nedostupan ? <Nedostupno /> : null}
      </div>
      <Cena cena={cenaPrikaz(article, sadaMs)} />
    </li>
  );
}

/** Kategorije: a card with a larger image or icon. */
export function ArtikalKartica({ article, layout, slike, sadaMs, nedostupan, sekcijaIkonica = null, onOtvori }: ArtikalProps) {
  const izbor = izborMedija(article, layout, slike, sekcijaIkonica);
  const upozorenje = useUpozorenje(article);
  return (
    <li
      id={sidroArtikla(article.key)}
      className={styles.kartica}
      data-artikal=""
      data-medij={izbor.vrsta === "bez" ? undefined : izbor.vrsta}
      data-nedostupno={nedostupan ? "" : undefined}
      data-upozorenje={upozorenje?.vrsta}
    >
      <Medij izbor={izbor} px={88} rezerva={sekcijaIkonica} />
      <div className={styles.karticaTelo}>
        <Naziv article={article} onOtvori={onOtvori} className={styles.nazivArtikla} />
        {article.description ? <p className={styles.opis}>{article.description}</p> : null}
        <Oznake article={article} sadaMs={sadaMs} />
        <Upozorenje upozorenje={upozorenje} />
        {nedostupan ? <Nedostupno /> : null}
      </div>
      <Cena cena={cenaPrikaz(article, sadaMs)} />
    </li>
  );
}

/** Kompaktno: a typographic line, never any media (master §7.1, §15.2). */
export function KompaktnaStavka({ article, sadaMs, nedostupan, onOtvori }: Omit<ArtikalProps, "layout" | "slike" | "sekcijaIkonica">) {
  const cena = cenaPrikaz(article, sadaMs);
  const upozorenje = useUpozorenje(article);
  return (
    <li
      id={sidroArtikla(article.key)}
      className={styles.stavka}
      data-artikal=""
      data-nedostupno={nedostupan ? "" : undefined}
      data-upozorenje={upozorenje?.vrsta}
    >
      <div className={styles.stavkaRed}>
        <Naziv article={article} onOtvori={onOtvori} className={`${styles.stavkaNaziv} ${styles.nazivArtikla}`} />
        {cena.vrsta === "osnovna" ? (
          <>
            <span className={styles.vodic} aria-hidden="true" />
            <Cena cena={cena} />
          </>
        ) : null}
      </div>
      {cena.vrsta === "varijante" ? (
        <ul className={styles.kVarijante}>
          {cena.stavke.map((stavka) => (
            <li key={stavka.key} className={styles.kVarijanta}>
              <span className={styles.kVarijantaNaziv}>{stavka.naziv}</span>
              <span className={styles.vodic} aria-hidden="true" />
              <Cena cena={{ vrsta: "osnovna", rsd: stavka.rsd, akcijska: stavka.akcijska }} />
            </li>
          ))}
        </ul>
      ) : null}
      {article.description ? <p className={styles.stavkaOpis}>{article.description}</p> : null}
      <Oznake article={article} sadaMs={sadaMs} />
      <Upozorenje upozorenje={upozorenje} bezIkonice />
      {nedostupan ? <Nedostupno bezIkonice /> : null}
    </li>
  );
}
