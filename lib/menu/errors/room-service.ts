// ScanMe Menu V1 (K03) — machine error codes of the Room service module
// (master §5.3, §21.4). Dependency-free like ./core.ts; the Serbian text lives
// in the `menu-domen` dictionary (`errors[code]`).
export const ROOM_SERVICE_ERROR = {
  /** A Room service category still holds articles; move or remove them first. */
  categoryNotEmpty: "room_service/category_not_empty",
} as const;

export type RoomServiceErrorCode = (typeof ROOM_SERVICE_ERROR)[keyof typeof ROOM_SERVICE_ERROR];
