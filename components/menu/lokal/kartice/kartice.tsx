"use client";

// ScanMe Menu V1 (K20) — the "Kartice" view of Lokal i QR (master §9.2): every
// QR card of the Menu with its state, where it leads and when it was last
// scanned, the ways to make new cards (for positions without one, for a page),
// and the choice of cards to print. Making several cards for different pages
// costs nothing extra, and the screen says so once.

import { Plus, Printer, QrCode } from "lucide-react";
import { useMemo, useState } from "react";
import { fmt } from "@/lib/i18n/format";
import { menuLokalSr } from "@/lib/i18n/sr/menu-lokal";
import type { LokalPodaci, LokalRadnje } from "@/lib/menu/lokal/model";
import { dijagnozaKartice, positionsWithoutCard, type QrDijagnoza } from "@/lib/menu/qr-diagnostics";
import { cn } from "@/lib/utils";
import { Dugme } from "../../zajednicko/dugme";
import { OkvirSekcije } from "../../zajednicko/okvir-sekcije";
import { PraznoStanje } from "../../zajednicko/stanja";
import { TrakaRadnji } from "../../zajednicko/traka-radnji";
import { Napomena } from "../zajednicko";
import { NapraviZaMesta, NovaZaStranicu } from "./napravi-dijalozi";
import { PoveziDijalog } from "./povezi-dijalog";
import { RedKartice } from "./red-kartice";

const t = menuLokalSr.kartice;

/** Long labels wrap instead of running out of a 390 px screen. */
const DUGME_SIRINA = "h-auto max-w-full whitespace-normal py-2.5 text-center leading-snug";

export function Kartice({
  podaci,
  radnje,
  qrOrigin,
  onStampa,
  onJavi,
}: {
  podaci: LokalPodaci;
  radnje: LokalRadnje;
  qrOrigin: string;
  /** Opens the print sheet with these cards. */
  onStampa: (kartice: string[]) => void;
  onJavi: (tekst: string) => void;
}) {
  const { cards, pages, positions } = podaci;
  const [izabrane, setIzabrane] = useState<readonly string[]>([]);
  const [poveziId, setPoveziId] = useState<string | null>(null);
  const [zaMesta, setZaMesta] = useState(false);
  const [zaStranicu, setZaStranicu] = useState(false);

  const dijagnoze = useMemo(
    () => new Map<string, QrDijagnoza>(cards.map((kartica) => [kartica.id, dijagnozaKartice(kartica, { pages, positions })])),
    [cards, pages, positions],
  );
  const bezKartice = useMemo(() => positionsWithoutCard(positions, cards), [positions, cards]);
  // Cards that disappeared since they were chosen are not counted.
  const zaStampu = cards.filter((kartica) => izabrane.includes(kartica.id));
  const povezi = cards.find((kartica) => kartica.id === poveziId) ?? null;

  const postavi = (id: string, izabrana: boolean) =>
    setIzabrane((tekuce) => (izabrana ? (tekuce.includes(id) ? tekuce : [...tekuce, id]) : tekuce.filter((x) => x !== id)));

  const pravljenje = (
    <>
      {bezKartice.length > 0 ? (
        <Dugme vrsta="sekundarno" ikonica={QrCode} className={DUGME_SIRINA} onClick={() => setZaMesta(true)}>
          {fmt(t.traka.zaMestaBroj, { n: bezKartice.length })}
        </Dugme>
      ) : null}
      <Dugme vrsta="sekundarno" ikonica={Plus} className={DUGME_SIRINA} onClick={() => setZaStranicu(true)}>
        {t.traka.novaZaStranicu}
      </Dugme>
    </>
  );

  return (
    <OkvirSekcije naslov={t.naslov}>
      <Napomena>{t.napomena}</Napomena>
      {podaci.cardsTruncated ? <Napomena>{fmt(t.skraceno, { n: cards.length })}</Napomena> : null}

      {cards.length === 0 ? (
        <PraznoStanje
          ikonica={QrCode}
          naslov={t.prazno.naslov}
          opis={t.prazno.opis}
          nivo={3}
          akcija={pravljenje}
        />
      ) : (
        <>
          <TrakaRadnji oznaka={t.traka.oznaka} poravnanje="pocetak">
            {pravljenje}
            <Dugme
              vrsta="primarno"
              ikonica={Printer}
              className={DUGME_SIRINA}
              disabled={zaStampu.length === 0}
              onClick={() => onStampa(zaStampu.map((kartica) => kartica.id))}
            >
              {fmt(t.traka.stampajIzabrane, { n: zaStampu.length })}
            </Dugme>
            <Dugme
              vrsta="sekundarno"
              ikonica={Printer}
              className={DUGME_SIRINA}
              onClick={() => onStampa(cards.map((kartica) => kartica.id))}
            >
              {t.traka.stampajSve}
            </Dugme>
          </TrakaRadnji>
          <p
            role="status"
            className={cn("text-sm tabular-nums text-[var(--mp-tekst-sporedni)]", zaStampu.length === 0 && "sr-only")}
          >
            {zaStampu.length > 0 ? fmt(t.traka.izabrano, { n: zaStampu.length, ukupno: cards.length }) : null}
          </p>
          <ul aria-label={t.oznakaListe} className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {cards.map((kartica) => {
              const dijagnoza = dijagnoze.get(kartica.id);
              if (!dijagnoza) return null;
              return (
                <RedKartice
                  key={kartica.id}
                  kartica={kartica}
                  dijagnoza={dijagnoza}
                  izabrana={izabrane.includes(kartica.id)}
                  onIzabrana={(izabrana) => postavi(kartica.id, izabrana)}
                  qrOrigin={qrOrigin}
                  radnje={radnje}
                  onPovezi={() => setPoveziId(kartica.id)}
                  onJavi={onJavi}
                />
              );
            })}
          </ul>
        </>
      )}

      <PoveziDijalog kartica={povezi} podaci={podaci} radnje={radnje} onZatvori={() => setPoveziId(null)} onJavi={onJavi} />
      <NapraviZaMesta
        otvoreno={zaMesta}
        bezKartice={bezKartice}
        podaci={podaci}
        radnje={radnje}
        onZatvori={() => setZaMesta(false)}
        onJavi={onJavi}
      />
      <NovaZaStranicu
        otvoreno={zaStranicu}
        podaci={podaci}
        radnje={radnje}
        onZatvori={() => setZaStranicu(false)}
        onJavi={onJavi}
      />
    </OkvirSekcije>
  );
}
