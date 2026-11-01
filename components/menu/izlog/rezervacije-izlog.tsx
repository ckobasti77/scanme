"use client";

// ScanMe Menu V1 (K25) — the reservation blocks of the client panel in the
// izlog: Funkcionalnosti > Rezervacije over invented data
// (fixtures/rezervacije.ts); nothing is sent anywhere. K28 mounts Radno vreme
// and Zadržavanje inside the real Podešavanja (podesavanja-izlog.tsx).

import { fixtureRezervacijeConfig } from "@/components/menu/fixtures/rezervacije";
import type { PanelRezervacije } from "@/lib/menu/izlog-params";
import type { ReservationMode } from "@/lib/menu/reservation-config";
import { RezervacijeIzbor } from "../panel/funkcionalnosti/rezervacije";

const REZIM_IZ_PARAMETRA: Record<PanelRezervacije, ReservationMode> = {
  forma: "form",
  eksterni: "external",
  iskljuceno: "off",
};

/**
 * `rezervacije=` picks the way; without it the venue is on the ScanMe form, or
 * off when it has no working hours yet (the form needs them first).
 */
export function RezervacijeIzlog({
  rezervacije,
  bezRadnogVremena,
  radnoVremeHref,
}: {
  rezervacije: PanelRezervacije | null;
  bezRadnogVremena: boolean;
  radnoVremeHref: string;
}) {
  const mode = rezervacije ? REZIM_IZ_PARAMETRA[rezervacije] : bezRadnogVremena ? "off" : "form";
  return (
    <div data-rezervacije-izlog="">
      <RezervacijeIzbor
        config={fixtureRezervacijeConfig({ mode, bezRadnogVremena })}
        bezRadnogVremena={bezRadnogVremena}
        radnoVremeHref={radnoVremeHref}
        onSacuvaj={() => Promise.resolve({ ok: true as const })}
      />
    </div>
  );
}
