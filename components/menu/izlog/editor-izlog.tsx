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
// K16: `fokus=kombo` opens a combo whose component price changed ("Proveri cenu");
// `fokus=prevodi` the translations of the main page (English: missing, stale,
// done and an AI suggestion waiting; German on Premium); `fokus=room-service`
// the Room service context with its rules, the three price origins and the
// price decision open. `plan=standard` shows the Premium locks. The izlog's AI
// suggestion is made in the browser from a tiny invented glossary: no network.
// K17: `tab=izgled` opens Izgled (`plan=premium` unlocks the Premium
// variants); `paleta=<id>` starts the venue on a curated palette, as published.
// Izgled choices go into the draft in memory, by the server's rules.

import { useCallback, useMemo, useRef, useState } from "react";
import { fixtureMenu, IZLOG_SADA } from "@/components/menu/fixtures";
import { DARK_MENU_DESIGN } from "@/components/menu/menu-fixtures";
import type { EditorPreviewParams } from "@/lib/menu/izlog-params";
import { sadrzajIzSnapshota, straniceIzSnapshota } from "@/lib/menu/studio/iz-snapshota";
import { detaljIzSnapshota } from "@/lib/menu/studio/detalj";
import * as m from "@/lib/menu/studio/memorija";
import * as md from "@/lib/menu/studio/memorija-detalj";
import * as mk from "@/lib/menu/studio/memorija-k16";
import * as mi from "@/lib/menu/studio/memorija-izgled";
import { paletaPoId } from "@/lib/menu/identity/palettes";
import { MENU_DEFAULT_PRESENTATION } from "@/lib/menu/presentation";
import type { StudioIshod, StudioJezici, StudioPodaci, StudioRadnje, StudioRsUpozorenje } from "@/lib/menu/studio/model";
import { prevodiRoomServicea, prevodiStranice } from "@/lib/menu/studio/prevodi";
import { roomServiceIzSnapshota } from "@/lib/menu/studio/room-service";
import { publishedLanguages } from "@/lib/menu/snapshot";
import { withSuggestion, withTypedTranslation, type MenuTranslationField, type MenuTranslations } from "@/lib/menu/translation-status";
import type { DetaljPocetno } from "../studio/artikal/detalj-artikla";
import type { PonudaPocetno } from "../studio/ponuda/radni-prostor";
import { StudioEditor, type StudioPogled } from "../studio/studio-editor";

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

type Fokus = {
  artikal?: string;
  detalj?: DetaljPocetno & { izvorPrikaz?: string };
  roomService?: boolean;
  prevodi?: "stranica";
  rsUpozorenje?: StudioRsUpozorenje;
};

/** The izlog's stand-in for the AI service: a few invented menu words, the rest left as is. */
const IZLOG_RECNIK: Record<string, Record<string, string>> = {
  en: {
    "Kajmak sa pogačom": "Kaymak with pogača bread",
    "Domaći kajmak i topla pogača.": "Homemade kaymak and warm pogača bread.",
    Prebranac: "Baked beans (prebranac)",
    Gibanica: "Gibanica cheese pie",
    "Urnebes salata": "Urnebes spicy cheese spread",
    Predjela: "Starters",
    "Supe i salate": "Soups and salads",
    "Sa roštilja": "From the grill",
    "Glavna jela": "Main courses",
  },
  de: { Predjela: "Vorspeisen", Gibanica: "Gibanica (Käsestrudel)" },
};

function izlogPredlog(tekstovi: Partial<Record<MenuTranslationField, string | null>>, jezik: string): Partial<Record<MenuTranslationField, string>> {
  const recnik = IZLOG_RECNIK[jezik] ?? {};
  const out: Partial<Record<MenuTranslationField, string>> = {};
  for (const [polje, tekst] of Object.entries(tekstovi) as [MenuTranslationField, string | null][]) {
    if (tekst) out[polje] = recnik[tekst] ?? tekst;
  }
  return out;
}

