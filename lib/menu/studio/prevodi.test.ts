// ScanMe Menu V1 (K16) — what the editor's translation views list (master §7.7):
// a page's public title, its sections and their articles (once each), variants,
// add-on groups with their options, and the Room service categories.
//
// Fixtures: "Demo restoran" (fixtureMenu("srednji")) and "Hotel Primer"
// (fixtureMenu("veliki"), which has Room service categories). All invented.

import { describe, expect, test } from "vitest";
import { fixtureMenu } from "../../../components/menu/fixtures";
import { MENU_TEXT } from "../limits";
import type { MenuDraftSnapshot, SnapshotArticle } from "../snapshot";
import type { StudioPrevodStavka, StudioPrevodVrsta } from "./model";
import { granicaPrevoda, POLJA_PREVODA, prevodiRoomServicea, prevodiStranice, STUDIO_PREVODI_MAX, stavkeArtikla } from "./prevodi";

const srednji = () => fixtureMenu("srednji").snapshot;
const veliki = () => fixtureMenu("veliki").snapshot;

function stranicaKey(snapshot: MenuDraftSnapshot, naziv: string): string {
  const page = snapshot.pages.find((p) => p.name === naziv);
  if (!page) throw new Error(`fixture page "${naziv}" missing`);
  return page.key;
}

function artikal(snapshot: MenuDraftSnapshot, naziv: string): SnapshotArticle {
  const found = snapshot.articles.find((a) => a.name === naziv);
  if (!found) throw new Error(`fixture article "${naziv}" missing`);
  return found;
}

function lista(snapshot: MenuDraftSnapshot, stranica: string) {
  const result = prevodiStranice(snapshot, stranicaKey(snapshot, stranica));
  if (!result) throw new Error("page has no list");
  return result;
}

/** [vrsta, source name] of every item, for readable order assertions. */
const vrste = (stavke: readonly StudioPrevodStavka[]) => stavke.map((s) => s.vrsta);
const nazivi = (stavke: readonly StudioPrevodStavka[], vrsta: StudioPrevodVrsta) =>
  stavke.filter((s) => s.vrsta === vrsta).map((s) => s.izvor.name ?? s.izvor.publicTitle);

const KOMPLETAN = "Kompletan meni";

// =============================================================================
// POLJA_PREVODA / granicaPrevoda
// =============================================================================

describe("POLJA_PREVODA", () => {
  test("lists only the fields guests read, per kind", () => {
    expect(POLJA_PREVODA).toEqual({
      page: ["publicTitle"],
      section: ["name", "description"],
      article: ["name", "description"],
      variant: ["name"],
      addonGroup: ["name"],
      addonOption: ["name"],
      roomServiceCategory: ["name"],
    });
  });
});

describe("granicaPrevoda", () => {
  test("a translation may be as long as the source field may be", () => {
    expect(granicaPrevoda("page", "publicTitle")).toBe(MENU_TEXT.pagePublicTitle);
    expect(granicaPrevoda("section", "name")).toBe(MENU_TEXT.sectionName);
    expect(granicaPrevoda("section", "description")).toBe(MENU_TEXT.sectionDescription);
    expect(granicaPrevoda("article", "name")).toBe(MENU_TEXT.articleName);
    expect(granicaPrevoda("article", "description")).toBe(MENU_TEXT.articleDescription);
    expect(granicaPrevoda("variant", "name")).toBe(MENU_TEXT.variantName);
    expect(granicaPrevoda("addonGroup", "name")).toBe(MENU_TEXT.addonGroupName);
    expect(granicaPrevoda("addonOption", "name")).toBe(MENU_TEXT.addonOptionName);
    expect(granicaPrevoda("roomServiceCategory", "name")).toBe(MENU_TEXT.roomServiceCategoryName);
  });

  test("the public title field always uses the page title limit", () => {
    expect(granicaPrevoda("article", "publicTitle")).toBe(MENU_TEXT.pagePublicTitle);
  });

  test("every limit is a positive whole number", () => {
    for (const [vrsta, polja] of Object.entries(POLJA_PREVODA) as [StudioPrevodVrsta, readonly ("name" | "description" | "publicTitle")[]][]) {
      for (const polje of polja) {
        const granica = granicaPrevoda(vrsta, polje);
        expect(Number.isInteger(granica) && granica > 0, `${vrsta}.${polje}`).toBe(true);
      }
    }
  });
});

// =============================================================================
// prevodiStranice
// =============================================================================

