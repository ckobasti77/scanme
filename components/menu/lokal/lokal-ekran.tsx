"use client";

// ScanMe Menu V1 (K20) — the screen "Lokal i QR" of the client panel (master
// §9, §13.6): positions (tables, rooms, other), optional zones, the floor
// plan and the QR cards with their state, and a print sheet. Presentational:
// the route (lokal-ruta.tsx) and the izlog hand it the same view model and the
// actions (lib/menu/lokal/model.ts); it keeps only what is open on screen.
// One calm surface, three views of the same data: Lista, Raspored, Kartice.

import { CircleCheck, ExternalLink } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { menuLokalSr } from "@/lib/i18n/sr/menu-lokal";
import type { LokalEkranProps, LokalPodaci, LokalPogled } from "@/lib/menu/lokal/model";
import { Dugme } from "../zajednicko/dugme";
import { ZaglavljeSaStatusom } from "../zajednicko/zaglavlje-sa-statusom";
import { Segmenti } from "../studio/shell/segmenti";
import { DodajPozicije } from "./dodaj-pozicije";
import { Kartice } from "./kartice/kartice";
import { ListaPozicija } from "./lista-pozicija";
import { PozicijaFioka } from "./pozicija-fioka";
import { Raspored } from "./raspored/raspored";
import { StampaQr } from "./stampa-qr";
import { brojTekst } from "./zajednicko";
import { UpravljanjeZonama } from "./zone";

const t = menuLokalSr.ekran;

/** The quiet summary line; it also takes focus when the element that opened a drawer is gone. */
const SAZETAK_ID = "lokal-sazetak";
const PANEL_ID = "lokal-panel";
const TAB_PREFIKS = "lokal-tab";

/** "15 mesta · 3 zone · 18 QR kartica" (zones only when the venue has zones). */
export function sazetakLokala(podaci: LokalPodaci): string {
  const { positions, zones, cards } = podaci;
  if (positions.length === 0 && zones.length === 0 && cards.length === 0) return t.sazetak.nista;
  const delovi = [brojTekst(menuLokalSr.brojevi.mesta, positions.length)];
  if (zones.length > 0) delovi.push(brojTekst(menuLokalSr.brojevi.zone, zones.length));
  delovi.push(brojTekst(menuLokalSr.brojevi.qrKartice, cards.length));
  return delovi.join(t.sazetak.razdelnik);
}

const POGLEDI: readonly { vrednost: LokalPogled; tekst: string }[] = [
  { vrednost: "lista", tekst: t.pogledi.lista },
  { vrednost: "raspored", tekst: t.pogledi.raspored },
  { vrednost: "kartice", tekst: t.pogledi.kartice },
];

type Stampa = { ids: readonly string[]; otvoreno: boolean };

