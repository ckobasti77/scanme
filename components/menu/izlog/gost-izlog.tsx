"use client";

// ScanMe Menu V1 (K21) — the guest's requests in the izlog
// (/dev/menu-public-preview?pozicija=sto|soba, &korpa=1, &moji-zahtevi=1, …):
// the REAL public renderer and the REAL guest components over the fixture
// venues, with an in-memory venue (./gost-memorija.ts) instead of Server
// Actions and Convex. Dev only; nothing is sent anywhere.

import { useMemo, useState, type ReactNode } from "react";
import type { CartArticle, CartLine } from "@/lib/menu/cart";
import type { JavniIzgled } from "@/lib/menu/identity/public-tokens";
import type { MenuKurs } from "@/lib/menu/currency";
import type { JavnaStranicaView, PublicImage } from "@/lib/menu/public-view";
import { DodajUKorpu } from "../gost/dodaj-u-korpu";
import { GostPanel, type GostPocetno } from "../gost/gost-panel";
import type { GostKontekst, GostZahtev } from "../gost/model";
import { MojiZahtevi } from "../gost/moji-zahtevi";
import { zasejKorpu } from "../gost/use-korpa";
import { useVeza } from "../gost/use-veza";
import { JavniMeni, type JavniPocetno } from "../javni/javni-meni";
import { JavniOkvir } from "../javni/okvir";
import { izlogRadnje, useIzlogZahtevi } from "./gost-memorija";

export type GostIzlogProps = {
  rezim: "meni" | "moji-zahtevi";
  view: JavnaStranicaView;
  izgled: JavniIzgled;
  slike: Record<string, PublicImage>;
  sadaMs: number;
  nedostupni: string[];
  kurs: MenuKurs | null;
  pocetnoMeni: JavniPocetno;
  jezikLinkovi: Record<string, string>;
  pocetniDetalj: string | null;
  napomena: ReactNode;
  kontekst: GostKontekst;
  pocetnoGost: GostPocetno;
  /** Lines the in-memory cart starts with (`korpa=1`, `greska=…`, `zahtev=porudzbina`). */
  linije: CartLine[];
  zahtevi: GostZahtev[];
  offline: boolean;
};

export function GostIzlog(props: GostIzlogProps) {
  const { kontekst, view } = props;
  // Seed the in-memory cart once, so the bar and the detail start from the same lines.
  useState(() => {
    zasejKorpu(kontekst.slug, kontekst.kanal, props.linije);
    return true;
  });
  const zahtevi = useIzlogZahtevi(props.zahtevi);
  const online = useVeza(props.offline);
  const nedostupniSet = useMemo(() => new Set(props.nedostupni), [props.nedostupni]);
  const radnje = useMemo(() => {
    const artikli = new Map<string, CartArticle>();
    for (const sekcija of view.sekcije) for (const article of sekcija.articles) artikli.set(article.key, article);
    return izlogRadnje({
      pocetni: props.zahtevi,
      mesto: kontekst.pozicija.naziv,
      sadaMs: props.sadaMs,
      nadjiArtikal: (_pageKey, articleKey) => artikli.get(articleKey) ?? null,
      nedostupni: nedostupniSet,
      dostavaRsd: kontekst.dostavaRsd,
    });
  }, [view.sekcije, props.zahtevi, props.sadaMs, kontekst.pozicija.naziv, kontekst.dostavaRsd, nedostupniSet]);

  if (props.rezim === "moji-zahtevi") {
    return (
      <JavniOkvir izgled={props.izgled} lokal={view.lokal} naslovStranice={null} jezik={view.jezik}>
        <MojiZahtevi
          zahtevi={zahtevi}
          sadaMs={props.sadaMs}
          online={online}
          meniHref={kontekst.linkovi.meni}
          onOtkazi={radnje.otkazi}
        />
      </JavniOkvir>
    );
  }

  const poruciv = kontekst.kanal === "room_service" ? kontekst.radnje.roomService : kontekst.radnje.order;
  return (
    <JavniMeni
      view={view}
      izgled={props.izgled}
      slike={props.slike}
      sadaMs={props.sadaMs}
      nedostupni={props.nedostupni}
      kurs={props.kurs}
      pocetno={props.pocetnoMeni}
      jezikLinkovi={props.jezikLinkovi}
      pocetniDetalj={props.pocetniDetalj}
      cuvaj={false}
      napomena={props.napomena}
      radnjeGosta={
        <GostPanel
          kontekst={kontekst}
          radnje={radnje}
          zahtevi={zahtevi}
          nedostupni={props.nedostupni}
          cuvaj={false}
          offline={props.offline}
          // The server render shows the starting cart too (the in-memory cart takes over in the browser).
          pocetno={{ ...props.pocetnoGost, linije: props.linije }}
        />
      }
      dodajUKorpu={
        poruciv
          ? ({ article, sadaMs, nedostupan, zatvori }) => (
              <DodajUKorpu
                article={article}
                slug={kontekst.slug}
                kanal={kontekst.kanal}
                pageKey={kontekst.pageKey}
                sadaMs={sadaMs}
                nedostupan={nedostupan}
                cuvaj={false}
                onDodato={zatvori}
              />
            )
          : undefined
      }
    />
  );
}
