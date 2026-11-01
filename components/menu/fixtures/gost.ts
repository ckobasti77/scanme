// Izlog fixtures for the guest's requests (K21): the cart of a table at
// "Demo restoran" and of a room at "Hotel Primer", and "Moji zahtevi" with a
// request in every status. Lines are priced with the REAL rules
// (lib/menu/cart.ts linePrice) from the compiled fixture pages, so names,
// keys and totals agree with what the izlog menu shows. Times are relative to
// IZLOG_SADA (18:27 in Belgrade). Invented data only.

import type { GostZahtev } from "../gost/model";
import { cartLineId, linePrice, orderTotals, type CartLine } from "@/lib/menu/cart";
import type { MenuRequestChannel, MenuRequestStatus } from "@/lib/menu/request-status";
import type { PublicArticle, PublicSection } from "@/lib/menu/snapshot";
import { IZLOG_SADA } from "./lokal";

type LinijaSpec = {
  naziv: string;
  varijanta?: string;
  dodaci?: string[];
  kolicina: number;
  napomena?: string;
};

function nadji(sekcije: readonly PublicSection[], naziv: string): PublicArticle | null {
  for (const sekcija of sekcije) {
    const article = sekcija.articles.find((row) => row.name === naziv);
    if (article) return article;
  }
  return null;
}

/** Cart lines built from the published fixture page; a spec the page does not have is skipped. */
function linije(
  sekcije: readonly PublicSection[],
  pageKey: string | null,
  kanal: MenuRequestChannel,
  specovi: readonly LinijaSpec[],
): CartLine[] {
  const out: CartLine[] = [];
  for (const spec of specovi) {
    const article = nadji(sekcije, spec.naziv);
    if (!article) continue;
    const variantKey = spec.varijanta ? article.variants.find((row) => row.name === spec.varijanta)?.key ?? null : null;
    const addonKeys = (spec.dodaci ?? []).flatMap((ime) =>
      article.addonGroups.flatMap((grupa) => grupa.options.filter((option) => option.name === ime).map((option) => option.key)),
    );
    const cena = linePrice(article, { variantKey, addonKeys, quantity: spec.kolicina }, IZLOG_SADA, kanal);
    if (!cena) continue;
    const note = spec.napomena && article.noteEnabled ? spec.napomena : null;
    const line = {
      pageKey,
      articleKey: article.key,
      variantKey,
      addonKeys: [...addonKeys].sort(),
      quantity: spec.kolicina,
      note,
      name: article.name,
      variantName: cena.variantName,
      addonNames: cena.addons.map((addon) => addon.optionName),
      pieceRsd: cena.pieceRsd,
    };
    out.push({ ...line, id: cartLineId(line) });
  }
  return out;
}

/** The table's cart at "Demo restoran": a variant, a single add-on, two required sides and a note. */
export function fixtureKorpaStola(sekcije: readonly PublicSection[], pageKey: string): CartLine[] {
  return linije(sekcije, pageKey, "standard", [
    { naziv: "Ćevapi", varijanta: "10 komada", kolicina: 2 },
    { naziv: "Vešalica", dodaci: ["Srednje pečeno"], kolicina: 1 },
    { naziv: "Mešano meso (za dvoje)", dodaci: ["Pomfrit", "Kajmak"], kolicina: 1, napomena: "bez luka" },
    { naziv: "Domaća limunada", kolicina: 3 },
  ]);
}

/** The room's Room service cart at "Hotel Primer": a manual price, two computed prices. */
export function fixtureKorpaSobe(sekcije: readonly PublicSection[]): CartLine[] {
  return linije(sekcije, null, "room_service", [
    { naziv: "Club sendvič", kolicina: 1 },
    { naziv: "Ceđena pomorandža", kolicina: 2 },
    { naziv: "Tiramisu", kolicina: 1 },
  ]);
}

const ago = (minutes: number): number => IZLOG_SADA - minutes * 60_000;

/**
 * "Moji zahtevi" of a phone at Sto 12, one request in every status: an order
 * Novi, an order Prihvaćen, a call Završen and a bill the guest cancelled. No
 * call or bill is open, so the izlog's own call and bill are new requests.
 */
export function fixtureMojiZahtevi(korpa: readonly CartLine[]): GostZahtev[] {
  const stavka = (line: CartLine) => ({
    name: line.name,
    variantName: line.variantName,
    addons: line.addonNames.map((optionName) => ({ optionName, priceDeltaRsd: 0 })),
    quantity: line.quantity,
    unitPriceRsd: line.pieceRsd,
    lineTotalRsd: line.pieceRsd * line.quantity,
    note: line.note,
  });
  const prva = korpa.slice(0, 3);
  const druga = korpa.slice(3, 4);
  const zbirPrve = orderTotals(prva, "standard", null);
  const zbirDruge = orderTotals(druga, "standard", null);
  const osnova = {
    channel: "standard" as const,
    positionLabel: "Sto 12",
    paymentPreference: null,
    subtotalRsd: null,
    deliveryFeeRsd: null,
    totalRsd: null,
    acceptedAt: null,
    doneAt: null,
    cancelledAt: null,
    cancelledBy: null,
    items: [],
  };
  return [
    {
      ...osnova,
      id: "izlog-zahtev-1",
      kind: "order",
      status: "new",
      subtotalRsd: zbirPrve.subtotalRsd,
      totalRsd: zbirPrve.totalRsd,
      createdAt: ago(3),
      items: prva.map(stavka),
    },
    {
      ...osnova,
      id: "izlog-zahtev-2",
      kind: "order",
      status: "accepted",
      subtotalRsd: zbirDruge.subtotalRsd,
      totalRsd: zbirDruge.totalRsd,
      createdAt: ago(14),
      acceptedAt: ago(12),
      items: druga.map(stavka),
    },
    { ...osnova, id: "izlog-zahtev-3", kind: "call", status: "done", createdAt: ago(26), acceptedAt: ago(24), doneAt: ago(22) },
    {
      ...osnova,
      id: "izlog-zahtev-4",
      kind: "bill",
      status: "cancelled",
      paymentPreference: "cash",
      createdAt: ago(41),
      cancelledAt: ago(40),
      cancelledBy: "guest",
    },
  ];
}

/** The izlog's `stanje-zahteva=` as a request status. */
export const IZLOG_STATUS: Record<"novi" | "prihvacen" | "zavrsen" | "otkazan", MenuRequestStatus> = {
  novi: "new",
  prihvacen: "accepted",
  zavrsen: "done",
  otkazan: "cancelled",
};
