"use client";

// ScanMe Menu V1 — the layout actions of `Izaberi više` (K11; master §5.1,
// §5.6): move the selection to a section of this page, show the same articles
// on another page (same article, same price), or remove them from this page
// only. Each is one call into the draft; nothing is published by itself.

import { useEffect, useId, useState, type ReactNode } from "react";
import { menuStudioSr } from "@/lib/i18n/sr/menu-studio";
import type { StudioIshod, StudioSekcijaStranice } from "@/lib/menu/studio/model";
import { Dugme } from "../../zajednicko/dugme";
import { StudioDijalog } from "../dijalog";
import { porukaGreske } from "../red-artikla/red-artikla";
import { izabranoTekst } from "./traka-izbora";

const t = menuStudioSr;

export type RasporedVrsta = "premesti" | "dodaj" | "ukloni";

const poljeKlase =
  "h-[var(--mp-meta)] w-full rounded-[var(--mp-radius-kontrola)] border [--border:var(--mp-ivica-kontrole)] bg-[var(--mp-povrsina)] px-3 text-[0.9375rem] text-[var(--mp-tekst)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mp-fokus)] disabled:opacity-55";

export function RasporedDijalog({
  vrsta,
  broj,
  sekcije,
  stranice,
  ucitajSekcije,
  onPremesti,
  onDodaj,
  onUkloni,
  onZatvori,
}: {
  vrsta: RasporedVrsta | null;
  /** Selected rows. */
  broj: number;
  /** The sections of this page. */
  sekcije: readonly StudioSekcijaStranice[];
  /** The other active pages. */
  stranice: readonly { id: string; naziv: string }[];
  ucitajSekcije: (stranicaId: string) => Promise<StudioIshod<StudioSekcijaStranice[]>>;
  onPremesti: (sekcijaId: string) => Promise<string | null>;
  onDodaj: (sekcijaId: string, stranica: string) => Promise<string | null>;
  onUkloni: () => Promise<string | null>;
  onZatvori: () => void;
}) {
  const naslov =
    vrsta === "premesti" ? t.izaberiVise.premestiNaslov : vrsta === "dodaj" ? t.izaberiVise.dodajNaslov : t.izaberiVise.ukloniNaslov;
  const opis =
    vrsta === "premesti" ? t.izaberiVise.premestiOpis : vrsta === "dodaj" ? t.izaberiVise.dodajOpis : t.izaberiVise.ukloniOpis;
  return (
    <StudioDijalog otvoreno={vrsta !== null} onOtvoreno={(otvoreno) => (otvoreno ? undefined : onZatvori())} naslov={naslov} opis={opis}>
      {vrsta ? (
        <RasporedSadrzaj
          key={vrsta}
          vrsta={vrsta}
          broj={broj}
          sekcije={sekcije}
          stranice={stranice}
          ucitajSekcije={ucitajSekcije}
          onPremesti={onPremesti}
          onDodaj={onDodaj}
          onUkloni={onUkloni}
          onZatvori={onZatvori}
        />
      ) : null}
    </StudioDijalog>
  );
}

