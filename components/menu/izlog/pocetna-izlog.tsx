// ScanMe Menu V1 — Početna of the client panel in the izlog (K27): the real
// screen over invented data (fixtures/pocetna.ts). The links come from the
// caller, so they stay inside the izlog route. K30: the card "Poslednjih 7 dana"
// shows the invented analytics of the same venue (fixtures/analitika.ts).

import { fixtureIzvestaj, IZLOG_DANAS } from "@/components/menu/fixtures/analitika";
import { fixturePocetnaInput } from "@/components/menu/fixtures/pocetna";
import { IZLOG_SADA } from "@/components/menu/fixtures/lokal";
import { poslednjihDana } from "@/lib/menu/analitika/period";
import type { MenuTier } from "@/lib/menu/capabilities";
import type { PanelAnalitikaStanje } from "@/lib/menu/izlog-params";
import { homeSummary } from "@/lib/menu/home-summary";
import type { MenuActor } from "@/lib/menu/permissions";
import { Pocetna, type PocetnaHrefs } from "../panel/pocetna/pocetna";

export function PocetnaIzlog({
  actor,
  plan,
  sadrzaj,
  analitika = null,
  hrefs,
}: {
  actor: MenuActor;
  plan: MenuTier;
  sadrzaj: "paznja" | "mirno";
  /** K30 `stanje=malo-podataka|prazno|bez-sesija`; null = enough data. */
  analitika?: PanelAnalitikaStanje | null;
  hrefs: PocetnaHrefs;
}) {
  return (
    <Pocetna
      summary={homeSummary(fixturePocetnaInput({ sadrzaj, plan, actor }))}
      actor={actor}
      nowMs={IZLOG_SADA}
      hrefs={hrefs}
      analitika={fixtureIzvestaj({ period: poslednjihDana(IZLOG_DANAS, 7), stanje: analitika ?? "puno", premium: false })}
    />
  );
}
