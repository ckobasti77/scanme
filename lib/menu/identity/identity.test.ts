// ScanMe Menu V1 (K13) — the identity of the public menu: curated palettes
// (readable, never the ScanMe black-and-green), font pairs (installed, with
// Serbian Latin glyphs) and the tokens the renderer gets. Deterministic: no
// clock, no network; the font check only reads installed package CSS.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { differenceEuclidean, oklch } from "culori";
import { describe, expect, test } from "vitest";
import { DEFAULT_MENU_DESIGN } from "../../design-engine/menu-tokens";
import { DESIGN_FONT_KEYS, FONT_STACKS, type DesignFontKey } from "../../design-engine/typography";
import { MENU_DEFAULT_PRESENTATION, type MenuPresentationValues } from "../presentation";
import { proveriKontrast } from "./contrast";
import {
  MENU_PAROVI_FONTOVA,
  MENU_PODRAZUMEVANI_PAR,
  jePoznatPar,
  parPoId,
} from "./font-pairs";
import {
  MENU_JAVNE_PALETE,
  MENU_PODRAZUMEVANA_PALETA,
  jePoznataPaleta,
  paletaPoId,
} from "./palettes";
import { javniIzgled } from "./public-tokens";

const root = (relative: string) => resolve(process.cwd(), relative);
const present = (over: Partial<MenuPresentationValues> = {}): MenuPresentationValues => ({
  ...MENU_DEFAULT_PRESENTATION,
  ...over,
});

