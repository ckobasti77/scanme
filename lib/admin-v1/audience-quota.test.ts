import { describe, expect, test } from "vitest";
import { fairAudienceQuestionsRemaining } from "@/lib/fair-entitlements";
import {
  audienceDisplayStatus,
  audienceDraftBlock,
  audienceListRows,
  audienceMatrix,
  audienceMatrixGaps,
  audiencePublishBlock,
  audienceQuota,
  audienceStatusCounts,
  audienceTierNow,
  canSetSponsored,
  defaultAudienceDayId,
  nextAudienceSortOrder,
  type QuotaModel,
  type QuotaQuestion,
} from "./audience-quota";

// Admin UX A6 — Glas publike quota before saving (MASTER §4.4, §9.1;
// lib/fair-entitlements), statuses and the model × day matrix.

const H = 3_600_000;
const D1 = Date.parse("2026-10-09T09:00:00+02:00");
const days = [
  { id: "d1", startsAt: D1, endsAt: D1 + 10 * H },
  { id: "d2", startsAt: D1 + 24 * H, endsAt: D1 + 34 * H },
  { id: "d3", startsAt: D1 + 48 * H, endsAt: D1 + 58 * H },
];
const NOW = D1 + 3 * H; // noon of day 1
const starter: QuotaModel = { id: "s", tier: "starter", packageActivatedAt: D1 - H };
const advanced: QuotaModel = { id: "a", tier: "advanced", packageActivatedAt: D1 - H };
const included: QuotaModel = { id: "i", tier: "included", packageActivatedAt: D1 - H };
const q = (id: string, modelId: string, dayId: string, status: QuotaQuestion["status"], showOnSponsoredRotation = false): QuotaQuestion => ({ id, modelId, dayId, status, showOnSponsoredRotation });

describe("quota", () => {
  test("Starter 1 per day, Napredni 5; published and closed count, drafts do not", () => {
    const questions = [q("1", "s", "d1", "published"), q("2", "s", "d1", "draft"), q("3", "a", "d1", "closed"), q("4", "a", "d1", "published"), q("5", "a", "d2", "published")];
    expect(audienceQuota(starter, "d1", questions, NOW)).toEqual({ tier: "starter", limit: 1, used: 1, drafts: 1, remaining: 0, pending: null });
    expect(audienceQuota(advanced, "d1", questions, NOW)).toMatchObject({ tier: "advanced", limit: 5, used: 2, remaining: 3 });
    expect(audienceQuota(starter, "d2", questions, NOW)).toMatchObject({ used: 0, remaining: 1 });
  });

  test("over the quota: the draft may be saved, publishing is blocked", () => {
    const full = audienceQuota(starter, "d1", [q("1", "s", "d1", "published")], NOW);
    expect(audienceDraftBlock(full)).toBeNull();
    expect(audiencePublishBlock(full)).toBe("day_limit");
    const free = audienceQuota(starter, "d1", [], NOW);
    expect(audiencePublishBlock(free)).toBeNull();
  });

  test("upgrade on the fair day: the Starter question counts toward the 5 (MASTER §4.4), same as the backend rule", () => {
    const questions = [q("1", "u", "d1", "published")];
    const upgraded: QuotaModel = { id: "u", tier: "advanced", packageActivatedAt: NOW - H };
    const quota = audienceQuota(upgraded, "d1", questions, NOW);
    expect(quota).toMatchObject({ tier: "advanced", limit: 5, used: 1, remaining: 4 });
    expect(quota.remaining).toBe(fairAudienceQuestionsRemaining("advanced", 1));
  });

  test("a package not in force yet has no quota (convex fairModelTierAt) and says from when", () => {
    const pending: QuotaModel = { id: "p", tier: "starter", packageActivatedAt: D1 + 24 * H };
    expect(audienceTierNow(pending, NOW)).toBe("included");
    const quota = audienceQuota(pending, "d1", [], NOW);
    expect(quota).toMatchObject({ limit: 0, pending: { tier: "starter", from: D1 + 24 * H } });
    expect(audienceDraftBlock(quota)).toBe("pending_package");
    expect(audienceDraftBlock(audienceQuota(included, "d1", [], NOW))).toBe("not_entitled");
    expect(audiencePublishBlock(audienceQuota(included, "d1", [], NOW))).toBe("not_entitled");
  });
});

