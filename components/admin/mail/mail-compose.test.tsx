import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import type { AdminMailMessage } from "@/convex/lib/adminMailContract";
import {
  applyBold,
  applyLink,
  attachmentProblem,
  composeReadiness,
  initialComposeDraft,
  mailDraftKey,
  newSendCommandId,
  readMailDraft,
  renderComposePreview,
  splitRecipientInput,
  writeMailDraft,
  type MailComposeAttachment,
  type MailComposeDraft,
} from "./compose-logic";
import { MailComposeView } from "./mail-compose";
import { MailSignatureView } from "./mail-signature";
import { AdminMailView } from "./mail-view";
import { previewMailStatus } from "./mail-fixtures";
import type { MailComposeActions, MailComposeModel, MailSignatureActions } from "./use-mail-compose";
import { mailAccountOptions, MAIL_PAGE_SIZE, type MailViewActions, type MailViewModel } from "./use-mail-workspace";

// Admin UX Z2 — compose window: first draft of reply/forward, local text
// draft, recipient chips, editor markup, attachment limits, the preview in the
// ScanMe template and the SSR markup of the compose and signature views.

const ORIGINAL: AdminMailMessage = {
  messageId: "1709887058769100001",
  folderId: "9000000002014",
  subject: "TEST ponuda",
  from: { name: "TEST Izlagač", address: "izlagac@example.invalid" },
  to: [{ name: null, address: "posta-test@example.invalid" }, { name: null, address: "kolega@example.invalid" }],
  cc: [{ name: null, address: "kopija@example.invalid" }],
  receivedAt: Date.parse("2026-10-06T07:40:00Z"),
  unread: false,
  body: { kind: "html", content: "<p>Cena je <b>na upit</b>.</p><script>alert(1)</script>" },
  attachments: [{ attachmentId: "1", fileName: "TEST spisak.pdf", size: 1024, inline: false }],
};
const OWN = ["posta-test@example.invalid"];

function memoryStorage(fail = false) {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => {
      if (fail) throw new Error("blocked");
      return data.get(key) ?? null;
    },
    setItem: (key: string, value: string) => {
      if (fail) throw new Error("full");
      data.set(key, value);
    },
    removeItem: (key: string) => {
      if (fail) throw new Error("blocked");
      data.delete(key);
    },
  };
}

const attachment = (overrides: Partial<MailComposeAttachment> = {}): MailComposeAttachment => ({
  localId: "a", fileName: "TEST.pdf", size: 1024, progress: 1, status: "ready", uploadId: "u1" as Id<"adminMailUploads">, errorCode: null, ...overrides,
});

