// ScanMe Menu V1 (K27) — Početna of the client panel (master §13.2, §13.3;
// plan docs/meni/planovi/K24.md §4.2): the answer to "does anything need my
// attention?", a summary of what is happening now without running the floor,
// and the menu status.
//
// Rule of the screen (master §13.2): the same number is never shown in two
// blocks. Every number on Početna belongs to exactly ONE metric, and every
// metric has exactly one block; Pažnja wins over Sada u lokalu. The sets are
// disjoint by construction:
//   requests      late (Pažnja)  |  the rest, by kind (Sada)
//   reservations  waiting for an answer (Pažnja) | past the hold (Pažnja) |
//                 accepted today, still to come (Sada)
//   staff         nobody on shift while guests wait (Pažnja, no number) |
//                 how many are on shift (Sada)
// `brojkeBloka` lists the numbers each block shows, so a test can prove it.
//
// Pure: the device passes the clock (`nowMs`) and the server data
// (convex/menuPanel.ts `home`).

import { isLate } from "./elapsed-time";
import type { MenuRequestKind, MenuRequestStatus } from "./request-status";
import { reservationTiming } from "./reservation-late";
import type { MenuReservationStatus } from "./reservation-status";
import { belgradeDateKey } from "./working-hours";

/** Unpublished changes older than this need attention (plan K24 §4.2). */
export const HOME_UNPUBLISHED_STALE_MS = 24 * 60 * 60 * 1000;

export const HOME_REQUEST_KINDS: readonly MenuRequestKind[] = ["call", "bill", "order"];

export type HomeInput = {
  nowMs: number;
  menu: {
    state: "never_published" | "clean" | "dirty";
    liveVersionNumber: number | null;
    livePublishedAt: number | null;
    lastEditAt: number;
  };
  /** null = Room service off or not in the plan. */
  roomServicePriceWarnings: number | null;
  /** null = the role does not see operations (Urednik). */
  operations: {
    lateThresholdMin: number;
    holdMinutes: number;
    requests: readonly { kind: MenuRequestKind; status: MenuRequestStatus; createdAt: number }[];
    requestsTruncated: boolean;
    reservations: readonly {
      status: MenuReservationStatus;
      requestedAt: number;
      partySize: number;
      positionLabel: string | null;
    }[];
    staffSessions: readonly { expiresAt: number }[];
  } | null;
  /** null = the role does not manage the mailbox. */
  mail: { status: "active" | "error" | "none" } | null;
};

/** Everything Početna can count; each has exactly one block. */
export type HomeMetric =
  | "requests.late"
  | "requests.active"
  | "reservations.waiting"
  | "reservations.late"
  | "reservations.today"
  | "staff.onShift"
  | "roomService.priceWarnings";

/** One line of Pažnja, in this order of importance. */
export type PaznjaStavka =
  | { vrsta: "zahtevi-kasne"; broj: number; pragMin: number }
  | { vrsta: "bez-osoblja" }
  | { vrsta: "rezervacije-kasne"; broj: number }
  | { vrsta: "rezervacije-cekaju"; broj: number }
  | { vrsta: "posta" }
  | { vrsta: "room-service"; broj: number }
  | { vrsta: "neobjavljeno"; od: number };

export type PaznjaVrsta = PaznjaStavka["vrsta"];

export type SadaBlok = {
  /** Active requests by kind that are NOT late (those are in Pažnja), every kind, zeros included. */
  zahtevi: { kind: MenuRequestKind; broj: number }[];
  /** Pažnja has late requests: the label says these are the rest. */
  bezKasnih: boolean;
  /** More than 300 of one status were read: the numbers are "at least". */
  skraceno: boolean;
  /** Accepted reservations of today (Belgrade) still to come, the next one first. */
  rezervacije: {
    preostalo: number;
    sledeca: { at: number; partySize: number; positionLabel: string | null } | null;
  };
  /** Staff signed in with a PIN; null when Pažnja already says nobody is. */
  osoblje: number | null;
};

export type MeniBlok = {
  stanje: "never_published" | "clean" | "dirty";
  objavljeno: { broj: number; kada: number } | null;
};

export type HomeSummary = {
  /** "paznja": at least one line; "mirno": "Sve je u redu." */
  stanje: "paznja" | "mirno";
  paznja: PaznjaStavka[];
  /** null for a role without operations. */
  sada: SadaBlok | null;
  meni: MeniBlok;
};

const AKTIVNE_REZERVACIJE: readonly MenuReservationStatus[] = ["accepted"];

