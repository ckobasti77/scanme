import { describe, expect, it } from "vitest";
import {
  EMPTY_CONTACT_DRAFT,
  contactFields,
  contactFormState,
  draftFromSavedContact,
  type ContactDraft,
} from "./contact-form";
import { FAIR_SAVED_CONTACT_KEY, forgetContact, readSavedContact, saveContact } from "./contact-store";
import { hasFairSurveyMarker, setFairSurveyMarker } from "./survey-marker";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
}

const throwing = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
  removeItem: () => {
    throw new Error("blocked");
  },
};

describe("saved contact store", () => {
  it("saves, reads and forgets name + contact only", () => {
    const storage = memoryStorage();
    expect(readSavedContact(storage)).toBeNull();
    expect(saveContact(storage, { name: " Ana Anić ", email: "ana@example.com" })).toBe(true);
    expect(readSavedContact(storage)).toEqual({ name: "Ana Anić", email: "ana@example.com" });
    expect(JSON.parse(storage.values.get(FAIR_SAVED_CONTACT_KEY)!)).toEqual({ v: 1, name: "Ana Anić", email: "ana@example.com" });
    forgetContact(storage);
    expect(readSavedContact(storage)).toBeNull();
  });

  it("keeps both channels for exhibitors that require email and phone", () => {
    const storage = memoryStorage();
    saveContact(storage, { name: "Ana", email: "ana@example.com", phone: "+381 64 123 4567" });
    expect(readSavedContact(storage)).toEqual({ name: "Ana", email: "ana@example.com", phone: "+381 64 123 4567" });
  });

  it("ignores another version, corrupt JSON and incomplete rows", () => {
    const storage = memoryStorage();
    storage.setItem(FAIR_SAVED_CONTACT_KEY, JSON.stringify({ v: 2, name: "Ana", email: "a@b.rs" }));
    expect(readSavedContact(storage)).toBeNull();
    storage.setItem(FAIR_SAVED_CONTACT_KEY, "{not json");
    expect(readSavedContact(storage)).toBeNull();
    storage.setItem(FAIR_SAVED_CONTACT_KEY, JSON.stringify({ v: 1, name: "Ana" }));
    expect(readSavedContact(storage)).toBeNull();
    storage.setItem(FAIR_SAVED_CONTACT_KEY, JSON.stringify({ v: 1, name: "Ana", email: "a@b.rs", consent: true, token: "x" }));
    expect(readSavedContact(storage)).toEqual({ name: "Ana", email: "a@b.rs" });
  });

  it("refuses to save without a name or a channel", () => {
    const storage = memoryStorage();
    expect(saveContact(storage, { name: "  ", email: "a@b.rs" })).toBe(false);
    expect(saveContact(storage, { name: "Ana" })).toBe(false);
    expect(storage.values.size).toBe(0);
  });

  it("never throws when storage is blocked or missing", () => {
    expect(readSavedContact(throwing)).toBeNull();
    expect(saveContact(throwing, { name: "Ana", email: "a@b.rs" })).toBe(false);
    expect(() => forgetContact(throwing)).not.toThrow();
    expect(readSavedContact(null)).toBeNull();
    expect(saveContact(null, { name: "Ana", email: "a@b.rs" })).toBe(false);
  });
});

describe("contact form rules", () => {
  const draft = (patch: Partial<ContactDraft>): ContactDraft => ({ ...EMPTY_CONTACT_DRAFT, ...patch });

  it("one_of uses one field and classifies email or phone", () => {
    expect(contactFields("one_of")).toEqual(["contact"]);
    expect(contactFormState(draft({ name: "Ana", contact: "ana@example.com", consent: true }), "one_of")).toMatchObject({
      ok: true,
      payload: { contactName: "Ana", email: "ana@example.com" },
    });
    expect(contactFormState(draft({ name: "Ana", contact: "064 123 4567", consent: true }), "one_of").payload).toEqual({
      contactName: "Ana",
      phone: "064 123 4567",
    });
    expect(contactFormState(draft({ name: "Ana", contact: "abc", consent: true }), "one_of").hint).toBe("contact");
  });

  it("follows the exhibitor's requirement", () => {
    expect(contactFields("both")).toEqual(["email", "phone"]);
    expect(contactFormState(draft({ name: "Ana", email: "a@b.rs", consent: true }), "both").hint).toBe("phone");
    expect(contactFormState(draft({ name: "Ana", phone: "0641234567", consent: true }), "email").hint).toBe("email");
    expect(contactFormState(draft({ name: "Ana", email: "a@b.rs", phone: "0641234567", consent: true }), "both").ok).toBe(true);
  });

  it("sends only with Prihvatam", () => {
    const base = draft({ name: "Ana", contact: "a@b.rs" });
    expect(contactFormState(base, "one_of").hint).toBe("consent");
    expect(contactFormState({ ...base, consent: false }, "one_of")).toMatchObject({ ok: false, hint: "declined" });
    expect(contactFormState(draft({ consent: true }), "one_of")).toMatchObject({ empty: true, ok: false, hint: "name" });
  });

  it("Koristi fills fields and the remember box, never the consent", () => {
    const filled = draftFromSavedContact({ name: "Ana", phone: "0641234567" }, "one_of", EMPTY_CONTACT_DRAFT);
    expect(filled).toMatchObject({ name: "Ana", contact: "0641234567", remember: true, consent: null });
    const both = draftFromSavedContact({ name: "Ana", email: "a@b.rs", phone: "0641234567" }, "both", EMPTY_CONTACT_DRAFT);
    expect(both).toMatchObject({ email: "a@b.rs", phone: "0641234567", consent: null });
  });
});

describe("exhibitor survey marker", () => {
  it("is scoped to event and exhibitor participation", () => {
    const storage = memoryStorage();
    expect(hasFairSurveyMarker(storage, "event-a", "part-1")).toBe(false);
    setFairSurveyMarker(storage, "event-a", "part-1");
    expect(hasFairSurveyMarker(storage, "event-a", "part-1")).toBe(true);
    expect(hasFairSurveyMarker(storage, "event-a", "part-2")).toBe(false);
    expect(hasFairSurveyMarker(storage, "event-b", "part-1")).toBe(false);
    expect(hasFairSurveyMarker(throwing, "event-a", "part-1")).toBe(false);
  });
});
