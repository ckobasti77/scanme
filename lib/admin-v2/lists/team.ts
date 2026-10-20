// ADMIN v2 — Tim: the choice of the member lives in the sidebar („Član tima“,
// the page's `clan` key) and the view in the sidebar („Prikaz“, `tab`). The URL
// state turned into the member and the view the page shows, and the members as
// the options of the sidebar list. Pure.

import { TEAM_TABS } from "@/lib/admin-v2/sidebar/configs/pages";
import type { SidebarLive, SidebarOption, SidebarState } from "@/lib/admin-v2/sidebar/types";

export type TeamTab = (typeof TEAM_TABS)[number];

/** The part of a member row these functions read. */
export type TeamMemberRow = { id: string; name: string; email: string; openTasks: number };

function isTab(value: string | undefined): value is TeamTab {
  return TEAM_TABS.some((tab) => tab === value);
}

/** The name of the member; the e-mail only when there is no name. */
export function teamMemberName(member: Pick<TeamMemberRow, "name" | "email">): string {
  return member.name.trim() || member.email;
}

/**
 * The chosen member and view. Without `clan` (or with an unknown one) it is the
 * first member; without members `memberId` is empty. Without `tab` it is the overview.
 */
export function teamSelection(state: SidebarState, members: readonly Pick<TeamMemberRow, "id">[]): { memberId: string; tab: TeamTab } {
  const chosen = members.find((member) => member.id === state.clan);
  return {
    memberId: (chosen ?? members[0])?.id ?? "",
    tab: isTab(state.tab) ? state.tab : "overview",
  };
}

/** The members as the options of the sidebar list: the name (or the e-mail) and the open tasks. */
export function teamMemberOptions(members: readonly TeamMemberRow[]): SidebarOption[] {
  return members.map((member) => ({ value: member.id, label: teamMemberName(member), count: member.openTasks }));
}

/** What Tim sends to the sidebar: the member list with the chosen member, and what a choice does. */
export function teamSidebarLive(members: readonly TeamMemberRow[], memberId: string, onChange: (memberId: string) => void): SidebarLive {
  return { context: { value: memberId, options: teamMemberOptions(members), onChange } };
}
