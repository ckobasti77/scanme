import { ConvexError } from "convex/values";
import type { Id } from "@/convex/_generated/dataModel";
import type {
  AdminMailFolder,
  AdminMailListItem,
  AdminMailMessage,
  AdminMailStatus,
} from "@/convex/lib/adminMailContract";
import type { MailSource } from "./use-mail-workspace";

// Admin UX Z1 — TEST data of /dev/admin-mail-preview (never a real mailbox,
// address or message). The HTML message carries a <script>, a remote image, a
// form, an inline handler, a javascript: link and a meta refresh: on screen
// the script line must stay "Skripta nije pokrenuta." and the image blocked.

export type MailPreviewState = "spremno" | "nije-podeseno" | "bez-naloga" | "greska";
export type MailPreviewMessage = "html" | "tekst" | "nijedna";

const CONNECTION_A = "test-posta-veza-a" as Id<"adminMailConnections">;
const CONNECTION_B = "test-posta-veza-b" as Id<"adminMailConnections">;
const CONNECTION_C = "test-posta-veza-c" as Id<"adminMailConnections">;
const ACCOUNT_A = "9000000000101";
const ACCOUNT_B = "9000000000202";
const INBOX = "9000000002014";
const SENT = "9000000002022";
export const PREVIEW_HTML_MESSAGE_ID = "1709887058769100001";
export const PREVIEW_TEXT_MESSAGE_ID = "1709887058769100002";
export const PREVIEW_INBOX_ID = INBOX;

const BASE = Date.parse("2026-10-06T09:40:00+02:00");
const HOUR = 60 * 60 * 1_000;

export const previewFolders: AdminMailFolder[] = [
  { folderId: INBOX, name: "Inbox", type: "Inbox", path: "/Inbox" },
  { folderId: SENT, name: "Sent", type: "Sent", path: "/Sent" },
  { folderId: "9000000002016", name: "Drafts", type: "Drafts", path: "/Drafts" },
  { folderId: "9000000002099", name: "TEST Sajam 2026", type: "NONE", path: "/TEST Sajam 2026" },
  { folderId: "9000000002024", name: "Spam", type: "Spam", path: "/Spam" },
  { folderId: "9000000002026", name: "Trash", type: "Trash", path: "/Trash" },
];

const HTML_BODY = `<meta http-equiv="refresh" content="0;url=https://example.invalid/preusmerenje">
<div style="font-family:Arial,sans-serif;max-width:560px">
<h2 style="margin:0 0 12px">TEST ponuda za štand</h2>
<p>Ovo je TEST poruka koja proverava zaštitu prikaza pošte.</p>
<p><img src="https://images.example.invalid/test-baner.png" alt="TEST udaljena slika" width="480" height="120" style="background:#e9ecef"></p>
<p id="skripta"><strong>Skripta nije pokrenuta.</strong></p>
<script>document.getElementById("skripta").textContent = "UPOZORENJE: skripta je pokrenuta";</script>
<p><a href="https://example.invalid/ponuda" onclick="alert('klik')">Otvori TEST link</a> · <a href="javascript:alert('xss')">TEST javascript link</a></p>
<form action="https://example.invalid/forma" method="post"><input name="ime" placeholder="TEST polje"> <button type="submit">TEST pošalji</button></form>
</div>`;

const TEXT_BODY = "Zdravo,\n\nu prilogu je TEST spisak modela za štand.\nCene i specifikacije stižu posebno.\n\n<b>Ovo nije HTML</b> — prikazuje se kao običan tekst.\n\nTEST Izlagač";

function row(index: number, overrides: Partial<AdminMailListItem> = {}): AdminMailListItem {
  return {
    messageId: `17098870587692${String(index).padStart(5, "0")}`,
    folderId: INBOX,
    threadId: null,
    subject: `TEST poruka ${index}`,
    fromName: `TEST Pošiljalac ${index}`,
    fromAddress: `posiljalac${index}@example.invalid`,
    summary: "TEST isečak poruke za proveru prikaza liste.",
    receivedAt: BASE - (index + 20) * HOUR,
    unread: false,
    hasAttachment: false,
    ...overrides,
  };
}

const inbox: AdminMailListItem[] = [
  row(0, {
    messageId: PREVIEW_HTML_MESSAGE_ID,
    subject: "TEST ponuda za štand (HTML sa slikom i skriptom)",
    fromName: "TEST Izlagač",
    fromAddress: "izlagac@example.invalid",
    summary: "Ovo je TEST poruka koja proverava zaštitu prikaza pošte.",
    receivedAt: BASE,
    unread: true,
  }),
  row(1, {
    messageId: PREVIEW_TEXT_MESSAGE_ID,
    subject: "TEST spisak modela",
    fromName: "TEST Izlagač",
    fromAddress: "izlagac@example.invalid",
    summary: "Zdravo, u prilogu je TEST spisak modela za štand.",
    receivedAt: BASE - 2 * HOUR,
    unread: true,
    hasAttachment: true,
  }),
  ...Array.from({ length: 26 }, (_, index) => row(index + 2)),
];

