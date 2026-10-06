import { fmt } from "../../lib/i18n/format";
import { postaSr as dict } from "../../lib/i18n/sr/posta";
import type { ScanMeEmailQuote } from "../../lib/email-template/scanme-email";
import {
  ADMIN_MAIL_MAX_RECIPIENTS,
  type AdminMailComposeMode,
  type AdminMailMessage,
} from "./adminMailContract";

// Admin UX Z2 — pure rules of writing in Pošta, shared by the send action
// (convex/adminMail.ts) and the compose window: recipient validation, the
// Re:/Fwd: subject, reply / reply-all recipients and the quote of the
// original message (as escaped plain text in the ScanMe template).

const LOCAL_PART = "[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*";
const DOMAIN = "(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\\.)+[A-Za-z]{2,63}";
const EMAIL = new RegExp(`^${LOCAL_PART}@${DOMAIN}$`);
const QUOTE_MAX_LENGTH = 20_000;

/** `Ana <ana@x.rs>` or `ana@x.rs` → `ana@x.rs` (lower case), or null when it is not one valid address. */
export function normalizeRecipient(raw: string): string | null {
  const value = raw.trim();
  const bracketed = value.match(/<([^<>]+)>\s*$/);
  const address = (bracketed ? bracketed[1] : value).trim().toLowerCase();
  return address.length <= 254 && EMAIL.test(address) ? address : null;
}

export type RecipientCheck =
  | { ok: true; to: string[]; cc: string[]; bcc: string[] }
  | { ok: false; reason: "invalid" | "missing_to" | "too_many"; invalid: string[] };

/** Every address valid, at least one in To, at most 50 in total; duplicates are dropped (To wins, then Cc). */
export function checkRecipients(input: { to: string[]; cc: string[]; bcc: string[] }): RecipientCheck {
  const invalid: string[] = [];
  const seen = new Set<string>();
  const result: { to: string[]; cc: string[]; bcc: string[] } = { to: [], cc: [], bcc: [] };
  for (const field of ["to", "cc", "bcc"] as const) {
    for (const raw of input[field]) {
      if (!raw.trim()) continue;
      const address = normalizeRecipient(raw);
      if (!address) {
        invalid.push(raw.trim());
        continue;
      }
      if (seen.has(address)) continue;
      seen.add(address);
      result[field].push(address);
    }
  }
  if (invalid.length > 0) return { ok: false, reason: "invalid", invalid };
  if (result.to.length === 0) return { ok: false, reason: "missing_to", invalid: [] };
  if (seen.size > ADMIN_MAIL_MAX_RECIPIENTS) return { ok: false, reason: "too_many", invalid: [] };
  return { ok: true, ...result };
}

/** "Re: …" for a reply, "Fwd: …" for a forward; an existing prefix is not doubled. */
export function composeSubject(mode: AdminMailComposeMode, original: string) {
  const subject = original.replace(/\s+/g, " ").trim();
  if (mode === "reply" || mode === "reply_all") {
    return /^(re|odg|aw|sv)\s*:/i.test(subject) ? subject : `${dict.email.replyPrefix} ${subject}`.trim();
  }
  if (mode === "forward") {
    return /^(fwd?|tr|wg)\s*:/i.test(subject) ? subject : `${dict.email.forwardPrefix} ${subject}`.trim();
  }
  return subject;
}

/** Who a reply goes to: the sender (or, for an own sent message, its recipients); reply-all adds To and Cc without the own addresses. */
export function replyRecipients(
  message: Pick<AdminMailMessage, "from" | "to" | "cc">,
  mode: AdminMailComposeMode,
  ownAddresses: string[],
): { to: string[]; cc: string[] } {
  if (mode !== "reply" && mode !== "reply_all") return { to: [], cc: [] };
  const own = new Set(ownAddresses.map((address) => address.toLowerCase()));
  const unique = (addresses: string[], exclude: Set<string>) => {
    const out: string[] = [];
    for (const raw of addresses) {
      const address = raw.toLowerCase();
      if (own.has(address) || exclude.has(address) || out.includes(address)) continue;
      out.push(address);
    }
    return out;
  };
  const sender = message.from?.address.toLowerCase();
  const fromOwn = sender ? own.has(sender) : true;
  const primary = fromOwn ? message.to.map((item) => item.address) : [sender!];
  if (mode === "reply") return { to: unique(primary, new Set()), cc: [] };
  const to = unique([...primary, ...message.to.map((item) => item.address)], new Set());
  return { to, cc: unique(message.cc.map((item) => item.address), new Set(to)) };
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** Readable text of an HTML message for a quote (never its HTML). */
export function htmlToQuoteText(html: string) {
  return html
    .replace(/<(script|style|head|title)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "\n• ")
    .replace(/<\/li\s*>/gi, "")
    .replace(/<\/(p|h[1-6]|blockquote|table|ul|ol)\s*>/gi, "\n\n")
    .replace(/<\/(div|tr)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
      if (entity[0] === "#") {
        const code = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
      }
      return ENTITIES[entity.toLowerCase()] ?? match;
    })
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const QUOTE_DATE = new Intl.DateTimeFormat("sr-Latn-RS", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Belgrade" });

function addressText(address: { name: string | null; address: string }) {
  return address.name ? `${address.name} <${address.address}>` : address.address;
}

/** The quote of a reply ("… piše:" + > lines) or the forwarded block, as plain text. */
export function buildMailQuote(
  mode: AdminMailComposeMode,
  message: Pick<AdminMailMessage, "from" | "to" | "cc" | "subject" | "receivedAt" | "body">,
): ScanMeEmailQuote | null {
  if (mode === "new") return null;
  const text = (message.body.kind === "html" ? htmlToQuoteText(message.body.content) : message.body.content.trim()).slice(0, QUOTE_MAX_LENGTH);
  const date = message.receivedAt ? QUOTE_DATE.format(message.receivedAt) : "";
  const sender = message.from ? addressText(message.from) : dict.unknownSender;
  if (mode === "forward") {
    const lines = [
      { label: dict.email.forwardFrom, value: sender },
      ...(date ? [{ label: dict.email.forwardDate, value: date }] : []),
      { label: dict.email.forwardSubject, value: message.subject || dict.noSubject },
      ...(message.to.length > 0 ? [{ label: dict.email.forwardTo, value: message.to.map(addressText).join(", ") }] : []),
      ...(message.cc.length > 0 ? [{ label: dict.email.forwardCc, value: message.cc.map(addressText).join(", ") }] : []),
    ];
    return { kind: "forward", header: dict.email.forwardHeader, lines, text };
  }
  return { kind: "reply", header: fmt(dict.email.replyHeader, { date, sender }).replace(/^, /, ""), text };
}
