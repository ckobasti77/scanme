// ScanMe Menu V1 (K16) — what the translation views show (master §7.7), as pure
// functions: which items need attention in a language, how the list is grouped,
// which AI suggestions wait for the owner, and the key of each autosaved field.
//
// The items are written by hand (an article "Teleća čorba" with a description),
// so every test says exactly which language and which field is in which state.
// One test runs the grouping over a real page list of the demo fixture.

import { describe, expect, test } from "vitest";
import { fixtureMenu } from "../../../components/menu/fixtures";
import { MENU_SOURCE_LANGUAGE, MENU_TRANSLATION_LANGUAGES } from "../languages";
import { sourceHash, type MenuTranslationEntry } from "../translation-status";
import type { StudioPrevodStavka } from "./model";
import { prevodiStranice } from "./prevodi";
import {
  brojeviPoJeziku,
  cilj,
  filtriraj,
  grupisi,
  kljucPrevoda,
  kljucStavke,
  najgoriStatus,
  nazivJezika,
  poljaZaPrevod,
  predlogPolja,
  statusStavke,
  trebaPaznju,
} from "./prevodi-pogled";

// =============================================================================
// Fixtures
// =============================================================================

const NAZIV = "Teleća čorba";
const OPIS = "Sa povrćem";

const potvrdjen = (extra: Partial<MenuTranslationEntry>): MenuTranslationEntry => ({ status: "confirmed", ...extra });

/** Name and description confirmed, both made from the current source texts. */
const gotovPrevod = (): MenuTranslationEntry =>
  potvrdjen({ name: "Veal soup", nameHash: sourceHash(NAZIV), description: "With vegetables", descriptionHash: sourceHash(OPIS) });

/** As above, but the name was translated from an older source text. */
const zastareoPrevod = (): MenuTranslationEntry => ({ ...gotovPrevod(), nameHash: sourceHash("Goveđa čorba") });

/** Nothing confirmed; the AI suggested both fields. */
const predlozenPrevod = (): MenuTranslationEntry => ({
  status: "suggested",
  suggestion: { name: "Veal soup", description: "With vegetables", at: 1 },
});

function stavka(id: string, preko: Partial<StudioPrevodStavka> = {}): StudioPrevodStavka {
  return {
    vrsta: "article",
    id,
    key: `ar_${id}`,
    izvor: { name: NAZIV, description: OPIS },
    prevodi: null,
    grupa: { vrsta: "sekcija", naziv: "Supe" },
    pripada: null,
    ...preko,
  };
}

const ids = (stavke: readonly StudioPrevodStavka[]) => stavke.map((s) => s.id);

// The English state of each of these items is in the comment.
const gotova = stavka("gotova", { prevodi: { en: gotovPrevod() } }); // done
const zastarela = stavka("zastarela", { prevodi: { en: zastareoPrevod() } }); // stale
const predlozena = stavka("predlozena", { prevodi: { en: predlozenPrevod() } }); // suggested
const nedostaje = stavka("nedostaje"); // missing
const bezIzvora = stavka("bezIzvora", { izvor: { name: null, description: "   " } }); // nothing to translate

// =============================================================================
// statusStavke / trebaPaznju
// =============================================================================

