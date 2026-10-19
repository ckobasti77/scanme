import { describe, expect, test } from "vitest";
import { PARTS, SYSTEMS } from "./catalog";
import { DEFAULT_URL_STATE, parseUrlState, serializeUrlState, type UrlState } from "./url-state";

describe("URL stanje /sajam/3d", () => {
  test("prazan URL daje podrazumevano stanje i prazan string", () => {
    expect(parseUrlState(new URLSearchParams(""))).toEqual(DEFAULT_URL_STATE);
    expect(serializeUrlState(DEFAULT_URL_STATE)).toBe("");
  });

  test("ispravni parametri", () => {
    expect(parseUrlState(new URLSearchParams("deo=turbopunjac&grupa=motor&rezim=lak&tura=1&kiosk=1"))).toEqual({
      deo: "turbopunjac",
      grupa: "motor",
      rezim: "lak",
      tura: true,
      kiosk: true,
    });
  });

  test("nepoznate vrednosti se odbacuju", () => {
    expect(parseUrlState({ deo: "motorcic", grupa: "krila", rezim: "neon", tura: "da", kiosk: "0" })).toEqual(DEFAULT_URL_STATE);
    expect(parseUrlState({ deo: "turbopunjac__p" }).deo).toBeNull();
    expect(parseUrlState({ deo: "Turbopunjac" }).deo).toBeNull();
  });

  test("niz vrednosti uzima prvu (Next searchParams)", () => {
    expect(parseUrlState({ deo: ["hauba", "krov"] }).deo).toBe("hauba");
  });

  test("deo pobeđuje grupu drugog sistema", () => {
    expect(parseUrlState({ deo: "hauba", grupa: "motor" })).toMatchObject({ deo: "hauba", grupa: null });
    expect(parseUrlState({ deo: "hauba", grupa: "karoserija" })).toMatchObject({ deo: "hauba", grupa: "karoserija" });
  });

  test("kanonski redosled i izostavljanje podrazumevanog", () => {
    const s: UrlState = { deo: "turbopunjac", grupa: "motor", rezim: "kostur", tura: true, kiosk: true };
    expect(serializeUrlState(s)).toBe("?deo=turbopunjac&grupa=motor&rezim=kostur&tura=1&kiosk=1");
    expect(serializeUrlState({ ...DEFAULT_URL_STATE, grupa: "kocnice" })).toBe("?grupa=kocnice");
  });

  test("round-trip za 20 stanja (fiksno seme)", () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    const modes = ["rendgen", "lak", "kostur"] as const;
    for (let i = 0; i < 20; i++) {
      const part = rnd() < 0.7 ? PARTS[Math.floor(rnd() * PARTS.length)] : null;
      const grupa = part && rnd() < 0.5 ? part.system : !part && rnd() < 0.5 ? SYSTEMS[Math.floor(rnd() * SYSTEMS.length)].id : null;
      const s: UrlState = { deo: part?.id ?? null, grupa, rezim: modes[Math.floor(rnd() * 3)], tura: rnd() < 0.3, kiosk: rnd() < 0.3 };
      expect(parseUrlState(new URLSearchParams(serializeUrlState(s)))).toEqual(s);
    }
  });

  test("A10: ?rezim= prihvata tačno rendgen, lak i kostur", () => {
    expect(parseUrlState({ rezim: "lak" }).rezim).toBe("lak");
    expect(parseUrlState({ rezim: "kostur" }).rezim).toBe("kostur");
    expect(parseUrlState({ rezim: "rendgen" }).rezim).toBe("rendgen");
    for (const bad of ["Lak", "LAK", "lak ", "", "presek", "lak,kostur"]) expect(parseUrlState({ rezim: bad }).rezim, bad).toBe("rendgen");
    expect(parseUrlState({ rezim: ["kostur", "lak"] }).rezim).toBe("kostur");
    expect(serializeUrlState({ ...DEFAULT_URL_STATE, rezim: "lak" })).toBe("?rezim=lak");
    expect(serializeUrlState({ ...DEFAULT_URL_STATE, rezim: "rendgen" })).toBe("");
  });

  test("A10: ?tura= i ?kiosk= su uključeni samo za 1", () => {
    for (const on of ["1", ["1", "0"]]) {
      expect(parseUrlState({ tura: on }).tura).toBe(true);
      expect(parseUrlState({ kiosk: on }).kiosk).toBe(true);
    }
    for (const off of ["0", "true", "da", "", "01", " 1", undefined]) {
      expect(parseUrlState({ tura: off }).tura, String(off)).toBe(false);
      expect(parseUrlState({ kiosk: off }).kiosk, String(off)).toBe(false);
    }
    expect(parseUrlState(new URLSearchParams("tura=1&kiosk=1"))).toMatchObject({ tura: true, kiosk: true });
    expect(serializeUrlState({ ...DEFAULT_URL_STATE, tura: true })).toBe("?tura=1");
    expect(serializeUrlState({ ...DEFAULT_URL_STATE, kiosk: true })).toBe("?kiosk=1");
  });
});
