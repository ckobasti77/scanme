// ScanMe Menu V1 (K13) — the editor preview adapter. What the editor holds
// (StudioRadniSadrzaj) must read like what guests get from a published
// version (compilePage), so the preview does not lie. The parity tests compile
// the same izlog snapshot and compare the two; the rest pins the adapter rules.

import { describe, expect, test } from "vitest";
import { fixtureMenu } from "../../../components/menu/fixtures/meni";
import { brojArtikala, cenaPrikaz } from "../public-view";
import { compileSnapshot, parsePublicPage, type MenuDraftSnapshot, type PublicPageDoc } from "../snapshot";
import { sadrzajIzSnapshota } from "./iz-snapshota";
import { javniPregled } from "./javni-pregled";
import type { StudioArtikal, StudioRadniSadrzaj, StudioRed, StudioSekcija } from "./model";

const SIZES = ["mali", "srednji", "veliki"] as const;
const LOKAL = { naziv: "Demo lokal", slug: "demo-lokal" };

// -----------------------------------------------------------------------------
// Parity with the published page
// -----------------------------------------------------------------------------

function publishedPage(snapshot: MenuDraftSnapshot, pageKey: string): PublicPageDoc {
  const compiled = compileSnapshot(snapshot, { languages: ["sr"], roomService: false, scheduledPromos: true });
  const parts = compiled.parts
    .filter((row) => row.scope === "public" && row.lang === "sr" && row.pageKey === pageKey)
    .sort((a, b) => a.part - b.part)
    .map((row) => row.data);
  const doc = parsePublicPage(parts);
  if (!doc) throw new Error(`no public page for ${pageKey}`);
  return doc;
}

function previewOf(snapshot: MenuDraftSnapshot, pageKey: string, nedostupni: ReadonlySet<string> = new Set()) {
  const sadrzaj = sadrzajIzSnapshota(snapshot, pageKey);
  if (!sadrzaj) throw new Error(`no editor content for ${pageKey}`);
  return javniPregled(LOKAL, sadrzaj, nedostupni);
}

const defaultPageKey = (snapshot: MenuDraftSnapshot) =>
  (snapshot.pages.find((page) => page.isDefault) as { key: string }).key;

describe.each(SIZES)("parity with the compiled public page (%s menu)", (size) => {
  const { snapshot } = fixtureMenu(size);

  test("sections agree on keys and names, in order", () => {
    const pageKey = defaultPageKey(snapshot);
    const doc = publishedPage(snapshot, pageKey);
    const { view } = previewOf(snapshot, pageKey);
    expect(doc.sections.length).toBeGreaterThan(0);
    expect(view.sekcije.map((row) => row.key)).toEqual(doc.sections.map((row) => row.key));
    expect(view.sekcije.map((row) => row.name)).toEqual(doc.sections.map((row) => row.name));
  });

  test("articles agree on keys and names, in order, per section", () => {
    const pageKey = defaultPageKey(snapshot);
    const doc = publishedPage(snapshot, pageKey);
    const { view } = previewOf(snapshot, pageKey);
    doc.sections.forEach((published, index) => {
      const shown = view.sekcije[index];
      expect(shown.articles.map((row) => row.key)).toEqual(published.articles.map((row) => row.key));
      expect(shown.articles.map((row) => row.name)).toEqual(published.articles.map((row) => row.name));
    });
    expect(brojArtikala(view.sekcije)).toBe(brojArtikala(doc.sections));
  });

  test("base prices agree for articles without variants", () => {
    const pageKey = defaultPageKey(snapshot);
    const doc = publishedPage(snapshot, pageKey);
    const { view } = previewOf(snapshot, pageKey);
    let compared = 0;
    doc.sections.forEach((published, index) => {
      published.articles.forEach((article, row) => {
        if (article.variants.length > 0) return;
        compared += 1;
        expect(view.sekcije[index].articles[row].priceRsd, article.name).toBe(article.priceRsd);
      });
    });
    expect(compared).toBeGreaterThan(0);
  });

  test("kind, description, quantity and media agree too", () => {
    const pageKey = defaultPageKey(snapshot);
    const doc = publishedPage(snapshot, pageKey);
    const { view } = previewOf(snapshot, pageKey);
    doc.sections.forEach((published, index) => {
      published.articles.forEach((article, row) => {
        const shown = view.sekcije[index].articles[row];
        expect(shown.kind, article.name).toBe(article.kind);
        expect(shown.description, article.name).toBe(article.description);
        expect(shown.quantityValue, article.name).toBe(article.quantityValue);
        expect(shown.quantityUnit, article.name).toBe(article.quantityUnit);
        expect(shown.media, article.name).toEqual(article.media);
      });
    });
  });

  test("every other public page agrees on sections and articles", () => {
    for (const page of snapshot.pages.filter((row) => !row.isDefault && row.archivedAt === null)) {
      const doc = publishedPage(snapshot, page.key);
      const { view } = previewOf(snapshot, page.key);
      expect(view.sekcije.map((row) => row.key)).toEqual(doc.sections.map((row) => row.key));
      expect(view.sekcije.map((row) => row.articles.map((article) => article.key))).toEqual(
        doc.sections.map((row) => row.articles.map((article) => article.key)),
      );
    }
  });

  test("the default page has no title, as on the published page", () => {
    const pageKey = defaultPageKey(snapshot);
    const { view } = previewOf(snapshot, pageKey);
    expect(view.stranica.title).toBeNull();
    expect(view.stranica.title).toBe(publishedPage(snapshot, pageKey).page.title);
    expect(view.stranica.isDefault).toBe(true);
  });
});

