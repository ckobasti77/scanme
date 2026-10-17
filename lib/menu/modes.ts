// ScanMe Menu — service modes (master §4). The mode is chosen when the Menu
// service is created, is locked for that service, is only SHOWN to the client,
// and only a ScanMe admin mutation changes it (master §4.1).

export const MENU_MODES = ["hospitality", "services", "retail"] as const;
export type MenuMode = (typeof MENU_MODES)[number];

/** V1 builds hospitality only; services is V1.1, retail a later phase (§4.2). */
export const AVAILABLE_MENU_MODES: readonly MenuMode[] = ["hospitality"];

export const DEFAULT_MENU_MODE: MenuMode = "hospitality";

export function isModeAvailable(mode: MenuMode): boolean {
  return AVAILABLE_MENU_MODES.includes(mode);
}

/** Live switches of a Menu service (Funkcionalnosti, master §13.7). */
export type MenuFeatureKey =
  | "callWaiter"
  | "billRequest"
  | "ordering"
  | "roomService"
  | "occupancy"
  | "reservations";

/** Which features each mode supports. */
const MODE_FEATURES: Record<MenuMode, readonly MenuFeatureKey[]> = {
  hospitality: [
    "callWaiter",
    "billRequest",
    "ordering",
    "roomService",
    "occupancy",
    "reservations",
  ],
  // §4.2: "funkcije koje nemaju smisla, poput porudžbine za sto, ne
  // prikazuju se"; the exact V1.1 set is decided when the mode is built.
  services: ["reservations"],
  retail: [],
};

export function modeSupportsFeature(mode: MenuMode, feature: MenuFeatureKey): boolean {
  return MODE_FEATURES[mode].includes(feature);
}

/**
 * Master §4.1/§4.2: data and settings are never carried blindly between modes.
 * The features a mode change would switch off — the admin sees this list and
 * the change is audited with it.
 */
export function featuresDroppedByModeChange(
  from: MenuMode,
  to: MenuMode,
): MenuFeatureKey[] {
  const kept = new Set(MODE_FEATURES[to]);
  return MODE_FEATURES[from].filter((feature) => !kept.has(feature));
}
