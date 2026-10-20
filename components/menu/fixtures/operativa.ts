// Izlog fixtures: the day-to-day side of a venue, invented: guest requests,
// reservations and the team. All times are relative to IZLOG_SADA (18:27 in
// Belgrade), so the same call always gives the same data. Request prices are
// read from the matching fixture menu, so names, keys and totals agree.

import { roomServiceUnitPrice } from "@/lib/menu/room-service-pricing";
import { fixtureVenue, IZLOG_SADA } from "./lokal";
import { fixtureMenu } from "./meni";
import { createRng, fixturePrefixedKey } from "./rng";
import type {
  IzlogMenu,
  IzlogMenuSize,
  IzlogPosition,
  IzlogRequest,
  IzlogRequestItem,
  IzlogRequestKind,
  IzlogReservation,
  IzlogTeam,
  IzlogVenue,
} from "./tipovi";

const GUEST_EMAIL = "gost@example.com";
const GUEST_PHONE = "+381 60 000 0000";

const MENU_SIZE_OF_VENUE: Record<IzlogVenue["kind"], IzlogMenuSize> = {
  cafe: "mali",
  restaurant: "srednji",
  hotel: "veliki",
};

/** The instant `minutes` (and `seconds`) before IZLOG_SADA. */
const ago = (minutes: number, seconds = 0): number => IZLOG_SADA - (minutes * 60 + seconds) * 1000;

// Belgrade is two hours ahead of UTC on the day of the fixtures (summer time until 25 Oct 2026).
const BELGRADE_OFFSET_HOURS = 2;
/** Belgrade wall-clock time on the day of IZLOG_SADA (dayOffset 1 = the next day). */
const belgrade = (hour: number, minute: number, dayOffset = 0): number =>
  Date.UTC(2026, 9, 17 + dayOffset, hour - BELGRADE_OFFSET_HOURS, minute);

// =============================================================================
// Team
// =============================================================================

export function fixtureTeam(): IzlogTeam {
  const rng = createRng(5101);
  const [mainHall, terrace, vip] = fixtureVenue("restaurant").zones;
  const staffKey = () => fixturePrefixedKey("st", rng);
  return {
    members: [
      { email: "vlasnik@example.com", displayName: "Petar V.", role: "owner", status: "active" },
      { email: "menadzer@example.com", displayName: "Sanja M.", role: "manager", status: "active" },
      { email: "urednik@example.com", displayName: "Dejan K.", role: "editor", status: "active" },
      { email: "novi.urednik@example.com", displayName: "Tamara N.", role: "editor", status: "invited" },
      { email: "bivsi@example.com", displayName: "Ivan L.", role: "editor", status: "removed" },
    ],
    staff: [
      { key: staffKey(), displayName: "Milan", panelRole: "staff", active: true, hasPin: true, activeZoneKey: mainHall.key },
      { key: staffKey(), displayName: "Jelena", panelRole: "manager", active: true, hasPin: true, activeZoneKey: terrace.key },
      { key: staffKey(), displayName: "Stefan", panelRole: "staff", active: true, hasPin: true, activeZoneKey: vip.key },
      { key: staffKey(), displayName: "Ana", panelRole: "staff", active: true, hasPin: false, activeZoneKey: null },
      { key: staffKey(), displayName: "Luka", panelRole: "staff", active: false, hasPin: true, activeZoneKey: null },
    ],
  };
}

// =============================================================================
// Requests
// =============================================================================

type LineSpec = {
  name: string;
  variant?: string;
  addons?: readonly (readonly [group: string, option: string])[];
  quantity: number;
  note?: string;
};

type OrderLines = {
  newOrder: readonly LineSpec[];
  acceptedOrder: readonly LineSpec[];
  doneOrder: readonly LineSpec[];
  cancelledOrder: readonly LineSpec[];
  roomServiceOrder: readonly LineSpec[];
};