describe("prevodiStranice — the main page of Demo restoran", () => {
  const snapshot = srednji();
  const { stavke, skraceno } = lista(snapshot, KOMPLETAN);

  test("an unknown page is null", () => {
    expect(prevodiStranice(snapshot, "pg_does_not_exist")).toBeNull();
  });

  test("the main page has no public title, so no page item", () => {
    expect(stavke.some((s) => s.vrsta === "page")).toBe(false);
    expect(skraceno).toBe(false);
  });

  test("sections come in page order, each followed by its articles in placement order", () => {
    expect(nazivi(stavke, "section")).toEqual([
      "Predjela",
      "Supe i salate",
      "Sa roštilja",
      "Glavna jela",
      "Prilozi",
      "Dezerti",
      "Pića",
      "Vina",
    ]);
    expect(stavke[0]).toMatchObject({ vrsta: "section", izvor: { name: "Predjela" } });
    expect(stavke[1]).toMatchObject({ vrsta: "article", izvor: { name: "Kajmak sa pogačom" }, grupa: { vrsta: "sekcija", naziv: "Predjela" } });
    // Within Supe i salate, the soup after the section heading, in fixture order.
    const supe = stavke.findIndex((s) => s.vrsta === "section" && s.izvor.name === "Supe i salate");
    expect(stavke[supe + 1].izvor.name).toBe("Domaća pileća supa");
    expect(stavke[supe + 2].izvor.name).toBe("Teleća čorba");
  });

  test("an article is listed under the heading (grupa) of its section, carrying its source texts", () => {
    const sarma = stavke.find((s) => s.vrsta === "article" && s.izvor.name === "Sarma");
    expect(sarma).toMatchObject({
      key: artikal(snapshot, "Sarma").key,
      izvor: { name: "Sarma", description: "Domaća sarma sa dimljenim mesom." },
      grupa: { vrsta: "sekcija", naziv: "Glavna jela" },
      pripada: null,
      prevodi: null,
    });
    const rostilj = stavke.find((s) => s.vrsta === "section" && s.izvor.name === "Sa roštilja");
    expect(rostilj?.izvor.description).toBe("Meso sa roštilja služimo uz lepinju i luk.");
  });

  test("hidden rows are listed too (they are part of the draft)", () => {
    expect(nazivi(stavke, "article")).toContain("Jagnjetina ispod sača");
  });

  test("every article of the page appears exactly once", () => {
    const keys = stavke.filter((s) => s.vrsta === "article").map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.length).toBe(snapshot.articles.length);
  });

  test("an article shown twice on the page is listed once, at its first place", () => {
    const kajmak = artikal(snapshot, "Kajmak sa pogačom");
    const page = snapshot.pages.find((p) => p.name === KOMPLETAN)!;
    const dezerti = snapshot.sections.find((s) => s.pageKey === page.key && s.name === "Dezerti")!;
    const twice: MenuDraftSnapshot = {
      ...snapshot,
      placements: [
        ...snapshot.placements,
        { pageKey: page.key, sectionKey: dezerti.key, articleKey: kajmak.key, order: 99, visibility: "visible" },
      ],
    };
    const result = prevodiStranice(twice, page.key)!;
    const places = result.stavke.filter((s) => s.vrsta === "article" && s.key === kajmak.key);
    expect(places).toHaveLength(1);
    expect(places[0].grupa).toEqual({ vrsta: "sekcija", naziv: "Predjela" });
  });

  test("variants are listed after their article, in order, only when variants are on", () => {
    const naPocetku = stavke.findIndex((s) => s.vrsta === "article" && s.izvor.name === "Ćevapi");
    expect(stavke.slice(naPocetku, naPocetku + 3).map((s) => [s.vrsta, s.izvor.name])).toEqual([
      ["article", "Ćevapi"],
      ["variant", "5 komada"],
      ["variant", "10 komada"],
    ]);
    expect(stavke[naPocetku + 1]).toMatchObject({ pripada: "Ćevapi", grupa: { vrsta: "sekcija", naziv: "Sa roštilja" } });

    const ceavapi = artikal(snapshot, "Ćevapi");
    const off: MenuDraftSnapshot = {
      ...snapshot,
      articles: snapshot.articles.map((a) => (a.key === ceavapi.key ? { ...a, variantsEnabled: false } : a)),
    };
    const without = prevodiStranice(off, stranicaKey(off, KOMPLETAN))!.stavke;
    expect(without.some((s) => s.vrsta === "variant" && s.pripada === "Ćevapi")).toBe(false);
    // The variant rows still exist in the draft; they are just not listed.
    expect(off.variants.some((v) => v.articleKey === ceavapi.key)).toBe(true);
    // Other articles keep their variants.
    expect(without.some((s) => s.vrsta === "variant" && s.pripada === "Točeno pivo")).toBe(true);
  });

  test("add-on groups and options of articles with add-ons come last, under the heading `dodaci`", () => {
    const grupe = stavke.filter((s) => s.vrsta === "addonGroup");
    expect(grupe.map((g) => g.izvor.name)).toEqual(["Stepen pečenja", "Izaberite dva priloga"]);
    expect(grupe.every((g) => g.grupa.vrsta === "dodaci" && g.grupa.naziv === null && g.pripada === null)).toBe(true);

    const firstGroup = stavke.findIndex((s) => s.vrsta === "addonGroup");
    expect(vrste(stavke.slice(firstGroup))).toEqual([
      "addonGroup",
      "addonOption",
      "addonOption",
      "addonOption",
      "addonGroup",
      "addonOption",
      "addonOption",
      "addonOption",
      "addonOption",
      "addonOption",
    ]);
    // Nothing but add-ons after the first group; nothing but non-add-ons before it.
    expect(vrste(stavke.slice(0, firstGroup)).some((v) => v === "addonGroup" || v === "addonOption")).toBe(false);

    const opcije = stavke.filter((s) => s.vrsta === "addonOption");
    expect(opcije.slice(0, 3).map((o) => [o.izvor.name, o.pripada])).toEqual([
      ["Slabo pečeno", "Stepen pečenja"],
      ["Srednje pečeno", "Stepen pečenja"],
      ["Dobro pečeno", "Stepen pečenja"],
    ]);
    expect(opcije[3]).toMatchObject({ izvor: { name: "Pomfrit" }, pripada: "Izaberite dva priloga" });
    expect(opcije.every((o) => o.grupa.vrsta === "dodaci")).toBe(true);
  });

  test("a group shared by several articles is listed once", () => {
    // Four articles offer "Stepen pečenja"/"Izaberite dva priloga" between them.
    const withAddons = snapshot.articles.filter((a) => a.addonsEnabled).length;
    expect(withAddons).toBeGreaterThan(2);
    expect(stavke.filter((s) => s.vrsta === "addonGroup")).toHaveLength(2);
  });

  test("add-ons of an article with add-ons switched off are not listed", () => {
    const off: MenuDraftSnapshot = { ...snapshot, articles: snapshot.articles.map((a) => ({ ...a, addonsEnabled: false })) };
    const none = prevodiStranice(off, stranicaKey(off, KOMPLETAN))!.stavke;
    expect(none.some((s) => s.vrsta === "addonGroup" || s.vrsta === "addonOption")).toBe(false);
  });

  test("only the groups of articles with add-ons on are listed", () => {
    const vesalica = artikal(snapshot, "Vešalica"); // offers "Stepen pečenja"
    const onlyOne: MenuDraftSnapshot = {
      ...snapshot,
      articles: snapshot.articles.map((a) => ({ ...a, addonsEnabled: a.key === vesalica.key })),
    };
    const result = prevodiStranice(onlyOne, stranicaKey(onlyOne, KOMPLETAN))!.stavke;
    expect(nazivi(result, "addonGroup")).toEqual(["Stepen pečenja"]);
    expect(result.filter((s) => s.vrsta === "addonOption")).toHaveLength(3);
  });

  test("a group of an article shown on another page only is not listed on this page", () => {
    // The wine list shows wines, none of which has add-ons.
    const vinska = lista(snapshot, "Vinska karta").stavke;
    expect(vinska.some((s) => s.vrsta === "addonGroup")).toBe(false);
  });

  test("translations of an item are passed through as stored", () => {
    const kajmak = artikal(snapshot, "Kajmak sa pogačom");
    const translated: MenuDraftSnapshot = {
      ...snapshot,
      articles: snapshot.articles.map((a) =>
        a.key === kajmak.key ? { ...a, translations: { en: { status: "confirmed" as const, name: "Kajmak with flatbread" } } } : a,
      ),
    };
    const item = prevodiStranice(translated, stranicaKey(translated, KOMPLETAN))!.stavke.find((s) => s.key === kajmak.key);
    expect(item?.prevodi).toEqual({ en: { status: "confirmed", name: "Kajmak with flatbread" } });
  });

  test("idOf maps every kind and key to what the actions address", () => {
    const mapped = prevodiStranice(snapshot, stranicaKey(snapshot, KOMPLETAN), (vrsta, key) => `${vrsta}:${key}`)!.stavke;
    expect(mapped).toHaveLength(stavke.length);
    expect(mapped.every((s) => s.id === `${s.vrsta}:${s.key}`)).toBe(true);
  });

  test("by default the id is the key", () => {
    expect(stavke.every((s) => s.id === s.key)).toBe(true);
  });

  test("a very large page is cut at STUDIO_PREVODI_MAX and says so", () => {
    expect(STUDIO_PREVODI_MAX).toBe(1_500);
    const page = snapshot.pages.find((p) => p.name === KOMPLETAN)!;
    const many: MenuDraftSnapshot = {
      ...snapshot,
      sections: [
        ...snapshot.sections,
        ...Array.from({ length: 1_600 }, (_, i) => ({
          key: `sc_extra_${String(i).padStart(4, "0")}`,
          pageKey: page.key,
          name: `Dodatna sekcija ${i}`,
          description: null,
          iconKey: null,
          order: 1_000 + i,
          visibility: "visible" as const,
          translations: null,
        })),
      ],
    };
    const result = prevodiStranice(many, page.key)!;
    expect(result.stavke).toHaveLength(STUDIO_PREVODI_MAX);
    expect(result.skraceno).toBe(true);
  });
});

