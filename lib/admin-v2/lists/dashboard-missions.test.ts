import { describe, expect, test } from "vitest";
import { readUrlState } from "@/lib/admin-v2/query/url-state";
import { DASHBOARD_URL_FIELDS } from "@/lib/admin-v2/sidebar/configs/pages";
import { adminV1Sr as dict } from "@/lib/i18n/sr/admin-v1";
import { dashboardScope, inboxMissions, reactionMissions, taskMissions } from "./dashboard-missions";

// ADMIN v2 / Dashboard — the scope from the URL and „Misije danas“ built from
// the data the widgets already have. TEST data only.

const rows = (count: number) => Array.from({ length: count }, (_, index) => ({ id: `t${index}` }));

describe("dashboardScope", () => {
  test("everything by default, „Moje“ only for ?obim=mine", () => {
    expect(dashboardScope({})).toBe("all");
    expect(dashboardScope(readUrlState(DASHBOARD_URL_FIELDS, ""))).toBe("all");
    expect(dashboardScope(readUrlState(DASHBOARD_URL_FIELDS, "?obim=all"))).toBe("all");
    expect(dashboardScope(readUrlState(DASHBOARD_URL_FIELDS, "?obim=mine"))).toBe("mine");
  });

  test("an invalid value is ignored", () => {
    expect(dashboardScope(readUrlState(DASHBOARD_URL_FIELDS, "?obim=xyz"))).toBe("all");
    expect(dashboardScope({ obim: "xyz" })).toBe("all");
  });
});

describe("reactionMissions", () => {
  test("urgent and today items, with their tones", () => {
    expect(reactionMissions({ urgent: 3, today: 5 })).toEqual([
      { id: "reaction-urgent", label: dict.dashboardMissionUrgent, count: 3, tone: "hitno" },
      { id: "reaction-today", label: dict.dashboardMissionToday, count: 5, tone: "uskoro" },
    ]);
  });

  test("zeros stay as zeros (the sidebar hides them)", () => {
    expect(reactionMissions({ urgent: 0, today: 0 }).map((mission) => mission.count)).toEqual([0, 0]);
  });

  test("without counts there is nothing to count", () => {
    expect(reactionMissions(null)).toEqual([]);
    expect(reactionMissions(undefined)).toEqual([]);
  });

  test("extra fields of the signal counts are ignored", () => {
    const counts = { total: 9, urgent: 1, today: 2, needsReply: 4, calm: 2 };
    expect(reactionMissions(counts)).toHaveLength(2);
  });
});

describe("taskMissions", () => {
  test("overdue and today tasks, with the links to those views", () => {
    expect(taskMissions({ overdue: { items: rows(2) }, today: { items: rows(4) } })).toEqual([
      { id: "tasks-overdue", label: dict.dashboardMissionTasksOverdue, count: 2, tone: "hitno", href: "/admin/zadaci?pogled=overdue" },
      { id: "tasks-today", label: dict.dashboardMissionTasksToday, count: 4, tone: "uskoro", href: "/admin/zadaci?pogled=today" },
    ]);
  });

  test("empty groups give zeros", () => {
    expect(taskMissions({ overdue: { items: [] }, today: { items: [] } }).map((mission) => mission.count)).toEqual([0, 0]);
  });
});

describe("inboxMissions", () => {
  test("counts the conversations with unread messages, not the messages", () => {
    const missions = inboxMissions({ items: [{ unreadCount: 3 }, { unreadCount: 0 }, { unreadCount: 1 }] });
    expect(missions).toEqual([
      { id: "inbox-unread", label: dict.dashboardMissionInboxUnread, count: 2, tone: "info", href: "/admin/inbox" },
    ]);
  });

  test("nothing unread is a zero", () => {
    expect(inboxMissions({ items: [] })[0].count).toBe(0);
    expect(inboxMissions({ items: [{ unreadCount: 0 }] })[0].count).toBe(0);
  });
});
