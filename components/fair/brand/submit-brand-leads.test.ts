// Sajam 2026 — the multi-model sender for the brand page: sequential posts in
// the visitor's order, per-model results, and retry of a failed model with the
// SAME submissionId. No fetch is mocked and nothing is sent: the fake `post` is
// passed as the second argument, like the mocked fetch in lead-form-model.test.

import { describe, expect, test, vi } from "vitest";
import type { postFair } from "@/lib/fair-client/fair-api";
import type { FairErrorCode, FairLeadSubmitResult, FairResult } from "@/lib/fair-contract";
import { submitBrandLeads } from "./submit-brand-leads";

// "network" is not a FairErrorCode; the gateway-down code is SERVICE_UNAVAILABLE.
const DOWN = { ok: false, code: "SERVICE_UNAVAILABLE" } satisfies FairResult<never>;

// A scripted queue of gateway answers. The mock answers one concrete T while
// postFair promises an answer for any T, so each call hands the mock over with
// an unknown hop, exactly like `fetchMock as unknown as typeof fetch` elsewhere.
const fakePost = (...answers: FairResult<FairLeadSubmitResult>[]) =>
  vi.fn((_path: string, _body: unknown): Promise<FairResult<FairLeadSubmitResult>> =>
    Promise.resolve(
      answers.shift() ?? {
        ok: true,
        value: { eventModelId: "", kind: "interest", submittedAt: 0, duplicate: false, confirmationEmail: false, followUpScheduled: false },
      },
    ),
  );

const lead = (eventModelId: string): FairResult<FairLeadSubmitResult> => ({
  ok: true,
  value: { eventModelId, kind: "test_drive", submittedAt: 0, duplicate: false, confirmationEmail: false, followUpScheduled: false },
});

const contact = { contactName: "Marko Petrović", email: "marko@primer.rs" };

const input = (submissionIds: Record<string, string> = {}) => ({
  kind: "testDrive" as const,
  eventModelIds: ["m1", "m2"],
  contact,
  consentVersionById: { m1: 3, m2: 3 },
  submissionIds,
});

const send = (args: Parameters<typeof submitBrandLeads>[0], post: ReturnType<typeof fakePost>) =>
  submitBrandLeads(args, post as unknown as typeof postFair);

const bodiesOf = (post: ReturnType<typeof fakePost>) => post.mock.calls.map((call) => call[1] as Record<string, unknown>);

describe("submitBrandLeads", () => {
  test("2 models: post is called twice, in order, with the API kind and the lead-sheet body", async () => {
    const post = fakePost();
    const submissionIds: Record<string, string> = {};
    const results = await send(input(submissionIds), post);

    expect(results).toEqual([
      { eventModelId: "m1", ok: true },
      { eventModelId: "m2", ok: true },
    ]);
    expect(post).toHaveBeenCalledTimes(2);
    const bodies = bodiesOf(post);
    expect(post.mock.calls.map((call) => call[0])).toEqual(["/api/fair/lead", "/api/fair/lead"]);
    expect(bodies.map((body) => body.eventModelId)).toEqual(["m1", "m2"]); // one by one, in the visitor's order
    expect(bodies.map((body) => body.kind)).toEqual(["test_drive", "test_drive"]);
    expect(bodies[0]).toEqual({
      eventModelId: "m1",
      kind: "test_drive",
      submissionId: submissionIds.m1,
      ...contact,
      consentAccepted: true,
      consentVersion: 3,
    });
    expect(submissionIds.m1).toMatch(/^[0-9a-f]{32}$/);
    expect(submissionIds.m2).toMatch(/^[0-9a-f]{32}$/);
    expect(submissionIds.m1).not.toBe(submissionIds.m2);
  });

  test("interest kind maps to the API kind 'interest'", async () => {
    const post = fakePost();
    await send({ ...input(), kind: "interest", eventModelIds: ["m1"] }, post);
    expect(post.mock.calls[0][1]).toMatchObject({ eventModelId: "m1", kind: "interest", consentVersion: 3 });
  });

  test("the second model fails: [ok, not-ok] with the code; the first result stands", async () => {
    const post = fakePost(lead("m1"), DOWN);
    const results = await send(input(), post);
    expect(results).toEqual([
      { eventModelId: "m1", ok: true },
      { eventModelId: "m2", ok: false, code: "SERVICE_UNAVAILABLE" },
    ]);
    expect(post).toHaveBeenCalledTimes(2);
  });

  test("retry of the failed model only, with the SAME submissionIds object: same key, nothing regenerated", async () => {
    const post = fakePost(lead("m1"), DOWN);
    const submissionIds: Record<string, string> = {};

    const first = await send(input(submissionIds), post); // m1 ok, m2 down
    expect(first[1]).toEqual({ eventModelId: "m2", ok: false, code: "SERVICE_UNAVAILABLE" });
    const m1Key = submissionIds.m1;
    const m2Key = submissionIds.m2;
    expect(m1Key).toMatch(/^[0-9a-f]{32}$/);
    expect(m2Key).toMatch(/^[0-9a-f]{32}$/);

    const retry = await send({ ...input(submissionIds), eventModelIds: ["m2"] }, post); // the same object, failed ids only
    expect(retry).toEqual([{ eventModelId: "m2", ok: true }]);
    expect(post.mock.calls[2][1]).toMatchObject({ eventModelId: "m2", kind: "test_drive", submissionId: m2Key, consentVersion: 3 });
    expect(submissionIds).toEqual({ m1: m1Key, m2: m2Key }); // the retry rewrote and added nothing
  });
});
