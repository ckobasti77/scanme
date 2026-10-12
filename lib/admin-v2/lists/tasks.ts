// ADMIN v2 — Zadaci: the URL state of the sidebar (`pogled`, `q`, `assignee`,
// `klijent`, `lokal`, `objekat`) turned into the arguments of
// `adminTasks.list`, the sidebar options built from what the page loaded and
// the same filters over the preview fixtures. Pure; the component casts the
// ids to `Id<…>`.

import { taskMissions, type TaskMissionGroups } from "@/lib/admin-v2/lists/dashboard-missions";
import { TASK_SUBJECTS, TASK_VIEWS } from "@/lib/admin-v2/sidebar/configs/tasks";
import type { SidebarLive, SidebarMission, SidebarOption, SidebarPatch, SidebarState } from "@/lib/admin-v2/sidebar/types";

export type TaskTab = (typeof TASK_VIEWS)[number];
export type TaskSubjectFilter = (typeof TASK_SUBJECTS)[number];

/** The arguments of `adminTasks.list` that the filters decide. */
export type TasksListArgs = {
  tab: TaskTab;
  search?: string;
  assigneeId?: string;
  accountId?: string;
  businessId?: string;
  subjectKind?: TaskSubjectFilter;
};

function isTab(value: string | undefined): value is TaskTab {
  return TASK_VIEWS.some((view) => view === value);
}

function isSubject(value: string | undefined): value is TaskSubjectFilter {
  return TASK_SUBJECTS.some((subject) => subject === value);
}

/** An empty state is the first view without filters: `{ tab: "all" }`. */
export function tasksListArgs(state: SidebarState): TasksListArgs {
  const search = state.q?.trim();
  return {
    tab: isTab(state.pogled) ? state.pogled : "all",
    ...(search ? { search } : {}),
    ...(state.assignee ? { assigneeId: state.assignee } : {}),
    ...(state.klijent ? { accountId: state.klijent } : {}),
    ...(state.lokal ? { businessId: state.lokal } : {}),
    ...(isSubject(state.objekat) ? { subjectKind: state.objekat } : {}),
  };
}

/** Whether anything is chosen (a view other than „Svi“ counts): picks the „no results“ empty state. */
export function tasksAreFiltered(state: SidebarState): boolean {
  return tasksAreNarrowed(state) || (isTab(state.pogled) && state.pogled !== "all");
}

/** Whether a search or a filter group narrows the list (the view does not count). */
export function tasksAreNarrowed(state: SidebarState): boolean {
  return Boolean(state.q?.trim() || state.assignee || state.klijent || state.lokal || isSubject(state.objekat));
}

export type TaskAdminOption = { id: string; name: string };
export type TaskAccountOption = { id: string; name: string; smkCode: string };
export type TaskVenueOption = { id: string; name: string; smlCode: string };

/** Options of the groups the page fills: the assignee, the client (with the SMK code) and the venue (with the SML code). */
export function tasksSidebarOptions({ admins, accounts, venues }: {
  admins: readonly TaskAdminOption[];
  accounts: readonly TaskAccountOption[];
  venues: readonly TaskVenueOption[];
}): Record<"assignee" | "klijent" | "lokal", SidebarOption[]> {
  return {
    assignee: admins.map((admin) => ({ value: admin.id, label: admin.name })),
    klijent: accounts.map((account) => ({ value: account.id, label: account.name, hint: account.smkCode })),
    lokal: venues.map((venue) => ({ value: venue.id, label: venue.name, hint: venue.smlCode })),
  };
}

/** A venue belongs to one client: changing (or clearing) the client clears the venue. */
export function tasksIntercept(patch: SidebarPatch, state: SidebarState): SidebarPatch {
  if (!("klijent" in patch) || "lokal" in patch) return patch;
  if ((patch.klijent ?? null) === (state.klijent ?? null)) return patch;
  return { ...patch, lokal: null };
}

/** What Zadaci sends to the sidebar. */
export function tasksSidebarLive(options: Parameters<typeof tasksSidebarOptions>[0]): SidebarLive {
  return { options: tasksSidebarOptions(options), intercept: tasksIntercept };
}

/** The part of a task row the preview filters read. */
export type PreviewTaskRow = {
  status: "open" | "in_progress" | "deferred" | "completed" | "cancelled";
  timePhase: "overdue" | "today" | "future" | "none";
  assigneeId: string;
  accountId: string;
  accountName: string;
  smkCode: string;
  businessId: string | null;
  businessName: string | null;
  smlCode: string | null;
  subjectKind: string;
  title: string;
};