describe("statusStavke", () => {
  test("missing: a source text and no translation in that language", () => {
    expect(statusStavke(nedostaje, "en")).toBe("missing");
    expect(statusStavke(stavka("a", { prevodi: {} }), "en")).toBe("missing");
    // Translated into German only: English is missing, and so is a code nobody used.
    const samoNemacki = stavka("a", { prevodi: { de: gotovPrevod() } });
    expect(statusStavke(samoNemacki, "de")).toBe("done");
    expect(statusStavke(samoNemacki, "en")).toBe("missing");
    expect(statusStavke(samoNemacki, "xx")).toBe("missing");
  });

  test("done when confirmed from the current source text, stale once the source changed", () => {
    expect(statusStavke(gotova, "en")).toBe("done");
    expect(statusStavke(zastarela, "en")).toBe("stale");
    // The very same translation is fine against the text it was made from.
    const naStaromTekstu = { ...zastarela, izvor: { name: "Goveđa čorba", description: OPIS } };
    expect(statusStavke(naStaromTekstu, "en")).toBe("done");
  });

  test("suggested: only an AI suggestion exists, nothing is confirmed yet", () => {
    expect(statusStavke(predlozena, "en")).toBe("suggested");
  });

  test("the worst field decides: missing, then stale, then suggested, then done", () => {
    const imeGotovo = { name: "Veal soup", nameHash: sourceHash(NAZIV) };
    const imeZastarelo = { name: "Veal soup", nameHash: sourceHash("Goveđa čorba") };
    const predlogOpisa = { suggestion: { description: "With vegetables", at: 1 } };
    const stanje = (entry: MenuTranslationEntry) => statusStavke(stavka("a", { prevodi: { en: entry } }), "en");

    expect(stanje(potvrdjen({ ...imeGotovo }))).toBe("missing"); // name done, description untouched
    expect(stanje(potvrdjen({ ...imeZastarelo }))).toBe("missing"); // name stale, description untouched
    expect(stanje(potvrdjen({ ...imeZastarelo, ...predlogOpisa }))).toBe("stale"); // name stale, description suggested
    expect(stanje(potvrdjen({ ...imeGotovo, ...predlogOpisa }))).toBe("suggested"); // name done, description suggested
    expect(stanje(gotovPrevod())).toBe("done");
  });

  test("nothing to translate is null, and a field without a source text does not count", () => {
    expect(statusStavke(bezIzvora, "en")).toBeNull();
    expect(statusStavke(stavka("a", { izvor: {} }), "en")).toBeNull();
    // Only the name has a source text: the empty description does not drag the item down.
    const samoNaziv = stavka("a", {
      izvor: { name: NAZIV, description: null },
      prevodi: { en: potvrdjen({ name: "Veal soup", nameHash: sourceHash(NAZIV) }) },
    });
    expect(statusStavke(samoNaziv, "en")).toBe("done");
  });
});

describe("trebaPaznju", () => {
  test("missing, stale and suggested need the owner; done and nothing to translate do not", () => {
    for (const status of ["missing", "stale", "suggested"] as const) expect(trebaPaznju(status), status).toBe(true);
    expect(trebaPaznju("done")).toBe(false);
    expect(trebaPaznju(null)).toBe(false);
  });
});

// =============================================================================
// brojeviPoJeziku / najgoriStatus
// =============================================================================

describe("brojeviPoJeziku", () => {
  test("counts the items in each state, in the asked language", () => {
    const stavke = [
      stavka("a", { prevodi: { en: gotovPrevod(), de: zastareoPrevod() } }),
      stavka("b", { prevodi: { en: gotovPrevod() } }),
      stavka("c", { prevodi: { en: predlozenPrevod(), de: predlozenPrevod() } }),
    ];
    expect(brojeviPoJeziku(stavke, "en")).toEqual({ missing: 0, stale: 0, suggested: 1, done: 2 });
    expect(brojeviPoJeziku(stavke, "de")).toEqual({ missing: 1, stale: 1, suggested: 1, done: 0 });
    expect(brojeviPoJeziku(stavke, "fr")).toEqual({ missing: 3, stale: 0, suggested: 0, done: 0 });
  });

  test("items with nothing to translate are not counted; no items is all zeros", () => {
    expect(brojeviPoJeziku([bezIzvora, nedostaje], "en")).toEqual({ missing: 1, stale: 0, suggested: 0, done: 0 });
    expect(brojeviPoJeziku([], "en")).toEqual({ missing: 0, stale: 0, suggested: 0, done: 0 });
  });
});

describe("najgoriStatus", () => {
  test("is the worst state over all items, in the asked language", () => {
    expect(najgoriStatus([gotova, gotova], "en")).toBe("done");
    expect(najgoriStatus([gotova, predlozena], "en")).toBe("suggested");
    expect(najgoriStatus([gotova, predlozena, zastarela], "en")).toBe("stale");
    expect(najgoriStatus([gotova, predlozena, zastarela, nedostaje], "en")).toBe("missing");
    // Nobody translated into German.
    expect(najgoriStatus([gotova, predlozena], "de")).toBe("missing");
  });

  test("is null when there is nothing to translate at all", () => {
    expect(najgoriStatus([], "en")).toBeNull();
    expect(najgoriStatus([bezIzvora], "en")).toBeNull();
    // An item without a source text does not hide the state of the others.
    expect(najgoriStatus([bezIzvora, gotova], "en")).toBe("done");
  });
});

// =============================================================================
// kljucStavke / filtriraj
// =============================================================================

