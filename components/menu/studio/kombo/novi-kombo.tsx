"use client";

// ScanMe Menu V1 — a new combo from `+ Dodaj → Kombo` (K10; master §5.4: a
// combo is its own article, put together from existing articles, with a price
// the owner sets by hand). This is the short way in; the combo's own focused
// view (quantities, "Proveri cenu") belongs to the article detail.

import { Search } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { fmt } from "@/lib/i18n/format";
import { menuStudioSr } from "@/lib/i18n/sr/menu-studio";
import { MENU_TEXT } from "@/lib/menu/limits";
import type { StudioArtikal, StudioIshod, StudioSekcija } from "@/lib/menu/studio/model";
import { parseCenaUnos } from "@/lib/menu/studio/price-input";
import { cleanText, foldSerbian } from "@/lib/menu/text";
import { cn } from "@/lib/utils";
import { Dugme } from "../../zajednicko/dugme";
import { PoljePotvrde } from "../../zajednicko/prekidac";
import { StudioDijalog } from "../dijalog";
import { porukaGreske, tekstCene } from "../red-artikla/red-artikla";

const t = menuStudioSr;

const poljeKlase =
  "h-[var(--mp-meta)] w-full min-w-0 rounded-[var(--mp-radius-kontrola)] border [--border:var(--mp-ivica-kontrole)] bg-[var(--mp-povrsina)] px-3 text-[0.9375rem] text-[var(--mp-tekst)] placeholder:text-[var(--mp-tekst-sporedni)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mp-fokus)] aria-[invalid=true]:[--border:var(--mp-opasnost)]";

