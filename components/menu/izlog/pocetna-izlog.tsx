// ScanMe Menu V1 — Početna of the client panel in the izlog (K27): the real
// screen over invented data (fixtures/pocetna.ts). The links come from the
// caller, so they stay inside the izlog route.

import { fixturePocetnaInput } from "@/components/menu/fixtures/pocetna";
import { IZLOG_SADA } from "@/components/menu/fixtures/lokal";
import type { MenuTier } from "@/lib/menu/capabilities";
import { homeSummary } from "@/lib/menu/home-summary";
import type { MenuActor } from "@/lib/menu/permissions";
import { Pocetna, type PocetnaHrefs } from "../panel/pocetna/pocetna";

export function PocetnaIzlog({
  actor,
  plan,
  sadrzaj,
  hrefs,
}: {
  actor: MenuActor;
  plan: MenuTier;
  sadrzaj: "paznja" | "mirno";
  hrefs: PocetnaHrefs;
}) {
  return (
    <Pocetna
      summary={homeSummary(fixturePocetnaInput({ sadrzaj, plan, actor }))}
      actor={actor}
      nowMs={IZLOG_SADA}
      hrefs={hrefs}
    />
  );
}
