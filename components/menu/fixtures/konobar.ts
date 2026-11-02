// Izlog fixtures of the waiter panel (K22): the invented "Demo restoran" of
// K07 (zones Glavna sala, Terasa, VIP; team Milan, Jelena, Stefan…) seen by
// the waiter Milan on his phone at 18:27 (IZLOG_SADA). The requests are the
// K07 ones (fixtureRequests), so names, prices and timers agree everywhere:
// a call at Sto 3 waiting 08:12, a bill at Sto 5 03:10, an order at Sto 7
// 06:10, a late call at Sto 1 (17 min) and requests Milan or a colleague took.
// Fictional only (the repo is public).
//
// K23: the floor of the same venue (fixtureSale): the zones and the per-zone
// layout of "Lokal i QR" (fixtureLokalPodaci, so the plan is the one the
// owner arranged), the team with their own zones, the cards on each table,
// the timing (15 / 5 min) and the occupancy of K07 — off unless asked.
// Parallel states on one table come from the K07 requests: Sto 3 (a waiting
// call + an accepted order), Sto 5 (a bill + a call), Sto 7 (an order + a
// bill); Sto 1 waits 17 minutes, past the threshold.

import type {
  KonobarDetalj,
  KonobarDetaljMesta,
  KonobarKorisnik,
  KonobarOtkazan,
  KonobarRezervacija,
  KonobarRezervacije,
  KonobarRezervacijaDetalj,
  KonobarSala,
  KonobarZahtev,
  KonobarZauzetost,
} from "@/components/menu/konobar/model";
import type { ReservationMode } from "@/lib/menu/reservation-config";
import { normalizeArticleName } from "@/lib/menu/text";
import { DEFAULT_PANEL_TIMING } from "@/lib/menu/thresholds";
import { IZLOG_SADA, fixtureVenue } from "./lokal";
import { fixtureLokalPodaci } from "./lokal-qr";
import { fixtureRequests, fixtureReservations, fixtureTeam } from "./operativa";
import type { IzlogRequest, IzlogReservation } from "./tipovi";

/** The PIN Milan types in the izlog (the izlog's own invented PIN; never a real one). */
export const KONOBAR_IZLOG_PIN = "246";
/** The staff member signed in on the izlog's device. */
export const KONOBAR_IZLOG_OSOBA = "Milan";
/** The Manager who may enter with the account (`uloga=menadzer`). */
export const KONOBAR_IZLOG_MENADZER = "Sanja M.";

export type KonobarFixture = {
  lokal: string;
  korisnik: KonobarKorisnik;
  zahtevi: KonobarZahtev[];
  otkazani: KonobarOtkazan[];
  /** Every request's detail by id (lines, the card, the rest of the table). */
  detalji: Record<string, KonobarDetalj>;
  skraceno: boolean;
};

const MNOGO = 300;

