// Izlog fixtures: types for data whose Convex tables do not exist yet.
//
// These mirror the PLANNED tables (zones and positions, occupancy, guest
// requests, reservations, team and staff). They exist only so the dev preview
// routes can show realistic, typed, invented data today. K20-K25 will replace
// them with the real validator types; until then nothing outside
// components/menu/fixtures and the izlog preview may depend on them.
//
// The menu itself is NOT redefined here: IzlogMenu wraps the real
// MenuDraftSnapshot of lib/menu/snapshot.ts.

import type { MenuDraftSnapshot } from "@/lib/menu/snapshot";

// -----------------------------------------------------------------------------
// Venue: zones, positions, occupancy
// -----------------------------------------------------------------------------

export type IzlogZone = { key: string; name: string; order: number; active: boolean };

export type IzlogPosition = {
  key: string;
  kind: "table" | "room" | "other";
  label: string;
  seats: number | null;
  zoneKey: string | null;
  /** Floor-plan rectangle on a 0-100 x 0-60 grid; null = not drawn on the plan. */
  layout: {
    x: number;
    y: number;
    w: number;
    h: number;
    shape: "rect" | "round";
    rotation: number;
  } | null;
  order: number;
  active: boolean;
};

export type IzlogOccupancyState = "free" | "occupied" | "reserved" | "out_of_service";

export type IzlogVenue = {
  name: string;
  slug: string;
  kind: "cafe" | "restaurant" | "hotel";
  zones: IzlogZone[];
  positions: IzlogPosition[];
  /** By position key; a position that is absent is neutral. null = the occupancy module is off. */
  occupancy: Record<string, IzlogOccupancyState> | null;
  /** How many printed QR cards the venue has. */
  cardCount: number;
};

// -----------------------------------------------------------------------------
// Guest requests (call the waiter, ask for the bill, order)
// -----------------------------------------------------------------------------

export type IzlogRequestKind = "call" | "bill" | "order";
export type IzlogRequestStatus = "new" | "accepted" | "done" | "cancelled";

export type IzlogRequestItem = {
  articleKey: string;
  name: string;
  variantName: string | null;
  addons: { groupName: string; optionName: string; priceDeltaRsd: number }[];
  unitPriceRsd: number;
  quantity: number;
  /** (unitPriceRsd + sum of add-on deltas) x quantity. */
  lineTotalRsd: number;
  note: string | null;
};

export type IzlogRequest = {
  id: string;
  kind: IzlogRequestKind;
  status: IzlogRequestStatus;
  channel: "standard" | "room_service";
  positionKey: string;
  positionLabel: string;
  zoneKey: string | null;
  paymentPreference: "cash" | "card" | null;
  note: string | null;
  /** Empty for call and bill. */
  items: IzlogRequestItem[];
  /** null for call and bill; the sum of the lines (plus the delivery fee for Room service). */
  totalRsd: number | null;
  deliveryFeeRsd: number | null;
  createdAt: number;
  acceptedAt: number | null;
  doneAt: number | null;
  cancelledAt: number | null;
  cancelledBy: "guest" | "staff" | null;
  acceptedByStaffKey: string | null;
};

// -----------------------------------------------------------------------------
// Reservations
// -----------------------------------------------------------------------------

export type IzlogReservationStatus =
  | "new"
  | "accepted"
  | "declined"
  | "change_proposed"
  | "arrived"
  | "cancelled";

export type IzlogReservation = {
  id: string;
  status: IzlogReservationStatus;
  guestName: string;
  partySize: number;
  requestedAt: number;
  contactEmail: string | null;
  contactPhone: string | null;
  note: string | null;
  positionKey: string | null;
  proposedAt: number | null;
  holdMinutes: number;
  createdAt: number;
  cancelledAt: number | null;
  cancelledBy: "guest" | "staff" | null;
};

// -----------------------------------------------------------------------------
// Team and staff
// -----------------------------------------------------------------------------

export type IzlogMember = {
  email: string;
  displayName: string;
  role: "owner" | "manager" | "editor";
  status: "invited" | "active" | "removed";
};

export type IzlogStaff = {
  key: string;
  displayName: string;
  panelRole: "staff" | "manager";
  active: boolean;
  hasPin: boolean;
  activeZoneKey: string | null;
};

export type IzlogTeam = { members: IzlogMember[]; staff: IzlogStaff[] };

// -----------------------------------------------------------------------------
// Menu
// -----------------------------------------------------------------------------

export type IzlogMenuSize = "mali" | "srednji" | "veliki";

export type IzlogMenu = {
  size: IzlogMenuSize;
  venueName: string;
  slug: string;
  snapshot: MenuDraftSnapshot;
  /** Articles marked "nema više" right now (live availability, not part of the snapshot). */
  unavailableArticleKeys: string[];
};
