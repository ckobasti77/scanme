import { describe, expect, test } from "vitest";
import { readUrlState, writeUrlState } from "@/lib/admin-v2/query/url-state";
import { ACTIVITY_CATEGORIES, SEARCH_GROUPS, SEARCH_URL_FIELDS } from "@/lib/admin-v2/sidebar/configs/search";
import {
  actorOptions,
  activityListArgs,
  filterPreviewActivity,
  filterPreviewResults,
  PREVIEW_SCOPE,
  scopePatch,
  searchListArgs,
  searchScope,
  searchSidebarLive,
  type PreviewSearchRow,
  type SearchGroup,
} from "./search";

// ADMIN v2 / Pretraga — the URL state of the sidebar as the arguments of
// `adminGlobalSearch.list` and `adminActivity.list` (the same ones the page
// sent before the controls moved to the sidebar), the scope round trip, the
// actor options and the preview filters. TEST data only.

const read = (search: string) => readUrlState(SEARCH_URL_FIELDS, search);

describe("searchListArgs", () => {
  test("no term means no query; the kind of record is „clients“ by default", () => {
    expect(searchListArgs({})).toBeNull();
    expect(searchListArgs(read(""))).toBeNull();
    expect(searchListArgs(read("?q=%20%20"))).toBeNull();
    expect(searchListArgs(read("?group=venues"))).toBeNull();
    expect(searchListArgs(read("?q=bistro"))).toEqual({ term: "bistro", group: "clients" });
  });

  test("the term is trimmed", () => {
    expect(searchListArgs(read("?q=%20SMK-00241%20"))).toEqual({ term: "SMK-00241", group: "clients" });
  });

  test("every kind of record sends its own group; „clients“ is the default and is never written", () => {
    for (const group of SEARCH_GROUPS) {
      expect(searchListArgs(read(`?q=x&group=${group}`))).toEqual({ term: "x", group });
    }
    expect(read("?group=clients")).toEqual({});
  });

  test("the scope sends the client and the venue", () => {
    expect(searchListArgs(read("?q=x&klijent=acc1"))).toEqual({ term: "x", group: "clients", accountId: "acc1" });
    expect(searchListArgs(read("?q=x&lokal=biz1"))).toEqual({ term: "x", group: "clients", businessId: "biz1" });
  });

  test("all of them together", () => {
    expect(searchListArgs(read("?q=stalak&group=products&klijent=acc1&opseg=Bistro%20Primer"))).toEqual({
      term: "stalak",
      group: "products",
      accountId: "acc1",
    });
  });

  test("an invalid value is ignored", () => {
    expect(read("?group=xyz&kategorija=abc&view=nope")).toEqual({});
    expect(searchListArgs(read("?q=x&group=xyz"))).toEqual({ term: "x", group: "clients" });
    // Even a state that was not read through the schema falls back.
    expect(searchListArgs({ q: "x", group: "xyz" })).toEqual({ term: "x", group: "clients" });
  });
});

describe("activityListArgs", () => {
  test("an empty state is the whole feed", () => {
    expect(activityListArgs({})).toEqual({});
    expect(activityListArgs(read(""))).toEqual({});
    expect(activityListArgs(read("?view=activity"))).toEqual({});
  });

  test("every category sends its own argument", () => {
    for (const category of ACTIVITY_CATEGORIES) {
      expect(activityListArgs(read(`?view=activity&kategorija=${category}`))).toEqual({ category });
    }
  });

  test("the actor and the scope send their own arguments", () => {
    expect(activityListArgs(read("?akter=user:u1"))).toEqual({ actorKey: "user:u1" });
    expect(activityListArgs(read("?akter=kind:shared_mailbox"))).toEqual({ actorKey: "kind:shared_mailbox" });
    expect(activityListArgs(read("?klijent=acc1"))).toEqual({ accountId: "acc1" });
    expect(activityListArgs(read("?lokal=biz1"))).toEqual({ businessId: "biz1" });
  });

  test("all of them together; the term of Rezultati plays no part", () => {
    expect(activityListArgs(read("?view=activity&q=x&kategorija=task&akter=user:u1&klijent=acc1&lokal=biz1"))).toEqual({
      accountId: "acc1",
      businessId: "biz1",
      category: "task",
      actorKey: "user:u1",
    });
  });

  test("an invalid value is ignored", () => {
    expect(activityListArgs(read("?kategorija=abc"))).toEqual({});
    expect(activityListArgs({ kategorija: "abc" })).toEqual({});
  });
});

