"use client";

// ScanMe Menu V1 (K13, plan K12-3) — the public page with its live layer. An
// open phone subscribes only to `menuPublic.live` (the version number and the
// unavailable articles), never to the whole page: "Privremeno nedostupno"
// arrives at once, and a new publication is offered with a calm note instead
// of moving the menu under the guest's thumb. `null` (the menu was taken
// down) replaces the content with an honest state, never the stale menu.
//
// K21: a guest at a position (a scanned table or room card) also gets the
// guest's actions. They are a separate chunk (next/dynamic), rendered only
// when `gost` is present, so a plain menu link never loads them (K14 JS budget).

import dynamic from "next/dynamic";
import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import type { GostUcitano } from "../gost/ostrvo";
import { JavniMeni, type JavniDodajArgs, type JavniMeniProps } from "./javni-meni";
import { JavniOkvir } from "./okvir";
import { MeniNijeDostupan, NovaVerzija } from "./stanja";

const GostOstrvo = dynamic(() => import("../gost/ostrvo").then((modul) => modul.GostOstrvo));
const DodajUKorpu = dynamic(() => import("../gost/ostrvo").then((modul) => modul.DodajUKorpu));

export type JavnoUzivo = { versionNumber: number; unavailableKeys: string[] };

export function JavniMeniUzivo({
  uzivo,
  gost = null,
  ...props
}: Omit<JavniMeniProps, "nedostupni" | "dodatak" | "satUzivo" | "radnjeGosta" | "dodajUKorpu"> & {
  uzivo: JavnoUzivo;
  /** K21: the guest at a position; null = a plain link (no actions, nothing invented). */
  gost?: GostUcitano | null;
}) {
  const router = useRouter();
  const live = useQuery(api.menuPublic.live, { slug: props.view.lokal.slug });
  if (live === null) {
    return (
      <JavniOkvir izgled={props.izgled} lokal={props.view.lokal} naslovStranice={null} jezik={props.view.jezik}>
        <MeniNijeDostupan />
      </JavniOkvir>
    );
  }
  const trenutno = live ?? uzivo;
  const novija = live !== undefined && live.versionNumber > uzivo.versionNumber;
  const kontekst = gost?.kontekst;
  const poruciv = kontekst ? (kontekst.kanal === "room_service" ? kontekst.radnje.roomService : kontekst.radnje.order) : false;
  const dodajUKorpu =
    kontekst && poruciv
      ? ({ article, sadaMs, nedostupan, zatvori }: JavniDodajArgs): ReactNode => (
          <DodajUKorpu
            article={article}
            slug={kontekst.slug}
            kanal={kontekst.kanal}
            pageKey={kontekst.pageKey}
            sadaMs={sadaMs}
            nedostupan={nedostupan}
            cuvaj
            onDodato={zatvori}
          />
        )
      : undefined;
  return (
    <JavniMeni
      {...props}
      satUzivo
      nedostupni={trenutno.unavailableKeys}
      dodatak={novija ? <NovaVerzija onPrikazi={() => router.refresh()} /> : null}
      radnjeGosta={gost ? <GostOstrvo gost={gost} nedostupni={trenutno.unavailableKeys} /> : null}
      dodajUKorpu={dodajUKorpu}
    />
  );
}
