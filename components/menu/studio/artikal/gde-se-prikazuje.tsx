"use client";

// ScanMe Menu V1 — where the article shows (K15; master §5.1–§5.3): every
// page and section it is on, removing it from one page, adding it to another
// (the same article, re-used — never a copy), and the plain statement that
// the price is shared: one base price on every standard page. Changes go into
// the draft.

import { Plus, Unlink } from "lucide-react";
import { useId, useState } from "react";
import { fmt } from "@/lib/i18n/format";
import { menuStudioSr } from "@/lib/i18n/sr/menu-studio";
import type {
  StudioDetaljArtikla,
  StudioIshod,
  StudioPrikazArtikla,
  StudioRadnje,
  StudioSekcijaStranice,
  StudioStranica,
} from "@/lib/menu/studio/model";
import { cn } from "@/lib/utils";
import { Dugme } from "../../zajednicko/dugme";
import { StatusOznaka } from "../../zajednicko/status-oznaka";
import { porukaGreske, tekstCene } from "../red-artikla/red-artikla";
import { OZNAKA_KLASA, POLJE_KLASA } from "./polja";

const g = menuStudioSr.artikal.gde;

function poruka(ishod: StudioIshod<unknown>): string | null {
  if (ishod.ok) return null;
  return ishod.vrsta === "greska" && !ishod.ponovljivo ? (porukaGreske(ishod.kod) ?? menuStudioSr.artikal.nijeSacuvano) : menuStudioSr.artikal.nijeSacuvano;
}

