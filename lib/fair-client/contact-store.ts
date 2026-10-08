// Sajam 2026 — opt-in "Zapamti moj kontakt na ovom telefonu" (owner decision
// 8 Oct 2026, MASTER §5). Written only when the visitor ticked the checkbox
// AND the send succeeded. Holds name + contact and nothing else: never the
// consent (it names one exhibitor and is asked every time), never a token.

export const FAIR_SAVED_CONTACT_KEY = "scanme:fair-contact:v1";
const VERSION = 1;
const MAX_FIELD = 254;

export type FairSavedContact = { name: string; email?: string; phone?: string };

type ContactStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function text(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= MAX_FIELD;
}

export function readSavedContact(storage: ContactStorage | null | undefined): FairSavedContact | null {
  try {
    const raw = storage?.getItem(FAIR_SAVED_CONTACT_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    const row = parsed as Record<string, unknown>;
    if (row.v !== VERSION || !text(row.name)) return null;
    const email = text(row.email) ? row.email : undefined;
    const phone = text(row.phone) ? row.phone : undefined;
    if (!email && !phone) return null;
    return { name: row.name, ...(email ? { email } : {}), ...(phone ? { phone } : {}) };
  } catch {
    return null;
  }
}

/** True when the contact was stored. A full or blocked storage is not an error for the visitor. */
export function saveContact(storage: ContactStorage | null | undefined, contact: FairSavedContact): boolean {
  const name = contact.name.trim();
  const email = contact.email?.trim();
  const phone = contact.phone?.trim();
  if (!text(name) || (!email && !phone)) return false;
  try {
    storage?.setItem(
      FAIR_SAVED_CONTACT_KEY,
      JSON.stringify({ v: VERSION, name, ...(email ? { email } : {}), ...(phone ? { phone } : {}) }),
    );
    return Boolean(storage);
  } catch {
    return false;
  }
}

export function forgetContact(storage: ContactStorage | null | undefined): void {
  try {
    storage?.removeItem(FAIR_SAVED_CONTACT_KEY);
  } catch {
    // Nothing to undo: an unreadable storage holds nothing we can show.
  }
}

/** window.localStorage, or null where reading the property itself throws. */
export function browserContactStorage(): ContactStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