const CAFE_LINES: OrderLines = {
  newOrder: [
    { name: "Espresso", variant: "Veliki", quantity: 2 },
    { name: "Cappuccino", addons: [["Dodaci uz kafu", "Šlag"]], quantity: 1 },
    { name: "Palačinke sa čokoladom", quantity: 1 },
  ],
  acceptedOrder: [
    { name: "Kajgana sa slaninom", quantity: 1 },
    { name: "Kafa sa mlekom", quantity: 2 },
    { name: "Domaća limunada", quantity: 1 },
  ],
  doneOrder: [
    { name: "Burek sa sirom", quantity: 2 },
    { name: "Mineralna voda", quantity: 1 },
  ],
  cancelledOrder: [
    { name: "Tost sa sirom i šunkom", quantity: 1 },
    { name: "Sok od jabuke", quantity: 1 },
  ],
  roomServiceOrder: [],
};

const RESTAURANT_LINES: OrderLines = {
  newOrder: [
    {
      name: "Mešano meso (za dvoje)",
      addons: [
        ["Izaberite dva priloga", "Pomfrit"],
        ["Izaberite dva priloga", "Grilovano povrće"],
      ],
      quantity: 1,
      note: "Bez ljutog, molimo.",
    },
    { name: "Ćevapi", variant: "10 komada", quantity: 1 },
    { name: "Točeno pivo", variant: "0,5 l", quantity: 2 },
  ],
  acceptedOrder: [
    { name: "Karađorđeva šnicla", quantity: 1 },
    { name: "Šopska salata", quantity: 1 },
    { name: "Mineralna voda", quantity: 2 },
  ],
  doneOrder: [
    { name: "Pljeskavica sa kajmakom", quantity: 2 },
    { name: "Sezonska salata", quantity: 1 },
    { name: "Palačinke sa orasima", quantity: 1 },
  ],
  cancelledOrder: [{ name: "Domaća limunada", quantity: 2 }],
  roomServiceOrder: [
    { name: "Karađorđeva šnicla", quantity: 1 },
    { name: "Šopska salata", quantity: 1 },
    { name: "Mineralna voda", quantity: 2 },
  ],
};

function requireFound<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`Izlog fixture: ${what} not found`);
  return value;
}

/** One order line priced from the menu (Room service lines with the Room service price). */
function orderLine(menu: IzlogMenu, spec: LineSpec, roomService: boolean): IzlogRequestItem {
  const { snapshot } = menu;
  const article = requireFound(
    snapshot.articles.find((candidate) => candidate.name === spec.name),
    `article "${spec.name}"`,
  );

  let unitPriceRsd: number;
  if (spec.variant !== undefined) {
    const variant = requireFound(
      snapshot.variants.find(
        (candidate) => candidate.articleKey === article.key && candidate.name === spec.variant,
      ),
      `variant "${spec.variant}" of "${spec.name}"`,
    );
    unitPriceRsd = requireFound(variant.priceRsd ?? article.basePriceRsd ?? undefined, "variant price");
  } else if (roomService) {
    const config = requireFound(snapshot.roomService.config ?? undefined, "Room service config");
    const item = requireFound(
      snapshot.roomService.items.find((candidate) => candidate.articleKey === article.key),
      `Room service item "${spec.name}"`,
    );
    const price = roomServiceUnitPrice(
      { markupBps: config.markupBps ?? 0, markupScope: config.markupScope },
      {
        basePriceRsd: article.basePriceRsd,
        markupApplies: item.markupApplies,
        manualPriceRsd: item.manualPriceRsd,
      },
    );
    unitPriceRsd = requireFound(price.priceRsd ?? undefined, `Room service price of "${spec.name}"`);
  } else {
    unitPriceRsd = requireFound(article.basePriceRsd ?? undefined, `price of "${spec.name}"`);
  }

  const addons = (spec.addons ?? []).map(([groupName, optionName]) => {
    const group = requireFound(
      snapshot.addonGroups.find((candidate) => candidate.name === groupName),
      `add-on group "${groupName}"`,
    );
    const offered = snapshot.articleAddonGroups.some(
      (link) => link.articleKey === article.key && link.groupKey === group.key,
    );
    if (!offered) throw new Error(`Izlog fixture: "${spec.name}" does not offer "${groupName}"`);
    const option = requireFound(
      snapshot.addonOptions.find(
        (candidate) => candidate.groupKey === group.key && candidate.name === optionName,
      ),
      `add-on "${optionName}"`,
    );
    return { groupName, optionName, priceDeltaRsd: option.priceDeltaRsd };
  });

  const addonTotalRsd = addons.reduce((sum, addon) => sum + addon.priceDeltaRsd, 0);
  return {
    articleKey: article.key,
    name: article.name,
    variantName: spec.variant ?? null,
    addons,
    unitPriceRsd,
    quantity: spec.quantity,
    lineTotalRsd: (unitPriceRsd + addonTotalRsd) * spec.quantity,
    note: spec.note ?? null,
  };
}