export function GdeSePrikazuje({
  detalj,
  cena,
  stranice,
  radnje,
  mozeUredjivanje,
  najavi,
}: {
  detalj: StudioDetaljArtikla;
  /** The shared base price as the editor shows it now (a queued value wins). */
  cena: number | null;
  stranice: readonly StudioStranica[];
  radnje: Pick<StudioRadnje, "ukloniSaStranice" | "dodajPostojeci" | "sekcijeStranice">;
  mozeUredjivanje: boolean;
  najavi: (tekst: string) => void;
}) {
  const id = useId();
  const { artikal, prikazi } = detalj;
  const [potvrdaZadnjeg, setPotvrdaZadnjeg] = useState<string | null>(null);
  const [radi, setRadi] = useState(false);
  const [greska, setGreska] = useState<string | null>(null);
  const [stranicaId, setStranicaId] = useState("");
  const [sekcije, setSekcije] = useState<{ stranicaId: string; lista: StudioSekcijaStranice[] } | null>(null);
  const [sekcijaId, setSekcijaId] = useState("");
  const aktivne = stranice.filter((stranica) => !stranica.arhivirana);

  const ukloni = async (prikaz: StudioPrikazArtikla) => {
    setRadi(true);
    const ishod = await radnje.ukloniSaStranice([prikaz.prikazId]);
    setRadi(false);
    setPotvrdaZadnjeg(null);
    setGreska(poruka(ishod));
    if (ishod.ok) najavi(fmt(g.uklonjeno, { stranica: prikaz.stranica }));
  };

  const izaberiStranicu = async (sledeca: string) => {
    setStranicaId(sledeca);
    setSekcijaId("");
    setGreska(null);
    if (!sledeca) return;
    const ishod = await radnje.sekcijeStranice(sledeca);
    if (!ishod.ok) {
      setGreska(poruka(ishod));
      return;
    }
    setSekcije({ stranicaId: sledeca, lista: ishod.vrednost });
    setSekcijaId(ishod.vrednost[0]?.id ?? "");
  };

  const dodaj = async () => {
    if (!sekcijaId) return;
    const stranica = aktivne.find((s) => s.id === stranicaId)?.naziv ?? "";
    if (prikazi.some((prikaz) => prikaz.sekcijaId === sekcijaId)) {
      setGreska(g.vecTu);
      return;
    }
    setRadi(true);
    const ishod = await radnje.dodajPostojeci(sekcijaId, artikal.id);
    setRadi(false);
    setGreska(poruka(ishod));
    if (ishod.ok) {
      najavi(fmt(g.dodato, { stranica }));
      setStranicaId("");
      setSekcije(null);
      setSekcijaId("");
    }
  };

  const listaSekcija = sekcije && sekcije.stranicaId === stranicaId ? sekcije.lista : null;

  return (
    <div className="grid gap-4">
      <p className="rounded-[var(--mp-radius-kontrola)] border px-3 py-2 text-sm font-medium [--border:var(--mp-ivica)] bg-[var(--mp-povrsina-utisana)]" data-cena-zajednicka="">
        {cena === null ? g.bezCene : fmt(g.cena, { cena: tekstCene(cena) })}
      </p>
      {prikazi.length === 0 ? (
        <p role="status" className="rounded-[var(--mp-radius-kontrola)] border px-3 py-2 text-sm font-medium [--border:var(--mp-upozorenje-ivica)] bg-[var(--mp-upozorenje-meko)]">
          {g.nijedna}
        </p>
      ) : (
        <ul className="grid gap-2" data-prikazi-artikla="">
          {prikazi.map((prikaz) => (
            <li key={prikaz.prikazId} className="grid gap-2 rounded-[var(--mp-radius-kontrola)] border px-3 py-2.5 [--border:var(--mp-ivica)]">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className="font-semibold [overflow-wrap:anywhere]">{prikaz.stranica}</span>
                  <span className="text-sm text-[var(--mp-tekst-sporedni)] [overflow-wrap:anywhere]">{prikaz.sekcija}</span>
                </span>
                <span className="flex flex-wrap gap-1.5">
                  {prikaz.podrazumevana ? <StatusOznaka ton="neutralno" velicina="mala">{g.podrazumevana}</StatusOznaka> : null}
                  {prikaz.sakriven ? <StatusOznaka ton="neutralno" velicina="mala">{g.sakriveno}</StatusOznaka> : null}
                  {prikaz.arhivirana ? <StatusOznaka ton="upozorenje" velicina="mala">{g.arhivirana}</StatusOznaka> : null}
                </span>
                {mozeUredjivanje && !prikaz.arhivirana ? (
                  <Dugme
                    vrsta="tiho"
                    velicina="kompaktna"
                    ikonica={Unlink}
                    disabled={radi}
                    aria-label={fmt(g.ukloniOznaka, { stranica: prikaz.stranica, sekcija: prikaz.sekcija })}
                    onClick={() => (prikazi.length === 1 ? setPotvrdaZadnjeg(prikaz.prikazId) : void ukloni(prikaz))}
                  >
                    {g.ukloni}
                  </Dugme>
                ) : null}
              </div>
              {potvrdaZadnjeg === prikaz.prikazId ? (
                <div role="alert" className="grid gap-2 rounded-[var(--mp-radius-kontrola)] border px-3 py-2 text-sm [--border:var(--mp-upozorenje-ivica)] bg-[var(--mp-upozorenje-meko)]">
                  <p>{g.poslednje}</p>
                  <span className="flex flex-wrap gap-2">
                    <Dugme vrsta="opasno" velicina="kompaktna" ucitava={radi} onClick={() => void ukloni(prikaz)}>
                      {g.ukloni}
                    </Dugme>
                    <Dugme vrsta="tiho" velicina="kompaktna" onClick={() => setPotvrdaZadnjeg(null)}>
                      {menuStudioSr.artikal.dodaci.otkazi}
                    </Dugme>
                  </span>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {mozeUredjivanje && aktivne.length > 0 ? (
        <fieldset className="grid gap-3 rounded-[var(--mp-radius-kontrola)] bg-[var(--mp-povrsina-utisana)] p-3">
          <legend className="float-left mb-0 text-sm font-semibold">{g.dodaj}</legend>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
            <div className="grid gap-1.5">
              <label htmlFor={`${id}-stranica`} className={OZNAKA_KLASA}>
                {g.stranica}
              </label>
              <select
                id={`${id}-stranica`}
                value={stranicaId}
                onChange={(event) => void izaberiStranicu(event.target.value)}
                className={cn(POLJE_KLASA, "h-[var(--mp-meta)] pr-8")}
                data-dodaj-stranica=""
              >
                <option value="">{g.izaberiStranicu}</option>
                {aktivne.map((stranica) => (
                  <option key={stranica.id} value={stranica.id}>
                    {stranica.naziv}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <label htmlFor={`${id}-sekcija`} className={OZNAKA_KLASA}>
                {g.sekcija}
              </label>
              <select
                id={`${id}-sekcija`}
                value={sekcijaId}
                disabled={!listaSekcija || listaSekcija.length === 0}
                onChange={(event) => setSekcijaId(event.target.value)}
                className={cn(POLJE_KLASA, "h-[var(--mp-meta)] pr-8")}
              >
                {listaSekcija && listaSekcija.length === 0 ? <option value="">{g.nemaSekcija}</option> : null}
                {(listaSekcija ?? []).map((sekcija) => (
                  <option key={sekcija.id} value={sekcija.id}>
                    {sekcija.naziv}
                  </option>
                ))}
              </select>
            </div>
            <Dugme vrsta="sekundarno" ikonica={Plus} disabled={!sekcijaId} ucitava={radi} onClick={() => void dodaj()} data-dodaj-na-stranicu="">
              {g.dodajDugme}
            </Dugme>
          </div>
        </fieldset>
      ) : null}
      {greska ? (
        <p role="alert" className="text-sm font-medium text-[var(--mp-opasnost)]">
          {greska}
        </p>
      ) : null}
    </div>
  );
}
