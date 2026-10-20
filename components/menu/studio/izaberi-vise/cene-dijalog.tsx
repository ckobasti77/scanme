"use client";

// ScanMe Menu V1 — `Promeni cene` for the selection (K11; master §5.3, K09
// §4.5). A percentage up or down, an amount added or taken away, or one price
// for all. Before anything is written the dialog shows, for EVERY article,
// the old price, the new one and the difference (whole dinars, rounded half
// up), the articles that are skipped and why, and the rows that would be
// invalid (below 0 or above 1.000.000 RSD), which block the change. The change
// goes into the draft in one call; if any price changed meanwhile nothing is
// written and the preview refreshes. Nothing is published.

import { useId, useState, type ReactNode } from "react";
import { fmt, srPluralCategory } from "@/lib/i18n/format";
import { menuStudioSr } from "@/lib/i18n/sr/menu-studio";
import {
  izmeneCena,
  parseProcenat,
  planCena,
  proveriPromenu,
  type CenaArtikla,
  type GreskaPromene,
  type PromenaCene,
  type SmerPromene,
} from "@/lib/menu/bulk-price";
import type { StudioCeneRezultat, StudioIshod, StudioPromenaCene } from "@/lib/menu/studio/model";
import { izabranoTekst } from "./traka-izbora";
import { formatCenaPolje, parseCenaUnos } from "@/lib/menu/studio/price-input";
import { cn } from "@/lib/utils";
import { Dugme } from "../../zajednicko/dugme";
import { StudioDijalog } from "../dijalog";
import { porukaGreske, tekstCene } from "../red-artikla/red-artikla";

const t = menuStudioSr;

type Nacin = PromenaCene["nacin"];

export type CenePocetno = { nacin: Nacin; smer?: SmerPromene; vrednost: string };

/** What the owner typed as a change, or why it is not one yet (null text = nothing typed). */
export function promenaIzUnosa(
  nacin: Nacin,
  smer: SmerPromene,
  tekst: string,
): { ok: true; promena: PromenaCene } | { ok: false; greska: GreskaPromene | "prazno" } {
  if (tekst.trim() === "") return { ok: false, greska: "prazno" };
  if (nacin === "procenat") {
    const vrednost = parseProcenat(tekst);
    if (vrednost === null) return { ok: false, greska: /[.,]\d{3,}/.test(tekst) ? "procenat_decimale" : "procenat_opseg" };
    const promena: PromenaCene = { nacin, smer, vrednost };
    const greska = proveriPromenu(promena);
    return greska ? { ok: false, greska } : { ok: true, promena };
  }
  const unos = parseCenaUnos(tekst);
  if (!unos.ok || unos.cena === null) {
    if (nacin === "ista") return { ok: false, greska: "cena_neispravna" };
    return { ok: false, greska: !unos.ok && unos.greska === "decimale" ? "iznos_ceo" : "iznos_opseg" };
  }
  const promena: PromenaCene = nacin === "iznos" ? { nacin, smer, vrednost: unos.cena } : { nacin, vrednost: unos.cena };
  const greska = proveriPromenu(promena);
  return greska ? { ok: false, greska } : { ok: true, promena };
}

/** "+48", "−22" (the column says RSD), "—" when there was no price. */
export function razlikaTekst(razlika: number | null): string {
  if (razlika === null) return "—";
  const znak = razlika > 0 ? "+" : razlika < 0 ? "−" : "";
  return `${znak}${formatCenaPolje(Math.abs(razlika))}`;
}