describe("compose logic", () => {
  test("first draft: reply to the sender with Re:, reply-all adds To/Cc without own addresses, forward with Fwd: and no recipients", () => {
    expect(initialComposeDraft("reply", ORIGINAL, OWN)).toEqual({ to: ["izlagac@example.invalid"], cc: [], bcc: [], subject: "Re: TEST ponuda", body: "", showCc: false, showBcc: false });
    expect(initialComposeDraft("reply_all", ORIGINAL, OWN)).toMatchObject({ to: ["izlagac@example.invalid", "kolega@example.invalid"], cc: ["kopija@example.invalid"], showCc: true });
    expect(initialComposeDraft("forward", ORIGINAL, OWN)).toMatchObject({ to: [], cc: [], subject: "Fwd: TEST ponuda" });
    expect(initialComposeDraft("new", null, OWN)).toMatchObject({ to: [], subject: "" });
  });

  test("local draft: text only, per mailbox/mode/message, survives a broken storage without throwing", () => {
    const storage = memoryStorage();
    const key = mailDraftKey("veza:9000", "reply", ORIGINAL.messageId);
    expect(key).toBe("scanme-admin-mail-draft:v1:veza:9000:reply:1709887058769100001");
    const draft: MailComposeDraft = { to: ["a@example.invalid"], cc: [], bcc: ["b@example.invalid"], subject: "TEST", body: "Tekst", showCc: false, showBcc: true };
    writeMailDraft(storage, key, draft);
    expect(JSON.parse(storage.data.get(key)!)).toEqual({ to: ["a@example.invalid"], cc: [], bcc: ["b@example.invalid"], subject: "TEST", body: "Tekst" });
    expect(readMailDraft(storage, key)).toEqual({ to: ["a@example.invalid"], cc: [], bcc: ["b@example.invalid"], subject: "TEST", body: "Tekst" });
    writeMailDraft(storage, key, { ...draft, to: [], bcc: [], body: "  " });
    expect(storage.data.has(key)).toBe(false);
    storage.data.set(key, "{neispravno");
    expect(readMailDraft(storage, key)).toBeNull();
    storage.data.set(key, JSON.stringify({ to: "x", cc: [], bcc: [], subject: "", body: "" }));
    expect(readMailDraft(storage, key)).toBeNull();
    const broken = memoryStorage(true);
    expect(() => writeMailDraft(broken, key, draft)).not.toThrow();
    expect(readMailDraft(broken, key)).toBeNull();
    expect(readMailDraft(null, key)).toBeNull();
  });

  test("recipient input: commas, semicolons, lines and spaces split; a display name stays together", () => {
    expect(splitRecipientInput("a@example.invalid, b@example.invalid;c@example.invalid\nd@example.invalid e@example.invalid")).toEqual([
      "a@example.invalid", "b@example.invalid", "c@example.invalid", "d@example.invalid", "e@example.invalid",
    ]);
    expect(splitRecipientInput("Ana Petrović <ana@example.invalid>, ,")).toEqual(["Ana Petrović <ana@example.invalid>"]);
  });

  test("editor markup: bold around the selection (or a placeholder), link with the selection as label", () => {
    expect(applyBold("ovo je važno", 7, 12, "tekst")).toEqual({ text: "ovo je **važno**", selectionStart: 9, selectionEnd: 14 });
    expect(applyBold("x", 1, 1, "tekst")).toEqual({ text: "x**tekst**", selectionStart: 3, selectionEnd: 8 });
    expect(applyLink("vidi sajt", 5, 9, "https://www.scanme.rs")).toEqual({ text: "vidi [sajt](https://www.scanme.rs)", selectionStart: 34, selectionEnd: 34 });
    expect(applyLink("", 0, 0, "https://www.scanme.rs").text).toBe("[https://www.scanme.rs](https://www.scanme.rs)");
  });

  test("attachments: allowed type, ≤ 10 MB per file, ≤ 10 files and ≤ 20 MB per message (forwarded originals count)", () => {
    expect(attachmentProblem({ name: "TEST.pdf", size: 1024 }, [], 0, 0)).toBeNull();
    expect(attachmentProblem({ name: "TEST.exe", size: 1024 }, [], 0, 0)).toBe("ZOHO_ATTACHMENT_BLOCKED");
    expect(attachmentProblem({ name: "TEST.pdf", size: 10 * 1024 * 1024 + 1 }, [], 0, 0)).toBe("ZOHO_ATTACHMENT_BLOCKED");
    expect(attachmentProblem({ name: "TEST.pdf", size: 0 }, [], 0, 0)).toBe("ZOHO_ATTACHMENT_BLOCKED");
    const nine = Array.from({ length: 9 }, (_, index) => attachment({ localId: String(index) }));
    expect(attachmentProblem({ name: "TEST.pdf", size: 1 }, nine, 0, 0)).toBeNull();
    expect(attachmentProblem({ name: "TEST.pdf", size: 1 }, nine, 0, 1)).toBe("ZOHO_ATTACHMENT_BLOCKED");
    expect(attachmentProblem({ name: "TEST.pdf", size: 6 * 1024 * 1024 }, [attachment({ size: 9 * 1024 * 1024 })], 6 * 1024 * 1024, 1)).toBe("ZOHO_ATTACHMENT_BLOCKED");
    // a failed upload does not count
    expect(attachmentProblem({ name: "TEST.pdf", size: 1 }, [...nine, attachment({ status: "error" })], 0, 0)).toBeNull();
  });

  test("readiness: recipients checked, subject required for a new message, sending waits for uploads", () => {
    const draft = initialComposeDraft("new", null, OWN);
    expect(composeReadiness("new", draft, [])).toEqual({ recipients: { ok: false, reason: "missing_to", invalid: [] }, subjectMissing: true, uploading: false });
    expect(composeReadiness("new", { ...draft, to: ["los"], subject: "TEST" }, []).recipients).toEqual({ ok: false, reason: "invalid", invalid: ["los"] });
    expect(composeReadiness("reply", { ...draft, to: ["a@example.invalid"] }, [attachment({ status: "uploading" })])).toMatchObject({ subjectMissing: false, uploading: true });
  });

  test("preview: the same ScanMe template with signature and the escaped quote; Re: when the subject is empty", () => {
    const preview = renderComposePreview({
      mode: "reply",
      draft: { ...initialComposeDraft("reply", ORIGINAL, OWN), subject: "", body: "**Hvala** <b>x</b>" },
      source: ORIGINAL,
      signatureText: "TEST Admin",
    });
    expect(preview.subject).toBe("Re: TEST ponuda");
    expect(preview.html).toContain("<strong>Hvala</strong> &lt;b&gt;x&lt;/b&gt;");
    expect(preview.html).toContain(">TEST Admin</div>");
    expect(preview.html).toMatch(/<blockquote[^>]*>Cena je na upit\.<\/blockquote>/);
    expect(preview.html).not.toContain("<script");
    expect(preview.text).toContain("> Cena je na upit.");
  });

  test("every attempt gets a new id the server accepts", () => {
    const first = newSendCommandId();
    expect(first).toMatch(/^[A-Za-z0-9_-]{16,80}$/);
    expect(newSendCommandId()).not.toBe(first);
  });
});

