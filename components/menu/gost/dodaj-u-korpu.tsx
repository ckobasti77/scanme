"use client";

// ScanMe Menu V1 (K21) — ordering inside the article detail (master §5.7,
// §8.2): the variant (pick one, with its own price), the add-on groups with
// their published rules, the free note only where the venue switched it on,
// the quantity, and `Dodaj u korpu · 1.040 RSD`. The price is the same
// `linePrice` the server charges (lib/menu/cart.ts). "Privremeno nedostupno"
// cannot be added. Only rendered for a guest at a position that may order.

import { Minus, Plus } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { fmt } from "@/lib/i18n/format";
import { menuGostSr } from "@/lib/i18n/sr/menu-gost";
import { menuJavniSr } from "@/lib/i18n/sr/menu-javni";
import { linePrice, missingGroups } from "@/lib/menu/cart";
import { MENU_MAX_CART_LINES, MENU_MAX_CART_QUANTITY, MENU_TEXT } from "@/lib/menu/limits";
import { cenaPrikaz } from "@/lib/menu/public-view";
import type { MenuRequestChannel } from "@/lib/menu/request-status";
import type { PublicAddonGroup, PublicArticle } from "@/lib/menu/snapshot";
import { formatRsd } from "../menu-view";
import { useKorpa } from "./use-korpa";
import styles from "./gost.module.css";

const t = menuGostSr;

/** The group's rule in words, as the detail says it: "tačno 2" alone, never "može više, tačno 2". */
function pravilo(grupa: PublicAddonGroup): string {
  const tacno = grupa.selection === "multiple" && grupa.minSelect === grupa.maxSelect;
  const delovi = tacno ? [] : [grupa.selection === "single" ? menuJavniSr.detalj.biraSeJedno : menuJavniSr.detalj.biraSeVise];
  if (grupa.required) delovi.push(t.dodaj.obavezno);
  if (grupa.selection === "multiple" && (tacno || grupa.maxSelect < grupa.options.length)) {
    delovi.push(
      tacno
        ? fmt(menuJavniSr.detalj.izborTacno, { n: grupa.maxSelect })
        : grupa.minSelect > 0
          ? fmt(menuJavniSr.detalj.izborOdDo, { min: grupa.minSelect, max: grupa.maxSelect })
          : fmt(menuJavniSr.detalj.izborDo, { max: grupa.maxSelect }),
    );
  }
  return delovi.join(", ");
}

export type DodajUKorpuProps = {
  article: PublicArticle;
  slug: string;
  kanal: MenuRequestChannel;
  /** The standard page the guest orders from; null on Room service. */
  pageKey: string | null;
  sadaMs: number;
  nedostupan: boolean;
  /** Keep the cart in sessionStorage (off in the izlog). */
  cuvaj: boolean;
  onDodato: () => void;
};

