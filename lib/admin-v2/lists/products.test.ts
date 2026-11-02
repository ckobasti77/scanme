import { describe, expect, test } from "vitest";
import { readUrlState } from "@/lib/admin-v2/query/url-state";
import { PRODUCT_TYPES, PRODUCTS_URL_FIELDS } from "@/lib/admin-v2/sidebar/configs/operations";
import {
  filterPreviewInventory,
  filterPreviewVenues,
  hasInventoryFilter,
  inventoryFilterKey,
  inventoryListArgs,
  venueListArgs,
  type InventoryPreviewRow,
  type VenuePreviewRow,
} from "./products";

// ADMIN v2 — Proizvodi: the URL state of the sidebar becomes the arguments of
// `adminProductReads.listVenues` (no venue chosen) and `listInventory`
// (`?venue=`), the same ones the filter blocks above the lists sent before.

const read = (search: string) => readUrlState(PRODUCTS_URL_FIELDS, search);

describe("venueListArgs", () => {
  test("an empty state is the whole list by urgency", () => {
    expect(venueListArgs({})).toEqual({ filter: "all", sort: "urgency" });
    expect(venueListArgs(read(""))).toEqual({ filter: "all", sort: "urgency" });
  });

  test("search and lokali give the arguments the list sent before", () => {
    expect(venueListArgs(read("?q=SMF-0102"))).toEqual({ search: "SMF-0102", filter: "all", sort: "urgency" });
    expect(venueListArgs(read("?lokali=problem"))).toEqual({ filter: "problem", sort: "urgency" });
    expect(venueListArgs(read("?lokali=active&q=kej"))).toEqual({ search: "kej", filter: "active", sort: "urgency" });
  });

  test("a blank search is not sent; an invalid value reads as absent", () => {
    expect(venueListArgs({ q: "  " })).toEqual({ filter: "all", sort: "urgency" });
    expect(venueListArgs(read("?lokali=all"))).toEqual({ filter: "all", sort: "urgency" });
    expect(venueListArgs(read("?lokali=nepoznato"))).toEqual({ filter: "all", sort: "urgency" });
  });

  test("the chosen venue is not a list argument", () => {
    expect(venueListArgs(read("?venue=business-test"))).toEqual({ filter: "all", sort: "urgency" });
  });
});

describe("inventoryListArgs", () => {
  test("an empty state is the whole inventory in SMF order", () => {
    expect(inventoryListArgs({})).toEqual({ sort: "smf", direction: "asc" });
    expect(inventoryListArgs(read("?venue=business-test"))).toEqual({ sort: "smf", direction: "asc" });
  });

  test("every filter gives the argument the list sent before", () => {
    expect(inventoryListArgs(read("?q=009"))).toEqual({ search: "009", sort: "smf", direction: "asc" });
    for (const type of PRODUCT_TYPES) expect(inventoryListArgs(read(`?tip=${type}`))).toEqual({ productType: type, sort: "smf", direction: "asc" });
    expect(inventoryListArgs(read("?dizajn=template"))).toEqual({ design: "template", sort: "smf", direction: "asc" });
    expect(inventoryListArgs(read("?dizajn=custom"))).toEqual({ design: "custom", sort: "smf", direction: "asc" });
    expect(inventoryListArgs(read("?usluga=scanme_links"))).toEqual({ service: "scanme_links", sort: "smf", direction: "asc" });
    expect(inventoryListArgs(read("?usluga=google_review"))).toEqual({ service: "google_review", sort: "smf", direction: "asc" });
    for (const status of ["active", "inactive", "problem"]) expect(inventoryListArgs(read(`?status=${status}`))).toEqual({ state: status, sort: "smf", direction: "asc" });
    expect(inventoryListArgs(read("?q=a&tip=stickers&dizajn=custom&usluga=google_review&status=problem"))).toEqual({
      search: "a", productType: "stickers", design: "custom", service: "google_review", state: "problem", sort: "smf", direction: "asc",
    });
  });

  test("an invalid value reads as absent", () => {
    expect(inventoryListArgs(read("?tip=magnet&dizajn=x&usluga=meni&status=svi"))).toEqual({ sort: "smf", direction: "asc" });
  });
});

