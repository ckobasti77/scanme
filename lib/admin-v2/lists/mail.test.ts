import { describe, expect, test } from "vitest";
import { readUrlState, writeUrlState } from "@/lib/admin-v2/query/url-state";
import { MAIL_URL_FIELDS } from "@/lib/admin-v2/sidebar/configs/mail";
import { MAIL_SEARCH_MAX, mailFolderId, mailFolderPatch, mailIntercept, mailListArgs, mailSelection, mailSidebarLive } from "./mail";

// ADMIN v2 / Pošta — the URL state as the mailbox, the folder and the
// arguments of adminMail.listMessages; the same choices as the folder pane,
// the filter and the search above the list gave before. TEST data only.

const read = (search: string) => readUrlState(MAIL_URL_FIELDS, search);

const mailboxes = [
  { key: "veza-a:101", label: "posta-test@example.invalid" },
  { key: "veza-b:202", label: "prodaja-test@example.invalid" },
];
const folders = [
  { folderId: "2022", type: "Sent", label: "Poslato" },
  { folderId: "2014", type: "Inbox", label: "Prijemno" },
  { folderId: "2099", type: "NONE", label: "TEST Sajam 2026" },
];

describe("mailSelection", () => {
  test("an empty state is the first mailbox, every message and no search (the initial state of the old screen)", () => {
    expect(mailSelection(read(""), mailboxes)).toEqual({ account: mailboxes[0], filter: "all", search: "" });
    expect(mailSelection({}, [])).toEqual({ account: null, filter: "all", search: "" });
  });

  test("the mailbox, the view and the search come from the URL", () => {
    expect(mailSelection(read("?nalog=veza-b:202&prikaz=unread&q=ponuda"), mailboxes)).toEqual({ account: mailboxes[1], filter: "unread", search: "ponuda" });
  });

  test("an unknown mailbox and an invalid view read as the defaults", () => {
    expect(mailSelection(read("?nalog=nepoznat&prikaz=sve"), mailboxes)).toEqual({ account: mailboxes[0], filter: "all", search: "" });
  });

  test("the search is trimmed and cut to the limit of the backend", () => {
    expect(mailSelection({ q: "  ponuda  " }, mailboxes).search).toBe("ponuda");
    expect(mailSelection({ q: "x".repeat(120) }, mailboxes).search).toHaveLength(MAIL_SEARCH_MAX);
  });
});

describe("mailFolderId", () => {
  test("without a choice it is Inbox; without Inbox the first folder; without folders nothing", () => {
    expect(mailFolderId({}, folders)).toBe("2014");
    expect(mailFolderId({}, [folders[0], folders[2]])).toBe("2022");
    expect(mailFolderId({}, [])).toBeNull();
  });

  test("a folder of the mailbox is opened; a folder the mailbox does not have falls back to Inbox", () => {
    expect(mailFolderId(read("?folder=2099"), folders)).toBe("2099");
    expect(mailFolderId(read("?folder=7777"), folders)).toBe("2014");
  });
});

describe("mailListArgs: the same arguments of listMessages as before the sidebar", () => {
  test("a folder page with the view", () => {
    expect(mailListArgs("2014", 1, 25, "all", "")).toEqual({ folderId: "2014", start: 1, limit: 25, unreadOnly: false, search: "" });
    expect(mailListArgs("2014", 26, 25, "unread", "")).toEqual({ folderId: "2014", start: 26, limit: 25, unreadOnly: true, search: "" });
  });

  test("a search covers the whole mailbox: the unread view is not applied to it", () => {
    expect(mailListArgs("2014", 1, 25, "unread", "ponuda")).toEqual({ folderId: "2014", start: 1, limit: 25, unreadOnly: false, search: "ponuda" });
  });

  test("before the folders arrive the folder is empty (the list is not asked for)", () => {
    expect(mailListArgs(null, 1, 25, "all", "").folderId).toBe("");
  });
});

