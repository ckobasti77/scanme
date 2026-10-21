"use client";

// ScanMe Menu V1 — allergens and tags of the article (K15; master §7.3, §5.5).
// Allergens show only when the venue keeps them (an optional system of the
// venue, never a required field): the 14 categories and `Drugo`, with
// `Sadrži` and `Može sadržati tragove` kept apart. Nothing ticked is "not
// entered" — never "without allergens", and the editor says so. `Drugo` needs
// a short description. Tags are a closed, curated list. Every change is saved
// into the draft by itself (compare-and-set on what was last seen).

import { Check, Eraser } from "lucide-react";
import { useId, useState } from "react";
import { fmt } from "@/lib/i18n/format";
import { menuDomenSr } from "@/lib/i18n/sr/menu-domen";
import { menuStudioSr } from "@/lib/i18n/sr/menu-studio";
import { MENU_ALLERGEN_CODES, kanonskiAlergeni, type MenuAllergenCode } from "@/lib/menu/allergens";
import { MENU_TEXT } from "@/lib/menu/limits";
import type { AutosaveRed } from "@/lib/menu/studio/autosave-queue";
import type { StudioAlergeni, StudioDetaljArtikla, StudioRadnje } from "@/lib/menu/studio/model";
import { MENU_TAG_CODES } from "@/lib/menu/tags";
import { cn } from "@/lib/utils";
import { Dugme } from "../../zajednicko/dugme";
import { OZNAKA_KLASA, POLJE_KLASA, ProblemKljuca, StanjeKljuca } from "./polja";

const t = menuStudioSr.artikal;
const a = t.alergeni;

const PRAZNO: StudioAlergeni = { sadrzi: [], tragovi: [], drugo: null };

/** A saved record in words, for a conflict ("Sadrži: Jaja, Mleko…"). */
function opisZapisa(zapis: StudioAlergeni | null): string {
  if (!zapis) return t.bezVrednosti;
  const imena = (kodovi: string[]) => kodovi.map((kod) => menuDomenSr.allergens[kod as MenuAllergenCode] ?? kod).join(", ");
  return [
    zapis.sadrzi.length > 0 ? `${a.sadrzi}: ${imena(zapis.sadrzi)}` : "",
    zapis.tragovi.length > 0 ? `${a.tragovi}: ${imena(zapis.tragovi)}` : "",
  ]
    .filter(Boolean)
    .join("; ");
}
const json = (alergeni: StudioAlergeni | null) => JSON.stringify(kanonskiAlergeni(alergeni));
const izJsona = (vrednost: unknown): StudioAlergeni | null =>
  typeof vrednost === "string" ? (JSON.parse(vrednost) as StudioAlergeni | null) : null;

