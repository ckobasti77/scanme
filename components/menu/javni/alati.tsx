"use client";

// ScanMe Menu V1 (K14, plan K12 §6.1) — the guest's tools above the menu:
// search, the filter chips and the allergen button, each only when the venue
// turned it on and (for filters) only the chips the page can use (master
// §7.2). There is no price-range filter (§20). The results line says how many
// articles match and offers the way back to the whole menu.

import { Search, X } from "lucide-react";
import type { ReactNode } from "react";
import { fmt, srPluralCategory } from "@/lib/i18n/format";
import { menuDomenSr } from "@/lib/i18n/sr/menu-domen";
import { menuJavniSr } from "@/lib/i18n/sr/menu-javni";
import { MENU_FILTER_PROMO, type MenuFilterCode } from "@/lib/menu/filters";
import { MENU_PRETRAGA_MAX } from "@/lib/menu/search";
import styles from "./javni.module.css";

const t = menuJavniSr;
const d = menuDomenSr;

export function nazivFiltera(kod: MenuFilterCode): string {
  return kod === MENU_FILTER_PROMO ? d.promoLabels.promo : d.tags[kod];
}

export function TrakaAlata({
  pretraga,
  upit,
  onUpit,
  filteri,
  izabrani,
  onFilter,
  alergeni,
}: {
  pretraga: boolean;
  upit: string;
  onUpit: (upit: string) => void;
  filteri: readonly MenuFilterCode[];
  izabrani: readonly string[];
  onFilter: (kod: MenuFilterCode) => void;
  /** The allergen button, when the venue keeps allergens. */
  alergeni: ReactNode;
}) {
  if (!pretraga && filteri.length === 0 && !alergeni) return null;
  return (
    <div className={styles.alati} data-alati="">
      {pretraga || alergeni ? (
        <div className={styles.alatiRed}>
          {pretraga ? (
            <div role="search" className={styles.pretraga} data-pretraga="">
              <label className={styles.vizuelnoSkriveno} htmlFor="javni-pretraga">
                {t.pretraga.oznaka}
              </label>
              <Search aria-hidden="true" className={styles.pretragaIkonica} />
              <input
                id="javni-pretraga"
                type="search"
                className={styles.pretragaPolje}
                placeholder={t.pretraga.placeholder}
                value={upit}
                maxLength={MENU_PRETRAGA_MAX}
                autoComplete="off"
                enterKeyHint="search"
                onChange={(event) => onUpit(event.target.value)}
              />
              {upit ? (
                <button
                  type="button"
                  className={styles.pretragaObrisi}
                  aria-label={t.pretraga.obrisi}
                  onClick={() => onUpit("")}
                >
                  <X aria-hidden="true" className={styles.ikonicaLinka} />
                </button>
              ) : null}
            </div>
          ) : null}
          {alergeni}
        </div>
      ) : null}
      {filteri.length > 0 ? (
        <div role="group" aria-label={t.pretraga.filteri} className={styles.filteri} data-filteri="">
          {filteri.map((kod) => (
            <button
              key={kod}
              type="button"
              className={styles.filter}
              aria-pressed={izabrani.includes(kod) ? "true" : "false"}
              onClick={() => onFilter(kod)}
              data-filter={kod}
            >
              {nazivFiltera(kod)}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function RezultatiStatus({
  broj,
  upit,
  imaFiltera,
  onPonisti,
}: {
  broj: number;
  upit: string;
  imaFiltera: boolean;
  onPonisti: () => void;
}) {
  const prazno = broj === 0;
  return (
    <div className={prazno ? styles.stanje : styles.rezultati} data-rezultati={broj}>
      <p className={prazno ? styles.stanjeOpis : styles.rezultatiBroj} role="status">
        {prazno
          ? upit.trim()
            ? fmt(t.pretraga.nemaRezultata, { upit: upit.trim() })
            : t.pretraga.nemaZaFiltere
          : fmt(t.pretraga.rezultati[srPluralCategory(broj)], { n: broj })}
      </p>
      {prazno ? <p className={styles.stanjeOpis}>{t.pretraga.nemaSavet}</p> : null}
      <button type="button" className={prazno ? styles.stanjeDugme : styles.sadrzajDugme} onClick={onPonisti}>
        {upit.trim() && !imaFiltera ? t.pretraga.obrisi : t.pretraga.prikaziSve}
      </button>
    </div>
  );
}
