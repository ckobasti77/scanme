// Dev-only izlog of the ScanMe Menu client panel. Mounts the real shell (K08)
// with an invented venue; sections whose screens later steps build show their
// honest "what will be here" state. Unavailable in production, never indexed.
// Parameters: lib/menu/izlog-params.ts.
//
//   /dev/menu-panel-preview                     → Početna in the shell
//   ?sekcija=pocetna|editor|operativa|lokal|funkcionalnosti|tim|analitika|podesavanja
//   ?uloga=vlasnik|menadzer|urednik|osoblje|admin  → what that role sees (osoblje: no panel)
//   ?plan=standard|premium                      → Premium lines and the Premium badge
//   ?stanje=ucitava|prijava|neaktivno|bez-pristupa → whole-screen states of the shell
//   ?sekcija=primitivi[&fioka=otvorena]         → every primitive in every state (K07)
//   ?tema=svetla|tamna                          → forces the app theme while open

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { IzlogOkvir } from "@/components/menu/izlog/izlog-okvir";
import { PanelIzlog } from "@/components/menu/izlog/panel-izlog";
import { PrimitiviPregled } from "@/components/menu/izlog/primitivi-pregled";
import { IzlogTema } from "@/components/menu/zajednicko/izlog-tema";
import { menuZajednickoSr } from "@/lib/i18n/sr/menu-zajednicko";
import { parsePanelPreview } from "@/lib/menu/izlog-params";

export const dynamic = "force-dynamic";

const t = menuZajednickoSr.izlog;

export const metadata: Metadata = { title: t.naslovi.panel, robots: { index: false, follow: false } };

export default async function MenuPanelPreviewPage({ searchParams }: PageProps<"/dev/menu-panel-preview">) {
  if (process.env.NODE_ENV === "production") notFound();

  const params = parsePanelPreview(await searchParams);

  return (
    <>
      <IzlogTema tema={params.tema} />
      {params.sekcija === "primitivi" ? (
        <IzlogOkvir ruta="panel" tema={params.tema}>
          <PrimitiviPregled fiokaOtvorena={params.fiokaOtvorena} />
        </IzlogOkvir>
      ) : (
        <IzlogOkvir ruta="panel" tema={params.tema} ceoEkran>
          <PanelIzlog params={{ ...params, sekcija: params.sekcija }} />
        </IzlogOkvir>
      )}
    </>
  );
}
