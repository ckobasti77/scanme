"use client";

// ScanMe Menu V1 (K30) — Analitika in the izlog: the real screen
// (components/menu/panel/analitika/analitika.tsx) over invented numbers of
// "Demo restoran" (components/menu/fixtures/analitika.ts) on the izlog day
// (IZLOG_DANAS). The period, the trend metric and the breakdown work; a new
// choice is computed from the fixtures at once. `stanje=malo-podataka|prazno|bez-sesija`
// picks the data state. Nothing is sent anywhere.

import { useState } from "react";
import { fixtureIzvestaj, fixtureRaspodela, IZLOG_DANAS, type AnalitikaFixtureStanje } from "@/components/menu/fixtures/analitika";
import type { MenuTier } from "@/lib/menu/capabilities";
import type { PanelAnalitikaStanje } from "@/lib/menu/izlog-params";
import { periodIzbora, type IzborPerioda, type MetrikaTrenda } from "@/lib/menu/analitika/prikaz";
import { AnalitikaEkran } from "../panel/analitika/analitika";
import type { IzborRaspodele } from "../panel/analitika/raspodela";

export function AnalitikaIzlog({
  plan,
  stanje,
  paketHref,
}: {
  plan: MenuTier;
  stanje: PanelAnalitikaStanje | null;
  paketHref: string | null;
}) {
  const [izbor, setIzbor] = useState<IzborPerioda>({ vrsta: "d30" });
  const [trend, setTrend] = useState<MetrikaTrenda>("otvaranja");
  const [raspodela, setRaspodela] = useState<IzborRaspodele>(
    plan === "premium" ? { metrika: "otvaranja", dimenzija: "jezik" } : { metrika: "otvaranja", dimenzija: null },
  );
  const premium = plan === "premium";
  const fixtureStanje: AnalitikaFixtureStanje = stanje ?? "puno";
  const period = periodIzbora(izbor, IZLOG_DANAS);
  const izvestaj = fixtureIzvestaj({ period, stanje: fixtureStanje, premium });
  const raspodelaPodaci =
    premium && raspodela.dimenzija
      ? fixtureRaspodela({ period, stanje: fixtureStanje, metrika: raspodela.metrika, dimenzija: raspodela.dimenzija })
      : undefined;

  return (
    <AnalitikaEkran
      plan={plan}
      danas={IZLOG_DANAS}
      izbor={izbor}
      onIzbor={setIzbor}
      izvestaj={izvestaj}
      trend={trend}
      onTrend={setTrend}
      raspodela={raspodela}
      onRaspodela={setRaspodela}
      raspodelaPodaci={raspodelaPodaci}
      slug="demo-restoran"
      paketHref={paketHref}
    />
  );
}
