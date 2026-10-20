import type { Metadata } from "next";
import { LokalRuta } from "@/components/menu/lokal/lokal-ruta";
import { fmt } from "@/lib/i18n/format";
import { menuPanelSr } from "@/lib/i18n/sr/menu-panel";
import { LOKAL_POGLEDI, pickParam } from "@/lib/menu/izlog-params";

// Section "Lokal i QR" of the ScanMe Menu client panel (K20; master §9,
// §13.6): positions, optional zones, the floor layout and the Menu QR cards.
// The shell (layout) checks sign-in and role; `?pogled=lista|raspored|kartice`
// opens a view.
export const metadata: Metadata = {
  title: fmt(menuPanelSr.meta.naslov, { sekcija: menuPanelSr.sekcije.lokal }),
};

export default async function MenuPanelLokalPage({
  params,
  searchParams,
}: PageProps<"/[slug]/client-panel/meni/lokal">) {
  const { slug } = await params;
  const query = await searchParams;
  return <LokalRuta slug={slug} pocetniPogled={pickParam(query.pogled, LOKAL_POGLEDI, "lista")} />;
}
