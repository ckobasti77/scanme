import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import type { AdminMailConnectionView, AdminMailMessage } from "@/convex/lib/adminMailContract";
import { AdminSidebarView } from "@/components/admin/frame/admin-sidebar-view";
import { mailFolderId, mailSidebarLive } from "@/lib/admin-v2/lists/mail";
import { DEFAULT_SIDEBAR, resolveAdminSidebar } from "@/lib/admin-v2/sidebar/registry";
import type { SidebarState } from "@/lib/admin-v2/sidebar/types";
import { MailHtmlFrame } from "./mail-html-frame";
import { blockRemoteMailImages, buildMailSrcDoc, MAIL_FRAME_SANDBOX, mailContentSecurityPolicy, mailHasRemoteImages, stripActiveMailContent } from "./mail-srcdoc";
import { AdminMailView } from "./mail-view";
import { mailCallbackNotice, mailFolderLabel } from "./mail-format";
import { previewFolders, previewMailSource, previewMailStatus, PREVIEW_HTML_MESSAGE_ID, PREVIEW_INBOX_ID } from "./mail-fixtures";
import { mailAccountOptions, MAIL_PAGE_SIZE, type MailViewActions, type MailViewModel } from "./use-mail-workspace";

// Admin UX Z1 — Pošta view (SSR markup) and the HTML message frame: sandbox
// without scripts, CSP meta first, remote images blocked until "Prikaži slike",
// active content stripped, plain text escaped. ADMIN v2: the mailbox, the
// folders, the view and the search are in the sidebar. TEST data only.

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode } & Record<string, unknown>) => <a href={href} {...rest}>{children}</a>,
}));

const DANGEROUS = [
  '<html><head><meta http-equiv="refresh" content="0;url=https://evil.example.invalid">',
  '<base href="https://evil.example.invalid/"><link rel="stylesheet" href="https://evil.example.invalid/x.css"></head><body>',
  '<p onclick="steal()" onmouseover=\'steal()\'>Tekst</p>',
  "<script>alert(1)</script><script src=\"https://evil.example.invalid/x.js\"></script>",
  '<img src="https://tracker.example.invalid/p.png" onerror="steal()">',
  '<a href="javascript:alert(1)">A</a> <a href=\' javascript:alert(2)\'>B</a> <a href="https://example.invalid/ok">C</a>',
  '<iframe src="https://evil.example.invalid"></iframe><object data="x.swf"></object><embed src="x.swf">',
  '<form action="https://evil.example.invalid"><input name="lozinka"></form>',
  "</body></html>",
].join("");

const noop = () => {};
const actions: MailViewActions = {
  connect: noop, disconnect: noop, dismissNotice: noop, goToStart: noop, retryFolders: noop, retryList: noop, selectMessage: noop,
  closeMessage: noop, retryMessage: noop, showImages: noop, markRead: noop, download: noop, compose: noop, openSignature: noop,
  openSentFolder: noop,
};

async function readyModel(overrides: Partial<MailViewModel> = {}): Promise<MailViewModel> {
  const status = previewMailStatus("spremno");
  const accounts = mailAccountOptions(status.connections);
  const source = previewMailSource("spremno");
  const page = await source.listMessages(accounts[0], { folderId: PREVIEW_INBOX_ID, start: 1, limit: MAIL_PAGE_SIZE, unreadOnly: false, search: "" });
  const message = await source.getMessage(accounts[0], { folderId: PREVIEW_INBOX_ID, messageId: PREVIEW_HTML_MESSAGE_ID });
  return {
    mode: "ready", notice: null, connections: status.connections, busyConnect: false, busyConnectionId: null, accounts, accountKey: accounts[0].key,
    folders: { status: "ready", data: previewFolders }, folderId: PREVIEW_INBOX_ID, filter: "all", search: "", start: 1,
    pageSize: MAIL_PAGE_SIZE, list: { status: "ready", data: page }, selected: { folderId: PREVIEW_INBOX_ID, messageId: PREVIEW_HTML_MESSAGE_ID },
    message: { status: "ready", data: message }, readIds: new Set(), showImages: false, markingRead: false, downloadingId: null,
    readerFailure: null, now: Date.parse("2026-10-06T10:00:00+02:00"), ...overrides,
  };
}