const sent: AdminMailListItem[] = [
  row(40, { folderId: SENT, subject: "TEST odgovor izlagaču", fromName: "TEST Admin", fromAddress: "posta-test@example.invalid", receivedAt: BASE - HOUR }),
];

const secondMailbox: AdminMailListItem[] = [
  row(60, { subject: "TEST upit za probnu vožnju", fromName: "TEST Kupac", unread: true, receivedAt: BASE - 3 * HOUR }),
];

function detail(item: AdminMailListItem): AdminMailMessage {
  const html = item.messageId === PREVIEW_HTML_MESSAGE_ID;
  const text = item.messageId === PREVIEW_TEXT_MESSAGE_ID;
  return {
    messageId: item.messageId,
    folderId: item.folderId,
    subject: item.subject,
    from: { name: item.fromName, address: item.fromAddress },
    to: [{ name: "TEST Admin", address: "posta-test@example.invalid" }],
    cc: text ? [{ name: null, address: "kopija@example.invalid" }] : [],
    receivedAt: item.receivedAt,
    unread: item.unread,
    body: html
      ? { kind: "html", content: HTML_BODY }
      : { kind: "text", content: text ? TEXT_BODY : `${item.summary}\n\nTEST` },
    attachments: text
      ? [
          { attachmentId: "138907275303090130", fileName: "TEST spisak modela.pdf", size: 184_320, inline: false },
          { attachmentId: "138907275303090131", fileName: "TEST alat.exe", size: 12_288, inline: false },
        ]
      : [],
  };
}

export function previewMailStatus(state: MailPreviewState): AdminMailStatus {
  if (state === "nije-podeseno") return { enabled: false, configured: false, connections: [] };
  if (state === "bez-naloga") return { enabled: true, configured: true, connections: [] };
  return {
    enabled: true,
    configured: true,
    connections: [
      {
        connectionId: CONNECTION_A,
        primaryEmail: "posta-test@example.invalid",
        status: "active",
        lastErrorCode: null,
        connectedAt: BASE - 48 * HOUR,
        accounts: [{ accountId: ACCOUNT_A, emailAddress: "posta-test@example.invalid", displayName: "TEST Pošta", isDefault: true }],
      },
      {
        connectionId: CONNECTION_B,
        primaryEmail: "prodaja-test@example.invalid",
        status: "active",
        lastErrorCode: null,
        connectedAt: BASE - 24 * HOUR,
        accounts: [{ accountId: ACCOUNT_B, emailAddress: "prodaja-test@example.invalid", displayName: "TEST Prodaja", isDefault: true }],
      },
      {
        connectionId: CONNECTION_C,
        primaryEmail: "stari-test@example.invalid",
        status: "auth_required",
        lastErrorCode: "ZOHO_AUTH_REQUIRED",
        connectedAt: BASE - 96 * HOUR,
        accounts: [{ accountId: "9000000000303", emailAddress: "stari-test@example.invalid", displayName: null, isDefault: true }],
      },
    ],
  };
}

export function previewMailSource(state: MailPreviewState): MailSource {
  const rowsOf = (accountId: string, folderId: string) =>
    accountId === ACCOUNT_B ? (folderId === INBOX ? secondMailbox : []) : folderId === INBOX ? inbox : folderId === SENT ? sent : [];
  const everything = [...inbox, ...sent, ...secondMailbox];
  return {
    listFolders: async () => previewFolders,
    listMessages: async (account, args) => {
      if (state === "greska") throw new ConvexError({ code: "ZOHO_RATE_LIMITED", retryAfterSeconds: 30 });
      const query = args.search.toLocaleLowerCase("sr-Latn");
      let rows = query
        ? everything.filter((item) => `${item.subject} ${item.fromName} ${item.summary}`.toLocaleLowerCase("sr-Latn").includes(query))
        : rowsOf(account.accountId, args.folderId);
      if (args.unreadOnly) rows = rows.filter((item) => item.unread);
      const from = args.start - 1;
      return { messages: rows.slice(from, from + args.limit), hasMore: rows.length > from + args.limit };
    },
    getMessage: async (_account, args) => {
      const item = everything.find((candidate) => candidate.messageId === args.messageId);
      if (!item) throw new ConvexError({ code: "ZOHO_REQUEST_REJECTED" });
      return detail(item);
    },
    markRead: async () => {},
    downloadAttachment: async (_account, args) => {
      // Preview: the .exe shows the type policy; the rest has no live download.
      throw new ConvexError({ code: args.attachmentId === "138907275303090131" ? "ZOHO_ATTACHMENT_BLOCKED" : "ZOHO_NOT_CONFIGURED" });
    },
    connect: async () => {},
    disconnect: async () => {},
  };
}

export function previewInitialMessage(message: MailPreviewMessage) {
  if (message === "nijedna") return null;
  return { folderId: INBOX, messageId: message === "tekst" ? PREVIEW_TEXT_MESSAGE_ID : PREVIEW_HTML_MESSAGE_ID };
}
