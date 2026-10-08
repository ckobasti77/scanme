// Sajam 2026 N6 — the pure half of the lead form: fields by contactRequirement,
// validation with the N5 contract functions, the request body, the outcome of
// every gateway answer and the sender (a mocked fetch; nothing is sent).

import { describe, expect, test, vi } from "vitest";
import { FAIR_SUBMISSION_ID_PATTERN } from "@/lib/fair-contract";
import {
  fairLeadFieldPlan,
  fairLeadFieldProblem,
  fairLeadOutcome,
  fairLeadRequestBody,
  fairNewSubmissionId,
  sendFairLead,
  validateFairLeadForm,
  type FairLeadFormValues,
} from "./lead-form-model";

const values = (contactName: string, email = "", phone = ""): FairLeadFormValues => ({ contactName, email, phone });

describe("fields by contactRequirement", () => {
  test("both fields are always offered; the rule decides what is required", () => {
    expect(fairLeadFieldPlan("one_of")).toEqual({ emailRequired: false, phoneRequired: false, oneOf: true });
    expect(fairLeadFieldPlan("email")).toEqual({ emailRequired: true, phoneRequired: false, oneOf: false });
    expect(fairLeadFieldPlan("phone", "phone")).toEqual({ emailRequired: false, phoneRequired: true, oneOf: false, preferred: "phone" });
    expect(fairLeadFieldPlan("both")).toEqual({ emailRequired: true, phoneRequired: true, oneOf: false });
  });

  test("validation uses the same rules as the server, then the contact rule; the first invalid field gets focus", () => {
    expect(validateFairLeadForm(values("Marko Petrović", "marko@primer.rs"), "one_of")).toEqual({ errors: {}, firstInvalid: null });
    expect(validateFairLeadForm(values("Marko Petrović", "", "064 123 4567"), "one_of")).toEqual({ errors: {}, firstInvalid: null });
    expect(validateFairLeadForm(values("Marko Petrović"), "one_of")).toEqual({ errors: { email: "one_of" }, firstInvalid: "email" });
    expect(validateFairLeadForm(values("Marko Petrović", "", "064 123 4567"), "email")).toEqual({ errors: { email: "required" }, firstInvalid: "email" });
    expect(validateFairLeadForm(values("Marko Petrović", "marko@primer.rs"), "phone")).toEqual({ errors: { phone: "required" }, firstInvalid: "phone" });
    expect(validateFairLeadForm(values("Marko Petrović", "marko@primer.rs"), "both")).toEqual({ errors: { phone: "required" }, firstInvalid: "phone" });
    expect(validateFairLeadForm(values("", "marko@primer", "64 123 4567"), "both")).toEqual({
      errors: { contactName: "empty", email: "format", phone: "format" },
      firstInvalid: "contactName",
    });
    expect(validateFairLeadForm(values("Marko www.primer.rs", "marko@primer.rs"), "one_of").errors).toEqual({ contactName: "link" });
  });

  test("on blur a field only checks its own format (an empty contact is not nagged)", () => {
    expect(fairLeadFieldProblem("email", "")).toBeNull();
    expect(fairLeadFieldProblem("phone", "  ")).toBeNull();
    expect(fairLeadFieldProblem("phone", "064 123 4567")).toBeNull();
    expect(fairLeadFieldProblem("phone", "64 123 4567")).toBe("format");
    expect(fairLeadFieldProblem("email", "ime prezime@primer.rs")).toBe("format");
    expect(fairLeadFieldProblem("contactName", "Pozovite 064 123 4567")).toBe("characters");
  });
});

describe("request body and submissionId", () => {
  test("trimmed values, empty contacts left out, consent accepted with the shown version, API kind", () => {
    expect(fairLeadRequestBody({ eventModelId: "m1", kind: "testDrive", submissionId: "test-submission-1", values: values("  Marko  ", " Marko@Primer.rs ", ""), consentVersion: 3 })).toEqual({
      eventModelId: "m1", kind: "test_drive", submissionId: "test-submission-1", contactName: "Marko", email: "Marko@Primer.rs", consentAccepted: true, consentVersion: 3,
    });
    expect(fairLeadRequestBody({ eventModelId: "m1", kind: "interest", submissionId: "test-submission-2", values: values("Ana", "", "064 1"), consentVersion: 1 })).toEqual({
      eventModelId: "m1", kind: "interest", submissionId: "test-submission-2", contactName: "Ana", phone: "064 1", consentAccepted: true, consentVersion: 1,
    });
  });

  test("a submissionId matches the server pattern, also without randomUUID (plain http on the DEV LAN)", () => {
    const withUuid = fairNewSubmissionId();
    const withoutUuid = fairNewSubmissionId({ getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto) });
    for (const id of [withUuid, withoutUuid]) expect(FAIR_SUBMISSION_ID_PATTERN.test(id)).toBe(true);
    expect(withoutUuid).toMatch(/^[0-9a-f]{32}$/);
    expect(fairNewSubmissionId()).not.toBe(withUuid);
  });
});

