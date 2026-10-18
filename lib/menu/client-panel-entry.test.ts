import { describe, expect, test } from "vitest";
import {
  meniUlazMesto,
  meniUlazStanje,
  type MeniUlazMesto,
  type MeniUlazStanje,
} from "./client-panel-entry";

describe("meniUlazStanje: the Menu answer as the panel sees it", () => {
  test("undefined (the query is loading) is ucitava", () => {
    expect(meniUlazStanje(undefined)).toBe("ucitava");
  });

  test("status none is nema", () => {
    expect(meniUlazStanje({ status: "none" })).toBe("nema");
  });

  test("status available is dostupno", () => {
    expect(meniUlazStanje({ status: "available" })).toBe("dostupno");
  });
});

type Overview = "available" | "forbidden";

describe("meniUlazMesto: where the entry is shown, full table (24 rows)", () => {
  // Rules, written out per row (not computed):
  // - overview available: "iznad-tabova" only when the Menu is dostupno, else nothing;
  // - overview forbidden with a venue or memories section: "iznad-dodatnih" only when dostupno, else nothing;
  // - overview forbidden with neither: "samo-meni" when dostupno, "ceka" while ucitava, nothing when nema.
  const TABELA: [Overview, boolean, boolean, MeniUlazStanje, MeniUlazMesto | null][] = [
    ["available", true, true, "ucitava", null],
    ["available", true, true, "nema", null],
    ["available", true, true, "dostupno", "iznad-tabova"],
    ["available", true, false, "ucitava", null],
    ["available", true, false, "nema", null],
    ["available", true, false, "dostupno", "iznad-tabova"],
    ["available", false, true, "ucitava", null],
    ["available", false, true, "nema", null],
    ["available", false, true, "dostupno", "iznad-tabova"],
    ["available", false, false, "ucitava", null],
    ["available", false, false, "nema", null],
    ["available", false, false, "dostupno", "iznad-tabova"],

    ["forbidden", true, true, "ucitava", null],
    ["forbidden", true, true, "nema", null],
    ["forbidden", true, true, "dostupno", "iznad-dodatnih"],
    ["forbidden", true, false, "ucitava", null],
    ["forbidden", true, false, "nema", null],
    ["forbidden", true, false, "dostupno", "iznad-dodatnih"],
    ["forbidden", false, true, "ucitava", null],
    ["forbidden", false, true, "nema", null],
    ["forbidden", false, true, "dostupno", "iznad-dodatnih"],
    ["forbidden", false, false, "ucitava", "ceka"],
    ["forbidden", false, false, "nema", null],
    ["forbidden", false, false, "dostupno", "samo-meni"],
  ];

  test("the table has 24 distinct rows", () => {
    expect(TABELA).toHaveLength(24);
    const kljucevi = TABELA.map(([overview, venue, memories, meni]) => `${overview}:${venue}:${memories}:${meni}`);
    expect(new Set(kljucevi).size).toBe(24);
  });

  test.each(TABELA)(
    "overview %s, venue %s, memories %s, meni %s -> %s",
    (overview, venue, memories, meni, ocekivano) => {
      expect(meniUlazMesto({ overview, venue, memories, meni })).toBe(ocekivano);
    },
  );
});

describe("regression: a venue without ScanMe Menu gets no entry and no change", () => {
  const KOMBINACIJE: [Overview, boolean, boolean][] = [
    ["available", true, true],
    ["available", true, false],
    ["available", false, true],
    ["available", false, false],
    ["forbidden", true, true],
    ["forbidden", true, false],
    ["forbidden", false, true],
    ["forbidden", false, false],
  ];

  test("there are eight combinations", () => {
    expect(KOMBINACIJE).toHaveLength(8);
  });

  test.each(KOMBINACIJE)(
    "meni nema gives null for overview %s, venue %s, memories %s",
    (overview, venue, memories) => {
      expect(meniUlazMesto({ overview, venue, memories, meni: "nema" })).toBeNull();
    },
  );

  test("the whole path: a none answer never produces a place", () => {
    const meni = meniUlazStanje({ status: "none" });
    expect(meni).toBe("nema");
    expect(meniUlazMesto({ overview: "forbidden", venue: false, memories: false, meni })).toBeNull();
  });
});