export function AlergeniIOznake({
  detalj,
  red,
  radnje,
  mozeUredjivanje,
}: {
  detalj: StudioDetaljArtikla;
  red: AutosaveRed;
  radnje: Pick<StudioRadnje, "postaviAlergene" | "postaviOznake">;
  mozeUredjivanje: boolean;
}) {
  const { artikal } = detalj;
  const id = useId();
  const kljucA = `alergeni:${artikal.id}`;
  const kljucO = `oznake:${artikal.id}`;
  // Only while "Drugo" is ticked without a description: the choice waits on screen, unsaved.
  const [cekaOpis, setCekaOpis] = useState<StudioAlergeni | null>(null);
  const naCekanju = red.stanje(kljucA);
  const zapis = cekaOpis ?? (naCekanju ? izJsona(naCekanju.vrednost) : detalj.alergeni) ?? PRAZNO;
  const imaDrugo = zapis.sadrzi.includes("other") || zapis.tragovi.includes("other");
  const nijeUneto = zapis.sadrzi.length === 0 && zapis.tragovi.length === 0;

  const sacuvaj = (sledece: StudioAlergeni, odlozi = 0) => {
    const drugo = sledece.sadrzi.includes("other") || sledece.tragovi.includes("other");
    if (drugo && (sledece.drugo ?? "").trim() === "") {
      setCekaOpis(sledece);
      return;
    }
    setCekaOpis(null);
    red.zakazi(kljucA, {
      ocekivano: json(detalj.alergeni),
      vrednost: json(sledece),
      odlozi,
      posalji: (o, v) => radnje.postaviAlergene(artikal.id, izJsona(o), izJsona(v)),
    });
  };

  const prebaci = (lista: "sadrzi" | "tragovi", kod: MenuAllergenCode) => {
    const ima = zapis[lista].includes(kod);
    const druga = lista === "sadrzi" ? "tragovi" : "sadrzi";
    // A code is in one list at most: ticking it in one takes it out of the other.
    sacuvaj({
      ...zapis,
      [lista]: ima ? zapis[lista].filter((c) => c !== kod) : [...zapis[lista], kod],
      [druga]: ima ? zapis[druga] : zapis[druga].filter((c) => c !== kod),
    });
  };

  const oznakeNaCekanju = red.stanje(kljucO);
  const oznake = oznakeNaCekanju && typeof oznakeNaCekanju.vrednost === "string"
    ? oznakeNaCekanju.vrednost.split(",").filter(Boolean)
    : detalj.oznake;
  const prebaciOznaku = (kod: string) => {
    const sledece = oznake.includes(kod) ? oznake.filter((c) => c !== kod) : [...oznake, kod];
    const kanonske = MENU_TAG_CODES.filter((c) => sledece.includes(c));
    red.zakazi(kljucO, {
      ocekivano: detalj.oznake.join(","),
      vrednost: kanonske.join(","),
      posalji: (o, v) => radnje.postaviOznake(artikal.id, String(o).split(",").filter(Boolean), String(v).split(",").filter(Boolean)),
    });
  };

  const polje = (vrsta: "sadrzi" | "tragovi", kod: MenuAllergenCode) => (
    <td className="w-[5.5rem] p-0 text-center sm:w-[9rem]">
      <label className="relative mx-auto grid size-[var(--mp-meta)] cursor-pointer place-items-center rounded-[var(--mp-radius-kontrola)] hover:bg-[var(--mp-povrsina-utisana)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--mp-fokus)] has-[:disabled]:cursor-not-allowed">
        <input
          type="checkbox"
          checked={zapis[vrsta].includes(kod)}
          disabled={!mozeUredjivanje}
          aria-label={fmt(a.oznakaPolja, { vrsta: vrsta === "sadrzi" ? a.sadrzi : a.tragovi, naziv: menuDomenSr.allergens[kod] })}
          onChange={() => prebaci(vrsta, kod)}
          className="size-5 cursor-[inherit] accent-[var(--mp-mastilo)]"
          data-alergen={`${vrsta}:${kod}`}
        />
      </label>
    </td>
  );

  const tabela = (
    <table className="w-full border-collapse text-[0.9375rem]" data-alergeni-tabela="">
      <caption className="sr-only">{a.naslov}</caption>
      <thead>
        <tr className="border-b text-left align-bottom [--border:var(--mp-ivica)]">
          <th scope="col" className="py-2 pr-2 font-semibold">
            {a.alergen}
          </th>
          <th scope="col" className="px-1 py-2 text-center">
            <span className="block font-semibold">{a.sadrzi}</span>
            <span className="hidden text-xs font-normal text-[var(--mp-tekst-sporedni)] sm:block">{a.sadrziOpis}</span>
          </th>
          <th scope="col" className="px-1 py-2 text-center">
            <span className="block font-semibold">{a.tragovi}</span>
            <span className="hidden text-xs font-normal text-[var(--mp-tekst-sporedni)] sm:block">{a.tragoviOpis}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {MENU_ALLERGEN_CODES.map((kod) => {
          const oznacen = zapis.sadrzi.includes(kod) || zapis.tragovi.includes(kod);
          return (
            <tr key={kod} className={cn("border-b [--border:var(--mp-ivica)] last:border-b-0", oznacen && "bg-[var(--mp-akcent-meko)]")}>
              <th scope="row" className={cn("py-1 pr-2 text-left leading-snug", oznacen ? "font-semibold" : "font-normal")}>
                {menuDomenSr.allergens[kod]}
              </th>
              {polje("sadrzi", kod)}
              {polje("tragovi", kod)}
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  return (
    <div className="grid gap-6">
      {detalj.alergeniUkljuceni ? (
        <section aria-labelledby={`${id}-alergeni`} className="grid gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 id={`${id}-alergeni`} className="text-[0.9375rem] font-semibold">
              {a.naslov}
            </h3>
            <StanjeKljuca red={red} kljuc={kljucA} />
          </div>
          <p
            className={cn(
              "rounded-[var(--mp-radius-kontrola)] border px-3 py-2 text-sm leading-relaxed [--border:var(--mp-info-ivica)] bg-[var(--mp-info-meko)]",
              !nijeUneto && "sr-only",
            )}
            data-alergeni-nisu-uneti={nijeUneto ? "" : undefined}
          >
            {a.nepoznato}
          </p>
          {tabela}
          {imaDrugo ? (
            <div className="grid gap-1.5 sm:max-w-[26rem]">
              <label htmlFor={`${id}-drugo`} className={OZNAKA_KLASA}>
                {a.drugo}
              </label>
              <input
                id={`${id}-drugo`}
                value={zapis.drugo ?? ""}
                maxLength={MENU_TEXT.allergenOtherText}
                placeholder={a.drugoPrimer}
                disabled={!mozeUredjivanje}
                aria-invalid={cekaOpis ? true : undefined}
                aria-describedby={cekaOpis ? `${id}-drugo-greska` : undefined}
                onChange={(event) => sacuvaj({ ...zapis, drugo: event.target.value }, 800)}
                onBlur={() => red.isprazni(kljucA)}
                className={cn(POLJE_KLASA, "h-[var(--mp-meta)]")}
              />
              {cekaOpis ? (
                <p id={`${id}-drugo-greska`} role="alert" className="text-sm font-medium text-[var(--mp-opasnost)]">
                  {a.drugoObavezno}
                </p>
              ) : null}
            </div>
          ) : null}
          <ProblemKljuca red={red} kljuc={kljucA} prikaz={(v) => opisZapisa(izJsona(v))} />
          {!nijeUneto && mozeUredjivanje ? (
            <span>
              <Dugme vrsta="tiho" velicina="kompaktna" ikonica={Eraser} onClick={() => sacuvaj(PRAZNO)}>
                {a.obrisi}
              </Dugme>
            </span>
          ) : null}
        </section>
      ) : null}

      <section aria-labelledby={`${id}-oznake`} className={cn("grid gap-2", detalj.alergeniUkljuceni && "border-t pt-5 [--border:var(--mp-ivica)]")}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 id={`${id}-oznake`} className="text-[0.9375rem] font-semibold">
            {t.oznake.naslov}
          </h3>
          <StanjeKljuca red={red} kljuc={kljucO} />
        </div>
        <p className="text-sm text-[var(--mp-tekst-sporedni)]">{t.oznake.opis}</p>
        <fieldset className="flex flex-wrap gap-2" disabled={!mozeUredjivanje} aria-labelledby={`${id}-oznake`} data-oznake="">
          {MENU_TAG_CODES.map((kod) => {
            const izabrana = oznake.includes(kod);
            return (
              <label
                key={kod}
                className={cn(
                  "relative inline-flex min-h-[var(--mp-meta)] cursor-pointer items-center rounded-[var(--mp-radius-dugme)] border px-4 text-sm font-semibold",
                  "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--mp-fokus)] has-[:disabled]:cursor-not-allowed has-[:disabled]:text-[var(--mp-tekst-sporedni)]",
                  izabrana ? "[--border:var(--mp-mastilo)] bg-[var(--mp-akcent-meko)]" : "[--border:var(--mp-ivica-kontrole)] hover:bg-[var(--mp-povrsina-utisana)]",
                )}
              >
                <input
                  type="checkbox"
                  checked={izabrana}
                  onChange={() => prebaciOznaku(kod)}
                  className="absolute inset-0 m-0 size-full cursor-[inherit] appearance-none opacity-0"
                />
                {izabrana ? <Check aria-hidden="true" strokeWidth={2.25} className="mr-1.5 size-4" /> : null}
                {menuDomenSr.tags[kod]}
              </label>
            );
          })}
        </fieldset>
        <ProblemKljuca red={red} kljuc={kljucO} prikaz={(v) => String(v ?? "").split(",").filter(Boolean).map((k) => menuDomenSr.tags[k as keyof typeof menuDomenSr.tags] ?? k).join(", ") || t.bezVrednosti} />
      </section>
    </div>
  );
}
