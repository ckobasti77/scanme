"use client";

// ScanMe Menu V1 — `Objavi` (K18; master §6.1, §13.4; mockup 05 with its
// corrections: what is behind the dialog is not a source of truth). Publishing
// is a conscious, safe step:
//   - the dialog checks the SAVED draft (menuPublishing.publishPreview); while
//     the person's own edits are still saving it waits for them, and edits that
//     failed to save are named (they will not be published);
//   - errors block and lead to the place to fix (`Idi na artikal`);
//   - warnings allow publishing only after the conscious confirmation;
//   - consequences in numbers: changed prices (old → new on demand), new and
//     removed articles, structural changes;
//   - a link to the draft preview; a sentence that a failed publish leaves the
//     live version as it is;
//   - newer edits after this review (anyone's, from the live draft revision)
//     lock the button until the review is refreshed — and the server refuses a
//     stale publish anyway (stale_draft).
// The decision itself is pure (lib/menu/studio/publish-view.ts).
// After the screenshot critique: a field in conflict locks the button (its
// value would silently not go out), the dialog never says "Nacrt je sačuvan."
// while a save failed, the safety sentence lives in the footer (always
// visible), up to five changed prices are open, colleagues in the editor are
// named, and a published menu can be opened in a new tab.

import { CircleCheck, ExternalLink, Eye, Info, OctagonAlert, RefreshCw, RotateCcw, Upload, Users } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { fmt, srPluralCategory } from "@/lib/i18n/format";
import { menuDomenSr } from "@/lib/i18n/sr/menu-domen";
import { menuStudioSr } from "@/lib/i18n/sr/menu-studio";
import type { AutosaveZbir } from "@/lib/menu/studio/autosave-queue";
import { kadaTekst } from "@/lib/menu/studio/kada";
import type { StudioIshod, StudioObjavaRezultat, StudioPregledObjave, StudioStatusNacrta } from "@/lib/menu/studio/model";
import { recenicaOsoba } from "@/lib/menu/studio/presence-view";
import { brojProblema, grupisiProbleme, stanjeObjave, zahtevObjave, type ProblemArtikla, type RazlogCekanja } from "@/lib/menu/studio/publish-view";
import { Dugme } from "../../zajednicko/dugme";
import { PoljePotvrde } from "../../zajednicko/prekidac";
import { UcitavanjeStanje } from "../../zajednicko/stanja";
import { StudioDijalog } from "../dijalog";
import { porukaGreske } from "../red-artikla/red-artikla";
import { PosledicePregled } from "./posledice";
import { GreskeObjave, UpozorenjaObjave } from "./problemi-objave";

const t = menuStudioSr.objava;
const m = menuStudioSr.objavljivanje.modal;

type Faza =
  | { vrsta: "ucitava" }
  | { vrsta: "greska" }
  | { vrsta: "pregled"; pregled: StudioPregledObjave; poruka: string | null }
  | { vrsta: "objavljeno"; verzija: number }
  | { vrsta: "neuspeh"; pregled: StudioPregledObjave; kod: string };

/** The short reason next to a waiting `Objavi meni` (null = the reason is shown elsewhere). */
const RAZLOZI: Partial<Record<RazlogCekanja, string>> = {
  greske: m.razlozi.greske,
  zastarelo: m.razlozi.zastarelo,
  "cuva-se": m.razlozi.cuvaSe,
  konflikt: m.razlozi.konflikt,
  potvrda: m.razlozi.potvrda,
  "bez-promena": m.razlozi.bezPromena,
  prevelik: m.razlozi.prevelik,
};

export type ObjavaPocetno = { pregled: StudioPregledObjave };

