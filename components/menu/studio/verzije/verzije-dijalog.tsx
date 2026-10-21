"use client";

// ScanMe Menu V1 — previous publications (K18; master §6.1: "čuva se
// poslednjih 20 objavljenih verzija"; "vraćanje prethodne verzije pravi novi
// nacrt i ne menja odmah javni meni"). One dialog, three steps:
//   1. the list: version, when, who, what changed, which one guests see now;
//   2. the confirmation, which says plainly that a NEW DRAFT is made, that
//      guests keep the live version until Objavi, and — when the draft has
//      unpublished changes — that they are replaced;
//   3. the result, with the way on: `Pregledaj i objavi`.
// Restoring the live version is offered as "Odbaci izmene nacrta" only while
// the draft differs from it. The restore sends the draft revision the person
// saw; a newer edit by anyone makes the server (and the memory) refuse it, so
// nothing is overwritten unseen.

import { History, Radio, RotateCcw, TriangleAlert, Undo2 } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { fmt, srPluralCategory } from "@/lib/i18n/format";
import { menuStudioSr } from "@/lib/i18n/sr/menu-studio";
import { kadaTekst } from "@/lib/menu/studio/kada";
import type { StudioIshod, StudioStatusNacrta, StudioVerzija, StudioVerzije, StudioVracanjeRezultat } from "@/lib/menu/studio/model";
import { redoviPosledica } from "@/lib/menu/studio/publish-view";
import { Dugme } from "../../zajednicko/dugme";
import { PraznoStanje, UcitavanjeStanje } from "../../zajednicko/stanja";
import { StatusOznaka } from "../../zajednicko/status-oznaka";
import { StudioDijalog } from "../dijalog";
import { porukaGreske } from "../red-artikla/red-artikla";
import { broj } from "../objava/posledice";

const t = menuStudioSr.objavljivanje.verzije;
const o = menuStudioSr.objava;

type Korak =
  | { vrsta: "ucitava" }
  | { vrsta: "greska" }
  | { vrsta: "lista"; verzije: StudioVerzije; poruka: string | null }
  | { vrsta: "potvrda"; verzije: StudioVerzije; verzija: StudioVerzija }
  | { vrsta: "rezultat"; verzije: StudioVerzije; rezultat: Extract<StudioVracanjeRezultat, { status: "vraceno" }> };

/** "3 izmenjene cene · 1 nov artikal · 2 izmene rasporeda" (empty → "Izmene izgleda ili podešavanja"). */
export function sazetakVerzije(verzija: StudioVerzija): string {
  const delovi = redoviPosledica(verzija.sazetak).map((red) => broj(red.vrsta === "strukturne" ? o.strukturne : o[red.vrsta], red.broj));
  return delovi.length > 0 ? delovi.join(" · ") : t.bezPromenaPonude;
}

export type VerzijePocetno = { verzije: StudioVerzije };

