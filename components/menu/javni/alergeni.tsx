"use client";

// ScanMe Menu V1 (K14, plan K12 §6.2) — the guest's allergens (master §7.3),
// only when the venue keeps allergen data. A guest marks what they react
// to; affected articles get a clear warning on the row or card AND in the
// detail. Nothing is hidden and nothing is ever called safe: an article the
// venue left without data says so, and the venue's working text (master §7.3,
// menu-domen `allergenDisclaimer`) stays beside every choice.
//
//   Upozorenje      the warning of one article (icon + words + colour; the
//                   icon is drawn by CSS, so 400 rows carry no SVG; text only
//                   in `Kompaktno`, which never shows an icon). "No data" is
//                   a neutral note with a question-mark icon, never red.
//   AlergeniDugme   "Alergeni (2)" in the tools row; opens the drawer
//   AlergeniFioka   a native <dialog> with the 14 categories and "Drugo"
//   AlergeniTraka   "Označeno: mleko, gluten · upozorenje na 12 artikala"

import { ShieldAlert } from "lucide-react";
import { useEffect, useRef } from "react";
import { fmt, srPluralCategory } from "@/lib/i18n/format";
import { menuDomenSr } from "@/lib/i18n/sr/menu-domen";
import { menuJavniSr } from "@/lib/i18n/sr/menu-javni";
import type { UpozorenjeAlergena } from "@/lib/menu/allergen-warnings";
import { MENU_ALLERGEN_CODES, type MenuAllergenCode } from "@/lib/menu/allergens";
import { naZatvaranje } from "./dijalog-zatvaranje";
import styles from "./javni.module.css";

const t = menuJavniSr;
const d = menuDomenSr;

const kratko = (kod: MenuAllergenCode) => t.alergeni.kratko[kod] ?? kod;
const lista = (kodovi: readonly MenuAllergenCode[]) => kodovi.map(kratko).join(", ");

export function Upozorenje({
  upozorenje,
  bezIkonice = false,
}: {
  upozorenje: UpozorenjeAlergena | null;
  bezIkonice?: boolean;
}) {
  if (!upozorenje) return null;
  if (upozorenje.vrsta === "nepoznato") {
    return (
      <p
        className={styles.upozorenjeNepoznato}
        data-upozorenje="nepoznato"
        data-bez-ikonice={bezIkonice ? "" : undefined}
      >
        {t.alergeni.nepoznato}
      </p>
    );
  }
  return (
    <p
      className={styles.upozorenje}
      role="note"
      data-upozorenje={upozorenje.vrsta}
      data-bez-ikonice={bezIkonice ? "" : undefined}
    >
      <span>
        {upozorenje.vrsta === "sadrzi" && upozorenje.sadrzi.length > 0 ? (
          <span className={styles.upozorenjeDeo} data-upozorenje-sadrzi="">
            <strong>{d.allergenKinds.contains}:</strong> {lista(upozorenje.sadrzi)}
          </span>
        ) : null}
        {upozorenje.tragovi.length > 0 ? (
          <span className={styles.upozorenjeDeo} data-upozorenje-tragovi="">
            <strong>{d.allergenKinds.mayContain}:</strong> {lista(upozorenje.tragovi)}
          </span>
        ) : null}
      </span>
    </p>
  );
}

export function AlergeniDugme({ broj, onOtvori }: { broj: number; onOtvori: () => void }) {
  return (
    <button
      type="button"
      className={styles.alatDugme}
      aria-haspopup="dialog"
      onClick={onOtvori}
      data-alergeni-dugme=""
    >
      <ShieldAlert aria-hidden="true" className={styles.ikonicaLinka} />
      {broj > 0 ? fmt(t.alergeni.dugmeBroj, { n: broj }) : t.alergeni.dugme}
    </button>
  );
}

/** Mounted only while open (no dialog in the markup of a 400-article page); focus returns to the button. */
export function AlergeniFioka({
  oznaceni,
  onPromena,
  onZatvori,
}: {
  oznaceni: readonly MenuAllergenCode[];
  onPromena: (kodovi: MenuAllergenCode[]) => void;
  onZatvori: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const povratak = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
      povratak?.focus({ preventScroll: true });
    };
  }, []);
  const izabrani = new Set(oznaceni);
  const prebaci = (kod: MenuAllergenCode) => {
    const sledeci = new Set(izabrani);
    if (sledeci.has(kod)) sledeci.delete(kod);
    else sledeci.add(kod);
    onPromena(MENU_ALLERGEN_CODES.filter((code) => sledeci.has(code)));
  };
  return (
    <dialog
      ref={ref}
      className={styles.detalj}
      aria-labelledby="javni-alergeni-naslov"
      data-alergeni-fioka=""
      onClose={naZatvaranje(onZatvori)}
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
    >
      <div className={styles.detaljTelo}>
        <h2 id="javni-alergeni-naslov" className={`${styles.naslov} ${styles.stanjeNaslov}`}>
          {t.alergeni.naslov}
        </h2>
        <p className={styles.detaljOpis}>{t.alergeni.uvod}</p>
        <fieldset className={styles.alergeniPolja}>
          <legend className={styles.vizuelnoSkriveno}>{t.alergeni.naslov}</legend>
          {MENU_ALLERGEN_CODES.map((kod) => (
            <label key={kod} className={styles.alergenPolje}>
              <input
                type="checkbox"
                name="alergen"
                value={kod}
                checked={izabrani.has(kod)}
                onChange={() => prebaci(kod)}
              />
              <span>{d.allergens[kod]}</span>
            </label>
          ))}
        </fieldset>
        <p className={styles.detaljNapomena} data-alergeni-napomena="">
          {d.allergenDisclaimer}
        </p>
        <form method="dialog" className={styles.alergeniRadnje}>
          <button
            type="button"
            className={styles.sadrzajDugme}
            disabled={oznaceni.length === 0}
            onClick={() => onPromena([])}
          >
            {t.alergeni.ponisti}
          </button>
          <button type="submit" className={styles.stanjeDugme}>
            {t.alergeni.gotovo}
          </button>
        </form>
      </div>
    </dialog>
  );
}

export function AlergeniTraka({
  oznaceni,
  brojUpozorenja,
  brojBezPodataka,
  onPromeni,
}: {
  oznaceni: readonly MenuAllergenCode[];
  brojUpozorenja: number;
  /** Articles the venue recorded nothing for: said in the bar, so "no warning" never reads as "safe". */
  brojBezPodataka: number;
  onPromeni: () => void;
}) {
  const delovi = [fmt(t.alergeni.oznaceno, { lista: lista(oznaceni) })];
  if (brojUpozorenja > 0) {
    delovi.push(fmt(t.alergeni.brojUpozorenja[srPluralCategory(brojUpozorenja)], { n: brojUpozorenja }));
  }
  if (brojBezPodataka > 0) {
    delovi.push(fmt(t.alergeni.bezPodataka[srPluralCategory(brojBezPodataka)], { n: brojBezPodataka }));
  }
  // Only when every article has a record and none lists the marked allergens (still not "safe").
  if (delovi.length === 1) delovi.push(t.alergeni.bezUpozorenja);
  return (
    <div className={styles.alergeniTraka} data-alergeni-traka="">
      <p className={styles.alergeniSazetak}>
        <span aria-live="polite">{delovi.join(" · ")}</span>
        <button type="button" className={styles.sadrzajDugme} onClick={onPromeni} aria-haspopup="dialog">
          {t.alergeni.promeni}
        </button>
      </p>
      <p className={styles.alergeniNapomena}>{d.allergenDisclaimer}</p>
    </div>
  );
}