describe("prevodiStranice — a page with a public title (Vinska karta)", () => {
  const snapshot = srednji();
  const { stavke } = lista(snapshot, "Vinska karta");

  test("the public title is the first item, under the page heading", () => {
    expect(stavke[0]).toEqual({
      vrsta: "page",
      id: stranicaKey(snapshot, "Vinska karta"),
      key: stranicaKey(snapshot, "Vinska karta"),
      izvor: { publicTitle: "Vinska karta" },
      prevodi: null,
      grupa: { vrsta: "stranica", naziv: null },
      pripada: null,
    });
  });

  test("then its own sections with the (shared) wine articles, and the variants of the wine by the glass", () => {
    expect(nazivi(stavke, "section")).toEqual(["Bela vina", "Crvena vina"]);
    expect(nazivi(stavke, "article")).toEqual([
      "Tamjanika",
      "Sauvignon Blanc",
      "Rizling",
      "Chardonnay",
      "Vranac",
      "Prokupac",
      "Merlot",
      "Cabernet Sauvignon",
      "Pinot Noir",
    ]);
    const vranac = stavke.findIndex((s) => s.vrsta === "article" && s.izvor.name === "Vranac");
    expect(stavke[vranac + 1]).toMatchObject({ vrsta: "variant", izvor: { name: "Čaša 0,15 l" }, pripada: "Vranac" });
    expect(stavke[vranac + 2]).toMatchObject({ vrsta: "variant", izvor: { name: "Flaša 0,75 l" }, pripada: "Vranac" });
  });

  test("the articles are the very same ones as on the main page (same keys)", () => {
    const main = lista(snapshot, KOMPLETAN).stavke;
    const tamjanika = artikal(snapshot, "Tamjanika").key;
    expect(stavke.some((s) => s.key === tamjanika)).toBe(true);
    expect(main.some((s) => s.key === tamjanika)).toBe(true);
  });

  test("a page whose public title is only spaces or empty has no page item", () => {
    const empty: MenuDraftSnapshot = {
      ...snapshot,
      pages: snapshot.pages.map((p) => (p.name === "Vinska karta" ? { ...p, publicTitle: "" } : p)),
    };
    expect(prevodiStranice(empty, stranicaKey(empty, "Vinska karta"))!.stavke.some((s) => s.vrsta === "page")).toBe(false);
  });

  test("sections of other pages are not listed", () => {
    expect(nazivi(stavke, "section")).not.toContain("Predjela");
  });
});

