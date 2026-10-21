import type { Metadata } from "next";
import { AnalitikaRuta } from "@/components/menu/panel/analitika/analitika-ruta";
import { menuPanelSr } from "@/lib/i18n/sr/menu-panel";
import { menuNaslov } from "@/lib/menu-naslovi";

// Section "Analitika" of the ScanMe Menu client panel (K30; master §14): how
// guests used the menu, every number with what it counts
// (docs/menu/ANALITIKA-DEFINICIJE.md). The shell (layout) checks sign-in and
// role (analytics.read).
export const metadata: Metadata = {
  title: menuNaslov(menuPanelSr.sekcije.analitika),
};

export default function MenuPanelAnalitikaPage() {
  return <AnalitikaRuta />;
}
