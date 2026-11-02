// ScanMe Menu V1 (K29) — the analytics clock: a day is a Belgrade calendar
// day (summer and winter time), taken from the moment the SERVER received the
// event, never from the guest's phone (docs/menu/ANALITIKA-DEFINICIJE.md §2).

import { belgradeParts } from "../../belgrade-time";
import { belgradeDateKey } from "../working-hours";

/** `YYYY-MM-DD` of the Belgrade day an epoch falls on. */
export function danUBeogradu(ms: number): string {
  return belgradeDateKey(ms);
}

/** The Belgrade hour (0–23) of an epoch: the "vreme" filter. */
export function satUBeogradu(ms: number): number {
  return belgradeParts(ms).hour % 24;
}
