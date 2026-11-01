import type { Metadata } from "next";
import { TimRuta } from "@/components/menu/panel/tim/tim-ruta";
import { menuPanelSr } from "@/lib/i18n/sr/menu-panel";
import { menuNaslov } from "@/lib/menu-naslovi";

// Section "Tim i pristupi" of the ScanMe Menu client panel (K28; master §10.6):
// team members and their roles, invitations, staff PINs and the waiter-panel
// link. The shell (layout) checks sign-in and role (team.manage).
export const metadata: Metadata = {
  title: menuNaslov(menuPanelSr.sekcije.tim),
};

export default function MenuPanelTimPage() {
  return <TimRuta />;
}