export function NoviKombo({
  otvoreno,
  onOtvoreno,
  sekcije,
  podrazumevanaSekcija,
  onDodaj,
}: {
  otvoreno: boolean;
  onOtvoreno: (otvoreno: boolean) => void;
  sekcije: readonly StudioSekcija[];
  podrazumevanaSekcija: string | null;
  onDodaj: (sekcijaId: string, unos: { naziv: string; cena: number | null; sastojci: string[] }) => Promise<StudioIshod<{ id: string }>>;
}) {
  const id = useId();
  const [naziv, setNaziv] = useState("");
  const [cena, setCena] = useState("");
  const [sekcijaId, setSekcijaId] = useState(podrazumevanaSekcija ?? sekcije[0]?.id ?? "");
  const [izabrani, setIzabrani] = useState<string[]>([]);
  const [upit, setUpit] = useState("");
  const [greske, setGreske] = useState<{ naziv?: string; cena?: string; sastojci?: string; opste?: string }>({});
  const [radi, setRadi] = useState(false);

  const artikli = useMemo(() => {
    const vidjeni = new Map<string, StudioArtikal>();
    for (const sekcija of sekcije) {
      for (const red of sekcija.redovi) {
        if (red.artikal.vrsta === "item" && !vidjeni.has(red.artikal.id)) vidjeni.set(red.artikal.id, red.artikal);
      }
    }
    return [...vidjeni.values()];
  }, [sekcije]);
  const filtrirano = upit.trim()
    ? artikli.filter((artikal) => foldSerbian(artikal.naziv).includes(foldSerbian(upit.trim())))
    : artikli;
  const zbir = izabrani.reduce((suma, artikalId) => suma + (artikli.find((a) => a.id === artikalId)?.cena ?? 0), 0);

  const zatvori = (sledece: boolean) => {
    if (!sledece) {
      setNaziv("");
      setCena("");
      setIzabrani([]);
      setUpit("");
      setGreske({});
    }
    onOtvoreno(sledece);
  };

  const dodaj = async () => {
    const ime = cleanText(naziv);
    const c = parseCenaUnos(cena);
    const nove: typeof greske = {};
    if (ime.length === 0) nove.naziv = t.opste.nazivObavezan;
    else if (ime.length > MENU_TEXT.articleName) nove.naziv = fmt(t.opste.nazivDug, { n: MENU_TEXT.articleName });
    if (!c.ok) nove.cena = t.cena.greske[c.greska];
    if (izabrani.length === 0) nove.sastojci = t.kombo.bezSastojaka;
    setGreske(nove);
    if (Object.keys(nove).length > 0 || !c.ok) return;
    setRadi(true);
    const ishod = await onDodaj(sekcijaId, { naziv: ime, cena: c.cena, sastojci: izabrani });
    setRadi(false);
    if (!ishod.ok) {
      setGreske({ opste: ishod.vrsta === "greska" ? (porukaGreske(ishod.kod) ?? t.red.nijeSacuvano) : t.red.nijeSacuvano });
      return;
    }
    zatvori(false);
  };

  return (
    <StudioDijalog
      otvoreno={otvoreno}
      onOtvoreno={zatvori}
      naslov={t.kombo.naslov}
      opis={t.kombo.opis}
      podnozje={
        <>
          <Dugme vrsta="tiho" onClick={() => zatvori(false)}>
            {t.kombo.otkazi}
          </Dugme>
          <Dugme vrsta="primarno" ucitava={radi} disabled={artikli.length === 0} onClick={() => void dodaj()}>
            {t.kombo.dodaj}
          </Dugme>
        </>
      }
    >
      {artikli.length === 0 ? (
        <p className="text-[0.9375rem] text-[var(--mp-tekst-sporedni)]">{t.kombo.nemaArtikala}</p>
      ) : (
        <div className="grid gap-4" data-novi-kombo="">
          <label className="grid gap-1.5">
            <span className="text-sm font-semibold">{t.kombo.naziv}</span>
            <input
              className={poljeKlase}
              value={naziv}
              autoComplete="off"
              aria-invalid={greske.naziv ? true : undefined}
              aria-describedby={greske.naziv ? `${id}-naziv` : undefined}
              onChange={(event) => setNaziv(event.target.value)}
            />
            {greske.naziv ? (
              <span id={`${id}-naziv`} className="text-sm font-medium text-[var(--mp-opasnost)]">
                {greske.naziv}
              </span>
            ) : null}
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5">
              <span className="text-sm font-semibold">{t.kombo.cena}</span>
              <input
                className={cn(poljeKlase, "text-right tabular-nums")}
                inputMode="numeric"
                autoComplete="off"
                value={cena}
                aria-invalid={greske.cena ? true : undefined}
                aria-describedby={`${id}-zbir${greske.cena ? ` ${id}-cena` : ""}`}
                onChange={(event) => setCena(event.target.value)}
              />
              {greske.cena ? (
                <span id={`${id}-cena`} className="text-sm font-medium text-[var(--mp-opasnost)]">
                  {greske.cena}
                </span>
              ) : null}
              <span id={`${id}-zbir`} className="text-sm text-[var(--mp-tekst-sporedni)]">
                {fmt(t.kombo.zbir, { cena: tekstCene(zbir) })}
              </span>
            </label>
            <label className="grid content-start gap-1.5">
              <span className="text-sm font-semibold">{t.kombo.sekcija}</span>
              <select className={cn(poljeKlase, "pr-8")} value={sekcijaId} onChange={(event) => setSekcijaId(event.target.value)}>
                {sekcije.map((sekcija) => (
                  <option key={sekcija.id} value={sekcija.id}>
                    {sekcija.naziv}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <fieldset className="grid gap-2" aria-describedby={greske.sastojci ? `${id}-sastojci` : undefined}>
            <legend className="text-sm font-semibold">{t.kombo.sastojci}</legend>
            <p className="text-sm text-[var(--mp-tekst-sporedni)]">{t.kombo.sastojciOpis}</p>
            <label className="relative">
              <span className="sr-only">{t.kombo.pretraga}</span>
              <Search aria-hidden="true" strokeWidth={1.75} className="pointer-events-none absolute left-3 top-3 size-5 text-[var(--mp-tekst-sporedni)]" />
              <input
                type="search"
                className={cn(poljeKlase, "pl-10")}
                placeholder={t.kombo.pretraga}
                value={upit}
                onChange={(event) => setUpit(event.target.value)}
              />
            </label>
            <div className="max-h-[16rem] overflow-y-auto rounded-[var(--mp-radius-kontrola)] border px-3 [--border:var(--mp-ivica)]">
              {filtrirano.map((artikal) => (
                <PoljePotvrde
                  key={artikal.id}
                  naziv={artikal.naziv}
                  opis={tekstCene(artikal.cena)}
                  checked={izabrani.includes(artikal.id)}
                  onChange={(event) =>
                    setIzabrani((pre) =>
                      event.target.checked ? [...pre, artikal.id] : pre.filter((x) => x !== artikal.id),
                    )
                  }
                />
              ))}
            </div>
            {greske.sastojci ? (
              <p id={`${id}-sastojci`} role="alert" className="text-sm font-medium text-[var(--mp-opasnost)]">
                {greske.sastojci}
              </p>
            ) : null}
          </fieldset>
          {greske.opste ? (
            <p role="alert" className="text-sm font-medium text-[var(--mp-opasnost)]">
              {greske.opste}
            </p>
          ) : null}
        </div>
      )}
    </StudioDijalog>
  );
}