export function fixtureKonobar(opcije: { stanje?: "prazno" | "mnogo" | null; uloga?: "osoblje" | "menadzer" } = {}): KonobarFixture {
  const venue = fixtureVenue("restaurant");
  const tim = fixtureTeam();
  const ja = tim.staff[0];
  const zona = new Map(venue.zones.map((zone) => [zone.key, zone.name]));
  const osoba = new Map(tim.staff.map((member) => [member.key, member.displayName]));
  const pozicija = new Map(venue.positions.map((position) => [position.key, position]));
  const nalogom = opcije.uloga === "menadzer";

  const uZahtev = (izvor: IzlogRequest): KonobarZahtev => ({
    id: izvor.id,
    kind: izvor.kind,
    positionId: izvor.positionKey,
    zoneId: izvor.zoneKey,
    status: izvor.status,
    channel: izvor.channel,
    positionLabel: izvor.positionLabel,
    positionKind: pozicija.get(izvor.positionKey)?.kind ?? "table",
    zoneName: izvor.zoneKey ? (zona.get(izvor.zoneKey) ?? null) : null,
    createdAt: izvor.createdAt,
    acceptedAt: izvor.acceptedAt,
    paymentPreference: izvor.paymentPreference,
    itemCount: izvor.kind === "order" ? izvor.items.length : null,
    totalRsd: izvor.totalRsd,
    acceptedBy: izvor.acceptedByStaffKey
      ? { name: osoba.get(izvor.acceptedByStaffKey) ?? "", isMe: !nalogom && izvor.acceptedByStaffKey === ja.key }
      : null,
  });

  let izvori = opcije.stanje === "prazno" ? [] : fixtureRequests(venue);
  if (opcije.stanje === "mnogo") {
    const stolovi = venue.positions.filter((position) => position.kind === "table");
    const dodatni: IzlogRequest[] = Array.from({ length: MNOGO }, (_, indeks) => {
      const sto = stolovi[indeks % stolovi.length];
      const vrsta = (["call", "bill", "call"] as const)[indeks % 3];
      return {
        id: `rq_m${String(indeks).padStart(3, "0")}`,
        kind: vrsta,
        status: "new",
        channel: "standard",
        positionKey: sto.key,
        positionLabel: sto.label,
        zoneKey: sto.zoneKey,
        paymentPreference: vrsta === "bill" ? (indeks % 2 === 0 ? "cash" : "card") : null,
        note: null,
        items: [],
        totalRsd: null,
        deliveryFeeRsd: null,
        createdAt: IZLOG_SADA - (40 * 60 + indeks * 7) * 1000,
        acceptedAt: null,
        doneAt: null,
        cancelledAt: null,
        cancelledBy: null,
        acceptedByStaffKey: null,
      };
    });
    izvori = [...izvori, ...dodatni];
  }

  const otvoreni = izvori.filter((izvor) => izvor.status === "new" || izvor.status === "accepted");
  const zahtevi = otvoreni.slice(0, opcije.stanje === "mnogo" ? MNOGO : otvoreni.length).map(uZahtev);
  const detalji: Record<string, KonobarDetalj> = {};
  for (const izvor of izvori) {
    const zahtev = uZahtev(izvor);
    const subtotal = izvor.items.reduce((suma, stavka) => suma + stavka.lineTotalRsd, 0);
    detalji[izvor.id] = {
      request: {
        ...zahtev,
        // The printed card names its table with a letter ("7-A"), as cards of K20 do.
        sourceLabel: `${izvor.positionLabel.replace(/^\D+/, "")}-A`,
        subtotalRsd: izvor.kind === "order" ? subtotal : null,
        deliveryFeeRsd: izvor.deliveryFeeRsd,
        doneAt: izvor.doneAt,
        doneBy: izvor.status === "done" && izvor.acceptedByStaffKey ? (osoba.get(izvor.acceptedByStaffKey) ?? null) : null,
        cancelledAt: izvor.cancelledAt,
        cancelledBy: izvor.cancelledBy,
      },
      items: izvor.items.map((stavka) => ({
        name: stavka.name,
        variantName: stavka.variantName,
        addons: stavka.addons,
        quantity: stavka.quantity,
        unitPriceRsd: stavka.unitPriceRsd,
        lineTotalRsd: stavka.lineTotalRsd,
        promoApplied: false,
        note: stavka.note,
      })),
      others: otvoreni
        .filter((drugi) => drugi.positionKey === izvor.positionKey && drugi.id !== izvor.id)
        .map(uZahtev),
    };
  }

  return {
    lokal: venue.name,
    korisnik: nalogom
      ? { kind: "account", displayName: KONOBAR_IZLOG_MENADZER, expiresAt: null }
      : { kind: "staff", displayName: ja.displayName, expiresAt: IZLOG_SADA + 6 * 60 * 60 * 1000 },
    zahtevi,
    otkazani: izvori
      .filter((izvor) => izvor.status === "cancelled")
      .map((izvor) => ({
        id: izvor.id,
        kind: izvor.kind,
        positionLabel: izvor.positionLabel,
        cancelledAt: izvor.cancelledAt,
        cancelledBy: izvor.cancelledBy,
      })),
    detalji,
    skraceno: opcije.stanje === "mnogo",
  };
}

// -----------------------------------------------------------------------------
// K23 — the floor
// -----------------------------------------------------------------------------

export type SalaFixture = {
  sala: KonobarSala;
  /** The occupancy as the panel reads it (off unless the module is switched on). */
  zauzetost: KonobarZauzetost;
  /** The active QR cards on each position (by position id). */
  kartice: Record<string, KonobarDetaljMesta>;
};

