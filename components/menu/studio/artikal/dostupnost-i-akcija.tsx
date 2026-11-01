"use client";

// ScanMe Menu V1 — availability and promotion of the article (K15; master
// §5.6, §7.6). `Dostupno` / `Privremeno nedostupno` goes to guests at once,
// without Objavi (the only live change of the detail). The promotion is a
// promo price OR a percent — the other value is shown at once — with an
// optional label and an optional start and end; a schedule is Premium, so
// on Standard the time fields are locked with the reason. The promotion goes
// into the draft with `Sačuvaj akciju`.

import { CircleCheck, CircleSlash, Lock, Percent, Plus, Radio, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { fmt } from "@/lib/i18n/format";
import { menuStudioSr } from "@/lib/i18n/sr/menu-studio";
import { formatBelgrade } from "@/lib/belgrade-time";
import { promoStateAt, type MenuPromo, type MenuPromoPriceContext } from "@/lib/menu/promo";
import {
  akcijaIzForme,
  formaIzAkcije,
  izvedeneCene,
  type AkcijaForma,
  type AkcijaGreska,
  type AkcijaNatpis,
} from "@/lib/menu/studio/article-form";
import type { AutosaveRed } from "@/lib/menu/studio/autosave-queue";
import type { StudioDetaljArtikla, StudioIshod, StudioRadnje } from "@/lib/menu/studio/model";
import { formatCenaPolje } from "@/lib/menu/studio/price-input";
import { cn } from "@/lib/utils";
import { Dugme } from "../../zajednicko/dugme";
import { Prekidac } from "../../zajednicko/prekidac";
import { StatusOznaka } from "../../zajednicko/status-oznaka";
import { porukaGreske } from "../red-artikla/red-artikla";
import { IzborSegment, OZNAKA_KLASA, POLJE_KLASA } from "./polja";

const t = menuStudioSr.artikal;
const ak = t.akcija;

function porukaIshoda(ishod: StudioIshod<unknown>): string | null {
  if (ishod.ok) return null;
  if (ishod.vrsta === "konflikt") return fmt(t.konflikt, { sacuvano: ak.naslov });
  return ishod.ponovljivo ? t.nijeSacuvano : (porukaGreske(ishod.kod) ?? t.nijeSacuvano);
}

/** "traje", "počinje 25. 10. u 08:00"… — where a saved promotion stands now. */
export function stanjeAkcije(akcija: MenuPromo, sada: number): string {
  const stanje = promoStateAt(akcija, sada);
  if (stanje === "scheduled") return fmt(ak.stanje.scheduled, { datum: formatBelgrade(akcija.startsAt ?? null) });
  if (stanje === "ended") return fmt(ak.stanje.ended, { datum: formatBelgrade(akcija.endsAt ?? null) });
  return ak.stanje[stanje];
}

export function DostupnostIAkcija({
  detalj,
  kontekstCene,
  nedostupan,
  red,
  radnje,
  mozeUredjivanje,
  mozeDostupnost,
  premium,
  sada,
  najavi,
  pocetnoOtvorena = false,
}: {
  detalj: StudioDetaljArtikla;
  /** The regular prices the promotion applies to (base price, variants). */
  kontekstCene: MenuPromoPriceContext;
  nedostupan: boolean;
  red: AutosaveRed;
  radnje: Pick<StudioRadnje, "postaviDostupnost" | "postaviAkciju">;
  mozeUredjivanje: boolean;
  mozeDostupnost: boolean;
  premium: boolean;
  sada: number;
  najavi: (tekst: string) => void;
  /** The promotion form open from the start (izlog, render tests). */
  pocetnoOtvorena?: boolean;
}) {
  const id = useId();
  const { artikal, akcija } = detalj;
  const [forma, setForma] = useState<AkcijaForma | null>(() => (pocetnoOtvorena ? formaIzAkcije(detalj.akcija, kontekstCene) : null));
  const [greska, setGreska] = useState<AkcijaGreska | null>(null);
  const [poruka, setPoruka] = useState<string | null>(null);
  const [radi, setRadi] = useState(false);
  const [dostupnost, setDostupnost] = useState<{ radi: boolean; poruka: string | null }>({ radi: false, poruka: null });
  const saVarijantama = kontekstCene.variantsEnabled && kontekstCene.variants.length > 0;

  const promeniDostupnost = async (dostupno: boolean) => {
    if (dostupno === !nedostupan) return;
    setDostupnost({ radi: true, poruka: null });
    const ishod = await red.prati(() => radnje.postaviDostupnost([artikal.id], dostupno));
    setDostupnost({ radi: false, poruka: porukaIshoda(ishod) });
    if (ishod.ok) najavi(dostupno ? t.dostupnost.najavaDostupno : t.dostupnost.najavaNedostupno);
  };

  const sacuvaj = async (sledeca: MenuPromo | null) => {
    setRadi(true);
    const ishod = await red.prati(() => radnje.postaviAkciju(artikal.id, akcija, sledeca));
    setRadi(false);
    const problem = porukaIshoda(ishod);
    setPoruka(problem);
    if (!problem) {
      setForma(null);
      setGreska(null);
      najavi(sledeca === null ? ak.uklonjena : ak.sacuvano);
    }
  };

  const sacuvajFormu = () => {
    if (!forma) return;
    const rezultat = akcijaIzForme(forma, kontekstCene, premium);
    if (!rezultat.ok) {
      setGreska(rezultat.greska);
      return;
    }
    setGreska(null);
    void sacuvaj(rezultat.akcija);
  };

  const otvorena = forma ?? null;
  const cene = otvorena ? izvedeneCene(otvorena, kontekstCene) : null;
  const tekstGreske = (vrsta: AkcijaGreska) =>
    vrsta === "cena" ? fmt(ak.greske.cena, { cena: formatCenaPolje(kontekstCene.basePriceRsd) }) : ak.greske[vrsta];

  return (
    <div className="grid gap-6">
      <section aria-labelledby={`${id}-dostupnost`} className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 id={`${id}-dostupnost`} className="text-[0.9375rem] font-semibold">
            {t.dostupnost.naslov}
          </h3>
          <StatusOznaka ton="info" ikonica={Radio} velicina="mala">
            {t.dostupnost.uzivo}
          </StatusOznaka>
        </div>
        <p id={`${id}-dostupnost-opis`} className="text-sm text-[var(--mp-tekst)]">
          {t.dostupnost.opis}
        </p>
        {/* Buttons, not radios: an arrow key must never change what guests see. */}
        <div role="group" aria-labelledby={`${id}-dostupnost`} aria-describedby={`${id}-dostupnost-opis`} className="flex flex-wrap gap-2" data-dostupnost="">
          {([true, false] as const).map((dostupno) => {
            const izabrano = dostupno === !nedostupan;
            return (
              <Dugme
                key={String(dostupno)}
                vrsta="sekundarno"
                velicina="kompaktna"
                ikonica={dostupno ? CircleCheck : CircleSlash}
                aria-pressed={izabrano}
                disabled={!mozeDostupnost}
                ucitava={dostupnost.radi && !izabrano}
                onClick={() => void promeniDostupnost(dostupno)}
                className={cn("max-sm:flex-1", izabrano && "[--border:var(--mp-mastilo)] bg-[var(--mp-akcent-meko)]")}
              >
                {dostupno ? t.dostupnost.dostupno : t.dostupnost.nedostupno}
              </Dugme>
            );
          })}
        </div>
        {dostupnost.poruka ? (
          <p role="alert" className="text-sm font-medium text-[var(--mp-opasnost)]">
            {dostupnost.poruka}
          </p>
        ) : null}
      </section>

      <section aria-labelledby={`${id}-akcija`} className="grid gap-3 border-t pt-5 [--border:var(--mp-ivica)]" data-akcija="">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 id={`${id}-akcija`} className="text-[0.9375rem] font-semibold">
            {ak.naslov}
          </h3>
          {akcija && !otvorena ? <span className="text-sm font-medium">{stanjeAkcije(akcija, sada)}</span> : null}
        </div>

        {!otvorena ? (
          akcija ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--mp-radius-kontrola)] border px-3 py-2.5 [--border:var(--mp-ivica)]">
              <p className="text-[0.9375rem] font-medium">
                {akcija.mode === "percent"
                  ? fmt(ak.sazetakProcenat, { n: akcija.percent ?? 0 })
                  : fmt(ak.sazetakCena, { cena: formatCenaPolje(akcija.priceRsd ?? null) })}
                {akcija.label ? ` · ${ak.natpisi[akcija.label]}` : ""}
              </p>
              {mozeUredjivanje ? (
                <Dugme vrsta="sekundarno" velicina="kompaktna" onClick={() => setForma(formaIzAkcije(akcija, kontekstCene))} data-uredi-akciju="">
                  {ak.izmeni}
                </Dugme>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-[var(--mp-tekst-sporedni)]">{ak.nema}</p>
              {mozeUredjivanje ? (
                <Dugme vrsta="sekundarno" velicina="kompaktna" ikonica={Plus} onClick={() => setForma(formaIzAkcije(null, kontekstCene))} data-dodaj-akciju="">
                  {ak.dodaj}
                </Dugme>
              ) : null}
            </div>
          )
        ) : (
          <div className="grid gap-4">
            <Prekidac
              naziv={ak.ukljucena}
              opis={ak.ukljucenaOpis}
              checked={otvorena.aktivna}
              onChange={(event) => setForma({ ...otvorena, aktivna: event.target.checked })}
            />
            <IzborSegment<"price" | "percent">
              oznaka={ak.nacin}
              izabrano={otvorena.nacin}
              onIzbor={(nacin) => setForma({ ...otvorena, nacin, vrednost: "" })}
              vrednosti={[
                { vrednost: "price", tekst: ak.cena, onemoguceno: saVarijantama },
                { vrednost: "percent", tekst: ak.procenat },
              ]}
            />
            {saVarijantama ? <p className="-mt-2 text-sm text-[var(--mp-tekst-sporedni)]">{ak.varijanteCena}</p> : null}
            <div className="grid gap-1.5 sm:max-w-[16rem]">
              <label htmlFor={`${id}-vrednost`} className={OZNAKA_KLASA}>
                {otvorena.nacin === "price" ? ak.vrednostCena : ak.vrednostProcenat}
              </label>
              <span className="relative">
                <input
                  id={`${id}-vrednost`}
                  value={otvorena.vrednost}
                  inputMode="numeric"
                  autoComplete="off"
                  aria-invalid={greska === "vrednost" || greska === "cena" || greska === "procenat" ? true : undefined}
                  aria-describedby={`${id}-izvedeno`}
                  onChange={(event) => setForma({ ...otvorena, vrednost: event.target.value })}
                  className={cn(POLJE_KLASA, "h-[var(--mp-meta)] pr-12 text-right tabular-nums")}
                  data-vrednost-akcije=""
                />
                <span aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-[var(--mp-tekst-sporedni)]">
                  {otvorena.nacin === "price" ? menuStudioSr.red.rsd : <Percent className="size-3.5" strokeWidth={2} />}
                </span>
              </span>
              <p id={`${id}-izvedeno`} role="status" className="text-sm font-medium" data-izvedeno="">
                {cene && cene.length > 0
                  ? cene.length === 1 || !saVarijantama
                    ? fmt(ak.izvedeno, {
                        stara: formatCenaPolje(cene[0].regularRsd),
                        nova: formatCenaPolje(cene[0].promoRsd),
                        procenat: cene[0].percent,
                      })
                    : cene
                        .map((cena) =>
                          fmt(ak.izvedenoVarijanta, {
                            naziv: detalj.varijante.find((v) => v.key === cena.key)?.naziv ?? "",
                            stara: formatCenaPolje(cena.regularRsd),
                            nova: formatCenaPolje(cena.promoRsd),
                          }),
                        )
                        .join(" · ")
                  : ""}
              </p>
            </div>
            <IzborSegment<AkcijaNatpis>
              oznaka={ak.natpis}
              izabrano={otvorena.natpis}
              onIzbor={(natpis) => setForma({ ...otvorena, natpis })}
              vrednosti={[
                { vrednost: "promo", tekst: ak.natpisi.promo },
                { vrednost: "recommended", tekst: ak.natpisi.recommended },
                { vrednost: "bez", tekst: ak.natpisi.bez },
              ]}
            />
            <fieldset className="grid gap-2" disabled={!premium} data-termin-akcije={premium ? "" : "zakljucano"}>
              <legend className="mb-1 flex flex-wrap items-center gap-2">
                <span className={OZNAKA_KLASA}>{ak.termin}</span>
                {premium ? null : (
                  <StatusOznaka ton="neutralno" ikonica={Lock} velicina="mala">
                    {ak.premium}
                  </StatusOznaka>
                )}
              </legend>
              <p id={`${id}-termin-opis`} className={cn("text-sm", premium ? "text-[var(--mp-tekst-sporedni)]" : "text-[var(--mp-tekst)]")}>
                {premium ? ak.terminOpis : ak.premiumRazlog}
              </p>
              {premium ? (
              <div className="grid gap-3 sm:grid-cols-2 sm:max-w-[32rem]">
                {(["pocetak", "kraj"] as const).map((polje) => (
                  <div key={polje} className="grid gap-1.5">
                    <label htmlFor={`${id}-${polje}`} className={OZNAKA_KLASA}>
                      {ak[polje]}
                    </label>
                    <input
                      id={`${id}-${polje}`}
                      type="datetime-local"
                      value={otvorena[polje]}
                      aria-describedby={`${id}-termin-opis`}
                      onChange={(event) => setForma({ ...otvorena, [polje]: event.target.value })}
                      className={cn(POLJE_KLASA, "h-[var(--mp-meta)]")}
                    />
                  </div>
                ))}
              </div>
              ) : null}
            </fieldset>
            {!premium && (otvorena.pocetak !== "" || otvorena.kraj !== "") ? (
              <span>
                <Dugme vrsta="tiho" velicina="kompaktna" onClick={() => setForma({ ...otvorena, pocetak: "", kraj: "" })}>
                  {ak.ukloniTermin}
                </Dugme>
              </span>
            ) : null}
            {greska ? (
              <p role="alert" className="text-sm font-medium text-[var(--mp-opasnost)]" data-greska-akcije={greska}>
                {tekstGreske(greska)}
              </p>
            ) : null}
            <span className="flex flex-wrap gap-2">
              <Dugme vrsta="primarno" velicina="kompaktna" ucitava={radi} onClick={sacuvajFormu} data-sacuvaj-akciju="">
                {ak.sacuvaj}
              </Dugme>
              {akcija ? (
                <Dugme vrsta="tiho" velicina="kompaktna" ikonica={Trash2} disabled={radi} onClick={() => void sacuvaj(null)}>
                  {ak.ukloni}
                </Dugme>
              ) : null}
              <Dugme
                vrsta="tiho"
                velicina="kompaktna"
                onClick={() => {
                  setForma(null);
                  setGreska(null);
                }}
              >
                {ak.otkazi}
              </Dugme>
            </span>
          </div>
        )}
        {poruka ? (
          <p role="alert" className="text-sm font-medium text-[var(--mp-opasnost)]">
            {poruka}
          </p>
        ) : null}
      </section>
    </div>
  );
}
