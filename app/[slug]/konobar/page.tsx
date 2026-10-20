// /[slug]/konobar — how staff gets into the waiter panel (K08). The panel
// itself is /[slug]/konobar/[kod] (K22) behind a code that is never shown
// here; the client panel links staff to this page instead of a dead end.

import type { Metadata } from "next";
import { KonobarUlaz } from "@/components/menu/konobar/ulaz";
import { menuPanelSr } from "@/lib/i18n/sr/menu-panel";
import { klijentskiPanelHref } from "@/lib/menu/panel-nav";

export const metadata: Metadata = {
  title: menuPanelSr.konobar.naslov,
  robots: { index: false, follow: false },
};

export default async function KonobarUlazPage({ params }: PageProps<"/[slug]/konobar">) {
  const { slug } = await params;
  return <KonobarUlaz klijentskiPanelHref={klijentskiPanelHref(slug)} />;
}