/** The venues of one client, taken from the rows (the preview has no `contextOptions`). */
export function tasksVenuesFromRows(rows: readonly PreviewTaskRow[], accountId: string | undefined): TaskVenueOption[] {
  if (!accountId) return [];
  const venues = new Map<string, TaskVenueOption>();
  for (const row of rows) {
    if (row.accountId !== accountId || !row.businessId || !row.businessName || !row.smlCode) continue;
    if (!venues.has(row.businessId)) venues.set(row.businessId, { id: row.businessId, name: row.businessName, smlCode: row.smlCode });
  }
  return [...venues.values()];
}

/** The same rules as the Convex list, over fixture rows. */
export function filterPreviewTasks<Row extends PreviewTaskRow>(rows: readonly Row[], state: SidebarState): Row[] {
  const args = tasksListArgs(state);
  const needle = args.search?.toLocaleLowerCase("sr-Latn-RS");
  return rows.filter((task) => {
    if (args.tab === "all" && (task.status === "deferred" || task.status === "completed" || task.status === "cancelled")) return false;
    if (args.tab === "today" && task.timePhase !== "today") return false;
    if (args.tab === "overdue" && task.timePhase !== "overdue") return false;
    if (args.tab === "deferred" && task.status !== "deferred") return false;
    if (args.tab === "completed" && task.status !== "completed" && task.status !== "cancelled") return false;
    if (args.assigneeId && task.assigneeId !== args.assigneeId) return false;
    if (args.accountId && task.accountId !== args.accountId) return false;
    if (args.businessId && task.businessId !== args.businessId) return false;
    if (args.subjectKind && task.subjectKind !== args.subjectKind) return false;
    return !needle || `${task.accountName} ${task.smkCode} ${task.businessName} ${task.smlCode} ${task.title}`.toLocaleLowerCase("sr-Latn-RS").includes(needle);
  });
}

/** How many tasks per group Zadaci reads for „Misije danas“ (the limit of `adminTasks.dashboardAdapter`). */
export const TASK_MISSION_LIMIT = 12;

/** „Misije danas“ of the preview: the overdue and today tasks that are still open among the fixture rows. */
export function previewTaskMissions(rows: readonly Pick<PreviewTaskRow, "status" | "timePhase">[]): SidebarMission[] {
  const open = rows.filter((row) => row.status === "open" || row.status === "in_progress");
  return taskMissions({
    overdue: { items: open.filter((row) => row.timePhase === "overdue") },
    today: { items: open.filter((row) => row.timePhase === "today") },
  });
}

/** The tone of a task status chip. One rule for Zadaci and Tim, so the same task never has two colours. */
export type TaskStatusTone = "neutral" | "problem" | "waiting" | "active";

export function taskStatusTone(status: PreviewTaskRow["status"], timePhase: PreviewTaskRow["timePhase"]): TaskStatusTone {
  if (status === "completed" || status === "cancelled") return "neutral";
  if (timePhase === "overdue") return "problem";
  if (status === "in_progress" || timePhase === "today") return "waiting";
  if (status === "open") return "active";
  return "neutral";
}

/**
 * The numbers next to „Kasni“ and „Danas“ in the sidebar, from the same read as
 * „Misije danas“ (open tasks of everyone). The query returns a limited number
 * per group, so a full group is shown as „12+“ and not as an exact number.
 */
export function tasksViewCounts(groups: TaskMissionGroups, state: SidebarState = {}): Record<string, number | string> | undefined {
  // The read counts every open task: with a search or a filter chosen the numbers would not match the list.
  if (tasksAreNarrowed(state)) return undefined;
  const count = (group: TaskMissionGroups["overdue"]) => (group.capped ? `${group.items.length}+` : group.items.length);
  return { overdue: count(groups.overdue), today: count(groups.today) };
}

/** The same numbers for the preview: the open fixture rows, cut at the limit of the query. */
export function previewTaskViewCounts(rows: readonly Pick<PreviewTaskRow, "status" | "timePhase">[], state: SidebarState = {}): Record<string, number | string> | undefined {
  const open = rows.filter((row) => row.status === "open" || row.status === "in_progress");
  const group = (phase: PreviewTaskRow["timePhase"]) => {
    const items = open.filter((row) => row.timePhase === phase);
    return { items: items.slice(0, TASK_MISSION_LIMIT), capped: items.length > TASK_MISSION_LIMIT };
  };
  return tasksViewCounts({ overdue: group("overdue"), today: group("today") }, state);
}
