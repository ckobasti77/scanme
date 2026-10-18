"use client";

// ScanMe Menu V1 — the REAL editor in the izlog (K10): /dev/menu-editor-preview
// and /dev/menu-panel-preview?sekcija=editor. The menu is a fixture snapshot
// held in memory; every action runs the same rules as the Convex mutations
// (lib/menu/studio/memorija.ts) after a short pause, so saving, conflicts of
// the queue and the publish dialog behave as in the app — without a backend.
// Invented data only (components/menu/fixtures).
// K15: `fokus=artikal` opens the detail of an article with an image and its
// allergens group open; `fokus=varijante` the detail of an article with three
// variants and a group linked to six articles, with the impact dialog open.
// An upload in the izlog stays in the browser (an object URL), nothing is sent.

import { useCallback, useMemo, useRef, useState } from "react";
import { fixtureMenu, IZLOG_SADA } from "@/components/menu/fixtures";
import { DARK_MENU_DESIGN } from "@/components/menu/menu-fixtures";
import type { EditorPreviewParams } from "@/lib/menu/izlog-params";
import { sadrzajIzSnapshota, straniceIzSnapshota } from "@/lib/menu/studio/iz-snapshota";
import { detaljIzSnapshota } from "@/lib/menu/studio/detalj";
import * as m from "@/lib/menu/studio/memorija";
import * as md from "@/lib/menu/studio/memorija-detalj";
import type { StudioIshod, StudioPodaci, StudioRadnje } from "@/lib/menu/studio/model";
import type { DetaljPocetno } from "../studio/artikal/detalj-artikla";
import type { PonudaPocetno } from "../studio/ponuda/radni-prostor";
import { StudioEditor } from "../studio/studio-editor";

const PAUZA_MS = 250;

/** The medium venue before its first article (the shell shows the same venue). */
function prazanMeni() {
  const meni = fixtureMenu("srednji");
  const podrazumevana = meni.snapshot.pages.filter((page) => page.isDefault);
  return {
    ...meni,
    unavailableArticleKeys: [],
    snapshot: {
      ...meni.snapshot,
      pages: podrazumevana,
      sections: [],
      articles: [],
      placements: [],
      variants: [],
      addonGroups: [],
      addonOptions: [],
      articleAddonGroups: [],
      comboComponents: [],
      roomService: { config: null, categories: [], items: [] },
    },
  };
}

const IZLOG_SLIKA = "/dev-venue/1.jpg";

/** The key of an article by name and of its first row on the main page (fixtures are deterministic). */
function nadji(stanje: m.MemorijaStanje, naziv: string): { key: string; prikaz: string } | null {
  const article = stanje.snapshot.articles.find((candidate) => candidate.name === naziv);
  const glavna = stanje.snapshot.pages.find((page) => page.isDefault);
  const placement = stanje.snapshot.placements.find((candidate) => candidate.articleKey === article?.key && candidate.pageKey === glavna?.key);
  return article && placement ? { key: article.key, prikaz: `${placement.sectionKey}/${article.key}` } : null;
}

/** The fixture as it was last published: the izlog's setup is not an unpublished change. */
function kaoObjavljeno(stanje: m.MemorijaStanje): m.MemorijaStanje {
  return stanje.objavljeno ? { ...stanje, objavljeno: stanje.snapshot, objavljenaRevizija: stanje.revizija } : stanje;
}

type Fokus = { artikal: string; detalj: DetaljPocetno & { izvorPrikaz?: string } };

/**
 * K15 `fokus=artikal`: "Kajmak sa pogačom" with an image (its icon stays the stand-in) and the
 * allergens group open. `fokus=varijante`: "Ćevapi" with three variants and "Izaberite dva
 * priloga" linked to six articles, the group open with its impact dialog.
 */
function saFokusom(stanje: m.MemorijaStanje, fokus: EditorPreviewParams["fokus"]): { stanje: m.MemorijaStanje; fokus: Fokus | null } {
  if (fokus === "artikal") {
    const kajmak = nadji(stanje, "Kajmak sa pogačom");
    if (!kajmak) return { stanje, fokus: null };
    const korak = md.sacuvajOtpremljenuSliku(stanje, kajmak.key, IZLOG_SLIKA);
    return {
      stanje: kaoObjavljeno(korak.stanje),
      fokus: { artikal: kajmak.key, detalj: { izvorPrikaz: kajmak.prikaz, otvoreneGrupe: ["alergeni"] } },
    };
  }
  if (fokus === "varijante") {
    const cevapi = nadji(stanje, "Ćevapi");
    const prilozi = stanje.snapshot.addonGroups.find((group) => group.name === "Izaberite dva priloga");
    if (!cevapi || !prilozi) return { stanje, fokus: null };
    let sledece = md.dodajVarijantu(stanje, cevapi.key, "15 komada", 1240).stanje;
    const drugi = ["Ćevapi", "Pljeskavica sa kajmakom", "Ražnjići"].map((naziv) => nadji(sledece, naziv)?.key).filter((key): key is string => Boolean(key));
    sledece = md.primeniGrupuNa(sledece, prilozi.key, drugi).stanje;
    return {
      stanje: kaoObjavljeno(sledece),
      fokus: { artikal: cevapi.key, detalj: { izvorPrikaz: cevapi.prikaz, otvoreneGrupe: ["varijante"], varijante: { uticajGrupe: prilozi.key } } },
    };
  }
  return { stanje, fokus: null };
}