function RasporedSadrzaj({
  vrsta,
  broj,
  sekcije,
  stranice,
  ucitajSekcije,
  onPremesti,
  onDodaj,
  onUkloni,
  onZatvori,
}: {
  vrsta: RasporedVrsta;
  broj: number;
  sekcije: readonly StudioSekcijaStranice[];
  stranice: readonly { id: string; naziv: string }[];
  ucitajSekcije: (stranicaId: string) => Promise<StudioIshod<StudioSekcijaStranice[]>>;
  onPremesti: (sekcijaId: string) => Promise<string | null>;
  onDodaj: (sekcijaId: string, stranica: string) => Promise<string | null>;
  onUkloni: () => Promise<string | null>;
  onZatvori: () => void;
}) {
  const id = useId();
  const [sekcijaId, setSekcijaId] = useState(sekcije[0]?.id ?? "");
  const [stranicaId, setStranicaId] = useState(stranice[0]?.id ?? "");
  const [cilj, setCilj] = useState<{ stranicaId: string; sekcije: StudioSekcijaStranice[] | null; greska: string | null }>({
    stranicaId: "",
    sekcije: null,
    greska: null,
  });
  const [ciljSekcija, setCiljSekcija] = useState("");
  const [radi, setRadi] = useState(false);
  const [greska, setGreska] = useState<string | null>(null);

  useEffect(() => {
    if (vrsta !== "dodaj" || !stranicaId) return;
    let vazi = true;
    void ucitajSekcije(stranicaId).then((ishod) => {
      if (!vazi) return;
      if (!ishod.ok) {
        setCilj({ stranicaId, sekcije: [], greska: ishod.vrsta === "greska" ? (porukaGreske(ishod.kod) ?? t.red.nijeSacuvano) : t.red.nijeSacuvano });
        return;
      }
      setCilj({ stranicaId, sekcije: ishod.vrednost, greska: null });
      setCiljSekcija(ishod.vrednost[0]?.id ?? "");
    });
    return () => {
      vazi = false;
    };
  }, [vrsta, stranicaId, ucitajSekcije]);

  const izvrsi = async (rad: () => Promise<string | null>) => {
    setRadi(true);
    const problem = await rad();
    setRadi(false);
    if (problem) setGreska(problem);
    else onZatvori();
  };

  const ucitano = cilj.stranicaId === stranicaId ? cilj : null;
  const stranicaNaziv = stranice.find((stranica) => stranica.id === stranicaId)?.naziv ?? "";
  let telo: ReactNode;
  let potvrda: ReactNode;
  if (vrsta === "premesti") {
    telo = (
      <div className="grid gap-1.5">
        <label htmlFor={`${id}-sekcija`} className="text-sm font-medium">
          {t.izaberiVise.sekcija}
        </label>
        <select id={`${id}-sekcija`} data-raspored-sekcija="" value={sekcijaId} onChange={(event) => setSekcijaId(event.target.value)} className={poljeKlase}>
          {sekcije.map((sekcija) => (
            <option key={sekcija.id} value={sekcija.id}>
              {sekcija.naziv}
            </option>
          ))}
        </select>
      </div>
    );
    potvrda = (
      <Dugme vrsta="primarno" ucitava={radi} disabled={!sekcijaId} onClick={() => izvrsi(() => onPremesti(sekcijaId))} data-raspored-potvrdi="">
        {t.izaberiVise.premestiDugme}
      </Dugme>
    );
  } else if (vrsta === "dodaj") {
    telo =
      stranice.length === 0 ? (
        <p role="status" className="text-[0.9375rem]">
          {t.izaberiVise.nemaDrugihStranica}
        </p>
      ) : (
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <label htmlFor={`${id}-stranica`} className="text-sm font-medium">
              {t.izaberiVise.stranica}
            </label>
            <select id={`${id}-stranica`} data-raspored-stranica="" value={stranicaId} onChange={(event) => setStranicaId(event.target.value)} className={poljeKlase}>
              {stranice.map((stranica) => (
                <option key={stranica.id} value={stranica.id}>
                  {stranica.naziv}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <label htmlFor={`${id}-cilj-sekcija`} className="text-sm font-medium">
              {t.izaberiVise.sekcija}
            </label>
            {ucitano?.sekcije && ucitano.sekcije.length === 0 && !ucitano.greska ? (
              <p role="status" className="text-sm text-[var(--mp-tekst-sporedni)]">
                {t.izaberiVise.nemaSekcija}
              </p>
            ) : (
              <select
                id={`${id}-cilj-sekcija`}
                data-raspored-cilj-sekcija=""
                value={ciljSekcija}
                disabled={!ucitano?.sekcije}
                onChange={(event) => setCiljSekcija(event.target.value)}
                className={poljeKlase}
              >
                {ucitano?.sekcije ? (
                  ucitano.sekcije.map((sekcija) => (
                    <option key={sekcija.id} value={sekcija.id}>
                      {sekcija.naziv}
                    </option>
                  ))
                ) : (
                  <option value="">{t.izaberiVise.ucitavaSekcije}</option>
                )}
              </select>
            )}
            {ucitano?.greska ? (
              <p role="alert" className="text-sm font-medium text-[var(--mp-opasnost)]">
                {ucitano.greska}
              </p>
            ) : null}
          </div>
        </div>
      );
    potvrda = (
      <Dugme
        vrsta="primarno"
        ucitava={radi}
        disabled={!ciljSekcija || !ucitano?.sekcije?.some((sekcija) => sekcija.id === ciljSekcija)}
        onClick={() => izvrsi(() => onDodaj(ciljSekcija, stranicaNaziv))}
        data-raspored-potvrdi=""
      >
        {t.izaberiVise.dodajDugme}
      </Dugme>
    );
  } else {
    telo = <p className="text-[0.9375rem] font-medium">{izabranoTekst(broj)}</p>;
    potvrda = (
      <Dugme vrsta="opasno" ucitava={radi} onClick={() => izvrsi(onUkloni)} data-raspored-potvrdi="">
        {t.izaberiVise.ukloniDugme}
      </Dugme>
    );
  }

  return (
    <div className="grid gap-4">
      {vrsta !== "ukloni" ? <p className="text-sm text-[var(--mp-tekst-sporedni)]">{izabranoTekst(broj)}</p> : null}
      {telo}
      {greska ? (
        <p role="alert" className="text-sm font-medium text-[var(--mp-opasnost)]">
          {greska}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-3 [--border:var(--mp-ivica)]">
        <Dugme vrsta="tiho" onClick={onZatvori}>
          {t.izaberiVise.otkazi}
        </Dugme>
        {potvrda}
      </div>
    </div>
  );
}
