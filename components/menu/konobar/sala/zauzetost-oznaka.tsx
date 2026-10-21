// ScanMe Menu V1 (K23) — how a table's occupancy looks, ONLY when the venue
// uses the optional module (master §9.4): icon + colour + word, like every
// state of the panel. Free is an empty chair, occupied people, reserved a
// bookmark (not the reservation request's calendar), out of service a ban
// sign. Neutral (no module, or nobody marked the table) has no mark at all
// on the floor and a dash in the table view — never "Slobodan".

import { Armchair, Ban, BookmarkCheck, Users, type LucideIcon } from "lucide-react";
import { menuKonobarSr } from "@/lib/i18n/sr/menu-konobar";
import type { OccupancyState } from "@/lib/menu/occupancy";
import { cn } from "@/lib/utils";

const t = menuKonobarSr;

export const ZAUZETOST: Record<OccupancyState, { ikonica: LucideIcon; boja: string; meko: string; ivica: string }> = {
  free: {
    ikonica: Armchair,
    boja: "text-[var(--mp-uspeh)]",
    meko: "bg-[var(--mp-uspeh-meko)]",
    ivica: "[--border:var(--mp-uspeh-ivica)]",
  },
  occupied: {
    ikonica: Users,
    boja: "text-[var(--mp-tekst)]",
    meko: "bg-[color-mix(in_oklab,var(--mp-mastilo)_16%,var(--mp-povrsina))]",
    ivica: "[--border:var(--mp-mastilo)]",
  },
  reserved: {
    ikonica: BookmarkCheck,
    boja: "text-[var(--mp-upozorenje)]",
    meko: "bg-[var(--mp-upozorenje-meko)]",
    ivica: "[--border:var(--mp-upozorenje-ivica)]",
  },
  out_of_service: {
    ikonica: Ban,
    boja: "text-[var(--mp-tekst-sporedni)]",
    meko: "bg-[var(--mp-povrsina-utisana)]",
    ivica: "[--border:var(--mp-ivica)]",
  },
};

/** The state in words with its icon (the table view, the table detail, the legend). */
export function ZauzetostOznaka({
  stanje,
  samoIkonica = false,
  className,
}: {
  stanje: OccupancyState;
  /** A floor tile: the icon only (the word is in the table's name and in the legend). */
  samoIkonica?: boolean;
  className?: string;
}) {
  const z = ZAUZETOST[stanje];
  const Ikonica = z.ikonica;
  if (samoIkonica) {
    return (
      <span
        aria-hidden="true"
        data-zauzetost={stanje}
        className={cn("grid size-6 place-items-center rounded-full border-2 bg-[var(--mp-povrsina)] shadow-[var(--mp-senka-xs)]", z.ivica, className)}
      >
        <Ikonica strokeWidth={2.25} className={cn("size-3.5", z.boja)} />
      </span>
    );
  }
  return (
    <span
      data-zauzetost={stanje}
      className={cn(
        "inline-flex min-h-7 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-sm font-bold text-[var(--mp-tekst)]",
        z.meko,
        z.ivica,
        className,
      )}
    >
      <Ikonica aria-hidden="true" strokeWidth={2.25} className={cn("size-4 shrink-0", z.boja)} />
      {t.zauzetost[stanje]}
    </span>
  );
}
