// ScanMe Menu V1 (K29) — what the ingest accepts from a browser (§2 of
// docs/menu/ANALITIKA-DEFINICIJE.md). Known kinds only; keys must have the
// shape of a page / article key (whether they exist in the live version is
// checked when the panel reads, not per event); a broken optional field is
// dropped, a broken required one drops the event. Never a name, contact, IP,
// User-Agent or token.

import { isMenuKey } from "../keys";
import { ROOM_SERVICE_PAGE_KEY } from "../room-service-view";
import { KORACI, STRANICA_ROOM_SERVICE, type Korak } from "./definicije";
import { SESIJA_PATTERN } from "./sesija";

/** An event as the browser sends it (every field untrusted). */
export type UlazniDogadjaj = {
  vrsta: string;
  stranica?: string;
  artikal?: string;
  kartica?: string;
  jezik?: string;
  korak?: string;
  sesija?: string;
};

/** A clean browser event (the card id is still a string: Convex normalizes it). */
export type CistDogadjaj = {
  vrsta: "stranica" | "detalj" | "korak";
  stranica?: string;
  artikal?: string;
  kartica?: string;
  jezik?: string;
  korak?: Korak;
  sesija?: string;
};

const JEZIK = /^[a-z]{2}$/;
const KARTICA = /^[0-9a-z]{10,64}$/;

function cistaStranica(value: string | undefined): string | null {
  if (value === ROOM_SERVICE_PAGE_KEY) return STRANICA_ROOM_SERVICE;
  return value !== undefined && isMenuKey(value, "page") ? value : null;
}

export function ocistiDogadjaj(ulaz: UlazniDogadjaj, opcije: { sesijaDozvoljena: boolean }): CistDogadjaj | null {
  const sesija =
    opcije.sesijaDozvoljena && typeof ulaz.sesija === "string" && SESIJA_PATTERN.test(ulaz.sesija) ? ulaz.sesija : undefined;
  const jezik = typeof ulaz.jezik === "string" && JEZIK.test(ulaz.jezik) ? ulaz.jezik : undefined;
  const zajednicko = { ...(jezik ? { jezik } : {}), ...(sesija ? { sesija } : {}) };

  switch (ulaz.vrsta) {
    case "stranica": {
      const stranica = cistaStranica(ulaz.stranica);
      if (!stranica) return null;
      const kartica = typeof ulaz.kartica === "string" && KARTICA.test(ulaz.kartica) ? ulaz.kartica : undefined;
      return { vrsta: "stranica", stranica, ...(kartica ? { kartica } : {}), ...zajednicko };
    }
    case "detalj": {
      const stranica = cistaStranica(ulaz.stranica);
      if (!stranica || ulaz.artikal === undefined || !isMenuKey(ulaz.artikal, "article")) return null;
      return { vrsta: "detalj", stranica, artikal: ulaz.artikal, ...zajednicko };
    }
    case "korak": {
      // A step means something only inside a session (the conversion flow).
      const korak = KORACI.find((value) => value === ulaz.korak);
      if (!korak || !sesija) return null;
      return { vrsta: "korak", korak, sesija, ...(jezik ? { jezik } : {}) };
    }
    default:
      return null;
  }
}
