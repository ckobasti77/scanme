// /[slug]/client-panel/meni — the ScanMe Menu client panel (K08, master §13).
// The layout mounts the shell once for all eight sections; each section is a
// page below it. Signing in stays in the existing client panel
// (/[slug]/client-panel); this route never shows a login form of its own.

import type { Metadata } from "next";
import { MenuPanelRuta } from "@/components/menu/panel/ruta";
import { menuPanelSr } from "@/lib/i18n/sr/menu-panel";

export const metadata: Metadata = {
  title: menuPanelSr.meta.naslovPanela,
  robots: { index: false, follow: false },
};

export default async function MenuPanelLayout({ children, params }: LayoutProps<"/[slug]/client-panel/meni">) {
  const { slug } = await params;
  return <MenuPanelRuta slug={slug}>{children}</MenuPanelRuta>;
}