/** The zone whose name matches `naziv` (case and diacritics ignored), or null. */
export function zonaPoNazivu(sala: Pick<KonobarSala, "zones">, naziv: string | null | undefined): string | null {
  if (!naziv) return null;
  const trazeno = normalizeArticleName(naziv);
  return sala.zones.find((zona) => normalizeArticleName(zona.name) === trazeno)?.id ?? null;
}

/** The position whose label matches `naziv` ("Sto 12", "sto 12"), or null. */
export function mestoPoNazivu(sala: Pick<KonobarSala, "positions">, naziv: string | null | undefined): string | null {
  if (!naziv) return null;
  const trazeno = normalizeArticleName(naziv);
  return sala.positions.find((mesto) => normalizeArticleName(mesto.label) === trazeno)?.id ?? null;
}

export function fixtureSale(
  opcije: { zauzetost?: boolean; kasniMin?: number | null; uloga?: "osoblje" | "menadzer"; zona?: string | null } = {},
): SalaFixture {
  const venue = fixtureVenue("restaurant");
  const lokal = fixtureLokalPodaci("restoran");
  const tim = fixtureTeam();
  const ja = tim.staff[0];
  const nalogom = opcije.uloga === "menadzer";
  const zones = lokal.zones.map((zona) => ({ id: zona.id, name: zona.name, order: zona.order }));
  const mojaZona = zonaPoNazivu({ zones }, opcije.zona);
  const sala: KonobarSala = {
    zones,
    positions: lokal.positions.map((mesto) => ({
      id: mesto.id,
      kind: mesto.kind,
      label: mesto.label,
      seats: mesto.seats,
      zoneId: mesto.zoneId,
      layout: mesto.layout,
      order: mesto.order,
    })),
    staff: tim.staff
      .filter((clan) => clan.active)
      .map((clan) => ({
        id: clan.key,
        name: clan.displayName,
        panelRole: clan.panelRole,
        activeZoneId: clan.key === ja.key ? mojaZona : clan.activeZoneKey,
      })),
    me: {
      staffId: nalogom ? null : ja.key,
      activeZoneId: nalogom ? null : mojaZona,
      // Milan is a plain waiter; the Manager's account re-assigns zones.
      canAssignZones: nalogom,
    },
    timing: { ...DEFAULT_PANEL_TIMING, ...(opcije.kasniMin ? { lateThresholdMin: opcije.kasniMin } : {}) },
    occupancyEnabled: opcije.zauzetost === true,
  };
  const zauzetost: KonobarZauzetost =
    opcije.zauzetost === true && venue.occupancy
      ? {
          off: false,
          states: Object.entries(venue.occupancy).map(([positionId, state], indeks) => ({
            positionId,
            state,
            updatedAt: IZLOG_SADA - (20 + indeks * 7) * 60_000,
            updatedBy: tim.staff[indeks % 3].displayName,
          })),
        }
      : { off: true };
  const kartice: Record<string, KonobarDetaljMesta> = {};
  for (const kartica of lokal.cards) {
    const mesto = kartica.link?.positionId;
    if (!mesto || !kartica.link?.active || kartica.status !== "active" || !kartica.opensMenu) continue;
    (kartice[mesto] ??= { cards: [] }).cards.push({ label: kartica.label });
  }
  return { sala, zauzetost, kartice };
}

// -----------------------------------------------------------------------------
// K25 — reservations
// -----------------------------------------------------------------------------

export type RezervacijeFixture = {
  /** What the panel's one reservations subscription answers (declined ones are not in the list). */
  rezervacije: KonobarRezervacije;
  /** Every reservation's detail by id (contact, note, who decided), the declined one included. */
  detalji: Record<string, KonobarRezervacijaDetalj>;
};

const MINUT = 60_000;
/** The venue's hold after a reservation's time (minutes) in the izlog. */
export const REZERVACIJE_HOLD_MIN = 15;

