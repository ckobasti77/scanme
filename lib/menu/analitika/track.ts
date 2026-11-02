// ScanMe Menu V1 (K13 seam, K29 events) — the analytics of the public menu in
// the guest's browser (master §14; docs/menu/ANALITIKA-DEFINICIJE.md §4).
// Nothing is sent until a live public page sets the context
// (`postaviAnalitiku`): the editor preview, the izlog and the draft preview
// never do, so they never count. Events wait in a small queue and leave in one
// request (at most 10, after 2 s, or when the page is hidden) through
// `navigator.sendBeacon` to /api/meni/analitika. Seeing an article while
// scrolling is NOT an event: only opening its detail is.
// The session id is kept only when the consent point allows it (saglasnost.ts).

import { MAX_DOGADJAJA_PO_POZIVU, type Korak } from "./definicije";
import { SAGLASNOST_KLJUC, smeIdentifikator, type AnalitikaRezim } from "./saglasnost";
import { citajStanje, kljucSesije, sledecaSesija } from "./sesija";

export const ANALITIKA_PUTANJA = "/api/meni/analitika";
const ODLAGANJE_MS = 2000;

/** What a live public page tells the analytics (set by the page, never by the izlog). */
export type JavniAnalitika = {
  slug: string;
  /** The language the page is shown in. */
  jezik: string;
  /** The QR card of the guest's position session, or null for a plain link. */
  kartica: string | null;
  rezim: AnalitikaRezim;
};

export type JavniDogadjaj =
  | { vrsta: "stranica"; stranica: string }
  | { vrsta: "detalj"; stranica: string; artikal: string }
  | { vrsta: "korak"; korak: Korak };

type Poslat = Record<string, string>;

let kontekst: JavniAnalitika | null = null;
const red: { slug: string; dogadjaj: Poslat }[] = [];
let tajmer: ReturnType<typeof setTimeout> | null = null;
let slusa = false;

function sesijaZa(k: JavniAnalitika): string | null {
  try {
    if (!smeIdentifikator(k.rezim, window.localStorage.getItem(SAGLASNOST_KLJUC))) return null;
    const kljuc = kljucSesije(k.slug);
    const stanje = sledecaSesija(citajStanje(window.localStorage.getItem(kljuc)), Date.now());
    window.localStorage.setItem(kljuc, JSON.stringify(stanje));
    return stanje.s;
  } catch {
    // Storage blocked: the event still counts, without a session.
    return null;
  }
}

function posalji(): void {
  if (tajmer) clearTimeout(tajmer);
  tajmer = null;
  while (red.length > 0) {
    const slug = red[0].slug;
    const paket: Poslat[] = [];
    while (red.length > 0 && red[0].slug === slug && paket.length < MAX_DOGADJAJA_PO_POZIVU) {
      paket.push(red.shift()!.dogadjaj);
    }
    const telo = JSON.stringify({ slug, dogadjaji: paket });
    try {
      const poslato =
        typeof navigator.sendBeacon === "function" &&
        navigator.sendBeacon(ANALITIKA_PUTANJA, new Blob([telo], { type: "application/json" }));
      if (!poslato) {
        void fetch(ANALITIKA_PUTANJA, {
          method: "POST",
          body: telo,
          keepalive: true,
          headers: { "Content-Type": "application/json" },
        }).catch(() => undefined);
      }
    } catch {
      // Analytics never breaks the menu.
    }
  }
}

function slusajSkrivanje(): void {
  if (slusa) return;
  slusa = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") posalji();
  });
  window.addEventListener("pagehide", posalji);
}

/** A live public page sets its context; `null` (leaving the page) sends what waits. */
export function postaviAnalitiku(sledeci: JavniAnalitika | null): void {
  if (red.length > 0 && (!sledeci || sledeci.slug !== kontekst?.slug)) posalji();
  kontekst = sledeci;
}

/** Records one event; without a context (izlog, editor, draft preview) it does nothing. */
export function trackJavni(dogadjaj: JavniDogadjaj): void {
  const k = kontekst;
  if (!k || typeof window === "undefined") return;
  const sesija = sesijaZa(k);
  if (dogadjaj.vrsta === "korak" && !sesija) return;
  const poslat: Poslat = { ...dogadjaj, jezik: k.jezik };
  if (dogadjaj.vrsta === "stranica" && k.kartica) poslat.kartica = k.kartica;
  if (sesija) poslat.sesija = sesija;
  red.push({ slug: k.slug, dogadjaj: poslat });
  slusajSkrivanje();
  if (red.length >= MAX_DOGADJAJA_PO_POZIVU) posalji();
  else if (!tajmer) tajmer = setTimeout(posalji, ODLAGANJE_MS);
}
