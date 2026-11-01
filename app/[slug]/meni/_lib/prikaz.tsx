// ScanMe Menu V1 (K13) — what the two public routes render from a load, and
// their metadata. Noindex stays while MENU_EXISTS is false (plan K12-15).
// K21: a guest at a position also gets the page's Server Actions (the guest's
// buttons); the actions run on the server with the HttpOnly cookies.
// K25: the reservation entry (a server-rendered card, no client JavaScript)
// goes into the menu's frame, and the two reservation routes reach their
// pages from here — this file is one of the wiring files the JS budget test
// (components/menu/javni/budzet-gost.test.tsx) lets import the guest's folder.

import type { Metadata, Viewport } from "next";
import { fmt } from "@/lib/i18n/format";
import { menuJavniSr } from "@/lib/i18n/sr/menu-javni";
import { JavniMeniUzivo } from "@/components/menu/javni/javni-meni-uzivo";
import { GostRazdelnik } from "@/components/menu/javni/gost-razdelnik";
import { naslovStraniceJavno } from "@/components/menu/javni/navigacija-stranica";
import { JavniRazdelnik } from "@/components/menu/javni/razdelnik";
import type { GostAkcije, GostUcitano } from "@/components/menu/gost/ostrvo";
import type { RezervacijaAkcije } from "@/components/menu/gost/rezervacija/model";
import { UlazRezervacije } from "@/components/menu/gost/rezervacija/ulaz";
import { saJezikom } from "@/lib/menu/i18n-fallback";
import { analitikaRezim } from "@/lib/menu/analitika/saglasnost";
import type { JavniAnalitika } from "@/lib/menu/analitika/track";
import type { PublicReservationEntry } from "@/lib/menu/reservation-config";
import { otkaziZahtev, posaljiPorudzbinu, pozoviKonobara, zatraziRacun } from "./radnje-gosta";
import { posaljiRezervaciju } from "./radnje-rezervacije";
import type { GostServer, JavnoUcitano } from "./ucitaj";
import { javniNaslov } from "@/lib/menu-naslovi";

export { LinkStrana, RezervacijaStrana } from "@/components/menu/gost/rezervacija/strana";

const t = menuJavniSr;

export const JAVNI_ROBOTS = { index: false, follow: false };

/** The guest's buttons: the Server Actions of the public menu. */
export const GOST_AKCIJE: GostAkcije = {
  pozovi: pozoviKonobara,
  racun: zatraziRacun,
  posalji: posaljiPorudzbinu,
  otkazi: otkaziZahtev,
};

/** K25: the reservation form's Server Action. */
export const REZERVACIJA_AKCIJE: RezervacijaAkcije = { posalji: posaljiRezervaciju };

export function saAkcijama(gost: GostServer | null): GostUcitano | null {
  return gost ? { ...gost, akcije: GOST_AKCIJE } : null;
}

/**
 * K29: the analytics context of a live public page (docs/menu/ANALITIKA-DEFINICIJE.md).
 * Only the live routes pass it; the identifier mode is the consent point (P8).
 */
export function analitikaZa(slug: string, jezik: string, kartica: string | null): JavniAnalitika {
  return { slug, jezik, kartica, rezim: analitikaRezim(process.env.MENU_ANALYTICS_IDENTIFIERS) };
}

export function javniMetadata(ucitano: JavnoUcitano): Metadata {
  const lokal = ucitano.view.lokal.naziv;
  const naslov =
    ucitano.vrsta === "stranica" && ucitano.view.stranice.length > 1
      ? javniNaslov(lokal, naslovStraniceJavno(ucitano.view.stranica))
      : javniNaslov(lokal);
  return { title: naslov, description: fmt(t.meta.opis, { lokal }), robots: JAVNI_ROBOTS };
}

export function javniViewport(ucitano: JavnoUcitano): Viewport {
  return {
    themeColor: ucitano.izgled.boje.page,
    colorScheme: ucitano.izgled.ton === "tamna" ? "dark" : "light",
  };
}

export function JavniPrikaz({ ucitano, rezervacija }: { ucitano: JavnoUcitano; rezervacija?: PublicReservationEntry }) {
  const gost = saAkcijama(ucitano.gost);
  const { lokal, jezik, jezici } = ucitano.view;
  const ulaz =
    rezervacija && rezervacija.mode !== "off" ? (
      <UlazRezervacije ulaz={rezervacija} lokal={lokal.naziv} href={saJezikom(`/${lokal.slug}/meni/rezervacija`, jezik, jezici)} />
    ) : null;
  if (ucitano.vrsta === "razdelnik") {
    return (
      <JavniRazdelnik
        view={ucitano.view}
        izgled={ucitano.izgled}
        dodatak={gost ? <GostRazdelnik gost={gost} /> : null}
        rezervacija={ulaz}
      />
    );
  }
  return (
    <JavniMeniUzivo
      view={ucitano.view}
      izgled={ucitano.izgled}
      slike={ucitano.slike}
      sadaMs={ucitano.sadaMs}
      uzivo={ucitano.uzivo}
      kurs={ucitano.kurs}
      gost={gost}
      rezervacija={ulaz}
      analitika={analitikaZa(lokal.slug, jezik, ucitano.kartica)}
    />
  );
}
