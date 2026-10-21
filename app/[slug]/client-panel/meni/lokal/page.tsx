import type { Metadata } from "next";
import { LokalRuta } from "@/components/menu/lokal/lokal-ruta";
import { PodaciLokalaRuta } from "@/components/menu/panel/lokal/podaci-lokala";
import { menuPanelSr } from "@/lib/i18n/sr/menu-panel";
import { LOKAL_POGLEDI, pickParam } from "@/lib/menu/izlog-params";
import { menuNaslov } from "@/lib/menu-naslovi";

// Section "Lokal i QR" of the ScanMe Menu client panel (K20; master §9,
// §13.6): positions, optional zones, the floor layout and the Menu QR cards.
// The shell (layout) checks sign-in and role; `?pogled=lista|raspored|kartice`
// opens a view. K27 adds the card "Podaci o lokalu za Menu" (name and public
// link) above the screen through its `podaciLokala` slot.
export const metadata: Metadata = {
  title: menuNaslov(menuPanelSr.sekcije.lokal),
};

export default async function MenuPanelLokalPage({
  params,
  searchParams,
}: PageProps<"/[slug]/client-panel/meni/lokal">) {
  const { slug } = await params;
  const query = await searchParams;
  return (
    <LokalRuta
      slug={slug}
      pocetniPogled={pickParam(query.pogled, LOKAL_POGLEDI, "lista")}
      podaciLokala={<PodaciLokalaRuta slug={slug} />}
    />
  );
}