/** English (and German on Premium): a few done, one stale (its Serbian name changed since), one AI suggestion waiting. */
function saPrevodima(stanje: m.MemorijaStanje): m.MemorijaStanje {
  const jezici = stanje.premium ? ["en", "de"] : ["en"];
  const tr = (value: MenuTranslations | undefined) => (value ?? null) as m.MemorijaStanje["snapshot"]["articles"][number]["translations"];
  const prevodi: Record<string, (t: MenuTranslations | undefined, source: string) => MenuTranslations | undefined> = {
    Prebranac: (t, source) => withTypedTranslation(t, "en", "name", "Baked beans (prebranac)", source),
    "Ajvar sa tostom": (t, source) => withTypedTranslation(t, "en", "name", "Ajvar with toast", source),
    // Stale: translated when the Serbian name was different.
    Gibanica: (t) => withTypedTranslation(t, "en", "name", "Cheese pie", "Gibanica sa sirom"),
    // A suggestion waiting for the owner (never published until confirmed).
    "Kajmak sa pogačom": (t, source) =>
      withSuggestion(
        t,
        "en",
        { name: "Kaymak with pogača bread", description: "Homemade kaymak and warm pogača bread." },
        { name: source, description: "Domaći kajmak i topla pogača." },
        IZLOG_SADA - 600_000,
      ),
  };
  return {
    ...stanje,
    snapshot: {
      ...stanje.snapshot,
      settings: { ...stanje.snapshot.settings, languages: { source: "sr", translations: jezici } },
      sections: stanje.snapshot.sections.map((section) =>
        section.name === "Predjela" ? { ...section, translations: tr(withTypedTranslation(null, "en", "name", "Starters", section.name)) } : section,
      ),
      articles: stanje.snapshot.articles.map((article) => {
        const f = prevodi[article.name];
        return f ? { ...article, translations: tr(f((article.translations ?? undefined) as MenuTranslations | undefined, article.name)) } : article;
      }),
    },
  };
}