describe("palettes", () => {
  test.each(MENU_JAVNE_PALETE)("palette $id passes the contrast check", (paleta) => {
    const ishod = proveriKontrast(paleta.boje);
    expect(ishod.greske).toEqual([]);
    expect(ishod.ok).toBe(true);
  });

  test("palette ids are unique", () => {
    const ids = MENU_JAVNE_PALETE.map((paleta) => paleta.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("there is at least one dark and one light palette", () => {
    expect(MENU_JAVNE_PALETE.some((paleta) => paleta.ton === "tamna")).toBe(true);
    expect(MENU_JAVNE_PALETE.some((paleta) => paleta.ton === "svetla")).toBe(true);
  });

  test("no palette is named after ScanMe", () => {
    for (const paleta of MENU_JAVNE_PALETE) expect(paleta.id.toLowerCase()).not.toContain("scanme");
  });

  test("the declared tone matches the page colour", () => {
    for (const paleta of MENU_JAVNE_PALETE) {
      const lightness = oklch(paleta.boje.page)?.l ?? 0;
      if (paleta.ton === "tamna") expect(lightness).toBeLessThan(0.4);
      else expect(lightness).toBeGreaterThan(0.8);
    }
  });

  const SCANME_GREENS = ["#2f6d23", "#6fc05d"];
  const distance = differenceEuclidean("oklab");

  test.each(MENU_JAVNE_PALETE)("palette $id accent is far from the ScanMe greens", (paleta) => {
    for (const green of SCANME_GREENS) {
      expect(distance(paleta.boje.accent, green)).toBeGreaterThanOrEqual(0.1);
    }
  });

  test.each(MENU_JAVNE_PALETE)("palette $id accent hue is not green", (paleta) => {
    const color = oklch(paleta.boje.accent);
    const hue = color?.h;
    const chroma = color?.c ?? 0;
    const green = hue !== undefined && hue >= 90 && hue <= 160 && chroma > 0.05;
    expect(green).toBe(false);
  });

  test("the default id, an unknown id and null all give the topla palette", () => {
    expect(paletaPoId("default").id).toBe("topla");
    expect(paletaPoId("nepostoji").id).toBe("topla");
    expect(paletaPoId(null).id).toBe("topla");
    expect(paletaPoId(undefined).id).toBe("topla");
    expect(paletaPoId("").id).toBe("topla");
    expect(MENU_PODRAZUMEVANA_PALETA).toBe("topla");
  });

  test("a known id gives its own palette", () => {
    for (const paleta of MENU_JAVNE_PALETE) expect(paletaPoId(paleta.id)).toBe(paleta);
  });

  test("topla has the exact colours of the legacy default design", () => {
    expect(paletaPoId("default").boje).toEqual(DEFAULT_MENU_DESIGN.colors);
  });

  test("jePoznataPaleta knows the curated ids only", () => {
    expect(jePoznataPaleta("topla")).toBe(true);
    expect(jePoznataPaleta("ponoc")).toBe(true);
    expect(jePoznataPaleta("default")).toBe(false);
    expect(jePoznataPaleta("nepostoji")).toBe(false);
  });
});

describe("proveriKontrast", () => {
  const topla = paletaPoId("topla").boje;

  test("accepts a readable palette", () => {
    expect(proveriKontrast(topla)).toEqual({ ok: true, greske: [] });
  });

  test("refuses body #777777 on a #FFFFFF page", () => {
    const ishod = proveriKontrast({ ...topla, page: "#FFFFFF", body: "#777777" });
    expect(ishod.ok).toBe(false);
    const greska = ishod.greske.find((row) => row.par === "body/page");
    expect(greska).toBeDefined();
    expect(greska?.prag).toBe(4.5);
    expect(greska?.odnos).toBeLessThan(4.5);
    expect(greska?.odnos).toBeGreaterThan(4);
    expect(ishod.greske.some((row) => row.par === "title/page")).toBe(false);
  });

  test("refuses a title that is too faint on the surface", () => {
    const ishod = proveriKontrast({ ...topla, title: "#BBBBBB" });
    expect(ishod.ok).toBe(false);
    expect(ishod.greske.map((row) => row.par)).toEqual(expect.arrayContaining(["title/page", "title/surface"]));
  });

  test("refuses a focus colour below 3:1", () => {
    const ishod = proveriKontrast({ ...topla, focus: "#CCCCCC" });
    expect(ishod.ok).toBe(false);
    const greska = ishod.greske.find((row) => row.par === "focus/page");
    expect(greska).toBeDefined();
    expect(greska?.prag).toBe(3);
    expect(greska?.odnos).toBeLessThan(3);
  });

  test("accepts a focus colour at 3:1 or better", () => {
    expect(proveriKontrast({ ...topla, focus: "#767676" }).greske.some((row) => row.par.startsWith("focus"))).toBe(
      false,
    );
  });
});

describe("font pairs", () => {
  test("pair ids are unique", () => {
    const ids = MENU_PAROVI_FONTOVA.map((par) => par.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("every heading and text face is a known font key", () => {
    const known: readonly string[] = DESIGN_FONT_KEYS;
    for (const par of MENU_PAROVI_FONTOVA) {
      expect(known).toContain(par.naslov);
      expect(known).toContain(par.tekst);
    }
  });

  test("heading weights stay in the supported set", () => {
    for (const par of MENU_PAROVI_FONTOVA) expect([500, 600, 700]).toContain(par.tezinaNaslova);
  });

  test("the default id, an unknown id and null all give the osnovni pair", () => {
    expect(parPoId("default").id).toBe("osnovni");
    expect(parPoId("nepostoji").id).toBe("osnovni");
    expect(parPoId(null).id).toBe("osnovni");
    expect(parPoId(undefined).id).toBe("osnovni");
    expect(MENU_PODRAZUMEVANI_PAR).toBe("osnovni");
  });

  test("osnovni is DM Sans, the face of the legacy menu", () => {
    expect(parPoId("osnovni")).toMatchObject({ naslov: "dm-sans", tekst: "dm-sans" });
  });

  test("a known id gives its own pair", () => {
    for (const par of MENU_PAROVI_FONTOVA) expect(parPoId(par.id)).toBe(par);
  });

  test("jePoznatPar knows the curated ids only", () => {
    expect(jePoznatPar("klasika")).toBe(true);
    expect(jePoznatPar("default")).toBe(false);
  });

  // The installed Fontsource CSS per font key and the specifiers app/layout.tsx imports.
  const FONT_FILES: Record<Exclude<DesignFontKey, "system-ui">, { css: string[]; imports: string[] }> = {
    "dm-sans": {
      css: ["node_modules/@fontsource-variable/dm-sans/index.css"],
      imports: ["@fontsource-variable/dm-sans"],
    },
    archivo: {
      css: ["node_modules/@fontsource-variable/archivo/index.css"],
      imports: ["@fontsource-variable/archivo"],
    },
    "cormorant-garamond": {
      css: ["node_modules/@fontsource-variable/cormorant-garamond/index.css"],
      imports: ["@fontsource-variable/cormorant-garamond"],
    },
    inter: {
      css: ["node_modules/@fontsource-variable/inter/index.css"],
      imports: ["@fontsource-variable/inter"],
    },
    lora: {
      css: ["node_modules/@fontsource-variable/lora/index.css"],
      imports: ["@fontsource-variable/lora"],
    },
    manrope: {
      css: ["node_modules/@fontsource-variable/manrope/index.css"],
      imports: ["@fontsource-variable/manrope"],
    },
    "nunito-sans": {
      css: ["node_modules/@fontsource-variable/nunito-sans/index.css"],
      imports: ["@fontsource-variable/nunito-sans"],
    },
    "playfair-display": {
      css: ["node_modules/@fontsource-variable/playfair-display/index.css"],
      imports: ["@fontsource-variable/playfair-display"],
    },
    "source-sans-3": {
      css: ["node_modules/@fontsource-variable/source-sans-3/index.css"],
      imports: ["@fontsource-variable/source-sans-3"],
    },
    "space-grotesk": {
      css: ["node_modules/@fontsource-variable/space-grotesk/index.css"],
      imports: ["@fontsource-variable/space-grotesk"],
    },
    "libre-baskerville": {
      css: [
        "node_modules/@fontsource/libre-baskerville/400.css",
        "node_modules/@fontsource/libre-baskerville/700.css",
      ],
      imports: ["@fontsource/libre-baskerville/400.css", "@fontsource/libre-baskerville/700.css"],
    },
  };

  const usedKeys = [
    ...new Set(MENU_PAROVI_FONTOVA.flatMap((par) => [par.naslov, par.tekst])),
  ].filter((key): key is Exclude<DesignFontKey, "system-ui"> => key !== "system-ui");

  test("every pair font has an entry in the font file map", () => {
    for (const key of usedKeys) expect(FONT_FILES[key], key).toBeDefined();
  });

  test.each(usedKeys)("font %s ships the latin-ext subset (Serbian š đ č ć ž)", (key) => {
    for (const file of FONT_FILES[key].css) {
      const css = readFileSync(root(file), "utf8");
      expect(css).toContain("latin-ext");
      expect(css).toMatch(/unicode-range:\s*U\+0100-02/);
    }
  });

  test.each(usedKeys)("font %s family name matches its stack and is imported in app/layout.tsx", (key) => {
    const css = readFileSync(root(FONT_FILES[key].css[0]), "utf8");
    const family = /font-family:\s*'([^']+)'/.exec(css)?.[1];
    expect(family).toBeTruthy();
    expect(FONT_STACKS[key]).toContain(`"${family}"`);
    const layout = readFileSync(root("app/layout.tsx"), "utf8");
    for (const specifier of FONT_FILES[key].imports) expect(layout).toContain(`"${specifier}"`);
  });
});

describe("javniIzgled", () => {
  test("the default presentation gives the topla palette and the osnovni pair", () => {
    const izgled = javniIzgled(MENU_DEFAULT_PRESENTATION);
    expect(izgled.paletaId).toBe("topla");
    expect(izgled.parId).toBe("osnovni");
    expect(izgled.ton).toBe("svetla");
    expect(izgled.boje).toEqual(DEFAULT_MENU_DESIGN.colors);
  });

  test("the default tokens carry the page colour, the heading face, gap and colour scheme", () => {
    const { tokeni } = javniIzgled(MENU_DEFAULT_PRESENTATION);
    expect(tokeni["--menu-page"]).toBe("#F7F8F3");
    expect(tokeni["--menu-heading-family"]).toBe(FONT_STACKS["dm-sans"]);
    expect(tokeni["--menu-font-family"]).toBe(FONT_STACKS["dm-sans"]);
    expect(tokeni["--menu-section-gap"]).toBe("40px");
    expect(tokeni["--menu-color-scheme"]).toBe("light");
    expect(tokeni["--menu-heading-case"]).toBe("none");
  });

  test("is deterministic", () => {
    expect(javniIzgled(MENU_DEFAULT_PRESENTATION)).toEqual(javniIzgled(MENU_DEFAULT_PRESENTATION));
    const custom = present({ paletteId: "ponoc", fontPairId: "klasika", density: "airy" });
    expect(javniIzgled(custom)).toEqual(javniIzgled(custom));
  });

  test("passes the layout, density, emphasis and branding through", () => {
    const izgled = javniIzgled(present({ layout: "compact", density: "dense", emphasis: "bold", branding: "reduced" }));
    expect(izgled).toMatchObject({ layout: "compact", gustina: "dense", naglasak: "bold", brending: "reduced" });
  });

  test("the ponoc palette is a dark tone with a dark colour scheme", () => {
    const izgled = javniIzgled(present({ paletteId: "ponoc" }));
    expect(izgled.paletaId).toBe("ponoc");
    expect(izgled.ton).toBe("tamna");
    expect(izgled.tokeni["--menu-color-scheme"]).toBe("dark");
    expect(izgled.tokeni["--menu-page"]).toBe("#121417");
  });

  test("every palette resolves to a tone that matches its colour scheme", () => {
    for (const paleta of MENU_JAVNE_PALETE) {
      const izgled = javniIzgled(present({ paletteId: paleta.id }));
      expect(izgled.ton).toBe(paleta.ton);
      expect(izgled.tokeni["--menu-color-scheme"]).toBe(paleta.ton === "tamna" ? "dark" : "light");
    }
  });

  test.each([
    ["airy", "56px"],
    ["standard", "40px"],
    ["dense", "28px"],
  ] as const)("density %s sets the section gap %s", (density, gap) => {
    expect(javniIzgled(present({ density })).tokeni["--menu-section-gap"]).toBe(gap);
  });

  test.each(["airy", "standard", "dense"] as const)("density %s keeps the body text at 1rem or more", (density) => {
    const size = javniIzgled(present({ density })).tokeni["--menu-body-size"];
    expect(size).toMatch(/^\d+(\.\d+)?rem$/);
    expect(parseFloat(size)).toBeGreaterThanOrEqual(1);
  });

  test("the airy density has the roomiest rows", () => {
    const airy = javniIzgled(present({ density: "airy" })).tokeni;
    const dense = javniIzgled(present({ density: "dense" })).tokeni;
    expect(parseFloat(airy["--menu-vertical-spacing"])).toBeGreaterThan(parseFloat(dense["--menu-vertical-spacing"]));
  });

  test("a font pair sets the heading and the body face", () => {
    const izgled = javniIzgled(present({ fontPairId: "klasika" }));
    expect(izgled.parId).toBe("klasika");
    expect(izgled.tokeni["--menu-heading-family"]).toBe(FONT_STACKS["playfair-display"]);
    expect(izgled.tokeni["--menu-font-family"]).toBe(FONT_STACKS["source-sans-3"]);
  });

  test("unknown palette and pair ids fall back to the defaults", () => {
    const izgled = javniIzgled(present({ paletteId: "nepostoji", fontPairId: "nepostoji" }));
    expect(izgled).toEqual(javniIzgled(MENU_DEFAULT_PRESENTATION));
  });

  test("explicit colours give the brend palette and reach the tokens", () => {
    const boje = {
      page: "#FFF8EC",
      surface: "#FFFFFF",
      title: "#1B1B1B",
      body: "#3B3B3B",
      accent: "#B3261E",
      border: "#E5DCCB",
      focus: "#B3261E",
      icon: "#B3261E",
    };
    const izgled = javniIzgled(MENU_DEFAULT_PRESENTATION, boje);
    expect(izgled.paletaId).toBe("brend");
    expect(izgled.boje).toEqual(boje);
    expect(izgled.ton).toBe("svetla");
    expect(izgled.tokeni["--menu-page"]).toBe("#FFF8EC");
    expect(izgled.tokeni["--menu-accent"]).toBe("#B3261E");
    expect(izgled.tokeni["--menu-title"]).toBe("#1B1B1B");
    expect(izgled.tokeni["--menu-color-scheme"]).toBe("light");
  });

  test("a dark explicit page colour gives the tamna tone", () => {
    const boje = { ...paletaPoId("ponoc").boje, page: "#0B0B0D" };
    const izgled = javniIzgled(MENU_DEFAULT_PRESENTATION, boje);
    expect(izgled.paletaId).toBe("brend");
    expect(izgled.ton).toBe("tamna");
    expect(izgled.tokeni["--menu-color-scheme"]).toBe("dark");
  });

  test("explicit colours win over the palette id of the presentation", () => {
    const boje = { ...paletaPoId("topla").boje, page: "#101010" };
    const izgled = javniIzgled(present({ paletteId: "bordo" }), boje);
    expect(izgled.paletaId).toBe("brend");
    expect(izgled.tokeni["--menu-page"]).toBe("#101010");
  });
});
