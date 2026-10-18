"use client";

// ScanMe Menu V1 (K16) — one translatable thing (a page title, section,
// article, variant, add-on group or option, Room service category) in ONE
// language (master §7.7). Shows the Serbian source next to the translation
// field, says in words whether the translation is missing, stale, waiting as
// an AI suggestion or done (never colour alone), and offers "Prevod je i dalje
// dobar" for a stale one. Typed text goes into the draft through the save
// queue; the AI suggestion lives in AiPredlog and is never published by itself.

import { Check, History, Sparkles, type LucideIcon } from "lucide-react";
import { useId, useState } from "react";
import { fmt } from "@/lib/i18n/format";
import { menuStudioSr } from "@/lib/i18n/sr/menu-studio";
import type { AutosaveRed } from "@/lib/menu/studio/autosave-queue";
import type { PoljeProvera } from "@/lib/menu/studio/article-form";
import type { StudioJezici, StudioPrevodStavka } from "@/lib/menu/studio/model";
import { cilj, kljucPrevoda, poljaZaPrevod, statusStavke } from "@/lib/menu/studio/prevodi-pogled";
import { granicaPrevoda } from "@/lib/menu/studio/prevodi";
import { cleanText } from "@/lib/menu/text";
import { fieldTranslation, type MenuTranslationField, type MenuTranslationStatus } from "@/lib/menu/translation-status";
import { Dugme } from "../../zajednicko/dugme";
import { StatusOznaka, type StatusTon } from "../../zajednicko/status-oznaka";
import { OZNAKA_KLASA, TekstPolje } from "../artikal/polja";
import { AiPredlog, porukaNeuspeha, type PrevodiRadnje } from "./ai-predlog";

const t = menuStudioSr.posebno.prevodi;

const STATUS_PRIKAZ: Record<MenuTranslationStatus, { ton: StatusTon; ikonica?: LucideIcon }> = {
  missing: { ton: "upozorenje" },
  stale: { ton: "upozorenje", ikonica: History },
  suggested: { ton: "info", ikonica: Sparkles },
  done: { ton: "uspeh" },
};

/** The state of an item in words, with its icon: the colour never speaks alone. */
export function StatusPrevoda({ status }: { status: MenuTranslationStatus }) {
  const prikaz = STATUS_PRIKAZ[status];
  return (
    <StatusOznaka ton={prikaz.ton} ikonica={prikaz.ikonica} velicina="mala">
      {t.statusi[status]}
    </StatusOznaka>
  );
}

export function PrevodStavka({
  stavka,
  jezik,
  nazivJezika,
  ai,
  radnje,
  red,
  mozeUredjivanje,
  najavi,
}: {
  stavka: StudioPrevodStavka;
  jezik: string;
  nazivJezika: string;
  ai: StudioJezici["ai"];
  radnje: PrevodiRadnje;
  red: AutosaveRed;
  mozeUredjivanje: boolean;
  najavi: (poruka: string) => void;
}) {
  const id = useId();
  const [proverava, setProverava] = useState(false);
  const [greska, setGreska] = useState<string | null>(null);
  const status = statusStavke(stavka, jezik);
  const polja = poljaZaPrevod(stavka);
  const unos = stavka.prevodi?.[jezik];
  const naziv = stavka.izvor.name ?? stavka.izvor.publicTitle ?? "";
  const imaZastarelo = polja.some((polje) => fieldTranslation(stavka.izvor[polje], unos, polje).status === "stale");
  const izvorNaziv = (t.jezici as Record<string, string>).sr;

  const jeDobar = async () => {
    setProverava(true);
    setGreska(null);
    const ishod = await radnje.prevodJeDobar(cilj(stavka), jezik);
    setProverava(false);
    if (ishod.ok) najavi(t.statusi.done);
    else setGreska(porukaNeuspeha(ishod));
  };

  return (
    <div
      role="group"
      aria-labelledby={`${id}-naslov`}
      data-prevod-stavka={stavka.vrsta}
      data-prevod-status={status ?? "bez-izvora"}
      className="grid min-w-0 gap-3 rounded-[var(--mp-radius-kontrola)] border bg-[var(--mp-povrsina)] px-3 py-3 [--border:var(--mp-ivica)] sm:px-4"
    >
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
        <div className="grid min-w-0 flex-1 gap-0.5">
          <p className="text-xs font-semibold text-[var(--mp-tekst-sporedni)]">{t.vrste[stavka.vrsta]}</p>
          <h3 id={`${id}-naslov`} className="text-base font-semibold leading-snug text-[var(--mp-tekst)] [overflow-wrap:anywhere]">
            {naziv}
          </h3>
          {stavka.pripada ? (
            <p className="text-sm text-[var(--mp-tekst-sporedni)] [overflow-wrap:anywhere]">{fmt(t.pripada, { naziv: stavka.pripada })}</p>
          ) : null}
        </div>
        {status ? <StatusPrevoda status={status} /> : null}
      </div>

      {polja.length === 0 ? <p className="text-sm text-[var(--mp-tekst-sporedni)]">{t.bezIzvora}</p> : null}

      {/* A field that has only a suggestion is edited in the suggestion box below (one field per text, not two). */}
      {polja
        .filter((polje) => fieldTranslation(stavka.izvor[polje], unos, polje).status !== "suggested")
        .map((polje) => (
        <PoljePrevoda
          key={polje}
          stavka={stavka}
          jezik={jezik}
          nazivJezika={nazivJezika}
          izvorNaziv={izvorNaziv}
          polje={polje}
          radnje={radnje}
          red={red}
          mozeUredjivanje={mozeUredjivanje}
        />
      ))}

      {imaZastarelo && mozeUredjivanje ? (
        <div className="grid justify-items-start gap-2">
          <Dugme vrsta="tiho" velicina="kompaktna" ikonica={Check} ucitava={proverava} onClick={jeDobar}>
            {t.jeDobar}
          </Dugme>
          {greska ? (
            <p role="alert" className="text-sm font-medium text-[var(--mp-opasnost)]">
              {greska}
            </p>
          ) : null}
        </div>
      ) : null}

      <AiPredlog stavka={stavka} jezik={jezik} ai={ai} radnje={radnje} mozeUredjivanje={mozeUredjivanje} najavi={najavi} />
    </div>
  );
}

