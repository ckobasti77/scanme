// ScanMe Menu V1 (K13, plan K12 §2.1) — the server loader of the public menu.
// Three reads in parallel, all of the PUBLISHED version only (convex/menuPublic.ts):
// the page (or the splitter), the live layer and the page images; K14 adds the
// latest EUR rate (convex/menuFx.ts), used when the venue shows the EUR switch. The clock
// is read here, not in a render (K12-12), and the venue's tokens are computed
// here, so the colour library never reaches the guest's phone (K12-4).
// cache() shares one load between generateMetadata, generateViewport and the page.
// SSR on every request, no Next data cache (plan K12-2: Cache Components is off).

import { cache } from "react";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { javniIzgled, type JavniIzgled } from "@/lib/menu/identity/public-tokens";
import type { MenuKurs } from "@/lib/menu/currency";
import {
  mogucnostiIzPrezentacije,
  type JavniRazdelnikView,
  type JavnaStranicaView,
  type PublicImage,
} from "@/lib/menu/public-view";
import type { JavnoUzivo } from "@/components/menu/javni/javni-meni-uzivo";

export type JavnoUcitano =
  | {
      vrsta: "stranica";
      view: JavnaStranicaView;
      izgled: JavniIzgled;
      slike: Record<string, PublicImage>;
      uzivo: JavnoUzivo;
      sadaMs: number;
      /** K14: the latest EUR rate, only when the venue shows the EUR switch; the renderer checks freshness. */
      kurs: MenuKurs | null;
    }
  | { vrsta: "razdelnik"; view: JavniRazdelnikView; izgled: JavniIzgled };

/** One value of a search parameter (the first, when repeated). */
export function jedanParametar(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export const ucitajJavno = cache(
  async (slug: string, pageSlug: string | undefined, jezik: string | undefined): Promise<JavnoUcitano | null> => {
    const args = { slug, ...(pageSlug !== undefined ? { pageSlug } : {}), ...(jezik ? { lang: jezik } : {}) };
    const [page, live, slike, poslednjiKurs] = await Promise.all([
      fetchQuery(api.menuPublic.page, args),
      fetchQuery(api.menuPublic.live, { slug }),
      fetchQuery(api.menuPublic.pageMedia, args),
      fetchQuery(api.menuFx.current, {}),
    ]);
    if (!page || !live) return null;
    // K14: the rate (one indexed read, in parallel rather than after the page) is used
    // only by a venue that shows the EUR switch.
    const kurs = page.presentation.currencyToggle ? poslednjiKurs : null;
    const izgled = javniIzgled(page.presentation);
    const lokal = { naziv: page.business.name, slug: page.business.slug, logoUrl: page.logoUrl };
    if (page.kind === "splitter") {
      return {
        vrsta: "razdelnik",
        view: { lokal, stranice: page.pages, jezik: page.lang, jezici: page.languages },
        izgled,
      };
    }
    return {
      vrsta: "stranica",
      view: {
        lokal,
        stranica: page.page,
        stranice: page.pages,
        sekcije: page.sections,
        jezik: page.lang,
        jezici: page.languages,
        alergeniUkljuceni: page.allergensEnabled,
        mogucnosti: mogucnostiIzPrezentacije(page.presentation),
      },
      izgled,
      slike,
      uzivo: { versionNumber: live.versionNumber, unavailableKeys: live.unavailableKeys },
      sadaMs: Date.now(),
      kurs,
    };
  },
);

/** Which path serves the venue when a sub-link has no public page: new, legacy, or none. */
export const ulazJavno = cache(async (slug: string) => fetchQuery(api.menuPublic.entry, { slug }));
