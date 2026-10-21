import { describe, expect, test } from "vitest";
import { readUrlState } from "@/lib/admin-v2/query/url-state";
import { TASK_SUBJECTS, TASK_VIEWS, TASKS_URL_FIELDS } from "@/lib/admin-v2/sidebar/configs/tasks";
import {
  TASK_MISSION_LIMIT,
  filterPreviewTasks,
  previewTaskMissions,
  previewTaskViewCounts,
  taskStatusTone,
  tasksAreFiltered,
  tasksIntercept,
  tasksListArgs,
  tasksSidebarLive,
  tasksSidebarOptions,
  tasksAreNarrowed,
  tasksViewCounts,
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
    expect(tasksListArgs(read("?assignee=test-admin-7"))).toEqual({ tab: "all", assigneeId: "test-admin-7" });
    expect(tasksListArgs(read("?klijent=test-account-7"))).toEqual({ tab: "all", accountId: "test-account-7" });
    expect(tasksListArgs(read("?lokal=test-venue-7"))).toEqual({ tab: "all", businessId: "test-venue-7" });
    for (const subject of TASK_SUBJECTS) {
      expect(tasksListArgs(read(`?objekat=${subject}`))).toEqual({ tab: "all", subjectKind: subject });
    }
  });

  test("all of them together", () => {
    expect(tasksListArgs(read("?pogled=overdue&q=ponuda&assignee=test-admin-7&klijent=test-account-7&lokal=test-venue-7&objekat=venue"))).toEqual({
      tab: "overdue",
      search: "ponuda",
      assigneeId: "test-admin-7",
      accountId: "test-account-7",
      businessId: "test-venue-7",
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
    for (const search of ["?pogled=today", "?q=a", "?assignee=test-admin-1", "?klijent=test-account-1", "?lokal=test-venue-1", "?objekat=order"]) {
      expect(tasksAreFiltered(read(search)), search).toBe(true);
    }
    expect(tasksAreFiltered({ q: "   " })).toBe(false);
    expect(tasksAreFiltered({ pogled: "xyz", objekat: "none" })).toBe(false);
  });
});

describe("sidebar options and the dependent venue", () => {
  const input = {
    admins: [{ id: "test-admin-1", name: "TEST Admin 1" }],
    accounts: [{ id: "test-account-1", name: "TEST Klijent 1", smkCode: "SMK-TEST-001" }],
    venues: [{ id: "test-venue-1", name: "TEST Lokal 1", smlCode: "SML-TEST-001" }],
  };

  test("assignee by name; client and venue by name with the code as the hint", () => {
    expect(tasksSidebarOptions(input)).toEqual({
      assignee: [{ value: "test-admin-1", label: "TEST Admin 1" }],
      klijent: [{ value: "test-account-1", label: "TEST Klijent 1", hint: "SMK-TEST-001" }],
      lokal: [{ value: "test-venue-1", label: "TEST Lokal 1", hint: "SML-TEST-001" }],
    });
    expect(tasksSidebarOptions({ admins: [], accounts: [], venues: [] }).lokal).toEqual([]);
  });

  test("changing or clearing the client clears the venue; other changes pass untouched", () => {
    expect(tasksIntercept({ klijent: "test-account-2" }, { klijent: "test-account-1", lokal: "test-venue-1" })).toEqual({ klijent: "test-account-2", lokal: null });
    expect(tasksIntercept({ klijent: "test-account-1" }, {})).toEqual({ klijent: "test-account-1", lokal: null });
    expect(tasksIntercept({ klijent: null }, { klijent: "test-account-1", lokal: "test-venue-1" })).toEqual({ klijent: null, lokal: null });
    const other = { assignee: "test-admin-1" };
    expect(tasksIntercept(other, { klijent: "test-account-1" })).toBe(other);
    expect(tasksIntercept({ lokal: "test-venue-2" }, { klijent: "test-account-1", lokal: "test-venue-1" })).toEqual({ lokal: "test-venue-2" });
    // The same client again is not a change.
    expect(tasksIntercept({ klijent: "test-account-1" }, { klijent: "test-account-1", lokal: "test-venue-1" })).toEqual({ klijent: "test-account-1" });
  });

  test("the live object carries the options and the intercept", () => {
    const live = tasksSidebarLive(input);
    expect(live.options?.klijent).toHaveLength(1);
    expect(live.intercept?.({ klijent: "test-account-9" }, {})).toEqual({ klijent: "test-account-9", lokal: null });
  });
});

