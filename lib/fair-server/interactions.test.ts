// Sajam 2026 B3 — the visitor interaction gateway (BACKEND-HANDOFF §4.2, §7):
// same-origin POST, strict bounded body, visitor hash only from the HttpOnly
// cookie, stable error codes, no-store.

import { ConvexError } from "convex/values";
import { describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
const {
  fairErrorCodeOf,
  handleFairAudienceVote,
  handleFairFavorite,
  handleFairModelState,
  handleFairPassport,
  handleFairRating,
  handleFairSurvey,
} = await import("./interactions");
const { FAIR_VISITOR_COOKIE_NAME, fairVisitorHash, generateFairVisitorToken } = await import("./visitor");

const NOW = Date.parse("2026-10-09T10:00:00+02:00");
const SECRET = "test-fair-visitor-secret-0123456789abcdef";
const ENV = { secret: SECRET, nodeEnv: "production" };

function post(path: string, body: unknown, headers: Record<string, string> = { "sec-fetch-site": "same-origin" }) {
  return new Request(`https://scanme.rs/api/fair/${path}`, { method: "POST", headers, body: JSON.stringify(body) });
}

function backend() {
  return {
    getMyModelState: vi.fn(async () => ({ eventModelId: "m1", rating: { mode: "overall" as const }, audience: [], survey: { state: "none" as const }, passport: null })),
    getMyPassportProgress: vi.fn(async () => null),
    upsertRating: vi.fn(async () => ({ mode: "overall" as const, overall: 4 as const })),
    upsertAudienceVote: vi.fn(async () => ({ questionId: "q1", state: "waiting_for_minimum" as const, myOptionId: "a" })),
    submitSurvey: vi.fn(async () => ({ surveyId: "s1", version: 1, submittedAt: NOW, duplicate: false })),
    upsertBrandFavorite: vi.fn(async () => ({ passportId: "p1", stampedModelIds: [], stampedCount: 0, requiredCount: 2, completed: false })),
  };
}

describe("visitor identity comes only from the cookie", () => {
  test("a new device gets a cookie; the backend sees the HMAC, never the token", async () => {
    const fake = backend();
    const response = await handleFairRating(post("rating", { eventModelId: "m1", overall: 4 }), { now: NOW, env: ENV, backend: fake });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ ok: true, value: { mode: "overall", overall: 4 } });
    const cookie = response.headers.get("set-cookie")!;
    const token = cookie.split(";")[0].split("=")[1];
    expect(cookie).toContain("HttpOnly");
    const args = fake.upsertRating.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(args[0]).toEqual({ visitorHash: fairVisitorHash(token, SECRET), eventModelId: "m1", overall: 4 });
    expect(JSON.stringify(args)).not.toContain(token);
  });

  test("an existing cookie is reused without Set-Cookie; a body cannot carry its own visitorHash", async () => {
    const fake = backend();
    const token = generateFairVisitorToken();
    const headers = { "sec-fetch-site": "same-origin", cookie: `${FAIR_VISITOR_COOKIE_NAME}=${token}` };
    const ok = await handleFairModelState(post("model-state", { eventModelId: "m1" }, headers), { now: NOW, env: ENV, backend: fake });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("set-cookie")).toBeNull();
    expect(fake.getMyModelState).toHaveBeenCalledWith({ visitorHash: fairVisitorHash(token, SECRET), eventModelId: "m1" });

    const injected = await handleFairModelState(post("model-state", { eventModelId: "m1", visitorHash: "f".repeat(64) }, headers), { now: NOW, env: ENV, backend: fake });
    expect(injected.status).toBe(400);
    expect(await injected.json()).toEqual({ ok: false, code: "INVALID_INPUT" });
    expect(fake.getMyModelState).toHaveBeenCalledTimes(1);
  });

  test("production without the secret → 503 VISITOR_UNAVAILABLE and no Convex call", async () => {
    const fake = backend();
    const response = await handleFairPassport(post("passport", { eventSlug: "test-elektromobilnost-2026" }), { now: NOW, env: { nodeEnv: "production" }, backend: fake });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, code: "VISITOR_UNAVAILABLE" });
    expect(fake.getMyPassportProgress).not.toHaveBeenCalled();
  });
});

describe("guards", () => {
  test("cross-site writes and malformed bodies are refused before Convex", async () => {
    const fake = backend();
    const deps = { now: NOW, env: ENV, backend: fake };
    const cross = await handleFairAudienceVote(post("audience-vote", { questionId: "q1", optionId: "a" }, { origin: "https://evil.example" }), deps);
    expect(cross.status).toBe(403);
    for (const [handler, body] of [
      [handleFairAudienceVote, { questionId: "q1" }],
      [handleFairAudienceVote, ["q1", "a"]],
      [handleFairRating, { eventModelId: "m1", overall: "5" }],
      [handleFairSurvey, { surveyId: "s1", submissionId: "sub-00001", answers: [{ questionId: "q1", value: "yes", extra: 1 }] }],
      [handleFairSurvey, { surveyId: "s1", submissionId: "sub-00001", answers: Array.from({ length: 6 }, () => ({ questionId: "q1", value: "yes" })) }],
      [handleFairFavorite, { passportId: "p1" }],
      [handleFairPassport, { eventSlug: "" }],
    ] as const) {
      const response = await handler(post("x", body), deps);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ ok: false, code: "INVALID_INPUT" });
    }
    for (const fn of Object.values(fake)) expect(fn).not.toHaveBeenCalled();
  });

  test("Convex error codes map to stable statuses; unknown failures never leak a message", async () => {
    const cases: Array<[string, number]> = [
      ["FEATURE_NOT_ENTITLED", 403], ["RATE_LIMITED", 429], ["FAIR_MODEL_NOT_FOUND", 404], ["QUESTION_NOT_OPEN", 409],
      ["SURVEY_ALREADY_SUBMITTED", 409], ["SUBMISSION_DUPLICATE", 409], ["PASSPORT_NOT_COMPLETE", 409], ["INVALID_INPUT", 400],
    ];
    for (const [code, status] of cases) {
      const fake = backend();
      fake.submitSurvey.mockRejectedValueOnce(new ConvexError({ code }));
      const response = await handleFairSurvey(post("survey", { surveyId: "s1", submissionId: "sub-00001", answers: [{ questionId: "q1", value: "yes" }] }), { now: NOW, env: ENV, backend: fake });
      expect(response.status).toBe(status);
      expect(response.headers.get("set-cookie")).toBeNull();
      expect(await response.json()).toEqual({ ok: false, code });
    }
    const fake = backend();
    fake.upsertBrandFavorite.mockRejectedValueOnce(new Error("Server Error: interni detalj sa kontaktom"));
    const response = await handleFairFavorite(post("passport/favorite", { passportId: "p1", eventModelId: "m1" }), { now: NOW, env: ENV, backend: fake });
    expect(response.status).toBe(502);
    expect(await response.text()).toBe(JSON.stringify({ ok: false, code: "SERVICE_UNAVAILABLE" }));
    expect(fairErrorCodeOf(new ConvexError({ code: "NOT_A_FAIR_CODE" }))).toBeNull();
    const missing = await handleFairFavorite(post("passport/favorite", { passportId: "p1", eventModelId: "m1" }), { now: NOW, env: ENV, backend: null });
    expect(missing.status).toBe(503);
  });
});