export function ObjavaModal({
  otvoreno,
  onOtvoreno,
  status,
  cuvanje,
  konflikata = 0,
  sada,
  onPokusajCuvanje,
  nazivArtikla,
  onPregled,
  onObjavi,
  onIdiNaArtikal,
  onOtvoriPrevode,
  onPregledNacrta,
  pocetno,
  drugi = [],
  javniMeniHref = null,
}: {
  otvoreno: boolean;
  onOtvoreno: (otvoreno: boolean) => void;
  /** The live draft status: its revision tells a stale review; who changed it last. */
  status: StudioStatusNacrta | undefined;
  /** The save queue: the review waits for own edits; failed ones are named. */
  cuvanje: AutosaveZbir;
  /** Of the failed keys, those in conflict (a retry does not solve them: the field asks). */
  konflikata?: number;
  /** Now (ms) for "danas u 14:31". */
  sada: number;
  onPokusajCuvanje: () => void;
  /** An article's name when the review does not carry it. */
  nazivArtikla: (artikalKey: string) => string | null;
  onPregled: () => Promise<StudioIshod<StudioPregledObjave>>;
  onObjavi: (revizija: number, potvrda: string | undefined) => Promise<StudioIshod<StudioObjavaRezultat>>;
  /** Closes the dialog and opens the article (on its page, its variants open when the issue is there); `greska` = it blocks. */
  onIdiNaArtikal: (problem: ProblemArtikla, greska: boolean) => void;
  /** Closes the dialog and opens the translations view; null = no translations to open. */
  onOtvoriPrevode: (() => void) | null;
  /** Closes the dialog and shows the draft preview. */
  onPregledNacrta: () => void;
  /** The izlog: the review already loaded on the first render. */
  pocetno?: ObjavaPocetno;
  /** Other people in the editor now (names): their unsaved typing is not published. */
  drugi?: readonly string[];
  /** Where guests open the menu (a new tab after publishing); null = no link. */
  javniMeniHref?: string | null;
}) {
  const [faza, setFaza] = useState<Faza>(pocetno ? { vrsta: "pregled", pregled: pocetno.pregled, poruka: null } : { vrsta: "ucitava" });
  const [potvrdjeno, setPotvrdjeno] = useState(false);
  const [radi, setRadi] = useState(false);
  const [osvezeno, setOsvezeno] = useState(false);
  // Whether this opening already asked for its review (the izlog's first one came with the props).
  const zatrazeno = useRef(Boolean(pocetno));
  const razlogId = useId();
  const cuvaSe = cuvanje.stanje === "cuva-se";

  const ucitaj = async (poruka: string | null = null) => {
    setPotvrdjeno(false);
    setOsvezeno(false);
    const ishod = await onPregled();
    setFaza(ishod.ok ? { vrsta: "pregled", pregled: ishod.vrednost, poruka } : { vrsta: "greska" });
  };
  const ucitajRef = useRef(ucitaj);
  useEffect(() => {
    ucitajRef.current = ucitaj;
  });

  // Ask for the review once per opening, after own edits are saved (it would miss them otherwise).
  useEffect(() => {
    if (!otvoreno || cuvaSe || zatrazeno.current) return;
    zatrazeno.current = true;
    void ucitajRef.current();
  }, [otvoreno, cuvaSe]);

  const zatvori = (sledece: boolean) => {
    if (!sledece) {
      zatrazeno.current = false;
      setFaza({ vrsta: "ucitava" });
      setPotvrdjeno(false);
      setOsvezeno(false);
    }
    onOtvoreno(sledece);
  };
  const osvezi = () => {
    setFaza({ vrsta: "ucitava" });
    void ucitaj();
  };
  const osveziZastarelo = async () => {
    setFaza({ vrsta: "ucitava" });
    await ucitaj();
    setOsvezeno(true);
  };

  const pregled = faza.vrsta === "pregled" ? faza.pregled : null;
  const odluka = stanjeObjave({ pregled, revizijaSada: status?.revizija, potvrdjeno, cuvanje: cuvanje.stanje, konflikata });
  const greske = pregled ? grupisiProbleme(pregled.greske, pregled.ciljevi) : null;
  const upozorenja = pregled ? grupisiProbleme(pregled.upozorenja, pregled.ciljevi) : null;
  const zivaVerzija =
    (faza.vrsta === "pregled" || faza.vrsta === "neuspeh" ? faza.pregled.objavljenaVerzija : null) ?? status?.objavljenaVerzija ?? null;

  const objavi = async () => {
    if (!pregled || !odluka.moze) return;
    setRadi(true);
    const { revizija, potvrda } = zahtevObjave(pregled);
    const ishod = await onObjavi(revizija, potvrda);
    setRadi(false);
    if (!ishod.ok) {
      // Network, a refusal thrown by the server (too large): the live version is untouched.
      setFaza({ vrsta: "neuspeh", pregled, kod: ishod.vrsta === "greska" ? ishod.kod : "mreza" });
      return;
    }
    if (ishod.vrednost.status === "objavljeno") {
      setFaza({ vrsta: "objavljeno", verzija: ishod.vrednost.verzija });
      return;
    }
    // Refused without writing anything: look again with the reason on top.
    const razlog = ishod.vrednost.razlog;
    setFaza({ vrsta: "ucitava" });
    await ucitaj(razlog === "stale_draft" ? t.staro : menuDomenSr.publishRefusals[razlog]);
  };

  const idi = (problem: ProblemArtikla, greska: boolean) => {
    zatvori(false);
    onIdiNaArtikal(problem, greska);
  };
  const prevodi = onOtvoriPrevode
    ? () => {
        zatvori(false);
        onOtvoriPrevode();
      }
    : null;

  const poslednja = status?.poslednjaIzmena ?? null;
  const zastarelo = pregled !== null && odluka.razlog === "zastarelo";
  const razlogTekst = pregled && !odluka.moze ? (RAZLOZI[odluka.razlog] ?? null) : null;

  let podnozje: ReactNode;
  if (faza.vrsta === "objavljeno") {
    podnozje = (
      <>
        {javniMeniHref ? (
          <Dugme vrsta="sekundarno" asChild>
            <a href={javniMeniHref} target="_blank" rel="noreferrer" data-objava-javni="">
              <ExternalLink aria-hidden="true" strokeWidth={1.75} />
              {m.otvoriJavniMeni}
              <span className="sr-only"> {m.noviProzor}</span>
            </a>
          </Dugme>
        ) : null}
        <Dugme vrsta="primarno" onClick={() => zatvori(false)}>
          {t.zatvori}
        </Dugme>
      </>
    );
  } else if (faza.vrsta === "neuspeh") {
    podnozje = (
      <>
        <Dugme vrsta="tiho" onClick={() => zatvori(false)}>
          {t.nazad}
        </Dugme>
        <Dugme vrsta="primarno" ikonica={RotateCcw} onClick={osvezi}>
          {m.pokusajObjavu}
        </Dugme>
      </>
    );
  } else {
    podnozje = (
      <>
        {pregled ? (
          <p className="flex basis-full items-start gap-2 text-sm text-[var(--mp-tekst-sporedni)]" data-objava-sigurnost="">
            <Info aria-hidden="true" strokeWidth={2} className="mt-0.5 size-4 shrink-0" />
            {zivaVerzija !== null ? fmt(m.sigurnostVerzija, { broj: zivaVerzija }) : m.sigurnostPrva}
          </p>
        ) : null}
        {razlogTekst ? (
          <p id={razlogId} className="basis-full text-sm text-[var(--mp-tekst-sporedni)]" data-objava-razlog={odluka.razlog ?? ""}>
            {razlogTekst}
          </p>
        ) : null}
        <Dugme vrsta="tiho" onClick={() => zatvori(false)}>
          {t.nazad}
        </Dugme>
        <Dugme
          vrsta="primarno"
          ikonica={Upload}
          ucitava={radi}
          disabled={!odluka.moze}
          aria-describedby={razlogTekst ? razlogId : undefined}
          onClick={() => void objavi()}
          data-objavi-potvrdi=""
        >
          {t.objavi}
        </Dugme>
      </>
    );
  }

  return (
    <StudioDijalog
      otvoreno={otvoreno}
      onOtvoreno={zatvori}
      naslov={faza.vrsta === "objavljeno" ? m.uspehNaslov : faza.vrsta === "neuspeh" ? m.neuspehNaslov : t.naslov}
      opis={faza.vrsta === "pregled" ? (cuvanje.neuspelo > 0 ? m.opisNesacuvano : t.opis) : undefined}
      podnozje={podnozje}
    >
      <div className="grid gap-5 text-[0.9375rem] leading-relaxed" data-objava={faza.vrsta}>
        {faza.vrsta === "ucitava" ? (
          <>
            <p role="status" className="text-[var(--mp-tekst-sporedni)]">
              {cuvaSe ? m.cekaCuvanje : t.ucitava}
            </p>
            <UcitavanjeStanje oblik="lista" />
          </>
        ) : null}

        {faza.vrsta === "greska" ? (
          <div role="alert" className="grid gap-3">
            <p>{t.greskaUcitavanja}</p>
            <Dugme vrsta="sekundarno" ikonica={RefreshCw} className="justify-self-start" onClick={osvezi}>
              {t.osvezi}
            </Dugme>
          </div>
        ) : null}

        {faza.vrsta === "objavljeno" ? (
          <div role="status" className="grid justify-items-start gap-3" data-objava-uspeh="">
            <span aria-hidden="true" className="grid size-12 place-items-center rounded-full bg-[var(--mp-akcent-meko)] text-[var(--mp-akcent-tekst)]">
              <CircleCheck strokeWidth={2} className="size-6" />
            </span>
            <p className="font-medium">{fmt(m.uspeh, { broj: faza.verzija })}</p>
          </div>
        ) : null}

        {faza.vrsta === "neuspeh" ? (
          <div role="alert" className="grid gap-3" data-objava-neuspeh="">
            <p className="flex items-start gap-2 font-medium">
              <OctagonAlert aria-hidden="true" strokeWidth={2} className="mt-0.5 size-5 shrink-0 text-[var(--mp-opasnost)]" />
              {zivaVerzija !== null ? fmt(m.neuspeh, { broj: zivaVerzija }) : m.neuspehPrva}
            </p>
            {porukaGreske(faza.kod) ? <p className="text-sm">{porukaGreske(faza.kod)}</p> : null}
          </div>
        ) : null}

        {pregled && greske && upozorenja ? (
          <>
            {faza.vrsta === "pregled" && faza.poruka ? (
              <div role="alert" className="rounded-[var(--mp-radius-kontrola)] border px-3 py-2 [--border:var(--mp-upozorenje-ivica)] bg-[var(--mp-upozorenje-meko)]">
                <p>{faza.poruka}</p>
              </div>
            ) : null}

            {zastarelo ? (
              <div role="alert" data-objava-zastarelo="" className="grid gap-2 rounded-[var(--mp-radius-kontrola)] border px-3 py-3 [--border:var(--mp-upozorenje-ivica)] bg-[var(--mp-upozorenje-meko)]">
                <p className="font-semibold">{m.zastarelo.naslov}</p>
                {poslednja ? (
                  <p className="text-sm">
                    {poslednja.ja
                      ? fmt(m.zastarelo.ja, { kada: kadaTekst(poslednja.u, sada, menuStudioSr.zaglavlje) })
                      : fmt(m.zastarelo.poslednja, {
                          ime: poslednja.ime ?? menuStudioSr.objavljivanje.prisustvo.clanTima,
                          kada: kadaTekst(poslednja.u, sada, menuStudioSr.zaglavlje),
                        })}
                  </p>
                ) : null}
                <p className="text-sm">{m.zastarelo.uputstvo}</p>
                <Dugme vrsta="sekundarno" velicina="kompaktna" ikonica={RefreshCw} className="justify-self-start" onClick={() => void osveziZastarelo()} data-objava-osvezi="">
                  {m.zastarelo.osvezi}
                </Dugme>
              </div>
            ) : null}
            {osvezeno && !zastarelo ? (
              <p role="status" className="sr-only">
                {m.zastarelo.osvezeno}
              </p>
            ) : null}

            {konflikata > 0 ? (
              <div role="alert" data-objava-konflikti="" className="rounded-[var(--mp-radius-kontrola)] border px-3 py-2 [--border:var(--mp-opasnost-ivica)] bg-[var(--mp-opasnost-meko)]">
                <p>{fmt(m.konflikti[srPluralCategory(konflikata)], { n: konflikata })}</p>
              </div>
            ) : null}
            {cuvanje.neuspelo > konflikata ? (
              <div role="alert" className="grid gap-2 rounded-[var(--mp-radius-kontrola)] border px-3 py-2 [--border:var(--mp-opasnost-ivica)] bg-[var(--mp-opasnost-meko)]">
                <p>{fmt(m.nesacuvano[srPluralCategory(cuvanje.neuspelo - konflikata)], { n: cuvanje.neuspelo - konflikata })}</p>
                <Dugme vrsta="tiho" velicina="kompaktna" ikonica={RotateCcw} className="justify-self-start" onClick={onPokusajCuvanje}>
                  {m.pokusajCuvanje}
                </Dugme>
              </div>
            ) : null}

            {drugi.length > 0 ? (
              <p className="flex items-start gap-2 text-sm" data-objava-drugi="">
                <Users aria-hidden="true" strokeWidth={2} className="mt-0.5 size-4 shrink-0 text-[var(--mp-info)]" />
                {recenicaOsoba(m.drugiUEditoru, drugi)}
              </p>
            ) : null}
            {!pregled.mozeObjavu ? <p role="status">{t.bezDozvole}</p> : null}
            {pregled.prevelik ? <p role="alert">{t.prevelik}</p> : null}

            {brojProblema(greske) > 0 ? (
              <GreskeObjave
                greske={greske}
                brojUpozorenja={brojProblema(upozorenja)}
                nazivArtikla={nazivArtikla}
                onIdi={(problem) => idi(problem, true)}
              />
            ) : null}

            <PosledicePregled pregled={pregled} vracenoIz={status?.vracenoIz ?? null} />

            {brojProblema(greske) === 0 && brojProblema(upozorenja) > 0 ? (
              <UpozorenjaObjave upozorenja={upozorenja} nazivArtikla={nazivArtikla} onIdi={(problem) => idi(problem, false)} onOtvoriPrevode={prevodi}>
                <PoljePotvrde
                  naziv={t.potvrda}
                  checked={potvrdjeno}
                  onChange={(event) => setPotvrdjeno(event.target.checked)}
                  data-objava-potvrda=""
                />
              </UpozorenjaObjave>
            ) : null}

            <div className="grid gap-1">
              <Dugme
                vrsta="tiho"
                velicina="kompaktna"
                ikonica={Eye}
                className="-mx-2 justify-self-start underline underline-offset-4"
                onClick={() => {
                  zatvori(false);
                  onPregledNacrta();
                }}
                data-objava-pregled=""
              >
                {m.pregledNacrta}
              </Dugme>
              <p className="text-sm text-[var(--mp-tekst-sporedni)]">{m.pregledNacrtaOpis}</p>
            </div>

          </>
        ) : null}
      </div>
    </StudioDijalog>
  );
}
