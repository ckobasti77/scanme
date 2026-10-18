// ScanMe Menu V1 (K13) — what the two public routes render from a load, and
// their metadata. Noindex stays while MENU_EXISTS is false (plan K12-15).

import type { Metadata, Viewport } from "next";
import { fmt } from "@/lib/i18n/format";
import { menuJavniSr } from "@/lib/i18n/sr/menu-javni";
import { JavniMeniUzivo } from "@/components/menu/javni/javni-meni-uzivo";
import { naslovStraniceJavno } from "@/components/menu/javni/navigacija-stranica";
import { JavniRazdelnik } from "@/components/menu/javni/razdelnik";
import type { JavnoUcitano } from "./ucitaj";

const t = menuJavniSr;

export const JAVNI_ROBOTS = { index: false, follow: false };

export function javniMetadata(ucitano: JavnoUcitano): Metadata {
  const lokal = ucitano.view.lokal.naziv;
  const naslov =
    ucitano.vrsta === "stranica" && ucitano.view.stranice.length > 1
      ? fmt(t.meta.naslovStranice, { stranica: naslovStraniceJavno(ucitano.view.stranica), lokal })
      : fmt(t.meta.naslov, { lokal });
  return { title: naslov, description: fmt(t.meta.opis, { lokal }), robots: JAVNI_ROBOTS };
}

export function javniViewport(ucitano: JavnoUcitano): Viewport {
  return {
    themeColor: ucitano.izgled.boje.page,
    colorScheme: ucitano.izgled.ton === "tamna" ? "dark" : "light",
  };
}

export function JavniPrikaz({ ucitano }: { ucitano: JavnoUcitano }) {
  if (ucitano.vrsta === "razdelnik") {
    return <JavniRazdelnik view={ucitano.view} izgled={ucitano.izgled} />;
  }
  return (
    <JavniMeniUzivo
      view={ucitano.view}
      izgled={ucitano.izgled}
      slike={ucitano.slike}
      sadaMs={ucitano.sadaMs}
      uzivo={ucitano.uzivo}
      kurs={ucitano.kurs}
    />
  );
}
