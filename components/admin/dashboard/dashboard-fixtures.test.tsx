import { describe, expect, test } from "vitest";
import { DASHBOARD_FIXTURE_STEPS, dashboardFixture } from "@/components/admin/admin-dashboard-fixtures";

// The fixtures of the Dashboard preview: the 12 named items of „Sve“ (the
// Constellation shows them), the steps of the dev preview and the old states.

type Item = {
  action: Record<string, unknown> & { actionItemId: string; causeId: string; priorityClass: string; resolutionRule: string; relevantAt: number; source: { domain: string } };
  contextLabel: string | null;
};
type Scope = { counts: Record<string, number> | null; items: Item[]; capped: boolean };

function scopes(fixture: ReturnType<typeof dashboardFixture>) {
  const reactions = fixture.reactions as unknown as { all: Scope; mine: Scope };
  return { all: reactions.all, mine: reactions.mine };
}

const countBy = (items: Item[], priority: string) => items.filter((item) => item.action.priorityClass === priority).length;

describe("dashboardFixture, scope „Sve“", () => {
  const { all } = scopes(dashboardFixture());

  test("has 12 items in the order of priority: 4 urgent, 4 for today, 4 others", () => {
    expect(all.items).toHaveLength(12);
    const classes = all.items.map((item) => item.action.priorityClass);
    expect(classes.slice(0, 4)).toEqual(Array(4).fill("blocking_or_overdue"));
    expect(classes.slice(4, 8)).toEqual(Array(4).fill("due_today"));
    expect(classes.slice(8)).toEqual(["needs_reply", "grace_or_warning", "waiting_client", "waiting_client"]);
    expect(all.items[0].action.description).toBe("Obnova pretplate nije evidentirana");
    expect(all.items[4].action.description).toBe("Potrebna je potvrda dizajna pre štampe");
  });

  test("has the agreed counts and is capped", () => {
    expect(all.counts).toEqual({ total: 74, urgent: 4, today: 6, needsReply: 1, graceOrWarning: 1, waitingScanme: 0, waitingClient: 2, calm: 60 });
    expect(all.capped).toBe(true);
  });

  test("the counters by class add up to the total", () => {
    const c = all.counts!;
    expect(c.urgent + c.today + c.needsReply + c.graceOrWarning + c.waitingScanme + c.waitingClient + c.calm).toBe(c.total);
  });

  test("every cause and action id is unique", () => {
    expect(new Set(all.items.map((item) => item.action.causeId)).size).toBe(all.items.length);
    expect(new Set(all.items.map((item) => item.action.actionItemId)).size).toBe(all.items.length);
  });

  test("the calm item of the original three is not among the named ones", () => {
    expect(all.items.map((item) => item.action.causeId)).not.toContain("manual_problem:fixture:note");
  });

  test("the sources are varied, two items are resolved by hand and one of them is urgent", () => {
    expect(new Set(all.items.map((item) => item.action.source.domain)).size).toBeGreaterThanOrEqual(7);
    const manual = all.items.filter((item) => item.action.resolutionRule === "manual_problem_resolution");
    expect(manual.length).toBeGreaterThanOrEqual(2);
    expect(manual.some((item) => item.action.priorityClass === "blocking_or_overdue")).toBe(true);
    expect(all.items.filter((item) => item.action.resolutionRule !== "manual_problem_resolution").every((item) => item.action.resolutionRule === "source_fact_changed")).toBe(true);
  });

  test("the waits on the two inner orbits have all three sizes: under an hour, under a day, over a day", () => {
    const NOW = dashboardFixture().now;
    for (const priority of ["blocking_or_overdue", "due_today"]) {
      const waits = all.items.filter((item) => item.action.priorityClass === priority).map((item) => NOW - item.action.relevantAt);
      expect(waits.some((w) => w < 3_600_000)).toBe(true);
      expect(waits.some((w) => w >= 3_600_000 && w < 86_400_000)).toBe(true);
      expect(waits.some((w) => w >= 86_400_000)).toBe(true);
    }
  });

  test("every item has the fields of the first original one", () => {
    const keys = Object.keys(all.items[0].action).sort();
    for (const item of all.items) expect(Object.keys(item.action).sort()).toEqual(keys);
    for (const item of all.items) expect(Object.keys(item).sort()).toEqual(Object.keys(all.items[0]).sort());
  });

  test("no name looks like a real firm: every label starts with Demo", () => {
    for (const item of all.items) expect(item.contextLabel).toMatch(/^Demo /);
  });

  test("is serialisable (it goes from the server to a client component)", () => {
    const fixture = dashboardFixture();
    expect(JSON.parse(JSON.stringify(fixture))).toEqual(fixture);
  });
});