function pocetno(params: EditorPreviewParams): { stanje: m.MemorijaStanje; lokal: string; slug: string; fokus: Fokus | null } {
  const meni = params.stanje === "prazno" ? prazanMeni() : fixtureMenu(params.stanje === "veliki" ? "veliki" : "srednji");
  const glavna = meni.snapshot.pages.find((page) => page.isDefault);
  const premium = params.plan === "premium";
  const stanje = m.pocetnoStanje(meni.snapshot, {
    nedostupni: meni.unavailableArticleKeys,
    // A printed QR card points at the main page, as in most venues.
    qrStranice: glavna && params.stanje !== "prazno" ? [glavna.key] : [],
    objavljeno: params.stanje === "prazno" ? null : { verzija: 7, u: IZLOG_SADA - 3 * 3_600_000 },
    roomService: premium,
    premium,
  });
  const sa = saFokusom(stanje, params.stanje === null ? params.fokus : null);
  return { stanje: sa.stanje, lokal: meni.venueName, slug: meni.slug, fokus: sa.fokus };
}

/**
 * K11 `stanje=izaberi-vise`: the mode on, five rows selected in two sections
 * (one of them an article with variants, which the price change skips) and
 * the price dialog open with +10 %.
 */
function izaberiVisePocetno(stanje: m.MemorijaStanje): PonudaPocetno {
  const glavna = stanje.snapshot.pages.find((page) => page.isDefault);
  const sadrzaj = glavna ? sadrzajIzSnapshota(stanje.snapshot, glavna.key) : null;
  const sekcije = sadrzaj?.sekcije ?? [];
  const sVarijantama = sekcije.find((sekcija) => sekcija.redovi.some((red) => red.artikal.varijante));
  const prva = sekcije.find((sekcija) => sekcija !== sVarijantama) ?? sekcije[0];
  const izbor = [
    ...(prva?.redovi.filter((red) => !red.artikal.varijante).slice(0, 3) ?? []),
    ...(sVarijantama
      ? [
          sVarijantama.redovi.find((red) => red.artikal.varijante),
          sVarijantama.redovi.find((red) => !red.artikal.varijante),
        ].filter((red) => red !== undefined)
      : []),
  ].map((red) => red.prikazId);
  return { izbor, cene: { nacin: "procenat", smer: "povecaj", vrednost: "10" } };
}

