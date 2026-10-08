import Image from "next/image";
import { Bike, CarFront, CircleHelp, Landmark, LayoutGrid, LocateFixed, Shapes, UtensilsCrossed, Zap, type LucideIcon } from "lucide-react";
import type { FairMapDirectoryKey, FairMapFilter } from "@/lib/fair-map";
import { fairMapLogo } from "@/lib/fair-map";
import { fairMapSr as dict } from "@/lib/i18n/sr/fair-map";
import styles from "./fair-event-map.module.css";

// N4 — an exhibitor's logo in the list, the search results and the sheet: a
// fixed box (no layout jump), the small WebP copy, lazy below the fold.
export function FairMapLogoBox({ logoUrl, name, size = "md" }: { logoUrl?: string; name: string; size?: "sm" | "md" | "lg" }) {
  const logo = fairMapLogo(logoUrl);
  return (
    <span className={styles.logoBox} data-size={size}>
      {logo ? (
        <Image src={logo.src} alt={name} fill unoptimized sizes="96px" loading="lazy" className={styles.logoImage} />
      ) : (
        <span className={styles.logoInitial} aria-hidden="true">
          {name.trim().charAt(0).toLocaleUpperCase("sr")}
        </span>
      )}
    </span>
  );
}

export const FAIR_MAP_CATEGORY_ICONS: Record<FairMapFilter | FairMapDirectoryKey, LucideIcon> = {
  sve: LayoutGrid,
  automobili: CarFront,
  moto: Bike,
  energija: Zap,
  usluge: Landmark,
  hrana: UtensilsCrossed,
  ostalo: Shapes,
  scanme: LocateFixed,
  "bez-kategorije": CircleHelp,
};

export function fairMapCategoryLabel(key: FairMapFilter | FairMapDirectoryKey) {
  if (key === "sve") return dict.filterAll;
  if (key === "bez-kategorije") return dict.uncategorized;
  return dict.categories[key];
}
