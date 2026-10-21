// ScanMe Menu V1 (K25) — the izlog's in-memory venue for the guest's
// reservations (/dev/menu-public-preview?rezervacija=…): what the Server
// Actions would answer, without Convex and without sending anything anywhere,
// and a few invented reservations for "Moji zahtevi". Dev only; the instant is
// the izlog's (Saturday 17 October 2026, 18:27 in Belgrade, summer time).

import { IZLOG_TOKEN_OTKAZIVANJA } from "../../fixtures/rezervacije";
import { IZLOG_SADA } from "../../fixtures/lokal";
import type { ReservationCancelResult } from "@/lib/menu/http/reservation";
import type { MojaRezervacija, RezervacijaAkcije } from "./model";

const pauza = () => new Promise<void>((resolve) => setTimeout(resolve, 450));

/** Send keys already written (idempotency, like the server's `clientRequestId`). */
const poslate = new Map<string, { requestedAt: number; partySize: number }>();

/** A send: the same key again answers `deduped`, like the real venue. */
export const IZLOG_AKCIJE: RezervacijaAkcije = {
  posalji: async (_slug, unos) => {
    await pauza();
    const ranije = poslate.get(unos.clientRequestId);
    poslate.set(unos.clientRequestId, ranije ?? { requestedAt: unos.requestedAt, partySize: unos.partySize });
    return {
      ok: true,
      cancelToken: IZLOG_TOKEN_OTKAZIVANJA,
      reservationId: "izlog-rezervacija",
      requestedAt: ranije?.requestedAt ?? unos.requestedAt,
      partySize: ranije?.partySize ?? unos.partySize,
      deduped: ranije !== undefined,
    };
  },
};

/** A cancel from "Moji zahtevi": always works in the izlog. */
export async function izlogOtkaziRezervaciju(): Promise<ReservationCancelResult> {
  await pauza();
  return { ok: true };
}

const MINUT_MS = 60_000;
/** Today 20:00 and the next days' terms, in the Belgrade summer time of the izlog (UTC+2). */
const danas = (sat: number, minut = 0) => Date.UTC(2026, 9, 17, sat - 2, minut);
const sutra = (sat: number, minut = 0) => Date.UTC(2026, 9, 18, sat - 2, minut);

/** The term the izlog's confirmation and cancel-link page show: today 20:00. */
export const IZLOG_TERMIN_REZERVACIJE = danas(20);

const prazno = {
  proposedAt: null,
  proposalNote: null,
  decidedAt: null,
  arrivedAt: null,
  cancelledAt: null,
  cancelledBy: null,
} as const;

/** One reservation in every status, for the izlog's "Moji zahtevi" (invented). */
export function izlogRezervacije(): MojaRezervacija[] {
  return [
    { ...prazno, id: "izlog-rez-1", status: "new", requestedAt: sutra(20), partySize: 4, createdAt: IZLOG_SADA - 5 * MINUT_MS },
    {
      ...prazno,
      id: "izlog-rez-2",
      status: "accepted",
      requestedAt: danas(20, 30),
      partySize: 2,
      createdAt: IZLOG_SADA - 90 * MINUT_MS,
      decidedAt: IZLOG_SADA - 60 * MINUT_MS,
    },
    {
      ...prazno,
      id: "izlog-rez-3",
      status: "change_proposed",
      requestedAt: sutra(19),
      partySize: 6,
      createdAt: IZLOG_SADA - 120 * MINUT_MS,
      proposedAt: sutra(20, 30),
      proposalNote: "Za 19:00 nemamo veliki sto.",
    },
    {
      ...prazno,
      id: "izlog-rez-4",
      status: "arrived",
      requestedAt: danas(13),
      partySize: 3,
      createdAt: IZLOG_SADA - 8 * 60 * MINUT_MS,
      decidedAt: IZLOG_SADA - 7 * 60 * MINUT_MS,
      arrivedAt: danas(13, 10),
    },
    {
      ...prazno,
      id: "izlog-rez-5",
      status: "cancelled",
      requestedAt: sutra(12, 30),
      partySize: 2,
      createdAt: IZLOG_SADA - 3 * 60 * MINUT_MS,
      cancelledAt: IZLOG_SADA - 30 * MINUT_MS,
      cancelledBy: "guest",
    },
    {
      ...prazno,
      id: "izlog-rez-6",
      status: "declined",
      requestedAt: danas(19),
      partySize: 8,
      createdAt: IZLOG_SADA - 4 * 60 * MINUT_MS,
      decidedAt: IZLOG_SADA - 3 * 60 * MINUT_MS,
    },
  ];
}