const render = (model: MailViewModel) => renderToStaticMarkup(<AdminMailView model={model} actions={actions} />);

function srcdocOf(markup: string) {
  const match = markup.match(/srcDoc="([^"]*)"|srcdoc="([^"]*)"/);
  const raw = match?.[1] ?? match?.[2] ?? "";
  return raw.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

describe("HTML message srcdoc and CSP", () => {
  test("the CSP meta is the first element of <head>; remote images only after the explicit choice", () => {
    const blocked = buildMailSrcDoc("<p>x</p>", { allowRemoteImages: false });
    expect(blocked.startsWith('<!doctype html><html><head><meta http-equiv="Content-Security-Policy"')).toBe(true);
    expect(mailContentSecurityPolicy(false)).toBe("default-src 'none'; img-src data: cid:; style-src 'unsafe-inline'; font-src data:; base-uri 'none'; form-action 'none'");
    expect(mailContentSecurityPolicy(false)).not.toMatch(/script-src|https:/);
    expect(mailContentSecurityPolicy(true)).toContain("img-src data: cid: https:");
    expect(mailContentSecurityPolicy(true)).not.toContain("script-src");
    expect(blocked).toContain('<meta name="referrer" content="no-referrer">');
    expect(blocked).toContain('<base target="_blank">');
  });

  test("scripts, frames, objects, meta refresh, foreign <base>/<link>, handlers and javascript: links are stripped", () => {
    const doc = buildMailSrcDoc(DANGEROUS, { allowRemoteImages: false });
    for (const forbidden of ["<script", "alert(1)</script>", "x.js", "http-equiv=\"refresh\"", "evil.example.invalid/\"", "<link", "x.css", "onclick", "onmouseover", "onerror", "javascript:", "<iframe", "<object", "<embed"]) {
      expect({ forbidden, found: doc.includes(forbidden) }).toEqual({ forbidden, found: false });
    }
    // exactly one <base> (ours, target only) and one CSP meta
    expect(doc.match(/<base\b/g)).toHaveLength(1);
    expect(doc.match(/Content-Security-Policy/g)).toHaveLength(1);
    // the text and the safe link stay; links open in a new tab without opener
    expect(doc).toContain("Tekst");
    expect(doc).toContain('<a rel="noopener noreferrer" target="_blank" href="https://example.invalid/ok">C</a>');
    expect(stripActiveMailContent('<abbr title="x">y</abbr>')).toBe('<abbr title="x">y</abbr>');
    // blocked: the tracker is not even requested; allowed: the image src is back (CSP permits https:)
    expect(doc).toContain('<img data-blocked-src="https://tracker.example.invalid/p.png">');
    expect(doc).not.toMatch(/\ssrc="https:\/\/tracker/);
    expect(buildMailSrcDoc(DANGEROUS, { allowRemoteImages: true })).toContain('<img src="https://tracker.example.invalid/p.png">');
  });

  test("blocked images: remote src/srcset, background attributes and CSS url() are not attempted; data: images stay", () => {
    expect(blockRemoteMailImages('<img alt="a" src="https://x.example.invalid/a.png" srcset="https://x.example.invalid/a2.png 2x">'))
      .toBe('<img alt="a" data-blocked-src="https://x.example.invalid/a.png" data-blocked-srcset="https://x.example.invalid/a2.png 2x">');
    expect(blockRemoteMailImages('<img src="data:image/png;base64,AAAA"><img src=//x.example.invalid/b.png>'))
      .toBe('<img src="data:image/png;base64,AAAA"><img data-blocked-src=//x.example.invalid/b.png>');
    expect(blockRemoteMailImages(`<td background="http://x.example.invalid/bg.png" style="background:url('https://x.example.invalid/c.png') no-repeat">`))
      .toBe('<td data-blocked-background="http://x.example.invalid/bg.png" style="background:none no-repeat">');
    expect(blockRemoteMailImages('<p>src="https://x.example.invalid" u tekstu</p>')).toBe('<p>src="https://x.example.invalid" u tekstu</p>');
  });

  test("remote image detection (img src, CSS url(), background attribute)", () => {
    expect(mailHasRemoteImages('<img src="https://x.example.invalid/a.png">')).toBe(true);
    expect(mailHasRemoteImages("<div style=\"background:url('//x.example.invalid/a.png')\">")).toBe(true);
    expect(mailHasRemoteImages('<td background="http://x.example.invalid/a.png">')).toBe(true);
    expect(mailHasRemoteImages('<img src="data:image/png;base64,AAAA"><img src="cid:abc">')).toBe(false);
  });

  test("the iframe is sandboxed without scripts, same-origin, forms or top navigation, and carries the CSP", () => {
    const markup = renderToStaticMarkup(<MailHtmlFrame html={DANGEROUS} allowRemoteImages={false} title="TEST" />);
    expect(MAIL_FRAME_SANDBOX).toBe("allow-popups allow-popups-to-escape-sandbox");
    expect(markup).toContain(`sandbox="${MAIL_FRAME_SANDBOX}"`);
    for (const token of ["allow-scripts", "allow-same-origin", "allow-forms", "allow-top-navigation", "allow-modals"]) expect(markup).not.toContain(token);
    expect(markup).toMatch(/referrer[Pp]olicy="no-referrer"/);
    const doc = srcdocOf(markup);
    expect(doc).toContain("Content-Security-Policy");
    expect(doc).toContain("img-src data: cid:;");
    expect(doc).not.toContain("<script");
  });
});

describe("Pošta view", () => {
  test("not configured: a clear state, no connect button, no list and no frame", () => {
    const markup = render({
      mode: "not_configured", notice: null, connections: [], busyConnect: false, busyConnectionId: null, accounts: [], accountKey: null,
      folders: { status: "idle" }, folderId: null, filter: "all", search: "", start: 1, pageSize: MAIL_PAGE_SIZE,
      list: { status: "idle" }, selected: null, message: { status: "idle" }, readIds: new Set(), showImages: false, markingRead: false,
      downloadingId: null, readerFailure: null, now: 0,
    });
    expect(markup).toContain("Pošta nije podešena");
    expect(markup).not.toContain("Poveži Zoho nalog");
    expect(markup).not.toContain("<iframe");
    expect(markup).not.toContain('role="search"');
  });

  test("no connection: the connect call to action and the privacy promise", async () => {
    const model = await readyModel();
    const markup = render({ ...model, mode: "no_connection", connections: [], accounts: [], accountKey: null, selected: null });
    expect(markup).toContain("Poveži svoje sanduče");
    expect(markup).toContain("Poveži Zoho nalog");
    expect(markup).toContain("lozinka nikad ne prolazi kroz ScanMe");
  });

  test("ready: the list and the message, list with unread marker and attachment clip, sandboxed HTML message with images blocked", async () => {
    const markup = render(await readyModel());
    expect(markup).toContain('aria-label="Poruke"');
    expect(markup).toContain('aria-label="Poruka"');
    expect(markup).toContain("Treba ponovo povezati");
    expect(markup).toContain("Ponovo poveži");
    expect(markup).toContain('<span class="sr-only">Nepročitano</span>');
    expect(markup).toContain('aria-label="Ima prilog"');
    expect(markup).toContain("1–25");
    expect(markup).toContain("Sledeća");
    expect(markup).toContain(`sandbox="${MAIL_FRAME_SANDBOX}"`);
    expect(markup).toContain("Udaljene slike su blokirane radi privatnosti.");
    expect(markup).toContain("Prikaži slike");
    expect(markup).toContain("Označi kao pročitano");
    expect(srcdocOf(markup)).toContain("img-src data: cid:;");
    expect(srcdocOf(markup)).not.toContain("<script");
  });

  test("after \"Prikaži slike\" the frame allows https images; scripts stay blocked", async () => {
    const markup = render(await readyModel({ showImages: true }));
    expect(markup).toContain("Udaljene slike su prikazane za ovu poruku.");
    expect(srcdocOf(markup)).toContain("img-src data: cid: https:");
    expect(srcdocOf(markup)).not.toContain("<script");
  });

  test("a plain-text message is escaped text in <pre>, never HTML; attachments are listed with size", async () => {
    const model = await readyModel();
    const message: AdminMailMessage = {
      ...(model.message.status === "ready" ? model.message.data : ({} as AdminMailMessage)),
      body: { kind: "text", content: "<b>nije HTML</b>\n<script>alert(1)</script>" },
      attachments: [{ attachmentId: "1", fileName: "TEST ponuda.pdf", size: 184_320, inline: false }],
    };
    const markup = render({ ...model, message: { status: "ready", data: message } });
    expect(markup).not.toContain("<iframe");
    expect(markup).toContain("&lt;b&gt;nije HTML&lt;/b&gt;");
    expect(markup).not.toContain("<script>alert(1)</script>");
    expect(markup).toContain("Preuzmi TEST ponuda.pdf (180 KB)");
  });

  test("errors use stable codes: auth_required offers reconnect, rate limit shows the wait", async () => {
    const model = await readyModel({ selected: null });
    const auth = render({ ...model, list: { status: "error", failure: { code: "ZOHO_AUTH_REQUIRED", retryAfterSeconds: null } } });
    expect(auth).toContain("Zoho traži da ponovo povežeš nalog.");
    expect(auth).toContain('role="alert"');
    const limited = render({ ...model, list: { status: "error", failure: { code: "ZOHO_RATE_LIMITED", retryAfterSeconds: 30 } } });
    expect(limited).toContain("Zoho je privremeno ograničio broj zahteva. Pokušaj ponovo za 30 s.");
    expect(limited).toContain("Pokušaj ponovo");
  });

  test("no filter block on the screen: the folders, the mailbox picker, the search and the unread filter are not drawn here", async () => {
    const markup = render(await readyModel());
    expect(markup).not.toContain('aria-label="Folderi"');
    expect(markup).not.toContain("<select");
    expect(markup).not.toContain("</option>");
    expect(markup).not.toContain('role="search"');
    expect(markup).not.toContain('type="search"');
    expect(markup).not.toContain("aria-pressed");
    expect(markup).not.toContain('role="tablist"');
    expect(markup).not.toContain(">Prijemno<");
    expect(markup).not.toContain(">Poslato<");
    // list | message by the width of the screen (container), not of the window
    expect(markup).toContain("@3xl:grid-cols-[minmax(17rem,22rem)_minmax(0,1fr)]");
    expect(markup).not.toMatch(/\b(?:lg|xl):grid-cols/);
  });

  test("a search says what the list shows, and that the unread view does not apply to it", async () => {
    const model = await readyModel({ selected: null, search: "ponuda" });
    expect(render(model)).toContain("Rezultati u celom sanduku za „ponuda“");
    expect(render(model)).not.toContain("Pretraga prikazuje i pročitane poruke.");
    expect(render({ ...model, filter: "unread" })).toContain("Rezultati u celom sanduku za „ponuda“ Pretraga prikazuje i pročitane poruke.");
    // the line is text only: the search is removed in the sidebar (its chip)
    expect(render(model)).not.toContain("Očisti pretragu");
  });

  test("folders that fail to load show the error with a retry in the list; a mailbox without folders says so", async () => {
    const model = await readyModel({ selected: null, folderId: null, list: { status: "idle" } });
    const failed = render({ ...model, folders: { status: "error", failure: { code: "ZOHO_RATE_LIMITED", retryAfterSeconds: 30 } } });
    expect(failed).toContain("Zoho je privremeno ograničio broj zahteva. Pokušaj ponovo za 30 s.");
    expect(failed).toContain("Pokušaj ponovo");
    expect(render({ ...model, folders: { status: "ready", data: [] } })).toContain("Sanduče nema foldere.");
    expect(render({ ...model, folders: { status: "loading" } })).toContain("Učitavam foldere");
  });

  test("empty folder, empty unread filter and empty search have their own text", async () => {
    const model = await readyModel({ selected: null, list: { status: "ready", data: { messages: [], hasMore: false } } });
    expect(render(model)).toContain("Folder je prazan");
    expect(render({ ...model, filter: "unread" })).toContain("Nema nepročitanih poruka u ovom folderu.");
    expect(render({ ...model, search: "ponuda" })).toContain("Nema rezultata");
    expect(render({ ...model, search: "ponuda" })).toContain("Rezultati u celom sanduku za „ponuda“");
  });

  test("the header is the common page header: one h1 on the fixed scale, the actions on the right, the demo label as a status", async () => {
    const model = await readyModel();
    const markup = render(model);
    expect(markup.match(/<h1/g)).toHaveLength(1);
    expect(markup).toContain('data-admin-primitive="page-header"');
    expect(markup).toMatch(/<h1[^>]*>Pošta<\/h1>/);
    expect(markup).not.toContain("sm:text-4xl");
    expect(markup).toContain("Novo pismo");
    const demo = renderToStaticMarkup(<AdminMailView model={model} actions={actions} badge="Demo prikaz" />);
    expect(demo).toMatch(/data-admin-primitive="status"[^>]*><span[^>]*><\/span>Demo prikaz/);
    expect(markup).not.toContain("Demo prikaz");
  });

  test("callback notice: connected, a known error code, anything else is generic", () => {
    expect(mailCallbackNotice("povezano", undefined)).toEqual({ tone: "success", text: "Zoho nalog je povezan." });
    expect(mailCallbackNotice("greska", "ZOHO_STATE_INVALID")?.text).toBe("Povezivanje je isteklo ili je već iskorišćeno. Pokreni ga ponovo.");
    expect(mailCallbackNotice("greska", "<script>")?.text).toBe("Akcija nije uspela.");
    expect(mailCallbackNotice(undefined, undefined)).toBeNull();
  });

  test("the TEST mailboxes have their own folders, like Zoho mailboxes do; a folder the mailbox does not have opens its Inbox", async () => {
    const accounts = mailAccountOptions(previewMailStatus("spremno").connections);
    const source = previewMailSource("spremno");
    const first = await source.listFolders(accounts[0]);
    const second = await source.listFolders(accounts[1]);
    expect(first).toBe(previewFolders);
    expect(second.map((folder) => folder.type)).toEqual(["Inbox", "Sent", "Drafts"]);
    expect(second.some((folder) => first.some((other) => other.folderId === folder.folderId))).toBe(false);
    expect(mailFolderId({ folder: first[1].folderId }, second)).toBe(second[0].folderId);
    const page = await source.listMessages(accounts[1], { folderId: second[0].folderId, start: 1, limit: MAIL_PAGE_SIZE, unreadOnly: false, search: "" });
    expect(page.messages.map((message) => message.subject)).toEqual(["TEST upit za probnu vožnju"]);
    expect((await source.listMessages(accounts[1], { folderId: first[0].folderId, start: 1, limit: MAIL_PAGE_SIZE, unreadOnly: false, search: "" })).messages).toEqual([]);
  });

  test("only active connections give selectable mailboxes", () => {
    expect(mailAccountOptions(previewMailStatus("spremno").connections).map((option) => option.label)).toEqual(["posta-test@example.invalid", "prodaja-test@example.invalid"]);
    const connections: AdminMailConnectionView[] = [
      { connectionId: "a" as Id<"adminMailConnections">, primaryEmail: "a@example.invalid", status: "active", lastErrorCode: null, connectedAt: 1, accounts: [{ accountId: "1", emailAddress: "a@example.invalid", displayName: null, isDefault: true, signatureText: null }] },
      { connectionId: "b" as Id<"adminMailConnections">, primaryEmail: "b@example.invalid", status: "auth_required", lastErrorCode: "ZOHO_AUTH_REQUIRED", connectedAt: 1, accounts: [{ accountId: "2", emailAddress: "b@example.invalid", displayName: null, isDefault: true, signatureText: null }] },
    ];
    expect(mailAccountOptions(connections).map((option) => option.key)).toEqual(["a:1"]);
  });
});


describe("Pošta sidebar", () => {
  const config = resolveAdminSidebar("/admin/posta");

  async function sidebar(state: SidebarState = {}, search = "") {
    const model = await readyModel();
    const live = mailSidebarLive({
      mailboxes: model.accounts,
      folders: previewFolders.map((folder) => ({ folderId: folder.folderId, label: mailFolderLabel(folder) })),
      folderId: model.folderId,
      search,
      onFolder: noop,
    });
    return { model, markup: renderToStaticMarkup(<AdminSidebarView config={config} live={live} state={state} onPatch={noop} />) };
  }

  test("the registry gives Pošta its own sidebar, on the admin route and in the dev preview", () => {
    expect(config).not.toBe(DEFAULT_SIDEBAR);
    expect(config.id).toBe("posta");
    expect(resolveAdminSidebar("/dev/admin-mail-preview")).toBe(config);
    expect(config.search).toEqual({ key: "q", label: "Pretraga pošte", placeholder: "Pretraži celo sanduče", submit: true });
    expect(config.views?.items.map((item) => item.value)).toEqual(["all", "unread"]);
    expect(config.groups?.map((group) => group.id)).toEqual(["nalog"]);
  });

  test("the folders are an always open list with the open folder marked, in the order of the mailbox", async () => {
    const { markup } = await sidebar();
    const block = markup.slice(markup.indexOf('aria-label="Folderi"'), markup.indexOf('aria-label="Koje poruke"'));
    expect(block).toContain('role="radiogroup"');
    expect([...block.matchAll(/<span class="min-w-0 truncate">([^<]+)<\/span>/g)].map((match) => match[1])).toEqual(["Prijemno", "Poslato", "Nacrti", "TEST Sajam 2026", "Neželjeno", "Otpad"]);
    expect(block.match(/checked=""/g)).toHaveLength(1);
    expect(block).toMatch(/checked=""[^>]*\/><span class="min-w-0 truncate">Prijemno</);
    expect(block).not.toContain("data-admin-filter-toggle");
  });

  test("while a search runs no folder is marked (the search covers the whole mailbox)", async () => {
    const { markup } = await sidebar({ q: "ponuda" }, "ponuda");
    const block = markup.slice(markup.indexOf('aria-label="Folderi"'), markup.indexOf('aria-label="Koje poruke"'));
    expect(block).not.toContain('checked=""');
    expect(markup).toContain("Pretraga pošte: ponuda");
  });

  test("the view: Sve and Nepročitane, the chosen one marked", async () => {
    const all = (await sidebar()).markup;
    const viewsOf = (markup: string) => markup.slice(markup.indexOf('aria-label="Koje poruke"'), markup.indexOf('type="search"'));
    expect(viewsOf(all)).toMatch(/checked=""[^>]*\/><span class="min-w-0 truncate">Sve</);
    expect(viewsOf((await sidebar({ prikaz: "unread" })).markup)).toMatch(/checked=""[^>]*\/><span class="min-w-0 truncate">Nepročitane</);
  });

  test("one search field, written on Enter, and it says so", async () => {
    const { markup } = await sidebar();
    expect(markup.match(/type="search"/g)).toHaveLength(1);
    expect(markup).toContain("Pretraga pošte");
    expect(markup).toContain('placeholder="Pretraži celo sanduče"');
    expect(markup).toMatch(/enterkeyhint="search"/i);
    expect(markup).toContain("Enter pokreće pretragu.");
    expect(markup).toMatch(/aria-describedby="[^"]+-hint"/);
  });

  test("the mailbox is a group that always has a value: the first mailbox until another is chosen, no Sve, only connected mailboxes", async () => {
    const { model, markup } = await sidebar();
    expect(markup).toContain('>Sanduče</span><span class="text-[var(--admin-text-muted)]"> · posta-test@example.invalid</span>');
    expect(markup).toContain(">prodaja-test@example.invalid<");
    expect(markup).not.toContain("stari-test@example.invalid"); // auth_required mailbox is not selectable
    // "Sve" is only the view; the mailbox group has no "any" option
    expect(markup.match(/>Sve<\/span>/g)).toHaveLength(1);
    // the first mailbox is the default: no chip for it
    expect(markup).not.toContain("Sanduče: ");
    const second = (await sidebar({ nalog: model.accounts[1].key })).markup;
    expect(second).toContain('>Sanduče</span><span class="text-[var(--admin-text-muted)]"> · prodaja-test@example.invalid</span>');
    expect(second).toContain("Sanduče: prodaja-test@example.invalid");
  });

  test("without a connected mailbox the group says what to do instead of an empty list", () => {
    const markup = renderToStaticMarkup(<AdminSidebarView config={config} live={{}} state={{}} onPatch={noop} />);
    expect(markup).toContain("Poveži svoje sanduče");
    expect(markup).not.toContain('aria-label="Folderi"');
  });
});

describe("Pošta reveal attributes", () => {
  test("the messages are rows, the opened message is a card, the frame carries no attribute", async () => {
    const markup = render(await readyModel());
    expect(markup).toContain('<ul data-admin-reveal="rows"');
    expect(markup).toMatch(/<section data-admin-primitive="panel" data-admin-reveal="card"[^>]*aria-label="Poruka"/);
    expect(markup).toContain('<p data-admin-reveal="text"');
    expect(markup.match(/<iframe[^>]*>/)?.[0]).not.toContain("data-admin-reveal");
  });
});
