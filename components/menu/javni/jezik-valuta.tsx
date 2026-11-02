"use client";

// ScanMe Menu V1 (K14, plan K12 §6.4, §6.5) — the two switches at the top of
// the public menu.
//
//   JezikIzbor       only when the menu has more than one language: links to
//                    the same page with `?jezik=` (works without JavaScript,
//                    can be shared). Each name is in its own language.
//   ValutaPrekidac   RSD | EUR (master §5.3), only with a fresh rate; RSD is
//                    the default and the price that counts.
//   EurIznos         "~ 12,70 EUR" under an RSD price while EUR is chosen;
//                    a screen reader hears "otprilike 12,70 EUR" (the "~" is
//                    CSS with empty alternative text: two small nodes per price).

import Link from "next/link";
import { menuJavniSr } from "@/lib/i18n/sr/menu-javni";
import { eurIzRsd, iznosEur } from "@/lib/menu/currency";
import { useJavniIzbor } from "./kontekst";
import styles from "./javni.module.css";

const t = menuJavniSr;
const NAZIVI_JEZIKA: Readonly<Record<string, string>> = t.jezik.nazivi;

export function JezikIzbor({
  jezik,
  jezici,
  linkovi,
}: {
  jezik: string;
  jezici: readonly string[];
  /** The href of the same page in each language. */
  linkovi: Readonly<Record<string, string>>;
}) {
  if (jezici.length <= 1) return null;
  return (
    <nav aria-label={t.jezik.oznaka} className={styles.prekidac} data-jezik-izbor="">
      {jezici.map((kod) => (
        <Link
          key={kod}
          href={linkovi[kod] ?? "#"}
          className={styles.prekidacOpcija}
          lang={kod}
          hrefLang={kod}
          aria-current={kod === jezik ? "true" : undefined}
        >
          {NAZIVI_JEZIKA[kod] ?? kod.toUpperCase()}
        </Link>
      ))}
    </nav>
  );
}

export function ValutaPrekidac({ valuta, onIzbor }: { valuta: "rsd" | "eur"; onIzbor: (valuta: "rsd" | "eur") => void }) {
  return (
    <div role="group" aria-label={t.valuta.oznaka} className={styles.prekidac} data-valuta-prekidac="">
      {(["rsd", "eur"] as const).map((kod) => (
        <button
          key={kod}
          type="button"
          className={styles.prekidacOpcija}
          aria-pressed={valuta === kod ? "true" : "false"}
          onClick={() => onIzbor(kod)}
        >
          {kod === "rsd" ? t.valuta.rsd : t.valuta.eur}
        </button>
      ))}
    </div>
  );
}

/** The approximate EUR line of an RSD amount; nothing while the guest shows RSD. */
export function EurIznos({ rsd }: { rsd: number }) {
  const { eurKurs } = useJavniIzbor();
  if (eurKurs === null) return null;
  return (
    <span className={styles.eur} data-eur="">
      <span className={styles.vizuelnoSkriveno}>{t.valuta.eurCitac} </span>
      {iznosEur(eurIzRsd(rsd, eurKurs))} {t.valuta.eurOznaka}
    </span>
  );
}