/** Two categories, the markup for selected articles, a fee; one row of each origin and a pending decision. */
function saRoomServiceom(stanje: m.MemorijaStanje): { stanje: m.MemorijaStanje; upozorenje: StudioRsUpozorenje | null } {
  if (!stanje.premium) return { stanje, upozorenje: null };
  const kljuc = (naziv: string) => stanje.snapshot.articles.find((article) => article.name === naziv)?.key ?? "";
  let s = stanje;
  const korak = <T,>(k: m.MemorijaKorak<T>) => {
    s = k.stanje;
    return k.ishod;
  };
  const kuhinja = korak(mk.rsDodajKategoriju(s, "Iz kuhinje"));
  const salate = korak(mk.rsDodajKategoriju(s, "Salate"));
  if (!kuhinja.ok || !salate.ok) return { stanje, upozorenje: null };
  korak(mk.rsDodajArtikle(s, kuhinja.vrednost.id, [kljuc("Gibanica"), kljuc("Domaća pileća supa")]));
  korak(mk.rsDodajArtikle(s, salate.vrednost.id, [kljuc("Šopska salata")]));
  korak(mk.rsPravila(s, { uvecanje: null, obuhvat: "all", naknada: null }, { uvecanje: 15, obuhvat: "selected", naknada: 300 }));
  korak(mk.rsUvecanje(s, [kljuc("Gibanica"), kljuc("Šopska salata")], true));
  korak(mk.rsRucnaCena(s, kljuc("Šopska salata"), null, 520));
  const sopska = s.snapshot.articles.find((article) => article.name === "Šopska salata");
  const posle = korak(m.postaviCenu(s, kljuc("Šopska salata"), sopska?.basePriceRsd ?? null, (sopska?.basePriceRsd ?? 0) + 40, IZLOG_SADA - 900_000));
  return { stanje: s, upozorenje: posle.ok ? posle.vrednost : null };
}

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
  if (fokus === "kombo") {
    // "Ručak dana" = Teleća čorba + Punjene paprike + Kupus salata; the paprike got dearer.
    const rucak = nadji(stanje, "Ručak dana");
    const paprike = stanje.snapshot.articles.find((article) => article.name === "Punjene paprike");
    if (!rucak || !paprike) return { stanje, fokus: null };
    const sledece = m.postaviCenu(stanje, paprike.key, paprike.basePriceRsd, (paprike.basePriceRsd ?? 0) + 60, IZLOG_SADA - 3_600_000).stanje;
    return { stanje: kaoObjavljeno(sledece), fokus: { artikal: rucak.key, detalj: { izvorPrikaz: rucak.prikaz } } };
  }
  if (fokus === "prevodi") return { stanje: kaoObjavljeno(saPrevodima(stanje)), fokus: { prevodi: "stranica" } };
  if (fokus === "room-service") {
    const sa = saRoomServiceom(stanje);
    return {
      stanje: kaoObjavljeno(sa.stanje),
      fokus: { roomService: stanje.premium, ...(sa.upozorenje ? { rsUpozorenje: sa.upozorenje } : {}) },
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

/** Every translatable thing of the menu (the izlog looks the source of a suggestion up by key). */
function svePrevodneStavke(stanje: m.MemorijaStanje) {
  return [
    ...stanje.snapshot.pages.flatMap((page) => prevodiStranice(stanje.snapshot, page.key)?.stavke ?? []),
    ...prevodiRoomServicea(stanje.snapshot),
  ];
}

function pocetno(params: EditorPreviewParams): { stanje: m.MemorijaStanje; lokal: string; slug: string; fokus: Fokus | null } {
  const meni = params.stanje === "prazno" ? prazanMeni() : fixtureMenu(params.stanje === "veliki" ? "veliki" : "srednji");
  const glavna = meni.snapshot.pages.find((page) => page.isDefault);
  const premium = params.plan === "premium";
  // K17: a curated palette the plan allows, as the venue last published it.
  const paleta = params.paleta ? paletaPoId(params.paleta) : null;
  const snapshot =
    paleta && paleta.id === params.paleta && (premium || !paleta.premium)
      ? { ...meni.snapshot, presentation: { ...(meni.snapshot.presentation ?? MENU_DEFAULT_PRESENTATION), paletteId: paleta.id } }
      : meni.snapshot;
  const stanje = m.pocetnoStanje(snapshot, {
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
      postaviCenu: (artikalId, ocekivana, nova) => izvrsi((s) => m.postaviCenu(s, artikalId, ocekivana, nova, IZLOG_SADA)),
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
      // K16 — combos, translations, Room service.
      postaviSastav: (komboId, sastojci) => izvrsi((s) => mk.postaviSastav(s, komboId, sastojci)),
      zadrziCenuKomboa: (komboId) => izvrsi((s) => mk.zadrziCenuKomboa(s, komboId)),
      prevedi: (cilj, jezik, polje, ocekivano, vrednost) => izvrsi((s) => mk.prevedi(s, cilj, jezik, polje, ocekivano, vrednost)),
      predloziPrevod: (cilj, jezik) =>
        izvrsi((s) => {
          const stavka = [...(prevodiStranice(s.snapshot, cilj.vrsta === "page" ? cilj.id : "")?.stavke ?? []), ...svePrevodneStavke(s)].find(
            (candidate) => candidate.vrsta === cilj.vrsta && candidate.id === cilj.id,
          );
          return mk.predloziPrevod(s, cilj, jezik, izlogPredlog(stavka?.izvor ?? {}, jezik), true, IZLOG_SADA);
        }),
      potvrdiPredlog: (cilj, jezik, izmene) => izvrsi((s) => mk.potvrdiPredlog(s, cilj, jezik, izmene)),
      odbaciPredlog: (cilj, jezik) => izvrsi((s) => mk.odbaciPredlog(s, cilj, jezik)),
      prevodJeDobar: (cilj, jezik) => izvrsi((s) => mk.prevodJeDobar(s, cilj, jezik)),
      rsPravila: (ocekivano, izmena) => izvrsi((s) => mk.rsPravila(s, ocekivano, izmena)),
      rsDodajKategoriju: (naziv) => izvrsi((s) => mk.rsDodajKategoriju(s, naziv)),
      rsPreimenujKategoriju: (id, naziv, ocekivano) => izvrsi((s) => mk.rsPreimenujKategoriju(s, id, naziv, ocekivano)),
      rsPremestiKategoriju: (id, naIndeks) => izvrsi((s) => mk.rsPremestiKategoriju(s, id, naIndeks)),
      rsObrisiKategoriju: (id) => izvrsi((s) => mk.rsObrisiKategoriju(s, id)),
      rsPreuzmiCeoMeni: () => izvrsi((s) => mk.rsPreuzmiCeoMeni(s)),
      rsDodajArtikle: (kategorijaId, artikalIds) => izvrsi((s) => mk.rsDodajArtikle(s, kategorijaId, artikalIds)),
      rsUkloni: (stavkaId) => izvrsi((s) => mk.rsUkloni(s, stavkaId)),
      rsPremestiStavku: (stavkaId, uKategoriju, preStavke) => izvrsi((s) => mk.rsPremestiStavku(s, stavkaId, uKategoriju, preStavke)),
      rsUvecanje: (stavkaIds, primeni) => izvrsi((s) => mk.rsUvecanje(s, stavkaIds, primeni)),
      rsRucnaCena: (stavkaId, ocekivana, nova) => izvrsi((s) => mk.rsRucnaCena(s, stavkaId, ocekivana, nova)),
      rsResiUpozorenje: (stavkaId, akcija) => izvrsi((s) => mk.rsResiUpozorenje(s, stavkaId, akcija)),
      // K17 — Izgled (draft).
      postaviIzgled: (ocekivano, izmena) => izvrsi((s) => mi.postaviIzgled(s, ocekivano, izmena)),
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
  // The opening view is known from `fokus`: the first render already has its data (no loading flash).
  const [pogled, setPogled] = useState<StudioPogled>({ roomService: Boolean(fokus?.roomService), prevodi: fokus?.prevodi ?? null });
  const jezici = useMemo<StudioJezici>(() => {
    const { source, languages, dropped } = publishedLanguages(stanje.snapshot.settings, premium ? 10 : 2);
    return {
      izvorni: source,
      prevodi: languages.slice(1),
      vanLimita: dropped,
      max: premium ? 10 : 2,
      ai: premium ? { dostupno: true, razlog: null } : { dostupno: false, razlog: "premium" },
    };
  }, [stanje.snapshot.settings, premium]);
  const prevodiPogled = useMemo(() => {
    if (pogled.prevodi === "room-service") {
      return { obuhvat: "room-service" as const, naslov: "", stavke: prevodiRoomServicea(stanje.snapshot), skraceno: false };
    }
    if (pogled.prevodi === "stranica" && aktivna) {
      const lista = prevodiStranice(stanje.snapshot, aktivna);
      const stranica = stanje.snapshot.pages.find((page) => page.key === aktivna);
      return lista ? { obuhvat: "stranica" as const, naslov: stranica?.name ?? "", stavke: lista.stavke, skraceno: lista.skraceno } : null;
    }
    return undefined;
  }, [pogled.prevodi, stanje.snapshot, aktivna]);
  const roomServicePodaci = useMemo(
    () => (pogled.roomService ? roomServiceIzSnapshota(stanje.snapshot) : undefined),
    [pogled.roomService, stanje.snapshot],
  );
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
    jezici,
    prevodi: prevodiPogled,
    roomServicePodaci,
    izgled: mi.izgledIzMemorije(stanje),
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
      onPogled={setPogled}
      sada={IZLOG_SADA}
      pocetno={{
        tabela: params.stanje === "brzi-unos",
        ...(params.stanje === "izaberi-vise" ? { ponuda: izaberiVisePocetno(prvo) } : {}),
        ...(params.pogled === "struktura" ? { pano: "struktura" as const, preklop: "struktura" as const } : {}),
        ...(params.pogled === "pregled" ? { pano: "pregled" as const, preklop: "pregled" as const } : {}),
        ...(fokus?.detalj ? { detalj: fokus.detalj } : {}),
        ...(fokus?.roomService ? { roomService: true } : {}),
        ...(fokus?.prevodi ? { prevodi: fokus.prevodi } : {}),
        ...(fokus?.rsUpozorenje ? { rsUpozorenje: fokus.rsUpozorenje } : {}),
        ...(params.tab === "izgled" && !fokus ? { tab: "izgled" as const } : {}),
      }}
    />
  );
}
