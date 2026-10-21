// ScanMe Menu V1 (K26) — the reply to a guest about a reservation (master
// §11.4; plan docs/meni/planovi/K24.md §3.4, K24-19). Pure: the same code
// fills the sheet "Obavesti gosta" in the waiter panel, the preview of the
// templates in Podešavanja and the izlog.
//
// - Three kinds have a template the venue can edit (accept, decline,
//   propose); "other" starts from a greeting and the signature only.
// - A missing template row means the default text of the `menu-odgovor`
//   dictionary. The signature is one for the whole venue; without one it is
//   "Srdačno, <venue>".
// - fillTemplate replaces the known placeholders in ONE pass, so a guest's
//   name that contains "{potpis}" is never expanded again; an unknown
//   placeholder stays as typed. Empty values leave no run of blank lines.

import { fmt, srPluralCategory } from "../i18n/format";
import { menuDomenSr } from "../i18n/sr/menu-domen";
import { menuOdgovorSr } from "../i18n/sr/menu-odgovor";
import { belgradeParts } from "../belgrade-time";
import { hasLineBreak } from "./mail/mime";
import type { MenuReservationStatus } from "./reservation-status";

export const REPLY_KINDS = ["accept", "decline", "propose", "other"] as const;
export type ReplyKind = (typeof REPLY_KINDS)[number];

export const TEMPLATE_KINDS = ["accept", "decline", "propose"] as const;
export type TemplateKind = (typeof TEMPLATE_KINDS)[number];

export const REPLY_SUBJECT_MAX = 150;
export const REPLY_BODY_MAX = 4000;
export const REPLY_SIGNATURE_MAX = 500;

export const REPLY_PLACEHOLDERS = [
  "ime",
  "lokal",
  "datum",
  "vreme",
  "brojGostiju",
  "predlozenoVreme",
  "poruka",
  "potpis",
] as const;
export type ReplyPlaceholder = (typeof REPLY_PLACEHOLDERS)[number];

export type ReplyTemplate = { subject: string; body: string };
export type StoredTemplates = Partial<Record<TemplateKind, ReplyTemplate>>;

/** What a reply says about the reservation (the guest's own data, the venue's name). */
export type ReplyFacts = {
  guestName: string;
  venueName: string;
  requestedAt: number;
  partySize: number;
  proposedAt: number | null;
  proposalNote: string | null;
};

const o = menuOdgovorSr;

export function isReplyKind(value: unknown): value is ReplyKind {
  return typeof value === "string" && (REPLY_KINDS as readonly string[]).includes(value);
}

export function isTemplateKind(value: unknown): value is TemplateKind {
  return typeof value === "string" && (TEMPLATE_KINDS as readonly string[]).includes(value);
}

export function defaultTemplate(kind: ReplyKind): ReplyTemplate {
  const template = o.podrazumevano[kind];
  return { subject: template.subject, body: template.body };
}

/** The venue's template of a kind, else the default; `custom` says which. */
export function templateFor(kind: ReplyKind, stored: StoredTemplates): { template: ReplyTemplate; custom: boolean } {
  const own = kind === "other" ? undefined : stored[kind];
  return own ? { template: { subject: own.subject, body: own.body }, custom: true } : { template: defaultTemplate(kind), custom: false };
}

/** The kind the sheet opens with: the template of the decision just made. */
export function replyKindForStatus(status: MenuReservationStatus): ReplyKind {
  if (status === "accepted" || status === "arrived") return "accept";
  if (status === "declined") return "decline";
  if (status === "change_proposed") return "propose";
  return "other";
}

/** The venue's signature, or "Srdačno,\n<venue>". */
export function signatureOf(stored: string | null | undefined, venueName: string): string {
  const own = stored?.trim();
  return own ? own : fmt(o.podrazumevano.potpis, { lokal: venueName });
}

/** "četvrtak, 22. 10. 2026." in Belgrade time. */
export function replyDate(epoch: number): string {
  const { year, month, day } = belgradeParts(epoch);
  const weekday = (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
  return `${menuDomenSr.weekdays[weekday].toLowerCase()}, ${day}. ${month}. ${year}.`;
}

/** "19:00" in Belgrade time. */
export function replyTime(epoch: number): string {
  const { hour, minute } = belgradeParts(epoch);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** "4 osobe" in a sentence ("za 4 osobe"). */
export function replyGuests(partySize: number): string {
  return fmt(o.podrazumevano.gostiju[srPluralCategory(partySize)], { n: partySize });
}

export function replyValues(facts: ReplyFacts, signature: string): Record<ReplyPlaceholder, string> {
  return {
    ime: facts.guestName.trim(),
    lokal: facts.venueName.trim(),
    datum: replyDate(facts.requestedAt),
    vreme: replyTime(facts.requestedAt),
    brojGostiju: replyGuests(facts.partySize),
    predlozenoVreme:
      facts.proposedAt === null
        ? ""
        : fmt(o.podrazumevano.predlozeno, { datum: replyDate(facts.proposedAt), vreme: replyTime(facts.proposedAt) }),
    poruka: facts.proposalNote?.trim() ?? "",
    potpis: signature,
  };
}

/**
 * Fills the known placeholders in one pass; an unknown one (or one without a
 * value) stays literally. Line breaks become "\n", lines lose trailing
 * spaces, and an empty value never leaves more than one blank line.
 */
export function fillTemplate(text: string, values: Partial<Record<string, string>>): string {
  const filled = text.replace(/\{(\w+)\}/g, (whole, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) && values[key] !== undefined ? (values[key] as string) : whole,
  );
  return filled
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Subject without line breaks or control characters (a header), collapsed spaces. */
export function cleanSubject(subject: string): string {
  return subject.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
}

/** The filled subject and body of a reply of this kind. */
export function composeReply(
  kind: ReplyKind,
  facts: ReplyFacts,
  venue: { templates: StoredTemplates; signature: string | null },
): ReplyTemplate {
  const { template } = templateFor(kind, venue.templates);
  const values = replyValues(facts, signatureOf(venue.signature, facts.venueName));
  return { subject: cleanSubject(fillTemplate(template.subject, values)), body: fillTemplate(template.body, values) };
}

/** A subject and a body the server accepts: not empty, within the limits, a one-line subject. */
export function isValidReply(reply: ReplyTemplate): boolean {
  // Checked on the subject AS SENT: a line break or a control character is
  // refused (never silently flattened); extra spaces are fine.
  const subject = reply.subject.trim();
  return (
    subject.length > 0 &&
    subject.length <= REPLY_SUBJECT_MAX &&
    !/[\x00-\x1f\x7f]/.test(subject) &&
    !hasLineBreak(subject) &&
    reply.body.trim().length > 0 &&
    reply.body.length <= REPLY_BODY_MAX
  );
}

/** A template the venue may store (same limits; placeholders are free text). */
export function isValidTemplate(template: ReplyTemplate): boolean {
  return isValidReply(template);
}

export function isValidSignature(signature: string): boolean {
  return signature.length <= REPLY_SIGNATURE_MAX;
}