describe("gateway answer → one outcome", () => {
  const empty = values("Marko");
  const answer = (status: number, body: unknown, retryAfter: string | null = null, formValues = empty) => fairLeadOutcome({ status, body, retryAfter, values: formValues });

  test("success and a polite duplicate (not an error)", () => {
    expect(answer(200, { ok: true, value: { duplicate: false, confirmationEmail: true } })).toEqual({ kind: "success", duplicate: false, confirmationEmail: true });
    expect(answer(200, { ok: true, value: { duplicate: true, confirmationEmail: false } })).toEqual({ kind: "success", duplicate: true, confirmationEmail: false });
  });

  test("rate limit with the wait from Retry-After, else from details, else 60 s", () => {
    expect(answer(429, { ok: false, code: "RATE_LIMITED", details: { retryAfterMs: 9000 } }, "42")).toEqual({ kind: "rate_limited", retryAfterSeconds: 42 });
    expect(answer(429, { ok: false, code: "RATE_LIMITED", details: { retryAfterMs: 1501 } })).toEqual({ kind: "rate_limited", retryAfterSeconds: 2 });
    expect(answer(429, { ok: false, code: "RATE_LIMITED" })).toEqual({ kind: "rate_limited", retryAfterSeconds: 60 });
  });

  test("a missing or refused contact focuses the field", () => {
    expect(answer(422, { ok: false, code: "CONTACT_REQUIREMENT_NOT_MET", details: { required: "one_of" } })).toEqual({ kind: "field", field: "email", error: "one_of" });
    expect(answer(422, { ok: false, code: "CONTACT_REQUIREMENT_NOT_MET", details: { required: "email" } })).toEqual({ kind: "field", field: "email", error: "required" });
    expect(answer(422, { ok: false, code: "CONTACT_REQUIREMENT_NOT_MET", details: { required: "phone" } })).toEqual({ kind: "field", field: "phone", error: "required" });
    expect(answer(422, { ok: false, code: "CONTACT_REQUIREMENT_NOT_MET", details: { required: "both" } }, null, values("Marko", "m@primer.rs"))).toEqual({ kind: "field", field: "phone", error: "required" });
    expect(answer(422, { ok: false, code: "CONTACT_REQUIREMENT_NOT_MET", details: { required: "both" } })).toEqual({ kind: "field", field: "email", error: "required" });
    expect(answer(400, { ok: false, code: "INVALID_INPUT", details: { field: "contactName", reason: "link" } })).toEqual({ kind: "field", field: "contactName", error: "link" });
    expect(answer(400, { ok: false, code: "INVALID_INPUT", details: { field: "phone", reason: "nepoznat" } })).toEqual({ kind: "field", field: "phone", error: "format" });
    expect(answer(400, { ok: false, code: "INVALID_INPUT" })).toEqual({ kind: "failed" });
  });

  test("changed consent → reload; closed form; a foreign submissionId → new id; anything else → retry", () => {
    for (const code of ["CONSENT_REQUIRED", "CONSENT_NOT_CONFIGURED"]) expect(answer(409, { ok: false, code })).toEqual({ kind: "consent_changed" });
    for (const code of ["LEADS_DISABLED", "FEATURE_NOT_ENTITLED", "EVENT_NOT_ACTIVE", "FAIR_MODEL_NOT_FOUND"]) expect(answer(409, { ok: false, code })).toEqual({ kind: "closed" });
    expect(answer(409, { ok: false, code: "SUBMISSION_DUPLICATE" })).toEqual({ kind: "conflict" });
    for (const [status, body] of [[503, { ok: false, code: "SERVICE_UNAVAILABLE" }], [503, { ok: false, code: "VISITOR_UNAVAILABLE" }], [502, null], [500, "<html>"], [200, { ok: false }]] as const) {
      expect(answer(status, body)).toEqual({ kind: "failed" });
    }
  });
});

describe("sendFairLead", () => {
  const body = fairLeadRequestBody({ eventModelId: "m1", kind: "interest", submissionId: "test-submission-3", values: values("Marko", "m@primer.rs"), consentVersion: 1 });

  test("one same-origin JSON POST to /api/fair/lead; the answer and Retry-After are read", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: false, code: "RATE_LIMITED" }), { status: 429, headers: { "Retry-After": "7" } }));
    expect(await sendFairLead(body, values("Marko", "m@primer.rs"), fetchMock as unknown as typeof fetch)).toEqual({ kind: "rate_limited", retryAfterSeconds: 7 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/fair/lead");
    expect(init).toMatchObject({ method: "POST", credentials: "same-origin", cache: "no-store" });
    expect(JSON.parse(String(init.body))).toEqual(body);
    // Never a visitor token or hash in the request: the HttpOnly cookie travels by itself.
    expect(String(init.body)).not.toMatch(/visitor|hash|token/i);
  });

  test("a network error or a non-JSON answer is a safe retry, never a throw", async () => {
    const offline = vi.fn(async () => { throw new TypeError("offline"); });
    expect(await sendFairLead(body, values("Marko"), offline as unknown as typeof fetch)).toEqual({ kind: "failed" });
    const html = vi.fn(async () => new Response("<html>", { status: 502 }));
    expect(await sendFairLead(body, values("Marko"), html as unknown as typeof fetch)).toEqual({ kind: "failed" });
  });
});
