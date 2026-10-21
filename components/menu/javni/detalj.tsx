"use client";

// ScanMe Menu V1 (K13) — the article detail (master §7.3–§7.6): name,
// quantity, description, price or variants, add-ons (information until the
// guest can order, K21), combo contents, badges, the allergen structure, the
// promotion and "Privremeno nedostupno"; K14: the warning for the guest's
// marked allergens and the EUR note. A native <dialog> opened with showModal(): focus
// stays inside, Esc and `Zatvori` close it, focus returns to the row. A sheet
// from the bottom on phones, centred from 768 px (CSS).

import Image from "next/image";
import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { formatBelgradeDate } from "@/lib/belgrade-time";
import { fmt } from "@/lib/i18n/format";
import { menuDomenSr } from "@/lib/i18n/sr/menu-domen";
import { menuJavniSr } from "@/lib/i18n/sr/menu-javni";
import { isMenuAllergenCode } from "@/lib/menu/allergens";
import { datumKursa } from "@/lib/menu/currency";
import {
  akcijaAktivna,
  cenaPrikaz,
  izborMedija,
  kolicinaTekst,
  type PublicImage,
} from "@/lib/menu/public-view";
import type { MenuLayout } from "@/lib/menu/presentation";
import type { PublicAddonGroup, PublicArticle } from "@/lib/menu/snapshot";
import { formatRsd } from "../menu-view";
import { Upozorenje } from "./alergeni";
import { Cena, Nedostupno, Oznake } from "./artikal";
import { EurIznos } from "./jezik-valuta";
import { useJavniIzbor, useUpozorenje } from "./kontekst";
import styles from "./javni.module.css";

const t = menuJavniSr;

function nazivAlergena(kod: string): string {
  return isMenuAllergenCode(kod) ? menuDomenSr.allergens[kod] : kod;
}

function pravilo(grupa: PublicAddonGroup): string {
  const tacno = grupa.selection === "multiple" && grupa.minSelect === grupa.maxSelect;
  const delovi = tacno ? [] : [grupa.selection === "single" ? t.detalj.biraSeJedno : t.detalj.biraSeVise];
  if (grupa.required) delovi.push(t.detalj.obavezno);
  if (grupa.selection === "multiple" && (tacno || grupa.maxSelect < grupa.options.length)) {
    delovi.push(
      grupa.minSelect === grupa.maxSelect
        ? fmt(t.detalj.izborTacno, { n: grupa.maxSelect })
        : grupa.minSelect > 0
          ? fmt(t.detalj.izborOdDo, { min: grupa.minSelect, max: grupa.maxSelect })
          : fmt(t.detalj.izborDo, { max: grupa.maxSelect }),
    );
  }
  return delovi.join(", ");
}

