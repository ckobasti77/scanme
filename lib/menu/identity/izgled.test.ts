// ScanMe Menu V1 (K17) — the appearance of the public menu: the brand palette
// from the venue's own colours, the Premium catalog, the rules of a change of
// the appearance (shared by the Convex writer and the editor's memory), what
// guests get on Standard, and what compileSnapshot publishes. Pure logic: no
// DOM, no clock, no network.

import { oklch } from "culori";
import { describe, expect, test } from "vitest";
import { fixtureMenu } from "../../../components/menu/fixtures";
import { MENU_FILTER_CODES } from "../filters";
import { MENU_DEFAULT_PRESENTATION, type MenuPresentationValues } from "../presentation";
import { primeniPrikazMedija } from "../public-view";
import {
  MENU_PART_SPLITTER,
  compileSnapshot,
  type CompileContext,
  type CompiledVersion,
  type MenuDraftSnapshot,
  type PublicArticle,
  type PublicSection,
  type PublicSplitterDoc,
} from "../snapshot";
import { MENU_BREND_MAX_BOJA, brendBoje, brendUloge, paletaIzBrenda, type BrendUloge } from "./brand-palette";
import { MENU_KONTRAST_FOKUS, MENU_KONTRAST_TEKST, proveriKontrast } from "./contrast";
import { MENU_PAROVI_FONTOVA, parPoId } from "./font-pairs";
import {
  izgledCas,
  izmenaCas,
  proveriIzmenuIzgleda,
  MENU_IZGLED_POLJA,
  type IzgledIzmena,
  type IzgledProvera,
} from "./izbor";
import { MENU_JAVNE_PALETE, jeBrendPaleta, jePoznataPaleta, paletaPoId } from "./palettes";
import { MENU_IZGLED_SVE, izgledZaPlan, premiumDelovi, type MenuIzgledPlan } from "./premium";
import { javniIzgled } from "./public-tokens";
import { MENU_VARIJANTE_RASPOREDA, varijanteRasporeda, varijantaRasporeda } from "./varijante";

const STANDARD: MenuIzgledPlan = { extraLayouts: false, reducedBranding: false };
const PREMIUM: MenuIzgledPlan = { extraLayouts: true, reducedBranding: true };

const present = (over: Partial<MenuPresentationValues> = {}): MenuPresentationValues => ({
  ...MENU_DEFAULT_PRESENTATION,
  ...over,
});

/** A change as the editor sends it; invalid values on purpose are cast. */
const izmeni = (
  izmena: IzgledIzmena,
  plan: MenuIzgledPlan = STANDARD,
  pre: MenuPresentationValues = MENU_DEFAULT_PRESENTATION,
): IzgledProvera => proveriIzmenuIzgleda(pre, izmena, plan);

function uspeh(ishod: IzgledProvera) {
  if (!ishod.ok) throw new Error(`the change was refused: ${ishod.kod}`);
  return ishod;
}

function odbijeno(ishod: IzgledProvera) {
  if (ishod.ok) throw new Error("the change was accepted");
  return ishod;
}

const UNREADABLE_BRAND = ["#8C2633", "#FFFFFF", "#AAAAAA"];

const LIGHT_BASE = {
  page: "#FFFFFF",
  surface: "#FFFFFF",
  title: "#1A1A1A",
  body: "#3A3A3A",
  accent: "#1F5F7A",
  border: "#DDDDDD",
  focus: "#1F5F7A",
  icon: "#1F5F7A",
};

// -----------------------------------------------------------------------------
// The automatic contrast check
// -----------------------------------------------------------------------------

describe("proveriKontrast refuses an unreadable palette", () => {
  test("the thresholds are 4.5 for text and 3 for the focus ring", () => {
    expect(MENU_KONTRAST_TEKST).toBe(4.5);
    expect(MENU_KONTRAST_FOKUS).toBe(3);
  });

  test("a readable palette passes with no errors", () => {
    expect(proveriKontrast(LIGHT_BASE)).toEqual({ ok: true, greske: [] });
  });

  test("grey text on a white page and card is refused with the ratio and the threshold", () => {
    const ishod = proveriKontrast({ ...LIGHT_BASE, title: "#999999", body: "#A9A9A9" });
    expect(ishod.ok).toBe(false);
    const parovi = ishod.greske.map((row) => row.par);
    expect(parovi).toEqual(expect.arrayContaining(["title/page", "title/surface", "body/page", "body/surface"]));
    const naslov = ishod.greske.find((row) => row.par === "title/page");
    expect(naslov?.prag).toBe(4.5);
    expect(naslov?.odnos).toBeLessThan(4.5);
    expect(naslov?.odnos).toBeGreaterThan(2);
    const telo = ishod.greske.find((row) => row.par === "body/page");
    expect(telo?.prag).toBe(4.5);
    expect(telo?.odnos).toBeLessThan(naslov?.odnos ?? 0);
  });

  test("text exactly at the 4.5 line passes, just under it fails", () => {
    // #767676 on white is 4.54:1; #777777 is 4.48:1.
    expect(proveriKontrast({ ...LIGHT_BASE, title: "#767676", body: "#767676" }).ok).toBe(true);
    const ishod = proveriKontrast({ ...LIGHT_BASE, title: "#777777" });
    expect(ishod.ok).toBe(false);
    expect(ishod.greske.map((row) => row.par)).toEqual(["title/page", "title/surface"]);
  });

  test("the focus ring needs 3:1, not 4.5:1", () => {
    // #949494 on white is 3.03:1: enough for the ring, far from enough for text.
    expect(proveriKontrast({ ...LIGHT_BASE, focus: "#949494" }).ok).toBe(true);
    const ishod = proveriKontrast({ ...LIGHT_BASE, focus: "#999999" });
    expect(ishod.ok).toBe(false);
    expect(ishod.greske.map((row) => row.par)).toEqual(["focus/page", "focus/surface"]);
    expect(ishod.greske.every((row) => row.prag === 3)).toBe(true);
    expect(ishod.greske.every((row) => row.odnos < 3)).toBe(true);
  });

  test("the surface is checked as well as the page", () => {
    const ishod = proveriKontrast({ ...LIGHT_BASE, page: "#FFFFFF", surface: "#C8C8C8", title: "#6A6A6A", body: "#1A1A1A" });
    expect(ishod.ok).toBe(false);
    expect(ishod.greske.map((row) => row.par)).toContain("title/surface");
    expect(ishod.greske.map((row) => row.par)).not.toContain("title/page");
  });
});

// -----------------------------------------------------------------------------
// The venue's brand colours
// -----------------------------------------------------------------------------

describe("brendUloge", () => {
  test("a single main colour is valid: the page and the text are derived", () => {
    expect(brendUloge(["#B3261E"])).toEqual({ akcenat: "#B3261E", pozadina: null, tekst: null });
  });

  test("an empty string means derived", () => {
    expect(brendUloge(["#B3261E", "", ""])).toEqual({ akcenat: "#B3261E", pozadina: null, tekst: null });
    expect(brendUloge(["#B3261E", "", "#1A1A1A"])).toEqual({ akcenat: "#B3261E", pozadina: null, tekst: "#1A1A1A" });
    expect(brendUloge(["#B3261E", "#FFF8EC"])).toEqual({ akcenat: "#B3261E", pozadina: "#FFF8EC", tekst: null });
  });

  test("two and three colours fill the roles by position", () => {
    expect(brendUloge(["#B3261E", "#FFF8EC"])?.pozadina).toBe("#FFF8EC");
    expect(brendUloge(["#B3261E", "#FFF8EC", "#1A1A1A"])).toEqual({
      akcenat: "#B3261E",
      pozadina: "#FFF8EC",
      tekst: "#1A1A1A",
    });
  });

  test("lowercase hex is normalised to uppercase", () => {
    expect(brendUloge(["#b3261e", "#fff8ec", "#1a1a1a"])).toEqual({
      akcenat: "#B3261E",
      pozadina: "#FFF8EC",
      tekst: "#1A1A1A",
    });
  });

  test("the limit is three colours", () => {
    expect(MENU_BREND_MAX_BOJA).toBe(3);
  });

  test.each([
    ["no list", null],
    ["undefined", undefined],
    ["an empty list", []],
    ["four colours", ["#B3261E", "#FFFFFF", "#1A1A1A", "#000000"]],
    ["an empty main colour", ["", "#FFFFFF"]],
    ["only an empty main colour", [""]],
    ["a short hex", ["#12345"]],
    ["a hex without the hash", ["B3261E"]],
    ["a colour name", ["red"]],
    ["non-hex digits", ["#GGGGGG"]],
    ["an invalid page colour", ["#B3261E", "#12345"]],
    ["an invalid text colour", ["#B3261E", "", "red"]],
    ["an eight-digit hex", ["#B3261E80"]],
  ] as const)("returns null for %s", (_naziv, boje) => {
    expect(brendUloge(boje as readonly string[] | null | undefined)).toBeNull();
  });
});

