import { FAIR_FOLLOW_UP_FIELDS, fairLeadNameRisk, type FairFollowUpField } from "../../lib/fair-contract";
import { eventLeadEmailSr as dict } from "../../lib/i18n/sr/event-lead-email";

// =============================================================================
// Sajam automobila 2026 — Admin UX A8: merge fields of the exhibitor's
// follow-up text (ADMIN-UX §7, MASTER §8). Pure and runtime-agnostic: the
// outbox (convex/fairEmails.ts claimDelivery), the admin functions
// (convex/fairFollowUps.ts) and the admin preview in the browser use the same
// rules, so what the admin sees is what is sent.
//
// - `{ime}`, `{izlagac}`, … (FAIR_FOLLOW_UP_FIELDS) are replaced in ONE pass,
//   so a value that itself contains braces is never expanded again;
// - a field without a value becomes its i18n fallback (no empty gap);
// - any other `{…}` is refused when the text is saved;
// - values are plain text: the HTML is escaped later by the ScanMe email
//   template (convex/lib/fairEmails.ts).
// =============================================================================

/** `{` + up to 40 characters without braces or a line break + `}`. */
const FIELD_PATTERN = /\{([^{}\r\n]{0,40})\}/g;

export type FairFollowUpValues = Partial<Record<FairFollowUpField, string | null>>;
export type FairFollowUpText = { subject: string; plainText: string };

export function isFairFollowUpField(name: string): name is FairFollowUpField {
  return (FAIR_FOLLOW_UP_FIELDS as readonly string[]).includes(name);
}

/** The first `{…}` in the subject or the text that is not a merge field; null = the text is valid. */
export function fairFollowUpUnknownField(text: FairFollowUpText): string | null {
  for (const part of [text.subject, text.plainText]) {
    for (const match of part.matchAll(FIELD_PATTERN)) {
      if (!isFairFollowUpField(match[1])) return match[1];
    }
  }
  return null;
}

/** Merge fields the text uses, in FAIR_FOLLOW_UP_FIELDS order. */
export function fairFollowUpFieldsUsed(text: FairFollowUpText): FairFollowUpField[] {
  const used = new Set<string>();
  for (const part of [text.subject, text.plainText]) {
    for (const match of part.matchAll(FIELD_PATTERN)) used.add(match[1]);
  }
  return FAIR_FOLLOW_UP_FIELDS.filter((field) => used.has(field));
}

/** Replaces every merge field with its value, or the fallback when the value is empty. Unknown fields stay as written. */
export function renderFairFollowUp(text: FairFollowUpText, values: FairFollowUpValues): FairFollowUpText {
  const replace = (part: string) =>
    part.replace(FIELD_PATTERN, (whole, name: string) => {
      if (!isFairFollowUpField(name)) return whole;
      const value = values[name]?.trim();
      return value ? value : dict.followUpFallbacks[name];
    });
  return { subject: replace(text.subject).replace(/[\r\n]+/g, " ").trim(), plainText: replace(text.plainText) };
}

/** "A", "A i B", "A, B i C": distinct names in the given order. */
export function fairJoinNames(names: readonly string[]): string {
  const unique = [...new Set(names.map((name) => name.trim()).filter(Boolean))];
  if (unique.length <= 1) return unique[0] ?? "";
  return `${unique.slice(0, -1).join(", ")} ${dict.listAnd} ${unique[unique.length - 1]}`;
}

export type FairFollowUpLeadFacts = {
  /** Lead kind and model name, oldest first. */
  leads: readonly { kind: "interest" | "test_drive"; modelName: string }[];
  /** Name of the newest lead of the pair (a visitor may correct it). */
  contactName: string | null;
  exhibitorName: string | null;
  eventTitle: string | null;
  /** Models of the exhibitor this visitor rated, where the package has ratings. */
  ratedModelNames: readonly string[];
};

/** The values of every merge field for one (visitor email, exhibitor) pair. */
export function fairFollowUpValues(facts: FairFollowUpLeadFacts): Record<FairFollowUpField, string | null> {
  const names = (kind?: "interest" | "test_drive") => fairJoinNames(facts.leads.filter((lead) => !kind || lead.kind === kind).map((lead) => lead.modelName)) || null;
  return {
    // N5: a name that is not safe to repeat (link, invisible characters) gets the fallback.
    ime: facts.contactName && !fairLeadNameRisk(facts.contactName) ? facts.contactName : null,
    izlagac: facts.exhibitorName,
    dogadjaj: facts.eventTitle,
    modeli: names(),
    modeli_zainteresovan: names("interest"),
    modeli_probna_voznja: names("test_drive"),
    modeli_ocenjeni: fairJoinNames(facts.ratedModelNames) || null,
  };
}

/** Example values for the admin preview when no lead is chosen (the name is marked as an example). */
export function fairFollowUpSampleValues(input: { exhibitorName: string; eventTitle: string; modelNames: readonly string[] }): Record<FairFollowUpField, string | null> {
  const [first, second] = input.modelNames;
  return fairFollowUpValues({
    leads: [
      ...(first ? [{ kind: "interest" as const, modelName: first }] : []),
      ...(second ? [{ kind: "test_drive" as const, modelName: second }] : first ? [{ kind: "test_drive" as const, modelName: first }] : []),
    ],
    contactName: dict.followUpSampleName,
    exhibitorName: input.exhibitorName,
    eventTitle: input.eventTitle,
    ratedModelNames: first ? [first] : [],
  });
}
