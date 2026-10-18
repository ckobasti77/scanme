"use client";

// ScanMe Menu V1 (K13, plan K12-3) — the public page with its live layer. An
// open phone subscribes only to `menuPublic.live` (the version number and the
// unavailable articles), never to the whole page: "Privremeno nedostupno"
// arrives at once, and a new publication is offered with a calm note instead
// of moving the menu under the guest's thumb. `null` (the menu was taken
// down) replaces the content with an honest state, never the stale menu.

import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { JavniMeni, type JavniMeniProps } from "./javni-meni";
import { JavniOkvir } from "./okvir";
import { MeniNijeDostupan, NovaVerzija } from "./stanja";

export type JavnoUzivo = { versionNumber: number; unavailableKeys: string[] };

export function JavniMeniUzivo({
  pocetno,
  ...props
}: Omit<JavniMeniProps, "nedostupni" | "dodatak"> & { pocetno: JavnoUzivo }) {
  const router = useRouter();
  const live = useQuery(api.menuPublic.live, { slug: props.view.lokal.slug });
  if (live === null) {
    return (
      <JavniOkvir izgled={props.izgled} lokal={props.view.lokal} naslovStranice={null} jezik={props.view.jezik}>
        <MeniNijeDostupan />
      </JavniOkvir>
    );
  }
  const trenutno = live ?? pocetno;
  const novija = live !== undefined && live.versionNumber > pocetno.versionNumber;
  return (
    <JavniMeni
      {...props}
      nedostupni={trenutno.unavailableKeys}
      dodatak={novija ? <NovaVerzija onPrikazi={() => router.refresh()} /> : null}
    />
  );
}