export function DodajUKorpu({ article, slug, kanal, pageKey, sadaMs, nedostupan, cuvaj, onDodato }: DodajUKorpuProps) {
  const korpa = useKorpa(slug, kanal, { cuvaj });
  const id = useId();
  const [variantKey, setVariantKey] = useState<string | null>(article.variants[0]?.key ?? null);
  const [dodaci, setDodaci] = useState<string[]>([]);
  const [napomena, setNapomena] = useState("");
  const [kolicina, setKolicina] = useState(1);
  const [puna, setPuna] = useState(false);

  const cene = useMemo(() => cenaPrikaz(article, sadaMs), [article, sadaMs]);
  const napomenaCista = napomena.trim().replace(/\s+/g, " ");
  const cena = linePrice(article, { variantKey, addonKeys: dodaci, quantity: kolicina }, sadaMs, kanal);
  const nedostaje = missingGroups(article, dodaci);

  if (nedostupan) return <p className={styles.upozorenje}>{t.dodaj.nedostupno}</p>;
  if (article.variants.length === 0 && article.priceRsd === null) return <p className={styles.sitno}>{t.dodaj.bezCene}</p>;

  const izaberi = (grupa: PublicAddonGroup, kljuc: string | null) => {
    const ostali = dodaci.filter((key) => !grupa.options.some((option) => option.key === key));
    if (grupa.selection === "single") {
      setDodaci(kljuc ? [...ostali, kljuc] : ostali);
      return;
    }
    if (kljuc === null) return;
    setDodaci(dodaci.includes(kljuc) ? dodaci.filter((key) => key !== kljuc) : [...dodaci, kljuc]);
  };

  const dodaj = () => {
    if (!cena) return;
    const ishod = korpa.dodaj({
      pageKey,
      articleKey: article.key,
      variantKey,
      addonKeys: dodaci,
      quantity: kolicina,
      note: article.noteEnabled && napomenaCista.length > 0 ? napomenaCista : null,
      name: article.name,
      variantName: cena.variantName,
      addonNames: cena.addons.map((addon) => addon.optionName),
      pieceRsd: cena.pieceRsd,
    });
    if (ishod === "full") {
      setPuna(true);
      return;
    }
    onDodato();
  };

  return (
    <section className={styles.poruci} aria-labelledby={`${id}-naslov`} data-poruci="">
      <h3 id={`${id}-naslov`} className={styles.poruciNaslov}>
        {t.dodaj.naslov}
      </h3>

      {cene.vrsta === "varijante" ? (
        <fieldset className={styles.grupa}>
          <legend>
            {t.dodaj.izaberite} <span className={styles.pravilo}>({t.dodaj.obavezno})</span>
          </legend>
          {cene.stavke.map((stavka) => (
            <label key={stavka.key} className={styles.izbor}>
              <input
                type="radio"
                name={`${id}-varijanta`}
                checked={variantKey === stavka.key}
                onChange={() => setVariantKey(stavka.key)}
              />
              <span>{stavka.naziv}</span>
              <span className={styles.iznos}>
                {stavka.akcijska !== null ? <del className={styles.redovna}>{formatRsd(stavka.rsd)}</del> : null}
                {formatRsd(stavka.akcijska ?? stavka.rsd)}
                <span className={styles.valuta}>{menuJavniSr.valuta.rsd}</span>
              </span>
            </label>
          ))}
        </fieldset>
      ) : null}

      {article.addonGroups.map((grupa) => (
        <fieldset key={grupa.key} className={styles.grupa} data-grupa={grupa.key}>
          <legend>
            {grupa.name} <span className={styles.pravilo}>({pravilo(grupa)})</span>
          </legend>
          {grupa.selection === "single" && !grupa.required ? (
            <label className={styles.izbor}>
              <input
                type="radio"
                name={`${id}-${grupa.key}`}
                checked={!grupa.options.some((option) => dodaci.includes(option.key))}
                onChange={() => izaberi(grupa, null)}
              />
              <span>{t.dodaj.bezDodatka}</span>
              <span />
            </label>
          ) : null}
          {grupa.options.map((opcija) => {
            const izabran = dodaci.includes(opcija.key);
            const izabranihUGrupi = grupa.options.filter((option) => dodaci.includes(option.key)).length;
            const pun = grupa.selection === "multiple" && !izabran && izabranihUGrupi >= grupa.maxSelect;
            return (
              <label key={opcija.key} className={styles.izbor} data-onemoguceno={pun ? "" : undefined}>
                <input
                  type={grupa.selection === "single" ? "radio" : "checkbox"}
                  name={`${id}-${grupa.key}`}
                  checked={izabran}
                  disabled={pun}
                  onChange={() => izaberi(grupa, opcija.key)}
                />
                <span>{opcija.name}</span>
                <span className={styles.iznos}>
                  {opcija.priceDeltaRsd > 0 ? (
                    <>
                      +{formatRsd(opcija.priceDeltaRsd)}
                      <span className={styles.valuta}>{menuJavniSr.valuta.rsd}</span>
                    </>
                  ) : null}
                </span>
              </label>
            );
          })}
        </fieldset>
      ))}

      {article.noteEnabled ? (
        <div className={styles.napomenaPolje}>
          <label htmlFor={`${id}-napomena`}>{t.dodaj.napomena}</label>
          <textarea
            id={`${id}-napomena`}
            value={napomena}
            maxLength={MENU_TEXT.cartLineNote}
            placeholder={t.dodaj.napomenaPrimer}
            onChange={(event) => setNapomena(event.target.value)}
            aria-describedby={`${id}-napomena-broj`}
          />
          <span id={`${id}-napomena-broj`} className={styles.sitno}>
            {fmt(t.dodaj.napomenaBroj, { n: napomena.length, max: MENU_TEXT.cartLineNote })}
          </span>
        </div>
      ) : null}

      <div className={styles.poruciDno}>
        {nedostaje.length > 0 ? (
          <p id={`${id}-nedostaje`} className={styles.poruciNedostaje}>
            {fmt(t.dodaj.nedostaje, { grupe: nedostaje.map((grupa) => grupa.name).join(", ") })}
          </p>
        ) : null}
        <div className={styles.koraci} role="group" aria-label={t.dodaj.kolicina}>
          <button
            type="button"
            className={styles.korak}
            aria-label={t.dodaj.manje}
            disabled={kolicina <= 1}
            onClick={() => setKolicina((n) => Math.max(1, n - 1))}
          >
            <Minus aria-hidden="true" className={styles.ikonica} />
          </button>
          <span className={styles.kolicina} aria-live="polite">
            {kolicina}
          </span>
          <button
            type="button"
            className={styles.korak}
            aria-label={t.dodaj.vise}
            disabled={kolicina >= MENU_MAX_CART_QUANTITY}
            onClick={() => setKolicina((n) => Math.min(MENU_MAX_CART_QUANTITY, n + 1))}
          >
            <Plus aria-hidden="true" className={styles.ikonica} />
          </button>
        </div>
        <button
          type="button"
          className={styles.dugme}
          disabled={!cena}
          aria-describedby={nedostaje.length > 0 ? `${id}-nedostaje` : undefined}
          onClick={dodaj}
          data-dodaj=""
        >
          {cena ? fmt(t.dodaj.dodaj, { iznos: formatRsd(cena.lineTotalRsd) }) : t.dodaj.dodajBezIznosa}
        </button>
      </div>
      {puna ? (
        <p className={styles.greska} role="alert">
          {fmt(t.korpa.puna, { n: MENU_MAX_CART_LINES })}
        </p>
      ) : null}
    </section>
  );
}
