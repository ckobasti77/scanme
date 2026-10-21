"use client";

// ScanMe Menu V1 (K25) — the reservation blocks of the client panel in the
// izlog: Funkcionalnosti > Rezervacije and Podešavanja > Radno vreme and
// Zadržavanje. The real blocks over invented data (fixtures/rezervacije.ts);
// "saving" is applied in memory with the server's own rule for the hours, and
// nothing is sent anywhere. A reload starts over.

import { fixtureRadnoVreme, fixtureRezervacijeConfig } from "@/components/menu/fixtures/rezervacije";
import type { PanelRezervacije } from "@/lib/menu/izlog-params";
import { RESERVATION_ERROR } from "@/lib/menu/errors/reservations";
import type { ReservationMode } from "@/lib/menu/reservation-config";
import { isValidWorkingHours, type WorkingHours } from "@/lib/menu/working-hours";
import { RezervacijeIzbor } from "../panel/funkcionalnosti/rezervacije";
import { RadnoVreme } from "../panel/podesavanja/radno-vreme";
import { ZadrzavanjeRezervacije } from "../panel/podesavanja/zadrzavanje";

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

/** Radno vreme and Zadržavanje rezervacije, the two blocks of Podešavanja that belong to reservations. */
export function PodesavanjaRezervacijaIzlog({ bezRadnogVremena }: { bezRadnogVremena: boolean }) {
  const sacuvaj = (radnoVreme: WorkingHours) =>
    Promise.resolve(
      isValidWorkingHours(radnoVreme)
        ? { ok: true as const }
        : { ok: false as const, code: RESERVATION_ERROR.hoursInvalid },
    );
  return (
    <div data-podesavanja-rezervacija-izlog="" className="grid gap-6">
      <RadnoVreme radnoVreme={bezRadnogVremena ? null : fixtureRadnoVreme()} onSacuvaj={sacuvaj} />
      <ZadrzavanjeRezervacije
        minuta={fixtureRezervacijeConfig().holdMinutes}
        onSacuvaj={() => Promise.resolve({ ok: true as const })}
      />
    </div>
  );
}
