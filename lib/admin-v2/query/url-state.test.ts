import { describe, expect, test } from "vitest";
import type { SidebarConfig } from "@/lib/admin-v2/sidebar/types";
import { readUrlState, sidebarUrlFields, writeUrlState } from "./url-state";

// ADMIN v2 — filters, views, search and sort live in the URL (ZADATAK §3):
// a link can be shared, Back restores the list and a reload keeps it.

const config: SidebarConfig = {
  id: "test/lista",
  views: { key: "pogled", label: "Pogledi", defaultValue: "sve", items: [{ value: "sve", label: "Sve" }, { value: "danas", label: "Danas" }, { value: "kasni", label: "Kasni" }] },
  search: { key: "q", label: "Pretraga" },
  groups: [
    { id: "status", label: "Status", options: [{ value: "aktivan", label: "Aktivni" }, { value: "arhiviran", label: "Arhivirani" }] },
    { id: "klijent", label: "Klijent" },
    { id: "period", label: "Period", kind: "custom", keys: ["od", "do"] },
  ],
  sort: { key: "sort", label: "Sortiranje", defaultValue: "hitnost", options: [{ value: "hitnost", label: "Hitnost" }, { value: "naziv", label: "Naziv" }] },
};
const fields = sidebarUrlFields(config);

describe("the schema of a page", () => {
  test("every key the sidebar owns: view, search, each group (a custom group its own keys), sort", () => {
    expect(fields.map((field) => field.key)).toEqual(["pogled", "q", "status", "klijent", "od", "do", "sort"]);
  });
});

describe("reading", () => {
  test("valid values are read; a default and an absent key read as absent", () => {
    expect(readUrlState(fields, "?pogled=danas&q=bistro&status=aktivan&klijent=k_17&sort=naziv")).toEqual({ pogled: "danas", q: "bistro", status: "aktivan", klijent: "k_17", sort: "naziv" });
    expect(readUrlState(fields, "?pogled=sve&sort=hitnost")).toEqual({});
    expect(readUrlState(fields, "")).toEqual({});
  });

  test("a value the schema does not allow is dropped, never thrown", () => {
    expect(readUrlState(fields, "?pogled=nepostoji&status=<script>&klijent=a%20b&sort=")).toEqual({});
  });

  test("search is trimmed and cut to 120 characters", () => {
    expect(readUrlState(fields, `?q=${"a".repeat(200)}`).q).toHaveLength(120);
    expect(readUrlState(fields, "?q=%20%20")).toEqual({});
  });

  test("URLSearchParams and a query string read the same", () => {
    expect(readUrlState(fields, new URLSearchParams("status=arhiviran"))).toEqual(readUrlState(fields, "?status=arhiviran"));
  });
});

describe("writing", () => {
  test("a string sets the key; null, empty, default and invalid values remove it", () => {
    expect(writeUrlState(fields, "", { status: "aktivan" })).toBe("?status=aktivan");
    expect(writeUrlState(fields, "?status=aktivan", { status: null })).toBe("");
    expect(writeUrlState(fields, "?status=aktivan", { status: "" })).toBe("");
    expect(writeUrlState(fields, "?pogled=danas", { pogled: "sve" })).toBe("");
    expect(writeUrlState(fields, "?status=aktivan", { status: "nepostoji" })).toBe("");
  });

  test("parameters the schema does not know are kept (a deep link of the page survives a filter)", () => {
    expect(writeUrlState(fields, "?task=abc123&assignee=u1", { status: "aktivan" })).toBe("?task=abc123&assignee=u1&status=aktivan");
    expect(writeUrlState(fields, "?task=abc123&status=aktivan", { status: null })).toBe("?task=abc123");
  });

  test("a key outside the schema is neither written nor removed", () => {
    expect(writeUrlState(fields, "?task=abc123", { task: null, nepoznato: "x" })).toBe("?task=abc123");
  });

  test("several keys in one patch (dependent filters, Očisti sve)", () => {
    expect(writeUrlState(fields, "?q=bistro&status=aktivan&od=2026-10-09&pogled=danas", { q: null, status: null, klijent: null, od: null, do: null })).toBe("?pogled=danas");
  });
});

describe("Back and reload", () => {
  test("what is written is read back unchanged (the URL is the only state)", () => {
    const state = { pogled: "kasni", q: "škoda đ", status: "arhiviran", klijent: "k_17", od: "2026-10-09", do: "2026-10-11", sort: "naziv" };
    const url = writeUrlState(fields, "", state);
    expect(readUrlState(fields, url)).toEqual(state);
    // A second write of the same state does not change the address (no history noise).
    expect(writeUrlState(fields, url, state)).toBe(url);
  });

  test("going back to an address restores exactly its filters", () => {
    const first = writeUrlState(fields, "", { status: "aktivan" });
    const second = writeUrlState(fields, first, { q: "bistro", status: "arhiviran" });
    expect(readUrlState(fields, second)).toEqual({ q: "bistro", status: "arhiviran" });
    expect(readUrlState(fields, first)).toEqual({ status: "aktivan" });
  });
});
