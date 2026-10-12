import { describe, expect, test } from "vitest";
import { readUrlState } from "@/lib/admin-v2/query/url-state";
import { SERVICE_SORTS, SERVICE_VIEWS, SERVICES_URL_FIELDS } from "@/lib/admin-v2/sidebar/configs/services";
import { filterPreviewServices, servicesAreFiltered, servicesListArgs, type PreviewServiceRow } from "./services";

// ADMIN v2 Usluge — the URL state (`pogled`, `q`, `sort`) gives the same
// arguments of `adminServiceOperations.list` the page sent before, and the
// same preview rows.

const read = (query: string) => readUrlState(SERVICES_URL_FIELDS, query);

describe("servicesListArgs", () => {
  test("an empty state is the initial state of the page before the sidebar", () => {
    expect(servicesListArgs({})).toEqual({ filter: "all", sort: "urgency" });
    expect(servicesListArgs(read(""))).toEqual({ filter: "all", sort: "urgency" });
  });

  test.each(SERVICE_VIEWS)("the view %s is the filter argument", (view) => {
    expect(servicesListArgs(read(`?pogled=${view}`))).toEqual({ filter: view, sort: "urgency" });
  });

  test.each(SERVICE_SORTS)("the sort %s is the sort argument", (sort) => {
    expect(servicesListArgs(read(`?sort=${sort}`))).toEqual({ filter: "all", sort });
  });

  test("a search is sent only when it is not blank after trim", () => {
    expect(servicesListArgs(read("?q=Demo%20lokal"))).toEqual({ filter: "all", sort: "urgency", search: "Demo lokal" });
    expect(servicesListArgs({ q: "   " })).toEqual({ filter: "all", sort: "urgency" });
    expect(servicesListArgs(read("?q=%20%20"))).toEqual({ filter: "all", sort: "urgency" });
  });

  test("all three together", () => {
    expect(servicesListArgs(read("?pogled=grace&sort=recent&q=SML-1"))).toEqual({ filter: "grace", sort: "recent", search: "SML-1" });
  });

  test("an invalid value reads as absent and gives the default", () => {
    expect(servicesListArgs(read("?pogled=warning&sort=x"))).toEqual({ filter: "all", sort: "urgency" });
    expect(servicesListArgs(read("?pogled=inactive"))).toEqual({ filter: "all", sort: "urgency" });
  });

  test("the profile of the selected venue is not a filter", () => {
    expect(servicesListArgs(read("?profile=abc123"))).toEqual({ filter: "all", sort: "urgency" });
    expect(servicesAreFiltered(read("?profile=abc123"))).toBe(false);
  });
});

describe("servicesAreFiltered", () => {
  test("a search or a view other than all", () => {
    expect(servicesAreFiltered({})).toBe(false);
    expect(servicesAreFiltered(read("?sort=name"))).toBe(false);
    expect(servicesAreFiltered(read("?pogled=problem"))).toBe(true);
    expect(servicesAreFiltered(read("?q=test"))).toBe(true);
    expect(servicesAreFiltered({ q: "  " })).toBe(false);
  });
});

function row(extra: Partial<PreviewServiceRow> & { venueName: string }): PreviewServiceRow {
  return { serviceType: "scanme_links", filterState: "active", accountName: "TEST nalog", smkCode: "SMK-T-1", smlCode: "SML-T-1", updatedAt: 0, ...extra };
}

const rows: PreviewServiceRow[] = [
  row({ venueName: "TEST Šank", filterState: "active", smlCode: "SML-T-1", updatedAt: 100 }),
  row({ venueName: "TEST Centar", filterState: "grace", smlCode: "SML-T-2", updatedAt: 300 }),
  row({ venueName: "TEST Bašta", filterState: "problem", smlCode: "SML-T-3", updatedAt: 200 }),
  row({ venueName: "TEST Review", serviceType: "google_review", smlCode: "SML-T-4", updatedAt: 400 }),
];

const names = (list: PreviewServiceRow[]) => list.map((item) => item.venueName);

describe("filterPreviewServices", () => {
  test("only the rows of the service, in the given order for the default sort", () => {
    expect(names(filterPreviewServices(rows, "scanme_links", {}))).toEqual(["TEST Šank", "TEST Centar", "TEST Bašta"]);
    expect(names(filterPreviewServices(rows, "google_review", {}))).toEqual(["TEST Review"]);
    expect(filterPreviewServices(rows, "scanme_menu", {})).toEqual([]);
  });

  test("a view keeps the rows in that state", () => {
    expect(names(filterPreviewServices(rows, "scanme_links", read("?pogled=grace")))).toEqual(["TEST Centar"]);
    expect(names(filterPreviewServices(rows, "scanme_links", read("?pogled=suspended")))).toEqual([]);
  });

  test("a search matches the account, venue and codes, ignoring case", () => {
    expect(names(filterPreviewServices(rows, "scanme_links", read("?q=test%20ba%C5%A1ta")))).toEqual(["TEST Bašta"]);
    expect(names(filterPreviewServices(rows, "scanme_links", read("?q=sml-t-2")))).toEqual(["TEST Centar"]);
    expect(filterPreviewServices(rows, "scanme_links", read("?q=nema"))).toEqual([]);
  });

  test("the sort by name puts š after s and b before c; recent puts the newest first", () => {
    expect(names(filterPreviewServices(rows, "scanme_links", read("?sort=name")))).toEqual(["TEST Bašta", "TEST Centar", "TEST Šank"]);
    expect(names(filterPreviewServices(rows, "scanme_links", read("?sort=recent")))).toEqual(["TEST Centar", "TEST Bašta", "TEST Šank"]);
  });

  test("it does not change the rows it is given", () => {
    const before = names(rows);
    filterPreviewServices(rows, "scanme_links", read("?sort=name"));
    expect(names(rows)).toEqual(before);
  });
});
