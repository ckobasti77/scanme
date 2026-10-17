// Izlog fixtures: invented, typed, deterministic data for the dev preview
// routes (menus of three sizes, venues, requests, reservations, team).

export { fixtureMenu, IZLOG_MENU_SIZES } from "./meni";
export { fixtureVenue, IZLOG_SADA } from "./lokal";
export { fixtureRequests, fixtureReservations, fixtureTeam } from "./operativa";
export { createRng, fixtureKey, fixturePrefixedKey } from "./rng";
export type { Rng } from "./rng";
export type {
  IzlogMember,
  IzlogMenu,
  IzlogMenuSize,
  IzlogOccupancyState,
  IzlogPosition,
  IzlogRequest,
  IzlogRequestItem,
  IzlogRequestKind,
  IzlogRequestStatus,
  IzlogReservation,
  IzlogReservationStatus,
  IzlogStaff,
  IzlogTeam,
  IzlogVenue,
  IzlogZone,
} from "./tipovi";
