import type { Metadata } from "next";
import { PocetnaRuta } from "@/components/menu/panel/pocetna/pocetna-ruta";
import { fmt } from "@/lib/i18n/format";
import { menuPanelSr } from "@/lib/i18n/sr/menu-panel";

// Section "pocetna" of the ScanMe Menu client panel (K27): what needs attention,
// what is happening now and the menu status. The shell checks the role; the
// route holds the one subscription.
export const metadata: Metadata = {
  title: fmt(menuPanelSr.meta.naslov, { sekcija: menuPanelSr.sekcije.pocetna }),
};

export default function MenuPanelPocetnaPage() {
  return <PocetnaRuta />;
}
