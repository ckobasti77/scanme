// ADMIN v2 — Dashboard: „Misije danas“ of the sidebar, built from the data the
// widgets already have (no new queries). Pure; each widget publishes its own
// missions and the sidebar adds them up and sorts the most urgent first.

import type { SidebarMission, SidebarState } from "@/lib/admin-v2/sidebar/types";
import { adminV1Sr as dict } from "@/lib/i18n/sr/admin-v1";

/** The scope of the queries: „Moje“ only when the URL says so (`?obim=mine`), everything otherwise. */
export function dashboardScope(state: SidebarState): "all" | "mine" {
  return state.obim === "mine" ? "mine" : "all";
}

/** The signal counts of `adminDashboard.reactions` that become missions. */
export type ReactionMissionCounts = { urgent: number; today: number };
/** Both groups of `adminTasks.dashboardAdapter` that become missions. */
export type TaskMissionGroups = { overdue: { items: readonly unknown[]; capped?: boolean }; today: { items: readonly unknown[]; capped?: boolean } };
/** The conversations of `adminDashboard.inbox`. */
export type InboxMissionRows = { items: readonly { unreadCount: number }[]; capped?: boolean };

/**
 * „Hitne stavke“ and „Stavke za danas“. Without counts (the total is not
 * available) there is nothing to count: an empty list, not two false zeros.
 */
export function reactionMissions(counts: ReactionMissionCounts | null | undefined): SidebarMission[] {
  if (!counts) return [];
  return [
    { id: "reaction-urgent", label: dict.dashboardMissionUrgent, count: counts.urgent, tone: "hitno" },
    { id: "reaction-today", label: dict.dashboardMissionToday, count: counts.today, tone: "uskoro" },
  ];
}

/**
 * The overdue and today tasks. The query returns a limited number per group,
 * so the number is the smallest confirmed one; when the group has more, the
 * mission says so (`capped`, shown as „4+“) instead of looking exact.
 */
export function taskMissions(tasks: TaskMissionGroups): SidebarMission[] {
  return [
    { id: "tasks-overdue", label: dict.dashboardMissionTasksOverdue, count: tasks.overdue.items.length, tone: "hitno", href: "/admin/zadaci?pogled=overdue", ...(tasks.overdue.capped ? { capped: true } : {}) },
    { id: "tasks-today", label: dict.dashboardMissionTasksToday, count: tasks.today.items.length, tone: "uskoro", href: "/admin/zadaci?pogled=today", ...(tasks.today.capped ? { capped: true } : {}) },
  ];
}

/** Conversations with at least one unread message. */
export function inboxMissions(inbox: InboxMissionRows): SidebarMission[] {
  return [
    {
      id: "inbox-unread",
      label: dict.dashboardMissionInboxUnread,
      count: inbox.items.filter((item) => item.unreadCount > 0).length,
      tone: "info",
      href: "/admin/inbox",
      // Only the first conversations are read: with more of them the number is "at least".
      ...(inbox.capped ? { capped: true } : {}),
    },
  ];
}