export function EditorIzlog({ params }: { params: EditorPreviewParams }) {
  const [{ lokal, slug, stanje: prvo, fokus }] = useState(() => pocetno(params));
  const [otvorenArtikal, setOtvorenArtikal] = useState<string | null>(fokus?.artikal ?? null);
  const [stanje, setStanje] = useState(prvo);
  const poslednje = useRef(prvo);
  const [stranicaKey, setStranicaKey] = useState<string | null>(null);

  // Runs one memory action after a short pause, on the latest state.
  const izvrsi = useCallback(
    <T,>(korak: (s: m.MemorijaStanje) => m.MemorijaKorak<T>): Promise<StudioIshod<T>> =>
      new Promise((resolve) => {
        setTimeout(() => {
          const { stanje: sledece, ishod } = korak(poslednje.current);
          poslednje.current = sledece;
          setStanje(sledece);
          resolve(ishod);
        }, PAUZA_MS);
      }),
    [],
  );

  const radnje = useMemo<StudioRadnje>(
    () => ({
      dodajStranicu: (naziv) => izvrsi((s) => m.dodajStranicu(s, naziv)),
      preimenujStranicu: (id, naziv, ocekivano) => izvrsi((s) => m.preimenujStranicu(s, id, naziv, ocekivano)),
      duplirajStranicu: (id) => izvrsi((s) => m.duplirajStranicu(s, id)),
      premestiStranicu: (id, naIndeks) => izvrsi((s) => m.premestiStranicu(s, id, naIndeks)),
      arhivirajStranicu: (id) => izvrsi((s) => m.arhivirajStranicu(s, id, IZLOG_SADA)),
      vratiStranicu: (id) => izvrsi((s) => m.vratiStranicu(s, id)),
      obrisiStranicu: (id) => izvrsi((s) => m.obrisiStranicu(s, id)),
      dodajSekciju: (stranicaId, naziv) => izvrsi((s) => m.dodajSekciju(s, stranicaId, naziv)),
      preimenujSekciju: (id, naziv, ocekivano) => izvrsi((s) => m.preimenujSekciju(s, id, naziv, ocekivano)),
      obrisiSekciju: (id) => izvrsi((s) => m.obrisiSekciju(s, id)),
      brziUnos: (sekcijaId, unos, dozvoliDuplikat) => izvrsi((s) => m.brziUnos(s, sekcijaId, unos, dozvoliDuplikat)),
      brziUnosVise: (stranicaId, redovi) => izvrsi((s) => m.brziUnosVise(s, stranicaId, redovi)),
      dodajPostojeci: (sekcijaId, artikalId) => izvrsi((s) => m.dodajPostojeci(s, sekcijaId, artikalId)),
      noviKombo: (sekcijaId, unos) => izvrsi((s) => m.noviKombo(s, sekcijaId, unos)),
      postaviCenu: (artikalId, ocekivana, nova) => izvrsi((s) => m.postaviCenu(s, artikalId, ocekivana, nova)),
      pregledObjave: () => izvrsi((s) => ({ stanje: s, ishod: { ok: true, vrednost: m.pregledObjave(s, true) } })),
      objavi: (revizija, potvrda) => izvrsi((s) => m.objavi(s, revizija, potvrda, IZLOG_SADA)),
      // K11
      premestiPrikaz: (prikazId, uSekciju, prePrikaza) => izvrsi((s) => m.premestiPrikaz(s, prikazId, uSekciju, prePrikaza)),
      premestiSekciju: (sekcijaId, naIndeks) => izvrsi((s) => m.premestiSekciju(s, sekcijaId, naIndeks)),
      postaviDostupnost: (artikalIds, dostupno) => izvrsi((s) => m.postaviDostupnost(s, artikalIds, dostupno)),
      postaviVidljivost: (prikazIds, sakriveno) => izvrsi((s) => m.postaviVidljivost(s, prikazIds, sakriveno)),
      ukloniSaStranice: (prikazIds) => izvrsi((s) => m.ukloniSaStranice(s, prikazIds)),
      premestiUSekciju: (prikazIds, sekcijaId) => izvrsi((s) => m.premestiUSekciju(s, prikazIds, sekcijaId)),
      dodajNaStranicu: (artikalIds, sekcijaId) => izvrsi((s) => m.dodajNaStranicu(s, artikalIds, sekcijaId)),
      sekcijeStranice: (stranicaId) => izvrsi((s) => m.sekcijeStranice(s, stranicaId)),
      postaviCene: (promene) => izvrsi((s) => m.postaviCene(s, promene, IZLOG_SADA)),
      uticajBrisanja: (artikalIds) => izvrsi((s) => m.uticajBrisanja(s, artikalIds)),
      obrisiArtikle: (artikalIds, token) => izvrsi((s) => m.obrisiArtikle(s, artikalIds, token, IZLOG_SADA)),
      // K15 — the article detail.
      izmeniPolje: (artikalId, polje, ocekivano, vrednost) => izvrsi((s) => md.izmeniPolje(s, artikalId, polje, ocekivano, vrednost)),
      postaviMedij: (artikalId, ocekivano, novo) => izvrsi((s) => md.postaviMedij(s, artikalId, ocekivano, novo)),
      otpremiSliku: async (artikalId, fajl, onNapredak) => {
        // Nothing leaves the browser: a short pretend upload, then the local file is the image.
        for (const udeo of [0.25, 0.6, 1]) {
          onNapredak({ faza: "slanje", udeo });
          await new Promise((resolve) => setTimeout(resolve, 120));
        }
        onNapredak({ faza: "obrada" });
        const url = URL.createObjectURL(fajl);
        return izvrsi((s) => md.sacuvajOtpremljenuSliku(s, artikalId, url));
      },
      postaviPrekidace: (artikalId, prekidaci) => izvrsi((s) => md.postaviPrekidace(s, artikalId, prekidaci)),
      dodajVarijantu: (artikalId, naziv, cena) => izvrsi((s) => md.dodajVarijantu(s, artikalId, naziv, cena)),
      izmeniVarijantu: (varijantaId, ocekivano, izmena) => izvrsi((s) => md.izmeniVarijantu(s, varijantaId, ocekivano, izmena, IZLOG_SADA)),
      obrisiVarijantu: (varijantaId) => izvrsi((s) => md.obrisiVarijantu(s, varijantaId)),
      novaGrupa: (artikalId, unos, opcije) => izvrsi((s) => md.novaGrupa(s, artikalId, unos, opcije)),
      postojeceGrupe: () => izvrsi((s) => md.postojeceGrupe(s)),
      prikaciGrupu: (artikalId, grupaId) => izvrsi((s) => md.prikaciGrupu(s, artikalId, grupaId)),
      otkaciGrupu: (artikalId, grupaId) => izvrsi((s) => md.otkaciGrupu(s, artikalId, grupaId)),
      uticajGrupe: (grupaId) => izvrsi((s) => md.uticajGrupe(s, grupaId)),
      izmeniGrupu: (grupaId, ocekivano, izmena, samoZaArtikal) => izvrsi((s) => md.izmeniGrupu(s, grupaId, ocekivano, izmena, samoZaArtikal)),
      dodajOpciju: (grupaId, opcija, samoZaArtikal) => izvrsi((s) => md.dodajOpciju(s, grupaId, opcija, samoZaArtikal)),
      izmeniOpciju: (opcijaId, ocekivano, izmena, samoZaArtikal) => izvrsi((s) => md.izmeniOpciju(s, opcijaId, ocekivano, izmena, samoZaArtikal)),
      obrisiOpciju: (opcijaId, samoZaArtikal) => izvrsi((s) => md.obrisiOpciju(s, opcijaId, samoZaArtikal)),
      primeniGrupuNa: (grupaId, artikalIds) => izvrsi((s) => md.primeniGrupuNa(s, grupaId, artikalIds)),
      traziArtikle: (upit) => izvrsi((s) => md.traziArtikle(s, upit)),
      postaviAlergene: (artikalId, ocekivano, alergeni) => izvrsi((s) => md.postaviAlergene(s, artikalId, ocekivano, alergeni)),
      postaviOznake: (artikalId, ocekivano, oznake) => izvrsi((s) => md.postaviOznake(s, artikalId, ocekivano, oznake)),
      postaviAkciju: (artikalId, ocekivano, akcija) => izvrsi((s) => md.postaviAkciju(s, artikalId, ocekivano, akcija)),
    }),
    [izvrsi],
  );

  const stranice = useMemo(() => straniceIzSnapshota(stanje.snapshot, stanje.qrStranice), [stanje.snapshot, stanje.qrStranice]);
  const aktivna =
    stranicaKey ?? stranice.find((s) => s.podrazumevana && !s.arhivirana)?.key ?? stranice.find((s) => !s.arhivirana)?.key ?? null;
  const sadrzaj = useMemo(
    () => (aktivna ? sadrzajIzSnapshota(stanje.snapshot, aktivna) : null),
    [stanje.snapshot, aktivna],
  );

  const detalj = useMemo(
    () => (otvorenArtikal ? detaljIzSnapshota(stanje.snapshot, otvorenArtikal, (id) => stanje.slike?.get(id) ?? null) : undefined),
    [stanje.snapshot, stanje.slike, otvorenArtikal],
  );

  const premium = params.plan === "premium";
  const podaci: StudioPodaci = {
    kontekst: {
      lokal,
      slug,
      rezim: "hospitality",
      actor: "owner",
      mozeUredjivanje: true,
      mozeObjavu: true,
      mozeDostupnost: true,
      plan: premium ? "premium" : "standard",
      roomService: premium,
    },
    stranice,
    sadrzaj,
    status: {
      stanje: m.stanjeNacrta(stanje),
      objavljenaVerzija: stanje.objavljenaVerzija,
      objavljenoU: stanje.objavljenoU,
    },
    nedostupni: stanje.nedostupni,
    povezano: true,
    detalj,
  };

  return (
    <StudioEditor
      podaci={podaci}
      radnje={radnje}
      izabranaStranica={stranicaKey}
      onIzaberiStranicu={setStranicaKey}
      dizajnPregleda={params.darkDesign ? DARK_MENU_DESIGN : null}
      otvorenArtikal={otvorenArtikal}
      onOtvoriArtikal={setOtvorenArtikal}
      sada={IZLOG_SADA}
      pocetno={{
        tabela: params.stanje === "brzi-unos",
        ...(params.stanje === "izaberi-vise" ? { ponuda: izaberiVisePocetno(prvo) } : {}),
        ...(params.pogled === "struktura" ? { pano: "struktura" as const, preklop: "struktura" as const } : {}),
        ...(params.pogled === "pregled" ? { pano: "pregled" as const, preklop: "pregled" as const } : {}),
        ...(fokus ? { detalj: fokus.detalj } : {}),
      }}
    />
  );
}
