"use client";

// ScanMe Menu V1 (K28) — Podešavanja > Jezici (master §7.7; plan
// docs/meni/planovi/K24.md §4.7): the languages the guests can read the menu in.
// Serbian is the source and always first; the translations are a short list the
// owner adds to and removes from, then saves. The limit counts Serbian too:
// Standard has two languages in all, Premium has no limit. Past the limit the
// add control stays in the page, locked, with the reason written next to it. An
// account that lost Premium may already hold more than the limit: it can only
// remove. A change goes into the draft and guests see it after publishing.
// Presentational: the route passes the stored list, the limit and `onSacuvaj`.
//
// The list starts from `prevodi` and is not reset when it changes under it.

import { Lock, Plus, X } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { fmt } from "@/lib/i18n/format";
import { menuPanelSr } from "@/lib/i18n/sr/menu-panel";
import { menuStudioPosebnoSr } from "@/lib/i18n/sr/menu-studio-posebno";
import { MENU_SOURCE_LANGUAGE } from "@/lib/menu/languages";
import {
  addLanguage,
  canAddLanguage,
  isOverLanguageLimit,
  remainingLanguages,
  removeLanguage,
} from "@/lib/menu/settings-view";
import { cn } from "@/lib/utils";
import { POLJE_KLASA, Napomena, Polje, PorukaGreske } from "../../lokal/zajednicko";
import { Dugme, IkonicaDugme } from "../../zajednicko/dugme";
import { Kartica } from "../../zajednicko/kartica";
import { OkvirSekcije } from "../../zajednicko/okvir-sekcije";
import { StatusOznaka } from "../../zajednicko/status-oznaka";
import { CuvanjeStatus, porukaKoda, useCuvanje, type SacuvajIshod } from "../cuvanje";

const t = menuPanelSr.podesavanja.jezici;
const IMENA: Record<string, string | undefined> = menuStudioPosebnoSr.prevodi.jezici;

/** "engleski" → "Engleski": the name as the list shows it. */
export function imeJezika(kod: string): string {
  const ime = IMENA[kod] ?? kod;
  return ime.charAt(0).toLocaleUpperCase("sr-Latn") + ime.slice(1);
}

export type JeziciProps = {
  /** The saved translation languages (without Serbian), in the order the guests see them. */
  prevodi: string[];
  /** The most languages the account may have, Serbian included. */
  maxJezika: number;
  plan: "standard" | "premium";
  /** The role may edit settings. */
  moze: boolean;
  /** Why it is off; written on the screen when `moze` is false. */
  razlog?: string;
  onSacuvaj: (prevodi: string[]) => Promise<SacuvajIshod>;
  nivo?: 2 | 3;
};

