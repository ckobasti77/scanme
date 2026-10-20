// ScanMe Menu V1 (K21) — the izlog's in-memory venue for the guest's requests
// (/dev/menu-public-preview?pozicija=…): what the server would do, with the
// SAME rules (lib/menu/cart.ts priceOrder, lib/menu/request-status.ts), so the
// izlog flows (call, bill, cart, Moji zahtevi, cancel) behave like the real
// route without Convex. A module store: it survives the izlog's client
// navigations (the bar → "Moji zahtevi" → back) inside one tab and starts
// from the fixture requests. Dev only; nothing is sent anywhere.

import { useSyncExternalStore } from "react";
import { priceOrder, type CartArticle } from "@/lib/menu/cart";
import { REQUEST_ERROR } from "@/lib/menu/errors/requests";
import { nextStatus, isOpenStatus } from "@/lib/menu/request-status";
import type { GostIshod, GostOtkazIshod, GostPorudzbina, GostRadnje, GostZahtev } from "../gost/model";

let zahtevi: GostZahtev[] | null = null;
let brojac = 0;
/** Send keys already written (idempotency, like submitOrder `clientRequestId`). */
const poslati = new Map<string, string>();
const slusaoci = new Set<() => void>();

function objavi() {
  for (const slusalac of slusaoci) slusalac();
}

function pretplati(promena: () => void) {
  slusaoci.add(promena);
  return () => slusaoci.delete(promena);
}

function postavi(sledeci: GostZahtev[]) {
  zahtevi = sledeci;
  objavi();
}

/** The izlog's requests (the fixture until something changes them). */
export function useIzlogZahtevi(pocetni: readonly GostZahtev[]): readonly GostZahtev[] {
  return useSyncExternalStore(
    pretplati,
    () => zahtevi ?? pocetni,
    () => pocetni,
  );
}

const pauza = () => new Promise((resolve) => setTimeout(resolve, 450));

export type IzlogMemorija = {
  pocetni: readonly GostZahtev[];
  mesto: string;
  sadaMs: number;
  /** The published article of a line (the izlog's page or Room service). */
  nadjiArtikal: (pageKey: string | null, articleKey: string) => CartArticle | null;
  nedostupni: ReadonlySet<string>;
  dostavaRsd: number | null;
};

export function izlogRadnje(memorija: IzlogMemorija): GostRadnje {
  const trenutni = () => zahtevi ?? [...memorija.pocetni];
  const nov = (zahtev: Omit<GostZahtev, "id">): GostZahtev => {
    brojac += 1;
    return { ...zahtev, id: `izlog-novi-${brojac}` };
  };
  const osnova = {
    status: "new" as const,
    channel: "standard" as const,
    positionLabel: memorija.mesto,
    paymentPreference: null,
    subtotalRsd: null,
    deliveryFeeRsd: null,
    totalRsd: null,
    createdAt: memorija.sadaMs,
    acceptedAt: null,
    doneAt: null,
    cancelledAt: null,
    cancelledBy: null,
    items: [],
  };

  const stoZahtev = async (vrsta: "call" | "bill", nacin: "cash" | "card" | null): Promise<GostIshod> => {
    await pauza();
    const lista = trenutni();
    const otvoren = lista.find((zahtev) => zahtev.kind === vrsta && isOpenStatus(zahtev.status));
    if (otvoren) {
      return { ok: true, requestId: otvoren.id, status: otvoren.status, createdAt: otvoren.createdAt, deduped: true, totals: null, paymentPreference: otvoren.paymentPreference };
    }
    const zahtev = nov({ ...osnova, kind: vrsta, paymentPreference: nacin });
    postavi([zahtev, ...lista]);
    return { ok: true, requestId: zahtev.id, status: "new", createdAt: zahtev.createdAt, deduped: false, totals: null, paymentPreference: nacin };
  };

  return {
    pozovi: () => stoZahtev("call", null),
    racun: (nacin) => stoZahtev("bill", nacin),
    posalji: async ({ kanal, linije, videnUkupnoRsd, kljuc }: GostPorudzbina): Promise<GostIshod> => {
      await pauza();
      const vec = poslati.get(kljuc);
      const poslat = vec ? trenutni().find((row) => row.id === vec) : undefined;
      if (poslat) {
        const totals = poslat.totalRsd !== null ? { subtotalRsd: poslat.subtotalRsd ?? poslat.totalRsd, deliveryFeeRsd: poslat.deliveryFeeRsd ?? 0, totalRsd: poslat.totalRsd } : null;
        return { ok: true, requestId: poslat.id, status: poslat.status, createdAt: poslat.createdAt, deduped: true, totals, paymentPreference: null };
      }
      const cena = priceOrder({
        channel: kanal,
        lines: linije,
        seenTotalRsd: videnUkupnoRsd,
        findArticle: (line) => memorija.nadjiArtikal(line.pageKey, line.articleKey),
        unavailable: memorija.nedostupni,
        deliveryFeeRsd: memorija.dostavaRsd,
        nowMs: memorija.sadaMs,
      });
      if (!cena.ok) return cena;
      const zahtev = nov({
        ...osnova,
        kind: "order",
        channel: kanal,
        subtotalRsd: cena.totals.subtotalRsd,
        deliveryFeeRsd: kanal === "room_service" ? cena.totals.deliveryFeeRsd : null,
        totalRsd: cena.totals.totalRsd,
        items: cena.lines.map((line) => ({
          name: line.name,
          variantName: line.price.variantName,
          addons: line.price.addons.map((addon) => ({ optionName: addon.optionName, priceDeltaRsd: addon.priceDeltaRsd })),
          quantity: line.quantity,
          unitPriceRsd: line.price.unitPriceRsd,
          lineTotalRsd: line.price.lineTotalRsd,
          note: line.note,
        })),
      });
      poslati.set(kljuc, zahtev.id);
      postavi([zahtev, ...trenutni()]);
      return { ok: true, requestId: zahtev.id, status: "new", createdAt: zahtev.createdAt, deduped: false, totals: cena.totals, paymentPreference: null };
    },
    otkazi: async (requestId: string): Promise<GostOtkazIshod> => {
      await pauza();
      const lista = trenutni();
      const zahtev = lista.find((row) => row.id === requestId);
      if (!zahtev) return { ok: false, code: REQUEST_ERROR.notFound };
      const prelaz = nextStatus({ status: zahtev.status, acceptedByRef: null }, "cancel", { kind: "guest" });
      if (prelaz.kind === "refused") return { ok: false, code: prelaz.code };
      if (prelaz.kind === "change") {
        postavi(
          lista.map((row) =>
            row.id === requestId ? { ...row, status: "cancelled", cancelledAt: memorija.sadaMs, cancelledBy: "guest" } : row,
          ),
        );
      }
      return { ok: true };
    },
  };
}
