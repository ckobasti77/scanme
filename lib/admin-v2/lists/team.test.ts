import { describe, expect, test } from "vitest";
import { readUrlState } from "@/lib/admin-v2/query/url-state";
import { TEAM_TABS, TEAM_URL_FIELDS } from "@/lib/admin-v2/sidebar/configs/pages";
import { teamMemberName, teamMemberOptions, teamSelection, teamSidebarLive } from "./team";

// ADMIN v2 / Tim — the URL state as the chosen member and view, and the
// members as the options of the sidebar list. TEST data only.

const read = (search: string) => readUrlState(TEAM_URL_FIELDS, search);

const members = [
  { id: "u1", name: "TEST Član 1", email: "clan1@example.invalid", openTasks: 6 },
  { id: "u2", name: "TEST Član 2", email: "clan2@example.invalid", openTasks: 0 },
  { id: "u3", name: "", email: "clan3@example.invalid", openTasks: 3 },
];

describe("teamSelection", () => {
  test("an empty state is the first member and the overview", () => {
    expect(teamSelection({}, members)).toEqual({ memberId: "u1", tab: "overview" });
    expect(teamSelection(read(""), members)).toEqual({ memberId: "u1", tab: "overview" });
  });

  test("a valid member is chosen", () => {
    expect(teamSelection(read("?clan=u2"), members)).toEqual({ memberId: "u2", tab: "overview" });
    expect(teamSelection(read("?clan=u3"), members).memberId).toBe("u3");
  });

  test("an unknown member falls back to the first one", () => {
    expect(teamSelection(read("?clan=nepoznat"), members).memberId).toBe("u1");
  });

  test("every view is chosen", () => {
    for (const tab of TEAM_TABS) {
      expect(teamSelection(read(`?tab=${tab}`), members).tab).toBe(tab);
    }
  });

  test("an invalid view is ignored", () => {
    expect(teamSelection(read("?tab=xyz"), members).tab).toBe("overview");
    expect(teamSelection({ tab: "xyz" }, members).tab).toBe("overview");
  });

  test("the member and the view are independent", () => {
    expect(teamSelection(read("?clan=u2&tab=tasks"), members)).toEqual({ memberId: "u2", tab: "tasks" });
  });

  test("without members the id is empty", () => {
    expect(teamSelection(read("?clan=u2&tab=conversations"), [])).toEqual({ memberId: "", tab: "conversations" });
    expect(teamSelection({}, [])).toEqual({ memberId: "", tab: "overview" });
  });
});

describe("teamMemberName", () => {
  test("the name, and the e-mail only when there is no name", () => {
    expect(teamMemberName(members[0])).toBe("TEST Član 1");
    expect(teamMemberName(members[2])).toBe("clan3@example.invalid");
    expect(teamMemberName({ name: "   ", email: "a@example.invalid" })).toBe("a@example.invalid");
  });
});

describe("teamMemberOptions", () => {
  test("the value is the id, the label the name (or the e-mail), the count the open tasks", () => {
    expect(teamMemberOptions(members)).toEqual([
      { value: "u1", label: "TEST Član 1", count: 6 },
      { value: "u2", label: "TEST Član 2", count: 0 },
      { value: "u3", label: "clan3@example.invalid", count: 3 },
    ]);
  });

  test("no members, no options", () => {
    expect(teamMemberOptions([])).toEqual([]);
  });
});

describe("teamSidebarLive", () => {
  test("the context carries the chosen member, the options and the change", () => {
    const chosen: string[] = [];
    const live = teamSidebarLive(members, "u2", (id) => chosen.push(id));
    expect(live.context?.value).toBe("u2");
    expect(live.context?.options).toEqual(teamMemberOptions(members));
    live.context?.onChange("u3");
    expect(chosen).toEqual(["u3"]);
  });
});
