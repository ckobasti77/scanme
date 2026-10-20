// ScanMe Menu V1 (K21) — the guest's cart on the phone (plan K19 §4.2): one
// cart per venue and channel (the standard pages, or Room service) in
// sessionStorage `smm_korpa:<slug>:<channel>`, so moving between pages of the
// menu or reloading keeps it and closing the tab ends it. The bar and the
// article detail are two separate pieces that both read and write it, so it
// is an external store (useSyncExternalStore): the server and the first
// client render use the starting lines (empty on the real route, the izlog's
// fixture otherwise), the stored cart follows right after hydration. The
// rules (merging, limits, totals) are lib/menu/cart.ts.

import { useCallback, useMemo, useSyncExternalStore } from "react";
import {
  addCartLine,
  applyServerPrices,
  cartStorageKey,
  readStoredCart,
  removeCartLine,
  setCartQuantity,
  type AddResult,
  type CartLine,
} from "@/lib/menu/cart";
import type { MenuRequestChannel } from "@/lib/menu/request-status";

const DOGADJAJ = "smm-korpa";
const DOGADJAJ_DODATO = "smm-korpa-dodato";
const memorija = new Map<string, string>();

function sesija(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function procitaj(kljuc: string, cuvaj: boolean): string | null {
  const mem = memorija.get(kljuc);
  if (mem !== undefined) return mem;
  if (!cuvaj) return null;
  try {
    return sesija()?.getItem(kljuc) ?? null;
  } catch {
    return null;
  }
}

function upisi(kljuc: string, cuvaj: boolean, linije: CartLine[]) {
  const raw = JSON.stringify(linije);
  memorija.set(kljuc, raw);
  if (cuvaj) {
    try {
      sesija()?.setItem(kljuc, raw);
    } catch {
      // A blocked storage: the in-memory copy still serves this tab.
    }
  }
  window.dispatchEvent(new Event(DOGADJAJ));
}

function pretplati(promena: () => void) {
  window.addEventListener(DOGADJAJ, promena);
  return () => window.removeEventListener(DOGADJAJ, promena);
}

export type Korpa = {
  linije: CartLine[];
  dodaj(linija: Omit<CartLine, "id">): AddResult["outcome"];
  postaviKolicinu(id: string, kolicina: number): void;
  ukloni(id: string): void;
  isprazni(): void;
  primeniCene(cene: readonly { index: number; pieceRsd: number }[]): void;
};

export function useKorpa(
  slug: string,
  kanal: MenuRequestChannel,
  { cuvaj = true, pocetne = [] }: { cuvaj?: boolean; pocetne?: readonly CartLine[] } = {},
): Korpa {
  const kljuc = cartStorageKey(slug, kanal);
  const pocetnoRaw = useMemo(() => JSON.stringify(pocetne), [pocetne]);
  const raw = useSyncExternalStore(
    pretplati,
    () => procitaj(kljuc, cuvaj) ?? pocetnoRaw,
    () => pocetnoRaw,
  );
  const linije = useMemo(() => readStoredCart(raw), [raw]);
  const trenutne = useCallback(() => readStoredCart(procitaj(kljuc, cuvaj) ?? pocetnoRaw), [kljuc, cuvaj, pocetnoRaw]);

  const dodaj = useCallback(
    (linija: Omit<CartLine, "id">) => {
      const rezultat = addCartLine(trenutne(), linija);
      if (rezultat.outcome !== "full") {
        upisi(kljuc, cuvaj, rezultat.lines);
        window.dispatchEvent(new CustomEvent(DOGADJAJ_DODATO, { detail: linija.name }));
      }
      return rezultat.outcome;
    },
    [trenutne, kljuc, cuvaj],
  );
  const postaviKolicinu = useCallback(
    (id: string, kolicina: number) => upisi(kljuc, cuvaj, setCartQuantity(trenutne(), id, kolicina)),
    [trenutne, kljuc, cuvaj],
  );
  const ukloni = useCallback((id: string) => upisi(kljuc, cuvaj, removeCartLine(trenutne(), id)), [trenutne, kljuc, cuvaj]);
  const isprazni = useCallback(() => upisi(kljuc, cuvaj, []), [kljuc, cuvaj]);
  const primeniCene = useCallback(
    (cene: readonly { index: number; pieceRsd: number }[]) => upisi(kljuc, cuvaj, applyServerPrices(trenutne(), cene)),
    [trenutne, kljuc, cuvaj],
  );
  return { linije, dodaj, postaviKolicinu, ukloni, isprazni, primeniCene };
}

function slucajno(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * The key of the current send attempt of a cart (`<random>-<fingerprint>`): the same cart keeps
 * its key across retries and reloads until it is sent, so an answer lost on the way never makes
 * the waiter get the order twice (convex/menuGuest.ts submitOrder `clientRequestId`). A changed
 * cart gets a new key; a sent cart forgets it (`zavrsiSlanje`).
 */
export function kljucSlanja(slug: string, kanal: MenuRequestChannel, otisak: string, cuvaj: boolean): string {
  const kljuc = `smm_slanje:${slug}:${kanal}`;
  const sacuvan = procitaj(kljuc, cuvaj);
  if (sacuvan && sacuvan.endsWith(`-${otisak}`)) return sacuvan;
  const novi = `${slucajno()}-${otisak}`;
  memorija.set(kljuc, novi);
  if (cuvaj) {
    try {
      sesija()?.setItem(kljuc, novi);
    } catch {
      // The in-memory copy still serves this tab.
    }
  }
  return novi;
}

export function zavrsiSlanje(slug: string, kanal: MenuRequestChannel, cuvaj: boolean): void {
  const kljuc = `smm_slanje:${slug}:${kanal}`;
  memorija.delete(kljuc);
  if (cuvaj) {
    try {
      sesija()?.removeItem(kljuc);
    } catch {
      // Nothing stored.
    }
  }
}

/**
 * The izlog only: puts starting lines into the in-memory cart once (browser
 * only), so every part of the page — the bar and the detail — starts from the
 * same cart. Never called on the real route (its cart lives in sessionStorage).
 */
export function zasejKorpu(slug: string, kanal: MenuRequestChannel, linije: readonly CartLine[]): void {
  if (typeof window === "undefined") return;
  const kljuc = cartStorageKey(slug, kanal);
  if (!memorija.has(kljuc)) memorija.set(kljuc, JSON.stringify(linije));
}

/** Calls `onDodato(naziv)` whenever any part of the page adds to a cart (the bar announces it). */
export function pratiDodavanje(onDodato: (naziv: string) => void): () => void {
  const slusalac = (event: Event) => {
    const naziv = (event as CustomEvent<unknown>).detail;
    if (typeof naziv === "string") onDodato(naziv);
  };
  window.addEventListener(DOGADJAJ_DODATO, slusalac);
  return () => window.removeEventListener(DOGADJAJ_DODATO, slusalac);
}