describe("kljucStavke", () => {
  test("is kind:id, the id the actions address (not the key)", () => {
    expect(kljucStavke(stavka("abc123"))).toBe("article:abc123");
    expect(kljucStavke(stavka("abc123", { vrsta: "variant" }))).toBe("variant:abc123");
    expect(kljucStavke(stavka("k57abc", { key: "ar_000" }))).toBe("article:k57abc");
  });
});

describe("filtriraj", () => {
  const sve = [gotova, nedostaje, bezIzvora, zastarela, predlozena];

  test("'Sve' lists every item in the original order, as a new array", () => {
    const rezultat = filtriraj(sve, "en", false);
    expect(ids(rezultat)).toEqual(["gotova", "nedostaje", "bezIzvora", "zastarela", "predlozena"]);
    expect(rezultat).not.toBe(sve);
    rezultat.pop();
    expect(sve).toHaveLength(5);
  });

  test("'Treba pažnju' keeps missing, stale and suggested items in list order; done ones and ones with nothing to translate go", () => {
    expect(ids(filtriraj(sve, "en", true))).toEqual(["nedostaje", "zastarela", "predlozena"]);
    expect(filtriraj([], "en", true)).toEqual([]);
  });

  test("is judged in the chosen language", () => {
    const stavke = [
      stavka("a", { prevodi: { en: gotovPrevod() } }), // en done, de missing
      stavka("b", { prevodi: { en: zastareoPrevod(), de: gotovPrevod() } }), // en stale, de done
    ];
    expect(ids(filtriraj(stavke, "en", true))).toEqual(["b"]);
    expect(ids(filtriraj(stavke, "de", true))).toEqual(["a"]);
  });

  test("`zadrzi` keeps the named items by kind:id after they got translated, and only those", () => {
    const upravoPrevedena = stavka("tek", { prevodi: { en: gotovPrevod() } });
    const stavke = [gotova, upravoPrevedena, nedostaje];
    expect(ids(filtriraj(stavke, "en", true))).toEqual(["nedostaje"]);
    expect(ids(filtriraj(stavke, "en", true, new Set([kljucStavke(upravoPrevedena)])))).toEqual(["tek", "nedostaje"]);
    // The same id under another kind, or the bare key, keeps nothing; an empty set is no set.
    expect(ids(filtriraj(stavke, "en", true, new Set(["section:tek", upravoPrevedena.key])))).toEqual(["nedostaje"]);
    expect(ids(filtriraj(stavke, "en", true, new Set<string>()))).toEqual(["nedostaje"]);
  });
});

// =============================================================================
// grupisi
// =============================================================================

