import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { menuPanelSr } from "@/lib/i18n/sr/menu-panel";
import { javniNaslov, menuNaslov } from "./menu-naslovi";

const ROOT = process.cwd();
const izvor = (putanja: string) => readFileSync(join(ROOT, putanja), "utf8");

describe("menuNaslov", () => {
  test("has one form: Naziv | ScanMe Menu", () => {
    expect(menuNaslov("Analitika")).toBe("Analitika | ScanMe Menu");
    expect(menuNaslov("Editor")).toBe("Editor | ScanMe Menu");
    expect(menuNaslov("Konobarski panel · Kafana kod Mike")).toBe("Konobarski panel · Kafana kod Mike | ScanMe Menu");
  });

  test("every panel section has a title in that form", () => {
    for (const naziv of Object.values(menuPanelSr.sekcije)) {
      expect(menuNaslov(naziv)).toMatch(/^.+ \| ScanMe Menu$/);
    }
  });
});

describe("javniNaslov", () => {
  test("the menu is Naziv lokala — Meni", () => {
    expect(javniNaslov("Kafana kod Mike")).toBe("Kafana kod Mike — Meni");
  });

  test("a page of the menu keeps the venue first", () => {
    expect(javniNaslov("Kafana kod Mike", "Doručak")).toBe("Kafana kod Mike — Doručak");
  });
});

describe("Menu page titles", () => {
  const PANEL = "app/[slug]/client-panel/meni";
  const panelStranice = [
    `${PANEL}/page.tsx`,
    `${PANEL}/editor/page.tsx`,
    `${PANEL}/operativa/page.tsx`,
    `${PANEL}/lokal/page.tsx`,
    `${PANEL}/funkcionalnosti/page.tsx`,
    `${PANEL}/tim/page.tsx`,
    `${PANEL}/analitika/page.tsx`,
    `${PANEL}/podesavanja/page.tsx`,
    `${PANEL}/poziv/[token]/page.tsx`,
    "app/[slug]/konobar/page.tsx",
    "app/[slug]/konobar/[kod]/page.tsx",
    "app/[slug]/meni/editor/page.tsx",
    "app/panel/[venueCode]/page.tsx",
  ];

  test.each(panelStranice)("%s uses menuNaslov (Naziv | ScanMe Menu)", (putanja) => {
    expect(izvor(putanja)).toContain("menuNaslov(");
  });

  const javneStranice = [
    "app/[slug]/meni/_lib/prikaz.tsx",
    "app/[slug]/meni/rezervacija/page.tsx",
    "app/[slug]/meni/rezervacija/[token]/page.tsx",
    "app/[slug]/meni/room-service/page.tsx",
    "app/[slug]/meni/zahtevi/page.tsx",
  ];

  test.each(javneStranice)("%s uses javniNaslov (Naziv lokala — Meni)", (putanja) => {
    expect(izvor(putanja)).toContain("javniNaslov(");
  });

  test("the section layout keeps the plain product name as the default title", () => {
    expect(menuPanelSr.meta.naslovPanela).toBe("ScanMe Menu");
  });
});
