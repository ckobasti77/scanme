// ScanMe Menu V1 (K22) — how the waiter panel names a request: its kind is
// always icon + colour + word (MENU-UX §2.2: Bell red, ReceiptText blue,
// ConciergeBell emerald — the emerald is never ScanMe green or the green of
// "Završen"), and its status is always icon + word (MENU-UX §5.2: CircleDot
// Novi, Hand Prihvaćen, CircleCheck Završen, CircleSlash Otkazan). There is
// no "Konobar je krenuo".

import {
  Bell,
  CalendarClock,
  CircleCheck,
  CircleDot,
  CircleSlash,
  ConciergeBell,
  Hand,
  ReceiptText,
  type LucideIcon,
} from "lucide-react";
import { fmt, srPluralCategory } from "@/lib/i18n/format";
import { menuDomenSr } from "@/lib/i18n/sr/menu-domen";
import { menuKonobarSr } from "@/lib/i18n/sr/menu-konobar";
import type { MenuRequestKind, MenuRequestStatus } from "@/lib/menu/request-status";
import { REQUEST_STATUS_TONE } from "@/lib/menu/request-status";
import { cn } from "@/lib/utils";
import { StatusOznaka } from "../zajednicko/status-oznaka";
import type { KonobarZahtev } from "./model";

const d = menuDomenSr;
const t = menuKonobarSr;

export type VrstaKljuc = MenuRequestKind | "reservation";

export const VRSTA: Record<VrstaKljuc, { ikonica: LucideIcon; boja: string; meko: string }> = {
  call: { ikonica: Bell, boja: "text-[var(--mp-vrsta-poziv)]", meko: "bg-[var(--mp-vrsta-poziv-meko)]" },
  bill: { ikonica: ReceiptText, boja: "text-[var(--mp-vrsta-racun)]", meko: "bg-[var(--mp-vrsta-racun-meko)]" },
  order: { ikonica: ConciergeBell, boja: "text-[var(--mp-vrsta-porudzbina)]", meko: "bg-[var(--mp-vrsta-porudzbina-meko)]" },
  reservation: {
    ikonica: CalendarClock,
    boja: "text-[var(--mp-vrsta-rezervacija)]",
    meko: "bg-[var(--mp-vrsta-rezervacija-meko)]",
  },
};

const STATUS_IKONICA: Record<MenuRequestStatus, LucideIcon> = {
  new: CircleDot,
  accepted: Hand,
  done: CircleCheck,
  cancelled: CircleSlash,
};

/** The kind's icon in its soft circle (decorative: the word stands next to it). */
export function VrstaIkonica({ vrsta, velika = false }: { vrsta: VrstaKljuc; velika?: boolean }) {
  const v = VRSTA[vrsta];
  const Ikonica = v.ikonica;
  return (
    <span
      aria-hidden="true"
      data-vrsta={vrsta}
      className={cn("grid shrink-0 place-items-center rounded-full", v.meko, velika ? "size-16" : "size-12")}
    >
      <Ikonica strokeWidth={2} className={cn(v.boja, velika ? "size-8" : "size-6")} />
    </span>
  );
}

/** "Poziv konobara", "Račun · Kartica", "Porudžbina · 3 stavke" (Room service named too). */
export function vrstaNaslov(zahtev: Pick<KonobarZahtev, "kind" | "paymentPreference" | "itemCount" | "channel">): string {
  const ime = d.requestKinds[zahtev.kind];
  if (zahtev.kind === "bill" && zahtev.paymentPreference) return `${ime} · ${d.paymentPreferences[zahtev.paymentPreference]}`;
  if (zahtev.kind === "order") {
    const delovi: string[] = [zahtev.channel === "room_service" ? t.detalj.roomService : ime];
    if (zahtev.itemCount !== null) delovi.push(fmt(t.red.stavke[srPluralCategory(zahtev.itemCount)], { n: zahtev.itemCount }));
    return delovi.join(" · ");
  }
  return ime;
}

/** "Sto 12 · Terasa" (the zone only when the venue has zones). */
export function mestoTekst(zahtev: Pick<KonobarZahtev, "positionLabel" | "zoneName">): string {
  return zahtev.zoneName ? `${zahtev.positionLabel} · ${zahtev.zoneName}` : zahtev.positionLabel;
}

/** The status in words with its icon; a taken request also names who has it ("Prihvaćen · Ana"). */
export function StatusZahteva({
  zahtev,
  velicina = "standardna",
}: {
  zahtev: Pick<KonobarZahtev, "status" | "acceptedBy">;
  velicina?: "standardna" | "mala";
}) {
  const ko =
    zahtev.status === "accepted" && zahtev.acceptedBy
      ? zahtev.acceptedBy.isMe
        ? t.red.preuzetoVi
        : zahtev.acceptedBy.name
      : null;
  return (
    <StatusOznaka
      ton={REQUEST_STATUS_TONE[zahtev.status]}
      ikonica={STATUS_IKONICA[zahtev.status]}
      velicina={velicina}
      className="text-sm font-bold"
    >
      {ko ? `${d.requestStatuses[zahtev.status]} · ${ko}` : d.requestStatuses[zahtev.status]}
    </StatusOznaka>
  );
}
