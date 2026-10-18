import type { Metadata } from "next";
import { PanelSekcija } from "@/components/menu/panel/ruta";
import { fmt } from "@/lib/i18n/format";
import { menuPanelSr } from "@/lib/i18n/sr/menu-panel";

// Section "lokal" of the ScanMe Menu client panel. Until its screen exists it
// shows an honest "this is what will be here" state (K08); the shell checks the role.
export const metadata: Metadata = {
  title: fmt(menuPanelSr.meta.naslov, { sekcija: menuPanelSr.sekcije.lokal }),
};

export default function MenuPanelLokalPage() {
  return <PanelSekcija sekcija="lokal" />;
}
