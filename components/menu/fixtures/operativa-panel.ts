// Izlog fixtures: the data of Operativa in the client panel (K27), invented and
// deterministic. It is the shape the server gives the screen
// (convex/menuPanel.ts `operations`), built from the izlog venue, requests,
// reservations and team (fixtures/lokal.ts, fixtures/operativa.ts), so the
// names, tables and times agree with the waiter panel's izlog. "Now" is
// IZLOG_SADA (18:27 in Belgrade).
//
// `paznja`: seven active requests — four new (one waiting past the threshold),
// a late order a waiter took, a call an Owner took with their account and a
// bill — three waiters on shift, four reservations around the evening.
// `mirno`: nothing waiting, one waiter on shift, one reservation later today.
// `pingPoslat`: the late order carries a reminder sent two minutes ago.

import type {
  OperacijePodaci,
  OperacijeRezervacija,
  OperacijeZahtev,
} from "@/lib/menu/operations-view";
import { fixtureVenue, IZLOG_SADA } from "./lokal";
import { fixtureRequests, fixtureReservations, fixtureTeam } from "./operativa";

const MINUT = 60_000;
/** The instant `minutes` before IZLOG_SADA. */
const ago = (minutes: number): number => IZLOG_SADA - minutes * MINUT;

/** The late order of the waiter Milan: the reminder, when sent, belongs to it. */
const KASNI_ZAHTEV = "rq_05";
/** The call an Owner took with their account (an account has no waiter to remind). */
const ZAHTEV_NALOGOM = "rq_06";
const NALOG_VLASNIKA = "Vlasnik";

export function fixtureOperacije({
  sadrzaj,
  pingPoslat,
}: {
  sadrzaj: "paznja" | "mirno";
  pingPoslat: boolean;
}): OperacijePodaci {
  const venue = fixtureVenue("restaurant");
  const team = fixtureTeam();
  const [milan, jelena, stefan] = team.staff;
  const zones = venue.zones.map((zone) => ({ id: zone.key, name: zone.name }));
  const zoneName = (zoneKey: string | null): string | null =>
    zones.find((zone) => zone.id === zoneKey)?.name ?? null;
  const DUZINA_SMENE = 8 * 60 * MINUT;
  const naSmeni = (member: typeof milan, sinceMinutesAgo: number) => ({
    staffId: member.key,
    name: member.displayName,
    zoneName: zoneName(member.activeZoneKey),
    since: ago(sinceMinutesAgo),
    expiresAt: IZLOG_SADA + DUZINA_SMENE - sinceMinutesAgo * MINUT,
  });

  const requests: OperacijeZahtev[] =
    sadrzaj === "mirno"
      ? []
      : fixtureRequests(venue)
          .filter((request) => request.status === "new" || request.status === "accepted")
          .map((request): OperacijeZahtev => {
            const staff = team.staff.find((member) => member.key === request.acceptedByStaffKey);
            return {
              id: request.id,
              kind: request.kind,
              status: request.status,
              channel: request.channel,
              positionLabel: request.positionLabel,
              zoneId: request.zoneKey,
              zoneName: zoneName(request.zoneKey),
              // The order of the fixtures has waited 14 minutes; here it has waited 19, past the 15-minute threshold.
              createdAt: request.id === KASNI_ZAHTEV ? ago(19) : request.createdAt,
              acceptedAt: request.acceptedAt,
              paymentPreference: request.paymentPreference,
              itemCount: request.kind === "order" ? request.items.length : null,
              totalRsd: request.totalRsd,
              acceptedBy:
                request.id === ZAHTEV_NALOGOM
                  ? { kind: "account", name: NALOG_VLASNIKA }
                  : staff
                    ? { kind: "staff", staffId: staff.key, name: staff.displayName }
                    : null,
              lastPing: pingPoslat && request.id === KASNI_ZAHTEV ? { at: ago(2), seen: false } : null,
            };
          });

  // Today's reservations as the server brings them: no name, no contact, no note.
  const reservations: OperacijeRezervacija[] = fixtureReservations(venue)
    .filter((reservation) => sadrzaj === "paznja" || reservation.id === "rv_02")
    .map((reservation) => ({
      id: reservation.id,
      status: reservation.status,
      requestedAt: reservation.requestedAt,
      partySize: reservation.partySize,
      positionLabel: venue.positions.find((position) => position.key === reservation.positionKey)?.label ?? null,
    }));

  return {
    lateThresholdMin: 15,
    holdMinutes: 15,
    requests,
    truncated: false,
    reservations,
    reservationsTruncated: false,
    onShift: sadrzaj === "mirno" ? [naSmeni(jelena, 95)] : [naSmeni(milan, 260), naSmeni(jelena, 145), naSmeni(stefan, 55)],
    zones,
  };
}
