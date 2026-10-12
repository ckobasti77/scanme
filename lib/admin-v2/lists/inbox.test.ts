import { describe, expect, test } from "vitest";
import { readUrlState } from "@/lib/admin-v2/query/url-state";
import { INBOX_CHANNELS, INBOX_STATUSES, INBOX_URL_FIELDS } from "@/lib/admin-v2/sidebar/configs/inbox";
import { communicationsSr } from "@/lib/i18n/sr/communications";
import { filterPreviewInbox, INBOX_PREVIEW_ME, inboxAssigneeOptions, inboxListArgs, inboxSidebarLive } from "./inbox";

// ADMIN v2 — Inbox: the URL state of the sidebar becomes the arguments of
// `adminCommunications.listInbox` (the same ones the page sent before the
// filters moved to the sidebar) and filters the fixture rows of the preview.

const read = (query: string) => readUrlState(INBOX_URL_FIELDS, query);

describe("inboxListArgs", () => {
  test("an empty state sends no filter, like the initial state before", () => {
    expect(inboxListArgs({})).toEqual({});
    expect(inboxListArgs(read(""), "me1")).toEqual({});
  });

  test("every key gives the argument the page sent before", () => {
    expect(inboxListArgs(read("?q=logo"))).toEqual({ search: "logo" });
    for (const status of INBOX_STATUSES) expect(inboxListArgs(read(`?status=${status}`))).toEqual({ status });
    for (const channel of INBOX_CHANNELS) expect(inboxListArgs(read(`?kanal=${channel}`))).toEqual({ channel });
    expect(inboxListArgs(read("?status=needs_reply&kanal=email&q=logo&assignee=unassigned"))).toEqual({
      search: "logo",
      status: "needs_reply",
      channel: "email",
      assignee: "unassigned",
    });
  });

  test("the assignee: mine needs the known admin, unassigned and an id go as they are", () => {
    expect(inboxListArgs(read("?assignee=mine"), "me1")).toEqual({ assignee: "me1" });
    expect(inboxListArgs(read("?assignee=mine"))).toEqual({});
    expect(inboxListArgs(read("?assignee=mine"), null)).toEqual({});
    expect(inboxListArgs(read("?assignee=unassigned"), "me1")).toEqual({ assignee: "unassigned" });
    // A Convex id (32 lower-case letters and digits) goes as it is; anything else reads as absent (RX S5).
    const id = "k57".padEnd(32, "a");
    expect(inboxListArgs(read(`?assignee=${id}`), "me1")).toEqual({ assignee: id });
    expect(inboxListArgs(read("?assignee=k57abc"), "me1")).toEqual({});
  });

  test("an invalid value is ignored (readUrlState drops it)", () => {
    expect(read("?status=nepostojeci&kanal=fax")).toEqual({});
    expect(inboxListArgs(read("?status=nepostojeci&kanal=fax&q=%20%20"))).toEqual({});
    expect(inboxListArgs(read("?status=nepostojeci&kanal=email"))).toEqual({ channel: "email" });
    // Even a state that did not go through readUrlState sends no unknown enum.
    expect(inboxListArgs({ status: "nepostojeci", kanal: "fax" })).toEqual({});
  });
});

describe("inboxAssigneeOptions / inboxSidebarLive", () => {
  const admins = [{ id: "a1", name: "TEST Admin Prvi" }, { id: "a2", name: "TEST Admin Drugi" }];

  test("mine, unassigned, then the admins", () => {
    expect(inboxAssigneeOptions(admins)).toEqual([
      { value: "mine", label: communicationsSr.assigneeMine },
      { value: "unassigned", label: communicationsSr.assigneeUnassigned },
      { value: "a1", label: "TEST Admin Prvi" },
      { value: "a2", label: "TEST Admin Drugi" },
    ]);
    expect(inboxAssigneeOptions([])).toHaveLength(2);
  });

  test("the page sends only the options of the assignee group", () => {
    expect(inboxSidebarLive(admins)).toEqual({ options: { assignee: inboxAssigneeOptions(admins) } });
  });
});

describe("filterPreviewInbox", () => {
  type Row = { id: string; status: string; channel: string; assigneeAdminId: string | null; accountName: string; contactName: string; businessName: string | null; smkCode: string; latestMessagePreview: string };
  const row = (id: string, extra: Partial<Row> = {}): Row => ({
    id,
    status: "needs_reply",
    channel: "panel_chat",
    assigneeAdminId: null,
    accountName: `TEST Nalog ${id}`,
    contactName: `TEST Kontakt ${id}`,
    businessName: null,
    smkCode: `SMK-TEST-${id}`,
    latestMessagePreview: `TEST poruka ${id}`,
    ...extra,
  });
  const rows = [
    row("r1"),
    row("r2", { status: "waiting_client", channel: "phone", assigneeAdminId: INBOX_PREVIEW_ME, latestMessagePreview: "TEST Šampon i logo" }),
    row("r3", { status: "completed", channel: "email", assigneeAdminId: "test-admin-other", businessName: "TEST Lokal" }),
  ];
  const ids = (state: Record<string, string>) => filterPreviewInbox(rows, state).map((item) => item.id);

  test("no filter keeps every row", () => {
    expect(ids({})).toEqual(["r1", "r2", "r3"]);
  });

  test("status and channel", () => {
    expect(ids(read("?status=waiting_client"))).toEqual(["r2"]);
    expect(ids(read("?kanal=email"))).toEqual(["r3"]);
    expect(ids(read("?status=completed&kanal=phone"))).toEqual([]);
  });

  test("assignee: unassigned, mine is the fixture admin, an id", () => {
    expect(ids(read("?assignee=unassigned"))).toEqual(["r1"]);
    expect(ids(read("?assignee=mine"))).toEqual(["r2"]);
    expect(filterPreviewInbox(rows, read("?assignee=mine"), "test-admin-other").map((item) => item.id)).toEqual(["r3"]);
    expect(ids(read("?assignee=test-admin-other"))).toEqual(["r3"]);
  });

  test("search looks at names, business, code and the last message, without diacritics or case", () => {
    expect(ids(read("?q=SAMPON"))).toEqual(["r2"]);
    expect(ids(read("?q=lokal"))).toEqual(["r3"]);
    expect(ids(read("?q=smk-test-r1"))).toEqual(["r1"]);
    expect(ids(read("?q=nema"))).toEqual([]);
  });
});