export function LokalEkran({
  podaci,
  radnje,
  pogled,
  onPogled,
  qrOrigin,
  meniHref,
  pocetnaPozicija = null,
  pocetnaStampa = false,
}: LokalEkranProps) {
  const [pozicijaId, setPozicijaId] = useState<string | null>(pocetnaPozicija);
  const [dodajOtvoreno, setDodajOtvoreno] = useState(false);
  const [zoneOtvoreno, setZoneOtvoreno] = useState(false);
  const [stampa, setStampa] = useState<Stampa>(() => ({
    ids: pocetnaStampa ? podaci.cards.map((kartica) => kartica.id) : [],
    otvoreno: pocetnaStampa,
  }));
  const [obavestenje, setObavestenje] = useState("");
  const casovnik = useRef<number | undefined>(undefined);

  // News is said after the drawer that produced it has closed: while a modal is open the page behind it is hidden from screen readers.
  const javi = useCallback((tekst: string) => {
    window.clearTimeout(casovnik.current);
    setObavestenje("");
    casovnik.current = window.setTimeout(() => setObavestenje(tekst), 250);
  }, []);
  useEffect(() => () => window.clearTimeout(casovnik.current), []);
  useEffect(() => {
    if (!obavestenje) return;
    const rukovanje = window.setTimeout(() => setObavestenje(""), 8000);
    return () => window.clearTimeout(rukovanje);
  }, [obavestenje]);

  const pozicija = podaci.positions.find((p) => p.id === pozicijaId) ?? null;
  const zaStampu = podaci.cards.filter((kartica) => stampa.ids.includes(kartica.id));

  return (
    <div className="grid gap-6" data-lokal-ekran="">
      <ZaglavljeSaStatusom
        naslov={t.naslov}
        opis={t.opis}
        radnje={
          <Dugme asChild vrsta="sekundarno">
            <a href={meniHref} target="_blank" rel="noopener noreferrer">
              <ExternalLink aria-hidden="true" strokeWidth={1.75} />
              {t.otvoriJavniMeni}
              <span className="sr-only"> {t.otvaraSeUNovomTabu}</span>
            </a>
          </Dugme>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <Segmenti
          oznaka={t.pogledi.oznaka}
          vrednosti={POGLEDI}
          izabrano={pogled}
          onIzbor={onPogled}
          idPrefiks={TAB_PREFIKS}
          kontrolise={PANEL_ID}
          className="w-full sm:w-auto"
        />
        <p id={SAZETAK_ID} tabIndex={-1} className="text-sm tabular-nums text-[var(--mp-tekst-sporedni)]">
          {sazetakLokala(podaci)}
        </p>
      </div>

      <div role="status" aria-live="polite" aria-atomic="true" className={obavestenje ? undefined : "sr-only"}>
        {obavestenje ? (
          <p className="flex items-start gap-2 rounded-[var(--mp-radius-kontrola)] border px-3 py-2 text-sm font-medium text-[var(--mp-tekst)] [--border:var(--mp-uspeh-ivica)] bg-[var(--mp-uspeh-meko)]">
            <CircleCheck aria-hidden="true" strokeWidth={2} className="mt-0.5 size-4 shrink-0 text-[var(--mp-uspeh)]" />
            <span className="min-w-0">{obavestenje}</span>
          </p>
        ) : null}
      </div>

      <div id={PANEL_ID} role="tabpanel" aria-labelledby={`${TAB_PREFIKS}-${pogled}`} className="min-w-0">
        {pogled === "lista" ? (
          <ListaPozicija
            podaci={podaci}
            onUredi={setPozicijaId}
            onDodaj={() => setDodajOtvoreno(true)}
            onZone={() => setZoneOtvoreno(true)}
          />
        ) : pogled === "raspored" ? (
          <Raspored zones={podaci.zones} positions={podaci.positions} radnje={radnje} onOtvoriPoziciju={setPozicijaId} />
        ) : (
          <Kartice
            podaci={podaci}
            radnje={radnje}
            qrOrigin={qrOrigin}
            onStampa={(ids) => setStampa({ ids, otvoreno: true })}
            onJavi={javi}
          />
        )}
      </div>

      <PozicijaFioka
        pozicija={pozicija}
        podaci={podaci}
        radnje={radnje}
        onZatvori={() => setPozicijaId(null)}
        onJavi={javi}
        fokusRezerva={SAZETAK_ID}
      />
      <DodajPozicije
        otvoreno={dodajOtvoreno}
        podaci={podaci}
        radnje={radnje}
        onZatvori={() => setDodajOtvoreno(false)}
        onJavi={javi}
        fokusRezerva={SAZETAK_ID}
      />
      <UpravljanjeZonama
        otvoreno={zoneOtvoreno}
        zones={podaci.zones}
        positions={podaci.positions}
        radnje={radnje}
        onZatvori={() => setZoneOtvoreno(false)}
        fokusRezerva={SAZETAK_ID}
      />
      <StampaQr
        otvoreno={stampa.otvoreno}
        kartice={zaStampu}
        podaci={podaci}
        qrOrigin={qrOrigin}
        onZatvori={() => setStampa((tekuce) => ({ ...tekuce, otvoreno: false }))}
        fokusRezerva={SAZETAK_ID}
      />
    </div>
  );
}
