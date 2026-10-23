import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import type { AdminMailConnectionView, AdminMailMessage } from "@/convex/lib/adminMailContract";
import { MailHtmlFrame } from "./mail-html-frame";
import { blockRemoteMailImages, buildMailSrcDoc, MAIL_FRAME_SANDBOX, mailContentSecurityPolicy, mailHasRemoteImages, stripActiveMailContent } from "./mail-srcdoc";
import { AdminMailView } from "./mail-view";
import { mailCallbackNotice } from "./mail-format";
import { previewFolders, previewMailSource, previewMailStatus, PREVIEW_HTML_MESSAGE_ID, PREVIEW_INBOX_ID } from "./mail-fixtures";
import { mailAccountOptions, MAIL_PAGE_SIZE, type MailViewActions, type MailViewModel } from "./use-mail-workspace";

// Admin UX Z1 — Pošta view (SSR markup) and the HTML message frame: sandbox
// without scripts, CSP meta first, remote images blocked until "Prikaži slike",
// active content stripped, plain text escaped. TEST data only.

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
  connect: noop, disconnect: noop, dismissNotice: noop, selectAccount: noop, selectFolder: noop, setFilter: noop, setSearchDraft: noop,
  submitSearch: noop, clearSearch: noop, goToStart: noop, retryFolders: noop, retryList: noop, selectMessage: noop, closeMessage: noop,
  retryMessage: noop, showImages: noop, markRead: noop, download: noop, compose: noop, openSignature: noop, openSentFolder: noop,
};

async function readyModel(overrides: Partial<MailViewModel> = {}): Promise<MailViewModel> {
  const status = previewMailStatus("spremno");
  const accounts = mailAccountOptions(status.connections);
  const source = previewMailSource("spremno");
  const page = await source.listMessages(accounts[0], { folderId: PREVIEW_INBOX_ID, start: 1, limit: MAIL_PAGE_SIZE, unreadOnly: false, search: "" });
  const message = await source.getMessage(accounts[0], { folderId: PREVIEW_INBOX_ID, messageId: PREVIEW_HTML_MESSAGE_ID });
  return {
    mode: "ready", notice: null, connections: status.connections, busyConnect: false, busyConnectionId: null, accounts, accountKey: accounts[0].key,
    folders: { status: "ready", data: previewFolders }, folderId: PREVIEW_INBOX_ID, filter: "all", searchDraft: "", search: "", start: 1,
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
      folders: { status: "idle" }, folderId: null, filter: "all", searchDraft: "", search: "", start: 1, pageSize: MAIL_PAGE_SIZE,
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

  test("ready: three panes, mailbox picker, folders, list with unread marker and attachment clip, sandboxed HTML message with images blocked", async () => {
    const markup = render(await readyModel());
    expect(markup).toContain('aria-label="Folderi"');
    expect(markup).toContain('aria-label="Poruke"');
    expect(markup).toContain('aria-label="Poruka"');
    expect(markup).toContain("<select");
    expect(markup).toContain(">prodaja-test@example.invalid</option>");
    expect(markup).not.toContain("stari-test@example.invalid</option>"); // auth_required mailbox is not selectable
    expect(markup).toContain("Treba ponovo povezati");
    expect(markup).toContain("Ponovo poveži");
    expect(markup).toContain("Prijemno");
    expect(markup).toContain("Poslato");
    expect(markup).toContain('<span class="sr-only">Nepročitano</span>');
    expect(markup).toContain('aria-label="Ima prilog"');
    expect(markup).toContain('aria-pressed="true"');
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

  test("empty folder, empty unread filter and empty search have their own text", async () => {
    const model = await readyModel({ selected: null, list: { status: "ready", data: { messages: [], hasMore: false } } });
    expect(render(model)).toContain("Folder je prazan");
    expect(render({ ...model, filter: "unread" })).toContain("Nema nepročitanih poruka u ovom folderu.");
    expect(render({ ...model, search: "ponuda" })).toContain("Nema rezultata");
    expect(render({ ...model, search: "ponuda" })).toContain("Rezultati u celom sanduku za „ponuda“");
  });

  test("callback notice: connected, a known error code, anything else is generic", () => {
    expect(mailCallbackNotice("povezano", undefined)).toEqual({ tone: "success", text: "Zoho nalog je povezan." });
    expect(mailCallbackNotice("greska", "ZOHO_STATE_INVALID")?.text).toBe("Povezivanje je isteklo ili je već iskorišćeno. Pokreni ga ponovo.");
    expect(mailCallbackNotice("greska", "<script>")?.text).toBe("Akcija nije uspela.");
    expect(mailCallbackNotice(undefined, undefined)).toBeNull();
  });

  test("only active connections give selectable mailboxes", () => {
    const connections: AdminMailConnectionView[] = [
      { connectionId: "a" as Id<"adminMailConnections">, primaryEmail: "a@example.invalid", status: "active", lastErrorCode: null, connectedAt: 1, accounts: [{ accountId: "1", emailAddress: "a@example.invalid", displayName: null, isDefault: true, signatureText: null }] },
      { connectionId: "b" as Id<"adminMailConnections">, primaryEmail: "b@example.invalid", status: "auth_required", lastErrorCode: "ZOHO_AUTH_REQUIRED", connectedAt: 1, accounts: [{ accountId: "2", emailAddress: "b@example.invalid", displayName: null, isDefault: true, signatureText: null }] },
    ];
    expect(mailAccountOptions(connections).map((option) => option.key)).toEqual(["a:1"]);
  });
});
