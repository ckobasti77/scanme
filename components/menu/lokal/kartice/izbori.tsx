"use client";

// ScanMe Menu V1 (K20) — the two selects that decide where a QR card leads:
// the page ("Ulaz u meni" or one of the active pages) and the position ("Bez
// mesta" or one of the positions, grouped by zone when the venue has zones).
// Native selects: they work with every keyboard and screen reader and open the
// platform picker on a phone. The empty value stands for "none" (null).

import { menuLokalSr } from "@/lib/i18n/sr/menu-lokal";
import type { LokalPozicija, LokalStranica, LokalZona } from "@/lib/menu/lokal/model";
import { grupisiPozicije, nazivStranice, POLJE_KLASA } from "../zajednicko";

const t = menuLokalSr;

export function StranicaSelect({
  stranice,
  vrednost,
  onIzbor,
  ...aria
}: {
  stranice: readonly LokalStranica[];
  vrednost: string;
  onIzbor: (kljuc: string) => void;
  id: string;
  "aria-invalid"?: true;
  "aria-describedby"?: string;
}) {
  return (
    <select {...aria} value={vrednost} onChange={(event) => onIzbor(event.target.value)} className={POLJE_KLASA}>
      <option value="">{t.kartice.povezi.ulaz}</option>
      {stranice.map((stranica) => (
        <option key={stranica.key} value={stranica.key}>
          {nazivStranice(stranica)}
        </option>
      ))}
    </select>
  );
}

export function PozicijaSelect({
  zones,
  positions,
  vrednost,
  onIzbor,
  ...aria
}: {
  zones: readonly LokalZona[];
  positions: readonly LokalPozicija[];
  vrednost: string;
  onIzbor: (pozicijaId: string) => void;
  id: string;
  "aria-invalid"?: true;
  "aria-describedby"?: string;
}) {
  const grupe = grupisiPozicije(zones, positions);
  return (
    <select {...aria} value={vrednost} onChange={(event) => onIzbor(event.target.value)} className={POLJE_KLASA}>
      <option value="">{t.kartice.povezi.bezMesta}</option>
      {grupe.map((grupa) => {
        const opcije = grupa.pozicije.map((pozicija) => (
          <option key={pozicija.id} value={pozicija.id}>
            {pozicija.label}
          </option>
        ));
        // Without zones the groups are one flat list; with zones every group is named.
        return zones.length === 0 ? (
          opcije
        ) : (
          <optgroup key={grupa.zona?.id ?? "bez-zone"} label={grupa.zona?.name ?? t.zajednicko.bezZone}>
            {opcije}
          </optgroup>
        );
      })}
    </select>
  );
}
