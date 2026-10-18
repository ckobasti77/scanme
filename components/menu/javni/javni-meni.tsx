"use client";

// ScanMe Menu V1 (K13, plan K12-4) — the ONE client boundary of a public menu
// page. It receives the published page, the venue's finished tokens (computed
// on the server), the resolved images and the live "Privremeno nedostupno",
// and owns only UI state: which article detail is open. The layout follows
// the published presentation: `Tok`, `Kategorije` or `Kompaktno`.
//
// K14 adds the guest's own choices, each only when the venue turned it on:
// search and filters (master §7.2; kept per page in sessionStorage, so the
// detail, another page and a refresh do not lose them), marked allergens
// (§7.3; a warning, nothing hidden), the language links (§7.7) and the
// informative EUR price (§5.3; only with a fresh rate). A minute clock keeps
// promotions on time while the page stays open (§7.6).
//
// The same component renders the draft in the editor preview (`ugradjen`):
// no landmarks, no h1, nothing focusable, no detail and no guest tools (K10
// rules), so what the editor shows is exactly what guests will get.

import { useCallback, useDeferredValue, useEffect, useMemo, useState, type ReactNode } from "react";
import { brojBezPodataka, brojUpozorenja, normalizujAlergene } from "@/lib/menu/allergen-warnings";
import type { MenuAllergenCode } from "@/lib/menu/allergens";
import { trackJavni } from "@/lib/menu/analitika/track";
import { datumKursa, kursJeSvez, type MenuKurs } from "@/lib/menu/currency";
import { fmt } from "@/lib/i18n/format";
import { menuJavniSr } from "@/lib/i18n/sr/menu-javni";
import { dostupniFilteri, filtrirajStranicu, normalizujFiltere, type MenuFilterCode } from "@/lib/menu/filters";
import { saJezikom } from "@/lib/menu/i18n-fallback";
import type { JavniIzgled } from "@/lib/menu/identity/public-tokens";
import { brojArtikala, primeniPrikazMedija, putStranice, type JavnaStranicaView, type PublicImage } from "@/lib/menu/public-view";
import { pretraziStranicu, reciUpita } from "@/lib/menu/search";
import type { PublicArticle } from "@/lib/menu/snapshot";
import { AlergeniDugme, AlergeniFioka, AlergeniTraka } from "./alergeni";
import { RezultatiStatus, TrakaAlata } from "./alati";
import { DetaljArtikla } from "./detalj";
import { JezikIzbor, ValutaPrekidac } from "./jezik-valuta";
import { Kategorije, KategorijeRezultati } from "./kategorije";
import { Kompaktno } from "./kompaktno";
import { JavniIzborKontekst, type JavniIzbor } from "./kontekst";
import { NavigacijaStranica } from "./navigacija-stranica";
import { JavniOkvir } from "./okvir";
import { PraznaStranica } from "./stanja";
import { Tok } from "./tok";
import { useMinutniSat } from "./use-minutni-sat";
import { useSacuvano } from "./use-sacuvano";
import styles from "./javni.module.css";

/** Where a page starts: the izlog's address parameters; a guest starts empty. */
export type JavniPocetno = {
  upit?: string;
  filteri?: readonly string[];
  alergeni?: readonly string[];
  valuta?: "rsd" | "eur";
};

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
  /** K14: the latest stored EUR rate (convex/menuFx.ts); shown only when fresh. */
  kurs?: MenuKurs | null;
  /** K14: the clock moves on in the browser (the real route; the izlog keeps its fixed instant). */
  satUzivo?: boolean;
  /** K14: keep the guest's choices in browser storage (off in the izlog: the address decides). */
  cuvaj?: boolean;
  pocetno?: JavniPocetno;
  /** K14: the href of this page in each language (default: the public path with `?jezik=`). */
  jezikLinkovi?: Readonly<Record<string, string>>;
};

type Pregled = { u: string; f: string[] };

function citajPregled(raw: string): Pregled {
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value === "object" && value !== null) {
      const row = value as Record<string, unknown>;
      return {
        u: typeof row.u === "string" ? row.u : "",
        f: Array.isArray(row.f) ? row.f.filter((kod): kod is string => typeof kod === "string") : [],
      };
    }
  } catch {
    // A damaged stored value starts the page fresh.
  }
  return { u: "", f: [] };
}

