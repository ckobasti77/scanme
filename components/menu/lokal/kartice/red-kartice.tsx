"use client";

// ScanMe Menu V1 (K20) — one QR card in the list of cards (master §9.2): its
// label and code, state, where a scan leads, the last scan, what is wrong, and
// the actions (Poveži, Isključi/Uključi, Preuzmi SVG, choose for printing).
// A card of ScanMe is shown with the reason and without the edit actions.

import { Download, Link2, Lock, Power, PowerOff } from "lucide-react";
import { useRef, useState } from "react";
import { fmt } from "@/lib/i18n/format";
import { menuLokalSr } from "@/lib/i18n/sr/menu-lokal";
import type { LokalKartica, LokalRadnje } from "@/lib/menu/lokal/model";
import type { QrDijagnoza } from "@/lib/menu/qr-diagnostics";
import { Dugme } from "../../zajednicko/dugme";
import { Kartica } from "../../zajednicko/kartica";
import { PoljePotvrde } from "../../zajednicko/prekidac";
import { StatusOznaka } from "../../zajednicko/status-oznaka";
import { preuzmiSvg, qrAdresa, qrSvgDokument } from "../qr-slika";
import { Potvrda, PorukaGreske, useRadnja } from "../zajednicko";
import { odredisteTekst, ProblemiKartice, skenTekst, StanjeKartice } from "./stanje-kartice";

const t = menuLokalSr.kartice;

export function RedKartice({
  kartica,
  dijagnoza,
  izabrana,
  onIzabrana,
  qrOrigin,
  radnje,
  onPovezi,
  onJavi,
}: {
  kartica: LokalKartica;
  dijagnoza: QrDijagnoza;
  izabrana: boolean;
  onIzabrana: (izabrana: boolean) => void;
  qrOrigin: string;
  radnje: LokalRadnje;
  onPovezi: () => void;
  onJavi: (tekst: string) => void;
}) {
  const { radi, greska, pokreni, ocisti } = useRadnja();
  const [potvrdaIskljuci, setPotvrdaIskljuci] = useState(false);
  const akcijeRef = useRef<HTMLDivElement>(null);
  const samoCitanje = dijagnoza.samoCitanje || kartica.managedByScanMe;
  const iskljucena = dijagnoza.stanje === "iskljucena";
  const drugoOdrediste = dijagnoza.stanje === "drugo-odrediste";
  const odrediste = odredisteTekst(dijagnoza);

  const promeniAktivnost = async (aktivna: boolean) => {
    const uspeh = await pokreni("aktivnost", () => radnje.setCardActive(kartica.id, aktivna));
    if (!uspeh) return;
    setPotvrdaIskljuci(false);
    onJavi(fmt(aktivna ? t.ukljucena : t.iskljucena, { naziv: kartica.label }));
    // Isključi and Uključi are two buttons; focus goes to the one that is there now.
    window.requestAnimationFrame(() => akcijeRef.current?.querySelector<HTMLElement>("[data-aktivnost]")?.focus());
  };

  const preuzmi = () => {
    ocisti();
    preuzmiSvg(
      `scanme-qr-${kartica.cardCode}.svg`,
      qrSvgDokument({ url: qrAdresa(qrOrigin, kartica.cardCode), naslov: kartica.label, podnaslov: kartica.cardCode }),
    );
    onJavi(fmt(t.preuzeta, { naziv: kartica.label }));
  };

  return (
    <Kartica as="li" data-kartica-id={kartica.id} className="grid content-start gap-3 p-4 sm:p-4 lg:p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold leading-snug text-[var(--mp-tekst)] [overflow-wrap:anywhere]">{kartica.label}</h3>
          <p className="font-mono text-sm tracking-wide text-[var(--mp-tekst-sporedni)]">
            <span className="sr-only">{t.kod}: </span>
            {kartica.cardCode}
          </p>
        </div>
        <StanjeKartice stanje={dijagnoza.stanje} />
      </div>

      <div className="grid gap-1 text-sm leading-snug">
        {odrediste ? <p className="font-medium text-[var(--mp-tekst)] [overflow-wrap:anywhere]">{odrediste}</p> : null}
        {drugoOdrediste ? <p className="text-[var(--mp-tekst-sporedni)]">{t.drugoOdrediste}</p> : null}
        <p className="text-[var(--mp-tekst-sporedni)]">
          <span>{skenTekst(kartica, dijagnoza)}</span>
          {kartica.totalScans > 0 ? (
            <>
              <span aria-hidden="true"> · </span>
              <span className="tabular-nums">{fmt(t.sken.ukupno, { n: kartica.totalScans })}</span>
            </>
          ) : null}
        </p>
      </div>

      <ProblemiKartice problemi={dijagnoza.problemi} />

      {samoCitanje ? (
        <StatusOznaka ton="neutralno" ikonica={Lock} className="justify-self-start">
          {t.scanMe}
        </StatusOznaka>
      ) : null}

      {potvrdaIskljuci ? (
        <Potvrda
          tekst={t.iskljuciPotvrda}
          potvrdi={t.iskljuciDa}
          odustani={t.iskljuciNe}
          radi={radi !== null}
          onPotvrdi={() => void promeniAktivnost(false)}
          onOdustani={() => {
            setPotvrdaIskljuci(false);
            akcijeRef.current?.querySelector<HTMLElement>("[data-aktivnost]")?.focus();
          }}
        />
      ) : null}

      {greska ? <PorukaGreske>{greska}</PorukaGreske> : null}

      <div ref={akcijeRef} className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] items-center gap-2">
        {samoCitanje || drugoOdrediste ? null : (
          <Dugme
            vrsta="sekundarno"
            velicina="kompaktna"
            ikonica={Link2}
            aria-label={fmt(t.radnje.poveziAria, { naziv: kartica.label })}
            onClick={onPovezi}
          >
            {t.radnje.poveziOznaka}
          </Dugme>
        )}
        {/* K34: only a card whose destination is the Menu is switched here (menuQr.setCardActive refuses others). */}
        {samoCitanje || !kartica.opensMenu ? null : iskljucena ? (
          <Dugme
            vrsta="sekundarno"
            velicina="kompaktna"
            ikonica={Power}
            data-aktivnost=""
            ucitava={radi === "aktivnost"}
            aria-label={fmt(t.radnje.ukljuciAria, { naziv: kartica.label })}
            onClick={() => void promeniAktivnost(true)}
          >
            {t.radnje.ukljuci}
          </Dugme>
        ) : (
          <Dugme
            vrsta="sekundarno"
            velicina="kompaktna"
            ikonica={PowerOff}
            data-aktivnost=""
            aria-expanded={potvrdaIskljuci}
            aria-label={fmt(t.radnje.iskljuciAria, { naziv: kartica.label })}
            onClick={() => setPotvrdaIskljuci(true)}
          >
            {t.radnje.iskljuci}
          </Dugme>
        )}
        <Dugme
          vrsta="sekundarno"
          velicina="kompaktna"
          ikonica={Download}
          aria-label={fmt(t.radnje.preuzmiAria, { naziv: kartica.label })}
          onClick={preuzmi}
        >
          {t.radnje.preuzmi}
        </Dugme>
        <PoljePotvrde
          checked={izabrana}
          onChange={(event) => onIzabrana(event.target.checked)}
          naziv={
            <>
              {t.zaStampu}
              <span className="sr-only"> {kartica.label}</span>
            </>
          }
        />
      </div>
    </Kartica>
  );
}