export function fixtureRequests(venue: IzlogVenue): IzlogRequest[] {
  const menu = fixtureMenu(MENU_SIZE_OF_VENUE[venue.kind]);
  const lines = venue.kind === "cafe" ? CAFE_LINES : RESTAURANT_LINES;
  const staff = fixtureTeam().staff;

  const positionLabelled = (label: string): IzlogPosition =>
    requireFound(
      venue.positions.find((position) => position.label === label),
      `position "${label}"`,
    );
  const table = (number: number): IzlogPosition => positionLabelled(`Sto ${number}`);

  const make = (
    id: string,
    kind: IzlogRequestKind,
    position: IzlogPosition,
    createdAt: number,
    overrides: Partial<IzlogRequest> = {},
  ): IzlogRequest => ({
    id,
    kind,
    status: "new",
    channel: "standard",
    positionKey: position.key,
    positionLabel: position.label,
    zoneKey: position.zoneKey,
    paymentPreference: null,
    note: null,
    items: [],
    totalRsd: null,
    deliveryFeeRsd: null,
    createdAt,
    acceptedAt: null,
    doneAt: null,
    cancelledAt: null,
    cancelledBy: null,
    acceptedByStaffKey: null,
    ...overrides,
  });

  /** The items and the total of a standard order (the sum of the lines). */
  const order = (specs: readonly LineSpec[]): Pick<IzlogRequest, "items" | "totalRsd"> => {
    const items = specs.map((spec) => orderLine(menu, spec, false));
    return { items, totalRsd: items.reduce((sum, item) => sum + item.lineTotalRsd, 0) };
  };

  const requests: IzlogRequest[] = [
    // Waiting right now: a call (8 min 12 s), a bill (3 min 10 s), an order (6 min 10 s).
    make("rq_01", "call", table(3), ago(8, 12)),
    make("rq_02", "bill", table(5), ago(3, 10), { paymentPreference: "card" }),
    make("rq_03", "order", table(7), ago(6, 10), order(lines.newOrder)),
    // A call that has waited 17 minutes, past a 15-minute threshold.
    make("rq_04", "call", table(1), ago(17), { note: "Treba nam još jedna stolica." }),
    // Accepted: an order on table 3 next to its waiting call, and a call on table 5.
    make("rq_05", "order", table(3), ago(14), {
      status: "accepted",
      acceptedAt: ago(12),
      acceptedByStaffKey: staff[0].key,
      ...order(lines.acceptedOrder),
    }),
    make("rq_06", "call", table(5), ago(9), {
      status: "accepted",
      acceptedAt: ago(4),
      acceptedByStaffKey: staff[1].key,
    }),
    // Done.
    make("rq_07", "order", table(2), ago(55), {
      status: "done",
      acceptedAt: ago(52),
      doneAt: ago(38),
      acceptedByStaffKey: staff[0].key,
      ...order(lines.doneOrder),
    }),
    make("rq_08", "bill", table(6), ago(48), {
      status: "done",
      paymentPreference: "cash",
      acceptedAt: ago(46),
      doneAt: ago(41),
      acceptedByStaffKey: staff[1].key,
    }),
    make("rq_09", "call", table(4), ago(33), {
      status: "done",
      acceptedAt: ago(32),
      doneAt: ago(30),
      acceptedByStaffKey: staff[2].key,
    }),
    // Cancelled: an order by the guest, a call by the staff.
    make("rq_10", "order", table(8), ago(27), {
      status: "cancelled",
      cancelledAt: ago(26),
      cancelledBy: "guest",
      ...order(lines.cancelledOrder),
    }),
    make("rq_11", "call", table(2), ago(21), {
      status: "cancelled",
      cancelledAt: ago(20),
      cancelledBy: "staff",
    }),
  ];

  if (venue.kind === "hotel") {
    // One Room service order, priced with the Room service rule and one delivery fee.
    const deliveryFeeRsd = requireFound(
      menu.snapshot.roomService.config?.deliveryFeeRsd ?? undefined,
      "Room service delivery fee",
    );
    const items = lines.roomServiceOrder.map((spec) => orderLine(menu, spec, true));
    const itemsRsd = items.reduce((sum, item) => sum + item.lineTotalRsd, 0);
    requests.push(
      make("rq_12", "order", positionLabelled("Soba 108"), ago(11), {
        channel: "room_service",
        paymentPreference: "card",
        note: "Molimo pozvonite na sobu pre dolaska.",
        items,
        totalRsd: itemsRsd + deliveryFeeRsd,
        deliveryFeeRsd,
      }),
    );
  } else {
    requests.push(
      make("rq_12", "bill", table(7), ago(5), {
        status: "accepted",
        paymentPreference: "cash",
        acceptedAt: ago(2),
        acceptedByStaffKey: staff[2].key,
      }),
    );
  }

  return requests;
}