function row(id: string, extra: Partial<PreviewTaskRow> = {}): PreviewTaskRow & { id: string } {
  return {
    id,
    status: "open",
    timePhase: "future",
    assigneeId: "test-admin-1",
    accountId: "test-account-1",
    accountName: "TEST Klijent 1",
    smkCode: "SMK-TEST-001",
    businessId: "test-venue-1",
    businessName: "TEST Lokal 1",
    smlCode: "SML-TEST-001",
    subjectKind: "venue",
    title: `TEST zadatak ${id}`,
    ...extra,
  };
}

const rows = [
  row("t1", { timePhase: "today" }),
  row("t2", { timePhase: "overdue", assigneeId: "test-admin-2", accountId: "test-account-2", accountName: "TEST Klijent 2", smkCode: "SMK-TEST-002", businessId: "test-venue-2", businessName: "TEST Lokal 2", smlCode: "SML-TEST-002", subjectKind: "order" }),
  row("t3", { status: "deferred" }),
  row("t4", { status: "completed", timePhase: "none" }),
  row("t5", { status: "cancelled", timePhase: "none", businessId: "test-venue-3", businessName: "TEST Lokal 3", smlCode: "SML-TEST-003" }),
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
    expect(ids("?assignee=test-admin-2")).toEqual(["t2"]);
    expect(ids("?klijent=test-account-2")).toEqual(["t2"]);
    expect(ids("?klijent=test-account-1&lokal=test-venue-1")).toEqual(["t1"]);
    expect(ids("?pogled=completed&lokal=test-venue-3")).toEqual(["t5"]);
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
    expect(tasksVenuesFromRows(rows, "test-account-2")).toEqual([{ id: "test-venue-2", name: "TEST Lokal 2", smlCode: "SML-TEST-002" }]);
    expect(tasksVenuesFromRows(rows, "test-account-1").map((venue) => venue.id)).toEqual(["test-venue-1", "test-venue-3"]);
  });
});

// ADMIN v2 X4 — „Misije danas“ of Zadaci: the overdue and today tasks that are still open.
describe("previewTaskMissions", () => {
  const row = (status: PreviewTaskRow["status"], timePhase: PreviewTaskRow["timePhase"]) => ({ status, timePhase });

  test("counts only open and in-progress tasks, overdue as hitno and today as uskoro, with the links to those views", () => {
    const missions = previewTaskMissions([
      row("open", "overdue"),
      row("in_progress", "today"),
      row("open", "today"),
      row("open", "future"),
      row("open", "none"),
      row("completed", "today"),
      row("cancelled", "overdue"),
      row("deferred", "overdue"),
    ]);
    expect(missions.map((mission) => [mission.id, mission.count, mission.tone, mission.href])).toEqual([
      ["tasks-overdue", 1, "hitno", "/admin/zadaci?pogled=overdue"],
      ["tasks-today", 2, "uskoro", "/admin/zadaci?pogled=today"],
    ]);
  });

  test("a finished task leaves its mission: the count falls, which the sidebar shows as progress", () => {
    const before = previewTaskMissions([row("open", "today"), row("open", "today")]);
    const after = previewTaskMissions([row("completed", "today"), row("open", "today")]);
    expect(before.find((mission) => mission.id === "tasks-today")?.count).toBe(2);
    expect(after.find((mission) => mission.id === "tasks-today")?.count).toBe(1);
  });

  test("no rows give zeros; the read of the admin page stays inside the limit of the query", () => {
    expect(previewTaskMissions([]).map((mission) => mission.count)).toEqual([0, 0]);
    expect(TASK_MISSION_LIMIT).toBeLessThanOrEqual(12);
  });
});

