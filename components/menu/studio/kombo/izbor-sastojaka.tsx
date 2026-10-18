"use client";

// ScanMe Menu V1 — picking a component for a combo (K16; master §5.4): search the
// whole menu by name and add ordinary articles. A combo cannot hold a combo, and
// an article already in the combo is shown as taken. Nothing is saved here: the
// parent collects the picks and saves the full list at once.

import { LoaderCircle, Plus, Search } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { fmt } from "@/lib/i18n/format";
import { menuStudioSr } from "@/lib/i18n/sr/menu-studio";
import type { StudioKandidat, StudioRadnje } from "@/lib/menu/studio/model";
import { cn } from "@/lib/utils";
import { Dugme } from "../../zajednicko/dugme";
import { POLJE_KLASA } from "../artikal/polja";
import { tekstCene } from "../red-artikla/red-artikla";

const t = menuStudioSr.posebno.kombo;
const MIN_UPIT = 2;

export function IzborSastojaka({
  vec,
  onDodaj,
  traziArtikle,
  komboId,
}: {
  /** The articles already in the combo (by article id). */
  vec: ReadonlySet<string>;
  onDodaj: (kandidat: StudioKandidat) => void;
  traziArtikle: StudioRadnje["traziArtikle"];
  /** The combo itself: never offered. */
  komboId: string;
}) {
  const id = useId();
  const [upit, setUpit] = useState("");
  // artikli === null: the search failed.
  const [rezultat, setRezultat] = useState<{ upit: string; artikli: StudioKandidat[] | null } | null>(null);
  const trazeno = upit.trim();

  // The search, 250 ms after the last key.
  useEffect(() => {
    if (trazeno.length < MIN_UPIT) return;
    let aktivno = true;
    const tajmer = setTimeout(() => {
      void traziArtikle(trazeno).then((ishod) => {
        if (aktivno) setRezultat({ upit: trazeno, artikli: ishod.ok ? ishod.vrednost : null });
      });
    }, 250);
    return () => {
      aktivno = false;
      clearTimeout(tajmer);
    };
  }, [trazeno, traziArtikle]);

  const dugacak = trazeno.length >= MIN_UPIT;
  const trazi = dugacak && (rezultat === null || rezultat.upit !== trazeno);
  const greska = dugacak && !trazi && rezultat !== null && rezultat.artikli === null;
  const vidljivi =
    dugacak && !trazi && rezultat?.artikli
      ? rezultat.artikli.filter((kandidat) => kandidat.vrsta !== "combo" && kandidat.artikalId !== komboId)
      : [];

  return (
    <div className="grid gap-3" aria-busy={trazi} data-izbor-sastojaka="">
      <label className="relative block">
        <span className="sr-only">{t.pretraga}</span>
        <Search aria-hidden="true" strokeWidth={1.75} className="pointer-events-none absolute left-3 top-3 size-5 text-[var(--mp-tekst-sporedni)]" />
        <input
          type="search"
          value={upit}
          autoComplete="off"
          placeholder={t.pretraga}
          aria-describedby={`${id}-pomoc`}
          onChange={(event) => setUpit(event.target.value)}
          className={cn(POLJE_KLASA, "h-[var(--mp-meta)] pl-10 [&::-webkit-search-cancel-button]:hidden")}
        />
      </label>
      <p id={`${id}-pomoc`} role="status" className="text-sm text-[var(--mp-tekst-sporedni)]">
        {!dugacak ? (
          t.pretragaPomoc
        ) : trazi ? (
          <span className="inline-flex items-center gap-2">
            <LoaderCircle aria-hidden="true" strokeWidth={1.75} className="size-4 animate-spin motion-reduce:animate-none" />
            {menuStudioSr.artikal.primeni.trazi}
          </span>
        ) : greska ? (
          menuStudioSr.red.nijeSacuvano
        ) : vidljivi.length === 0 ? (
          fmt(t.nemaRezultata, { upit: trazeno })
        ) : null}
      </p>
      {vidljivi.length > 0 ? (
        <ul
          className="grid max-h-[16rem] divide-y overflow-y-auto rounded-[var(--mp-radius-kontrola)] border [--border:var(--mp-ivica)]"
        >
          {vidljivi.map((kandidat) => {
            const jeVec = vec.has(kandidat.artikalId);
            return (
              <li
                key={kandidat.artikalId}
                className="flex min-h-[var(--mp-meta)] items-center justify-between gap-3 px-3 py-1.5 [--border:var(--mp-ivica)]"
              >
                <span className="grid min-w-0 gap-0.5">
                  <span className="break-words text-[0.9375rem] font-medium">{kandidat.naziv}</span>
                  <span className="text-sm tabular-nums text-[var(--mp-tekst-sporedni)]">{tekstCene(kandidat.cena)}</span>
                </span>
                {jeVec ? (
                  <span className="shrink-0 text-sm text-[var(--mp-tekst-sporedni)]">{t.vecU}</span>
                ) : (
                  <Dugme vrsta="sekundarno" velicina="kompaktna" ikonica={Plus} onClick={() => onDodaj(kandidat)}>
                    {t.dodaj}
                  </Dugme>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
