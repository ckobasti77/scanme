"use client";

// ScanMe Menu V1 — "Primeni i na druge artikle" (K15; master §5.7): the same
// add-on group linked to other articles of the menu, found by name. The
// articles that already have it are marked and cannot be picked; the group
// stays ONE linked group, so a later change reaches all of them (after the
// impact preview). One call adds them all; nothing is published.

import { Search } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { fmt, srPluralCategory } from "@/lib/i18n/format";
import { menuStudioSr } from "@/lib/i18n/sr/menu-studio";
import type { StudioGrupaDodataka, StudioIshod, StudioKandidat, StudioRadnje } from "@/lib/menu/studio/model";
import { cn } from "@/lib/utils";
import { Dugme } from "../../zajednicko/dugme";
import { PoljePotvrde } from "../../zajednicko/prekidac";
import { StudioDijalog } from "../dijalog";
import { tekstCene } from "../red-artikla/red-artikla";
import { POLJE_KLASA } from "./polja";

const pr = menuStudioSr.artikal.primeni;
const MIN_UPIT = 2;

function mnozina(grupa: { one: string; few: string; many: string }, n: number) {
  return fmt(grupa[srPluralCategory(n)], { n });
}

export function PrimeniNaDruge({
  grupa,
  artikalId,
  radnje,
  onGotovo,
  onZatvori,
}: {
  grupa: StudioGrupaDodataka | null;
  /** The article whose detail is open (not offered: it has the group). */
  artikalId: string;
  radnje: Pick<StudioRadnje, "traziArtikle" | "uticajGrupe" | "primeniGrupuNa">;
  onGotovo: (poruka: string) => void;
  onZatvori: () => void;
}) {
  const id = useId();
  const [upit, setUpit] = useState("");
  const [rezultat, setRezultat] = useState<{ upit: string; artikli: StudioKandidat[] } | "greska" | null>(null);
  const [imaju, setImaju] = useState<ReadonlySet<string>>(new Set());
  const [izabrani, setIzabrani] = useState<ReadonlySet<string>>(new Set());
  const [radi, setRadi] = useState(false);
  const [poruka, setPoruka] = useState<string | null>(null);
  const grupaId = grupa?.id ?? null;

  // Which articles already have the group (from the impact list).
  useEffect(() => {
    if (!grupaId) return;
    let aktivno = true;
    void radnje.uticajGrupe(grupaId).then((ishod) => {
      if (aktivno && ishod.ok) setImaju(new Set(ishod.vrednost.artikli.map((a) => a.id)));
    });
    return () => {
      aktivno = false;
    };
  }, [grupaId, radnje]);

  // The search, 250 ms after the last key.
  const trazeno = upit.trim();
  useEffect(() => {
    if (!grupaId || trazeno.length < MIN_UPIT) return;
    let aktivno = true;
    const tajmer = setTimeout(() => {
      void radnje.traziArtikle(trazeno).then((ishod: StudioIshod<StudioKandidat[]>) => {
        if (aktivno) setRezultat(ishod.ok ? { upit: trazeno, artikli: ishod.vrednost } : "greska");
      });
    }, 250);
    return () => {
      aktivno = false;
      clearTimeout(tajmer);
    };
  }, [grupaId, trazeno, radnje]);

  const zatvori = () => {
    setUpit("");
    setRezultat(null);
    setIzabrani(new Set());
    setPoruka(null);
    onZatvori();
  };

  const primeni = async () => {
    if (!grupa || izabrani.size === 0) return;
    setRadi(true);
    const ishod = await radnje.primeniGrupuNa(grupa.id, [...izabrani]);
    setRadi(false);
    if (!ishod.ok) {
      setPoruka(menuStudioSr.red.nijeSacuvano);
      return;
    }
    const delovi = [mnozina(pr.gotovo, ishod.vrednost.dodato)];
    if (ishod.vrednost.preskoceno > 0) delovi.push(mnozina(pr.preskoceno, ishod.vrednost.preskoceno));
    onGotovo(delovi.join(" "));
    zatvori();
  };

  const vidljivi = rezultat && rezultat !== "greska" && trazeno.length >= MIN_UPIT ? rezultat.artikli.filter((a) => a.artikalId !== artikalId) : [];
  const trazi = trazeno.length >= MIN_UPIT && (rezultat === null || (rezultat !== "greska" && rezultat.upit !== trazeno));

  return (
    <StudioDijalog
      otvoreno={grupa !== null}
      onOtvoreno={(otvoreno) => (otvoreno ? undefined : zatvori())}
      naslov={grupa ? fmt(pr.naslov, { naziv: grupa.naziv }) : ""}
      opis={pr.opis}
      sirina="siroka"
      podnozje={
        <>
          <p role="status" className="mr-auto text-sm text-[var(--mp-tekst-sporedni)]">
            {izabrani.size > 0 ? mnozina(pr.izabrano, izabrani.size) : ""}
          </p>
          <Dugme vrsta="tiho" onClick={zatvori}>
            {pr.otkazi}
          </Dugme>
          <Dugme vrsta="primarno" disabled={izabrani.size === 0} ucitava={radi} onClick={() => void primeni()} data-primeni-grupu="">
            {mnozina(pr.primeni, Math.max(1, izabrani.size))}
          </Dugme>
        </>
      }
    >
      <div className="grid gap-3">
        <label className="relative">
          <span className="sr-only">{pr.pretraga}</span>
          <Search aria-hidden="true" strokeWidth={1.75} className="pointer-events-none absolute left-3 top-3 size-5 text-[var(--mp-tekst-sporedni)]" />
          <input
            type="search"
            value={upit}
            autoComplete="off"
            placeholder={pr.pretraga}
            aria-describedby={`${id}-pomoc`}
            onChange={(event) => setUpit(event.target.value)}
            className={cn(POLJE_KLASA, "h-[var(--mp-meta)] pl-10 [&::-webkit-search-cancel-button]:hidden")}
            data-pretraga-artikala=""
          />
        </label>
        <p id={`${id}-pomoc`} role="status" className="text-sm text-[var(--mp-tekst-sporedni)]">
          {trazeno.length < MIN_UPIT
            ? pr.pretragaPomoc
            : trazi
              ? pr.trazi
              : rezultat === "greska"
                ? menuStudioSr.red.nijeSacuvano
                : vidljivi.length === 0
                  ? fmt(pr.nemaRezultata, { upit: trazeno })
                  : ""}
        </p>
        {vidljivi.length > 0 ? (
          <ul className="grid divide-y rounded-[var(--mp-radius-kontrola)] border [--border:var(--mp-ivica)]" data-rezultati-artikala="">
            {vidljivi.map((artikal) => {
              const vecIma = imaju.has(artikal.artikalId);
              return (
                <li key={artikal.artikalId} className="px-3 [--border:var(--mp-ivica)]">
                  <PoljePotvrde
                    naziv={
                      <span className="flex flex-wrap items-baseline gap-x-2">
                        <span>{artikal.naziv}</span>
                        <span className="text-sm font-normal tabular-nums text-[var(--mp-tekst-sporedni)]">{tekstCene(artikal.cena)}</span>
                      </span>
                    }
                    opis={vecIma ? pr.vecIma : undefined}
                    checked={vecIma || izabrani.has(artikal.artikalId)}
                    disabled={vecIma}
                    onChange={() =>
                      setIzabrani((pre) => {
                        const sledeci = new Set(pre);
                        if (sledeci.has(artikal.artikalId)) sledeci.delete(artikal.artikalId);
                        else sledeci.add(artikal.artikalId);
                        return sledeci;
                      })
                    }
                  />
                </li>
              );
            })}
          </ul>
        ) : null}
        {poruka ? (
          <p role="alert" className="text-sm font-medium text-[var(--mp-opasnost)]">
            {poruka}
          </p>
        ) : null}
      </div>
    </StudioDijalog>
  );
}
