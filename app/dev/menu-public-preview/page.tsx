// Dev-only public Menu preview. Unavailable in production, noindex.
//
// K13: mounts the REAL new renderer (components/menu/javni) over the three
// fixture venues, compiled through the real publish path, with no Convex.
//   ?primer=kafic|restoran|prestizni   the venue (identity + content), restoran by default
//   ?layout=tok|kategorije|kompaktno   ?mediji=slika|ikonica|bez   ?paleta=<id>
//   ?stanje=razdelnik|veliki|prazno     ?stranica=<slug>   ?kategorija=<n>   ?detalj=1
//   ?design=dark  = paleta=ponoc        ?state=long = stanje=veliki (existing)
//   ?renderer=stari                    the legacy renderer with its fixture (TASK-52 QA)
//   ?tema=svetla|tamna                 the app theme only; the menu keeps the venue palette (P13)

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { itemDefaults, type MenuGroup } from "@/lib/menu-blocks";
import { DARK_MENU_DESIGN, fixtureView } from "@/components/menu/menu-fixtures";
import { MenuPublicView } from "@/components/menu/menu-public-view";
import { JavniIzlog } from "@/components/menu/izlog/javni-izlog";
import { IzlogTema } from "@/components/menu/zajednicko/izlog-tema";
import { menuZajednickoSr } from "@/lib/i18n/sr/menu-zajednicko";
import { parsePublicPreview } from "@/lib/menu/izlog-params";

export const metadata: Metadata = {
  title: menuZajednickoSr.izlog.naslovi.javni,
  robots: { index: false, follow: false },
};

// A group past VISIBLE_COUNT so the legacy caret accordion has something to reveal.
function longGroup(): MenuGroup {
  return {
    shape: "lista",
    base: { id: "g-duga", title: "Duga lista", iconKey: "sok" },
    items: Array.from({ length: 14 }, (_, i) => ({
      ...itemDefaults(),
      id: `i-duga-${i}`,
      name: `Stavka ${i + 1}`,
      productType: "sok",
      priceRsd: 100 + i * 10,
    })),
  };
}

export default async function MenuPublicPreviewPage({
  searchParams,
}: PageProps<"/dev/menu-public-preview">) {
  if (process.env.NODE_ENV === "production") notFound();

  const params = parsePublicPreview(await searchParams);
  if (params.stariRenderer) {
    const base = fixtureView(params.darkDesign ? { design: DARK_MENU_DESIGN } : {});
    const view = params.long ? { ...base, groups: [...base.groups, longGroup()] } : base;
    return (
      <>
        <IzlogTema tema={params.tema} />
        <MenuPublicView view={view} slug="kafana-kod-mike" />
      </>
    );
  }

  return (
    <>
      <IzlogTema tema={params.tema} />
      <JavniIzlog params={params} />
    </>
  );
}
