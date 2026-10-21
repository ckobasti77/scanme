import type { Metadata } from "next";
import { PocetnaRuta } from "@/components/menu/panel/pocetna/pocetna-ruta";
import { menuPanelSr } from "@/lib/i18n/sr/menu-panel";
import { menuNaslov } from "@/lib/menu-naslovi";

// Section "pocetna" of the ScanMe Menu client panel (K27): what needs attention,
// what is happening now and the menu status. The shell checks the role; the
// route holds the one subscription.
export const metadata: Metadata = {
  title: menuNaslov(menuPanelSr.sekcije.pocetna),
};

export default function MenuPanelPocetnaPage() {
  return <PocetnaRuta />;
}