// ADMIN v2 X6 (N2) — one tone for a task status on Zadaci and Tim.
describe("taskStatusTone", () => {
  const table: [PreviewTaskRow["status"], PreviewTaskRow["timePhase"], string][] = [
    ["open", "overdue", "problem"],
    ["in_progress", "overdue", "problem"],
    ["deferred", "overdue", "problem"],
    ["in_progress", "future", "waiting"],
    ["in_progress", "none", "waiting"],
    ["open", "today", "waiting"],
    ["deferred", "today", "waiting"],
    ["open", "future", "active"],
    ["open", "none", "active"],
    ["deferred", "future", "neutral"],
    ["deferred", "none", "neutral"],
    ["completed", "overdue", "neutral"],
    ["completed", "today", "neutral"],
    ["cancelled", "overdue", "neutral"],
    ["cancelled", "none", "neutral"],
  ];

  test.each(table)("%s + %s gives %s", (status, phase, tone) => {
    expect(taskStatusTone(status, phase)).toBe(tone);
  });
});

// ADMIN v2 X6 (N15) — the numbers next to „Kasni“ and „Danas“.
describe("tasksViewCounts", () => {
  const items = (count: number) => Array.from({ length: count }, (_, index) => ({ id: index }));

  test("the exact number is the length of the group", () => {
    expect(tasksViewCounts({ overdue: { items: items(3) }, today: { items: items(7), capped: false } })).toEqual({ overdue: 3, today: 7 });
  });

  test("a capped group says „at least“: the number with a plus, as text", () => {
    expect(tasksViewCounts({ overdue: { items: items(TASK_MISSION_LIMIT), capped: true }, today: { items: items(2) } })).toEqual({
      overdue: `${TASK_MISSION_LIMIT}+`,
      today: 2,
    });
  });

  test("empty groups are zeros, not missing", () => {
    expect(tasksViewCounts({ overdue: { items: [] }, today: { items: [] } })).toEqual({ overdue: 0, today: 0 });
  });
});

describe("previewTaskViewCounts", () => {
  const row = (status: PreviewTaskRow["status"], timePhase: PreviewTaskRow["timePhase"]) => ({ status, timePhase });

  test("counts only open and in-progress tasks, like the missions", () => {
    expect(previewTaskViewCounts([row("open", "overdue"), row("in_progress", "today"), row("open", "today"), row("completed", "today"), row("deferred", "overdue"), row("open", "future")])).toEqual({ overdue: 1, today: 2 });
  });

  test("more rows than the limit of the query give \"12+\"", () => {
    const many = Array.from({ length: TASK_MISSION_LIMIT + 1 }, () => row("open", "overdue"));
    expect(previewTaskViewCounts(many)).toEqual({ overdue: `${TASK_MISSION_LIMIT}+`, today: 0 });
    expect(previewTaskViewCounts(many.slice(0, TASK_MISSION_LIMIT))).toEqual({ overdue: TASK_MISSION_LIMIT, today: 0 });
    expect(previewTaskViewCounts([])).toEqual({ overdue: 0, today: 0 });
  });
});

// X6 (RX N15) — the numbers count every open task, so they stand beside the views only while nothing narrows the list.
describe("the view numbers and the filters", () => {
  const groups = { overdue: { items: [1, 2] }, today: { items: [1] } };

  test("with a search or a filter group chosen there are no numbers; a view alone keeps them", () => {
    expect(tasksViewCounts(groups)).toEqual({ overdue: 2, today: 1 });
    expect(tasksViewCounts(groups, { pogled: "overdue" })).toEqual({ overdue: 2, today: 1 });
    const narrowed: Record<string, string>[] = [{ q: "ponuda" }, { assignee: "test-admin-1" }, { klijent: "test-account-1" }, { lokal: "test-venue-1" }, { objekat: "order" }];
    for (const state of narrowed) {
      expect(tasksViewCounts(groups, state), JSON.stringify(state)).toBeUndefined();
    }
    expect(previewTaskViewCounts([{ status: "open", timePhase: "overdue" }], { assignee: "test-admin-1" })).toBeUndefined();
    expect(tasksAreNarrowed({ pogled: "today" })).toBe(false);
    expect(tasksAreNarrowed({ q: "  " })).toBe(false);
  });
});