const noop = () => {};
const composeActions: MailComposeActions = {
  setAccount: noop, updateDraft: noop, addRecipients: noop, removeRecipient: noop, addFiles: noop, removeAttachment: noop, toggleForward: noop,
  setTab: noop, send: noop, close: noop, discard: noop, suggest: async () => [],
};

function composeModel(overrides: Partial<MailComposeModel["state"]> = {}): MailComposeModel {
  const accounts = mailAccountOptions(previewMailStatus("spremno").connections);
  const draft = { ...initialComposeDraft("reply_all", ORIGINAL, OWN), body: "Zdravo **TEST**", to: ["izlagac@example.invalid", "nije adresa"] };
  const state = {
    mode: "reply_all" as const,
    accountKey: accounts[0].key,
    source: { folderId: ORIGINAL.folderId, messageId: ORIGINAL.messageId, message: ORIGINAL },
    draft,
    attachments: [attachment({ fileName: "TEST spisak.pdf" }), attachment({ localId: "b", fileName: "TEST katalog.pdf", status: "uploading", progress: 0.62, uploadId: null }), attachment({ localId: "c", fileName: "TEST.exe", status: "error", errorCode: "ZOHO_ATTACHMENT_BLOCKED" })],
    forwardIds: [],
    tab: "write" as const,
    sending: false,
    outcome: null,
    problem: null,
    draftKey: "k",
    ...overrides,
  };
  return {
    state,
    accounts,
    account: accounts[0],
    readiness: composeReadiness(state.mode, state.draft, state.attachments),
    preview: renderComposePreview({ mode: state.mode, draft: state.draft, source: ORIGINAL, signatureText: accounts[0].signatureText }),
  };
}

