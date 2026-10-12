import { describe, expect, test } from "vitest";
import { readUrlState } from "@/lib/admin-v2/query/url-state";
import { TASK_SUBJECTS, TASK_VIEWS, TASKS_URL_FIELDS } from "@/lib/admin-v2/sidebar/configs/tasks";
import {
  filterPreviewTasks,
  tasksAreFiltered,
  tasksIntercept,
  tasksListArgs,
  tasksSidebarLive,
  tasksSidebarOptions,
  tasksVenuesFromRows,
  type PreviewTaskRow,
} from "./tasks";

// ADMIN v2 / Zadaci — the URL state of the sidebar as the arguments of
// `adminTasks.list` (the same ones the page sent before the filters moved to
// the sidebar), the dependent venue and the preview filters. TEST data only.

const read = (search: string) => readUrlState(TASKS_URL_FIELDS, search);

describe("tasksListArgs", () => {
  test("an empty state is the first view without filters", () => {
    expect(tasksListArgs({})).toEqual({ tab: "all" });
    expect(tasksListArgs(read(""))).toEqual({ tab: "all" });
  });

  test("every view sends its own tab; „all“ is the default and is never written", () => {
    for (const view of TASK_VIEWS) {
      expect(tasksListArgs(read(`?pogled=${view}`))).toEqual({ tab: view });
    }
    expect(read("?pogled=all")).toEqual({});
  });

  test("every filter sends its own argument", () => {
    expect(tasksListArgs(read("?q=%20grace%20"))).toEqual({ tab: "all", search: "grace" });
    expect(tasksListArgs(read("?assignee=user1"))).toEqual({ tab: "all", assigneeId: "user1" });
    expect(tasksListArgs(read("?klijent=acc1"))).toEqual({ tab: "all", accountId: "acc1" });
    expect(tasksListArgs(read("?lokal=biz1"))).toEqual({ tab: "all", businessId: "biz1" });
    for (const subject of TASK_SUBJECTS) {
      expect(tasksListArgs(read(`?objekat=${subject}`))).toEqual({ tab: "all", subjectKind: subject });
    }
  });

  test("all of them together", () => {
    expect(tasksListArgs(read("?pogled=overdue&q=ponuda&assignee=user1&klijent=acc1&lokal=biz1&objekat=venue"))).toEqual({
      tab: "overdue",
      search: "ponuda",
      assigneeId: "user1",
      accountId: "acc1",
      businessId: "biz1",
      subjectKind: "venue",
    });
  });

  test("an invalid value reads as absent; parameters of the page are kept out of the filters", () => {
    expect(tasksListArgs(read("?pogled=xyz&objekat=none"))).toEqual({ tab: "all" });
    expect(tasksListArgs(read("?objekat=nepoznato&assignee=bad%20id&task=t1"))).toEqual({ tab: "all" });
    // Even a raw state with a wrong value does not reach the query.
    expect(tasksListArgs({ pogled: "xyz", objekat: "none" })).toEqual({ tab: "all" });
  });
});

describe("tasksAreFiltered", () => {
  test("nothing chosen is not filtered; any choice, a view other than „Svi“ included, is", () => {
    expect(tasksAreFiltered({})).toBe(false);
    expect(tasksAreFiltered(read("?task=t1"))).toBe(false);
    for (const search of ["?pogled=today", "?q=a", "?assignee=u1", "?klijent=a1", "?lokal=b1", "?objekat=order"]) {
      expect(tasksAreFiltered(read(search)), search).toBe(true);
    }
    expect(tasksAreFiltered({ q: "   " })).toBe(false);
    expect(tasksAreFiltered({ pogled: "xyz", objekat: "none" })).toBe(false);
  });
});