describe("parity when the draft hides things", () => {
  test("a hidden row is left out of the preview and the published page alike", () => {
    const { snapshot } = fixtureMenu("mali");
    const pageKey = defaultPageKey(snapshot);
    const hidden = snapshot.placements.find((row) => row.pageKey === pageKey);
    if (!hidden) throw new Error("fixture has no placement");
    const hiddenKey = hidden.articleKey;
    hidden.visibility = "hidden";
    const { view } = previewOf(snapshot, pageKey);
    const doc = publishedPage(snapshot, pageKey);
    const previewKeys = view.sekcije.flatMap((row) => row.articles.map((article) => article.key));
    expect(previewKeys).not.toContain(hiddenKey);
    expect(previewKeys).toEqual(doc.sections.flatMap((row) => row.articles.map((article) => article.key)));
  });

  test("a section whose rows are all hidden is left out of the preview and the published page alike", () => {
    const { snapshot } = fixtureMenu("mali");
    const pageKey = defaultPageKey(snapshot);
    const target = snapshot.sections.find((row) => row.pageKey === pageKey);
    if (!target) throw new Error("fixture has no section");
    for (const placement of snapshot.placements) {
      if (placement.sectionKey === target.key) placement.visibility = "hidden";
    }
    const { view } = previewOf(snapshot, pageKey);
    const doc = publishedPage(snapshot, pageKey);
    expect(view.sekcije.map((row) => row.key)).not.toContain(target.key);
    expect(view.sekcije.map((row) => row.key)).toEqual(doc.sections.map((row) => row.key));
  });

  test("the srednji fixture's hidden article is out of the preview", () => {
    const { snapshot } = fixtureMenu("srednji");
    const pageKey = defaultPageKey(snapshot);
    const { view } = previewOf(snapshot, pageKey);
    const names = view.sekcije.flatMap((row) => row.articles.map((article) => article.name));
    expect(names).not.toContain("Jagnjetina ispod sača");
  });
});

// -----------------------------------------------------------------------------
// Adapter rules, on hand-built editor content
// -----------------------------------------------------------------------------

const artikal = (key: string, over: Partial<StudioArtikal> = {}): StudioArtikal => ({
  id: key,
  key,
  vrsta: "item",
  naziv: `Artikal ${key}`,
  opis: null,
  cena: 100,
  kolicina: null,
  jedinica: null,
  medij: "none",
  ikonica: null,
  varijante: false,
  proveriCenu: false,
  ...over,
});