describe("statuses", () => {
  test("Nacrt / Objavljeno / Sponzorisano / Zatvoreno", () => {
    expect(audienceDisplayStatus(q("1", "a", "d1", "draft"))).toBe("draft");
    expect(audienceDisplayStatus(q("1", "a", "d1", "published"))).toBe("published");
    expect(audienceDisplayStatus(q("1", "a", "d1", "published", true))).toBe("sponsored");
    expect(audienceDisplayStatus(q("1", "a", "d1", "closed", true))).toBe("closed");
  });

  test("Postavi kao sponzorisano: only a published question of a model with Napredni in force", () => {
    expect(canSetSponsored(q("1", "a", "d1", "published"), advanced, NOW)).toBe(true);
    expect(canSetSponsored(q("1", "a", "d1", "published", true), advanced, NOW)).toBe(false);
    expect(canSetSponsored(q("1", "a", "d1", "draft"), advanced, NOW)).toBe(false);
    expect(canSetSponsored(q("1", "a", "d1", "closed"), advanced, NOW)).toBe(false);
    expect(canSetSponsored(q("1", "s", "d1", "published"), starter, NOW)).toBe(false);
    expect(canSetSponsored(q("1", "a", "d1", "published"), { tier: "advanced", packageActivatedAt: NOW + H }, NOW)).toBe(false);
  });
});

describe("matrix model × day", () => {
  const questions = [q("1", "s", "d1", "published"), q("2", "a", "d1", "published"), q("3", "a", "d1", "draft"), q("4", "a", "d2", "published"), q("5", "a", "d2", "closed")];
  const rows = audienceMatrix([starter, advanced, included, { ...starter, id: "w", status: "withdrawn" }], days, questions, NOW);

  test("only Starter/Napredni models that are not withdrawn; cells = published / quota", () => {
    expect(rows.map((row) => row.modelId)).toEqual(["s", "a"]);
    expect(rows[0].cells.map((cell) => `${cell.used}/${cell.limit}`)).toEqual(["1/1", "0/1", "0/1"]);
    expect(rows[1].cells.map((cell) => `${cell.used}/${cell.limit}`)).toEqual(["1/5", "2/5", "0/5"]);
    expect(rows[1].cells[0]).toMatchObject({ drafts: 1, state: "partial", today: true, past: false });
    expect(rows[0].cells[0].state).toBe("full");
  });

  test("empty cells today and later are highlighted; a past day is not", () => {
    expect(rows[0].cells.map((cell) => cell.highlight)).toEqual([false, true, true]);
    expect(audienceMatrixGaps(rows)).toBe(3);
    const later = audienceMatrix([starter], days, [], D1 + 30 * H);
    expect(later[0].cells.map((cell) => [cell.past, cell.today, cell.highlight])).toEqual([[true, false, false], [false, true, true], [false, false, true]]);
  });

  test("the form opens on the URL day, else today, else the next fair day", () => {
    expect(defaultAudienceDayId(days, NOW, "d3")).toBe("d3");
    expect(defaultAudienceDayId(days, NOW, "nepoznat")).toBe("d1");
    expect(defaultAudienceDayId(days, D1 - 48 * H)).toBe("d1");
    expect(defaultAudienceDayId(days, D1 + 12 * H)).toBe("d2");
    expect(defaultAudienceDayId(days, D1 + 100 * H)).toBe("d1");
  });
});

describe("list", () => {
  const questions = [
    { ...q("x", "a", "d2", "published", true), sortOrder: 1 },
    { ...q("y", "s", "d1", "draft"), sortOrder: 1 },
    { ...q("z", "a", "d1", "closed"), sortOrder: 2 },
    { ...q("w", "a", "d1", "published"), sortOrder: 1 },
  ];
  const exhibitorOf = (id: string) => (id === "s" ? "e1" : "e2");

  test("ordered by day, model, sortOrder; filtered by status and exhibitor", () => {
    expect(audienceListRows(questions, {}, ["d1", "d2"], ["s", "a"], exhibitorOf).map((row) => row.id)).toEqual(["y", "w", "z", "x"]);
    expect(audienceListRows(questions, { status: "sponzorisano" }, ["d1", "d2"], ["s", "a"], exhibitorOf).map((row) => row.id)).toEqual(["x"]);
    expect(audienceListRows(questions, { status: "objavljeno" }, ["d1", "d2"], ["s", "a"], exhibitorOf).map((row) => row.id)).toEqual(["w"]);
    expect(audienceListRows(questions, { izlagac: "e1" }, ["d1", "d2"], ["s", "a"], exhibitorOf).map((row) => row.id)).toEqual(["y"]);
    expect(audienceListRows(questions, { status: "nepoznato" }, ["d1", "d2"], ["s", "a"], exhibitorOf)).toHaveLength(4);
    expect(audienceStatusCounts(questions, undefined, exhibitorOf)).toEqual({ draft: 1, published: 1, sponsored: 1, closed: 1 });
    expect(audienceStatusCounts(questions, "e2", exhibitorOf)).toEqual({ draft: 0, published: 1, sponsored: 1, closed: 1 });
  });

  test("a new question goes after the model's last one", () => {
    expect(nextAudienceSortOrder(questions, "a")).toBe(3);
    expect(nextAudienceSortOrder(questions, "nov")).toBe(1);
  });
});
