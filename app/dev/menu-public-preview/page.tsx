// Dev-only public Menu preview (TASK-52 browser QA): mounts the REAL
// MenuPublicView with fixture data so the five shapes, the sticky scroll-spy nav
// (jump, not filter) and the single-open caret accordion can be exercised at
// 375px without a published menu or a Convex round-trip. The published read path
// itself is proven by convex/menu.test.ts. Unavailable in production, mirroring
// app/dev/menu-editor-preview.
//
//   /dev/menu-public-preview        → the fixture menu (default design)
//   ?state=long                     → adds a >VISIBLE_COUNT group to test the caret
//   ?design=dark                    → dark token variant (the venue palette)
//   ?tema=svetla|tamna              → forces the app theme while open (K07); the
//                                     public menu itself keeps the venue palette (P13)

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { itemDefaults, type MenuGroup } from "@/lib/menu-blocks";
import {
  DARK_MENU_DESIGN,
  fixtureView,
} from "@/components/menu/menu-fixtures";
import { MenuPublicView } from "@/components/menu/menu-public-view";
import { IzlogTema } from "@/components/menu/zajednicko/izlog-tema";
import { menuZajednickoSr } from "@/lib/i18n/sr/menu-zajednicko";
import { parsePublicPreview } from "@/lib/menu/izlog-params";

export const metadata: Metadata = {
  title: menuZajednickoSr.izlog.naslovi.javni,
  robots: { index: false, follow: false },
};

// A group past VISIBLE_COUNT so the caret accordion has something to reveal.
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
  const base = fixtureView(
    params.darkDesign ? { design: DARK_MENU_DESIGN } : {},
  );
  const view =
    params.long
      ? { ...base, groups: [...base.groups, longGroup()] }
      : base;

  return (
    <>
      <IzlogTema tema={params.tema} />
      <MenuPublicView view={view} slug="kafana-kod-mike" />
    </>
  );
}
