"use client";

// ScanMe Menu V1 (K20) — the "Lista" view of Lokal i QR (master §9.1–§9.3): the
// positions (tables, rooms, other) grouped by zone in the zone order and then
// "Bez zone"; a venue with no zones sees one flat list and no zone control
// anywhere. Each row says what the position is, how many seats it has (if
// known), whether a working QR card stands on it, and opens its drawer.

import { Layers, PencilLine, Plus, QrCode, CircleDashed, TriangleAlert } from "lucide-react";
import { useId } from "react";
import { fmt } from "@/lib/i18n/format";
import { menuLokalSr } from "@/lib/i18n/sr/menu-lokal";
import type { LokalKartica, LokalPodaci, LokalPozicija } from "@/lib/menu/lokal/model";
import { cardsOfPosition } from "@/lib/menu/qr-diagnostics";
import { Dugme } from "../zajednicko/dugme";
import { OkvirSekcije } from "../zajednicko/okvir-sekcije";
import { PraznoStanje } from "../zajednicko/stanja";
import { StatusOznaka } from "../zajednicko/status-oznaka";
import { brojTekst, grupisiPozicije, IKONICE_VRSTE, type GrupaPozicija } from "./zajednicko";

const t = menuLokalSr;

/** A card stands on the position and a scan reaches it (active card, active Menu link). */
function radi(kartica: LokalKartica): boolean {
  return kartica.status === "active" && kartica.opensMenu && kartica.link !== null && kartica.link.active;
}

function KarticeSazetak({ kartice }: { kartice: readonly LokalKartica[] }) {
  const ispravne = kartice.filter(radi).length;
  if (kartice.length === 0) {
    return (
      <StatusOznaka ton="neutralno" ikonica={CircleDashed} velicina="mala">
        {t.lista.kartice.nemaKartice}
      </StatusOznaka>
    );
  }
  if (ispravne === 0) {
    return (
      <StatusOznaka ton="upozorenje" ikonica={TriangleAlert} velicina="mala">
        {t.lista.kartice.neRadi}
      </StatusOznaka>
    );
  }
  return (
    <StatusOznaka ton="neutralno" ikonica={QrCode} velicina="mala">
      {brojTekst(t.lista.kartice.imaKartice, ispravne)}
    </StatusOznaka>
  );
}

function RedPozicije({
  pozicija,
  kartice,
  onUredi,
}: {
  pozicija: LokalPozicija;
  kartice: readonly LokalKartica[];
  onUredi: (id: string) => void;
}) {
  const Ikonica = IKONICE_VRSTE[pozicija.kind];
  return (
    <li
      data-pozicija={pozicija.id}
      className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 px-3 py-2.5 sm:px-4"
    >
      <span
        aria-hidden="true"
        className="grid size-10 place-items-center rounded-[var(--mp-radius-unutra)] bg-[var(--mp-povrsina-utisana)] text-[var(--mp-tekst)]"
      >
        <Ikonica strokeWidth={1.75} className="size-5" />
      </span>
      <div className="grid min-w-0 gap-1">
        <p className="font-semibold leading-snug text-[var(--mp-tekst)] [overflow-wrap:anywhere]">{pozicija.label}</p>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm text-[var(--mp-tekst-sporedni)]">
            {t.vrste[pozicija.kind]}
            {pozicija.seats !== null ? (
              <>
                {" · "}
                <span className="tabular-nums">{brojTekst(t.brojevi.sedista, pozicija.seats)}</span>
              </>
            ) : null}
          </span>
          <KarticeSazetak kartice={kartice} />
        </div>
      </div>
      <Dugme
        vrsta="sekundarno"
        velicina="kompaktna"
        ikonica={PencilLine}
        aria-label={fmt(t.lista.urediOznaka, { naziv: pozicija.label })}
        onClick={() => onUredi(pozicija.id)}
      >
        {t.lista.uredi}
      </Dugme>
    </li>
  );
}

function ListaGrupe({
  grupa,
  podaci,
  onUredi,
  oznakaId,
}: {
  grupa: GrupaPozicija;
  podaci: LokalPodaci;
  onUredi: (id: string) => void;
  oznakaId?: string;
}) {
  return (
    <ul
      aria-labelledby={oznakaId}
      aria-label={oznakaId ? undefined : t.lista.oznakaListe}
      className="divide-y overflow-hidden rounded-[var(--mp-radius-kartica)] border bg-[var(--mp-povrsina)] shadow-[var(--mp-senka-xs)] [--border:var(--mp-ivica)]"
    >
      {grupa.pozicije.map((pozicija) => (
        <RedPozicije key={pozicija.id} pozicija={pozicija} kartice={cardsOfPosition(podaci.cards, pozicija.id)} onUredi={onUredi} />
      ))}
    </ul>
  );
}

export function ListaPozicija({
  podaci,
  onUredi,
  onDodaj,
  onZone,
}: {
  podaci: LokalPodaci;
  onUredi: (pozicijaId: string) => void;
  onDodaj: () => void;
  onZone: () => void;
}) {
  const id = useId();
  const imaZone = podaci.zones.length > 0;
  const grupe = grupisiPozicije(podaci.zones, podaci.positions);

  return (
    <OkvirSekcije
      naslov={t.lista.naslov}
      opis={t.lista.opis}
      radnje={
        <>
          <Dugme vrsta="sekundarno" ikonica={Layers} onClick={onZone}>
            {imaZone ? t.lista.zone : t.lista.podeliNaZone}
          </Dugme>
          <Dugme vrsta="akcent" ikonica={Plus} onClick={onDodaj}>
            {t.lista.dodajMesta}
          </Dugme>
        </>
      }
    >
      {podaci.positions.length === 0 ? (
        <PraznoStanje
          nivo={3}
          naslov={t.lista.prazno.naslov}
          opis={t.lista.prazno.opis}
          akcija={
            <Dugme vrsta="akcent" ikonica={Plus} onClick={onDodaj}>
              {t.lista.prazno.akcija}
            </Dugme>
          }
        />
      ) : imaZone ? (
        <div className="grid gap-6">
          {grupe.map((grupa) => {
            const grupaId = `${id}-${grupa.zona?.id ?? "bez-zone"}`;
            return (
              <section key={grupaId} aria-labelledby={`${grupaId}-naslov`} data-grupa-zone={grupa.zona?.id ?? "bez-zone"} className="grid gap-2">
                <h3 id={`${grupaId}-naslov`} className="flex flex-wrap items-baseline gap-x-2 text-base font-semibold text-[var(--mp-tekst)]">
                  <span className="[overflow-wrap:anywhere]">{grupa.zona?.name ?? t.zajednicko.bezZone}</span>
                  <span className="text-sm font-normal tabular-nums text-[var(--mp-tekst-sporedni)]">
                    {brojTekst(t.brojevi.mesta, grupa.pozicije.length)}
                  </span>
                </h3>
                {grupa.pozicije.length === 0 ? (
                  <p className="rounded-[var(--mp-radius-kontrola)] bg-[var(--mp-povrsina-utisana)] px-3 py-2.5 text-sm text-[var(--mp-tekst-sporedni)]">
                    {t.lista.praznaZona}
                  </p>
                ) : (
                  <ListaGrupe grupa={grupa} podaci={podaci} onUredi={onUredi} oznakaId={`${grupaId}-naslov`} />
                )}
              </section>
            );
          })}
        </div>
      ) : (
        <ListaGrupe grupa={grupe[0]} podaci={podaci} onUredi={onUredi} />
      )}
    </OkvirSekcije>
  );
}
