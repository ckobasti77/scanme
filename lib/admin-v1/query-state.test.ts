import { describe, expect, test } from "vitest";
import { normalizeAdminQueryValue, parseAdminQuery, patchAdminQuery, serializeAdminQuery } from "./query-state";

// Admin UX A2 — filters and `prikaz` in the query string.

describe("admin query string (A2)", () => {
  test("reads known, valid keys from a string, URLSearchParams or Next searchParams", () => {
    const expected = { izlagac: "p1", prikaz: "kartice", q: "volta x" };
    expect(parseAdminQuery("?izlagac=p1&prikaz=kartice&q=volta+x")).toEqual(expected);
    expect(parseAdminQuery(new URLSearchParams("izlagac=p1&prikaz=kartice&q=volta%20x"))).toEqual(expected);
    expect(parseAdminQuery({ izlagac: "p1", prikaz: ["kartice", "tabela"], q: " volta x " })).toEqual(expected);
  });

  test("unknown keys and invalid values are ignored, never thrown", () => {
    expect(parseAdminQuery("?tab=qr&prikaz=mreza&paket=premium&izlagac=a%20b&od=10.10.2026&sort=model:gore")).toEqual({});
    expect(parseAdminQuery("?prikaz=tabela&paket=napredni&od=2026-10-09&sort=model:desc&stanje=slobodan")).toEqual({ prikaz: "tabela", paket: "napredni", od: "2026-10-09", sort: "model:desc", stanje: "slobodan" });
    expect(normalizeAdminQueryValue("q", "x".repeat(500))?.length).toBe(120);
  });

  test("`allowed` narrows to one section's keys", () => {
    expect(parseAdminQuery("?izlagac=p1&model=m1&prikaz=kartice", ["model"])).toEqual({ model: "m1" });
  });

  test("serialize: fixed key order, empty values dropped, empty state = no query string", () => {
    expect(serializeAdminQuery({ prikaz: "kartice", izlagac: "p1", q: "" })).toBe("?izlagac=p1&prikaz=kartice");
    expect(serializeAdminQuery({})).toBe("");
    expect(serializeAdminQuery({ q: "đak & ćevap" })).toBe("?q=%C4%91ak+%26+%C4%87evap");
    expect(parseAdminQuery(serializeAdminQuery({ q: "đak & ćevap" }))).toEqual({ q: "đak & ćevap" });
  });

  test("patch: a value sets, null/undefined/empty removes, invalid values are not written", () => {
    const current = { izlagac: "p1", prikaz: "tabela" } as const;
    expect(patchAdminQuery(current, { prikaz: "kartice" })).toEqual({ izlagac: "p1", prikaz: "kartice" });
    expect(patchAdminQuery(current, { izlagac: null })).toEqual({ prikaz: "tabela" });
    expect(patchAdminQuery(current, { izlagac: undefined, prikaz: "" })).toEqual({});
    expect(patchAdminQuery(current, { prikaz: "mreza" })).toEqual({ izlagac: "p1" });
    expect(patchAdminQuery(current, { nepoznat: "x" } as never)).toEqual(current);
  });
});
