// ScanMe Menu V1 (K21) — how a request's status and kind look to the guest
// (master §8.4; MENU-UX §5.2): always an icon + a word, colour only helps.
// Novi, Prihvaćen, Završen, Otkazan — there is no "Konobar je krenuo".

import { Bell, CircleCheck, CircleDot, CircleSlash, ConciergeBell, Hand, ReceiptText, type LucideIcon } from "lucide-react";
import { belgradeParts } from "@/lib/belgrade-time";
import { fmt, srPluralCategory } from "@/lib/i18n/format";
import { menuDomenSr } from "@/lib/i18n/sr/menu-domen";
import { menuGostSr } from "@/lib/i18n/sr/menu-gost";
import type { RequestErrorCode } from "@/lib/menu/errors/requests";
import type { MenuRequestKind, MenuRequestStatus } from "@/lib/menu/request-status";
import styles from "./gost.module.css";

const IKONICA_STATUSA: Record<MenuRequestStatus, LucideIcon> = {
  new: CircleDot,
  accepted: Hand,
  done: CircleCheck,
  cancelled: CircleSlash,
};

export const IKONICA_VRSTE: Record<MenuRequestKind, LucideIcon> = {
  call: Bell,
  bill: ReceiptText,
  order: ConciergeBell,
};

export function StatusZahteva({ status }: { status: MenuRequestStatus }) {
  const Ikonica = IKONICA_STATUSA[status];
  return (
    <span className={styles.status} data-status={status}>
      <Ikonica aria-hidden="true" strokeWidth={2} />
      {menuDomenSr.requestStatuses[status]}
    </span>
  );
}

/** "18:45" in Belgrade time (the venue's clock, never the phone's zone). */
export function satBeograd(epoch: number): string {
  const parts = belgradeParts(epoch);
  return `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}

/** The Serbian sentence for a refusal; `network` = the request never reached a decision. */
export function porukaGreske(code: RequestErrorCode | "network"): string {
  return code === "network" ? menuGostSr.greska.nepoznata : menuDomenSr.errors[code];
}

export function brojStavki(n: number): string {
  return fmt(menuGostSr.zahtevi.stavke[srPluralCategory(n)], { n });
}
