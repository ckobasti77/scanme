// ScanMe Menu V1 — RSD is the only authoritative price (master §5.3): whole
// dinars, stored as integers. EUR is informational and derived at render time.

import { MENU_MAX_PRICE_RSD } from "./limits";

export function isValidRsd(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= MENU_MAX_PRICE_RSD;
}