describe("sidebar options and the dependent venue", () => {
  const input = {
    admins: [{ id: "u1", name: "TEST Admin 1" }],
    accounts: [{ id: "a1", name: "TEST Klijent 1", smkCode: "SMK-TEST-001" }],
    venues: [{ id: "b1", name: "TEST Lokal 1", smlCode: "SML-TEST-001" }],
  };

  test("assignee by name; client and venue by name with the code as the hint", () => {
    expect(tasksSidebarOptions(input)).toEqual({
      assignee: [{ value: "u1", label: "TEST Admin 1" }],
      klijent: [{ value: "a1", label: "TEST Klijent 1", hint: "SMK-TEST-001" }],
      lokal: [{ value: "b1", label: "TEST Lokal 1", hint: "SML-TEST-001" }],
    });
    expect(tasksSidebarOptions({ admins: [], accounts: [], venues: [] }).lokal).toEqual([]);
  });

  test("changing or clearing the client clears the venue; other changes pass untouched", () => {
    expect(tasksIntercept({ klijent: "a2" }, { klijent: "a1", lokal: "b1" })).toEqual({ klijent: "a2", lokal: null });
    expect(tasksIntercept({ klijent: "a1" }, {})).toEqual({ klijent: "a1", lokal: null });
    expect(tasksIntercept({ klijent: null }, { klijent: "a1", lokal: "b1" })).toEqual({ klijent: null, lokal: null });
    const other = { assignee: "u1" };
    expect(tasksIntercept(other, { klijent: "a1" })).toBe(other);
    expect(tasksIntercept({ lokal: "b2" }, { klijent: "a1", lokal: "b1" })).toEqual({ lokal: "b2" });
    // The same client again is not a change.
    expect(tasksIntercept({ klijent: "a1" }, { klijent: "a1", lokal: "b1" })).toEqual({ klijent: "a1" });
  });

  test("the live object carries the options and the intercept", () => {
    const live = tasksSidebarLive(input);
    expect(live.options?.klijent).toHaveLength(1);
    expect(live.intercept?.({ klijent: "a9" }, {})).toEqual({ klijent: "a9", lokal: null });
  });
});

function row(id: string, extra: Partial<PreviewTaskRow> = {}): PreviewTaskRow & { id: string } {
  return {
    id,
    status: "open",
    timePhase: "future",
    assigneeId: "u1",
    accountId: "a1",
    accountName: "TEST Klijent 1",
    smkCode: "SMK-TEST-001",
    businessId: "b1",
    businessName: "TEST Lokal 1",
    smlCode: "SML-TEST-001",
    subjectKind: "venue",
    title: `TEST zadatak ${id}`,
    ...extra,
  };
}

const rows = [
  row("t1", { timePhase: "today" }),
  row("t2", { timePhase: "overdue", assigneeId: "u2", accountId: "a2", accountName: "TEST Klijent 2", smkCode: "SMK-TEST-002", businessId: "b2", businessName: "TEST Lokal 2", smlCode: "SML-TEST-002", subjectKind: "order" }),
  row("t3", { status: "deferred" }),
  row("t4", { status: "completed", timePhase: "none" }),
  row("t5", { status: "cancelled", timePhase: "none", businessId: "b3", businessName: "TEST Lokal 3", smlCode: "SML-TEST-003" }),
  row("t6", { status: "in_progress", businessId: null, businessName: null, smlCode: null, title: "TEST Ponuda za dopunu" }),
];

const ids = (state: string) => filterPreviewTasks(rows, read(state)).map((task) => task.id);

describe("filterPreviewTasks", () => {
  test("the first view hides deferred, completed and cancelled tasks", () => {
    expect(ids("")).toEqual(["t1", "t2", "t6"]);
  });

  test("each view", () => {
    expect(ids("?pogled=today")).toEqual(["t1"]);
    expect(ids("?pogled=overdue")).toEqual(["t2"]);
    expect(ids("?pogled=deferred")).toEqual(["t3"]);
    expect(ids("?pogled=completed")).toEqual(["t4", "t5"]);
  });

  test("assignee, client, venue and linked object", () => {
    expect(ids("?assignee=u2")).toEqual(["t2"]);
    expect(ids("?klijent=a2")).toEqual(["t2"]);
    expect(ids("?klijent=a1&lokal=b1")).toEqual(["t1"]);
    expect(ids("?pogled=completed&lokal=b3")).toEqual(["t5"]);
    expect(ids("?objekat=order")).toEqual(["t2"]);
  });

  test("search reads client, codes, venue and title", () => {
    expect(ids("?q=ponuda")).toEqual(["t6"]);
    expect(ids("?q=SML-TEST-002")).toEqual(["t2"]);
    expect(ids("?q=smk-test-001")).toEqual(["t1", "t6"]);
    expect(ids("?q=nepostojeci")).toEqual([]);
  });

  test("an invalid value does not filter", () => {
    expect(ids("?pogled=xyz&objekat=none")).toEqual(["t1", "t2", "t6"]);
  });

  test("the venues of the chosen client come from the rows, once each", () => {
    expect(tasksVenuesFromRows(rows, undefined)).toEqual([]);
    expect(tasksVenuesFromRows(rows, "a2")).toEqual([{ id: "b2", name: "TEST Lokal 2", smlCode: "SML-TEST-002" }]);
    expect(tasksVenuesFromRows(rows, "a1").map((venue) => venue.id)).toEqual(["b1", "b3"]);
  });
});
