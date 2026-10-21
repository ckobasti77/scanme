// /[slug]/client-panel/meni/poziv/[token] — accepting an invitation into the
// Menu team (K28). The link carries a secret: no indexing, no referrer.

import type { Metadata } from "next";
import { PrihvatanjeRuta } from "@/components/menu/panel/poziv/prihvatanje-ruta";
import { menuPanelSr } from "@/lib/i18n/sr/menu-panel";

export const metadata: Metadata = {
  title: menuPanelSr.poziv.naslov,
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function PozivPage({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  return <PrihvatanjeRuta slug={slug} token={token} />;
}
