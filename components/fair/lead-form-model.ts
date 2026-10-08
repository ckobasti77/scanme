import {
  FAIR_LEAD_INPUT_REASONS,
  fairContactRequirementProblem,
  normalizeFairLeadEmail,
  normalizeFairLeadName,
  normalizeFairLeadPhone,
  type FairContactRequirement,
  type FairLeadInputReason,
  type FairLeadKind,
  type FairLeadSubmitInput,
  type FairPreferredContact,
} from "@/lib/fair-contract";

// =============================================================================
// Sajam 2026 N6 — the pure half of the `Zainteresovan sam` / `Probna vožnja`
// form (components/fair/lead-form.tsx is the React half). It validates with
// the SAME lib/fair-contract.ts functions Convex uses (N5), builds the body of
// POST /api/fair/lead and maps the gateway answer to one UI outcome. No
// storage: values live only in React state and are dropped after success.
// =============================================================================

export type FairLeadSheetKind = "interest" | "testDrive";
export type FairLeadFieldName = "contactName" | "email" | "phone";
export type FairLeadFormValues = Record<FairLeadFieldName, string>;
export type FairLeadConsentChoice = "accept" | "decline" | null;
export type FairLeadDraft = { values: FairLeadFormValues; consent: FairLeadConsentChoice };

/** A field problem: a reason from the server contract, a missing required field, or "one of the two". */
export type FairLeadFieldError = FairLeadInputReason | "required" | "one_of";
export type FairLeadFieldErrors = Partial<Record<FairLeadFieldName, FairLeadFieldError>>;

export const FAIR_LEAD_FIELD_ORDER: readonly FairLeadFieldName[] = ["contactName", "email", "phone"];
export const FAIR_EMPTY_LEAD_DRAFT: FairLeadDraft = { values: { contactName: "", email: "", phone: "" }, consent: null };

export const fairLeadApiKind = (kind: FairLeadSheetKind): FairLeadKind => (kind === "testDrive" ? "test_drive" : "interest");

/** Which contact fields are required. Both are always offered (the email is the confirmation address). */
export type FairLeadFieldPlan = { emailRequired: boolean; phoneRequired: boolean; oneOf: boolean; preferred?: FairPreferredContact };

export function fairLeadFieldPlan(requirement: FairContactRequirement, preferred?: FairPreferredContact): FairLeadFieldPlan {
  return {
    emailRequired: requirement === "email" || requirement === "both",
    phoneRequired: requirement === "phone" || requirement === "both",
    oneOf: requirement === "one_of",
    ...(preferred ? { preferred } : {}),
  };
}

/** One field, as the visitor leaves it (blur): its own format only, never the cross-field rule. */
export function fairLeadFieldProblem(field: FairLeadFieldName, raw: string): FairLeadFieldError | null {
  if (field === "contactName") {
    const name = normalizeFairLeadName(raw);
    return name.ok ? null : name.reason;
  }
  if (!raw.trim()) return null;
  const valid = field === "email" ? normalizeFairLeadEmail(raw) : normalizeFairLeadPhone(raw);
  return valid === null ? "format" : null;
}

/** Everything before sending: formats, then the exhibitor's contact rule. */
export function validateFairLeadForm(values: FairLeadFormValues, requirement: FairContactRequirement): { errors: FairLeadFieldErrors; firstInvalid: FairLeadFieldName | null } {
  const errors: FairLeadFieldErrors = {};
  for (const field of FAIR_LEAD_FIELD_ORDER) {
    const problem = fairLeadFieldProblem(field, values[field]);
    if (problem) errors[field] = problem;
  }
  const missing = fairContactRequirementProblem(requirement, { email: values.email.trim() || undefined, phone: values.phone.trim() || undefined });
  if (missing === "one_of") errors.email ??= "one_of";
  if ((missing === "email" || missing === "both") && !values.email.trim()) errors.email ??= "required";
  if ((missing === "phone" || missing === "both") && !values.phone.trim()) errors.phone ??= "required";
  return { errors, firstInvalid: FAIR_LEAD_FIELD_ORDER.find((field) => errors[field]) ?? null };
}

/** The body of POST /api/fair/lead. Empty contacts are left out; Convex normalizes again (authoritative). */
export function fairLeadRequestBody(input: {
  eventModelId: string;
  kind: FairLeadSheetKind;
  submissionId: string;
  values: FairLeadFormValues;
  consentVersion: number;
}): FairLeadSubmitInput {
  const email = input.values.email.trim();
  const phone = input.values.phone.trim();
  return {
    eventModelId: input.eventModelId,
    kind: fairLeadApiKind(input.kind),
    submissionId: input.submissionId,
    contactName: input.values.contactName.trim(),
    ...(email ? { email } : {}),
    ...(phone ? { phone } : {}),
    consentAccepted: true,
    consentVersion: input.consentVersion,
  };
}