export function JavniMeni({
  view: viewUlaz,
  izgled,
  slike,
  sadaMs,
  nedostupni,
  ugradjen = false,
  pocetniDetalj = null,
  pocetnaKategorija = null,
  dodatak,
  kurs = null,
  satUzivo = false,
  cuvaj = true,
  pocetno = {},
  jezikLinkovi,
}: JavniMeniProps) {
  // K17: the venue's menu-wide media display caps every article (master §7.4).
  const view = useMemo(() => {
    const sekcije = primeniPrikazMedija(viewUlaz.sekcije, izgled.mediji);
    return sekcije === viewUlaz.sekcije ? viewUlaz : { ...viewUlaz, sekcije };
  }, [viewUlaz, izgled.mediji]);
  const [otvoren, setOtvoren] = useState<string | null>(ugradjen ? null : pocetniDetalj);
  const nedostupniSet = useMemo(() => new Set(nedostupni), [nedostupni]);
  const slug = view.lokal.slug;
  const pageKey = view.stranica.key;
  const sada = useMinutniSat(sadaMs, satUzivo && !ugradjen);
  const mogucnosti = ugradjen ? undefined : view.mogucnosti;
  const alergeniUkljuceni = view.alergeniUkljuceni && !ugradjen;

  // --- the guest's choices (sessionStorage / localStorage; memory in the izlog) ---
  const sesija = cuvaj ? "session" : "memorija";
  const [pregledRaw, setPregledRaw] = useSacuvano(
    sesija,
    `smm_pregled:${slug}:${pageKey}`,
    JSON.stringify({ u: pocetno.upit ?? "", f: [...(pocetno.filteri ?? [])] }),
  );
  const [alergeniRaw, setAlergeniRaw] = useSacuvano(sesija, `smm_alergeni:${slug}`, (pocetno.alergeni ?? []).join(","));
  const [valutaRaw, setValutaRaw] = useSacuvano(cuvaj ? "local" : "memorija", "smm_valuta", pocetno.valuta ?? "rsd");

  const pregled = useMemo(() => citajPregled(pregledRaw), [pregledRaw]);
  const oznaceni = useMemo<MenuAllergenCode[]>(
    () => (alergeniUkljuceni ? normalizujAlergene(alergeniRaw.split(",")) : []),
    [alergeniRaw, alergeniUkljuceni],
  );
  const filteri = useMemo(
    () => (mogucnosti ? dostupniFilteri(view.sekcije, mogucnosti.filteri, sada) : []),
    [mogucnosti, view.sekcije, sada],
  );
  const izabrani = useMemo(() => normalizujFiltere(pregled.f).filter((kod) => filteri.includes(kod)), [pregled.f, filteri]);
  const upit = mogucnosti?.pretraga ? pregled.u : "";
  const odlozenUpit = useDeferredValue(upit);
  const pretrazuje = reciUpita(odlozenUpit).length > 0 || izabrani.length > 0;
  const prikazane = useMemo(
    () => (pretrazuje ? filtrirajStranicu(pretraziStranicu(view.sekcije, odlozenUpit), izabrani, sada) : view.sekcije),
    [pretrazuje, view.sekcije, odlozenUpit, izabrani, sada],
  );

  const svezKurs = mogucnosti?.valuta && kurs && kursJeSvez(kurs, sada) ? kurs : null;
  const valuta = svezKurs && valutaRaw === "eur" ? "eur" : "rsd";
  const izbor = useMemo<JavniIzbor>(
    () => ({
      alergeniUkljuceni,
      oznaceniAlergeni: oznaceni,
      eurKurs: valuta === "eur" && svezKurs ? svezKurs.rate : null,
      eurDatum: valuta === "eur" && svezKurs ? svezKurs.effectiveDate : null,
    }),
    [alergeniUkljuceni, oznaceni, valuta, svezKurs],
  );

  const postaviPregled = useCallback(
    (sledeci: Pregled) => setPregledRaw(JSON.stringify(sledeci)),
    [setPregledRaw],
  );
  const onUpit = useCallback((u: string) => postaviPregled({ u, f: izabrani }), [postaviPregled, izabrani]);
  const onFilter = useCallback(
    (kod: MenuFilterCode) =>
      postaviPregled({ u: upit, f: izabrani.includes(kod) ? izabrani.filter((k) => k !== kod) : [...izabrani, kod] }),
    [postaviPregled, upit, izabrani],
  );
  const ponisti = useCallback(() => postaviPregled({ u: "", f: [] }), [postaviPregled]);
  const [fioka, setFioka] = useState(false);
  const otvoriFioku = useCallback(() => setFioka(true), []);

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
    sekcije: prikazane,
    slike,
    sadaMs: sada,
    nedostupni: nedostupniSet,
    onOtvori: ugradjen ? null : onOtvori,
    ugradjen,
  };
  const article = otvoren ? poKljucu.get(otvoren) ?? null : null;
  const viseStranica = view.stranice.length > 1;

  const linkovi = useMemo(() => {
    if (jezikLinkovi) return jezikLinkovi;
    const put = putStranice(slug, view.stranica, view.stranice);
    return Object.fromEntries(view.jezici.map((kod) => [kod, saJezikom(put, kod, view.jezici)]));
  }, [jezikLinkovi, slug, view.stranica, view.stranice, view.jezici]);

  const alatiZaglavlja =
    !ugradjen && (view.jezici.length > 1 || svezKurs) ? (
      <>
        <JezikIzbor jezik={view.jezik} jezici={view.jezici} linkovi={linkovi} />
        {svezKurs ? <ValutaPrekidac valuta={valuta} onIzbor={setValutaRaw} /> : null}
      </>
    ) : null;

  const layout =
    izgled.layout === "compact" ? (
      <Kompaktno {...zajednicko} alergeniUkljuceni={view.alergeniUkljuceni} />
    ) : izgled.layout === "categories" ? (
      pretrazuje ? (
        <KategorijeRezultati {...zajednicko} />
      ) : (
        <Kategorije {...zajednicko} pocetnaKategorija={pocetnaKategorija} />
      )
    ) : (
      <Tok {...zajednicko} />
    );

  return (
    <JavniIzborKontekst.Provider value={izbor}>
      <JavniOkvir
        izgled={izgled}
        lokal={view.lokal}
        naslovStranice={viseStranica ? view.stranica.title : null}
        jezik={view.jezik}
        ugradjen={ugradjen}
        alati={alatiZaglavlja}
        navigacija={
          <NavigacijaStranica
            slug={slug}
            stranica={view.stranica}
            stranice={view.stranice}
            ugradjen={ugradjen}
            jezik={view.jezik}
            jezici={view.jezici}
          />
        }
      >
        {dodatak}
        {view.sekcije.length > 0 && mogucnosti ? (
          <TrakaAlata
            pretraga={mogucnosti.pretraga}
            upit={upit}
            onUpit={onUpit}
            filteri={filteri}
            izabrani={izabrani}
            onFilter={onFilter}
            alergeni={alergeniUkljuceni ? <AlergeniDugme broj={oznaceni.length} onOtvori={otvoriFioku} /> : null}
          />
        ) : view.sekcije.length > 0 && alergeniUkljuceni ? (
          <TrakaAlata
            pretraga={false}
            upit=""
            onUpit={onUpit}
            filteri={[]}
            izabrani={[]}
            onFilter={onFilter}
            alergeni={<AlergeniDugme broj={oznaceni.length} onOtvori={otvoriFioku} />}
          />
        ) : null}
        {izbor.eurKurs !== null && izbor.eurDatum ? (
          <p className={styles.valutaNapomena} data-eur-napomena="">
            {fmt(menuJavniSr.valuta.napomena, { datum: datumKursa(izbor.eurDatum) })}
          </p>
        ) : null}
        {oznaceni.length > 0 ? (
          <AlergeniTraka
            oznaceni={oznaceni}
            brojUpozorenja={brojUpozorenja(view.sekcije, oznaceni, alergeniUkljuceni)}
            brojBezPodataka={brojBezPodataka(view.sekcije, alergeniUkljuceni)}
            onPromeni={otvoriFioku}
          />
        ) : null}
        {view.sekcije.length === 0 ? (
          <PraznaStranica
            meniHref={viseStranica && !ugradjen ? saJezikom(`/${slug}/meni`, view.jezik, view.jezici) : null}
          />
        ) : pretrazuje ? (
          <>
            <RezultatiStatus
              broj={brojArtikala(prikazane)}
              upit={odlozenUpit}
              imaFiltera={izabrani.length > 0}
              onPonisti={ponisti}
            />
            {prikazane.length > 0 ? layout : null}
          </>
        ) : (
          layout
        )}
        {article ? (
          <DetaljArtikla
            article={article}
            layout={izgled.layout}
            slike={slike}
            sadaMs={sada}
            nedostupan={nedostupniSet.has(article.key)}
            alergeniUkljuceni={view.alergeniUkljuceni}
            onZatvori={() => setOtvoren(null)}
          />
        ) : null}
        {alergeniUkljuceni && fioka ? (
          <AlergeniFioka
            oznaceni={oznaceni}
            onPromena={(kodovi) => setAlergeniRaw(kodovi.join(","))}
            onZatvori={() => setFioka(false)}
          />
        ) : null}
      </JavniOkvir>
    </JavniIzborKontekst.Provider>
  );
}
