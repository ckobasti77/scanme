"use client";

// ScanMe Menu V1 (K30) — "Preuzmi CSV" (Premium, master §14.1): the period on
// the screen, day by day, or the chosen breakdown when one is shown
// (lib/menu/analitika/csv.ts: Serbian headers, UTF-8 with a BOM for Excel, only
// aggregate counts). The file is built in the browser from what the screen
// already loaded: no new query, nothing leaves the device. On Standard the
// button stays visible, disabled, with the reason next to it.

import { Download, Lock } from "lucide-react";
import { useId } from "react";
import { menuAnalitikaSr } from "@/lib/i18n/sr/menu-analitika";
import { csvPerioda, csvRaspodele, imeCsvFajla } from "@/lib/menu/analitika/csv";
import type { IzvestajAnalitike, RaspodelaAnalitike } from "@/lib/menu/analitika/izvestaj";
import { nazivVrednosti, type AnalitikaPlan } from "@/lib/menu/analitika/prikaz";
import { Dugme } from "../../zajednicko/dugme";
import { NAZIVI_RASPODELE } from "./zajednicko";

const t = menuAnalitikaSr.csv;

/** The file the button would download now (pure; the render test and the click use it). */
export function csvSadrzaj(opcije: {
  izvestaj: IzvestajAnalitike;
  raspodela: RaspodelaAnalitike | null;
  slug: string;
}): { ime: string; tekst: string } {
  const { izvestaj, raspodela, slug } = opcije;
  if (raspodela) {
    return {
      ime: imeCsvFajla({ slug, od: raspodela.period.od, do: raspodela.period.do, metrika: raspodela.metrika, dimenzija: raspodela.dimenzija }),
      tekst: csvRaspodele(raspodela, (v) => nazivVrednosti(raspodela.dimenzija, v.vrednost, v.naziv, NAZIVI_RASPODELE)),
    };
  }
  return { ime: imeCsvFajla({ slug, od: izvestaj.period.od, do: izvestaj.period.do }), tekst: csvPerioda(izvestaj) };
}

function preuzmi(ime: string, tekst: string) {
  const url = URL.createObjectURL(new Blob([tekst], { type: "text/csv;charset=utf-8" }));
  const veza = document.createElement("a");
  veza.href = url;
  veza.download = ime;
  document.body.appendChild(veza);
  veza.click();
  veza.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function CsvDugme({
  plan,
  izvestaj,
  raspodela,
  slug,
}: {
  plan: AnalitikaPlan;
  /** The report on the screen; undefined/null while it loads or failed. */
  izvestaj: IzvestajAnalitike | null | undefined;
  /** The breakdown on the screen, when one is chosen and loaded. */
  raspodela: RaspodelaAnalitike | null;
  slug: string;
}) {
  const id = useId();
  if (plan !== "premium") {
    return (
      <div data-csv="zakljucano" className="grid justify-items-start gap-1 sm:justify-items-end">
        <Dugme vrsta="sekundarno" ikonica={Lock} disabled aria-describedby={`${id}-razlog`}>
          {t.dugme}
        </Dugme>
        <p id={`${id}-razlog`} className="max-w-[32ch] text-sm leading-snug text-[var(--mp-tekst-sporedni)] sm:text-right">
          {t.zakljucano}
        </p>
      </div>
    );
  }
  return (
    <div data-csv="dostupno" className="grid justify-items-start gap-1 sm:justify-items-end">
      <Dugme
        vrsta="sekundarno"
        ikonica={Download}
        disabled={!izvestaj}
        aria-describedby={`${id}-opis`}
        onClick={() => {
          if (!izvestaj) return;
          const { ime, tekst } = csvSadrzaj({ izvestaj, raspodela, slug });
          preuzmi(ime, tekst);
        }}
      >
        {t.dugme}
      </Dugme>
      <p id={`${id}-opis`} className="max-w-[40ch] text-sm leading-snug text-[var(--mp-tekst-sporedni)] sm:text-right">
        {t.opis}
      </p>
    </div>
  );
}