const red = (sekcijaKey: string, item: StudioArtikal, sakriven = false): StudioRed => ({
  prikazId: `${sekcijaKey}/${item.key}`,
  redosled: 0,
  sakriven,
  artikal: item,
});

const sekcija = (key: string, redovi: StudioRed[]): StudioSekcija => ({
  id: key,
  key,
  naziv: `Sekcija ${key}`,
  redosled: 0,
  redovi,
});

const sadrzaj = (
  sekcije: StudioSekcija[],
  stranica: Partial<StudioRadniSadrzaj["stranica"]> = {},
): StudioRadniSadrzaj => ({
  stranica: {
    id: "pg_one",
    key: "pg_one",
    naziv: "Kompletan meni",
    podrazumevana: true,
    arhivirana: false,
    ...stranica,
  },
  sekcije,
  skraceno: false,
});

describe("javniPregled", () => {
  test("hidden rows are left out", () => {
    const content = sadrzaj([
      sekcija("sc_a", [red("sc_a", artikal("a1")), red("sc_a", artikal("a2"), true), red("sc_a", artikal("a3"))]),
    ]);
    const { view } = javniPregled(LOKAL, content, new Set());
    expect(view.sekcije).toHaveLength(1);
    expect(view.sekcije[0].articles.map((row) => row.key)).toEqual(["a1", "a3"]);
  });

  test("a section whose rows are all hidden is left out", () => {
    const content = sadrzaj([
      sekcija("sc_a", [red("sc_a", artikal("a1"), true), red("sc_a", artikal("a2"), true)]),
      sekcija("sc_b", [red("sc_b", artikal("b1"))]),
    ]);
    const { view } = javniPregled(LOKAL, content, new Set());
    expect(view.sekcije.map((row) => row.key)).toEqual(["sc_b"]);
  });

  test("an empty section is left out", () => {
    const { view } = javniPregled(LOKAL, sadrzaj([sekcija("sc_a", [])]), new Set());
    expect(view.sekcije).toEqual([]);
  });

  test("an empty page gives an empty view, not an error", () => {
    const { view, nedostupni } = javniPregled(LOKAL, sadrzaj([]), new Set(["a1"]));
    expect(view.sekcije).toEqual([]);
    expect(nedostupni).toEqual([]);
  });

  test("sections and rows keep the order the editor holds", () => {
    const content = sadrzaj([
      sekcija("sc_z", [red("sc_z", artikal("z2")), red("sc_z", artikal("z1"))]),
      sekcija("sc_a", [red("sc_a", artikal("a1"))]),
    ]);
    const { view } = javniPregled(LOKAL, content, new Set());
    expect(view.sekcije.map((row) => row.key)).toEqual(["sc_z", "sc_a"]);
    expect(view.sekcije[0].articles.map((row) => row.key)).toEqual(["z2", "z1"]);
  });

  test("the default page has title null, never the internal Kompletan meni", () => {
    const { view } = javniPregled(LOKAL, sadrzaj([], { podrazumevana: true, naziv: "Kompletan meni" }), new Set());
    expect(view.stranica.title).toBeNull();
    expect(view.stranica.isDefault).toBe(true);
    expect(JSON.stringify(view)).not.toContain("Kompletan meni");
  });

  test("a non-default page gets its name as the title", () => {
    const content = sadrzaj([], { key: "pg_two", id: "pg_two", podrazumevana: false, naziv: "Vinska karta" });
    const { view } = javniPregled(LOKAL, content, new Set());
    expect(view.stranica).toMatchObject({ key: "pg_two", title: "Vinska karta", isDefault: false });
  });

  test("the view is a one-page, Serbian, allergen-free menu of the venue", () => {
    const { view } = javniPregled(LOKAL, sadrzaj([]), new Set());
    expect(view.lokal).toEqual({ naziv: "Demo lokal", slug: "demo-lokal", logoUrl: null });
    expect(view.stranice).toEqual([view.stranica]);
    expect(view.jezik).toBe("sr");
    expect(view.jezici).toEqual(["sr"]);
    expect(view.alergeniUkljuceni).toBe(false);
  });

  test("nedostupni keeps only keys shown on the page, sorted", () => {
    const content = sadrzaj([
      sekcija("sc_a", [red("sc_a", artikal("a1")), red("sc_a", artikal("c3")), red("sc_a", artikal("h1"), true)]),
      sekcija("sc_b", [red("sc_b", artikal("b2"))]),
    ]);
    const { nedostupni } = javniPregled(LOKAL, content, new Set(["c3", "zz", "h1", "a1", "b2"]));
    expect(nedostupni).toEqual(["a1", "b2", "c3"]);
  });

  test("nedostupni is empty when nothing is unavailable", () => {
    const content = sadrzaj([sekcija("sc_a", [red("sc_a", artikal("a1"))])]);
    expect(javniPregled(LOKAL, content, new Set()).nedostupni).toEqual([]);
  });

  test("media mode and iconKey pass through, the image id is null", () => {
    const content = sadrzaj([
      sekcija("sc_a", [
        red("sc_a", artikal("a1", { medij: "icon", ikonica: "coffee" })),
        red("sc_a", artikal("a2", { medij: "image", ikonica: "wine" })),
        red("sc_a", artikal("a3", { medij: "none", ikonica: null })),
      ]),
    ]);
    const media = javniPregled(LOKAL, content, new Set()).view.sekcije[0].articles.map((row) => row.media);
    expect(media).toEqual([
      { mode: "icon", imageMediaId: null, iconKey: "coffee" },
      { mode: "image", imageMediaId: null, iconKey: "wine" },
      { mode: "none", imageMediaId: null, iconKey: null },
    ]);
  });

  test("name, description, quantity, kind and base price pass through", () => {
    const item = artikal("a1", {
      naziv: "Kapućino",
      opis: "Sa mlekom",
      kolicina: 0.2,
      jedinica: "l",
      vrsta: "combo",
      cena: 250,
    });
    const [shown] = javniPregled(LOKAL, sadrzaj([sekcija("sc_a", [red("sc_a", item)])]), new Set()).view.sekcije[0]
      .articles;
    expect(shown).toMatchObject({
      key: "a1",
      kind: "combo",
      name: "Kapućino",
      description: "Sa mlekom",
      quantityValue: 0.2,
      quantityUnit: "l",
      priceRsd: 250,
    });
  });

  test("what the editor model does not carry yet is absent", () => {
    const [shown] = javniPregled(LOKAL, sadrzaj([sekcija("sc_a", [red("sc_a", artikal("a1"))])]), new Set()).view
      .sekcije[0].articles;
    expect(shown).toMatchObject({
      variants: [],
      addonGroups: [],
      allergens: null,
      tags: [],
      promo: null,
      combo: null,
      noteEnabled: false,
    });
  });

  test("the preview articles feed the public price logic", () => {
    const content = sadrzaj([
      sekcija("sc_a", [red("sc_a", artikal("a1", { cena: 320 })), red("sc_a", artikal("a2", { cena: null }))]),
    ]);
    const [priced, unpriced] = javniPregled(LOKAL, content, new Set()).view.sekcije[0].articles;
    expect(cenaPrikaz(priced, 0)).toEqual({ vrsta: "osnovna", rsd: 320, akcijska: null });
    expect(cenaPrikaz(unpriced, 0)).toEqual({ vrsta: "bez" });
  });

  test("does not change the editor content or the unavailable set", () => {
    const content = sadrzaj([
      sekcija("sc_a", [red("sc_a", artikal("a1")), red("sc_a", artikal("a2"), true)]),
    ]);
    const unavailable = new Set(["b", "a"]);
    const before = JSON.stringify(content);
    javniPregled(LOKAL, content, unavailable);
    expect(JSON.stringify(content)).toBe(before);
    expect([...unavailable]).toEqual(["b", "a"]);
  });

  test("is deterministic", () => {
    const { snapshot } = fixtureMenu("srednji");
    const pageKey = defaultPageKey(snapshot);
    const unavailable = new Set(["x"]);
    expect(previewOf(snapshot, pageKey, unavailable)).toEqual(previewOf(snapshot, pageKey, unavailable));
  });
});