// =============================================================================
// stavkeArtikla
// =============================================================================

describe("stavkeArtikla", () => {
  const snapshot = srednji();
  const grupa = { vrsta: "sekcija" as const, naziv: "Pića" };

  test("the article and its variants, with the given heading", () => {
    const espresso = artikal(snapshot, "Espresso");
    const stavke = stavkeArtikla(snapshot, espresso.key, grupa);
    expect(stavke.map((s) => [s.vrsta, s.izvor.name])).toEqual([
      ["article", "Espresso"],
      ["variant", "Mali"],
      ["variant", "Veliki"],
    ]);
    expect(stavke.every((s) => s.grupa === grupa)).toBe(true);
    expect(stavke[0]).toMatchObject({ key: espresso.key, pripada: null, izvor: { name: "Espresso", description: null } });
    expect(stavke[1]).toMatchObject({ pripada: "Espresso" });
  });

  test("variants come in their own order", () => {
    const espresso = artikal(snapshot, "Espresso");
    const reversed: MenuDraftSnapshot = { ...snapshot, variants: snapshot.variants.slice().reverse() };
    expect(stavkeArtikla(reversed, espresso.key, grupa).map((s) => s.izvor.name)).toEqual(["Espresso", "Mali", "Veliki"]);
  });

  test("an article without variants (or with them off) is just itself", () => {
    const sarma = artikal(snapshot, "Sarma");
    expect(stavkeArtikla(snapshot, sarma.key, grupa)).toHaveLength(1);
    const espresso = artikal(snapshot, "Espresso");
    const off: MenuDraftSnapshot = {
      ...snapshot,
      articles: snapshot.articles.map((a) => (a.key === espresso.key ? { ...a, variantsEnabled: false } : a)),
    };
    expect(stavkeArtikla(off, espresso.key, grupa)).toHaveLength(1);
  });

  test("an unknown article is an empty list", () => {
    expect(stavkeArtikla(snapshot, "ar_missing", grupa)).toEqual([]);
  });

  test("idOf is applied to the article and to its variants", () => {
    const espresso = artikal(snapshot, "Espresso");
    const stavke = stavkeArtikla(snapshot, espresso.key, grupa, (vrsta, key) => `convex:${vrsta}:${key}`);
    expect(stavke.every((s) => s.id === `convex:${s.vrsta}:${s.key}`)).toBe(true);
  });

  test("carries the stored translations", () => {
    const hotel = veliki();
    const kajgana = artikal(hotel, "Kajgana sa sirom");
    expect(kajgana.translations).not.toBeNull();
    expect(stavkeArtikla(hotel, kajgana.key, grupa)[0].prevodi).toEqual(kajgana.translations);
  });
});