/** The body of the detail; also rendered on its own by the render tests. */
export function DetaljSadrzaj({
  article,
  layout,
  slike,
  sadaMs,
  nedostupan,
  alergeniUkljuceni,
  naslovId,
  poruci = null,
}: {
  article: PublicArticle;
  layout: MenuLayout;
  slike: Readonly<Record<string, PublicImage>>;
  sadaMs: number;
  nedostupan: boolean;
  alergeniUkljuceni: boolean;
  naslovId: string;
  /** K21: ordering for a guest at a position (variants, add-ons, note, quantity); it replaces the read-only lists. */
  poruci?: ReactNode;
}) {
  const izbor = izborMedija(article, layout, slike);
  const kolicina = kolicinaTekst(article);
  const cena = cenaPrikaz(article, sadaMs);
  const promoKraj = article.promo && akcijaAktivna(article, sadaMs) ? article.promo.endsAt ?? null : null;
  const alergeni = article.allergens;
  const upozorenje = useUpozorenje(article);
  const { eurKurs, eurDatum } = useJavniIzbor();
  return (
    <>
      {izbor.vrsta === "slika" ? (
        <Image
          className={styles.detaljSlika}
          src={izbor.slika.url}
          alt=""
          width={izbor.slika.width}
          height={izbor.slika.height}
          sizes="(max-width: 767px) 100vw, 576px"
          unoptimized
        />
      ) : null}
      <div className={styles.detaljTelo} data-nedostupno={nedostupan ? "" : undefined}>
        <div>
          <h2 id={naslovId} tabIndex={-1} data-detalj-naslov="" className={`${styles.naslov} ${styles.detaljNaslov}`}>
            {article.name}
          </h2>
          {kolicina ? <p className={styles.detaljKolicina}>{kolicina}</p> : null}
          {cena.vrsta === "osnovna" ? <Cena cena={cena} className={styles.detaljCena} /> : null}
          {cena.vrsta === "osnovna" && promoKraj !== null ? (
            <p className={styles.detaljNapomena}>{fmt(t.detalj.akcijaDo, { datum: formatBelgradeDate(promoKraj) })}</p>
          ) : null}
          <Oznake article={article} sadaMs={sadaMs} />
          {/* "No data" is already said by the allergen block below; only real warnings repeat up here. */}
          <Upozorenje upozorenje={upozorenje?.vrsta === "nepoznato" ? null : upozorenje} />
          {nedostupan ? <Nedostupno /> : null}
          {eurKurs !== null && eurDatum ? (
            <p className={styles.detaljNapomena} data-eur-napomena="">
              {fmt(t.valuta.napomena, { datum: datumKursa(eurDatum) })}
            </p>
          ) : null}
        </div>
        {article.description ? <p className={styles.detaljOpis}>{article.description}</p> : null}

        {poruci}

        {cena.vrsta === "varijante" && !poruci ? (
          <div className={styles.detaljBlok}>
            <h3 className={styles.detaljPodnaslov}>{t.detalj.varijante}</h3>
            <ul className={styles.detaljStavke}>
              {cena.stavke.map((stavka) => (
                <li key={stavka.key} className={styles.detaljStavka}>
                  <span>{stavka.naziv}</span>
                  <Cena cena={{ vrsta: "osnovna", rsd: stavka.rsd, akcijska: stavka.akcijska }} />
                </li>
              ))}
            </ul>
            {promoKraj !== null ? (
              <p className={styles.detaljNapomena}>{fmt(t.detalj.akcijaDo, { datum: formatBelgradeDate(promoKraj) })}</p>
            ) : null}
          </div>
        ) : null}

        {article.addonGroups.length > 0 && !poruci ? (
          <div className={styles.detaljBlok}>
            <h3 className={styles.detaljPodnaslov}>{t.detalj.dodaci}</h3>
            {article.addonGroups.map((grupa) => (
              <div key={grupa.key}>
                <p className={styles.detaljGrupa}>
                  {grupa.name} <span className={styles.detaljPravilo}>({pravilo(grupa)})</span>
                </p>
                <ul className={styles.detaljStavke}>
                  {grupa.options.map((opcija) => (
                    <li key={opcija.key} className={styles.detaljStavka}>
                      <span>{opcija.name}</span>
                      {opcija.priceDeltaRsd > 0 ? (
                        <span className={styles.cena}>
                          +{formatRsd(opcija.priceDeltaRsd)}
                          <span className={styles.valuta}>{t.valuta.rsd}</span>
                          <EurIznos rsd={opcija.priceDeltaRsd} />
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : null}

        {article.combo && article.combo.components.length > 0 ? (
          <div className={styles.detaljBlok}>
            <h3 className={styles.detaljPodnaslov}>{t.detalj.sastav}</h3>
            <ul className={styles.detaljStavke}>
              {article.combo.components.map((deo) => (
                <li key={deo.articleKey} className={styles.detaljStavka}>
                  <span>
                    {deo.quantity > 1 ? `${fmt(t.detalj.kolicinaKomada, { n: deo.quantity })} ` : ""}
                    {deo.name}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {alergeniUkljuceni ? (
          <div className={styles.detaljBlok} data-alergeni="">
            <h3 className={styles.detaljPodnaslov}>{t.detalj.alergeni}</h3>
            {alergeni === null ? (
              <p className={styles.detaljOpis}>{t.detalj.alergeniNepoznato}</p>
            ) : alergeni.contains.length === 0 && alergeni.mayContain.length === 0 && !alergeni.otherText ? (
              <p className={styles.detaljOpis}>{t.detalj.alergeniNista}</p>
            ) : (
              <>
                {alergeni.contains.length > 0 ? (
                  <p className={styles.detaljOpis} data-alergeni-sadrzi="">
                    <strong>{menuDomenSr.allergenKinds.contains}:</strong>{" "}
                    {alergeni.contains.map(nazivAlergena).join(", ")}
                  </p>
                ) : null}
                {alergeni.mayContain.length > 0 ? (
                  <p className={styles.detaljOpis} data-alergeni-tragovi="">
                    <strong>{menuDomenSr.allergenKinds.mayContain}:</strong>{" "}
                    {alergeni.mayContain.map(nazivAlergena).join(", ")}
                  </p>
                ) : null}
                {alergeni.otherText ? (
                  <p className={styles.detaljOpis}>{fmt(t.detalj.drugo, { tekst: alergeni.otherText })}</p>
                ) : null}
              </>
            )}
            <p className={styles.detaljNapomena}>{menuDomenSr.allergenDisclaimer}</p>
          </div>
        ) : null}
      </div>
    </>
  );
}

export function DetaljArtikla({
  article,
  onZatvori,
  ...sadrzaj
}: Omit<Parameters<typeof DetaljSadrzaj>[0], "naslovId"> & { onZatvori: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const naslovId = `javni-detalj-${article.key}`;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const povratak = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog.open) dialog.showModal();
    // The title takes the focus, not the close button: no ring flashes when the sheet opens.
    dialog.querySelector<HTMLElement>("[data-detalj-naslov]")?.focus();
    return () => {
      if (dialog.open) dialog.close();
      povratak?.focus({ preventScroll: true });
    };
  }, [article.key]);

  return (
    <dialog
      ref={ref}
      className={styles.detalj}
      aria-labelledby={naslovId}
      onClose={onZatvori}
      onClick={(event) => {
        // A click on the backdrop (the dialog element itself, outside its content) closes it.
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
      data-detalj={article.key}
    >
      <div className={styles.detaljZatvori}>
        <button
          type="button"
          className={styles.zatvoriDugme}
          aria-label={t.detalj.zatvori}
          onClick={() => ref.current?.close()}
        >
          <X aria-hidden="true" className={styles.ikonicaLinka} />
        </button>
      </div>
      <DetaljSadrzaj article={article} naslovId={naslovId} {...sadrzaj} />
    </dialog>
  );
}
