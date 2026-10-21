"use client";

// ScanMe Menu V1 (K27) — the route side of Početna: the ONE subscription of the
// screen (convex/menuPanel.ts `home`) and the clock. The query never reads the
// clock, so the device passes `fromMs` — the start of the current Belgrade hour
// minus 12 h, like the waiter panel — and the argument changes once an hour.
// "Late", "on shift now" and "today" are computed here from the timestamps
// (lib/menu/home-summary.ts), every second, so a request crosses the threshold
// on the screen without a new subscription. The screen itself is presentational
// (pocetna.tsx); the izlog mounts it over fixtures.

import { useConvexAuth, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { menuPanelSr } from "@/lib/i18n/sr/menu-panel";
import { homeSummary } from "@/lib/menu/home-summary";
import { konobarskiPanelUlazHref, panelSekcijaHref } from "@/lib/menu/panel-nav";
import { okvirOd } from "../../konobar/rezervacije/okvir-vremena";
import { useSat } from "../../konobar/use-sat";
import { GreskaStanje, UcitavanjeStanje } from "../../zajednicko/stanja";
import { usePanelKontekst } from "../ruta";
import { Pocetna, type PocetnaHrefs } from "./pocetna";

const t = menuPanelSr.pocetna;

export function PocetnaRuta() {
  const { slug, actor, menuServiceId } = usePanelKontekst();
  const { isLoading } = useConvexAuth();
  // The device clock: the server render and the first client render agree on this instant, then it ticks.
  const [pocetnoMs] = useState(() => Date.now());
  const nowMs = useSat(pocetnoMs);
  const fromMs = okvirOd(nowMs);
  const data = useQuery(api.menuPanel.home, isLoading ? "skip" : { menuServiceId, fromMs });

  if (data === undefined) return <UcitavanjeStanje oblik="kartice" oznaka={t.ucitavanje} />;
  if (data === null) return <GreskaStanje naslov={t.greskaNaslov} />;

  const hrefs: PocetnaHrefs = {
    editor: panelSekcijaHref(slug, "editor"),
    operativa: panelSekcijaHref(slug, "operativa"),
    lokal: panelSekcijaHref(slug, "lokal"),
    analitika: panelSekcijaHref(slug, "analitika"),
    podesavanja: panelSekcijaHref(slug, "podesavanja"),
    konobar: konobarskiPanelUlazHref(slug),
  };
  return <Pocetna summary={homeSummary({ nowMs, ...data })} actor={actor} nowMs={nowMs} hrefs={hrefs} />;
}
