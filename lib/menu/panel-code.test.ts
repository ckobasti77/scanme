// ScanMe Menu V1 (K22) — the code of the waiter-panel link
// /[slug]/konobar/[kod]: ten Crockford base32 characters (no I L O U).

import { describe, expect, test, vi } from "vitest";
import { PANEL_CODE_LENGTH, newPanelCode, normalizePanelCode, waiterCookiePath, waiterPanelPath } from "./panel-code";

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

describe("newPanelCode", () => {
  test("is ten characters of the Crockford alphabet", () => {
    expect(PANEL_CODE_LENGTH).toBe(10);
    for (let i = 0; i < 50; i += 1) {
      const code = newPanelCode();
      expect(code).toHaveLength(10);
      expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{10}$/);
      for (const char of code) expect(ALPHABET).toContain(char);
    }
  });

  test("never contains I, L, O or U", () => {
    for (let i = 0; i < 50; i += 1) {
      expect(newPanelCode()).not.toMatch(/[ILOU]/);
    }
  });

  test("two random codes differ", () => {
    expect(newPanelCode()).not.toBe(newPanelCode());
  });

  test("asks the random source for exactly ten bytes", () => {
    const random = vi.fn((length: number) => new Uint8Array(length));
    newPanelCode(random);
    expect(random).toHaveBeenCalledTimes(1);
    expect(random).toHaveBeenCalledWith(PANEL_CODE_LENGTH);
  });

  test("an injected random source gives a deterministic code (byte % 32)", () => {
    expect(newPanelCode(() => Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]))).toBe("0123456789");
    // 10 = A, 18 = J (I is skipped), 20 = M, 22 = P, 26 = T, 27 = V, 29 = X, 30 = Y, 31 = Z.
    expect(newPanelCode(() => Uint8Array.from([0, 10, 18, 20, 22, 26, 27, 29, 30, 31]))).toBe("0AJMPTVXYZ");
  });

  test("bytes above 31 wrap around the alphabet", () => {
    expect(newPanelCode(() => Uint8Array.from([32, 42, 50, 52, 54, 58, 59, 61, 62, 63]))).toBe("0AJMPTVXYZ");
    expect(newPanelCode(() => new Uint8Array(10).fill(255))).toBe("ZZZZZZZZZZ");
    expect(newPanelCode(() => new Uint8Array(10).fill(0))).toBe("0000000000");
  });

  test("every byte value maps into the alphabet", () => {
    for (let byte = 0; byte < 256; byte += 1) {
      const code = newPanelCode(() => new Uint8Array(10).fill(byte));
      expect(code).toBe(ALPHABET[byte % 32].repeat(10));
    }
  });
});

describe("normalizePanelCode", () => {
  test("returns a canonical code unchanged", () => {
    expect(normalizePanelCode("K7M2Q9XR4T")).toBe("K7M2Q9XR4T");
  });

  test("uppercases and trims", () => {
    expect(normalizePanelCode("k7m2q9xr4t")).toBe("K7M2Q9XR4T");
    expect(normalizePanelCode("  K7M2Q9XR4T\n")).toBe("K7M2Q9XR4T");
  });

  test("maps I and L to 1, O to 0 (as on printed cards)", () => {
    expect(normalizePanelCode("ILOILO1234")).toBe("1101101234");
    expect(normalizePanelCode("ilo1lo1234")).toBe("1101101234");
  });

  test("a new code survives its own normalisation", () => {
    for (let i = 0; i < 20; i += 1) {
      const code = newPanelCode();
      expect(normalizePanelCode(code)).toBe(code);
      expect(normalizePanelCode(code.toLowerCase())).toBe(code);
    }
  });

  test("rejects a wrong length", () => {
    expect(normalizePanelCode("")).toBeNull();
    expect(normalizePanelCode("K7M2Q9XR4")).toBeNull();
    expect(normalizePanelCode("K7M2Q9XR4TA")).toBeNull();
  });

  test("rejects U", () => {
    expect(normalizePanelCode("K7M2Q9XR4U")).toBeNull();
    expect(normalizePanelCode("k7m2q9xr4u")).toBeNull();
  });

  test("rejects symbols and inner whitespace", () => {
    expect(normalizePanelCode("K7M2Q9XR4-")).toBeNull();
    expect(normalizePanelCode("K7M2Q9XR4_")).toBeNull();
    expect(normalizePanelCode("K7M2 Q9XR4")).toBeNull();
    expect(normalizePanelCode("K7M2Q9XR4/")).toBeNull();
    expect(normalizePanelCode("../../etc")).toBeNull();
  });

  test("rejects anything longer than 32 characters, even if it would trim to a code", () => {
    expect(normalizePanelCode("A".repeat(33))).toBeNull();
    expect(normalizePanelCode(`${" ".repeat(23)}K7M2Q9XR4T`)).toBeNull();
  });

  test("a 32-character string is still trimmed and checked", () => {
    expect(normalizePanelCode(`${" ".repeat(22)}K7M2Q9XR4T`)).toBe("K7M2Q9XR4T");
  });

  test("rejects non-strings", () => {
    expect(normalizePanelCode(null)).toBeNull();
    expect(normalizePanelCode(undefined)).toBeNull();
    expect(normalizePanelCode(1234567890 as unknown as string)).toBeNull();
    expect(normalizePanelCode(["K7M2Q9XR4T"] as unknown as string)).toBeNull();
  });
});

describe("paths", () => {
  test("waiterPanelPath is /slug/konobar/code", () => {
    expect(waiterPanelPath("demo-restoran", "K7M2Q9XR4T")).toBe("/demo-restoran/konobar/K7M2Q9XR4T");
  });

  test("waiterCookiePath scopes the cookie to every panel route of the venue", () => {
    expect(waiterCookiePath("demo-restoran")).toBe("/demo-restoran/konobar");
  });

  test("the cookie path is a prefix of the panel path", () => {
    expect(waiterPanelPath("kafe", "K7M2Q9XR4T").startsWith(`${waiterCookiePath("kafe")}/`)).toBe(true);
  });
});
