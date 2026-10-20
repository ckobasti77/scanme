// ScanMe Menu V1 (K20) — what a Menu QR card does, and what is wrong with it
// (master §9.2: the client sees the status of each card and link). Pure: the
// screen of "Lokal i QR" and the izlog both feed it the same view model
// (./lokal/model.ts), so the diagnosis can never differ between them.
//
// It mirrors what the scan resolver does (convex/lib/menuQrResolve.ts):
//   - a disabled card, or one that no longer opens the Menu, opens nothing;
//   - an inactive link opens the menu's entry with no page and no position;
//   - a page that is archived or missing is dropped (the entry opens);
//   - a position that is archived or missing is dropped — NEVER another one.

import type { LokalKartica, LokalPozicija, LokalStranica } from "./lokal/model";

export type QrStanje = "aktivna" | "iskljucena" | "drugo-odrediste";

export type QrProblem = "veza-iskljucena" | "stranica-nedostupna" | "pozicija-nedostupna";

export type QrDijagnoza = {
  stanje: QrStanje;
  /**
   * What a scan opens; null unless `stanje` is "aktivna". `stranica` null =
   * the menu's entry, `pozicija` null = no position.
   */
  otvara: { stranica: LokalStranica | null; pozicija: LokalPozicija | null } | null;
  problemi: QrProblem[];
  nikadSkenirana: boolean;
  /** An adopted card (managed by ScanMe): shown, never changed here. */
  samoCitanje: boolean;
};

export function dijagnozaKartice(
  card: LokalKartica,
  ctx: { pages: LokalStranica[]; positions: LokalPozicija[] },
): QrDijagnoza {
  const nikadSkenirana = card.lastScanAt === null;
  const samoCitanje = card.managedByScanMe;

  if (card.status === "disabled") {
    return { stanje: "iskljucena", otvara: null, problemi: [], nikadSkenirana, samoCitanje };
  }
  if (!card.opensMenu) {
    return { stanje: "drugo-odrediste", otvara: null, problemi: [], nikadSkenirana, samoCitanje };
  }

  const link = card.link;
  if (!link) {
    // No link row: the card opens the menu's entry with no position (the pre-K20 behaviour).
    return {
      stanje: "aktivna",
      otvara: { stranica: null, pozicija: null },
      problemi: [],
      nikadSkenirana,
      samoCitanje,
    };
  }
  if (!link.active) {
    return {
      stanje: "aktivna",
      otvara: { stranica: null, pozicija: null },
      problemi: ["veza-iskljucena"],
      nikadSkenirana,
      samoCitanje,
    };
  }

  const problemi: QrProblem[] = [];
  let stranica: LokalStranica | null = null;
  if (link.pageKey !== null) {
    stranica = ctx.pages.find((page) => page.key === link.pageKey) ?? null;
    if (!stranica) problemi.push("stranica-nedostupna");
  }
  let pozicija: LokalPozicija | null = null;
  if (link.positionId !== null) {
    pozicija = ctx.positions.find((position) => position.id === link.positionId) ?? null;
    if (!pozicija) problemi.push("pozicija-nedostupna");
  }
  return {
    stanje: "aktivna",
    otvara: { stranica, pozicija },
    problemi,
    nikadSkenirana,
    samoCitanje,
  };
}

/** The cards whose link says they stand on the position (any state), in the given order. */
export function cardsOfPosition(cards: LokalKartica[], positionId: string): LokalKartica[] {
  return cards.filter((card) => card.link?.positionId === positionId);
}

/**
 * The positions nobody can scan their way into: no ACTIVE card that still opens
 * the Menu through an ACTIVE link stands on them. `positions` are the active
 * positions of the venue (archived ones are not listed in the view model).
 */
export function positionsWithoutCard(
  positions: LokalPozicija[],
  cards: LokalKartica[],
): LokalPozicija[] {
  const covered = new Set<string>();
  for (const card of cards) {
    if (card.status !== "active" || !card.opensMenu) continue;
    if (!card.link || !card.link.active || card.link.positionId === null) continue;
    covered.add(card.link.positionId);
  }
  return positions.filter((position) => !covered.has(position.id));
}
