import { describe, expect, test } from "vitest";
import { readUrlState } from "@/lib/admin-v2/query/url-state";
import { ORDER_DESIGNS, ORDER_FULFILLMENTS, ORDER_PAYMENTS, ORDER_VIEWS, ORDERS_URL_FIELDS } from "@/lib/admin-v2/sidebar/configs/operations";
import { filterPreviewOrders, ordersAreFiltered, ordersAssigneeOptions, ordersListArgs, ordersSidebarLive, ordersSortIgnored, type PreviewOrderRow } from "./orders";

const args = (query: string) => ordersListArgs(readUrlState(ORDERS_URL_FIELDS, query));

describe("ordersListArgs: the same arguments of adminOrders.list as before the sidebar", () => {
  test("an empty state is the initial state of the old page", () => {
    expect(ordersListArgs({})).toEqual({ view: "active", sort: "updated_desc" });
    expect(args("")).toEqual({ view: "active", sort: "updated_desc" });
  });

  test("every view", () => {
    for (const view of ORDER_VIEWS) expect(args(`?pogled=${view}`)).toEqual({ view, sort: "updated_desc" });
  });

  test("every filter maps to its argument", () => {
    for (const value of ORDER_PAYMENTS) expect(args(`?uplata=${value}`)).toEqual({ view: "active", sort: "updated_desc", paymentState: value });
    for (const value of ORDER_DESIGNS) expect(args(`?dizajn=${value}`)).toEqual({ view: "active", sort: "updated_desc", designState: value });
    for (const value of ORDER_FULFILLMENTS) expect(args(`?izvrsenje=${value}`)).toEqual({ view: "active", sort: "updated_desc", fulfillmentState: value });
    expect(args("?assignee=TESTadmin1")).toEqual({ view: "active", sort: "updated_desc", assigneeId: "TESTadmin1" });
    expect(args("?problem=da")).toEqual({ view: "active", sort: "updated_desc", problemsOnly: true });
    expect(args("?sort=updated_asc")).toEqual({ view: "active", sort: "updated_asc" });
  });

  test("all choices together", () => {
    expect(args("?pogled=completed&uplata=paid&dizajn=approved&izvrsenje=delivered&assignee=TESTadmin1&problem=da&sort=updated_asc")).toEqual({
      view: "completed",
      paymentState: "paid",
      designState: "approved",
      fulfillmentState: "delivered",
      assigneeId: "TESTadmin1",
      sort: "updated_asc",
      problemsOnly: true,
    });
  });

  test("a search sends the text and no sort (the order is by relevance)", () => {
    expect(args("?q=TEST%20bistro")).toEqual({ view: "active", search: "TEST bistro" });
    expect(args("?q=TEST&sort=updated_asc&uplata=paid")).toEqual({ view: "active", search: "TEST", paymentState: "paid" });
    expect(ordersListArgs({ q: "   " })).toEqual({ view: "active", sort: "updated_desc" });
  });

  test("an invalid value is ignored", () => {
    expect(args("?pogled=x&uplata=y&dizajn=z&izvrsenje=w&sort=up&problem=ne")).toEqual({ view: "active", sort: "updated_desc" });
    expect(ordersListArgs({ pogled: "x", uplata: "y", problem: "ne" })).toEqual({ view: "active", sort: "updated_desc" });
  });
});

describe("ordersAreFiltered and ordersSortIgnored", () => {
  test("only a filter counts; the view and the sort do not", () => {
    expect(ordersAreFiltered({})).toBe(false);
    expect(ordersAreFiltered({ pogled: "archived", sort: "updated_asc" })).toBe(false);
    expect(ordersAreFiltered({ q: "  " })).toBe(false);
    const states: Record<string, string>[] = [{ q: "TEST" }, { assignee: "TESTadmin1" }, { uplata: "paid" }, { dizajn: "approved" }, { izvrsenje: "delivered" }, { problem: "da" }];
    for (const state of states) {
      expect(ordersAreFiltered(state)).toBe(true);
    }
  });

  test("the sort is noted as ignored only while a search runs and a non-default sort is chosen", () => {
    expect(ordersSortIgnored({ q: "TEST", sort: "updated_asc" })).toBe(true);
    expect(ordersSortIgnored({ q: "TEST" })).toBe(false);
    expect(ordersSortIgnored({ sort: "updated_asc" })).toBe(false);
    expect(ordersSortIgnored({ q: " ", sort: "updated_asc" })).toBe(false);
  });
});