export function Jezici({ prevodi, maxJezika, plan, moze, razlog, onSacuvaj, nivo = 2 }: JeziciProps) {
  const id = useId();
  const izborId = `${id}-izbor`;
  const razlogId = `${id}-razlog`;
  const premiumId = `${id}-premium`;
  const sacuvajId = `${id}-sacuvaj`;
  const [lista, setLista] = useState<string[]>(prevodi);
  const [izbor, setIzbor] = useState("");
  const { faza, kod, pokreni, izmenjeno } = useCuvanje();

  const preostali = remainingLanguages(lista);
  const iznad = isOverLanguageLimit(lista, maxJezika);
  const moguDaDodam = canAddLanguage(lista, maxJezika);
  // Standard at its limit: the control is locked and says why. Premium never meets a commercial limit.
  const zakljucano = plan === "standard" && !moguDaDodam && preostali.length > 0;
  const izabrano = preostali.includes(izbor) ? izbor : "";
  const iskljuceno = !moze;

  const dodaj = () => {
    if (iskljuceno || !moguDaDodam) return;
    if (izabrano === "") {
      document.getElementById(izborId)?.focus();
      return;
    }
    setLista(addLanguage(lista, izabrano, maxJezika));
    setIzbor("");
    izmenjeno();
  };

  const ukloni = (jezik: string) => {
    if (iskljuceno) return;
    setLista(removeLanguage(lista, jezik));
    izmenjeno();
    // The removed row's button is gone: keep the keyboard where the work continues.
    queueMicrotask(() => {
      const izborPolje = document.getElementById(izborId);
      (izborPolje instanceof HTMLSelectElement && !izborPolje.disabled ? izborPolje : document.getElementById(sacuvajId))?.focus();
    });
  };

  const sacuvaj = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (iskljuceno) return;
    await pokreni(() => onSacuvaj(lista));
  };

  const opisaniRazlogom = iskljuceno && razlog ? razlogId : undefined;

  return (
    <Kartica data-jezici="">
      <OkvirSekcije naslov={t.naslov} opis={t.opis} nivo={nivo}>
        <form noValidate onSubmit={sacuvaj} className="grid gap-5">
          <ul className="grid gap-2" data-jezici-lista="">
            <li className="flex min-h-[var(--mp-meta)] items-center gap-3 rounded-[var(--mp-radius-kontrola)] border px-3 [--border:var(--mp-ivica)] bg-[var(--mp-povrsina-utisana)]">
              <span className="min-w-0 flex-1 text-[0.9375rem] font-semibold text-[var(--mp-tekst)]">
                {imeJezika(MENU_SOURCE_LANGUAGE)}
              </span>
              <StatusOznaka ton="neutralno" velicina="mala">
                {t.izvorni}
              </StatusOznaka>
            </li>
            {lista.map((jezik) => (
              <li
                key={jezik}
                className="flex min-h-[var(--mp-meta)] items-center gap-3 rounded-[var(--mp-radius-kontrola)] border py-0.5 pl-3 pr-0.5 [--border:var(--mp-ivica)] bg-[var(--mp-povrsina)]"
              >
                <span className="min-w-0 flex-1 text-[0.9375rem] font-medium text-[var(--mp-tekst)]">
                  {imeJezika(jezik)}
                </span>
                <IkonicaDugme
                  ikonica={X}
                  oznaka={fmt(t.ukloni, { jezik: (IMENA[jezik] ?? jezik).toLocaleLowerCase("sr-Latn") })}
                  disabled={iskljuceno}
                  onClick={() => ukloni(jezik)}
                />
              </li>
            ))}
          </ul>
          {lista.length === 0 ? <p className="text-sm text-[var(--mp-tekst-sporedni)]">{t.nemaPrevoda}</p> : null}

          {preostali.length > 0 ? (
            <div className="grid gap-3">
              <div className="flex flex-wrap items-end gap-3">
                <Polje id={izborId} oznaka={t.izaberi} className="min-w-0 flex-1 basis-48">
                  {(aria) => (
                    <select
                      {...aria}
                      value={izabrano}
                      disabled={iskljuceno || zakljucano || !moguDaDodam}
                      aria-describedby={zakljucano ? premiumId : opisaniRazlogom}
                      onChange={(event) => setIzbor(event.target.value)}
                      className={POLJE_KLASA}
                    >
                      <option value="">{t.izaberi}</option>
                      {preostali.map((jezik) => (
                        <option key={jezik} value={jezik}>
                          {imeJezika(jezik)}
                        </option>
                      ))}
                    </select>
                  )}
                </Polje>
                <Dugme
                  vrsta="sekundarno"
                  ikonica={zakljucano ? Lock : Plus}
                  disabled={iskljuceno || (!zakljucano && !moguDaDodam)}
                  aria-disabled={zakljucano || undefined}
                  aria-describedby={zakljucano ? premiumId : opisaniRazlogom}
                  onClick={zakljucano ? undefined : dodaj}
                  className={cn(zakljucano && "opacity-60")}
                >
                  {t.dodaj}
                </Dugme>
              </div>

              {plan === "standard" ? (
                <p className="text-sm leading-snug text-[var(--mp-tekst-sporedni)]">{t.standardLimit}</p>
              ) : null}

              {zakljucano ? (
                <div
                  id={premiumId}
                  data-jezici-zakljucano=""
                  className="grid justify-items-start gap-2 rounded-[var(--mp-radius-kontrola)] border p-3 [--border:var(--mp-ivica)] bg-[var(--mp-povrsina-utisana)]"
                >
                  <StatusOznaka ton="neutralno" ikonica={Lock} velicina="mala">
                    {t.premiumOznaka}
                  </StatusOznaka>
                  <p className="text-sm leading-relaxed text-[var(--mp-tekst)]">{t.premiumRazlog}</p>
                </div>
              ) : null}
            </div>
          ) : null}

          {iznad ? <Napomena>{t.iznadLimita}</Napomena> : null}

          <Napomena>{t.krozObjavu}</Napomena>

          {iskljuceno && razlog ? (
            <p id={razlogId} className="text-sm leading-relaxed text-[var(--mp-tekst)]">
              {razlog}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Dugme
              id={sacuvajId}
              type="submit"
              vrsta="primarno"
              ucitava={faza === "cuva"}
              disabled={iskljuceno}
              aria-describedby={opisaniRazlogom}
            >
              {t.sacuvaj}
            </Dugme>
            <CuvanjeStatus faza={faza} cuva={t.cuva} sacuvano={t.sacuvano} />
          </div>
          {faza === "greska" && kod !== null ? <PorukaGreske>{porukaKoda(kod, t.greska)}</PorukaGreske> : null}
        </form>
      </OkvirSekcije>
    </Kartica>
  );
}
