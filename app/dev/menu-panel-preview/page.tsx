// Dev-only izlog of the ScanMe Menu client panel (K07). Mounts the real panel
// primitives with invented data; every section a later step builds shows an
// honest "this screen is built by step K.." state instead of a fake screen.
// Unavailable in production, never indexed. Parameters: lib/menu/izlog-params.ts.
//
//   /dev/menu-panel-preview                     → Početna (K27) and links to every section
//   ?sekcija=primitivi[&fioka=otvorena]         → every primitive in every state (K07)
//   ?sekcija=pocetna|editor|operativa|lokal|funkcionalnosti|tim|analitika|podesavanja
//   ?tema=svetla|tamna                          → forces the app theme while open

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { IzlogKorak } from "@/components/menu/izlog/izlog-korak";
import { IzlogOkvir } from "@/components/menu/izlog/izlog-okvir";
import { PrimitiviPregled } from "@/components/menu/izlog/primitivi-pregled";
import { IzlogTema } from "@/components/menu/zajednicko/izlog-tema";
import { fmt } from "@/lib/i18n/format";
import { menuZajednickoSr } from "@/lib/i18n/sr/menu-zajednicko";
import { PANEL_SEKCIJA_KORAK, PANEL_SEKCIJE, izlogHref, parsePanelPreview } from "@/lib/menu/izlog-params";

export const dynamic = "force-dynamic";

const t = menuZajednickoSr.izlog;
const PUTANJA = "/dev/menu-panel-preview";

export const metadata: Metadata = { title: t.naslovi.panel, robots: { index: false, follow: false } };

export default async function MenuPanelPreviewPage({ searchParams }: PageProps<"/dev/menu-panel-preview">) {
  if (process.env.NODE_ENV === "production") notFound();

  const params = parsePanelPreview(await searchParams);

  return (
    <>
      <IzlogTema tema={params.tema} />
      <IzlogOkvir ruta="panel" tema={params.tema}>
        {params.sekcija === "primitivi" ? (
          <PrimitiviPregled fiokaOtvorena={params.fiokaOtvorena} />
        ) : (
          <IzlogKorak
            kontekst={t.naslovi.panel}
            naslov={t.panelSekcije[params.sekcija]}
            korak={PANEL_SEKCIJA_KORAK[params.sekcija].korak}
            napomena={fmt(t.panelOkvirKorak, { korak: "K08" })}
            ekrani={PANEL_SEKCIJE.map((sekcija) => ({
              href: izlogHref(PUTANJA, { sekcija, tema: params.tema }),
              oznaka: t.panelSekcije[sekcija],
              trenutni: sekcija === params.sekcija,
            }))}
          />
        )}
      </IzlogOkvir>
    </>
  );
}