describe("compose view (SSR)", () => {
  test("write tab: mailbox picker, recipient chips with remove buttons and an invalid chip, subject, toolbar, attachments with progress", () => {
    const markup = renderToStaticMarkup(<MailComposeView model={composeModel()} actions={composeActions} />);
    expect(markup).toContain('role="tablist"');
    expect(markup).toMatch(/role="tab"[^>]*aria-selected="true"[^>]*>Pisanje</);
    expect(markup).toContain("<select");
    expect(markup).toContain('aria-label="Ukloni izlagac@example.invalid"');
    expect(markup).toContain('data-invalid="true"');
    expect(markup).toContain("Neispravna adresa: nije adresa");
    expect(markup).toContain('role="combobox"');
    expect(markup).toContain('aria-autocomplete="list"');
    expect(markup).toContain('role="toolbar" aria-label="Oblikovanje teksta"');
    expect(markup).toContain(">Dodaj Bcc<");
    expect(markup).toContain('role="progressbar" aria-label="Otpremanje TEST katalog.pdf: 62%" aria-valuemin="0" aria-valuemax="100" aria-valuenow="62"');
    expect(markup).toContain("Prilog nije otpremljen");
    expect(markup).toContain('aria-label="Ukloni prilog TEST spisak.pdf"');
    expect(markup).toContain("Potpis sanduka se dodaje automatski.");
    expect(markup).toContain("Prethodna poruka se citira ispod potpisa.");
    expect(markup).toContain(">Pošalji<");
    expect(markup).not.toContain("<iframe");
  });

  test("preview tab: the ScanMe template in the sandboxed frame and the text version", () => {
    const markup = renderToStaticMarkup(<MailComposeView model={composeModel({ tab: "preview" })} actions={composeActions} />);
    expect(markup).toMatch(/role="tab"[^>]*aria-selected="true"[^>]*>Pregled pisma</);
    expect(markup).toContain('sandbox="allow-popups allow-popups-to-escape-sandbox"');
    expect(markup).toContain("Tekst verzija");
    expect(markup).toContain("Scan&lt;/span&gt;&lt;span"); // the template wordmark inside srcdoc (escaped attribute)
  });

  test("forward lists the original attachments to take along; an uncertain outcome warns and asks for a new attempt", () => {
    const forward = renderToStaticMarkup(<MailComposeView model={composeModel({ mode: "forward", forwardIds: ["1"] })} actions={composeActions} />);
    expect(forward).toContain("Prilozi originalne poruke");
    expect(forward).toMatch(/type="checkbox"[^>]*checked=""/);
    expect(forward).toContain("Originalna poruka ide ispod potpisa.");
    const uncertain = renderToStaticMarkup(
      <MailComposeView model={composeModel({ outcome: { kind: "uncertain", failure: { code: "ZOHO_SEND_UNCERTAIN", retryAfterSeconds: null } } })} actions={composeActions} />,
    );
    expect(uncertain).toContain('role="alert"');
    expect(uncertain).toContain("Nije sigurno da li je pismo poslato. Proveri folder Poslato pre novog slanja.");
    expect(uncertain).toContain(">Pošalji kao novi pokušaj<");
    const failed = renderToStaticMarkup(
      <MailComposeView model={composeModel({ outcome: { kind: "failed", failure: { code: "ZOHO_RECIPIENT_INVALID", retryAfterSeconds: null } } })} actions={composeActions} />,
    );
    expect(failed).toContain("Neka adresa primaoca nije ispravna ili ih je previše.");
  });

  test("signature view: textarea for the mailbox and the preview in the template", () => {
    const accounts = mailAccountOptions(previewMailStatus("spremno").connections);
    const signatureActions: MailSignatureActions = { selectAccount: noop, setText: noop, save: noop, close: noop };
    const markup = renderToStaticMarkup(<MailSignatureView model={{ accounts, accountKey: accounts[0].key, text: "TEST Admin\n[sajt](https://www.scanme.rs)", saving: false }} actions={signatureActions} />);
    expect(markup).toContain("Potpis za posta-test@example.invalid");
    expect(markup).toContain("Pregled potpisa u šablonu");
    expect(markup).toContain("<iframe");
    expect(markup).toContain(">Sačuvaj potpis<");
  });
});

describe("Pošta view — Z2 entry points", () => {
  test("header: new message and signature; reader: reply, reply all, forward; notice: open Sent", async () => {
    const status = previewMailStatus("spremno");
    const accounts = mailAccountOptions(status.connections);
    const viewActions: MailViewActions = {
      connect: noop, disconnect: noop, dismissNotice: noop, selectAccount: noop, selectFolder: noop, setFilter: noop, setSearchDraft: noop,
      submitSearch: noop, clearSearch: noop, goToStart: noop, retryFolders: noop, retryList: noop, selectMessage: noop, closeMessage: noop,
      retryMessage: noop, showImages: noop, markRead: noop, download: noop, compose: noop, openSignature: noop, openSentFolder: noop,
    };
    const model: MailViewModel = {
      mode: "ready", notice: { tone: "success", text: "Pismo je poslato.", action: "openSent" }, connections: status.connections, busyConnect: false,
      busyConnectionId: null, accounts, accountKey: accounts[0].key, folders: { status: "ready", data: [] }, folderId: null, filter: "all", searchDraft: "",
      search: "", start: 1, pageSize: MAIL_PAGE_SIZE, list: { status: "ready", data: { messages: [], hasMore: false } },
      selected: { folderId: ORIGINAL.folderId, messageId: ORIGINAL.messageId }, message: { status: "ready", data: ORIGINAL }, readIds: new Set(),
      showImages: false, markingRead: false, downloadingId: null, readerFailure: null, now: Date.parse("2026-10-06T10:00:00+02:00"),
    };
    const markup = renderToStaticMarkup(<AdminMailView model={model} actions={viewActions} />);
    expect(markup).toContain(">Novo pismo<");
    expect(markup).toContain(">Potpis<");
    expect(markup).toContain('role="group" aria-label="Akcije poruke"');
    for (const label of [">Odgovori<", ">Odgovori svima<", ">Prosledi<", ">Otvori Poslato<"]) expect(markup).toContain(label);
  });
});