describe("brendBoje", () => {
  test("drops the trailing empties", () => {
    expect(brendBoje({ akcenat: "#B3261E", pozadina: null, tekst: null })).toEqual(["#B3261E"]);
    expect(brendBoje({ akcenat: "#B3261E", pozadina: "#FFFFFF", tekst: null })).toEqual(["#B3261E", "#FFFFFF"]);
  });

  test("keeps an empty middle role so the text colour stays in its position", () => {
    expect(brendBoje({ akcenat: "#B3261E", pozadina: null, tekst: "#1A1A1A" })).toEqual(["#B3261E", "", "#1A1A1A"]);
  });

  test("round trip: roles → stored colours → roles", () => {
    const uloge: BrendUloge[] = [
      { akcenat: "#B3261E", pozadina: null, tekst: null },
      { akcenat: "#B3261E", pozadina: "#FFF8EC", tekst: null },
      { akcenat: "#B3261E", pozadina: null, tekst: "#1A1A1A" },
      { akcenat: "#B3261E", pozadina: "#FFF8EC", tekst: "#1A1A1A" },
    ];
    for (const jedna of uloge) expect(brendUloge(brendBoje(jedna))).toEqual(jedna);
  });

  test("round trip: stored colours with trailing empties and lowercase become the canonical form", () => {
    const uloge = brendUloge(["#b3261e", "", ""]);
    expect(uloge).not.toBeNull();
    expect(brendBoje(uloge as BrendUloge)).toEqual(["#B3261E"]);
  });
});

