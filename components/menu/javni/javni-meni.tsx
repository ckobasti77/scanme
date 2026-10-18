"use client";

// ScanMe Menu V1 (K13, plan K12-4) — the ONE client boundary of a public menu
// page. It receives the published page, the venue's finished tokens (computed
// on the server), the resolved images and the live "Privremeno nedostupno",
// and owns only UI state: which article detail is open. The layout follows
// the published presentation: `Tok`, `Kategorije` or `Kompaktno`.
//
// The same component renders the draft in the editor preview (`ugradjen`):
// no landmarks, no h1, nothing focusable, no detail (K10 rules), so what the
// editor shows is exactly what guests will get.

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { trackJavni } from "@/lib/menu/analitika/track";
import type { JavniIzgled } from "@/lib/menu/identity/public-tokens";
import type { JavnaStranicaView, PublicImage } from "@/lib/menu/public-view";
import type { PublicArticle } from "@/lib/menu/snapshot";
import { DetaljArtikla } from "./detalj";
import { Kategorije } from "./kategorije";
import { Kompaktno } from "./kompaktno";
import { NavigacijaStranica } from "./navigacija-stranica";
import { JavniOkvir } from "./okvir";
import { PraznaStranica } from "./stanja";
import { Tok } from "./tok";

export type JavniMeniProps = {
  view: JavnaStranicaView;
  izgled: JavniIzgled;
  slike: Readonly<Record<string, PublicImage>>;
  sadaMs: number;
  /** Article keys "Privremeno nedostupno" right now. */
  nedostupni: readonly string[];
  /** Inside the editor preview. */
  ugradjen?: boolean;
  /** The izlog's `detalj=1`: the detail open from the start. */
  pocetniDetalj?: string | null;
  /** The izlog's open category (`Kategorije`). */
  pocetnaKategorija?: string | null;
  /** A note above the menu (a newer version, K21 guest actions later). */
  dodatak?: ReactNode;
};

export function JavniMeni({
  view,
  izgled,
  slike,
  sadaMs,
  nedostupni,
  ugradjen = false,
  pocetniDetalj = null,
  pocetnaKategorija = null,
  dodatak,
}: JavniMeniProps) {
  const [otvoren, setOtvoren] = useState<string | null>(ugradjen ? null : pocetniDetalj);
  const nedostupniSet = useMemo(() => new Set(nedostupni), [nedostupni]);
  const slug = view.lokal.slug;
  const pageKey = view.stranica.key;

  const poKljucu = useMemo(() => {
    const map = new Map<string, PublicArticle>();
    for (const sekcija of view.sekcije) for (const article of sekcija.articles) map.set(article.key, article);
    return map;
  }, [view.sekcije]);

  useEffect(() => {
    if (ugradjen) return;
    trackJavni({ vrsta: "page_open", slug, pageKey });
  }, [ugradjen, slug, pageKey]);

  // Leaving a category with Back (a fragment change) also closes an open detail.
  useEffect(() => {
    if (ugradjen) return;
    const zatvori = () => setOtvoren(null);
    window.addEventListener("hashchange", zatvori);
    return () => window.removeEventListener("hashchange", zatvori);
  }, [ugradjen]);

  const onOtvori = useCallback(
    (articleKey: string) => {
      setOtvoren(articleKey);
      trackJavni({ vrsta: "article_detail_open", slug, pageKey, articleKey });
    },
    [slug, pageKey],
  );

  const zajednicko = {
    sekcije: view.sekcije,
    slike,
    sadaMs,
    nedostupni: nedostupniSet,
    onOtvori: ugradjen ? null : onOtvori,
    ugradjen,
  };
  const article = otvoren ? poKljucu.get(otvoren) ?? null : null;
  const viseStranica = view.stranice.length > 1;

  return (
    <JavniOkvir
      izgled={izgled}
      lokal={view.lokal}
      naslovStranice={viseStranica ? view.stranica.title : null}
      jezik={view.jezik}
      ugradjen={ugradjen}
      navigacija={
        <NavigacijaStranica slug={slug} stranica={view.stranica} stranice={view.stranice} ugradjen={ugradjen} />
      }
    >
      {dodatak}
      {view.sekcije.length === 0 ? (
        <PraznaStranica meniHref={viseStranica && !ugradjen ? `/${slug}/meni` : null} />
      ) : izgled.layout === "compact" ? (
        <Kompaktno {...zajednicko} alergeniUkljuceni={view.alergeniUkljuceni} />
      ) : izgled.layout === "categories" ? (
        <Kategorije {...zajednicko} pocetnaKategorija={pocetnaKategorija} />
      ) : (
        <Tok {...zajednicko} />
      )}
      {article ? (
        <DetaljArtikla
          article={article}
          layout={izgled.layout}
          slike={slike}
          sadaMs={sadaMs}
          nedostupan={nedostupniSet.has(article.key)}
          alergeniUkljuceni={view.alergeniUkljuceni}
          onZatvori={() => setOtvoren(null)}
        />
      ) : null}
    </JavniOkvir>
  );
}