describe("the scope", () => {
  test("no scope in the state", () => {
    expect(searchScope({})).toBeNull();
    expect(searchScope(read("?opseg=Samo%20naziv"))).toBeNull();
  });

  test("a client, a venue, and the name that stands for them", () => {
    expect(searchScope(read("?klijent=acc1&opseg=Bistro%20Primer"))).toEqual({ accountId: "acc1", label: "Bistro Primer" });
    expect(searchScope(read("?lokal=biz1&opseg=Bistro%20Primer%20%C2%B7%20Centar"))).toEqual({ businessId: "biz1", label: "Bistro Primer · Centar" });
    // A link without a name: the id stands in, so the chip can still be removed.
    expect(searchScope(read("?klijent=acc1"))).toEqual({ accountId: "acc1", label: "acc1" });
  });

  test("choosing a client clears the venue, choosing a venue clears the client, null clears all three", () => {
    expect(scopePatch({ accountId: "acc1", label: "Bistro Primer" })).toEqual({ klijent: "acc1", lokal: null, opseg: "Bistro Primer" });
    expect(scopePatch({ businessId: "biz1", label: "Centar" })).toEqual({ klijent: null, lokal: "biz1", opseg: "Centar" });
    expect(scopePatch(null)).toEqual({ klijent: null, lokal: null, opseg: null });
  });

  test("a choice written to the URL reads back as the same scope", () => {
    const account = { accountId: "acc1", label: "Bistro Primer · SMK-00241" };
    const venue = { businessId: "biz1", label: "Bistro Primer · Centar · SML-00618" };
    const afterAccount = writeUrlState(SEARCH_URL_FIELDS, "?q=stalak&task=t1", scopePatch(account));
    expect(searchScope(read(afterAccount))).toEqual(account);
    // The other parameters stay.
    expect(new URLSearchParams(afterAccount).get("q")).toBe("stalak");
    expect(new URLSearchParams(afterAccount).get("task")).toBe("t1");
    // A venue replaces the client.
    const afterVenue = writeUrlState(SEARCH_URL_FIELDS, afterAccount, scopePatch(venue));
    expect(searchScope(read(afterVenue))).toEqual(venue);
    expect(new URLSearchParams(afterVenue).get("klijent")).toBeNull();
    // null removes it.
    const cleared = writeUrlState(SEARCH_URL_FIELDS, afterVenue, scopePatch(null));
    expect(searchScope(read(cleared))).toBeNull();
    expect(cleared).toBe("?q=stalak&task=t1");
  });
});

describe("actorOptions", () => {
  test("the key is the argument, the label is „name · kind“", () => {
    const kind = (value: string) => (value === "admin" ? "Admin" : "Nepoznat akter");
    expect(
      actorOptions([
        { actorKey: "user:u1", actorKind: "admin", displayName: "Ana Admin" },
        { actorKey: "kind:other", actorKind: "other", displayName: "Sistem" },
      ], kind),
    ).toEqual([
      { value: "user:u1", label: "Ana Admin · Admin" },
      { value: "kind:other", label: "Sistem · Nepoznat akter" },
    ]);
    expect(actorOptions([], kind)).toEqual([]);
  });

  test("the actor keys the backend builds are valid URL values", () => {
    expect(read("?akter=user:jx7c9d2e")).toEqual({ akter: "user:jx7c9d2e" });
    expect(read("?akter=kind:shared_mailbox")).toEqual({ akter: "kind:shared_mailbox" });
  });
});

describe("searchSidebarLive", () => {
  test("the body and the summary of „Opseg“; the actors only when given", () => {
    const body = "body";
    expect(searchSidebarLive({ scope: null, scopeBody: body })).toEqual({ custom: { opseg: { summary: undefined, body } } });
    const live = searchSidebarLive({
      scope: { accountId: "acc1", label: "Bistro Primer" },
      scopeBody: body,
      actors: [{ value: "user:u1", label: "Ana Admin · Admin" }],
    });
    expect(live.custom?.opseg).toEqual({ summary: "Bistro Primer", body });
    expect(live.options).toEqual({ akter: [{ value: "user:u1", label: "Ana Admin · Admin" }] });
  });
});

