// /[slug]/client-panel/meni/editor — "Editor" opens the real menu directly
// (master §13.4: no intro screen, no wizard). The panel layout has already
// checked sign-in and role; the editor itself reads and writes through Convex
// (components/menu/studio). `?stranica=<key>` opens a given page, `?artikal=<key>`
// the detail of an article (K15).

import type { Metadata } from "next";
import { StudioRuta } from "@/components/menu/studio/studio-ruta";
import { menuStudioSr } from "@/lib/i18n/sr/menu-studio";
import { firstParam } from "@/lib/menu/izlog-params";

export const metadata: Metadata = {
  title: menuStudioSr.meta.naslov,
};

export default async function MenuPanelEditorPage({
  params,
  searchParams,
}: PageProps<"/[slug]/client-panel/meni/editor">) {
  const { slug } = await params;
  const query = await searchParams;
  const stranica = firstParam(query.stranica) ?? null;
  const artikal = firstParam(query.artikal) ?? null;
  return <StudioRuta slug={slug} pocetnaStranica={stranica} pocetniArtikal={artikal} />;
}
