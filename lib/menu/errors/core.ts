// ScanMe Menu V1 (K02) — machine error codes of the core domain: access,
// service, pages, sections, articles and placements.
//
// DEPENDENCY-FREE ON PURPOSE (the convex/lib/orderingErrors.ts precedent): the
// Convex modules raise these as `new ConvexError(MENU_ERROR.x)` and the panel
// maps them to Serbian through the `menu-domen` dictionary (`errors[code]`).
// Codes are never prose. Later steps add their own files next to this one
// (lib/menu/errors/<domen>.ts) instead of growing this list.
export const MENU_ERROR = {
  /** No signed-in user. */
  unauthenticated: "menu/unauthenticated",
  /** The Menu service, business or row does not exist or is not this tenant's. */
  notFound: "menu/not_found",
  /** Signed in, but the role does not allow this action (or no role at all). */
  forbidden: "menu/forbidden",
  /** The scanme_menu service profile is not active (ScanMe turned it off). */
  serviceInactive: "menu/service_inactive",
  /** ScanMe switched client editing off for this service (clientEditingEnabled). */
  editingDisabled: "menu/editing_disabled",
  /** The requested mode is reserved for a later phase (V1 is hospitality only). */
  modeNotAvailable: "menu/mode_not_available",
  /** A Menu service already exists for this business (one per business in V1). */
  serviceExists: "menu/service_exists",
  /** A value failed validation (empty name, too long, bad price, bad slug…). */
  invalidInput: "menu/invalid_input",
  /** The value someone else saved differs from the one this client last saw. */
  conflict: "menu/conflict",
  /** A technical ceiling (pages, sections, articles, placements) is reached. */
  limitReached: "menu/limit_reached",
  /** The page is linked to an active QR card; redirect or disable that QR first. */
  pageHasQr: "menu/page_has_qr",
  /** The last active page cannot be deleted or archived. */
  lastPage: "menu/last_page",
  /** The page is archived; restore it before changing its content. */
  pageArchived: "menu/page_archived",
  /** The article is already shown in this section. */
  placementExists: "menu/placement_exists",
} as const;

export type MenuErrorCode = (typeof MENU_ERROR)[keyof typeof MENU_ERROR];