describe("dashboardFixture, scope „Moje“", () => {
  test("is unchanged: the first urgent item and the original calm one, at every step", () => {
    for (const step of DASHBOARD_FIXTURE_STEPS) {
      const { mine } = scopes(dashboardFixture("ready", step));
      expect(mine.items.map((item) => item.action.causeId)).toEqual(["subscription:fixture:suspended", "manual_problem:fixture:note"]);
      expect(mine.items[1].action.description).toBe("Proveriti novu adresu za dostavu");
      expect(mine.items[1].action.priorityClass).toBe("other");
      expect(mine.counts).toEqual({ total: 2, urgent: 1, today: 0, needsReply: 0, graceOrWarning: 0, waitingScanme: 0, waitingClient: 0, calm: 1 });
      expect(mine.capped).toBe(false);
    }
  });
});

describe("dashboardFixture, steps", () => {
  const base = scopes(dashboardFixture("ready", 0)).all;

  test("the steps are 0, 1 and 2, and no step means step 0", () => {
    expect(DASHBOARD_FIXTURE_STEPS).toEqual([0, 1, 2]);
    expect(dashboardFixture()).toEqual(dashboardFixture("ready", 0));
  });

  test("step 1 resolves the second urgent item (not the first) and lowers total and urgent by one", () => {
    const step = scopes(dashboardFixture("ready", 1)).all;
    const gone = base.items[1].action.causeId;
    expect(step.items.map((item) => item.action.causeId)).not.toContain(gone);
    expect(step.items[0].action.causeId).toBe(base.items[0].action.causeId);
    expect(step.items).toHaveLength(base.items.length - 1);
    expect(step.counts).toEqual({ ...base.counts, total: base.counts!.total - 1, urgent: base.counts!.urgent - 1 });
    expect(countBy(step.items, "blocking_or_overdue")).toBe(step.counts!.urgent);
  });

  test("step 2 puts a new urgent item at the head, raises total and urgent by one and keeps 12 items", () => {
    const step = scopes(dashboardFixture("ready", 2)).all;
    expect(step.items).toHaveLength(12);
    expect(step.items[0].action.causeId).toBe("order:fixture:new-urgent");
    expect(step.items[0].action.priorityClass).toBe("blocking_or_overdue");
    expect(dashboardFixture().now - step.items[0].action.relevantAt).toBe(5 * 60 * 1000);
    expect(step.counts).toEqual({ ...base.counts, total: 75, urgent: 5 });
    // the last of the 12 is pushed out of view, the first ones keep their order
    expect(step.items.slice(1).map((item) => item.action.causeId)).toEqual(base.items.slice(0, 11).map((item) => item.action.causeId));
    expect(new Set(step.items.map((item) => item.action.actionItemId)).size).toBe(12);
  });

  test("the other widgets do not change with the step", () => {
    const a = dashboardFixture("ready", 0);
    for (const step of [1, 2] as const) {
      const b = dashboardFixture("ready", step);
      expect(b.subscriptions).toEqual(a.subscriptions);
      expect(b.finance).toEqual(a.finance);
      expect(b.tasks).toEqual(a.tasks);
      expect(b.inbox).toEqual(a.inbox);
    }
  });
});

describe("dashboardFixture, other states", () => {
  test("empty has no items and zero counts", () => {
    const { all, mine } = scopes(dashboardFixture("empty"));
    for (const scope of [all, mine]) {
      expect(scope.items).toEqual([]);
      expect(scope.counts).toEqual({ total: 0, urgent: 0, today: 0, needsReply: 0, graceOrWarning: 0, waitingScanme: 0, waitingClient: 0, calm: 0 });
    }
  });

  test("unavailable has no items and no counts", () => {
    const { all, mine } = scopes(dashboardFixture("unavailable"));
    for (const scope of [all, mine]) {
      expect(scope.items).toEqual([]);
      expect(scope.counts).toBeNull();
    }
  });

  test("error and loading mark the subscriptions widget", () => {
    expect(dashboardFixture("error").errorWidget).toBe("subscriptions");
    expect(dashboardFixture("loading").loadingWidget).toBe("subscriptions");
  });
});