/**
 * The idempotency key of one opening of the form (FAIR_SUBMISSION_ID_PATTERN).
 * `crypto.randomUUID` needs a secure context; a phone on the DEV LAN over plain
 * http still has `getRandomValues`.
 */
export function fairNewSubmissionId(source: Pick<Crypto, "getRandomValues"> & Partial<Pick<Crypto, "randomUUID">> = globalThis.crypto): string {
  if (typeof source.randomUUID === "function") return source.randomUUID();
  return Array.from(source.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export type FairLeadOutcome =
  | { kind: "success"; duplicate: boolean; confirmationEmail: boolean }
  | { kind: "field"; field: FairLeadFieldName; error: FairLeadFieldError }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  /** The consent text changed (or was retired) since the page was rendered: reload and read it again. */
  | { kind: "consent_changed" }
  /** The form is closed for this model right now (switch, package, event, model). */
  | { kind: "closed" }
  /** The submissionId belongs to another submit: retry with a new one. */
  | { kind: "conflict" }
  /** Network, server or an unexpected answer: retrying with the same submissionId is safe. */
  | { kind: "failed" };

export const FAIR_LEAD_DEFAULT_RETRY_SECONDS = 60;
const REASONS = new Set<string>(FAIR_LEAD_INPUT_REASONS);
const FIELDS = new Set<string>(FAIR_LEAD_FIELD_ORDER);

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** Maps one gateway answer to one UI outcome (`values` picks the field for a `both` rule). */
export function fairLeadOutcome(input: { status: number; body: unknown; retryAfter: string | null; values: FairLeadFormValues }): FairLeadOutcome {
  const body = record(input.body);
  if (input.status === 200 && body?.ok === true) {
    const value = record(body.value);
    return { kind: "success", duplicate: value?.duplicate === true, confirmationEmail: value?.confirmationEmail === true };
  }
  const code = body?.ok === false && typeof body.code === "string" ? body.code : null;
  const details = record(body?.details) ?? {};
  switch (code) {
    case "RATE_LIMITED": {
      const header = Number.parseInt(input.retryAfter ?? "", 10);
      const fromDetails = typeof details.retryAfterMs === "number" ? Math.ceil(details.retryAfterMs / 1000) : NaN;
      const seconds = Number.isFinite(header) && header > 0 ? header : Number.isFinite(fromDetails) && fromDetails > 0 ? fromDetails : FAIR_LEAD_DEFAULT_RETRY_SECONDS;
      return { kind: "rate_limited", retryAfterSeconds: seconds };
    }
    case "INVALID_INPUT":
      if (typeof details.field === "string" && FIELDS.has(details.field)) {
        const reason = typeof details.reason === "string" && REASONS.has(details.reason) ? (details.reason as FairLeadInputReason) : "format";
        return { kind: "field", field: details.field as FairLeadFieldName, error: reason };
      }
      return { kind: "failed" };
    case "CONTACT_REQUIREMENT_NOT_MET": {
      const required = details.required;
      if (required === "phone" || (required === "both" && input.values.email.trim())) return { kind: "field", field: "phone", error: "required" };
      return { kind: "field", field: "email", error: required === "email" || required === "both" ? "required" : "one_of" };
    }
    case "CONSENT_REQUIRED":
    case "CONSENT_NOT_CONFIGURED":
      return { kind: "consent_changed" };
    case "LEADS_DISABLED":
    case "FEATURE_NOT_ENTITLED":
    case "EVENT_NOT_ACTIVE":
    case "FAIR_MODEL_NOT_FOUND":
      return { kind: "closed" };
    case "SUBMISSION_DUPLICATE":
      return { kind: "conflict" };
    default:
      return { kind: "failed" };
  }
}

/** POST /api/fair/lead (same origin; the visitor cookie travels by itself). Never throws. */
export async function sendFairLead(body: FairLeadSubmitInput, values: FairLeadFormValues, fetchImpl: typeof fetch = fetch): Promise<FairLeadOutcome> {
  let response: Response;
  try {
    response = await fetchImpl("/api/fair/lead", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { kind: "failed" };
  }
  let json: unknown = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }
  return fairLeadOutcome({ status: response.status, body: json, retryAfter: response.headers.get("retry-after"), values });
}