describe("inventory filter key", () => {
  test("changes with every filter and the search, not with the venue", () => {
    const keys = ["", "?q=a", "?tip=stickers", "?dizajn=custom", "?usluga=scanme_links", "?status=problem"].map((search) => inventoryFilterKey(read(search)));
    expect(new Set(keys).size).toBe(keys.length);
    expect(inventoryFilterKey(read("?venue=a"))).toBe(inventoryFilterKey(read("?venue=b")));
  });

  test("hasInventoryFilter is true while anything narrows the list", () => {
    expect(hasInventoryFilter(read(""))).toBe(false);
    expect(hasInventoryFilter(read("?venue=business-test"))).toBe(false);
    expect(hasInventoryFilter(read("?q=x"))).toBe(true);
    expect(hasInventoryFilter(read("?status=active"))).toBe(true);
  });
});

const venue = (id: string, status: VenuePreviewRow["status"], extra: Partial<VenuePreviewRow> = {}): VenuePreviewRow => ({
  accountName: "TEST Klijent", venueName: `TEST Lokal ${id}`, smkCode: "SMK-TEST", smlCode: `SML-TEST-${id}`, status, ...extra,
});
const venues = [venue("1", "problem"), venue("2", "active"), venue("3", "inactive", { accountName: "TEST Drugi" })];
const venueNames = (search: string) => filterPreviewVenues(venues, read(search)).map((row) => row.smlCode);

describe("filterPreviewVenues", () => {
  test("the rules of the old finder: search over client, venue and codes, then the status filter", () => {
    expect(venueNames("")).toEqual(["SML-TEST-1", "SML-TEST-2", "SML-TEST-3"]);
    expect(venueNames("?lokali=problem")).toEqual(["SML-TEST-1"]);
    expect(venueNames("?lokali=active")).toEqual(["SML-TEST-2"]);
    expect(venueNames("?q=drugi")).toEqual(["SML-TEST-3"]);
    expect(venueNames("?q=sml-test-2&lokali=active")).toEqual(["SML-TEST-2"]);
    expect(venueNames("?q=sml-test-2&lokali=problem")).toEqual([]);
  });
});

const product = (suffix: string, extra: Partial<InventoryPreviewRow> = {}): InventoryPreviewRow => ({
  smfCode: `SMF-TEST-01-${suffix}`, localSuffix: suffix, productType: "two-piece-stand", position: null, destination: null, services: [], status: "active", ...extra,
});
const products = [
  product("001", { position: "TEST sto 1", services: ["Meni"] }),
  product("002", { productType: "stickers", status: "problem", destination: "TEST odredište", services: ["Links"] }),
  product("003", { productType: "stickers", status: "inactive", services: ["ScanMe Links", "Google Review"] }),
  product("004", { position: "TEST šank", services: ["Review"] }),
];
const suffixes = (search: string) => filterPreviewInventory(products, read(search)).map((row) => row.localSuffix);

describe("filterPreviewInventory", () => {
  test("without filters every row stays", () => {
    expect(suffixes("?venue=business-test")).toEqual(["001", "002", "003", "004"]);
  });

  test("type, status and service narrow the rows", () => {
    expect(suffixes("?tip=stickers")).toEqual(["002", "003"]);
    expect(suffixes("?status=problem")).toEqual(["002"]);
    expect(suffixes("?tip=stickers&status=inactive")).toEqual(["003"]);
    expect(suffixes("?usluga=scanme_links")).toEqual(["002", "003"]);
    expect(suffixes("?usluga=google_review")).toEqual(["003", "004"]);
  });

  test("the search looks at the SMF, the suffix, the position and the destination", () => {
    expect(suffixes("?q=smf-test-01-003")).toEqual(["003"]);
    expect(suffixes("?q=002")).toEqual(["002"]);
    expect(suffixes("?q=šank")).toEqual(["004"]);
    expect(suffixes("?q=odredište")).toEqual(["002"]);
    expect(suffixes("?q=nema")).toEqual([]);
  });

  test("the design filter is not applied to the fixture rows (they carry no template / custom flag)", () => {
    expect(suffixes("?dizajn=custom")).toEqual(["001", "002", "003", "004"]);
  });
});