// =============================================================================
// Reservations
// =============================================================================

export function fixtureReservations(venue: IzlogVenue): IzlogReservation[] {
  const tables = venue.positions.filter((position) => position.kind === "table");
  const tableKey = (index: number): string =>
    requireFound(tables[index], `table number ${index + 1}`).key;

  const make = (
    id: string,
    status: IzlogReservation["status"],
    guestName: string,
    partySize: number,
    requestedAt: number,
    createdAt: number,
    overrides: Partial<IzlogReservation> = {},
  ): IzlogReservation => ({
    id,
    status,
    guestName,
    partySize,
    requestedAt,
    contactEmail: null,
    contactPhone: null,
    note: null,
    positionKey: null,
    proposedAt: null,
    holdMinutes: 15,
    createdAt,
    cancelledAt: null,
    cancelledBy: null,
    ...overrides,
  });

  return [
    // New: tonight at 19:00 Belgrade, still to be answered.
    make("rv_01", "new", "Marija P.", 4, belgrade(19, 0), ago(95), {
      contactEmail: GUEST_EMAIL,
      note: "Rođendan, molimo sto bliže prozoru.",
    }),
    make("rv_02", "accepted", "Nikola S.", 6, belgrade(20, 0), ago(6 * 60), {
      contactPhone: GUEST_PHONE,
      positionKey: tableKey(5),
      holdMinutes: 30,
    }),
    make("rv_03", "change_proposed", "Jelena M.", 2, belgrade(19, 30), ago(3 * 60), {
      contactEmail: GUEST_EMAIL,
      proposedAt: belgrade(20, 15),
    }),
    make("rv_04", "declined", "Stefan R.", 8, belgrade(21, 0), ago(20 * 60), {
      contactPhone: GUEST_PHONE,
      note: "Slavlje, osam osoba, tražimo odvojen prostor.",
    }),
    make("rv_05", "arrived", "Ana K.", 3, belgrade(18, 0), ago(24 * 60), {
      contactEmail: GUEST_EMAIL,
      positionKey: tableKey(3),
    }),
    make("rv_06", "cancelled", "Luka T.", 2, belgrade(19, 15), ago(5 * 60), {
      contactEmail: GUEST_EMAIL,
      cancelledAt: ago(40),
      cancelledBy: "guest",
    }),
    // Accepted, but the guests are 25 minutes late and the table is held for 15.
    make("rv_07", "accepted", "Ivana B.", 5, ago(25), ago(26 * 60), {
      contactPhone: GUEST_PHONE,
      positionKey: tableKey(6),
      holdMinutes: 15,
    }),
    // Accepted, tomorrow at 13:00 Belgrade.
    make("rv_08", "accepted", "Milica D.", 5, belgrade(13, 0, 1), ago(7 * 60), {
      contactEmail: GUEST_EMAIL,
      note: "Poslovni ručak.",
      positionKey: tableKey(1),
    }),
  ];
}
