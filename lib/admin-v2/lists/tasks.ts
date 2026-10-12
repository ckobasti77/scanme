// ADMIN v2 — Zadaci: the URL state of the sidebar (`pogled`, `q`, `assignee`,
// `klijent`, `lokal`, `objekat`) turned into the arguments of
// `adminTasks.list`, the sidebar options built from what the page loaded and
// the same filters over the preview fixtures. Pure; the component casts the
// ids to `Id<…>`.

import { TASK_SUBJECTS, TASK_VIEWS } from "@/lib/admin-v2/sidebar/configs/tasks";
import type { SidebarLive, SidebarOption, SidebarPatch, SidebarState } from "@/lib/admin-v2/sidebar/types";

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
  return Boolean(state.q?.trim() || state.assignee || state.klijent || state.lokal || isSubject(state.objekat) || (isTab(state.pogled) && state.pogled !== "all"));
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