const row = (over: Partial<PreviewSearchRow>): PreviewSearchRow => ({
  title: "Test lokal",
  code: null,
  ownerLabel: null,
  smkCode: null,
  venueLabel: null,
  smlCode: null,
  meta: null,
  ...over,
});

const FIXTURES: Record<SearchGroup, PreviewSearchRow[]> = {
  clients: [row({ title: "Bistro Primer", code: "SMK-00241", smkCode: "SMK-00241" }), row({ title: "Drugi Primer", code: "SMK-00983", smkCode: "SMK-00983" })],
  venues: [row({ title: "Bistro Primer · Centar", code: "SML-00618", smkCode: "SMK-00241", smlCode: "SML-00618" })],
  contacts: [],
  products: [
    row({ title: "Premium stalak", code: "SMF-00241-031", smkCode: "SMK-00241" }),
    row({ title: "Premium stalak", code: "SMF-00983-031", smkCode: "SMK-00983" }),
  ],
  channels: [],
  orders: [],
};

describe("filterPreviewResults", () => {
  const titles = (search: string) => filterPreviewResults(FIXTURES, read(search)).map((item) => `${item.title}|${item.code}`);

  test("no term, no rows", () => {
    expect(titles("")).toEqual([]);
    expect(titles("?group=venues")).toEqual([]);
  });

  test("the term is matched over every field, in the chosen kind of record", () => {
    expect(titles("?q=primer")).toEqual(["Bistro Primer|SMK-00241", "Drugi Primer|SMK-00983"]);
    expect(titles("?q=SMK-00983")).toEqual(["Drugi Primer|SMK-00983"]);
    expect(titles("?q=primer&group=venues")).toEqual(["Bistro Primer · Centar|SML-00618"]);
    expect(titles("?q=nema")).toEqual([]);
  });

  test("the scope keeps the fixture client only; any other scope finds nothing", () => {
    expect(titles(`?q=primer&klijent=${PREVIEW_SCOPE.accountId}`)).toEqual(["Bistro Primer|SMK-00241"]);
    expect(titles("?q=primer&klijent=other")).toEqual([]);
    expect(titles("?q=primer&lokal=biz1")).toEqual([]);
  });

  test("a bare number is a local SMF suffix and needs a scope", () => {
    expect(titles("?q=031&group=products")).toEqual([]);
    expect(titles(`?q=031&group=products&klijent=${PREVIEW_SCOPE.accountId}`)).toEqual(["Premium stalak|SMF-00241-031"]);
    // Not a bare number: no scope needed.
    expect(titles("?q=SMF-00983&group=products")).toEqual(["Premium stalak|SMF-00983-031"]);
  });
});

describe("filterPreviewActivity", () => {
  const rows = [
    { id: "a", category: "client", actorKey: "user:preview-admin", accountId: PREVIEW_SCOPE.accountId },
    { id: "b", category: "communication", actorKey: "kind:shared_mailbox", accountId: PREVIEW_SCOPE.accountId },
    { id: "c", category: "client", actorKey: "kind:shared_mailbox", accountId: "other" },
  ];
  const ids = (search: string) => filterPreviewActivity(rows, read(search)).map((item) => item.id);

  test("an empty state shows everything", () => {
    expect(ids("")).toEqual(["a", "b", "c"]);
  });

  test("the category, the actor and the scope", () => {
    expect(ids("?kategorija=client")).toEqual(["a", "c"]);
    expect(ids("?akter=kind:shared_mailbox")).toEqual(["b", "c"]);
    expect(ids(`?klijent=${PREVIEW_SCOPE.accountId}`)).toEqual(["a", "b"]);
    expect(ids(`?kategorija=client&akter=kind:shared_mailbox&klijent=other`)).toEqual(["c"]);
    expect(ids("?lokal=biz1")).toEqual([]);
  });

  test("an invalid category is ignored", () => {
    expect(ids("?kategorija=abc")).toEqual(["a", "b", "c"]);
  });
});
