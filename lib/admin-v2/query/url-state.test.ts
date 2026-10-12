import { describe, expect, test } from "vitest";
import { INBOX_URL_FIELDS } from "@/lib/admin-v2/sidebar/configs/inbox";
import { ORDERS_URL_FIELDS } from "@/lib/admin-v2/sidebar/configs/operations";
import { TASKS_URL_FIELDS } from "@/lib/admin-v2/sidebar/configs/tasks";
import type { SidebarConfig } from "@/lib/admin-v2/sidebar/types";
import { RECORD_ID, readUrlState, sidebarUrlFields, writeUrlState } from "./url-state";

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

  test("the choice of an always open context list is a key too (an intercept may clear it); a context the route chooses is not", () => {
    const list = sidebarUrlFields({ id: "test/posta", context: { id: "folder", label: "Folderi", list: true }, views: config.views, groups: [{ id: "nalog", label: "Sanduče" }] });
    expect(list.map((field) => field.key)).toEqual(["folder", "pogled", "nalog"]);
    expect(writeUrlState(list, "?folder=2099&pogled=danas", { nalog: "b", folder: null })).toBe("?pogled=danas&nalog=b");
    expect(sidebarUrlFields({ id: "test/dogadjaji", context: { id: "dogadjaj", label: "Događaj" } })).toEqual([]);
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

describe("groups with a default and custom groups with a name", () => {
  const page: SidebarConfig = {
    id: "test/finansije",
    groups: [
      { id: "period", label: "Period", defaultValue: "mesec", options: [{ value: "mesec", label: "Ovaj mesec" }, { value: "godina", label: "Godina" }] },
      { id: "opseg", label: "Opseg", kind: "custom", keys: ["klijent", "opseg"], textKeys: ["opseg"] },
    ],
  };
  const pageFields = sidebarUrlFields(page);

  test("the default of a group is not written and reads as absent", () => {
    expect(writeUrlState(pageFields, "?period=godina", { period: "mesec" })).toBe("");
    expect(readUrlState(pageFields, "?period=mesec")).toEqual({});
    expect(readUrlState(pageFields, "?period=godina")).toEqual({ period: "godina" });
    expect(readUrlState(pageFields, "?period=xyz")).toEqual({});
  });

  test("a text key of a custom group keeps a name with spaces; its id key stays an id", () => {
    const url = writeUrlState(pageFields, "", { klijent: "k_17", opseg: "TEST Klijent · SMK-0001" });
    expect(readUrlState(pageFields, url)).toEqual({ klijent: "k_17", opseg: "TEST Klijent · SMK-0001" });
    expect(readUrlState(pageFields, "?klijent=ima%20razmak")).toEqual({});
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

// ADMIN v2 X6 (RX S5) — a filter whose value is the id of a record goes to a Convex query as `v.id(…)`.
// A value that is not shaped like an id used to reach the query and fail the whole page.
describe("groups whose values are ids of records", () => {
  const page: SidebarConfig = {
    id: "test/ids",
    groups: [
      { id: "assignee", label: "Zaduženi", ids: ["mine", "unassigned"] },
      { id: "klijent", label: "Klijent", ids: true },
    ],
  };
  const idFields = sidebarUrlFields(page);
  const convexId = "jd7".padEnd(32, "4");

  test("?assignee=abc reads as absent; a Convex id and the words of the group are kept", () => {
    expect(readUrlState(idFields, "?assignee=abc")).toEqual({});
    expect(readUrlState(idFields, "?assignee=123&klijent=ima%20razmak")).toEqual({});
    expect(readUrlState(idFields, `?assignee=${convexId}&klijent=${convexId}`)).toEqual({ assignee: convexId, klijent: convexId });
    expect(readUrlState(idFields, "?assignee=mine")).toEqual({ assignee: "mine" });
    expect(readUrlState(idFields, "?assignee=unassigned")).toEqual({ assignee: "unassigned" });
    // The words belong to the group that names them, not to every id group.
    expect(readUrlState(idFields, "?klijent=mine")).toEqual({});
    // Upper case, a wrong length or other characters are not an id.
    expect(readUrlState(idFields, `?klijent=${convexId.toUpperCase()}`)).toEqual({});
    expect(readUrlState(idFields, `?klijent=${convexId.slice(0, 20)}`)).toEqual({});
    expect(readUrlState(idFields, `?klijent=${convexId}'--`)).toEqual({});
  });

  test("the fixture ids of the dev previews are ids too, so the previews keep their filters", () => {
    for (const id of ["user-fixture-admin", "fixture-admin", "account-fixture-1", "preview-admin-jovan", "test-admin-1"]) {
      expect(RECORD_ID.test(id), id).toBe(true);
      expect(readUrlState(idFields, `?klijent=${id}`)).toEqual({ klijent: id });
    }
    for (const id of ["abc", "admin-1", "a1", "fixture admin", ""]) expect(RECORD_ID.test(id), id).toBe(false);
  });

  test("a value that is not an id is never written", () => {
    expect(writeUrlState(idFields, "", { assignee: "abc" })).toBe("");
    expect(writeUrlState(idFields, `?assignee=${convexId}`, { assignee: "abc" })).toBe("");
    expect(writeUrlState(idFields, "", { assignee: "mine", klijent: convexId })).toBe(`?assignee=mine&klijent=${convexId}`);
  });

  test("the lists that send ids to their query use the rule: Zadaci, Porudžbine, Inbox", () => {
    expect(readUrlState(TASKS_URL_FIELDS, "?assignee=abc&klijent=abc&lokal=abc&pogled=overdue")).toEqual({ pogled: "overdue" });
    expect(readUrlState(ORDERS_URL_FIELDS, "?assignee=abc&problem=da")).toEqual({ problem: "da" });
    expect(readUrlState(INBOX_URL_FIELDS, "?assignee=abc&status=needs_reply")).toEqual({ status: "needs_reply" });
    expect(readUrlState(INBOX_URL_FIELDS, "?assignee=mine")).toEqual({ assignee: "mine" });
    expect(readUrlState(TASKS_URL_FIELDS, `?assignee=${convexId}`)).toEqual({ assignee: convexId });
  });
});