export function VerzijeDijalog({
  otvoreno,
  onOtvoreno,
  status,
  mozeVracanje,
  sada,
  onUcitaj,
  onVrati,
  onPregledajIObjavi,
  pocetno,
}: {
  otvoreno: boolean;
  onOtvoreno: (otvoreno: boolean) => void;
  /** The live draft status (its revision goes with a restore; dirty = changes would be replaced). */
  status: StudioStatusNacrta | undefined;
  /** menu.publish and client editing on (restoring is publishing's sibling). */
  mozeVracanje: boolean;
  sada: number;
  onUcitaj: () => Promise<StudioIshod<StudioVerzije>>;
  onVrati: (broj: number, revizija: number) => Promise<StudioIshod<StudioVracanjeRezultat>>;
  /** Closes this dialog and opens Objavi (after a restore). */
  onPregledajIObjavi: () => void;
  /** The izlog: the list already loaded on the first render. */
  pocetno?: VerzijePocetno;
}) {
  const [korak, setKorak] = useState<Korak>(pocetno ? { vrsta: "lista", verzije: pocetno.verzije, poruka: null } : { vrsta: "ucitava" });
  const [radi, setRadi] = useState(false);
  const [greska, setGreska] = useState<string | null>(null);
  const zatrazeno = useRef(Boolean(pocetno));

  const ucitaj = async (poruka: string | null = null) => {
    const ishod = await onUcitaj();
    setKorak(ishod.ok ? { vrsta: "lista", verzije: ishod.vrednost, poruka } : { vrsta: "greska" });
  };
  const ucitajRef = useRef(ucitaj);
  useEffect(() => {
    ucitajRef.current = ucitaj;
  });
  useEffect(() => {
    if (!otvoreno || zatrazeno.current) return;
    zatrazeno.current = true;
    void ucitajRef.current();
  }, [otvoreno]);

  const zatvori = (sledece: boolean) => {
    if (!sledece) {
      zatrazeno.current = false;
      setKorak({ vrsta: "ucitava" });
      setGreska(null);
    }
    onOtvoreno(sledece);
  };

  const imaIzmena = status?.stanje === "dirty";
  const vrati = async (verzija: StudioVerzija, verzije: StudioVerzije) => {
    if (status?.revizija === undefined) return;
    setRadi(true);
    setGreska(null);
    const ishod = await onVrati(verzija.broj, status.revizija);
    setRadi(false);
    if (!ishod.ok) {
      setGreska((ishod.vrsta === "greska" ? porukaGreske(ishod.kod) : null) ?? menuStudioSr.red.nijeSacuvano);
      return;
    }
    if (ishod.vrednost.status === "odbijeno") {
      setKorak({ vrsta: "ucitava" });
      await ucitaj(t.rezultat.zastarelo);
      return;
    }
    setKorak({ vrsta: "rezultat", verzije, rezultat: ishod.vrednost });
  };

  let naslov: ReactNode = t.naslov;
  let telo: ReactNode = null;
  let podnozje: ReactNode = null;

  if (korak.vrsta === "ucitava") {
    telo = (
      <>
        <p role="status" className="text-[var(--mp-tekst-sporedni)]">
          {t.ucitava}
        </p>
        <UcitavanjeStanje oblik="lista" redova={4} />
      </>
    );
  } else if (korak.vrsta === "greska") {
    telo = (
      <div role="alert" className="grid gap-3">
        <p>{t.greska}</p>
        <Dugme vrsta="sekundarno" ikonica={RotateCcw} className="justify-self-start" onClick={() => void ucitaj()}>
          {o.osvezi}
        </Dugme>
      </div>
    );
  } else if (korak.vrsta === "lista") {
    const { verzije } = korak;
    telo =
      verzije.verzije.length === 0 ? (
        <PraznoStanje ikonica={History} naslov={t.prazno} nivo={3} />
      ) : (
        <div className="grid gap-3">
          <p className="text-sm text-[var(--mp-tekst-sporedni)]">{t.opis}</p>
          {korak.poruka ? (
            <p role="alert" className="rounded-[var(--mp-radius-kontrola)] border px-3 py-2 text-sm [--border:var(--mp-upozorenje-ivica)] bg-[var(--mp-upozorenje-meko)]">
              {korak.poruka}
            </p>
          ) : null}
          {!mozeVracanje ? <p className="text-sm">{t.bezDozvole}</p> : null}
          <ol className="grid divide-y rounded-[var(--mp-radius-kartica)] border [--border:var(--mp-ivica)] [&>li]:[--border:var(--mp-ivica)]" data-verzije="">
            {verzije.verzije.map((verzija) => (
              <li
                key={verzija.broj}
                data-verzija={verzija.broj}
                data-uzivo={verzija.uzivo ? "" : undefined}
                className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
              >
                <div className="grid min-w-0 gap-0.5">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-semibold">{fmt(t.verzija, { broj: verzija.broj })}</span>
                    {verzija.uzivo ? (
                      <StatusOznaka ton="uspeh" ikonica={Radio} velicina="mala">
                        {t.uzivo}
                      </StatusOznaka>
                    ) : null}
                  </p>
                  <p className="text-sm text-[var(--mp-tekst-sporedni)]">
                    {kadaTekst(verzija.objavljenoU, sada, menuStudioSr.zaglavlje)} · {verzija.objavio ?? t.nepoznato}
                  </p>
                  <p className="text-sm">{sazetakVerzije(verzija)}</p>
                  {verzija.vracenoIz !== null ? (
                    <p className="text-sm text-[var(--mp-tekst-sporedni)]">{fmt(t.iz, { broj: verzija.vracenoIz })}</p>
                  ) : null}
                  {verzija.uzivo ? <p className="sr-only">{t.uzivoOpis}</p> : null}
                </div>
                {!mozeVracanje ? null : verzija.uzivo ? (
                  imaIzmena ? (
                    <Dugme
                      vrsta="tiho"
                      velicina="kompaktna"
                      ikonica={Undo2}
                      className="justify-self-start"
                      aria-label={fmt(t.odbaciOznaka, { broj: verzija.broj })}
                      onClick={() => setKorak({ vrsta: "potvrda", verzije, verzija })}
                      data-verzija-odbaci=""
                    >
                      {t.odbaci}
                    </Dugme>
                  ) : null
                ) : (
                  <Dugme
                    vrsta="sekundarno"
                    velicina="kompaktna"
                    ikonica={RotateCcw}
                    className="justify-self-start"
                    aria-label={fmt(t.vratiOznaka, { broj: verzija.broj })}
                    onClick={() => setKorak({ vrsta: "potvrda", verzije, verzija })}
                    data-verzija-vrati={verzija.broj}
                  >
                    {t.vrati}
                  </Dugme>
                )}
              </li>
            ))}
          </ol>
        </div>
      );
    podnozje = (
      <Dugme vrsta="tiho" onClick={() => zatvori(false)}>
        {o.zatvori}
      </Dugme>
    );
  } else if (korak.vrsta === "potvrda") {
    const { verzija, verzije } = korak;
    const odbaci = verzija.uzivo;
    naslov = odbaci ? t.potvrda.odbaciNaslov : fmt(t.potvrda.naslov, { broj: verzija.broj });
    const kada = kadaTekst(verzija.objavljenoU, sada, menuStudioSr.zaglavlje);
    telo = (
      <div className="grid gap-3" data-verzija-potvrda={verzija.broj}>
        {odbaci ? (
          <p>{fmt(t.potvrda.odbaciTekst, { broj: verzija.broj })}</p>
        ) : (
          <>
            <p className="font-medium">
              {fmt(t.potvrda.objavljena, { broj: verzija.broj, kada, ko: verzija.objavio ?? t.nepoznato })}{" "}
              {fmt(t.potvrda.tekst, { uzivo: verzije.uzivo ?? verzija.broj })}
            </p>
            {imaIzmena ? (
              <p role="note" className="flex items-start gap-2 rounded-[var(--mp-radius-kontrola)] border px-3 py-2 text-sm [--border:var(--mp-upozorenje-ivica)] bg-[var(--mp-upozorenje-meko)]">
                <TriangleAlert aria-hidden="true" strokeWidth={2} className="mt-0.5 size-4 shrink-0 text-[var(--mp-upozorenje)]" />
                {fmt(t.potvrda.gubi, { broj: verzija.broj })}
              </p>
            ) : null}
            <p className="text-sm text-[var(--mp-tekst-sporedni)]">{fmt(t.potvrda.qr, { broj: verzija.broj })}</p>
          </>
        )}
        {greska ? (
          <p role="alert" className="text-sm font-medium text-[var(--mp-opasnost)]">
            {greska}
          </p>
        ) : null}
      </div>
    );
    podnozje = (
      <>
        <Dugme vrsta="tiho" onClick={() => setKorak({ vrsta: "lista", verzije, poruka: null })}>
          {t.potvrda.otkazi}
        </Dugme>
        <Dugme
          vrsta={odbaci ? "opasno" : "primarno"}
          ikonica={odbaci ? Undo2 : RotateCcw}
          ucitava={radi}
          onClick={() => void vrati(verzija, verzije)}
          data-verzija-potvrdi=""
        >
          {odbaci ? t.potvrda.odbaciPotvrdi : t.potvrda.potvrdi}
        </Dugme>
      </>
    );
  } else {
    const { rezultat, verzije } = korak;
    const odbaceno = rezultat.stanje === "clean";
    naslov = odbaceno ? t.rezultat.odbacenoNaslov : fmt(t.rezultat.naslov, { broj: rezultat.broj });
    telo = (
      <div role="status" className="grid gap-3" data-verzija-rezultat={odbaceno ? "odbaceno" : "nacrt"}>
        <p className="font-medium">
          {rezultat.izmena === 0
            ? fmt(t.rezultat.bezIzmena, { broj: rezultat.broj })
            : odbaceno
              ? fmt(t.rezultat.odbaceno, { broj: rezultat.broj })
              : fmt(t.rezultat.tekst, { uzivo: verzije.uzivo ?? rezultat.broj })}
        </p>
        {rezultat.zadrzaneStranice.length > 0 ? (
          <p className="text-sm">{fmt(t.rezultat.zadrzane, { stranice: rezultat.zadrzaneStranice.join(", ") })}</p>
        ) : null}
        {rezultat.bezSlike > 0 ? (
          <p className="text-sm">{fmt(t.rezultat.bezSlike[srPluralCategory(rezultat.bezSlike)], { n: rezultat.bezSlike })}</p>
        ) : null}
      </div>
    );
    podnozje = odbaceno ? (
      <Dugme vrsta="primarno" onClick={() => zatvori(false)}>
        {o.zatvori}
      </Dugme>
    ) : (
      <>
        <Dugme vrsta="tiho" onClick={() => { setKorak({ vrsta: "ucitava" }); void ucitaj(); }}>
          {t.rezultat.nazad}
        </Dugme>
        <Dugme
          vrsta="primarno"
          onClick={() => {
            zatvori(false);
            onPregledajIObjavi();
          }}
          data-verzija-objavi=""
        >
          {t.rezultat.pregledaj}
        </Dugme>
      </>
    );
  }

  return (
    <StudioDijalog otvoreno={otvoreno} onOtvoreno={zatvori} naslov={naslov} podnozje={podnozje} sirina="siroka" fokusNaDijalog>
      <div className="text-[0.9375rem] leading-relaxed" data-verzije-korak={korak.vrsta}>
        {telo}
      </div>
    </StudioDijalog>
  );
}
