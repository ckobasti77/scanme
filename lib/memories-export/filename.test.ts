import { describe, expect, test } from "vitest";
import {
  photoFileName,
  photoPath,
  tableFolder,
  tableSlug,
} from "./filename";

describe("tableSlug", () => {
  test("zero-pads a trailing number to two digits", () => {
    expect(tableSlug("Sto 4", "ostalo")).toBe("sto-04");
    expect(tableSlug("Sto 10", "ostalo")).toBe("sto-10");
    expect(tableSlug("VIP 3", "ostalo")).toBe("vip-03");
  });

  test("transliterates Serbian diacritics to ASCII", () => {
    expect(tableSlug("Šank", "ostalo")).toBe("sank");
    expect(tableSlug("Ćošak 2", "ostalo")).toBe("cosak-02");
  });

  test("falls back for a cardless photo", () => {
    expect(tableSlug(null, "ostalo")).toBe("ostalo");
    expect(tableSlug("   ", "ostalo")).toBe("ostalo");
  });
});

describe("tableFolder", () => {
  test("keeps the human label verbatim", () => {
    expect(tableFolder("Sto 4", "Ostalo")).toBe("Sto 4");
  });

  test("strips path separators and leading dots (no zip-slip)", () => {
    expect(tableFolder("../../etc", "Ostalo")).not.toContain("/");
    expect(tableFolder("..\\win", "Ostalo")).not.toContain("\\");
    expect(tableFolder(".hidden", "Ostalo").startsWith(".")).toBe(false);
  });

  test("falls back for a cardless photo", () => {
    expect(tableFolder(null, "Ostalo")).toBe("Ostalo");
  });
});

describe("photoFileName", () => {
  test("matches the spec's example in Belgrade wall-clock", () => {
    // Belgrade is CEST (UTC+2) on 2026-08-27, so 21:49 local = 19:49 UTC.
    const epoch = Date.UTC(2026, 7, 27, 19, 49, 30);
    expect(photoFileName(epoch, "sto-04", 1)).toBe(
      "2026-08-27_2149_sto-04_01.jpg",
    );
  });

  test("pads the sequence to two digits and grows past 99", () => {
    const epoch = Date.UTC(2026, 7, 27, 19, 49, 0);
    expect(photoFileName(epoch, "sto-04", 7)).toBe(
      "2026-08-27_2149_sto-04_07.jpg",
    );
    expect(photoFileName(epoch, "sto-04", 123)).toBe(
      "2026-08-27_2149_sto-04_123.jpg",
    );
  });
});

describe("photoPath", () => {
  test("joins folder and file", () => {
    expect(photoPath("Sto 4", "2026-08-27_2149_sto-04_01.jpg")).toBe(
      "Sto 4/2026-08-27_2149_sto-04_01.jpg",
    );
  });
});
