// Card 09 §1 — the brand sheet's send is the model page's send, run once per selected model:
// two models mean two POSTs with the exact body the model page posts, one after another; a
// model that did not go through comes back as failed while the other one is sent; a retry
// takes only the failed model and its own key. Style follows lead-form-model.test.ts (the
// fixture bodies and response shapes below are the ones that test already uses).

import { describe, expect, test, vi } from "vitest";
import { fairLeadRequestBody, type FairLeadFormValues } from "../lead-form-model";
import { retryBrandLeads, submitBrandLeads } from "./submit-brand-leads";

const values = (): FairLeadFormValues => ({
  contactName: "Marko Petrović",
  email: "marko@primer.rs",
  phone: "0641234567",
});

/** The gateway answer of a lead that went through, as lead-form-model.test.ts builds it. */
function sent() {
  return {
    status: 200,
    json: { ok: true, value: { duplicate: false, confirmationEmail: true } },
    headers: {},
  };
}

/** The gateway answer of a lead that did not (card 05 §7: a model in this state keeps its box). */
function down() {
  return { status: 503, json: { ok: false, code: "SERVICE_UNAVAILABLE" }, headers: {} };
}

const bodyOf = (call: unknown[]) => JSON.parse(String((call[1] as RequestInit).body));

describe("submitBrandLeads", () => {
  test("two models mean two calls with the model page's body, in the visitor's order", async () => {
    const calls: string[] = [];
    const fetchMock = vi.fn(async (input: unknown, init?: unknown) => {
      const model = String(bodyOf([input, init]).eventModelId);
      calls.push(`start:${model}`);
      await new Promise((resolve) => setTimeout(resolve, 1));
      calls.push(`done:${model}`);
      return sent();
    }) as unknown as typeof fetch;
    const result = await submitBrandLeads({
      targets: [
        { eventModelId: "cmnzk3vjzzpfxpkw1abcde", kind: "testDrive" },
        { eventModelId: "cmnzk3vjzzpfxpkw2abcde", kind: "interest" },
      ],
      submissionIds: [
        "c9dbe501c80040f1b3f5a6e7d8c9b0a1",
        "a1b2c3d4e5f60718293a4b5c6d7e8f90",
      ],
      values: values(),
      consentVersion: 3,
      fetchImpl: fetchMock,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/api/fair/lead", "/api/fair/lead"]);
    expect(fetchMock.mock.calls.map(([, init]) => (init as RequestInit).method)).toEqual(["POST", "POST"]);
    expect(fetchMock.mock.calls.map(([, init]) => bodyOf([undefined, init]))).toEqual([
      fairLeadRequestBody({
        eventModelId: "cmnzk3vjzzpfxpkw1abcde",
        kind: "test_drive",
        submissionId: "c9dbe501c80040f1b3f5a6e7d8c9b0a1",
        values: values(),
        consentVersion: 3,
      }),
      fairLeadRequestBody({
        eventModelId: "cmnzk3vjzzpfxpkw2abcde",
        kind: "interest",
        submissionId: "a1b2c3d4e5f60718293a4b5c6d7e8f90",
        values: values(),
        consentVersion: 3,
      }),
    ]);
    // One after another, never together: the route is rate-limited 60 leads per minute per IP.
    expect(calls).toEqual(["start:cmnzk3vjzzpfxpkw1abcde", "done:cmnzk3vjzzpfxpkw1abcde", "start:cmnzk3vjzzpfxpkw2abcde", "done:cmnzk3vjzzpfxpkw2abcde"]);
    expect(result.sentIds).toEqual(["cmnzk3vjzzpfxpkw1abcde", "cmnzk3vjzzpfxpkw2abcde"]);
    expect(result.failed).toEqual([]);
  });

  test("a model that does not answer comes back as failed, the other one as sent", async () => {
    const fetchMock = vi.fn(async () => (fetchMock.mock.calls.length === 1 ? down() : sent())) as unknown as typeof fetch;
    const result = await submitBrandLeads({
      targets: [
        { eventModelId: "cmnzk3vjzzpfxpkw1abcde", kind: "testDrive" },
        { eventModelId: "cmnzk3vjzzpfxpkw2abcde", kind: "testDrive" },
      ],
      submissionIds: [
        "c9dbe501c80040f1b3f5a6e7d8c9b0a1",
        "a1b2c3d4e5f60718293a4b5c6d7e8f90",
      ],
      values: values(),
      consentVersion: 3,
      fetchImpl: fetchMock,
    });
    expect(result.receipts.map((receipt) => [receipt.eventModelId, receipt.outcome.kind])).toEqual([
      ["cmnzk3vjzzpfxpkw1abcde", "unavailable"],
      ["cmnzk3vjzzpfxpkw2abcde", "success"],
    ]);
    expect(result.sentIds).toEqual(["cmnzk3vjzzpfxpkw2abcde"]);
    expect(result.failed.map((receipt) => receipt.eventModelId)).toEqual(["cmnzk3vjzzpfxpkw1abcde"]);
    // The model that failed keeps its contact in the row: nothing here tells the visitor to type it again.
    expect(result.failed[0]).toMatchObject({ submissionId: "c9dbe501c80040f1b3f5a6e7d8c9b0a1", kind: "testDrive" });
  });

  test("a retry sends only the model that failed, with the key it already has", async () => {
    const first = await submitBrandLeads({
      targets: [
        { eventModelId: "cmnzk3vjzzpfxpkw1abcde", kind: "testDrive" },
        { eventModelId: "cmnzk3vjzzpfxpkw2abcde", kind: "interest" },
      ],
      submissionIds: [
        "c9dbe501c80040f1b3f5a6e7d8c9b0a1",
        "a1b2c3d4e5f60718293a4b5c6d7e8f90",
      ],
      values: values(),
      consentVersion: 3,
      fetchImpl: vi.fn(async () => (true as boolean) && (fetch.length === 1 ? down() : sent())) as unknown as typeof fetch,
    });
    expect(first.failed.map((receipt) => receipt.eventModelId)).toEqual(["cmnzk3vjzzpfxpkw1abcde"]);
    const retryFetch = vi.fn(async () => sent()) as unknown as typeof fetch;
    const second = await retryBrandLeads({
      failed: first.failed,
      values: values(),
      consentVersion: 3,
      fetchImpl: retryFetch,
    });
    expect(retryFetch).toHaveBeenCalledTimes(1);
    expect(bodyOf(retryFetch.mock.calls[0])).toEqual(
      fairLeadRequestBody({
        eventModelId: "cmnzk3vjzzpfxpkw1abcde",
        kind: "test_drive",
        // The same key, not a new one: a retry that already landed answers as a duplicate
        // instead of writing a second lead for this model.
        submissionId: "c9dbe501c80040f1b3f5a6e7d8c9b0a1",
        values: values(),
        consentVersion: 3,
      }),
    );
    expect(second.sentIds).toEqual(["cmnzk3vjzzpfxpkw1abcde"]);
    expect(second.failed).toEqual([]);
  });
});
