// ScanMe Menu V1 (K25) — a reservation's status in the guest's words (master
// §11.7): always an icon + a word, colour only helps. The words are the
// guest's ("Poslato — čeka odgovor lokala"), not the staff's ("Nova").

import { CircleCheck, CircleSlash, CircleX, Clock, RefreshCw, UserCheck, type LucideIcon } from "lucide-react";
import { menuGostSr } from "@/lib/i18n/sr/menu-gost";
import type { MenuReservationStatus } from "@/lib/menu/reservation-status";
import styles from "./rezervacija.module.css";

const IKONICA_STATUSA: Record<MenuReservationStatus, LucideIcon> = {
  new: Clock,
  accepted: CircleCheck,
  declined: CircleX,
  change_proposed: RefreshCw,
  arrived: UserCheck,
  cancelled: CircleSlash,
};

export function StatusRezervacije({ status }: { status: MenuReservationStatus }) {
  const Ikonica = IKONICA_STATUSA[status];
  return (
    <span className={styles.status} data-status={status}>
      <Ikonica aria-hidden="true" strokeWidth={2} />
      {menuGostSr.rezervacija.statusi[status]}
    </span>
  );
}