describe("grupisi", () => {
  const uGrupi = (id: string, naziv: string | null, vrsta: StudioPrevodStavka["grupa"]["vrsta"] = "sekcija") =>
    stavka(id, { grupa: { vrsta, naziv } });

  test("consecutive items under one heading make one group, in list order", () => {
    const grupe = grupisi([
      uGrupi("a", "Predjela"),
      uGrupi("b", "Predjela"),
      uGrupi("c", "Supe"),
      uGrupi("d", "Supe"),
      uGrupi("e", "Supe"),
    ]);
    expect(grupe.map((g) => g.grupa.naziv)).toEqual(["Predjela", "Supe"]);
    expect(grupe.map((g) => ids(g.stavke))).toEqual([["a", "b"], ["c", "d", "e"]]);
  });

  test("a heading that comes back later is a new group: the order of the list is never rearranged", () => {
    const grupe = grupisi([uGrupi("a", "Predjela"), uGrupi("b", "Supe"), uGrupi("c", "Predjela")]);
    expect(grupe.map((g) => [g.grupa.naziv, ids(g.stavke)])).toEqual([
      ["Predjela", ["a"]],
      ["Supe", ["b"]],
      ["Predjela", ["c"]],
    ]);
  });

  test("a heading is kind + name: the same name under another kind, or a null name next to a named one, is another group", () => {
    const grupe = grupisi([
      uGrupi("a", "Pića"),
      uGrupi("b", "Pića", "dodaci"), // same name, other kind
      uGrupi("c", null, "dodaci"), // null name after a named one
      uGrupi("d", null, "dodaci"), // null name of the same kind joins
      uGrupi("e", null, "room-service"), // null name of another kind
    ]);
    expect(grupe.map((g) => g.grupa.vrsta)).toEqual(["sekcija", "dodaci", "dodaci", "room-service"]);
    expect(grupe.map((g) => ids(g.stavke))).toEqual([["a"], ["b"], ["c", "d"], ["e"]]);
  });

  test("every item lands in exactly one group, the input is left alone, an empty list has no groups", () => {
    const ulaz = [uGrupi("a", "X"), uGrupi("b", "X"), uGrupi("c", "Y")];
    const kopija = structuredClone(ulaz);
    const grupe = grupisi(ulaz);
    expect(ids(grupe.flatMap((g) => g.stavke))).toEqual(["a", "b", "c"]);
    expect(ulaz).toEqual(kopija);
    expect(grupisi([])).toEqual([]);
  });

  test("on a real page list: one group per section led by the section itself, the add-ons last", () => {
    const snapshot = fixtureMenu("srednji").snapshot;
    const glavna = snapshot.pages.find((p) => p.isDefault)!;
    const stavke = prevodiStranice(snapshot, glavna.key)!.stavke;
    const grupe = grupisi(stavke);

    expect(grupe.flatMap((g) => g.stavke.map(kljucStavke))).toEqual(stavke.map(kljucStavke));
    const sekcije = grupe.filter((g) => g.grupa.vrsta === "sekcija");
    expect(sekcije).toHaveLength(snapshot.sections.filter((s) => s.pageKey === glavna.key).length);
    for (const g of sekcije) {
      expect(g.stavke[0].vrsta, g.grupa.naziv ?? "").toBe("section");
      expect(g.stavke.slice(1).every((s) => s.vrsta === "article" || s.vrsta === "variant"), g.grupa.naziv ?? "").toBe(true);
    }
    const poslednja = grupe[grupe.length - 1];
    expect(poslednja.grupa).toEqual({ vrsta: "dodaci", naziv: null });
    expect(poslednja.stavke.every((s) => s.vrsta === "addonGroup" || s.vrsta === "addonOption")).toBe(true);
    expect(grupe.filter((g) => g.grupa.vrsta === "dodaci")).toHaveLength(1);

    // A page with a public title starts with that title, under a heading of its own.
    const vinska = snapshot.pages.find((p) => p.name === "Vinska karta")!;
    const vinskeGrupe = grupisi(prevodiStranice(snapshot, vinska.key)!.stavke);
    expect(vinskeGrupe[0].grupa).toEqual({ vrsta: "stranica", naziv: null });
    expect(vinskeGrupe[0].stavke.map((s) => s.vrsta)).toEqual(["page"]);
    expect(vinskeGrupe[1].grupa.vrsta).toBe("sekcija");
  });
});

// =============================================================================
// poljaZaPrevod / predlogPolja / cilj / kljucPrevoda
// =============================================================================

describe("poljaZaPrevod", () => {
  test("lists the fields of the kind that have a source text, in the order of the kind", () => {
    expect(poljaZaPrevod(stavka("a"))).toEqual(["name", "description"]);
    // The order is the kind's own, not the order of the keys of the source.
    expect(poljaZaPrevod(stavka("a", { izvor: { description: OPIS, name: NAZIV } }))).toEqual(["name", "description"]);
    expect(poljaZaPrevod(stavka("s", { vrsta: "page", izvor: { publicTitle: "Vinska karta" } }))).toEqual(["publicTitle"]);
  });

  test("a field with no source text (null, missing or blank) cannot be translated", () => {
    expect(poljaZaPrevod(stavka("a", { izvor: { name: NAZIV, description: null } }))).toEqual(["name"]);
    expect(poljaZaPrevod(stavka("a", { izvor: { name: NAZIV, description: "   " } }))).toEqual(["name"]);
    expect(poljaZaPrevod(stavka("a", { izvor: { name: NAZIV } }))).toEqual(["name"]);
    expect(poljaZaPrevod(bezIzvora)).toEqual([]);
  });

  test("lists only fields the kind translates, whatever the translations say", () => {
    // A variant has a name only, whatever else its source holds.
    expect(poljaZaPrevod(stavka("v", { vrsta: "variant", izvor: { name: "5 komada", description: "Opis varijante" } }))).toEqual(["name"]);
    // An already translated field is still listed: the owner may edit it.
    expect(poljaZaPrevod(gotova)).toEqual(["name", "description"]);
  });
});