describe("sidebar options", () => {
  const admins = [{ id: "TESTadmin1", name: "TEST Admin Jedan" }, { id: "TESTadmin2", name: "TEST Admin Dva" }];

  test("the assignees become the options of the assignee group", () => {
    expect(ordersAssigneeOptions(admins)).toEqual([{ value: "TESTadmin1", label: "TEST Admin Jedan" }, { value: "TESTadmin2", label: "TEST Admin Dva" }]);
    expect(ordersAssigneeOptions([])).toEqual([]);
    expect(ordersSidebarLive(admins)).toEqual({ options: { assignee: ordersAssigneeOptions(admins) } });
  });
});

describe("filterPreviewOrders", () => {
  const row = (id: string, extra: Partial<PreviewOrderRow> = {}): PreviewOrderRow & { id: string } => ({
    id,
    view: "active",
    assigneeId: "TESTadmin1",
    paymentState: "paid",
    designState: "approved",
    fulfillmentState: "ready_for_printer",
    problemCount: 0,
    updatedAt: Date.parse("2026-09-13T08:00:00Z"),
    smpCode: `SMP-TEST-${id}`,
    accountName: `TEST Klijent ${id}`,
    smkCode: `SMK-${id}`,
    primaryBusinessName: `TEST Lokal ${id}`,
    primarySmlCode: `SML-${id}`,
    ...extra,
  });
  const rows = [
    row("a", { updatedAt: 1_000 }),
    row("b", { updatedAt: 3_000, paymentState: "awaiting_payment", designState: "in_progress", fulfillmentState: "awaiting_conditions", assigneeId: "TESTadmin2" }),
    row("c", { updatedAt: 2_000, problemCount: 1, fulfillmentState: "quality_control" }),
    row("d", { updatedAt: 4_000, view: "completed", fulfillmentState: "delivered" }),
    row("e", { updatedAt: 5_000, view: "archived" }),
  ];
  const ids = (state: Record<string, string>) => filterPreviewOrders(rows, state).map((item) => item.id);

  test("the default view is the active orders, newest first", () => {
    expect(ids({})).toEqual(["b", "c", "a"]);
    expect(ids({ sort: "updated_asc" })).toEqual(["a", "c", "b"]);
  });

  test("the views", () => {
    expect(ids({ pogled: "completed" })).toEqual(["d"]);
    expect(ids({ pogled: "archived" })).toEqual(["e"]);
  });

  test("the filters", () => {
    expect(ids({ assignee: "TESTadmin2" })).toEqual(["b"]);
    expect(ids({ uplata: "awaiting_payment" })).toEqual(["b"]);
    expect(ids({ dizajn: "in_progress" })).toEqual(["b"]);
    expect(ids({ izvrsenje: "quality_control" })).toEqual(["c"]);
    expect(ids({ problem: "da" })).toEqual(["c"]);
    expect(ids({ uplata: "paid", problem: "da" })).toEqual(["c"]);
    expect(ids({ uplata: "reversed" })).toEqual([]);
  });

  test("a search matches the codes and names, case-insensitive; no sort is applied to it", () => {
    expect(ids({ q: "test klijent c" })).toEqual(["c"]);
    expect(ids({ q: "sml-a" })).toEqual(["a"]);
    // Search keeps the order of the rows (relevance), the chosen sort does not apply.
    expect(ids({ q: "TEST", sort: "updated_asc" })).toEqual(["a", "b", "c"]);
    expect(ids({ q: "nepostojece" })).toEqual([]);
  });
});
