// Sajam 2026 D1 — Aleksa's lead sheets (5532038), checked as they are (no
// rework): name + at least one contact by the exhibitor's rule, no date or
// slot for the test drive, one Prihvatam/Odbijam consent, 16 px fields, and
// no way to "succeed" before the input is complete (success itself is shown
// only after the gateway's OK: lead-sheet.tsx `await postFair`, then toast).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import type { FairContactRequirement, FairLeadFormView } from "@/lib/fair-contract";
import { EMPTY_CONTACT_DRAFT, contactFormState } from "@/lib/fair-client/contact-form";
import { fairModelSr } from "@/lib/i18n/sr/fair-model";
import { LeadSheet, type LeadSheetKind } from "./lead-sheet";
import { FairModelInteractionsProvider } from "./model-interactions";

const MODEL = {
  id: "test-model-id",
  eventId: "test-event-id",
  participationId: "test-participation",
  brandName: "TEST Volta",
  displayName: "TEST Volta X1",
  exhibitorName: "TEST Izlagač A",
};
const CONSENT = "TEST saglasnost: ScanMe prima podatke i prosleđuje ih izlagaču TEST Izlagač A.";

function open(kind: "interest" | "test_drive", contactRequirement: FairContactRequirement): FairLeadFormView {
  return { eventModelId: MODEL.id, kind, state: "open", contactRequirement, consent: { version: 1, text: CONSENT } };
}

function sheet(kind: LeadSheetKind, requirement: FairContactRequirement) {
  const form = open(kind === "testDrive" ? "test_drive" : "interest", requirement);
  return renderToStaticMarkup(
    <FairModelInteractionsProvider
      dict={fairModelSr}
      model={MODEL}
      interactions={{ survey: null, leadForms: { [kind]: form } }}
      routePath="/sajam/test-elektromobilnost-2026/model/test-volta-x1-test-premium"
      openSurvey={false}
    >
      <LeadSheet kind={kind} form={form} onRequestClose={() => undefined} />
    </FairModelInteractionsProvider>,
  );
}

const inputs = (html: string) => [...html.matchAll(/<input [^>]*>/g)].map((match) => match[0]);

describe("lead sheets as Aleksa built them", () => {
  test("Zainteresovan sam (one_of): name + one 'Email ili telefon' field, the consent with Prihvatam/Odbijam, send disabled", () => {
    const html = sheet("interest", "one_of");
    const fields = inputs(html).filter((tag) => !tag.includes('type="checkbox"'));
    expect(fields).toHaveLength(2);
    expect(fields[0]).toContain('name="name"');
    expect(fields[1]).toContain('name="contact"');
    expect(html).toContain(fairModelSr.contactOneOfLabel);
    expect(html).toContain(CONSENT);
    expect(html).toMatch(/<button type="button" data-choice="accept" aria-pressed="false">Prihvatam<\/button>/);
    expect(html).toMatch(/<button type="button" data-choice="decline" aria-pressed="false">Odbijam<\/button>/);
    expect(html).toMatch(/<button type="button" class="fair-sheet__primary" disabled="">/);
  });

  test("Probna vožnja: the same contact block, never a date, time or slot", () => {
    for (const requirement of ["one_of", "email", "phone", "both"] as const) {
      const html = sheet("testDrive", requirement);
      expect(html).toContain(fairModelSr.testDriveSheetTitle);
      expect(html).not.toMatch(/type="(date|datetime-local|time|month|week)"/);
      expect(html).not.toContain("<select");
      // Only name, contact fields and the remember checkbox; the text says the dealer arranges the time.
      for (const tag of inputs(html)) expect(tag).toMatch(/name="(name|contact|email|phone)"|type="checkbox"/);
      expect(html).toContain(fairModelSr.testDriveBody);
      expect(html).toContain("Prihvatam");
      expect(html).toContain("Odbijam");
    }
  });

  test("the exhibitor's rule decides the contact fields (email, phone or both)", () => {
    const names = (requirement: FairContactRequirement) =>
      inputs(sheet("interest", requirement)).filter((tag) => !tag.includes('type="checkbox"')).map((tag) => tag.match(/name="([^"]+)"/)![1]);
    expect(names("email")).toEqual(["name", "email"]);
    expect(names("phone")).toEqual(["name", "phone"]);
    expect(names("both")).toEqual(["name", "email", "phone"]);
  });

  test("send is possible only with a name, at least one valid contact and Prihvatam", () => {
    const draft = { ...EMPTY_CONTACT_DRAFT, name: "TEST Posetilac", contact: "posetilac@example.invalid", consent: true };
    expect(contactFormState(draft, "one_of")).toMatchObject({ ok: true, payload: { contactName: "TEST Posetilac", email: "posetilac@example.invalid" } });
    expect(contactFormState({ ...draft, contact: "+381 60 000 0004" }, "one_of")).toMatchObject({ ok: true, payload: { phone: "+381 60 000 0004" } });
    expect(contactFormState({ ...draft, name: " " }, "one_of")).toMatchObject({ ok: false, hint: "name" });
    expect(contactFormState({ ...draft, contact: "" }, "one_of")).toMatchObject({ ok: false, hint: "contact" });
    expect(contactFormState({ ...draft, consent: null }, "one_of")).toMatchObject({ ok: false, hint: "consent" });
    expect(contactFormState({ ...draft, consent: false }, "one_of")).toMatchObject({ ok: false, hint: "declined" });
  });

  test("form fields are 16 px (no iOS zoom on focus) and at least 44 px tall", () => {
    const css = readFileSync(join(process.cwd(), "app/sajam/fair-event.css"), "utf8").replace(/\r\n/g, "\n");
    const rule = css.match(/\.fair-field input \{([^}]*)\}/)?.[1] ?? "";
    expect(rule).toMatch(/font-size:\s*16px/);
    expect(Number(rule.match(/min-height:\s*(\d+)px/)?.[1])).toBeGreaterThanOrEqual(44);
  });
});
