// Izlog fixtures of the waiter panel (K22): the invented "Demo restoran" of
// K07 (zones Glavna sala, Terasa, VIP; team Milan, Jelena, Stefan…) seen by
// the waiter Milan on his phone at 18:27 (IZLOG_SADA). The requests are the
// K07 ones (fixtureRequests), so names, prices and timers agree everywhere:
// a call at Sto 3 waiting 08:12, a bill at Sto 5 03:10, an order at Sto 7
// 06:10, a late call at Sto 1 (17 min) and requests Milan or a colleague took.
// Fictional only (the repo is public).

import type {
  KonobarDetalj,
  KonobarKorisnik,
  KonobarOtkazan,
  KonobarZahtev,
} from "@/components/menu/konobar/model";
import { IZLOG_SADA, fixtureVenue } from "./lokal";
import { fixtureRequests, fixtureTeam } from "./operativa";
import type { IzlogRequest } from "./tipovi";

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