describe("what a choice writes", () => {
  test("a folder is written, Inbox (the default) is not, and either ends the search", () => {
    expect(mailFolderPatch("2099", folders)).toEqual({ folder: "2099", q: null });
    expect(mailFolderPatch("2014", folders)).toEqual({ folder: null, q: null });
    expect(writeUrlState(MAIL_URL_FIELDS, "?q=ponuda&prikaz=unread", mailFolderPatch("2099", folders))).toBe("?prikaz=unread&folder=2099");
  });

  test("another mailbox clears the folder; the first mailbox is never written", () => {
    const intercept = mailIntercept(mailboxes);
    expect(intercept({ nalog: "veza-b:202" }, { folder: "2099" })).toEqual({ nalog: "veza-b:202", folder: null });
    expect(intercept({ nalog: "veza-a:101" }, { nalog: "veza-b:202", folder: "2099" })).toEqual({ nalog: null, folder: null });
  });

  test("the same mailbox keeps the folder: Očisti sve on the first mailbox does not leave the folder", () => {
    const intercept = mailIntercept(mailboxes);
    expect(intercept({ q: null, nalog: null }, { folder: "2099", q: "ponuda" })).toEqual({ q: null, nalog: null });
    expect(intercept({ nalog: "veza-b:202" }, { nalog: "veza-b:202", folder: "2099" })).toEqual({ nalog: "veza-b:202" });
  });

  test("a change that is not the mailbox passes untouched; an unknown mailbox is the first one", () => {
    const intercept = mailIntercept(mailboxes);
    const patch = { prikaz: "unread" };
    expect(intercept(patch, {})).toBe(patch);
    expect(intercept({ nalog: "nepoznat" }, {})).toEqual({ nalog: null });
  });
});

describe("mailSidebarLive", () => {
  const onFolder = () => undefined;

  test("the folders with the open one, the mailboxes with the first one as the default", () => {
    const live = mailSidebarLive({ mailboxes, folders, folderId: "2014", search: "", onFolder });
    expect(live.context).toEqual({
      value: "2014",
      options: [{ value: "2022", label: "Poslato" }, { value: "2014", label: "Prijemno" }, { value: "2099", label: "TEST Sajam 2026" }],
      onChange: onFolder,
    });
    expect(live.options).toEqual({ nalog: [{ value: "veza-a:101", label: "posta-test@example.invalid" }, { value: "veza-b:202", label: "prodaja-test@example.invalid" }] });
    expect(live.defaults).toEqual({ nalog: "veza-a:101" });
    expect(live.intercept?.({ nalog: "veza-b:202" }, {})).toEqual({ nalog: "veza-b:202", folder: null });
  });

  test("while a search runs no folder is the open one", () => {
    expect(mailSidebarLive({ mailboxes, folders, folderId: "2014", search: "ponuda", onFolder }).context?.value).toBe("");
  });

  test("until the folders arrive there is no folder list; without mailboxes no default", () => {
    const live = mailSidebarLive({ mailboxes: [], folders: [], folderId: null, search: "", onFolder });
    expect(live.context).toBeUndefined();
    expect(live.defaults).toBeUndefined();
    expect(live.options).toEqual({ nalog: [] });
  });
});

describe("the URL of Pošta", () => {
  test("the keys of the sidebar; the callback parameters of the page are not among them", () => {
    expect(MAIL_URL_FIELDS.map((field) => field.key)).toEqual(["folder", "prikaz", "q", "nalog"]);
    expect(read("?status=povezano&kod=X&folder=2099")).toEqual({ folder: "2099" });
  });

  test("the default view is not written and what is written is read back", () => {
    expect(writeUrlState(MAIL_URL_FIELDS, "", { prikaz: "all", q: "  ponuda ", nalog: "veza-b:202" })).toBe("?q=ponuda&nalog=veza-b%3A202");
    expect(read("?q=ponuda&nalog=veza-b%3A202")).toEqual({ q: "ponuda", nalog: "veza-b:202" });
  });
});