describe("paletaIzBrenda", () => {
  const AKCENTI = ["#B3261E", "#1F5F7A", "#F2C14E", "#0B6E4F"];

  describe.each(AKCENTI)("a single main colour %s", (akcenat) => {
    const uloge: BrendUloge = { akcenat, pozadina: null, tekst: null };

    test("gives a readable light palette with a light page", () => {
      const ishod = paletaIzBrenda(uloge, "svetla");
      expect(ishod.greske).toEqual([]);
      expect(ishod.ok).toBe(true);
      expect(oklch(ishod.boje.page)?.l ?? 0).toBeGreaterThan(0.9);
      expect(oklch(ishod.boje.surface)?.l ?? 0).toBeGreaterThan(0.9);
    });

    test("gives a readable dark palette with a dark page", () => {
      const ishod = paletaIzBrenda(uloge, "tamna");
      expect(ishod.greske).toEqual([]);
      expect(ishod.ok).toBe(true);
      expect(oklch(ishod.boje.page)?.l ?? 1).toBeLessThan(0.3);
      expect(oklch(ishod.boje.surface)?.l ?? 1).toBeLessThan(0.35);
    });

    test("keeps the accent verbatim in both tones", () => {
      expect(paletaIzBrenda(uloge, "svetla").boje.accent).toBe(akcenat);
      expect(paletaIzBrenda(uloge, "tamna").boje.accent).toBe(akcenat);
    });

    test("is deterministic", () => {
      expect(paletaIzBrenda(uloge, "svetla")).toEqual(paletaIzBrenda(uloge, "svetla"));
      expect(paletaIzBrenda(uloge, "tamna")).toEqual(paletaIzBrenda(uloge, "tamna"));
    });
  });

  test("gives all eight menu roles as hex colours", () => {
    const { boje } = paletaIzBrenda({ akcenat: "#B3261E", pozadina: null, tekst: null }, "svetla");
    expect(Object.keys(boje).sort()).toEqual(["accent", "body", "border", "focus", "icon", "page", "surface", "title"]);
    for (const value of Object.values(boje)) expect(value).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  test("an explicit unreadable text colour is NOT silently fixed: it is refused", () => {
    const ishod = paletaIzBrenda({ akcenat: "#1F5F7A", pozadina: "#FFFFFF", tekst: "#999999" }, "svetla");
    expect(ishod.ok).toBe(false);
    expect(ishod.boje.title).toBe("#999999");
    expect(ishod.boje.page).toBe("#FFFFFF");
    const parovi = ishod.greske.map((row) => row.par);
    expect(parovi).toEqual(expect.arrayContaining(["title/page", "title/surface", "body/page", "body/surface"]));
    for (const greska of ishod.greske) expect(greska.odnos).toBeLessThan(greska.prag);
  });

  test("an explicit readable text colour on an explicit page is accepted as is", () => {
    const ishod = paletaIzBrenda({ akcenat: "#1F5F7A", pozadina: "#FFFFFF", tekst: "#1A1A1A" }, "svetla");
    expect(ishod.greske).toEqual([]);
    expect(ishod.ok).toBe(true);
    expect(ishod.boje.page).toBe("#FFFFFF");
    expect(ishod.boje.title).toBe("#1A1A1A");
    expect(ishod.boje.accent).toBe("#1F5F7A");
  });

  test("an explicit dark page with light text is accepted, whatever tone was asked for", () => {
    const uloge: BrendUloge = { akcenat: "#C8A46A", pozadina: "#101010", tekst: "#F5F5F5" };
    for (const ton of ["svetla", "tamna"] as const) {
      const ishod = paletaIzBrenda(uloge, ton);
      expect(ishod.ok).toBe(true);
      expect(ishod.boje.page).toBe("#101010");
      expect(ishod.boje.title).toBe("#F5F5F5");
    }
  });

  test("an explicit page with derived text stays readable and keeps the page as set", () => {
    const ishod = paletaIzBrenda({ akcenat: "#C8A46A", pozadina: "#101010", tekst: null }, "svetla");
    expect(ishod.boje.page).toBe("#101010");
    expect(ishod.ok).toBe(true);
  });
});

// -----------------------------------------------------------------------------
// The Premium catalog
// -----------------------------------------------------------------------------

describe("the Premium catalog", () => {
  const PREMIUM_PALETE = ["sampanjac", "indigo", "vino", "sumrak"];
  const STANDARD_PALETE = ["topla", "espresso", "bordo", "more", "kamen", "ponoc", "ugalj"];
  const PREMIUM_PAROVI = ["galerija", "atelje", "grotesk"];
  const STANDARD_PAROVI = ["osnovni", "kafe", "bistro", "klasika", "elegancija", "knjiga", "savremeno"];

  test("sampanjac, indigo, vino and sumrak are the Premium palettes", () => {
    const premium = MENU_JAVNE_PALETE.filter((paleta) => paleta.premium).map((paleta) => paleta.id);
    expect(premium.sort()).toEqual([...PREMIUM_PALETE].sort());
  });

  test("the seven K13 palettes stay Standard", () => {
    const standard = MENU_JAVNE_PALETE.filter((paleta) => !paleta.premium).map((paleta) => paleta.id);
    expect(standard.sort()).toEqual([...STANDARD_PALETE].sort());
  });

  test("galerija, atelje and grotesk are the Premium font pairs; the others stay Standard", () => {
    const premium = MENU_PAROVI_FONTOVA.filter((par) => par.premium).map((par) => par.id);
    const standard = MENU_PAROVI_FONTOVA.filter((par) => !par.premium).map((par) => par.id);
    expect(premium.sort()).toEqual([...PREMIUM_PAROVI].sort());
    expect(standard.sort()).toEqual([...STANDARD_PAROVI].sort());
  });

  test("no palette id mentions ScanMe, Premium ones included", () => {
    for (const paleta of MENU_JAVNE_PALETE) expect(paleta.id.toLowerCase()).not.toContain("scanme");
    for (const id of PREMIUM_PALETE) expect(id.toLowerCase()).not.toContain("scanme");
    expect(jePoznataPaleta("scanme")).toBe(false);
  });

  test.each(MENU_JAVNE_PALETE)("palette $id (premium: $premium) passes the contrast check", (paleta) => {
    const ishod = proveriKontrast(paleta.boje);
    expect(ishod.greske).toEqual([]);
    expect(ishod.ok).toBe(true);
  });

  test("the declared tone of every Premium palette matches its page", () => {
    for (const paleta of MENU_JAVNE_PALETE.filter((jedna) => jedna.premium)) {
      const svetlina = oklch(paleta.boje.page)?.l ?? 0;
      if (paleta.ton === "tamna") expect(svetlina).toBeLessThan(0.4);
      else expect(svetlina).toBeGreaterThan(0.8);
    }
  });

  test("the venue's brand palette is not in the catalog", () => {
    expect(jePoznataPaleta("brend")).toBe(false);
    expect(jePoznataPaleta("brend-tamna")).toBe(false);
    expect(jeBrendPaleta("brend")).toBe(true);
    expect(jeBrendPaleta("brend-tamna")).toBe(true);
    expect(jeBrendPaleta("topla")).toBe(false);
    expect(jeBrendPaleta(null)).toBe(false);
  });
});

describe("varijante rasporeda", () => {
  test("flow + kartice is a variant", () => {
    expect(varijantaRasporeda("flow", "kartice")).toEqual({ id: "kartice", layout: "flow", premium: true });
  });

  test("categories + lista and compact + dve-kolone are variants", () => {
    expect(varijantaRasporeda("categories", "lista")?.id).toBe("lista");
    expect(varijantaRasporeda("compact", "dve-kolone")?.id).toBe("dve-kolone");
  });

  test("a variant of another layout is null", () => {
    expect(varijantaRasporeda("compact", "kartice")).toBeNull();
    expect(varijantaRasporeda("flow", "lista")).toBeNull();
    expect(varijantaRasporeda("categories", "dve-kolone")).toBeNull();
  });

  test("an unknown, empty or absent variant is null", () => {
    expect(varijantaRasporeda("flow", "nepostoji")).toBeNull();
    expect(varijantaRasporeda("flow", "")).toBeNull();
    expect(varijantaRasporeda("flow", null)).toBeNull();
    expect(varijantaRasporeda("flow", undefined)).toBeNull();
  });

  test.each(["flow", "categories", "compact"] as const)("layout %s has exactly one variant", (layout) => {
    expect(varijanteRasporeda(layout)).toHaveLength(1);
    expect(varijanteRasporeda(layout)[0].layout).toBe(layout);
  });

  test("every variant is Premium and ids are unique", () => {
    expect(MENU_VARIJANTE_RASPOREDA.every((varijanta) => varijanta.premium === true)).toBe(true);
    const ids = MENU_VARIJANTE_RASPOREDA.map((varijanta) => varijanta.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(3);
  });
});

// -----------------------------------------------------------------------------
// premiumDelovi and izgledZaPlan
// -----------------------------------------------------------------------------

describe("premiumDelovi", () => {
  test("the default presentation has no Premium part", () => {
    expect(premiumDelovi(MENU_DEFAULT_PRESENTATION)).toEqual({ paleta: false, par: false, varijanta: false, brending: false });
  });

  test("names each Premium part", () => {
    expect(premiumDelovi(present({ paletteId: "vino" })).paleta).toBe(true);
    expect(premiumDelovi(present({ fontPairId: "grotesk" })).par).toBe(true);
    expect(premiumDelovi(present({ layoutVariant: "kartice" })).varijanta).toBe(true);
    expect(premiumDelovi(present({ branding: "reduced" })).brending).toBe(true);
  });

  test("Standard palettes and pairs are not Premium", () => {
    expect(premiumDelovi(present({ paletteId: "ponoc", fontPairId: "klasika" }))).toMatchObject({ paleta: false, par: false });
  });

  test("an unknown id, the default id and the brand palettes resolve to another palette: never Premium", () => {
    for (const paletteId of ["default", "nepostoji", "scanme", "brend", "brend-tamna"]) {
      expect(premiumDelovi(present({ paletteId })).paleta).toBe(false);
    }
    expect(premiumDelovi(present({ fontPairId: "nepostoji" })).par).toBe(false);
  });

  test("a variant of another layout is not a Premium part", () => {
    expect(premiumDelovi(present({ layout: "compact", layoutVariant: "kartice" })).varijanta).toBe(false);
  });
});

describe("izgledZaPlan", () => {
  const PUN = present({
    paletteId: "sampanjac",
    fontPairId: "galerija",
    layout: "flow",
    layoutVariant: "kartice",
    branding: "reduced",
    density: "airy",
  });

  test.each(["sampanjac", "indigo"])("Standard turns the light Premium palette %s into the default", (paletteId) => {
    expect(izgledZaPlan(present({ paletteId }), STANDARD).paletteId).toBe("default");
  });

  test.each(["vino", "sumrak"])("Standard turns the dark Premium palette %s into ponoc", (paletteId) => {
    expect(izgledZaPlan(present({ paletteId }), STANDARD).paletteId).toBe("ponoc");
  });

  test.each(["galerija", "atelje", "grotesk"])("Standard turns the Premium pair %s into the default pair", (fontPairId) => {
    expect(izgledZaPlan(present({ fontPairId }), STANDARD).fontPairId).toBe("default");
  });

  test("Standard drops the layout variant: the key is gone, not null", () => {
    const rezultat = izgledZaPlan(present({ layoutVariant: "kartice" }), STANDARD);
    expect("layoutVariant" in rezultat).toBe(false);
    expect(rezultat.layout).toBe("flow");
  });

  test("Standard turns reduced branding into standard", () => {
    expect(izgledZaPlan(present({ branding: "reduced" }), STANDARD).branding).toBe("standard");
  });

  test("Standard replaces every Premium part at once and keeps everything else", () => {
    expect(izgledZaPlan(PUN, STANDARD)).toEqual(
      present({ paletteId: "default", fontPairId: "default", layout: "flow", branding: "standard", density: "airy" }),
    );
  });

  test("the full plan returns the SAME object", () => {
    expect(izgledZaPlan(PUN, MENU_IZGLED_SVE)).toBe(PUN);
    expect(izgledZaPlan(PUN, PREMIUM)).toBe(PUN);
  });

  test("a presentation without Premium parts returns the same object on Standard too", () => {
    const obicna = present({ paletteId: "ponoc", fontPairId: "klasika", layout: "categories", density: "dense" });
    expect(izgledZaPlan(obicna, STANDARD)).toBe(obicna);
    expect(izgledZaPlan(MENU_DEFAULT_PRESENTATION, STANDARD)).toBe(MENU_DEFAULT_PRESENTATION);
  });

  test("a brand palette is not Premium: it stays on Standard", () => {
    const brend = present({ paletteId: "brend", brandColors: ["#B3261E"] });
    expect(izgledZaPlan(brend, STANDARD)).toBe(brend);
  });

  test("the two capabilities are independent", () => {
    const samoRaspored = izgledZaPlan(PUN, { extraLayouts: true, reducedBranding: false });
    expect(samoRaspored).toMatchObject({ paletteId: "sampanjac", fontPairId: "galerija", layoutVariant: "kartice", branding: "standard" });
    const samoBrending = izgledZaPlan(PUN, { extraLayouts: false, reducedBranding: true });
    expect(samoBrending).toMatchObject({ paletteId: "default", fontPairId: "default", branding: "reduced" });
    expect("layoutVariant" in samoBrending).toBe(false);
  });

  test("a variant that does not belong to the layout is dropped even on Premium", () => {
    const pogresna = present({ layout: "compact", layoutVariant: "kartice" });
    const rezultat = izgledZaPlan(pogresna, MENU_IZGLED_SVE);
    expect("layoutVariant" in rezultat).toBe(false);
  });

  test("does not mutate its input", () => {
    const pre = JSON.stringify(PUN);
    izgledZaPlan(PUN, STANDARD);
    expect(JSON.stringify(PUN)).toBe(pre);
  });
});

// -----------------------------------------------------------------------------
// proveriIzmenuIzgleda
// -----------------------------------------------------------------------------

describe("proveriIzmenuIzgleda: unknown ids", () => {
  test.each(["scanme", "nepostoji", "", "BORDO"])("the palette %j is unknown", (paletteId) => {
    for (const plan of [STANDARD, PREMIUM]) {
      expect(odbijeno(izmeni({ paletteId }, plan))).toMatchObject({ kod: "presentation/unknown_palette" });
    }
  });

  test.each(["nepostoji", "scanme", "OSNOVNI"])("the font pair %j is unknown", (fontPairId) => {
    for (const plan of [STANDARD, PREMIUM]) {
      expect(odbijeno(izmeni({ fontPairId }, plan))).toMatchObject({ kod: "presentation/unknown_font_pair" });
    }
  });

  test('"default" is a valid palette and a valid pair', () => {
    expect(izmeni({ paletteId: "default" }).ok).toBe(true);
    expect(izmeni({ fontPairId: "default" }).ok).toBe(true);
  });

  test("every Standard palette and pair can be chosen on Standard", () => {
    for (const paleta of MENU_JAVNE_PALETE.filter((jedna) => !jedna.premium)) {
      expect(uspeh(izmeni({ paletteId: paleta.id })).vrednosti.paletteId).toBe(paleta.id);
    }
    for (const par of MENU_PAROVI_FONTOVA.filter((jedan) => !jedan.premium)) {
      expect(uspeh(izmeni({ fontPairId: par.id })).vrednosti.fontPairId).toBe(par.id);
    }
  });
});

describe("proveriIzmenuIzgleda: the Premium gate", () => {
  test.each(["sampanjac", "indigo", "vino", "sumrak"])("the Premium palette %s needs Premium", (paletteId) => {
    expect(odbijeno(izmeni({ paletteId }, STANDARD))).toMatchObject({ kod: "plan/premium_required" });
    expect(uspeh(izmeni({ paletteId }, PREMIUM)).vrednosti.paletteId).toBe(paletteId);
  });

  test.each(["galerija", "atelje", "grotesk"])("the Premium pair %s needs Premium", (fontPairId) => {
    expect(odbijeno(izmeni({ fontPairId }, STANDARD))).toMatchObject({ kod: "plan/premium_required" });
    expect(uspeh(izmeni({ fontPairId }, PREMIUM)).vrednosti.fontPairId).toBe(fontPairId);
  });

  test("a layout variant needs Premium", () => {
    expect(odbijeno(izmeni({ layoutVariant: "kartice" }, STANDARD))).toMatchObject({ kod: "plan/premium_required" });
    expect(uspeh(izmeni({ layoutVariant: "kartice" }, PREMIUM)).vrednosti.layoutVariant).toBe("kartice");
  });

  test("a layout change together with its own variant needs Premium and works with it", () => {
    const izmena: IzgledIzmena = { layout: "categories", layoutVariant: "lista" };
    expect(odbijeno(izmeni(izmena, STANDARD))).toMatchObject({ kod: "plan/premium_required" });
    const vrednosti = uspeh(izmeni(izmena, PREMIUM)).vrednosti;
    expect(vrednosti.layout).toBe("categories");
    expect(vrednosti.layoutVariant).toBe("lista");
  });

  test("reduced branding needs Premium; standard branding never does", () => {
    expect(odbijeno(izmeni({ branding: "reduced" }, STANDARD))).toMatchObject({ kod: "plan/premium_required" });
    expect(uspeh(izmeni({ branding: "reduced" }, PREMIUM)).vrednosti.branding).toBe("reduced");
    expect(izmeni({ branding: "standard" }, STANDARD).ok).toBe(true);
  });

  test("reduced branding follows reducedBranding, the layouts follow extraLayouts", () => {
    expect(izmeni({ branding: "reduced" }, { extraLayouts: true, reducedBranding: false }).ok).toBe(false);
    expect(izmeni({ branding: "reduced" }, { extraLayouts: false, reducedBranding: true }).ok).toBe(true);
    expect(izmeni({ paletteId: "vino" }, { extraLayouts: false, reducedBranding: true }).ok).toBe(false);
    expect(izmeni({ paletteId: "vino" }, { extraLayouts: true, reducedBranding: false }).ok).toBe(true);
  });

  test("a refusal reports no contrast errors", () => {
    expect(odbijeno(izmeni({ paletteId: "vino" }, STANDARD)).greske).toEqual([]);
  });
});

describe("proveriIzmenuIzgleda: layout and variant", () => {
  const SA_VARIJANTOM = present({ layout: "flow", layoutVariant: "kartice" });

  test("a variant of another layout is refused, on both plans", () => {
    for (const plan of [STANDARD, PREMIUM]) {
      expect(odbijeno(izmeni({ layoutVariant: "lista" }, plan))).toMatchObject({ kod: "presentation/variant_mismatch" });
      expect(odbijeno(izmeni({ layoutVariant: "nepostoji" }, plan))).toMatchObject({ kod: "presentation/variant_mismatch" });
    }
  });

  test("a new layout with the variant of the old one is refused", () => {
    expect(odbijeno(izmeni({ layout: "categories", layoutVariant: "kartice" }, PREMIUM))).toMatchObject({
      kod: "presentation/variant_mismatch",
    });
  });

  test("changing the layout without a variant drops the old variant", () => {
    const ishod = uspeh(izmeni({ layout: "compact" }, PREMIUM, SA_VARIJANTOM));
    expect(ishod.vrednosti.layout).toBe("compact");
    expect("layoutVariant" in ishod.vrednosti).toBe(false);
    expect(ishod.promena).toBe(true);
  });

  test("an account that lost Premium can still change the layout of a draft that has a variant", () => {
    const ishod = uspeh(izmeni({ layout: "categories" }, STANDARD, SA_VARIJANTOM));
    expect(ishod.vrednosti.layout).toBe("categories");
    expect("layoutVariant" in ishod.vrednosti).toBe(false);
  });

  test("choosing the same layout keeps the variant", () => {
    const ishod = uspeh(izmeni({ layout: "flow" }, PREMIUM, SA_VARIJANTOM));
    expect(ishod.vrednosti.layoutVariant).toBe("kartice");
    expect(ishod.promena).toBe(false);
  });

  test("null removes the variant; removing a variant that is not there changes nothing", () => {
    const uklonjena = uspeh(izmeni({ layoutVariant: null }, STANDARD, SA_VARIJANTOM));
    expect("layoutVariant" in uklonjena.vrednosti).toBe(false);
    expect(uklonjena.promena).toBe(true);
    expect(uspeh(izmeni({ layoutVariant: null })).promena).toBe(false);
  });

  test("an unknown layout is invalid input", () => {
    expect(odbijeno(izmeni({ layout: "grid" } as unknown as IzgledIzmena))).toMatchObject({ kod: "menu/invalid_input" });
  });
});

describe("proveriIzmenuIzgleda: the brand palette", () => {
  test("unreadable brand colours are refused with the failing pairs", () => {
    const ishod = odbijeno(izmeni({ paletteId: "brend", brandColors: UNREADABLE_BRAND }));
    expect(ishod.kod).toBe("presentation/unreadable");
    expect(ishod.greske.length).toBeGreaterThan(0);
    expect(ishod.greske.map((row) => row.par)).toEqual(expect.arrayContaining(["title/page", "body/page"]));
    for (const greska of ishod.greske) expect(greska.odnos).toBeLessThan(greska.prag);
  });

  test("the dark brand palette is refused for the same unreadable colours", () => {
    const ishod = odbijeno(izmeni({ paletteId: "brend-tamna", brandColors: ["#8C2633", "#101010", "#303030"] }));
    expect(ishod.kod).toBe("presentation/unreadable");
    expect(ishod.greske.length).toBeGreaterThan(0);
  });

  test("a single main colour is accepted, on Standard too: the brand palette is not Premium", () => {
    for (const plan of [STANDARD, PREMIUM]) {
      const ishod = uspeh(izmeni({ paletteId: "brend", brandColors: ["#8C2633"] }, plan));
      expect(ishod.vrednosti.paletteId).toBe("brend");
      expect(ishod.vrednosti.brandColors).toEqual(["#8C2633"]);
      expect(ishod.promena).toBe(true);
    }
  });

  test("the dark brand palette is accepted for a single main colour", () => {
    const ishod = uspeh(izmeni({ paletteId: "brend-tamna", brandColors: ["#8C2633"] }));
    expect(ishod.vrednosti.paletteId).toBe("brend-tamna");
  });

  test("the stored colours are normalised: uppercase, trailing empties dropped", () => {
    const ishod = uspeh(izmeni({ paletteId: "brend", brandColors: ["#8c2633", "", ""] }));
    expect(ishod.vrednosti.brandColors).toEqual(["#8C2633"]);
  });

  test("the brand palette without brand colours is invalid_brand_colors", () => {
    expect(odbijeno(izmeni({ paletteId: "brend" }))).toMatchObject({ kod: "presentation/invalid_brand_colors" });
    expect(odbijeno(izmeni({ paletteId: "brend-tamna" }))).toMatchObject({ kod: "presentation/invalid_brand_colors" });
  });

  const NEVALIDNE_BOJE: string[][] = [["#12345"], ["B3261E"], ["red"], [], ["#B3261E", "#FFFFFF", "#1A1A1A", "#000000"], [""]];
  test.each(NEVALIDNE_BOJE.map((boje) => ({ boje })))("the brand colours $boje are invalid", ({ boje }) => {
    expect(odbijeno(izmeni({ brandColors: boje }))).toMatchObject({ kod: "presentation/invalid_brand_colors" });
    expect(odbijeno(izmeni({ paletteId: "brend", brandColors: boje }))).toMatchObject({
      kod: "presentation/invalid_brand_colors",
    });
  });

  test("colours can be stored while another palette is chosen; they are checked once the brand palette is chosen", () => {
    const sacuvane = uspeh(izmeni({ brandColors: UNREADABLE_BRAND }));
    expect(sacuvane.vrednosti.brandColors).toEqual(UNREADABLE_BRAND);
    expect(sacuvane.vrednosti.paletteId).toBe("default");
    expect(odbijeno(izmeni({ paletteId: "brend" }, STANDARD, sacuvane.vrednosti))).toMatchObject({
      kod: "presentation/unreadable",
    });
  });

  test("changing the colours of the chosen brand palette checks them again", () => {
    const brend = present({ paletteId: "brend", brandColors: ["#8C2633"] });
    expect(odbijeno(izmeni({ brandColors: UNREADABLE_BRAND }, STANDARD, brend))).toMatchObject({
      kod: "presentation/unreadable",
    });
    expect(uspeh(izmeni({ brandColors: ["#1F5F7A"] }, STANDARD, brend)).vrednosti.brandColors).toEqual(["#1F5F7A"]);
  });

  test("removing the colours of the chosen brand palette is refused; leaving the brand palette removes them", () => {
    const brend = present({ paletteId: "brend", brandColors: ["#8C2633"] });
    expect(odbijeno(izmeni({ brandColors: null }, STANDARD, brend))).toMatchObject({
      kod: "presentation/invalid_brand_colors",
    });
    const izasao = uspeh(izmeni({ paletteId: "topla", brandColors: null }, STANDARD, brend));
    expect(izasao.vrednosti).toMatchObject({ paletteId: "topla", brandColors: null });
  });

  test("a change that does not touch the palette does not re-check a stored brand palette", () => {
    const brend = present({ paletteId: "brend", brandColors: UNREADABLE_BRAND });
    expect(uspeh(izmeni({ density: "dense" }, STANDARD, brend)).vrednosti.density).toBe("dense");
  });
});

describe("proveriIzmenuIzgleda: filters", () => {
  test.each([["vegan2"], ["price_range"], ["price"], ["PROMO"], [""]])("the filter %j is refused", (kod) => {
    expect(odbijeno(izmeni({ filters: [kod] }))).toMatchObject({ kod: "menu/invalid_input" });
  });

  test("one unknown code refuses the whole list", () => {
    expect(odbijeno(izmeni({ filters: ["vegan", "price_range"] }))).toMatchObject({ kod: "menu/invalid_input" });
  });

  test("known codes are stored in the canonical order and without duplicates", () => {
    const ishod = uspeh(izmeni({ filters: ["promo", "vegan", "spicy", "vegan"] }));
    expect(ishod.vrednosti.filters).toEqual(["vegan", "spicy", "promo"]);
  });

  test("every known code in reverse order comes back canonical", () => {
    const obrnuto = [...MENU_FILTER_CODES].reverse();
    expect(uspeh(izmeni({ filters: obrnuto })).vrednosti.filters).toEqual([...MENU_FILTER_CODES]);
  });

  test("the same set in another order is no change", () => {
    const pre = present({ filters: ["vegan", "promo"] });
    const ishod = uspeh(izmeni({ filters: ["promo", "vegan"] }, STANDARD, pre));
    expect(ishod.promena).toBe(false);
  });

  test("an empty list turns all filters off", () => {
    const ishod = uspeh(izmeni({ filters: [] }, STANDARD, present({ filters: ["vegan"] })));
    expect(ishod.vrednosti.filters).toEqual([]);
    expect(ishod.promena).toBe(true);
  });
});

describe("proveriIzmenuIzgleda: the shape of a change", () => {
  test("an empty change is invalid input", () => {
    expect(odbijeno(izmeni({}))).toMatchObject({ kod: "menu/invalid_input" });
  });

  test("a change whose fields are all undefined is invalid input", () => {
    expect(odbijeno(izmeni({ layout: undefined, density: undefined }))).toMatchObject({ kod: "menu/invalid_input" });
  });

  test("an unknown key is invalid input, alone or next to a valid field", () => {
    expect(odbijeno(izmeni({ nepoznato: 1 } as unknown as IzgledIzmena))).toMatchObject({ kod: "menu/invalid_input" });
    expect(odbijeno(izmeni({ density: "dense", nepoznato: 1 } as unknown as IzgledIzmena))).toMatchObject({
      kod: "menu/invalid_input",
    });
  });

  test.each([
    ["density", { density: "huge" }],
    ["emphasis", { emphasis: "loud" }],
    ["defaultMediaMode", { defaultMediaMode: "video" }],
    ["branding", { branding: "hidden" }],
  ])("an unknown %s is invalid input", (_polje, izmena) => {
    expect(odbijeno(izmeni(izmena as unknown as IzgledIzmena))).toMatchObject({ kod: "menu/invalid_input" });
  });

  test("a refusal carries no contrast errors unless it is unreadable", () => {
    expect(odbijeno(izmeni({})).greske).toEqual([]);
    expect(odbijeno(izmeni({ paletteId: "scanme" })).greske).toEqual([]);
  });

  test("the same value is accepted with promena false, whatever the field", () => {
    const iste: IzgledIzmena[] = [
      { layout: "flow" },
      { paletteId: "default" },
      { fontPairId: "default" },
      { density: "standard" },
      { emphasis: "calm" },
      { defaultMediaMode: "image" },
      { search: false },
      { currencyToggle: false },
      { filters: [] },
      { branding: "standard" },
      { brandColors: null },
      { layoutVariant: null },
    ];
    for (const izmena of iste) {
      const ishod = uspeh(izmeni(izmena));
      expect(ishod.promena, JSON.stringify(izmena)).toBe(false);
      expect(ishod.vrednosti).toEqual(MENU_DEFAULT_PRESENTATION);
    }
  });

  test("a real change reports promena true and changes only that field", () => {
    const ishod = uspeh(izmeni({ density: "dense" }));
    expect(ishod.promena).toBe(true);
    expect(ishod.vrednosti).toEqual({ ...MENU_DEFAULT_PRESENTATION, density: "dense" });
  });

  test.each([
    ["emphasis", { emphasis: "bold" }],
    ["defaultMediaMode", { defaultMediaMode: "none" }],
    ["search", { search: true }],
    ["currencyToggle", { currencyToggle: true }],
    ["filters", { filters: ["vegan"] }],
    ["paletteId", { paletteId: "ponoc" }],
    ["fontPairId", { fontPairId: "klasika" }],
    ["layout", { layout: "compact" }],
  ] as const)("a real change of %s reports promena true", (_polje, izmena) => {
    expect(uspeh(izmeni(izmena as unknown as IzgledIzmena)).promena).toBe(true);
  });

  test("several fields change together", () => {
    const ishod = uspeh(izmeni({ density: "airy", emphasis: "bold", search: true }));
    expect(ishod.vrednosti).toEqual({ ...MENU_DEFAULT_PRESENTATION, density: "airy", emphasis: "bold", search: true });
  });

  test("one refused field refuses the whole change", () => {
    const ishod = izmeni({ density: "airy", paletteId: "vino" }, STANDARD);
    expect(ishod).toMatchObject({ ok: false, kod: "plan/premium_required" });
  });

  test("neither the starting values nor their arrays are mutated", () => {
    const pre = present({ filters: ["vegan"], brandColors: ["#B3261E"] });
    const snimak = JSON.stringify(pre);
    uspeh(izmeni({ filters: ["promo"], brandColors: ["#1F5F7A"], density: "dense" }, STANDARD, pre));
    odbijeno(izmeni({ filters: ["price"] }, STANDARD, pre));
    expect(JSON.stringify(pre)).toBe(snimak);
    expect(JSON.stringify(MENU_DEFAULT_PRESENTATION)).toBe(JSON.stringify(present()));
  });
});

describe("proveriIzmenuIzgleda: an account that lost Premium", () => {
  const BIVSI_PREMIUM = present({ paletteId: "vino", fontPairId: "galerija", layoutVariant: "kartice", branding: "reduced" });

  test("can still change anything it is not choosing a Premium part with", () => {
    const ishod = uspeh(izmeni({ density: "dense" }, STANDARD, BIVSI_PREMIUM));
    expect(ishod.promena).toBe(true);
    // The draft keeps what it had; only guests get the Standard fallback (premium.ts).
    expect(ishod.vrednosti).toMatchObject({ paletteId: "vino", fontPairId: "galerija", layoutVariant: "kartice", branding: "reduced" });
  });

  test("can move to a Standard palette, pair and branding", () => {
    const ishod = uspeh(izmeni({ paletteId: "ponoc", fontPairId: "klasika", branding: "standard" }, STANDARD, BIVSI_PREMIUM));
    expect(ishod.vrednosti).toMatchObject({ paletteId: "ponoc", fontPairId: "klasika", branding: "standard" });
  });

  // Choosing the Premium value the draft already holds is not a new choice: the palette group
  // always re-sends paletteId next to brandColors, so this must not be refused.
  test("choosing the palette the draft already has is a no-op (promena false)", () => {
    const ishod = uspeh(izmeni({ paletteId: "vino" }, STANDARD, BIVSI_PREMIUM));
    expect(ishod.promena).toBe(false);
    expect(ishod.vrednosti).toEqual(BIVSI_PREMIUM);
  });

  test("choosing the font pair the draft already has is a no-op", () => {
    const ishod = uspeh(izmeni({ fontPairId: "galerija" }, STANDARD, BIVSI_PREMIUM));
    expect(ishod.promena).toBe(false);
  });

  test("choosing the layout variant the draft already has is a no-op", () => {
    const ishod = uspeh(izmeni({ layout: "flow", layoutVariant: "kartice" }, STANDARD, BIVSI_PREMIUM));
    expect(ishod.promena).toBe(false);
    expect(ishod.vrednosti.layoutVariant).toBe("kartice");
  });

  test("choosing reduced branding when the draft already has it is a no-op", () => {
    const ishod = uspeh(izmeni({ branding: "reduced" }, STANDARD, BIVSI_PREMIUM));
    expect(ishod.promena).toBe(false);
  });

  test("the palette and the brand colours can be re-sent together, with the Premium palette as it was", () => {
    const ishod = uspeh(izmeni({ paletteId: "vino", brandColors: ["#8C2633"] }, STANDARD, BIVSI_PREMIUM));
    expect(ishod.promena).toBe(true);
    expect(ishod.vrednosti).toMatchObject({ paletteId: "vino", brandColors: ["#8C2633"] });
  });

  test("choosing a different Premium palette, pair, variant or branding is still refused", () => {
    expect(odbijeno(izmeni({ paletteId: "sumrak" }, STANDARD, BIVSI_PREMIUM))).toMatchObject({ kod: "plan/premium_required" });
    expect(odbijeno(izmeni({ fontPairId: "grotesk" }, STANDARD, BIVSI_PREMIUM))).toMatchObject({ kod: "plan/premium_required" });
    const naDrugomRasporedu = present({ layout: "categories", layoutVariant: "lista" });
    expect(odbijeno(izmeni({ layout: "flow", layoutVariant: "kartice" }, STANDARD, naDrugomRasporedu))).toMatchObject({
      kod: "plan/premium_required",
    });
    expect(odbijeno(izmeni({ paletteId: "vino" }, STANDARD, present({ paletteId: "sumrak" })))).toMatchObject({
      kod: "plan/premium_required",
    });
  });

  test("a Standard account never gets a Premium part it did not have", () => {
    expect(odbijeno(izmeni({ paletteId: "vino" }, STANDARD))).toMatchObject({ kod: "plan/premium_required" });
    expect(odbijeno(izmeni({ branding: "reduced" }, STANDARD))).toMatchObject({ kod: "plan/premium_required" });
  });
});

// -----------------------------------------------------------------------------
// izgledCas / izmenaCas
// -----------------------------------------------------------------------------

describe("izgledCas and izmenaCas", () => {
  test("izgledCas lists every field of the appearance, in the declared order", () => {
    expect(Object.keys(izgledCas(MENU_DEFAULT_PRESENTATION))).toEqual([...MENU_IZGLED_POLJA]);
  });

  test("the default presentation: an absent variant and brand are null, the filters are JSON text", () => {
    expect(izgledCas(MENU_DEFAULT_PRESENTATION)).toEqual({
      layout: "flow",
      layoutVariant: null,
      paletteId: "default",
      brandColors: null,
      fontPairId: "default",
      density: "standard",
      emphasis: "calm",
      defaultMediaMode: "image",
      search: false,
      filters: "[]",
      currencyToggle: false,
      branding: "standard",
    });
  });

  test("arrays become JSON text and a present variant stays a string", () => {
    const cas = izgledCas(present({ layoutVariant: "kartice", brandColors: ["#B3261E", "", "#1A1A1A"], filters: ["vegan", "promo"] }));
    expect(cas.layoutVariant).toBe("kartice");
    expect(cas.brandColors).toBe('["#B3261E","","#1A1A1A"]');
    expect(cas.filters).toBe('["vegan","promo"]');
  });

  test("izmenaCas names only the fields the change sets", () => {
    expect(izmenaCas({ density: "dense", search: true })).toEqual({ density: "dense", search: true });
    expect(izmenaCas({})).toEqual({});
    expect(izmenaCas({ layout: undefined })).toEqual({});
  });

  test("izmenaCas turns arrays into JSON text and a removed variant or brand into null", () => {
    expect(izmenaCas({ filters: ["vegan"], brandColors: ["#B3261E"] })).toEqual({
      filters: '["vegan"]',
      brandColors: '["#B3261E"]',
    });
    expect(izmenaCas({ filters: [] })).toEqual({ filters: "[]" });
    expect(izmenaCas({ layoutVariant: null, brandColors: null })).toEqual({ layoutVariant: null, brandColors: null });
  });

  test("the expected values of a change line up with the current ones", () => {
    const vrednosti = present({ layoutVariant: "kartice", brandColors: ["#B3261E"], filters: ["spicy"] });
    const izmena: IzgledIzmena = { layoutVariant: "kartice", brandColors: ["#B3261E"], filters: ["spicy"] };
    const sada = izgledCas(vrednosti);
    const trazeno = izmenaCas(izmena);
    for (const polje of Object.keys(trazeno) as (keyof typeof trazeno)[]) expect(trazeno[polje]).toBe(sada[polje]);
  });
});

// -----------------------------------------------------------------------------
// javniIzgled
// -----------------------------------------------------------------------------

describe("javniIzgled: the brand palette", () => {
  test("a single main colour gives the brand palette in the light tone", () => {
    const izgled = javniIzgled(present({ paletteId: "brend", brandColors: ["#B3261E"] }));
    expect(izgled.paletaId).toBe("brend");
    expect(izgled.ton).toBe("svetla");
    expect(izgled.boje.accent).toBe("#B3261E");
    expect(izgled.tokeni["--menu-color-scheme"]).toBe("light");
    expect(izgled.tokeni["--menu-accent"]).toBe("#B3261E");
  });

  test("brend-tamna gives the dark tone", () => {
    const izgled = javniIzgled(present({ paletteId: "brend-tamna", brandColors: ["#B3261E"] }));
    expect(izgled.paletaId).toBe("brend");
    expect(izgled.ton).toBe("tamna");
    expect(izgled.boje.accent).toBe("#B3261E");
    expect(izgled.tokeni["--menu-color-scheme"]).toBe("dark");
  });

  test("the colours are derived again on every render: the same input gives the same look", () => {
    const izgled = present({ paletteId: "brend", brandColors: ["#1F5F7A"] });
    expect(javniIzgled(izgled)).toEqual(javniIzgled(izgled));
  });

  test("explicit page and text colours are used as set", () => {
    const izgled = javniIzgled(present({ paletteId: "brend", brandColors: ["#1F5F7A", "#FFF8EC", "#1A1A1A"] }));
    expect(izgled.boje.page).toBe("#FFF8EC");
    expect(izgled.boje.title).toBe("#1A1A1A");
  });

  test("unreadable stored colours fall back to the default palette: guests never get an unreadable menu", () => {
    const izgled = javniIzgled(present({ paletteId: "brend", brandColors: UNREADABLE_BRAND }));
    expect(izgled.paletaId).toBe("topla");
    expect(izgled.ton).toBe("svetla");
    expect(izgled.boje).toEqual(paletaPoId("topla").boje);
  });

  test("unreadable stored colours of the dark brand palette fall back to ponoc", () => {
    const izgled = javniIzgled(present({ paletteId: "brend-tamna", brandColors: ["#8C2633", "#101010", "#303030"] }));
    expect(izgled.paletaId).toBe("ponoc");
    expect(izgled.ton).toBe("tamna");
  });

  test("missing or invalid stored colours fall back too", () => {
    expect(javniIzgled(present({ paletteId: "brend", brandColors: null })).paletaId).toBe("topla");
    expect(javniIzgled(present({ paletteId: "brend", brandColors: ["#12345"] })).paletaId).toBe("topla");
    expect(javniIzgled(present({ paletteId: "brend-tamna", brandColors: [] })).paletaId).toBe("ponoc");
  });

  test("brand colours next to a catalog palette are ignored", () => {
    const izgled = javniIzgled(present({ paletteId: "bordo", brandColors: ["#1F5F7A"] }));
    expect(izgled.paletaId).toBe("bordo");
    expect(izgled.boje).toEqual(paletaPoId("bordo").boje);
  });
});

describe("javniIzgled: layout variant and media display", () => {
  test("the variant is kartice for flow + kartice", () => {
    expect(javniIzgled(present({ layout: "flow", layoutVariant: "kartice" })).varijanta).toBe("kartice");
  });

  test("a variant that does not belong to the layout is null", () => {
    expect(javniIzgled(present({ layout: "compact", layoutVariant: "kartice" })).varijanta).toBeNull();
  });

  test("no variant is null", () => {
    expect(javniIzgled(MENU_DEFAULT_PRESENTATION).varijanta).toBeNull();
  });

  test("the default media mode is image", () => {
    expect(MENU_DEFAULT_PRESENTATION.defaultMediaMode).toBe("image");
    expect(javniIzgled(MENU_DEFAULT_PRESENTATION).mediji).toBe("image");
  });

  test.each(["image", "icon", "none"] as const)("mediji mirrors defaultMediaMode %s", (defaultMediaMode) => {
    expect(javniIzgled(present({ defaultMediaMode })).mediji).toBe(defaultMediaMode);
  });

  test("an older stored presentation without a media mode shows media as it is set", () => {
    const stara = { ...MENU_DEFAULT_PRESENTATION } as Partial<MenuPresentationValues>;
    delete stara.defaultMediaMode;
    expect(javniIzgled(stara as MenuPresentationValues).mediji).toBe("image");
  });

  test("Premium palettes and pairs resolve as chosen (the plan is applied when publishing, not here)", () => {
    const izgled = javniIzgled(present({ paletteId: "vino", fontPairId: "galerija" }));
    expect(izgled.paletaId).toBe("vino");
    expect(izgled.ton).toBe("tamna");
    expect(izgled.parId).toBe("galerija");
    expect(parPoId("galerija").premium).toBe(true);
  });
});

// -----------------------------------------------------------------------------
// primeniPrikazMedija
// -----------------------------------------------------------------------------

describe("primeniPrikazMedija", () => {
  const article = (key: string, mode: "image" | "icon" | "none"): PublicArticle => ({
    key,
    kind: "item",
    name: "Kafa",
    description: null,
    quantityValue: null,
    quantityUnit: null,
    priceRsd: 400,
    variants: [],
    addonGroups: [],
    noteEnabled: false,
    media: { mode, imageMediaId: mode === "image" ? "im_1" : null, iconKey: mode === "icon" ? "coffee" : null },
    allergens: null,
    tags: [],
    promo: null,
    combo: null,
  });
  const section = (key: string, articles: PublicArticle[]): PublicSection => ({
    key,
    name: key,
    description: null,
    iconKey: null,
    articles,
  });

  test("image shows every article as it is set: the very same sections", () => {
    const sekcije = [section("s1", [article("a1", "image"), article("a2", "icon"), article("a3", "none")])];
    expect(primeniPrikazMedija(sekcije, "image")).toBe(sekcije);
  });

  test("icon turns photos into icons and leaves icons and text-only articles", () => {
    const sekcije = [section("s1", [article("a1", "image"), article("a2", "icon"), article("a3", "none")])];
    const rezultat = primeniPrikazMedija(sekcije, "icon");
    expect(rezultat[0].articles.map((jedan) => jedan.media.mode)).toEqual(["icon", "icon", "none"]);
    expect(rezultat[0].articles[1]).toBe(sekcije[0].articles[1]);
    expect(rezultat[0].articles[2]).toBe(sekcije[0].articles[2]);
  });

  test("none leaves text only", () => {
    const sekcije = [section("s1", [article("a1", "image"), article("a2", "icon"), article("a3", "none")])];
    const rezultat = primeniPrikazMedija(sekcije, "none");
    expect(rezultat[0].articles.map((jedan) => jedan.media.mode)).toEqual(["none", "none", "none"]);
  });

  test("a section with nothing to change keeps its identity", () => {
    const bez = section("s1", [article("a1", "none")]);
    const sa = section("s2", [article("a2", "image")]);
    const rezultat = primeniPrikazMedija([bez, sa], "icon");
    expect(rezultat[0]).toBe(bez);
    expect(rezultat[1]).not.toBe(sa);
  });

  test("does not mutate its input", () => {
    const sekcije = [section("s1", [article("a1", "image")])];
    const snimak = JSON.stringify(sekcije);
    primeniPrikazMedija(sekcije, "none");
    expect(JSON.stringify(sekcije)).toBe(snimak);
  });
});

// -----------------------------------------------------------------------------
// compileSnapshot: what is published without Premium
// -----------------------------------------------------------------------------

describe("compileSnapshot and the account's appearance capabilities", () => {
  const PREMIUM_IZGLED = present({
    paletteId: "vino",
    fontPairId: "galerija",
    layout: "flow",
    layoutVariant: "kartice",
    branding: "reduced",
    density: "airy",
  });

  const sa = (presentation: MenuPresentationValues | null): MenuDraftSnapshot => ({
    ...fixtureMenu("mali").snapshot,
    presentation,
  });
  const ctx = (over: Partial<CompileContext> = {}): CompileContext => ({
    languages: ["sr"],
    roomService: false,
    scheduledPromos: false,
    ...over,
  });
  const splitterOf = (version: CompiledVersion, lang = "sr"): PublicSplitterDoc => {
    const row = version.parts.find((part) => part.scope === "public" && part.lang === lang && part.pageKey === MENU_PART_SPLITTER);
    if (!row) throw new Error(`no splitter part for ${lang}`);
    return JSON.parse(row.data) as PublicSplitterDoc;
  };

  test("extraLayouts false and reducedBranding false publish the Standard fallback", () => {
    const version = compileSnapshot(sa(PREMIUM_IZGLED), ctx({ extraLayouts: false, reducedBranding: false }));
    const objavljeno = splitterOf(version).presentation;
    expect(objavljeno).toEqual(present({ paletteId: "ponoc", fontPairId: "default", branding: "standard", density: "airy" }));
    expect("layoutVariant" in objavljeno).toBe(false);
  });

  test("a light Premium palette falls back to the default palette", () => {
    const version = compileSnapshot(sa(present({ paletteId: "sampanjac" })), ctx({ extraLayouts: false, reducedBranding: false }));
    expect(splitterOf(version).presentation.paletteId).toBe("default");
  });

  test("extraLayouts false alone: palette, pair and variant fall back; branding is published as drafted", () => {
    const objavljeno = splitterOf(compileSnapshot(sa(PREMIUM_IZGLED), ctx({ extraLayouts: false }))).presentation;
    expect(objavljeno).toMatchObject({ paletteId: "ponoc", fontPairId: "default", branding: "reduced" });
    expect("layoutVariant" in objavljeno).toBe(false);
  });

  test("reducedBranding false alone: branding falls back; the layouts are published as drafted", () => {
    const objavljeno = splitterOf(compileSnapshot(sa(PREMIUM_IZGLED), ctx({ reducedBranding: false }))).presentation;
    expect(objavljeno).toMatchObject({ paletteId: "vino", fontPairId: "galerija", layoutVariant: "kartice", branding: "standard" });
  });

  test("extraLayouts true publishes the drafted presentation as it is", () => {
    const version = compileSnapshot(sa(PREMIUM_IZGLED), ctx({ extraLayouts: true, reducedBranding: true }));
    expect(splitterOf(version).presentation).toEqual(PREMIUM_IZGLED);
  });

  test("an absent capability publishes the drafted presentation as it is (callers that predate K17)", () => {
    const version = compileSnapshot(sa(PREMIUM_IZGLED), ctx());
    expect(splitterOf(version).presentation).toEqual(PREMIUM_IZGLED);
  });

  test("every published language carries the fallback", () => {
    const version = compileSnapshot(
      sa(PREMIUM_IZGLED),
      ctx({ languages: ["sr", "en"], extraLayouts: false, reducedBranding: false }),
    );
    for (const lang of ["sr", "en"]) {
      expect(splitterOf(version, lang).presentation.paletteId).toBe("ponoc");
    }
  });

  test("the draft itself is kept as it is in the internal part", () => {
    const version = compileSnapshot(sa(PREMIUM_IZGLED), ctx({ extraLayouts: false, reducedBranding: false }));
    const unutrasnji = version.parts
      .filter((part) => part.scope === "internal")
      .sort((a, b) => a.part - b.part)
      .map((part) => part.data)
      .join("");
    const nacrt = JSON.parse(unutrasnji) as MenuDraftSnapshot;
    expect(nacrt.presentation).toEqual(PREMIUM_IZGLED);
  });

  test("a version with Premium parts differs between Standard and Premium for guests", () => {
    const standard = compileSnapshot(sa(PREMIUM_IZGLED), ctx({ extraLayouts: false, reducedBranding: false }));
    const premium = compileSnapshot(sa(PREMIUM_IZGLED), ctx({ extraLayouts: true, reducedBranding: true }));
    expect(standard.publicHash).not.toBe(premium.publicHash);
  });

  test.each([
    ["no drafted presentation", null],
    ["the default presentation", MENU_DEFAULT_PRESENTATION],
  ])("%s compiles to the same publicHash whatever the capabilities", (_naziv, presentation) => {
    const osnova = compileSnapshot(sa(presentation), ctx()).publicHash;
    expect(compileSnapshot(sa(presentation), ctx({ extraLayouts: true })).publicHash).toBe(osnova);
    expect(compileSnapshot(sa(presentation), ctx({ extraLayouts: undefined })).publicHash).toBe(osnova);
    expect(compileSnapshot(sa(presentation), ctx({ extraLayouts: true, reducedBranding: true })).publicHash).toBe(osnova);
    expect(compileSnapshot(sa(presentation), ctx({ extraLayouts: false, reducedBranding: false })).publicHash).toBe(osnova);
  });

  test("an appearance with only Standard parts keeps its publicHash on Standard", () => {
    const obicna = present({ paletteId: "ponoc", fontPairId: "klasika", density: "dense" });
    const standard = compileSnapshot(sa(obicna), ctx({ extraLayouts: false, reducedBranding: false })).publicHash;
    expect(standard).toBe(compileSnapshot(sa(obicna), ctx()).publicHash);
  });
});
