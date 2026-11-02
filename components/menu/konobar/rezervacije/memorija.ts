// ScanMe Menu V1 (K25) — the reservations of the izlog in memory: the server's
// rules of convex/menuReservations.ts applied to plain objects (no Convex, no
// network). The status table is lib/menu/reservation-status.ts; a refusal is a
// value, never a throw. The izlog (components/menu/izlog/konobar-izlog.tsx) keeps
// the memory in its state and calls `primeniRezervaciju` for every action, so
// pressing a button on /dev/menu-konobar-preview really changes the rows:
//   accept / decline / propose / the guest agrees / cancel by staff
//   bind a table (accepted only; null = none; a table off the floor is refused)
//   arrive (a table chosen now is bound first; with the occupancy module on and a
//   table, the table becomes Zauzet — the one place that writes occupancy).

import type { KonobarRezIshod, KonobarRezervacija, KonobarRezervacijaDetalj, KonobarSala, KonobarZauzetost } from "../model";
import {
  canBindPosition,
  nextReservationStatus,
  type MenuReservationStatus,
  type ReservationAction,
} from "@/lib/menu/reservation-status";

type Rezervacija = KonobarRezervacijaDetalj["reservation"];

/** The list the panel subscribes to and the detail of each reservation (the declined one is only in the detail). */
export type RezMemorija = {
  redovi: KonobarRezervacija[];
  detalji: Record<string, KonobarRezervacijaDetalj>;
};

export type RezKontekst = {
  /** Who acts (the waiter's name). */
  ime: string;
  /** The izlog clock (epoch ms). */
  sada: number;
  sala: Pick<KonobarSala, "positions" | "occupancyEnabled">;
  zauzetost: KonobarZauzetost;
};

export type RezNaredba =
  | { vrsta: "prihvati" | "odbij" | "gostPrihvata" | "otkazi"; id: string; ocekivani: MenuReservationStatus }
  | { vrsta: "predlozi"; id: string; ocekivani: MenuReservationStatus; proposedAt: number; poruka: string | null }
  | { vrsta: "poveziSto"; id: string; ocekivani: MenuReservationStatus; positionId: string | null }
  | { vrsta: "stigli"; id: string; ocekivani: MenuReservationStatus; positionId: string | null };

export type RezKorak = {
  ishod: KonobarRezIshod;
  /** The same object when nothing changed. */
  memorija: RezMemorija;
  /** The same object when nothing changed. */
  zauzetost: KonobarZauzetost;
};

/** The list row of a reservation's detail (no contact, no note text, no names). */
export function redIzDetalja(r: Rezervacija): KonobarRezervacija {
  return {
    id: r.id,
    status: r.status,
    guestName: r.guestName,
    partySize: r.partySize,
    requestedAt: r.requestedAt,
    createdAt: r.createdAt,
    positionId: r.positionId,
    positionLabel: r.positionLabel,
    hasNote: r.hasNote,
    proposedAt: r.proposedAt,
    arrivedAt: r.arrivedAt,
    cancelledAt: r.cancelledAt,
    cancelledBy: r.cancelledBy,
  };
}

/** The reservation written back: the detail, and the list (a declined reservation leaves it, as on the server). */
function upisi(memorija: RezMemorija, novo: Rezervacija): RezMemorija {
  const detalji = { ...memorija.detalji, [novo.id]: { ...memorija.detalji[novo.id], reservation: novo } };
  if (novo.status === "declined") return { detalji, redovi: memorija.redovi.filter((red) => red.id !== novo.id) };
  const red = redIzDetalja(novo);
  const ima = memorija.redovi.some((kandidat) => kandidat.id === novo.id);
  return { detalji, redovi: ima ? memorija.redovi.map((kandidat) => (kandidat.id === novo.id ? red : kandidat)) : [...memorija.redovi, red] };
}

const AKCIJA: Record<"prihvati" | "odbij" | "predlozi" | "gostPrihvata" | "otkazi" | "stigli", ReservationAction> = {
  prihvati: "accept",
  odbij: "decline",
  predlozi: "propose",
  gostPrihvata: "acceptProposal",
  otkazi: "cancel",
  stigli: "arrive",
};

