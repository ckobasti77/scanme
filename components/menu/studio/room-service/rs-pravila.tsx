"use client";

// ScanMe Menu V1 — the price rules of Room service (K16; master §5.3, LOCKED
// order): base price → markup in percent (for all or for selected articles,
// rounded to a whole dinar) → manual Room service price → ONE delivery fee per
// order. The rules are saved together with one button, into the draft, by
// compare-and-set on what the editor showed. Collapsed on phones (K09 §3.3).

import { useId, useState } from "react";
import { fmt } from "@/lib/i18n/format";
import { menuStudioSr } from "@/lib/i18n/sr/menu-studio";
import { parseMarkupInput } from "@/lib/menu/rs-price-origin";
import type { StudioIshod, StudioRsPravila } from "@/lib/menu/studio/model";
import { formatCenaPolje, parseCenaUnos } from "@/lib/menu/studio/price-input";
import { cn } from "@/lib/utils";
import { Dugme } from "../../zajednicko/dugme";
import { IzborSegment, OZNAKA_KLASA, POLJE_KLASA, SklopivaGrupa } from "../artikal/polja";
import { porukaGreske, tekstCene } from "../red-artikla/red-artikla";
import { formatProcenat } from "./rs-poreklo";

const t = menuStudioSr;
const p = t.posebno.roomService.pravila;

/** "uvećanje 15 % za sve artikle · naknada 300 RSD po porudžbini". */
export function sazetakPravila(pravila: StudioRsPravila): string {
  const uvecanje =
    pravila.uvecanje === null
      ? p.sazetakBezUvecanja
      : fmt(p.sazetakUvecanje, {
          p: formatProcenat(pravila.uvecanje),
          obuhvat: pravila.obuhvat === "all" ? p.obuhvatSveKratko : p.obuhvatIzabraneKratko,
        });
  const naknada = pravila.naknada === null ? p.sazetakBezNaknade : fmt(p.sazetakNaknada, { cena: tekstCene(pravila.naknada) });
  return `${uvecanje} · ${naknada}`;
}

export function RsPravila({
  pravila,
  mozeUredjivanje,
  pocetnoOtvoreno,
  onSacuvaj,
  najavi,
}: {
  pravila: StudioRsPravila;
  mozeUredjivanje: boolean;
  pocetnoOtvoreno: boolean;
  onSacuvaj: (ocekivano: StudioRsPravila, izmena: Partial<StudioRsPravila>) => Promise<StudioIshod>;
  najavi: (tekst: string) => void;
}) {
  const id = useId();
  const [otvoreno, setOtvoreno] = useState(pocetnoOtvoreno);
  const [uvecanje, setUvecanje] = useState(pravila.uvecanje === null ? "" : formatProcenat(pravila.uvecanje));
  const [obuhvat, setObuhvat] = useState(pravila.obuhvat);
  const [naknada, setNaknada] = useState(formatCenaPolje(pravila.naknada));
  const [greske, setGreske] = useState<{ uvecanje?: string; naknada?: string; opste?: string }>({});
  const [radi, setRadi] = useState(false);

  const sacuvaj = async () => {
    const u = parseMarkupInput(uvecanje);
    const n = parseCenaUnos(naknada);
    const nove: typeof greske = {};
    if (!u.ok) nove.uvecanje = p.greskaProcenat;
    if (!n.ok) nove.naknada = p.greskaNaknada;
    setGreske(nove);
    if (!u.ok || !n.ok) return;
    const izmena: Partial<StudioRsPravila> = {};
    if (u.percent !== pravila.uvecanje) izmena.uvecanje = u.percent;
    if (obuhvat !== pravila.obuhvat) izmena.obuhvat = obuhvat;
    if (n.cena !== pravila.naknada) izmena.naknada = n.cena;
    if (Object.keys(izmena).length === 0) return;
    setRadi(true);
    const ishod = await onSacuvaj(pravila, izmena);
    setRadi(false);
    if (ishod.ok) {
      najavi(p.sacuvano);
      return;
    }
    setGreske({
      opste:
        ishod.vrsta === "konflikt"
          ? t.red.nijeSacuvano
          : `${t.red.nijeSacuvano}${porukaGreske(ishod.kod) ? ` ${porukaGreske(ishod.kod)}` : ""}`,
    });
  };

  return (
    <SklopivaGrupa id={`${id}-pravila`} naslov={p.naslov} sazetak={sazetakPravila(pravila)} otvoreno={otvoreno} onOtvoreno={setOtvoreno}>
      <div className="grid gap-4" data-rs-pravila="">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid content-start gap-1.5">
            <span className={OZNAKA_KLASA}>{p.uvecanje}</span>
            <input
              className={cn(POLJE_KLASA, "h-[var(--mp-meta)] max-w-[10rem] text-right tabular-nums")}
              inputMode="decimal"
              autoComplete="off"
              value={uvecanje}
              disabled={!mozeUredjivanje}
              aria-invalid={greske.uvecanje ? true : undefined}
              aria-describedby={`${id}-uvecanje-pomoc${greske.uvecanje ? ` ${id}-uvecanje-greska` : ""}`}
              onChange={(event) => setUvecanje(event.target.value)}
            />
            <span id={`${id}-uvecanje-pomoc`} className="text-sm text-[var(--mp-tekst-sporedni)]">
              {p.uvecanjePomoc}
            </span>
            {greske.uvecanje ? (
              <span id={`${id}-uvecanje-greska`} className="text-sm font-medium text-[var(--mp-opasnost)]">
                {greske.uvecanje}
              </span>
            ) : null}
          </label>
          <label className="grid content-start gap-1.5">
            <span className={OZNAKA_KLASA}>{p.naknada}</span>
            <input
              className={cn(POLJE_KLASA, "h-[var(--mp-meta)] max-w-[10rem] text-right tabular-nums")}
              inputMode="numeric"
              autoComplete="off"
              value={naknada}
              disabled={!mozeUredjivanje}
              aria-invalid={greske.naknada ? true : undefined}
              aria-describedby={`${id}-naknada-pomoc${greske.naknada ? ` ${id}-naknada-greska` : ""}`}
              onChange={(event) => setNaknada(event.target.value)}
            />
            <span id={`${id}-naknada-pomoc`} className="text-sm text-[var(--mp-tekst-sporedni)]">
              {p.naknadaPomoc}
            </span>
            {greske.naknada ? (
              <span id={`${id}-naknada-greska`} className="text-sm font-medium text-[var(--mp-opasnost)]">
                {greske.naknada}
              </span>
            ) : null}
          </label>
        </div>
        <IzborSegment
          oznaka={p.obuhvat}
          vrednosti={[
            { vrednost: "all", tekst: p.obuhvatSve },
            { vrednost: "selected", tekst: p.obuhvatIzabrane },
          ]}
          izabrano={obuhvat}
          onIzbor={setObuhvat}
          onemoguceno={!mozeUredjivanje}
        />
        {greske.opste ? (
          <p role="alert" className="text-sm font-medium text-[var(--mp-opasnost)]">
            {greske.opste}
          </p>
        ) : null}
        {mozeUredjivanje ? (
          <Dugme vrsta="sekundarno" ucitava={radi} onClick={() => void sacuvaj()} className="justify-self-start max-sm:w-full" data-rs-sacuvaj-pravila="">
            {p.sacuvaj}
          </Dugme>
        ) : null}
      </div>
    </SklopivaGrupa>
  );
}
