"use client";

// ScanMe Menu V1 — `Objavi` (K10, the basic flow on the K05 backend; master
// §6.1). Opening the dialog checks the draft (menuPublishing.publishPreview):
// what changes, errors that block, warnings that need a conscious yes. The
// publish sends the revision that was reviewed, so newer edits are never
// published unseen (`stale_draft`). A failed publish leaves the public menu as
// it was, and the dialog says so. The full dialog (jump to the error,
// versions, conflicts) is a later editor step on the same file.

import { CircleCheck, OctagonAlert, RefreshCw, TriangleAlert, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { fmt, srPluralCategory } from "@/lib/i18n/format";
import { menuDomenSr } from "@/lib/i18n/sr/menu-domen";
import { menuStudioSr } from "@/lib/i18n/sr/menu-studio";
import type { MenuStudioMnozina } from "@/lib/i18n/types";
import type { StudioIshod, StudioObjavaRezultat, StudioPregledObjave } from "@/lib/menu/studio/model";
import { Dugme } from "../../zajednicko/dugme";
import { PoljePotvrde } from "../../zajednicko/prekidac";
import { UcitavanjeStanje } from "../../zajednicko/stanja";
import { StudioDijalog } from "../dijalog";
import { porukaGreske } from "../red-artikla/red-artikla";

const t = menuStudioSr;

function broj(mnozina: MenuStudioMnozina, n: number): string {
  return fmt(mnozina[srPluralCategory(n)], { n });
}

function tekstProblema(kod: string): string {
  const tekstovi = menuDomenSr.publishIssues as Record<string, string>;
  return tekstovi[kod] ?? kod;
}

type Faza =
  | { vrsta: "ucitava" }
  | { vrsta: "greska"; tekst: string }
  | { vrsta: "pregled"; pregled: StudioPregledObjave; odbijeno: string | null }
  | { vrsta: "objavljeno"; verzija: number };

export function ObjavaDijalog({
  otvoreno,
  onOtvoreno,
  nazivArtikla,
  onPregled,
  onObjavi,
}: {
  otvoreno: boolean;
  onOtvoreno: (otvoreno: boolean) => void;
  /** The name of an article by key, when the editor knows it (null otherwise). */
  nazivArtikla: (artikalKey: string) => string | null;
  onPregled: () => Promise<StudioIshod<StudioPregledObjave>>;
  onObjavi: (revizija: number, potvrda: string | undefined) => Promise<StudioIshod<StudioObjavaRezultat>>;
}) {
  const [faza, setFaza] = useState<Faza>({ vrsta: "ucitava" });
  const [potvrdjeno, setPotvrdjeno] = useState(false);
  const [potvrdaGreska, setPotvrdaGreska] = useState(false);
  const [radi, setRadi] = useState(false);

  const ucitaj = async (odbijeno: string | null = null) => {
    setFaza({ vrsta: "ucitava" });
    setPotvrdjeno(false);
    setPotvrdaGreska(false);
    const ishod = await onPregled();
    if (!ishod.ok) {
      setFaza({ vrsta: "greska", tekst: t.objava.greskaUcitavanja });
      return;
    }
    setFaza({ vrsta: "pregled", pregled: ishod.vrednost, odbijeno });
  };

  useEffect(() => {
    if (!otvoreno) return;
    let aktivno = true;
    void (async () => {
      const ishod = await onPregled();
      if (!aktivno) return;
      setPotvrdjeno(false);
      setPotvrdaGreska(false);
      setFaza(ishod.ok ? { vrsta: "pregled", pregled: ishod.vrednost, odbijeno: null } : { vrsta: "greska", tekst: t.objava.greskaUcitavanja });
    })();
    return () => {
      aktivno = false;
    };
  }, [otvoreno, onPregled]);

  const zatvori = (sledece: boolean) => {
    if (!sledece) setFaza({ vrsta: "ucitava" });
    onOtvoreno(sledece);
  };

  const pregled = faza.vrsta === "pregled" ? faza.pregled : null;
  const blokirano =
    !pregled || !pregled.mozeObjavu || !pregled.menjaSe || pregled.prevelik || pregled.greske.length > 0;

  const objavi = async () => {
    if (!pregled || blokirano) return;
    if (pregled.upozorenja.length > 0 && !potvrdjeno) {
      setPotvrdaGreska(true);
      return;
    }
    setRadi(true);
    const ishod = await onObjavi(pregled.revizija, pregled.upozorenja.length > 0 ? pregled.otisak : undefined);
    setRadi(false);
    if (!ishod.ok) {
      setFaza({
        vrsta: "pregled",
        pregled,
        odbijeno: ishod.vrsta === "greska" ? (porukaGreske(ishod.kod) ?? t.red.nijeSacuvano) : t.red.nijeSacuvano,
      });
      return;
    }
    if (ishod.vrednost.status === "objavljeno") {
      setFaza({ vrsta: "objavljeno", verzija: ishod.vrednost.verzija });
      return;
    }
    const razlog = ishod.vrednost.razlog;
    await ucitaj(razlog === "stale_draft" ? t.objava.staro : menuDomenSr.publishRefusals[razlog]);
  };

  const s = pregled?.sazetak;
  const strukturne = s ? s.sakriveno + s.uklonjenoSaStranice + s.obrisano + s.redosled : 0;

  return (
    <StudioDijalog
      otvoreno={otvoreno}
      onOtvoreno={zatvori}
      naslov={t.objava.naslov}
      opis={faza.vrsta === "pregled" ? t.objava.opis : undefined}
      podnozje={
        faza.vrsta === "objavljeno" ? (
          <Dugme vrsta="primarno" onClick={() => zatvori(false)}>
            {t.objava.zatvori}
          </Dugme>
        ) : (
          <>
            <Dugme vrsta="tiho" onClick={() => zatvori(false)}>
              {t.objava.nazad}
            </Dugme>
            <Dugme vrsta="primarno" ikonica={Upload} ucitava={radi} disabled={blokirano} onClick={() => void objavi()} data-objavi-potvrdi="">
              {t.objava.objavi}
            </Dugme>
          </>
        )
      }
    >
      <div className="grid gap-4 text-[0.9375rem] leading-relaxed" data-objava={faza.vrsta}>
        {faza.vrsta === "ucitava" ? (
          <>
            <p role="status" className="text-[var(--mp-tekst-sporedni)]">{t.objava.ucitava}</p>
            <UcitavanjeStanje oblik="lista" />
          </>
        ) : null}
        {faza.vrsta === "greska" ? (
          <div role="alert" className="grid gap-3">
            <p>{faza.tekst}</p>
            <Dugme vrsta="sekundarno" ikonica={RefreshCw} className="justify-self-start" onClick={() => void ucitaj()}>
              {t.objava.osvezi}
            </Dugme>
          </div>
        ) : null}
        {faza.vrsta === "objavljeno" ? (
          <p role="status" className="flex items-start gap-2 font-medium">
            <CircleCheck aria-hidden="true" strokeWidth={2} className="mt-0.5 size-5 shrink-0 text-[var(--mp-uspeh)]" />
            {fmt(t.objava.uspeh, { broj: faza.verzija })}
          </p>
        ) : null}
        {pregled && faza.vrsta === "pregled" ? (
          <>
            {faza.odbijeno ? (
              <div role="alert" className="grid gap-2 rounded-[var(--mp-radius-kontrola)] border px-3 py-2 [--border:var(--mp-upozorenje-ivica)] bg-[var(--mp-upozorenje-meko)]">
                <p>{faza.odbijeno}</p>
                <Dugme vrsta="sekundarno" velicina="kompaktna" ikonica={RefreshCw} className="justify-self-start" onClick={() => void ucitaj()}>
                  {t.objava.osvezi}
                </Dugme>
              </div>
            ) : null}
            {!pregled.mozeObjavu ? <p role="status">{t.objava.bezDozvole}</p> : null}
            {pregled.prevelik ? <p role="alert">{t.objava.prevelik}</p> : null}
            {!pregled.menjaSe ? (
              <p role="status">{t.objava.bezPromena}</p>
            ) : s ? (
              <section aria-labelledby="objava-promene" className="grid gap-2">
                <h3 id="objava-promene" className="font-semibold">
                  {t.objava.promene}
                </h3>
                {pregled.stanje === "never_published" ? <p>{t.objava.prvaObjava}</p> : null}
                <ul className="grid gap-1 rounded-[var(--mp-radius-kontrola)] bg-[var(--mp-povrsina-utisana)] px-3 py-2">
                  {s.cene > 0 ? <li>{broj(t.objava.cene, s.cene)}</li> : null}
                  {s.novi > 0 ? <li>{broj(t.objava.novi, s.novi)}</li> : null}
                  {s.uklonjeni > 0 ? <li>{broj(t.objava.uklonjeni, s.uklonjeni)}</li> : null}
                  {strukturne > 0 ? <li>{broj(t.objava.strukturne, strukturne)}</li> : null}
                  {s.cene + s.novi + s.uklonjeni + strukturne === 0 ? <li>{t.objava.ostalo}</li> : null}
                </ul>
              </section>
            ) : null}
            {pregled.greske.length > 0 ? (
              <section aria-labelledby="objava-greske" className="grid gap-2" data-objava-greske="">
                <h3 id="objava-greske" className="flex items-center gap-2 font-semibold text-[var(--mp-opasnost)]">
                  <OctagonAlert aria-hidden="true" strokeWidth={2} className="size-5" />
                  {t.objava.greskeNaslov}
                </h3>
                <p className="text-sm text-[var(--mp-tekst-sporedni)]">{t.objava.greskeOpis}</p>
                <ul className="grid gap-1">
                  {pregled.greske.map((g, i) => {
                    const ime = g.artikalKey ? nazivArtikla(g.artikalKey) : null;
                    return (
                      <li key={`${g.kod}-${g.artikalKey ?? i}`} className="rounded-[var(--mp-radius-kontrola)] border px-3 py-2 [--border:var(--mp-opasnost-ivica)] bg-[var(--mp-opasnost-meko)]">
                        {ime ? <span className="font-semibold">{fmt(t.objava.artikal, { naziv: ime })}: </span> : null}
                        {tekstProblema(g.kod)}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}
            {pregled.upozorenja.length > 0 && pregled.greske.length === 0 ? (
              <section aria-labelledby="objava-upozorenja" className="grid gap-2">
                <h3 id="objava-upozorenja" className="flex items-center gap-2 font-semibold">
                  <TriangleAlert aria-hidden="true" strokeWidth={2} className="size-5 text-[var(--mp-upozorenje)]" />
                  {t.objava.upozorenjaNaslov}
                </h3>
                <ul className="grid gap-1">
                  {pregled.upozorenja.map((u, i) => {
                    const ime = u.artikalKey ? nazivArtikla(u.artikalKey) : null;
                    return (
                      <li key={`${u.kod}-${u.artikalKey ?? u.jezik ?? i}`} className="rounded-[var(--mp-radius-kontrola)] border px-3 py-2 [--border:var(--mp-upozorenje-ivica)] bg-[var(--mp-upozorenje-meko)]">
                        {ime ? <span className="font-semibold">{fmt(t.objava.artikal, { naziv: ime })}: </span> : null}
                        {tekstProblema(u.kod)}
                        {u.jezik ? ` (${u.jezik.toUpperCase()})` : null}
                      </li>
                    );
                  })}
                </ul>
                <PoljePotvrde
                  naziv={t.objava.potvrda}
                  checked={potvrdjeno}
                  greska={potvrdaGreska && !potvrdjeno ? t.objava.potvrdaGreska : undefined}
                  onChange={(event) => setPotvrdjeno(event.target.checked)}
                />
              </section>
            ) : null}
            <p className="text-sm text-[var(--mp-tekst-sporedni)]">{t.objava.sigurnost}</p>
          </>
        ) : null}
      </div>
    </StudioDijalog>
  );
}
