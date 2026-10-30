/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { afterEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import payload from "../docs/events/auto-moto-fest-2026/intake/prod-2026-10-30/b1-payload-dev.json";
import type { FairImportPayload } from "./fairImport";
import { bumpFairCount, readFairCount } from "./lib/fairCountShards";
import { fairAudienceVoteKey } from "./lib/fairInteractions";

const modules = import.meta.glob("./**/*.ts");
const actorEmail = "amf-review@example.invalid";
const now = Date.parse("2026-10-30T08:27:23+01:00");
afterEach(() => vi.useRealTimers());

async function setup() {
  process.env.SCANME_ADMIN_EMAILS = actorEmail;
  process.env.FAIR_LEADS_ENABLED = "true";
  vi.useFakeTimers();
  vi.setSystemTime(now);
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  const userId = await t.run(ctx => ctx.db.insert("users", { email: actorEmail }));
  const { eventId } = await t.mutation(internal.fairSetup.bootstrapEvent, { actorEmail, eventCode: payload.eventCode });
  await t.mutation(internal.fairSetup.importCommit, { actorEmail, payload: payload as FairImportPayload });
  await t.mutation(internal.fairSetup.publishEventModels, { actorEmail, eventCode: payload.eventCode });
  const models = await t.run(ctx => ctx.db.query("fairEventModels").collect());
  return { t, eventId, models, admin: t.withIdentity({ subject: userId }) };
}

test("review patches only specs/secondary price, rejects stale input and can be repeated", async () => {
  const { t, models } = await setup();
  const changes = models.map(m => ({ slug: m.slug, expectedSpecifications: m.specifications, specifications: m.specifications.map((s, i) => i === 0 ? { ...s, label: s.label + " TEST" } : s), ...(m.priceSecondaryText ? { expectedSecondary: m.priceSecondaryText, priceSecondaryText: m.priceSecondaryText } : {}) }));
  await expect(t.mutation(internal.fairAmfReview.applySpecs, { models: changes.map((m, i) => i === 17 ? { ...m, expectedSpecifications: [] } : m) })).rejects.toThrow("AMF_REVIEW_STALE");
  expect(await t.run(ctx => ctx.db.query("fairEventModels").collect())).toEqual(models);
  expect(await t.mutation(internal.fairAmfReview.applySpecs, { models: changes })).toEqual({ updated: 18, unchanged: 0 });
  expect(await t.mutation(internal.fairAmfReview.applySpecs, { models: changes })).toEqual({ updated: 0, unchanged: 18 });
  expect((await t.run(ctx => ctx.db.query("fairEventModels").collect())).map(m => m.priceText)).toEqual(models.map(m => m.priceText));
});

test("AMF Starter setup, public form and admin projection use the same scoped right", async () => {
  const { t, models, admin, eventId } = await setup();
  const result = await t.mutation(internal.fairSetup.setupLeads, {
    actorEmail, eventCode: payload.eventCode, consentText: "TEST saglasnost {izlagac}", legalApprovedBy: "TEST",
    configs: payload.participations.map(p => ({ participationExternalKey: p.externalKey, leadKind: "test_drive" as const, contactRequirement: p.externalKey.endsWith("grand-motors") ? "phone" as const : "one_of" as const })),
  });
  expect(result).toMatchObject({ modelConfigs: 18, skippedNotEntitled: 0 });
  const mg = models.find(m => m.slug === "mg-hs-hybrid")!;
  const form = await t.query(api.fairPublic.getLeadForm, { eventModelId: mg._id, kind: "test_drive" });
  expect(form).toMatchObject({ state: "open", contactRequirement: "phone", collectOptionalEmail: true });
  if (form.state === "open") {
    expect(form.modelChoices?.[0].id).toBe(mg._id);
    expect(form.modelChoices).toHaveLength(7);
  }
  const forms = await admin.query(api.fairLeadsAdmin.getEventLeadForms, { eventId });
  expect(forms.models.every(m => m.testDrive.entitled && m.testDrive.config?.enabled)).toBe(true);
});

test.each([1, 2])("vote cleanup with %i candidates corrects counters only when unambiguous", async count => {
  const { t, models, eventId } = await setup();
  const ids = await t.run(async ctx => {
    const model = models.find(m => m.slug === "skoda-octavia")!;
    const day = (await ctx.db.query("fairEventDays").withIndex("by_eventId_and_dateKey", q => q.eq("eventId", eventId)).first())!;
    const questionId = await ctx.db.insert("fairAudienceQuestions", { eventId, eventModelId: model._id, eventDayId: day._id, prompt: "Koji Škoda automobil sa našeg štanda vam je privukao najviše pažnje?", options: [{ id: "kodiaq", label: "Kodiaq", order: 1 }, { id: "fabia", label: "Fabia", order: 2 }], sortOrder: 1, status: "published", startsAt: now, showOnSponsoredRotation: false, createdAt: now, updatedAt: now });
    const voteIds = [];
    for (let i = 0; i < count; i++) {
      const visitorId = await ctx.db.insert("fairVisitors", { visitorHash: String(i).padStart(64, "a"), firstSeenAt: now, lastSeenAt: now });
      voteIds.push(await ctx.db.insert("fairAudienceVotes", { visitorId, eventId, eventModelId: model._id, questionId, optionId: "kodiaq", createdAt: now, updatedAt: now }));
      await bumpFairCount(ctx, fairAudienceVoteKey(questionId, "kodiaq"), 1);
    }
    return { questionId, voteIds };
  });
  const run = () => t.mutation(internal.fairAmfReview.removeAccidentalVote, { expectedVoteId: ids.voteIds[0], expectedUpdatedAt: now });
  if (count === 1) {
    expect(await run()).toEqual({ deleted: 1, counterCorrected: true });
    expect(await run()).toEqual({ deleted: 0, counterCorrected: false });
  } else await expect(run()).rejects.toThrow("AMF_VOTE_AMBIGUOUS");
  expect(await t.run(ctx => readFairCount(ctx, fairAudienceVoteKey(ids.questionId, "kodiaq")))).toBe(count === 1 ? 0 : 2);
});
