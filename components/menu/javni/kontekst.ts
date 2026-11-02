// ScanMe Menu V1 (K14) — what the guest chose that every price and every
// article row must reflect: the marked allergens (a warning on the row and in
// the detail, master §7.3) and the EUR rate when the guest switched to EUR
// (a second, approximate line under the RSD price, §5.3). One context instead
// of threading two props through three layouts. Outside JavniMeni (the
// editor preview, the render tests of single parts) the defaults apply:
// nothing marked, RSD only.

import { createContext, useContext } from "react";
import { upozorenjeArtikla, type UpozorenjeAlergena } from "@/lib/menu/allergen-warnings";
import type { MenuAllergenCode } from "@/lib/menu/allergens";
import type { PublicArticle } from "@/lib/menu/snapshot";

export type JavniIzbor = {
  alergeniUkljuceni: boolean;
  oznaceniAlergeni: readonly MenuAllergenCode[];
  /** RSD for 1 EUR while the guest shows EUR; null = RSD only. */
  eurKurs: number | null;
  /** The date of that rate ("YYYY-MM-DD"), for the note beside EUR prices. */
  eurDatum: string | null;
};

export const JAVNI_IZBOR_PODRAZUMEVANO: JavniIzbor = { alergeniUkljuceni: false, oznaceniAlergeni: [], eurKurs: null, eurDatum: null };

export const JavniIzborKontekst = createContext<JavniIzbor>(JAVNI_IZBOR_PODRAZUMEVANO);

export function useJavniIzbor(): JavniIzbor {
  return useContext(JavniIzborKontekst);
}

/** The warning an article carries for the guest's marked allergens (null = none to show). */
export function useUpozorenje(article: Pick<PublicArticle, "allergens">): UpozorenjeAlergena | null {
  const izbor = useJavniIzbor();
  return upozorenjeArtikla(article, izbor.oznaceniAlergeni, izbor.alergeniUkljuceni);
}
