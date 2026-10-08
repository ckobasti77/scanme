import {
  FAIR_LEAD_NAME_MAX,
  fairContactRequirementProblem,
  isFairLeadEmail,
  isFairLeadPhone,
  type FairContactRequirement,
} from "@/lib/fair-contract";
import type { FairSavedContact } from "./contact-store";

// Sajam 2026 — the shared contact block (lead sheets + optional survey
// contact). Pure: the component renders `fields`, shows `hint` and enables
// send from `ok`; the API body is `payload`. The exhibitor's requirement comes
// from the server (`getLeadForm.contactRequirement`); `one_of` uses one
// "Email ili telefon" field, the other rules get dedicated fields.

export type ContactDraft = {
  name: string;
  /** `one_of`: one field, classified as email or phone. */
  contact: string;
  email: string;
  phone: string;
  consent: boolean | null;
  remember: boolean;
};

export type ContactField = "contact" | "email" | "phone";

export type ContactHint = "name" | "contact" | "email" | "phone" | "consent" | "declined";

export type ContactPayload = { contactName: string; email?: string; phone?: string };

export type ContactFormState = {
  /** Nothing typed yet (an optional survey contact may stay empty). */
  empty: boolean;
  ok: boolean;
  hint: ContactHint | null;
  payload: ContactPayload | null;
};

export const EMPTY_CONTACT_DRAFT: ContactDraft = {
  name: "",
  contact: "",
  email: "",
  phone: "",
  consent: null,
  remember: false,
};

export function contactFields(requirement: FairContactRequirement): ContactField[] {
  if (requirement === "one_of") return ["contact"];
  if (requirement === "both") return ["email", "phone"];
  return [requirement];
}

function channels(draft: ContactDraft, requirement: FairContactRequirement) {
  if (requirement !== "one_of") {
    return { email: draft.email.trim() || undefined, phone: draft.phone.trim() || undefined };
  }
  const value = draft.contact.trim();
  if (isFairLeadEmail(value)) return { email: value };
  if (isFairLeadPhone(value)) return { phone: value };
  return {};
}

export function contactFormState(draft: ContactDraft, requirement: FairContactRequirement): ContactFormState {
  const name = draft.name.trim();
  const typed = contactFields(requirement).map((field) => draft[field].trim());
  const empty = !name && typed.every((value) => !value);
  const fail = (hint: ContactHint): ContactFormState => ({ empty, ok: false, hint, payload: null });

  if (!name || name.length > FAIR_LEAD_NAME_MAX) return fail("name");
  const { email, phone } = channels(draft, requirement);
  if (requirement === "one_of" && !email && !phone) return fail("contact");
  if (email !== undefined && !isFairLeadEmail(email)) return fail("email");
  if (phone !== undefined && !isFairLeadPhone(phone)) return fail("phone");
  const missing = fairContactRequirementProblem(requirement, { email, phone });
  if (missing) return fail(missing === "both" ? (email ? "phone" : "email") : missing === "one_of" ? "contact" : missing);
  if (draft.consent === null) return fail("consent");
  if (draft.consent === false) return fail("declined");
  return {
    empty,
    ok: true,
    hint: null,
    payload: { contactName: name, ...(email ? { email } : {}), ...(phone ? { phone } : {}) },
  };
}

/** "Koristi": fill the fields of this form from the saved contact. Consent stays unanswered. */
export function draftFromSavedContact(
  saved: FairSavedContact,
  requirement: FairContactRequirement,
  current: ContactDraft,
): ContactDraft {
  return {
    ...current,
    name: saved.name,
    contact: requirement === "one_of" ? (saved.email ?? saved.phone ?? "") : current.contact,
    email: requirement === "one_of" ? current.email : (saved.email ?? current.email),
    phone: requirement === "one_of" ? current.phone : (saved.phone ?? current.phone),
    remember: true,
  };
}