describe("predlogPolja", () => {
  test("returns the pending suggestion of each field, for the asked language only", () => {
    const s = stavka("a", {
      prevodi: { en: predlozenPrevod(), de: { status: "suggested", suggestion: { name: "Kalbssuppe", at: 2 } } },
    });
    expect(predlogPolja(s, "en")).toEqual({ name: "Veal soup", description: "With vegetables" });
    expect(predlogPolja(s, "de")).toEqual({ name: "Kalbssuppe" });
  });

  test("is empty when nothing is pending: no entry, only confirmed text, or another language", () => {
    expect(predlogPolja(nedostaje, "en")).toEqual({});
    expect(predlogPolja(gotova, "en")).toEqual({});
    expect(predlogPolja(predlozena, "fr")).toEqual({});
  });

  test("offers the suggestion, never the confirmed text, when both exist", () => {
    const s = stavka("a", {
      prevodi: { en: potvrdjen({ name: "Veal soup", nameHash: sourceHash(NAZIV), suggestion: { name: "Calf soup", at: 3 } }) },
    });
    expect(predlogPolja(s, "en")).toEqual({ name: "Calf soup" });
  });

  test("skips a field without a source text, a blank suggestion, and fields the kind does not translate", () => {
    // The description was cleared after the AI had suggested both fields.
    const bezOpisa = stavka("a", { izvor: { name: NAZIV, description: null }, prevodi: { en: predlozenPrevod() } });
    expect(predlogPolja(bezOpisa, "en")).toEqual({ name: "Veal soup" });
    // A blank suggestion is no suggestion.
    const prazan = stavka("a", {
      prevodi: { en: { status: "suggested", suggestion: { name: "   ", description: "With vegetables", at: 1 } } },
    });
    expect(predlogPolja(prazan, "en")).toEqual({ description: "With vegetables" });
    // A variant has a name only.
    const varijanta = stavka("v", {
      vrsta: "variant",
      izvor: { name: "5 komada" },
      prevodi: { en: { status: "suggested", suggestion: { name: "5 pieces", description: "stray text", at: 1 } } },
    });
    expect(predlogPolja(varijanta, "en")).toEqual({ name: "5 pieces" });
  });
});

describe("cilj", () => {
  test("is the kind and the id of the item, what the actions address, and nothing else", () => {
    const rezultat = cilj(stavka("k57abc", { vrsta: "addonOption", key: "ao_1" }));
    expect(rezultat).toEqual({ vrsta: "addonOption", id: "k57abc" });
    expect(Object.keys(rezultat).sort()).toEqual(["id", "vrsta"]);
  });
});

describe("kljucPrevoda", () => {
  test("format: prevod:<kind>:<id>:<language>:<field>", () => {
    expect(kljucPrevoda(stavka("abc"), "en", "name")).toBe("prevod:article:abc:en:name");
    expect(kljucPrevoda(stavka("s1", { vrsta: "page" }), "de", "publicTitle")).toBe("prevod:page:s1:de:publicTitle");
  });

  test("is different for every kind, id, language and field, so each field has its own autosave slot", () => {
    const kljucevi = new Set<string>();
    for (const vrsta of ["article", "section"] as const) {
      for (const id of ["a", "b"]) {
        for (const jezik of ["en", "de"]) {
          for (const polje of ["name", "description"] as const) kljucevi.add(kljucPrevoda(stavka(id, { vrsta }), jezik, polje));
        }
      }
    }
    expect(kljucevi.size).toBe(2 * 2 * 2 * 2);
  });
});

// =============================================================================
// nazivJezika
// =============================================================================

describe("nazivJezika", () => {
  test("a known code gives the Serbian name of the language, in lower case and with diacritics", () => {
    expect(nazivJezika("sr")).toBe("srpski");
    expect(nazivJezika("en")).toBe("engleski");
    expect(nazivJezika("de")).toBe("nemački");
  });

  test("every language a menu can be translated into has a name, so none falls back to its code", () => {
    for (const kod of [MENU_SOURCE_LANGUAGE, ...MENU_TRANSLATION_LANGUAGES]) {
      expect(nazivJezika(kod), kod).not.toBe(kod.toUpperCase());
    }
  });

  test("an unknown code is shown uppercased; an empty code stays empty", () => {
    expect(nazivJezika("xx")).toBe("XX");
    expect(nazivJezika("pt-br")).toBe("PT-BR");
    expect(nazivJezika("")).toBe("");
  });

  // K34: fixed. The code was looked up on a plain object, so "constructor" or "toString" found the
  // inherited function instead of falling back to the uppercased code.
  test("a code named like an Object.prototype member is shown uppercased", () => {
    expect(nazivJezika("constructor")).toBe("CONSTRUCTOR");
    expect(nazivJezika("toString")).toBe("TOSTRING");
  });
});