/** One action of the waiter on the memory: the answer the server would give and the memory after it. */
export function primeniRezervaciju(memorija: RezMemorija, ctx: RezKontekst, naredba: RezNaredba): RezKorak {
  const bez = (ishod: KonobarRezIshod): RezKorak => ({ ishod, memorija, zauzetost: ctx.zauzetost });
  const r = memorija.detalji[naredba.id]?.reservation;
  if (!r) return bez({ ok: false, code: "reservation/not_found" });
  // What the waiter saw is not what is there: nothing is written (the guest cancelled meanwhile).
  if (r.status !== naredba.ocekivani) return bez({ ok: false, code: "reservation/status_changed", status: r.status });

  if (naredba.vrsta === "poveziSto") {
    if (!canBindPosition(r.status)) return bez({ ok: false, code: "reservation/invalid_transition", status: r.status });
    if (naredba.positionId === null) {
      if (r.positionId === null) return bez({ ok: true, status: r.status, changed: false });
      const novo = { ...r, positionId: null, positionLabel: null, boundBy: ctx.ime };
      return { ishod: { ok: true, status: r.status, changed: true }, memorija: upisi(memorija, novo), zauzetost: ctx.zauzetost };
    }
    const mesto = ctx.sala.positions.find((kandidat) => kandidat.id === naredba.positionId);
    if (!mesto) return bez({ ok: false, code: "reservation/position_invalid", status: r.status });
    if (r.positionId === mesto.id) return bez({ ok: true, status: r.status, changed: false });
    const novo = { ...r, positionId: mesto.id, positionLabel: mesto.label, boundBy: ctx.ime };
    return { ishod: { ok: true, status: r.status, changed: true }, memorija: upisi(memorija, novo), zauzetost: ctx.zauzetost };
  }

  // A table chosen at the arrival is bound first (an accepted reservation only), and it must be on the floor.
  const mestoPriDolasku =
    naredba.vrsta === "stigli" && naredba.positionId !== null && r.status === "accepted" && naredba.positionId !== r.positionId
      ? ctx.sala.positions.find((kandidat) => kandidat.id === naredba.positionId)
      : undefined;
  if (naredba.vrsta === "stigli" && naredba.positionId !== null && r.status === "accepted" && naredba.positionId !== r.positionId && !mestoPriDolasku) {
    return bez({ ok: false, code: "reservation/position_invalid", status: r.status });
  }

  const prelaz = nextReservationStatus(r.status, AKCIJA[naredba.vrsta], "staff");
  if (prelaz.kind === "refused") return bez({ ok: false, code: prelaz.code, status: r.status });
  if (prelaz.kind === "same") return bez({ ok: true, status: r.status, changed: false });

  let novo: Rezervacija = { ...r, status: prelaz.to };
  switch (naredba.vrsta) {
    case "prihvati":
    case "odbij":
      novo = { ...novo, decidedAt: ctx.sada, decidedBy: ctx.ime };
      break;
    case "predlozi":
      novo = { ...novo, decidedAt: ctx.sada, decidedBy: ctx.ime, proposedAt: naredba.proposedAt, proposalNote: naredba.poruka };
      break;
    case "gostPrihvata":
      // The guest agreed: the proposed time becomes the reservation's time.
      novo = { ...novo, decidedAt: ctx.sada, decidedBy: ctx.ime, ...(r.proposedAt !== null ? { requestedAt: r.proposedAt } : {}) };
      break;
    case "otkazi":
      novo = { ...novo, cancelledAt: ctx.sada, cancelledBy: "staff", cancelledByName: ctx.ime };
      break;
    case "stigli":
      if (mestoPriDolasku) novo = { ...novo, positionId: mestoPriDolasku.id, positionLabel: mestoPriDolasku.label, boundBy: ctx.ime };
      novo = { ...novo, arrivedAt: ctx.sada, arrivedBy: ctx.ime };
      break;
  }

  let zauzetost = ctx.zauzetost;
  // Only the arrival writes the occupancy, and only with the venue's module and a table (K24-12).
  if (naredba.vrsta === "stigli" && novo.positionId && ctx.sala.occupancyEnabled && !ctx.zauzetost.off) {
    const positionId = novo.positionId;
    zauzetost = {
      off: false,
      states: [
        ...ctx.zauzetost.states.filter((red) => red.positionId !== positionId),
        { positionId, state: "occupied", updatedAt: ctx.sada, updatedBy: ctx.ime },
      ],
    };
  }
  return { ishod: { ok: true, status: prelaz.to, changed: true }, memorija: upisi(memorija, novo), zauzetost };
}