export function homeSummary(input: HomeInput): HomeSummary {
  const { nowMs, operations } = input;
  const paznja: PaznjaStavka[] = [];
  let sada: SadaBlok | null = null;

  if (operations) {
    const aktivni = operations.requests.filter((request) => request.status === "new" || request.status === "accepted");
    const kasne = aktivni.filter((request) => isLate(request.createdAt, nowMs, operations.lateThresholdMin));
    const ostali = aktivni.filter((request) => !isLate(request.createdAt, nowMs, operations.lateThresholdMin));
    const uSmeni = operations.staffSessions.filter((session) => session.expiresAt > nowMs).length;
    const gostiCekaju = aktivni.some((request) => request.status === "new");

    const danas = belgradeDateKey(nowMs);
    const cekaju = operations.reservations.filter((row) => row.status === "new");
    const prihvacene = operations.reservations.filter((row) => AKTIVNE_REZERVACIJE.includes(row.status));
    const kasneRez = prihvacene.filter(
      (row) => reservationTiming(row.requestedAt, operations.holdMinutes, nowMs).phase === "kasni",
    );
    // Today's still to come, and one whose time has come and whose hold still runs (even past midnight).
    const dolaze = prihvacene
      .filter((row) => {
        const faza = reservationTiming(row.requestedAt, operations.holdMinutes, nowMs).phase;
        return faza === "u-terminu" || (faza !== "kasni" && belgradeDateKey(row.requestedAt) === danas);
      })
      .sort((a, b) => a.requestedAt - b.requestedAt);

    if (kasne.length > 0) paznja.push({ vrsta: "zahtevi-kasne", broj: kasne.length, pragMin: operations.lateThresholdMin });
    const bezOsoblja = uSmeni === 0 && gostiCekaju;
    if (bezOsoblja) paznja.push({ vrsta: "bez-osoblja" });
    if (kasneRez.length > 0) paznja.push({ vrsta: "rezervacije-kasne", broj: kasneRez.length });
    if (cekaju.length > 0) paznja.push({ vrsta: "rezervacije-cekaju", broj: cekaju.length });

    const prva = dolaze[0];
    sada = {
      zahtevi: HOME_REQUEST_KINDS.map((kind) => ({ kind, broj: ostali.filter((request) => request.kind === kind).length })),
      bezKasnih: kasne.length > 0,
      skraceno: operations.requestsTruncated,
      rezervacije: {
        preostalo: dolaze.length,
        sledeca: prva ? { at: prva.requestedAt, partySize: prva.partySize, positionLabel: prva.positionLabel } : null,
      },
      osoblje: bezOsoblja ? null : uSmeni,
    };
  }

  if (input.mail?.status === "error") paznja.push({ vrsta: "posta" });
  if (input.roomServicePriceWarnings !== null && input.roomServicePriceWarnings > 0) {
    paznja.push({ vrsta: "room-service", broj: input.roomServicePriceWarnings });
  }
  if (input.menu.state === "dirty" && nowMs - input.menu.lastEditAt >= HOME_UNPUBLISHED_STALE_MS) {
    paznja.push({ vrsta: "neobjavljeno", od: input.menu.lastEditAt });
  }

  return {
    stanje: paznja.length > 0 ? "paznja" : "mirno",
    paznja,
    sada,
    meni: {
      stanje: input.menu.state,
      objavljeno:
        input.menu.liveVersionNumber !== null && input.menu.livePublishedAt !== null
          ? { broj: input.menu.liveVersionNumber, kada: input.menu.livePublishedAt }
          : null,
    },
  };
}

/** A number on Početna and the metric it counts. */
export type HomeBrojka = { metrika: HomeMetric; vrednost: number };

/**
 * The numbers each block shows (the Meni block shows a version number, which
 * is not a count, and Analitika shows none until K30). Used by the test that
 * proves no metric is shown in two blocks.
 */
export function brojkeBloka(summary: HomeSummary): { paznja: HomeBrojka[]; sada: HomeBrojka[] } {
  const paznja: HomeBrojka[] = [];
  for (const stavka of summary.paznja) {
    if (stavka.vrsta === "zahtevi-kasne") paznja.push({ metrika: "requests.late", vrednost: stavka.broj });
    if (stavka.vrsta === "rezervacije-kasne") paznja.push({ metrika: "reservations.late", vrednost: stavka.broj });
    if (stavka.vrsta === "rezervacije-cekaju") paznja.push({ metrika: "reservations.waiting", vrednost: stavka.broj });
    if (stavka.vrsta === "room-service") paznja.push({ metrika: "roomService.priceWarnings", vrednost: stavka.broj });
  }
  const sada: HomeBrojka[] = [];
  if (summary.sada) {
    for (const zahtev of summary.sada.zahtevi) sada.push({ metrika: "requests.active", vrednost: zahtev.broj });
    sada.push({ metrika: "reservations.today", vrednost: summary.sada.rezervacije.preostalo });
    if (summary.sada.osoblje !== null) sada.push({ metrika: "staff.onShift", vrednost: summary.sada.osoblje });
  }
  return { paznja, sada };
}
