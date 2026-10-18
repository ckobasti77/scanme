// ScanMe Menu V1 (K14) — the language of a public menu page from the address.

import { describe, expect, test } from "vitest";
import { jezikIzUpita, saJezikom } from "./i18n-fallback";

const JEZICI = ["sr", "en", "de"];

describe("jezikIzUpita", () => {
  test("a published code returns itself", () => {
    expect(jezikIzUpita("en", JEZICI)).toBe("en");
    expect(jezikIzUpita("de", JEZICI)).toBe("de");
    expect(jezikIzUpita("sr", JEZICI)).toBe("sr");
  });

  test("an unknown code falls back to the source language", () => {
    expect(jezikIzUpita("xx", JEZICI)).toBe("sr");
    expect(jezikIzUpita("english", JEZICI)).toBe("sr");
  });

  test("a known but unpublished language falls back to the source", () => {
    expect(jezikIzUpita("fr", JEZICI)).toBe("sr");
    expect(jezikIzUpita("de", ["sr", "en"])).toBe("sr");
  });

  test("case and surrounding whitespace are normalised", () => {
    expect(jezikIzUpita("EN", JEZICI)).toBe("en");
    expect(jezikIzUpita("  De ", JEZICI)).toBe("de");
  });

  test("null, undefined, empty and blank give the source", () => {
    expect(jezikIzUpita(null, JEZICI)).toBe("sr");
    expect(jezikIzUpita(undefined, JEZICI)).toBe("sr");
    expect(jezikIzUpita("", JEZICI)).toBe("sr");
    expect(jezikIzUpita("   ", JEZICI)).toBe("sr");
  });

  test("the source is the first published language, not always sr", () => {
    expect(jezikIzUpita(null, ["en", "sr"])).toBe("en");
    expect(jezikIzUpita("xx", ["en", "sr"])).toBe("en");
    expect(jezikIzUpita("sr", ["en", "sr"])).toBe("sr");
  });

  test("an empty list gives sr", () => {
    expect(jezikIzUpita("en", [])).toBe("sr");
    expect(jezikIzUpita(null, [])).toBe("sr");
  });
});

describe("saJezikom", () => {
  test("the source language leaves the link unchanged", () => {
    expect(saJezikom("/m/demo-restoran", "sr", JEZICI)).toBe("/m/demo-restoran");
    expect(saJezikom("/m/demo-restoran?a=1#x", "sr", JEZICI)).toBe("/m/demo-restoran?a=1#x");
  });

  test("an unpublished language leaves the link unchanged", () => {
    expect(saJezikom("/m/demo-restoran", "fr", JEZICI)).toBe("/m/demo-restoran");
    expect(saJezikom("/m/demo-restoran", "", JEZICI)).toBe("/m/demo-restoran");
  });

  test("another published language appends ?jezik=", () => {
    expect(saJezikom("/m/demo-restoran", "en", JEZICI)).toBe("/m/demo-restoran?jezik=en");
  });

  test("a link that already has a query gets &jezik=", () => {
    expect(saJezikom("/m/demo-restoran?stranica=pice", "en", JEZICI)).toBe("/m/demo-restoran?stranica=pice&jezik=en");
  });

  test("a #fragment stays at the end", () => {
    expect(saJezikom("/m/demo-restoran#a-ar_1", "en", JEZICI)).toBe("/m/demo-restoran?jezik=en#a-ar_1");
    expect(saJezikom("/m/demo-restoran?x=1#a-ar_1", "de", JEZICI)).toBe("/m/demo-restoran?x=1&jezik=de#a-ar_1");
  });

  test("the source is the first language of the list", () => {
    expect(saJezikom("/m/demo", "en", ["en", "sr"])).toBe("/m/demo");
    expect(saJezikom("/m/demo", "sr", ["en", "sr"])).toBe("/m/demo?jezik=sr");
  });

  test("an empty list treats sr as the source", () => {
    expect(saJezikom("/m/demo", "sr", [])).toBe("/m/demo");
    expect(saJezikom("/m/demo", "en", [])).toBe("/m/demo");
  });
});