/** The other reservations of the same table that day (accepted or arrived), earliest first (convex/menuReservations.ts detail). */
export function rezervacijeIstogStola(redovi: readonly KonobarRezervacija[], red: Pick<KonobarRezervacija, "id" | "positionId" | "requestedAt">): KonobarRezervacija[] {
  if (red.positionId === null) return [];
  return redovi
    .filter(
      (drugi) =>
        drugi.id !== red.id &&
        drugi.positionId === red.positionId &&
        (drugi.status === "accepted" || drugi.status === "arrived") &&
        Math.abs(drugi.requestedAt - red.requestedAt) < 12 * 60 * MINUT,
    )
    .sort((a, b) => a.requestedAt - b.requestedAt);
}

/**
 * The reservations of the invented "Demo restoran" as the waiter Milan sees them
 * at 18:27 (K07's fixtureReservations): a new one tonight at 19:00 (rv_01), an
 * accepted one at 20:00 bound to Sto 6 (rv_02), a proposal (rv_03), a declined one
 * (rv_04, only in the detail), guests who arrived at 18:04 (rv_05), one the guest
 * cancelled (rv_06), guests 25 minutes late on Sto 7 with a 15-minute hold (rv_07)
 * and tomorrow at 13:00 on Sto 2 (rv_08). `otkazana`: the guest cancelled rv_06
 * two minutes ago (the strip shows); otherwise 40 minutes ago (only in the list).
 */
export function fixtureKonobarRezervacije(
  opcije: { otkazana?: boolean; prazno?: boolean; nacin?: ReservationMode } = {},
): RezervacijeFixture {
  const venue = fixtureVenue("restaurant");
  const tim = fixtureTeam();
  const osoblje = tim.staff[0].displayName;
  const menadzer = tim.staff[1].displayName;
  const pozicija = new Map(venue.positions.map((position) => [position.key, position]));
  const izvori: IzlogReservation[] = opcije.prazno ? [] : fixtureReservations(venue);

  const uRed = (izvor: IzlogReservation): KonobarRezervacija => {
    const otkazanaPre = izvor.id === "rv_06" && opcije.otkazana === true ? IZLOG_SADA - 2 * MINUT : izvor.cancelledAt;
    return {
      id: izvor.id,
      status: izvor.status,
      guestName: izvor.guestName,
      partySize: izvor.partySize,
      requestedAt: izvor.requestedAt,
      createdAt: izvor.createdAt,
      positionId: izvor.positionKey,
      positionLabel: izvor.positionKey ? (pozicija.get(izvor.positionKey)?.label ?? null) : null,
      hasNote: izvor.note !== null,
      proposedAt: izvor.proposedAt,
      arrivedAt: izvor.status === "arrived" ? izvor.requestedAt + 4 * MINUT : null,
      cancelledAt: otkazanaPre,
      cancelledBy: izvor.cancelledBy,
    };
  };

  const redovi = izvori.map(uRed);
  const detalji: Record<string, KonobarRezervacijaDetalj> = {};
  for (const izvor of izvori) {
    const red = redovi.find((kandidat) => kandidat.id === izvor.id) as KonobarRezervacija;
    detalji[izvor.id] = {
      reservation: {
        ...red,
        contactEmail: izvor.contactEmail,
        contactPhone: izvor.contactPhone,
        note: izvor.note,
        proposalNote: izvor.status === "change_proposed" ? "Imamo sto za vas u 20:15." : null,
        decidedAt: izvor.status === "new" ? null : izvor.createdAt + 12 * MINUT,
        decidedBy: izvor.status === "new" ? null : menadzer,
        boundBy: izvor.positionKey ? osoblje : null,
        arrivedBy: izvor.status === "arrived" ? osoblje : null,
        cancelledByName: null,
      },
      sameTable: rezervacijeIstogStola(redovi, red),
    };
  }

  // The list as the server answers it: new, proposed, accepted, arrived, then the cancelled ones (a declined one is not listed).
  const redosled = ["new", "change_proposed", "accepted", "arrived", "cancelled"] as const;
  const uListi = redosled.flatMap((status) => redovi.filter((red) => red.status === status));
  return { rezervacije: { rows: uListi, skraceno: false, mode: opcije.nacin ?? "form", holdMinutes: REZERVACIJE_HOLD_MIN }, detalji };
}