// =============================================================================
// prevodiRoomServicea
// =============================================================================

describe("prevodiRoomServicea", () => {
  const snapshot = veliki();

  test("lists the Room service categories in order, under the Room service heading", () => {
    const stavke = prevodiRoomServicea(snapshot);
    expect(stavke.map((s) => s.izvor.name)).toEqual(["Doručak u sobi", "Jela i užina", "Pića i dezert"]);
    for (const stavka of stavke) {
      expect(stavka).toMatchObject({
        vrsta: "roomServiceCategory",
        grupa: { vrsta: "room-service", naziv: null },
        pripada: null,
        prevodi: null,
      });
      expect(stavka.id).toBe(stavka.key);
      expect(Object.keys(stavka.izvor)).toEqual(["name"]);
    }
    expect(stavke.map((s) => s.key)).toEqual(snapshot.roomService.categories.map((c) => c.key));
  });

  test("sorts by order, not by the order of the array", () => {
    const shuffled: MenuDraftSnapshot = {
      ...snapshot,
      roomService: { ...snapshot.roomService, categories: snapshot.roomService.categories.slice().reverse() },
    };
    expect(prevodiRoomServicea(shuffled).map((s) => s.izvor.name)).toEqual(["Doručak u sobi", "Jela i užina", "Pića i dezert"]);
  });

  test("idOf is applied and translations are passed through", () => {
    const first = snapshot.roomService.categories[0];
    const translated: MenuDraftSnapshot = {
      ...snapshot,
      roomService: {
        ...snapshot.roomService,
        categories: snapshot.roomService.categories.map((c) =>
          c.key === first.key ? { ...c, translations: { en: { status: "confirmed" as const, name: "Breakfast in the room" } } } : c,
        ),
      },
    };
    const stavke = prevodiRoomServicea(translated, (vrsta, key) => `${vrsta}/${key}`);
    expect(stavke[0].id).toBe(`roomServiceCategory/${first.key}`);
    expect(stavke[0].prevodi).toEqual({ en: { status: "confirmed", name: "Breakfast in the room" } });
  });

  test("a menu without Room service categories has an empty list", () => {
    expect(prevodiRoomServicea(srednji())).toEqual([]);
  });
});