function PoljePrevoda({
  stavka,
  jezik,
  nazivJezika,
  izvorNaziv,
  polje,
  radnje,
  red,
  mozeUredjivanje,
}: {
  stavka: StudioPrevodStavka;
  jezik: string;
  nazivJezika: string;
  izvorNaziv: string;
  polje: MenuTranslationField;
  radnje: Pick<PrevodiRadnje, "prevedi">;
  red: AutosaveRed;
  mozeUredjivanje: boolean;
}) {
  const izvor = stavka.izvor[polje] ?? "";
  const pogled = fieldTranslation(izvor, stavka.prevodi?.[jezik], polje);
  const maks = granicaPrevoda(stavka.vrsta, polje);
  const proveri = (tekst: string): PoljeProvera<string | null> => {
    const vrednost = cleanText(tekst);
    if (vrednost === "") return { ok: true, vrednost: null };
    if (vrednost.length > maks) return { ok: false, greska: "predugo" };
    return { ok: true, vrednost };
  };
  const pomoc =
    pogled.status === "stale" ? t.statusOpis.stale : pogled.status === "missing" ? t.statusOpis.missing : undefined;

  return (
    <div className="grid min-w-0 gap-3 sm:grid-cols-2 sm:gap-4">
      <div
        role="group"
        aria-label={fmt(t.poljeOznaka, { polje: t.polja[polje], jezik: izvorNaziv })}
        className="grid min-w-0 content-start gap-1.5"
      >
        <span aria-hidden="true" className={OZNAKA_KLASA}>
          {t.izvor}
        </span>
        <p className="whitespace-pre-line rounded-[var(--mp-radius-kontrola)] bg-[var(--mp-povrsina-utisana)] px-3 py-2 text-sm leading-relaxed text-[var(--mp-tekst-sporedni)] [overflow-wrap:anywhere]">
          {izvor}
        </p>
      </div>
      <TekstPolje
        oznaka={fmt(t.poljeOznaka, { polje: t.polja[polje], jezik: nazivJezika })}
        vrednost={pogled.confirmed}
        kljuc={kljucPrevoda(stavka, jezik, polje)}
        red={red}
        posalji={(ocekivano, vrednost) =>
          radnje.prevedi(cilj(stavka), jezik, polje, ocekivano as string | null, vrednost as string | null)
        }
        proveri={proveri}
        maks={maks}
        visina={polje === "description" ? "vise" : "red"}
        pomoc={pomoc}
        onemoguceno={!mozeUredjivanje}
      />
    </div>
  );
}
