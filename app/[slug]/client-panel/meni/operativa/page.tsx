import type { Metadata } from "next";
import { OperativaRuta } from "@/components/menu/panel/operativa/operativa-ruta";
import { menuPanelSr } from "@/lib/i18n/sr/menu-panel";
import { menuNaslov } from "@/lib/menu-naslovi";

// Section "operativa" of the ScanMe Menu client panel (K27; master §13.5): the
// read-only overview of the active requests, the staff on shift and today's
// reservations. The shell (layout) checks sign-in and role (Owner and Manager).
export const metadata: Metadata = {
  title: menuNaslov(menuPanelSr.sekcije.operativa),
};

export default function MenuPanelOperativaPage() {
  return <OperativaRuta />;
}
