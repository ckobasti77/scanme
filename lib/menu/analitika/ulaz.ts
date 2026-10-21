// ScanMe Menu V1 (K29) — the decisions of the ingest route
// (app/api/meni/analitika/route.ts) as a pure function: what is dropped
// before Convex is called at all (§2 of docs/menu/ANALITIKA-DEFINICIJE.md):
//   - a bot, a link preview or a request without a User-Agent;
//   - internal traffic: a browser with a signed-in ScanMe session;
//   - a body that is not `{ slug, dogadjaji: [...] }` with 1–10 events;
// and, while the identifier mode is `iskljuceno`, every session id.

import { MAX_DOGADJAJA_PO_POZIVU, type Uredjaj } from "./definicije";
import type { UlazniDogadjaj } from "./prijem";
import type { AnalitikaRezim } from "./saglasnost";
import { klasaUredjaja } from "./uredjaj";

/** The largest body the route reads (10 events with every field is far below). */
export const MAX_TELO_BAJTOVA = 8 * 1024;

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const POLJA = ["vrsta", "stranica", "artikal", "kartica", "jezik", "korak", "sesija"] as const;

export type Ulaz =
  | { ok: true; slug: string; uredjaj: Uredjaj; dogadjaji: UlazniDogadjaj[] }
  | { ok: false; razlog: "bot" | "interni" | "neispravno" };

function dogadjajIz(value: unknown, saSesijom: boolean): UlazniDogadjaj | null {
  if (typeof value !== "object" || value === null) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.vrsta !== "string") return null;
  const izlaz: UlazniDogadjaj = { vrsta: row.vrsta.slice(0, 32) };
  for (const polje of POLJA) {
    if (polje === "vrsta" || (polje === "sesija" && !saSesijom)) continue;
    const vrednost = row[polje];
    if (typeof vrednost === "string" && vrednost.length > 0) izlaz[polje] = vrednost.slice(0, 80);
  }
  return izlaz;
}

export function pripremiUlaz(
  telo: unknown,
  kontekst: { userAgent: string | null; prijavljen: boolean; rezim: AnalitikaRezim },
): Ulaz {
  const uredjaj = klasaUredjaja(kontekst.userAgent);
  if (!uredjaj) return { ok: false, razlog: "bot" };
  if (kontekst.prijavljen) return { ok: false, razlog: "interni" };
  if (typeof telo !== "object" || telo === null) return { ok: false, razlog: "neispravno" };
  const { slug, dogadjaji } = telo as Record<string, unknown>;
  if (typeof slug !== "string" || slug.length > 80 || !SLUG.test(slug)) return { ok: false, razlog: "neispravno" };
  if (!Array.isArray(dogadjaji) || dogadjaji.length === 0 || dogadjaji.length > MAX_DOGADJAJA_PO_POZIVU) {
    return { ok: false, razlog: "neispravno" };
  }
  const saSesijom = kontekst.rezim !== "iskljuceno";
  const cisti = dogadjaji.map((value) => dogadjajIz(value, saSesijom)).filter((value): value is UlazniDogadjaj => value !== null);
  if (cisti.length === 0) return { ok: false, razlog: "neispravno" };
  return { ok: true, slug, uredjaj, dogadjaji: cisti };
}