function Izbor<V extends string>({
  legenda,
  ime,
  vrednost,
  opcije,
  onIzbor,
}: {
  legenda: string;
  ime: string;
  vrednost: V;
  opcije: readonly { vrednost: V; tekst: string }[];
  onIzbor: (vrednost: V) => void;
}) {
  return (
    <fieldset className="grid gap-1.5">
      <legend className="mb-1.5 text-sm font-medium">{legenda}</legend>
      <div className="flex flex-wrap gap-2">
        {opcije.map((opcija) => (
          <label
            key={opcija.vrednost}
            className={cn(
              "relative flex min-h-[var(--mp-meta)] cursor-pointer items-center rounded-[var(--mp-radius-dugme)] border px-4 text-sm font-medium",
              "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--mp-fokus)]",
              opcija.vrednost === vrednost
                ? "[--border:var(--mp-mastilo)] bg-[var(--mp-mastilo)] text-[var(--mp-na-mastilu)]"
                : "[--border:var(--mp-ivica-kontrole)] bg-[var(--mp-povrsina)] hover:bg-[var(--mp-povrsina-utisana)]",
            )}
          >
            <input
              type="radio"
              name={ime}
              value={opcija.vrednost}
              checked={opcija.vrednost === vrednost}
              onChange={() => onIzbor(opcija.vrednost)}
              className="absolute inset-0 m-0 cursor-pointer appearance-none opacity-0"
            />
            {opcija.tekst}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function CeneDijalog({
  otvoreno,
  onOtvoreno,
  artikli,
  pocetno,
  onPrimeni,
  onGotovo,
}: {
  otvoreno: boolean;
  onOtvoreno: (otvoreno: boolean) => void;
  /** The selected articles with the prices shown now. */
  artikli: readonly CenaArtikla[];
  pocetno?: CenePocetno | null;
  onPrimeni: (izmene: StudioPromenaCene[]) => Promise<StudioIshod<StudioCeneRezultat>>;
  onGotovo: (broj: number) => void;
}) {
  return (
    <StudioDijalog otvoreno={otvoreno} onOtvoreno={onOtvoreno} naslov={t.cene.naslov} opis={t.cene.opis} sirina="siroka">
      {otvoreno ? (
        <CeneSadrzaj artikli={artikli} pocetno={pocetno ?? null} onPrimeni={onPrimeni} onGotovo={onGotovo} onOtkazi={() => onOtvoreno(false)} />
      ) : null}
    </StudioDijalog>
  );
}

function CeneSadrzaj({
  artikli,
  pocetno,
  onPrimeni,
  onGotovo,
  onOtkazi,
}: {
  artikli: readonly CenaArtikla[];
  pocetno: CenePocetno | null;
  onPrimeni: (izmene: StudioPromenaCene[]) => Promise<StudioIshod<StudioCeneRezultat>>;
  onGotovo: (broj: number) => void;
  onOtkazi: () => void;
}) {
  const id = useId();
  const [nacin, setNacin] = useState<Nacin>(pocetno?.nacin ?? "procenat");
  const [smer, setSmer] = useState<SmerPromene>(pocetno?.smer ?? "povecaj");
  const [tekst, setTekst] = useState(pocetno?.vrednost ?? "");
  const [radi, setRadi] = useState(false);
  const [poruka, setPoruka] = useState<string | null>(null);

  const unos = promenaIzUnosa(nacin, smer, tekst);
  const plan = unos.ok ? planCena(artikli, unos.promena) : null;
  const greskaUnosa = !unos.ok && tekst.trim() !== "" ? t.cene.greske[unos.greska] : null;
  const vrednostOznaka = nacin === "procenat" ? t.cene.vrednostProcenat : nacin === "iznos" ? t.cene.vrednostIznos : t.cene.vrednostIsta;
  const broj = plan?.promene.length ?? 0;

  const primeni = async () => {
    if (!plan?.mozePotvrdu) return;
    setRadi(true);
    const ishod = await onPrimeni(izmeneCena(plan));
    setRadi(false);
    if (!ishod.ok) {
      setPoruka(ishod.vrsta === "greska" ? `${t.red.nijeSacuvano} ${porukaGreske(ishod.kod) ?? ""}`.trim() : t.red.nijeSacuvano);
      return;
    }
    if (ishod.vrednost.status === "konflikt") {
      const n = ishod.vrednost.artikli.length;
      setPoruka(fmt(t.cene.konflikt[srPluralCategory(n)], { n }));
      return;
    }
    onGotovo(ishod.vrednost.broj);
  };

  let sazetak: ReactNode = null;
  if (plan) {
    sazetak = broj > 0 ? fmt(t.cene.sazetak[srPluralCategory(broj)], { n: broj }) : t.cene.nistaSeNeMenja;
  }

  return (
    <div className="grid gap-5" data-cene-dijalog="">
      <p className="text-sm font-medium" data-cene-izabrano="">{izabranoTekst(artikli.length)}</p>
      <div className="grid gap-4 sm:grid-cols-[auto_1fr] sm:items-end sm:gap-x-6">
        <Izbor
          legenda={t.cene.nacin}
          ime={`${id}-nacin`}
          vrednost={nacin}
          opcije={[
            { vrednost: "procenat", tekst: t.cene.procenat },
            { vrednost: "iznos", tekst: t.cene.iznos },
            { vrednost: "ista", tekst: t.cene.ista },
          ]}
          onIzbor={(sledeci) => {
            setNacin(sledeci);
            setPoruka(null);
          }}
        />
        {nacin !== "ista" ? (
          <Izbor
            legenda={t.cene.smer}
            ime={`${id}-smer`}
            vrednost={smer}
            opcije={[
              { vrednost: "povecaj", tekst: nacin === "procenat" ? t.cene.povecaj : t.cene.dodaj },
              { vrednost: "smanji", tekst: nacin === "procenat" ? t.cene.smanji : t.cene.oduzmi },
            ]}
            onIzbor={(sledeci) => {
              setSmer(sledeci);
              setPoruka(null);
            }}
          />
        ) : null}
      </div>
      <div className="grid max-w-[16rem] gap-1.5">
        <label htmlFor={`${id}-vrednost`} className="text-sm font-medium">
          {vrednostOznaka}
        </label>
        <input
          id={`${id}-vrednost`}
          data-cene-vrednost=""
          type="text"
          inputMode={nacin === "procenat" ? "decimal" : "numeric"}
          autoComplete="off"
          value={tekst}
          aria-invalid={greskaUnosa ? true : undefined}
          aria-describedby={`${id}-pomoc`}
          onChange={(event) => {
            setTekst(event.target.value);
            setPoruka(null);
          }}
          className={cn(
            "h-[var(--mp-meta)] w-full rounded-[var(--mp-radius-kontrola)] border bg-[var(--mp-povrsina)] px-3 text-right text-[0.9375rem] font-semibold tabular-nums text-[var(--mp-tekst)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mp-fokus)]",
            greskaUnosa ? "[--border:var(--mp-opasnost)]" : "[--border:var(--mp-ivica-kontrole)]",
          )}
        />
        <p id={`${id}-pomoc`} className={cn("text-sm", greskaUnosa ? "font-medium text-[var(--mp-opasnost)]" : "text-[var(--mp-tekst-sporedni)]")}>
          {greskaUnosa ?? t.cene.zaokruzivanje}
        </p>
      </div>

      {plan ? (
        <section aria-labelledby={`${id}-pregled`} className="grid gap-3">
          <h3 id={`${id}-pregled`} className="text-base font-semibold">
            {t.cene.pregled}
          </h3>
          {plan.promene.length > 0 ? (
            <div className="rounded-[var(--mp-radius-kontrola)] border [--border:var(--mp-ivica)]">
              <table className="w-full border-collapse text-[0.9375rem]" data-cene-tabela="">
                <caption className="caption-bottom px-3 py-2 text-left text-xs text-[var(--mp-tekst-sporedni)]">{t.cene.uDinarima}</caption>
                <thead className="sticky -top-4 z-10 bg-[var(--mp-povrsina)]">
                  <tr className="border-b text-left text-sm text-[var(--mp-tekst-sporedni)] [--border:var(--mp-ivica)]">
                    <th scope="col" className="px-2 py-2 font-medium sm:px-3">{t.cene.artikal}</th>
                    <th scope="col" className="px-2 py-2 text-right font-medium sm:px-3">{t.cene.stara}</th>
                    <th scope="col" className="px-2 py-2 text-right font-medium sm:px-3">{t.cene.nova}</th>
                    <th scope="col" className="px-2 py-2 text-right font-medium sm:px-3">{t.cene.razlika}</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.promene.map((red) => (
                    <tr key={red.artikalId} data-cena-red={red.artikalId} className="border-b last:border-b-0 [--border:var(--mp-ivica)]">
                      <th scope="row" className="px-2 py-2 text-left font-medium break-words sm:px-3">{red.naziv}</th>
                      <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums text-[var(--mp-tekst-sporedni)] sm:px-3">
                        {red.stara === null ? t.cene.bezCene : formatCenaPolje(red.stara)}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-right font-semibold tabular-nums sm:px-3">{formatCenaPolje(red.nova)}</td>
                      <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums sm:px-3">{razlikaTekst(red.razlika)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {plan.preskoceni.length > 0 ? (
            <div className="grid gap-1 text-sm" data-cene-preskoceni="">
              <p className="font-semibold">{t.cene.preskaceSe}</p>
              <ul className="grid gap-0.5 text-[var(--mp-tekst-sporedni)]">
                {plan.preskoceni.map((red) => (
                  <li key={red.artikalId}>
                    {red.naziv}: {t.cene.razlozi[red.razlog]}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {plan.nevazeci.length > 0 ? (
            <div
              role="alert"
              data-cene-nevazece=""
              className="grid gap-1 rounded-[var(--mp-radius-kontrola)] border px-3 py-2 text-sm [--border:var(--mp-opasnost-ivica)] bg-[var(--mp-opasnost-meko)]"
            >
              <p className="font-semibold">{t.cene.nevazeceNaslov}</p>
              <ul className="grid gap-0.5">
                {plan.nevazeci.map((red) => (
                  <li key={red.artikalId}>
                    {red.naziv}: {tekstCene(red.stara)} → {t.cene.nevazece[red.razlog]}
                  </li>
                ))}
              </ul>
              <p>{t.cene.nevazeceOpis}</p>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* Pinned to the bottom of the dialog: on a phone the confirm stays in reach with 200 rows. */}
      <div className="sticky -bottom-4 z-10 -mx-5 -mb-4 grid gap-2 border-t bg-[var(--mp-povrsina)] px-5 pb-4 pt-3 [--border:var(--mp-ivica)]">
      <p role="status" aria-live="polite" className="text-[0.9375rem] font-medium" data-cene-sazetak="">
        {poruka ?? sazetak}
      </p>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Dugme vrsta="tiho" onClick={onOtkazi}>
          {t.cene.otkazi}
        </Dugme>
        <Dugme vrsta="primarno" disabled={!plan?.mozePotvrdu} ucitava={radi} onClick={primeni} data-cene-potvrdi="">
          {broj === 0 ? t.cene.primeni : fmt(t.cene.potvrdi[srPluralCategory(broj)], { n: broj })}
        </Dugme>
      </div>
      </div>
    </div>
  );
}
