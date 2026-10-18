"use client";

// ScanMe Menu V1 — the REAL editor in the izlog (K10): /dev/menu-editor-preview
// and /dev/menu-panel-preview?sekcija=editor. The menu is a fixture snapshot
// held in memory; every action runs the same rules as the Convex mutations
// (lib/menu/studio/memorija.ts) after a short pause, so saving, conflicts of
// the queue and the publish dialog behave as in the app — without a backend.
// Invented data only (components/menu/fixtures).

import { useCallback, useMemo, useRef, useState } from "react";
import { fixtureMenu, IZLOG_SADA } from "@/components/menu/fixtures";
import { DARK_MENU_DESIGN } from "@/components/menu/menu-fixtures";
import type { EditorPreviewParams } from "@/lib/menu/izlog-params";
import { sadrzajIzSnapshota, straniceIzSnapshota } from "@/lib/menu/studio/iz-snapshota";
import * as m from "@/lib/menu/studio/memorija";
import type { StudioIshod, StudioPodaci, StudioRadnje } from "@/lib/menu/studio/model";
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

function pocetno(params: EditorPreviewParams): { stanje: m.MemorijaStanje; lokal: string; slug: string } {
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
  return { stanje, lokal: meni.venueName, slug: meni.slug };
}

export function EditorIzlog({ params }: { params: EditorPreviewParams }) {
  const [{ lokal, slug, stanje: prvo }] = useState(() => pocetno(params));
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
  };

  return (
    <StudioEditor
      podaci={podaci}
      radnje={radnje}
      izabranaStranica={stranicaKey}
      onIzaberiStranicu={setStranicaKey}
      dizajnPregleda={params.darkDesign ? DARK_MENU_DESIGN : null}
      pocetno={{
        tabela: params.stanje === "brzi-unos",
        ...(params.pogled === "struktura" ? { pano: "struktura" as const, preklop: "struktura" as const } : {}),
        ...(params.pogled === "pregled" ? { pano: "pregled" as const, preklop: "pregled" as const } : {}),
      }}
    />
  );
}
