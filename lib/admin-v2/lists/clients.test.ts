import { describe, expect, test } from "vitest";
import { CLIENTS_URL_FIELDS } from "@/lib/admin-v2/sidebar/configs/clients";
import { readUrlState } from "@/lib/admin-v2/query/url-state";
import { clientsListArgs, clientsNarrowed, filterPreviewClients, type PreviewClientRow } from "./clients";

// ADMIN v2 — Klijenti: the URL state becomes the same arguments of
// `adminReadModels.listClients` the page sent from its local state before.

const args = (query: string) => clientsListArgs(readUrlState(CLIENTS_URL_FIELDS, query));

describe("clientsListArgs", () => {
  test("an empty state gives the defaults of the page before the sidebar", () => {
    expect(clientsListArgs({})).toEqual({ search: undefined, status: "all", sort: "urgency" });
    expect(args("")).toEqual({ search: undefined, status: "all", sort: "urgency" });
  });

  test.each(["active", "archived"] as const)("status %s is sent as it is", (status) => {
    expect(args(`?status=${status}`)).toEqual({ search: undefined, status, sort: "urgency" });
  });

  test.each(["urgency", "name", "recent"] as const)("sort %s is sent as it is", (sort) => {
    expect(args(`?sort=${sort}`)).toEqual({ search: undefined, status: "all", sort });
  });

  test("the search is trimmed; blank means no search", () => {
    expect(clientsListArgs({ q: "  Ana Petrović  " }).search).toBe("Ana Petrović");
    expect(clientsListArgs({ q: "   " }).search).toBeUndefined();
    expect(args("?q=%20%20Ana%20%20")).toEqual({ search: "Ana", status: "all", sort: "urgency" });
  });

  test("everything together", () => {
    expect(args("?q=Ana&status=archived&sort=recent")).toEqual({ search: "Ana", status: "archived", sort: "recent" });
  });

  test("an invalid value in the URL reads as the default", () => {
    expect(args("?status=xyz&sort=abc")).toEqual({ search: undefined, status: "all", sort: "urgency" });
    expect(clientsListArgs({ status: "xyz", sort: "abc" })).toEqual({ search: undefined, status: "all", sort: "urgency" });
  });
});

describe("clientsNarrowed", () => {
  test("a search or a status narrows the list; a sort does not", () => {
    expect(clientsNarrowed(clientsListArgs({}))).toBe(false);
    expect(clientsNarrowed(clientsListArgs({ sort: "name" }))).toBe(false);
    expect(clientsNarrowed(clientsListArgs({ q: "Ana" }))).toBe(true);
    expect(clientsNarrowed(clientsListArgs({ status: "archived" }))).toBe(true);
  });
});

function row(name: string, extra: Partial<PreviewClientRow> = {}): PreviewClientRow {
  return {
    ownerDisplayName: name,
    smkCode: `SMK-${name.slice(0, 3).toUpperCase()}`,
    firstVenueName: `TEST lokal ${name}`,
    defaultContactEmail: `${name.toLowerCase()}@test.rs`,
    defaultContactPhone: "+381 60 000 00 00",
    clientStatus: "active",
    updatedAt: 0,
    ...extra,
  };
}

describe("filterPreviewClients", () => {
  const rows = [
    row("Čedomir", { updatedAt: 10 }),
    row("Branka", { clientStatus: "archived", updatedAt: 30, defaultContactEmail: null, firstVenueName: null }),
    row("Zoran", { updatedAt: 20 }),
    row("Ana", { updatedAt: 5 }),
  ];
  const names = (state: Record<string, string>) => filterPreviewClients(rows, state).map((item) => item.ownerDisplayName);

  test("an empty state keeps every row in the order of the fixture (urgency)", () => {
    expect(names({})).toEqual(["Čedomir", "Branka", "Zoran", "Ana"]);
    expect(names({ sort: "urgency" })).toEqual(["Čedomir", "Branka", "Zoran", "Ana"]);
  });

  test("the search covers name, code, venue, e-mail and phone, case-insensitively in sr-Latn", () => {
    expect(names({ q: "čedo" })).toEqual(["Čedomir"]);
    expect(names({ q: "ČEDO" })).toEqual(["Čedomir"]);
    expect(names({ q: "smk-zor" })).toEqual(["Zoran"]);
    expect(names({ q: "lokal ana" })).toEqual(["Ana"]);
    expect(names({ q: "ana@test.rs" })).toEqual(["Ana"]);
    expect(names({ q: "000 00" })).toHaveLength(4);
    expect(names({ q: "nepostojeci" })).toEqual([]);
    expect(names({ q: "  zoran  " })).toEqual(["Zoran"]);
  });

  test("a row with no venue or e-mail is not found by the word null", () => {
    expect(names({ q: "null" })).toEqual([]);
  });

  test("the status keeps the rows with that clientStatus", () => {
    expect(names({ status: "archived" })).toEqual(["Branka"]);
    expect(names({ status: "active" })).toEqual(["Čedomir", "Zoran", "Ana"]);
  });

  test("name sorts by the owner name in sr-Latn (Č after C, before D)", () => {
    expect(names({ sort: "name" })).toEqual(["Ana", "Branka", "Čedomir", "Zoran"]);
  });

  test("recent sorts by updatedAt, newest first", () => {
    expect(names({ sort: "recent" })).toEqual(["Branka", "Zoran", "Čedomir", "Ana"]);
  });

  test("the choices combine and the input is not mutated", () => {
    expect(names({ status: "active", sort: "name", q: "@test" })).toEqual(["Ana", "Čedomir", "Zoran"]);
    expect(rows.map((item) => item.ownerDisplayName)).toEqual(["Čedomir", "Branka", "Zoran", "Ana"]);
  });
});
