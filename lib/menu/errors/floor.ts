// ScanMe Menu V1 (K20) — machine error codes of "Lokal i QR": zones,
// positions, the floor layout and the QR cards of the Menu (master §9, §13.6).
// Dependency-free like ./core.ts; the Serbian text lives in the `menu-domen`
// dictionary (`errors[code]`).
export const FLOOR_ERROR = {
  /** Another active position of this venue already has this name or number. */
  positionLabelTaken: "floor/position_label_taken",
  /** Another active zone of this venue already has this name. */
  zoneNameTaken: "floor/zone_name_taken",
  /** An active QR card opens this position; unlink or disable the card first. */
  positionHasQr: "floor/position_has_qr",
  /** The position is archived; it can no longer be changed or linked. */
  positionArchived: "floor/position_archived",
  /** The zone is archived; positions cannot be moved into it. */
  zoneArchived: "floor/zone_archived",
  /** The layout is outside the grid of its zone or too small/large. */
  invalidLayout: "floor/invalid_layout",
  /** The card is managed by ScanMe (adopted access channel); only ScanMe changes it. */
  cardReadOnly: "floor/card_read_only",
  /** The card does not open the Menu (its current destination is something else). */
  cardNotMenu: "floor/card_not_menu",
  /** The page the card should open is archived or does not exist. */
  pageUnavailable: "floor/page_unavailable",
} as const;

export type FloorErrorCode = (typeof FLOOR_ERROR)[keyof typeof FLOOR_ERROR];
