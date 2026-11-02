"use client";

// ScanMe Menu V1 (K16) — the AI translation suggestion of one item in one
// language (master §7.7). A suggestion is only ever STORED next to the
// confirmed text: nothing here publishes anything. The owner reads it, may
// edit it and confirms it, or throws it away; only "Potvrdi predlog" turns it
// into a translation. Availability (Premium and a key) is decided by the
// server and passed in; the lock reason is shown once per view, not here.

import { Check, Sparkles, X } from "lucide-react";
import { useId, useState } from "react";
import { fmt } from "@/lib/i18n/format";
import { menuDomenSr } from "@/lib/i18n/sr/menu-domen";
import { menuStudioSr } from "@/lib/i18n/sr/menu-studio";
import { cleanText } from "@/lib/menu/text";
import type { StudioIshod, StudioJezici, StudioPrevodStavka, StudioRadnje } from "@/lib/menu/studio/model";
import { cilj, nazivJezika, predlogPolja, statusStavke } from "@/lib/menu/studio/prevodi-pogled";
import { granicaPrevoda } from "@/lib/menu/studio/prevodi";
import type { MenuTranslationField } from "@/lib/menu/translation-status";
import { cn } from "@/lib/utils";
import { Dugme } from "../../zajednicko/dugme";
import { OZNAKA_KLASA, POLJE_KLASA } from "../artikal/polja";

const t = menuStudioSr.posebno.prevodi;

export type PrevodiRadnje = Pick<StudioRadnje, "prevedi" | "predloziPrevod" | "potvrdiPredlog" | "odbaciPredlog" | "prevodJeDobar">;

/** The text for a refused or failed action: the coded reason when it has one, else "Nije sačuvano." */
export function porukaNeuspeha(ishod: Exclude<StudioIshod<unknown>, { ok: true }>): string {
  if (ishod.vrsta === "greska") {
    const poruke = menuDomenSr.errors as Record<string, string>;
    return poruke[ishod.kod] ?? menuStudioSr.red.nijeSacuvano;
  }
  return menuStudioSr.red.nijeSacuvano;
}

export function AiPredlog({
  stavka,
  jezik,
  ai,
  radnje,
  mozeUredjivanje,
  najavi,
}: {
  stavka: StudioPrevodStavka;
  jezik: string;
  ai: StudioJezici["ai"];
  radnje: Pick<PrevodiRadnje, "predloziPrevod" | "potvrdiPredlog" | "odbaciPredlog">;
  mozeUredjivanje: boolean;
  najavi: (poruka: string) => void;
}) {
  const predlog = predlogPolja(stavka, jezik);
  if (Object.keys(predlog).length > 0) {
    // A new suggestion (another text) starts the editing state afresh.
    return (
      <PredlogNaCekanju
        key={JSON.stringify(predlog)}
        stavka={stavka}
        jezik={jezik}
        predlog={predlog}
        radnje={radnje}
        mozeUredjivanje={mozeUredjivanje}
        najavi={najavi}
      />
    );
  }
  const status = statusStavke(stavka, jezik);
  if (ai.dostupno && mozeUredjivanje && (status === "missing" || status === "stale")) {
    return <TraziPredlog stavka={stavka} jezik={jezik} radnje={radnje} najavi={najavi} />;
  }
  return null;
}

function Greska({ id, poruka }: { id?: string; poruka: string | null }) {
  if (!poruka) return null;
  return (
    <p id={id} role="alert" className="text-sm font-medium text-[var(--mp-opasnost)] [overflow-wrap:anywhere]">
      {poruka}
    </p>
  );
}

function TraziPredlog({
  stavka,
  jezik,
  radnje,
  najavi,
}: {
  stavka: StudioPrevodStavka;
  jezik: string;
  radnje: Pick<PrevodiRadnje, "predloziPrevod">;
  najavi: (poruka: string) => void;
}) {
  const [radi, setRadi] = useState(false);
  const [greska, setGreska] = useState<string | null>(null);

  const predlozi = async () => {
    setRadi(true);
    setGreska(null);
    const ishod = await radnje.predloziPrevod(cilj(stavka), jezik);
    setRadi(false);
    if (ishod.ok) najavi(t.ai.stigao);
    else setGreska(porukaNeuspeha(ishod));
  };

  return (
    <div className="grid justify-items-start gap-2">
      <Dugme vrsta="sekundarno" velicina="kompaktna" ikonica={Sparkles} ucitava={radi} onClick={predlozi}>
        {radi ? t.ai.radi : t.ai.predlozi}
      </Dugme>
      <Greska poruka={greska} />
    </div>
  );
}

