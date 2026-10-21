import type { Metadata } from "next";
import { FunkcionalnostiRuta } from "@/components/menu/panel/funkcionalnosti/funkcionalnosti-ruta";
import { fmt } from "@/lib/i18n/format";
import { menuPanelSr } from "@/lib/i18n/sr/menu-panel";

// Section "Funkcionalnosti" of the ScanMe Menu client panel (K27; master §13.7):
// the guest actions (call a waiter, bill request, ordering), reservations,
// table occupancy and Room service (Premium). The shell (layout) checks sign-in
// and role.
export const metadata: Metadata = {
  title: fmt(menuPanelSr.meta.naslov, { sekcija: menuPanelSr.sekcije.funkcionalnosti }),
};

export default function MenuPanelFunkcionalnostiPage() {
  return <FunkcionalnostiRuta />;
}
