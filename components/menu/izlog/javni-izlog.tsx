// ScanMe Menu V1 (K13) — the public menu in the izlog (/dev/menu-public-preview):
// the REAL renderer (JavniMeni / JavniRazdelnik) over the fixture venues of
// components/menu/fixtures/javni.ts, with no Convex and no live subscription.
// A server component: the venue's tokens are computed here, as on the real route.

import { javniIzgled } from "@/lib/menu/identity/public-tokens";
import type { PublicPreviewParams } from "@/lib/menu/izlog-params";
import { javniIzlog } from "../fixtures/javni";
import { JavniMeni } from "../javni/javni-meni";
import { JavniRazdelnik } from "../javni/razdelnik";

export function JavniIzlog({ params }: { params: PublicPreviewParams }) {
  const prikaz = javniIzlog(params);
  if (prikaz.vrsta === "stari") return null;
  const izgled = javniIzgled(prikaz.presentation);
  if (prikaz.vrsta === "razdelnik") {
    return <JavniRazdelnik view={prikaz.view} izgled={izgled} naslovne={prikaz.naslovne} jezikLinkovi={prikaz.jezikLinkovi} />;
  }
  return (
    <JavniMeni
      view={prikaz.view}
      izgled={izgled}
      slike={prikaz.slike}
      sadaMs={prikaz.sadaMs}
      nedostupni={prikaz.nedostupni}
      pocetniDetalj={prikaz.pocetniDetalj}
      pocetnaKategorija={prikaz.pocetnaKategorija}
      kurs={prikaz.kurs}
      pocetno={prikaz.pocetno}
      jezikLinkovi={prikaz.jezikLinkovi}
      cuvaj={false}
    />
  );
}