function PredlogNaCekanju({
  stavka,
  jezik,
  predlog,
  radnje,
  mozeUredjivanje,
  najavi,
}: {
  stavka: StudioPrevodStavka;
  jezik: string;
  predlog: Partial<Record<MenuTranslationField, string>>;
  radnje: Pick<PrevodiRadnje, "potvrdiPredlog" | "odbaciPredlog">;
  mozeUredjivanje: boolean;
  najavi: (poruka: string) => void;
}) {
  const id = useId();
  const polja = (Object.keys(predlog) as MenuTranslationField[]).sort(
    (a, b) => ["name", "description", "publicTitle"].indexOf(a) - ["name", "description", "publicTitle"].indexOf(b),
  );
  const [vrednosti, setVrednosti] = useState<Partial<Record<MenuTranslationField, string>>>(predlog);
  const [radi, setRadi] = useState<"potvrdi" | "odbaci" | null>(null);
  const [greska, setGreska] = useState<string | null>(null);
  const jezikNaziv = nazivJezika(jezik);

  const predugo = (polje: MenuTranslationField) => cleanText(vrednosti[polje] ?? "").length > granicaPrevoda(stavka.vrsta, polje);
  const imaPredugo = polja.some(predugo);

  const potvrdi = async () => {
    if (imaPredugo) return;
    // Only what the owner changed travels as an edit; the rest is confirmed as suggested.
    const izmene: Partial<Record<MenuTranslationField, string>> = {};
    for (const polje of polja) {
      const tekst = cleanText(vrednosti[polje] ?? "");
      if (tekst !== "" && tekst !== cleanText(predlog[polje] ?? "")) izmene[polje] = tekst;
    }
    setRadi("potvrdi");
    setGreska(null);
    const ishod = await radnje.potvrdiPredlog(cilj(stavka), jezik, izmene);
    setRadi(null);
    if (ishod.ok) najavi(t.ai.potvrdjeno);
    else setGreska(porukaNeuspeha(ishod));
  };

  const odbaci = async () => {
    setRadi("odbaci");
    setGreska(null);
    const ishod = await radnje.odbaciPredlog(cilj(stavka), jezik);
    setRadi(null);
    if (ishod.ok) najavi(t.ai.odbaceno);
    else setGreska(porukaNeuspeha(ishod));
  };

  return (
    <div
      role="group"
      aria-labelledby={`${id}-naslov`}
      data-ai-predlog=""
      className="grid gap-3 rounded-[var(--mp-radius-kontrola)] border bg-[var(--mp-info-meko)] p-3 [--border:var(--mp-info-ivica)] sm:p-4"
    >
      <div className="grid gap-1">
        <p id={`${id}-naslov`} className="flex items-center gap-2 text-sm font-semibold text-[var(--mp-tekst)]">
          <Sparkles aria-hidden="true" strokeWidth={2} className="size-4 shrink-0 text-[var(--mp-info)]" />
          {t.ai.predlogNaslov}
        </p>
        <p className="text-sm leading-snug text-[var(--mp-tekst)]">{t.ai.predlogOpis}</p>
      </div>
      {polja.map((polje) => {
        const poljeId = `${id}-${polje}`;
        const preduga = predugo(polje);
        const zajednicko = {
          id: poljeId,
          value: vrednosti[polje] ?? "",
          disabled: !mozeUredjivanje || radi !== null,
          autoComplete: "off",
          "aria-invalid": preduga ? true : undefined,
          "aria-describedby": preduga ? `${poljeId}-greska` : undefined,
        };
        return (
          <div key={polje} className="grid min-w-0 gap-1.5">
            <label htmlFor={zajednicko.id} className={OZNAKA_KLASA}>
              {fmt(t.poljeOznaka, { polje: t.polja[polje], jezik: jezikNaziv })}
            </label>
            {polje === "description" ? (
              <textarea
                {...zajednicko}
                rows={3}
                onChange={(event) => setVrednosti((prethodne) => ({ ...prethodne, [polje]: event.target.value }))}
                className={cn(POLJE_KLASA, "min-h-24 resize-y py-2.5 leading-relaxed")}
              />
            ) : (
              <input
                {...zajednicko}
                type="text"
                onChange={(event) => setVrednosti((prethodne) => ({ ...prethodne, [polje]: event.target.value }))}
                className={cn(POLJE_KLASA, "h-[var(--mp-meta)]")}
              />
            )}
            {preduga ? (
              <Greska
                id={`${poljeId}-greska`}
                poruka={fmt(menuStudioSr.artikal.osnovno.greske.predugo, { n: granicaPrevoda(stavka.vrsta, polje) })}
              />
            ) : null}
          </div>
        );
      })}
      <Greska poruka={greska} />
      <div className="flex flex-wrap gap-2">
        <Dugme
          vrsta="primarno"
          velicina="kompaktna"
          ikonica={Check}
          ucitava={radi === "potvrdi"}
          disabled={!mozeUredjivanje || radi === "odbaci" || imaPredugo}
          onClick={potvrdi}
        >
          {t.ai.potvrdi}
        </Dugme>
        <Dugme
          vrsta="tiho"
          velicina="kompaktna"
          ikonica={X}
          ucitava={radi === "odbaci"}
          disabled={!mozeUredjivanje || radi === "potvrdi"}
          onClick={odbaci}
        >
          {t.ai.odbaci}
        </Dugme>
      </div>
    </div>
  );
}
