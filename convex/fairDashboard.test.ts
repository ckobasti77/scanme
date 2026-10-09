/// <reference types="vite/client" />

// Admin UX A10 — `Događaji → Pregled` (fairDashboard.getEventDashboard): every
// rule of A0-IZVESTAJ §6 on the TEST catalog (fairDevFixtures.seedTestCatalog),
// the phases (pre, sajam day N of M, posle, obrisano) and their deadlines, the
// bounds (`capped`), and authz. The query is called with an explicit `at`.

import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { FAIR_DASHBOARD_LEADS_CAP, FAIR_DASHBOARD_STANDS_CAP } from "./fairDashboard";
import { fairFollowUpAt } from "./lib/fairLeads";
import { FAIR_LEAD_DELIVERY_DEADLINE_MS, FAIR_PII_PURGE_AT_MS, type FairDashboardRule } from "../lib/fair-contract";

const modules = import.meta.glob("./**/*.ts");
const ADMIN_EMAIL = "fair-a10-dashboard@scanme.test";
const ISSUER = "https://fair-a10-dashboard.test";
const EM = "test-elektromobilnost-2026";
const SEED_AT = Date.parse("2026-10-05T10:00:00+02:00");
const OPENING = Date.parse("2026-10-09T00:00:00+02:00");
const CLOSE = Date.parse("2026-10-12T00:00:00+02:00");
const at = (iso: string) => Date.parse(iso);
const MODELS = ["volta-x1", "volta-x2", "amper-y1", "amper-y2", "om-z1", "om-z2"] as const;
type ModelKey = (typeof MODELS)[number];

beforeEach(() => {
  process.env.SCANME_ADMIN_EMAILS = ADMIN_EMAIL;
  delete process.env.FAIR_LEADS_ENABLED;
  delete process.env.FAIR_FOLLOWUP_ENABLED;
  vi.useFakeTimers();
  vi.setSystemTime(SEED_AT);
});
afterEach(() => {
  delete process.env.FAIR_LEADS_ENABLED;
  delete process.env.FAIR_FOLLOWUP_ENABLED;
  vi.useRealTimers();
});

async function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  const { adminId, memberId } = await t.run(async (ctx) => ({
    adminId: await ctx.db.insert("users", { email: ADMIN_EMAIL }),
    memberId: await ctx.db.insert("users", { email: "clan@example.invalid" }),
  }));
  await t.mutation(internal.fairDevFixtures.seedTestCatalog, {});
  const admin = t.withIdentity({ subject: adminId, issuer: ISSUER });
  const member = t.withIdentity({ subject: memberId, issuer: ISSUER });
  const ids = await t.run(async (ctx) => {
    const event = (await ctx.db.query("fairEvents").withIndex("by_code", (q) => q.eq("code", EM)).unique())!;
    const models = {} as Record<ModelKey, Id<"fairEventModels">>;
    for (const key of MODELS) {
      models[key] = (await ctx.db.query("fairEventModels").withIndex("by_eventId_and_externalKey", (q) => q.eq("eventId", event._id).eq("externalKey", `test-em26-${key}`)).unique())!._id;
    }
    const participation = async (key: string) => (await ctx.db.query("fairParticipations").withIndex("by_eventId_and_externalKey", (q) => q.eq("eventId", event._id).eq("externalKey", key)).unique())!._id;
    const day = async (dateKey: string) => (await ctx.db.query("fairEventDays").withIndex("by_eventId_and_dateKey", (q) => q.eq("eventId", event._id).eq("dateKey", dateKey)).unique())!._id;
    const stands = (await ctx.db.query("fairStands").withIndex("by_eventId_and_externalKey", (q) => q.eq("eventId", event._id)).take(10)).map((row) => row._id);
    return {
      eventId: event._id,
      models,
      a: await participation("test-em26-izlagac-a"),
      b: await participation("test-em26-izlagac-b"),
      day1: await day("2026-10-09"),
      day2: await day("2026-10-10"),
      day3: await day("2026-10-11"),
      stands,
    };
  });
  const dash = (moment: number) => admin.query(api.fairDashboard.getEventDashboard, { eventId: ids.eventId, at: moment });
  return { t, admin, member, adminId, ...ids, dash };
}
type Fixture = Awaited<ReturnType<typeof setup>>;
type Dashboard = Awaited<ReturnType<Fixture["dash"]>>;

const action = (dashboard: Dashboard, rule: FairDashboardRule) => dashboard.actions.find((row) => row.rule === rule);
const rules = (dashboard: Dashboard) => dashboard.actions.map((row) => row.rule);

/** Every paid TEST package in force from `moment` (the seed starts them at the opening). */
async function activatePackagesAt(f: Fixture, moment: number) {
  await f.t.run(async (ctx) => {
    for (const id of Object.values(f.models)) {
      const model = (await ctx.db.get(id))!;
      if (model.packageTier !== "included") await ctx.db.patch(id, { packageActivatedAt: moment });
    }
  });
}

async function addQuestion(f: Fixture, model: ModelKey, dayId: Id<"fairEventDays">, options: { status?: "published" | "closed" | "draft"; sponsored?: boolean } = {}) {
  return f.t.run(async (ctx) => {
    const day = (await ctx.db.get(dayId))!;
    return ctx.db.insert("fairAudienceQuestions", {
      eventId: f.eventId, eventDayId: dayId, eventModelId: f.models[model], prompt: "TEST pitanje?",
      options: [{ id: "o1", label: "TEST da", order: 1 }, { id: "o2", label: "TEST ne", order: 2 }],
      status: options.status ?? "published", sortOrder: 1, startsAt: day.startsAt, endsAt: day.endsAt,
      showOnSponsoredRotation: options.sponsored ?? false, createdAt: SEED_AT, updatedAt: SEED_AT,
    });
  });
}

async function addLead(f: Fixture, model: ModelKey, participationId: Id<"fairParticipations">, createdAt: number, status: "received" | "delivered" = "received") {
  await f.t.run(async (ctx) => {
    const visitorId = await ctx.db.insert("fairVisitors", { visitorHash: `${createdAt}`.padStart(64, "a"), firstSeenAt: createdAt, lastSeenAt: createdAt });
    await ctx.db.insert("fairLeads", {
      submissionId: `test-a10-${createdAt}-${model}`, kind: "interest", visitorId, eventId: f.eventId, eventModelId: f.models[model], participationId,
      contactName: "TEST Posetilac A10", email: "posetilac.a10@example.invalid", consentAccepted: true, consentVersion: 1, consentTextSnapshot: "TEST saglasnost",
      consentedAt: createdAt, status, followUpSuppressed: false, createdAt, purgeAt: FAIR_PII_PURGE_AT_MS,
    });
  });
}

async function addRun(f: Fixture, dayId: Id<"fairEventDays">, participationId: Id<"fairParticipations">, status: "pending_review" | "failed" | "sent", createdAt: number) {
  await f.t.run(async (ctx) => {
    await ctx.db.insert("fairReportRuns", { eventId: f.eventId, eventDayId: dayId, participationId, status, dataThrough: createdAt, format: "pdf", createdAt, updatedAt: createdAt });
  });
}

describe("A10 dashboard phases", () => {
  test("pre / sajam dan N od M / posle / obrisano, each with the deadline the header counts down to", async () => {
    const f = await setup();
    const pre = await f.dash(at("2026-10-05T12:00:00+02:00"));
    expect(pre.phase).toEqual({ kind: "pre", dayIndex: null, dayCount: 3, dayOpen: false, nextDeadline: { kind: "opening", at: OPENING } });
    expect(pre.days.map((day) => day.dateKey)).toEqual(["2026-10-09", "2026-10-10", "2026-10-11"]);

    const day1 = await f.dash(at("2026-10-09T10:00:00+02:00"));
    expect(day1.phase).toEqual({ kind: "sajam", dayIndex: 1, dayCount: 3, dayOpen: true, nextDeadline: { kind: "day_end", at: at("2026-10-10T00:00:00+02:00") } });
    const day3 = await f.dash(at("2026-10-11T23:30:00+02:00"));
    expect(day3.phase).toMatchObject({ kind: "sajam", dayIndex: 3, dayCount: 3, dayOpen: true, nextDeadline: { kind: "day_end", at: CLOSE } });

    const after = await f.dash(at("2026-10-20T10:00:00+02:00"));
    expect(after.phase).toEqual({ kind: "posle", dayIndex: null, dayCount: 3, dayOpen: false, nextDeadline: { kind: "lead_delivery", at: FAIR_LEAD_DELIVERY_DEADLINE_MS } });

    const purged = await f.dash(FAIR_PII_PURGE_AT_MS);
    expect(purged.phase).toEqual({ kind: "obrisano", dayIndex: null, dayCount: 3, dayOpen: false, nextDeadline: null });
  });

  test("the rules follow the phase: preparation before, today during, delivery and deletion after", async () => {
    const f = await setup();
    await addRun(f, f.day1, f.a, "failed", at("2026-10-10T01:00:00+02:00"));
    await addLead(f, "volta-x2", f.a, at("2026-10-10T11:00:00+02:00"));
    const far = await f.dash(at("2026-10-01T10:00:00+02:00"));
    expect(action(far, "published_without_qr")).toMatchObject({ tone: "uskoro" });
    expect(rules(far)).not.toContain("leads_switch_off");
    expect(rules(far)).not.toContain("pii_purge_countdown");

    const fair = await f.dash(at("2026-10-10T10:00:00+02:00"));
    expect(action(fair, "published_without_qr")).toMatchObject({ tone: "hitno" });
    expect(action(fair, "leads_undelivered")).toMatchObject({ tone: "info", count: 1 });
    expect(action(fair, "reports_failed")).toMatchObject({ tone: "hitno", count: 1 });

    const after = await f.dash(at("2026-10-20T10:00:00+02:00"));
    for (const rule of ["published_without_qr", "price_missing", "advanced_photo_missing", "question_missing_today", "sponsored_question_missing", "leads_switch_off"] as const) {
      expect(rules(after)).not.toContain(rule);
    }
    expect(action(after, "leads_undelivered")).toMatchObject({ tone: "uskoro", count: 1, deadlineAt: FAIR_LEAD_DELIVERY_DEADLINE_MS });
    expect(action(after, "pii_purge_countdown")).toMatchObject({ tone: "info", count: 26, section: "brisanje" });

    const purged = await f.dash(FAIR_PII_PURGE_AT_MS + 3_600_000);
    expect(purged.actions).toEqual([]);
    expect(purged.kpis.models.published).toBe(6);
  });
});

describe("A10 dashboard rules (A0-IZVESTAJ §6)", () => {
  test("catalog and QR: model without QR, errors on published and draft models, price fallback, QR on a withdrawn model, inventory", async () => {
    const f = await setup();
    const soon = at("2026-10-07T10:00:00+02:00");
    let d = await f.dash(soon);
    expect(action(d, "published_without_qr")).toEqual({ rule: "published_without_qr", tone: "hitno", count: 6, section: "modeli", query: { status: "objavljen", qr: "nema" } });
    expect(rules(d)).not.toContain("published_with_errors");
    expect(rules(d)).not.toContain("qr_inventory_missing");
    // amper-y1, amper-y2 and om-z1 have no price in the TEST import → "Cena na upit".
    expect(action(d, "price_missing")).toEqual({ rule: "price_missing", tone: "uskoro", count: 3, section: "modeli", query: { problemi: "upozorenja" } });

    await f.t.mutation(internal.fairDevFixtures.seedTestQr, { eventCode: EM, modelExternalKey: "test-em26-volta-x2" });
    await f.t.run(async (ctx) => {
      await ctx.db.patch(f.models["volta-x1"], { specifications: [] });
      await ctx.db.patch(f.models["amper-y1"], { status: "draft", specifications: [] });
      await ctx.db.patch(f.models["volta-x2"], { status: "withdrawn" });
    });
    d = await f.dash(soon);
    expect(action(d, "published_without_qr")).toMatchObject({ count: 4 });
    expect(action(d, "published_with_errors")).toEqual({ rule: "published_with_errors", tone: "hitno", count: 1, section: "modeli", query: { status: "objavljen", problemi: "greske" } });
    expect(action(d, "drafts_with_errors")).toEqual({ rule: "drafts_with_errors", tone: "uskoro", count: 1, section: "modeli", query: { status: "nacrt", problemi: "greske" } });
    // amper-y1 now has an error: it is counted there, not under the price warning.
    expect(action(d, "price_missing")).toMatchObject({ count: 2 });
    expect(action(d, "qr_on_withdrawn")).toEqual({ rule: "qr_on_withdrawn", tone: "hitno", count: 1, section: "modeli", query: { status: "povucen", qr: "ima" } });

    await f.t.run(async (ctx) => ctx.db.patch(f.eventId, { qrInventoryBusinessId: undefined }));
    d = await f.dash(soon);
    expect(action(d, "qr_inventory_missing")).toEqual({ rule: "qr_inventory_missing", tone: "hitno", count: 1, section: "qr", query: {} });
    expect(d.kpis.qr.inventory).toBeNull();
  });

  test("Glas publike: today's question (hitno until noon, then uskoro) and the first day's questions 48 h ahead", async () => {
    const f = await setup();
    // In force from the opening (seed): 4 models with questions (2 Starter, 2 Napredni).
    let d = await f.dash(at("2026-10-10T10:00:00+02:00"));
    expect(action(d, "question_missing_today")).toEqual({ rule: "question_missing_today", tone: "hitno", count: 4, section: "interakcije", query: { dan: "2026-10-10" } });
    expect(d.kpis.questions).toEqual({ dateKey: "2026-10-10", label: "TEST dan 2", today: true, covered: 0, required: 4, capped: false });

    await addQuestion(f, "volta-x2", f.day2);
    await addQuestion(f, "om-z1", f.day2, { status: "closed" });
    await addQuestion(f, "amper-y1", f.day2, { status: "draft" });
    await addQuestion(f, "volta-x1", f.day1);
    d = await f.dash(at("2026-10-10T14:00:00+02:00"));
    expect(action(d, "question_missing_today")).toMatchObject({ tone: "uskoro", count: 2 });
    expect(d.kpis.questions).toMatchObject({ covered: 2, required: 4 });

    // Before the fair the packages are not in force yet: nothing can be asked, nothing is listed.
    expect(rules(await f.dash(at("2026-10-08T10:00:00+02:00")))).not.toContain("question_missing_next_day");
    await activatePackagesAt(f, SEED_AT);
    d = await f.dash(at("2026-10-08T10:00:00+02:00"));
    expect(action(d, "question_missing_next_day")).toEqual({ rule: "question_missing_next_day", tone: "uskoro", count: 3, section: "interakcije", query: { dan: "2026-10-09" } });
    expect(d.kpis.questions).toMatchObject({ dateKey: "2026-10-09", today: false, covered: 1, required: 4 });
    expect(rules(await f.dash(at("2026-10-06T10:00:00+02:00")))).not.toContain("question_missing_next_day");
  });

  test("Napredni: map question, photo and an out-of-date sponsored list", async () => {
    const f = await setup();
    const fairDay = at("2026-10-10T10:00:00+02:00");
    let d = await f.dash(fairDay);
    expect(action(d, "sponsored_question_missing")).toEqual({ rule: "sponsored_question_missing", tone: "uskoro", count: 2, section: "sponzorisano", query: {} });
    expect(action(d, "advanced_photo_missing")).toEqual({ rule: "advanced_photo_missing", tone: "info", count: 2, section: "modeli", query: { paket: "napredni", foto: "nema" } });
    expect(action(d, "sponsored_out_of_date")).toMatchObject({ tone: "uskoro", count: 2 });
    expect(action(await f.dash(at("2026-10-07T10:00:00+02:00")), "advanced_photo_missing")).toMatchObject({ tone: "uskoro" });

    vi.setSystemTime(fairDay);
    await f.admin.mutation(api.fairSponsoredAdmin.publishSponsoredSnapshot, { eventId: f.eventId });
    d = await f.dash(fairDay);
    expect(rules(d)).not.toContain("sponsored_out_of_date");
    expect(d.sections.sponzorisano).toEqual({ autoPublish: true, inList: 2, due: 2, withoutQuestion: 2 });

    await addQuestion(f, "volta-x1", f.day2, { sponsored: true });
    await f.t.run(async (ctx) => ctx.db.patch(f.models["om-z1"], { photoUrl: "https://example.invalid/test-om-z1.jpg" }));
    d = await f.dash(fairDay);
    expect(action(d, "sponsored_question_missing")).toMatchObject({ count: 1 });
    expect(action(d, "advanced_photo_missing")).toMatchObject({ count: 1 });
    // The snapshot still shows volta-x1 without its map question.
    expect(action(d, "sponsored_out_of_date")).toMatchObject({ count: 1 });
  });

  test("leads: forms without consent, the K3 switches, undelivered leads until 15 Nov, follow-up text", async () => {
    const f = await setup();
    const fairDay = at("2026-10-10T10:00:00+02:00");
    await f.t.run(async (ctx) => {
      for (const [participationId, leadKind] of [[f.a, "interest"], [f.b, "test_drive"], [f.a, "test_drive"]] as const) {
        await ctx.db.insert("fairParticipationLeadDefaults", { eventId: f.eventId, participationId, leadKind, enabled: participationId === f.b || leadKind === "interest", contactRequirement: "one_of", updatedByUserId: f.adminId, createdAt: SEED_AT, updatedAt: SEED_AT });
      }
    });
    let d = await f.dash(fairDay);
    expect(action(d, "interest_form_without_consent")).toEqual({ rule: "interest_form_without_consent", tone: "hitno", count: 1, section: "leadovi/podesavanja", query: {} });
    expect(action(d, "test_drive_form_without_consent")).toMatchObject({ tone: "hitno", count: 1 });
    expect(action(await f.dash(at("2026-10-01T10:00:00+02:00")), "interest_form_without_consent")).toMatchObject({ tone: "uskoro" });
    expect(action(d, "leads_switch_off")).toEqual({ rule: "leads_switch_off", tone: "hitno", count: 1, section: "leadovi/podesavanja", query: {} });
    expect(action(d, "follow_up_switch_off")).toMatchObject({ tone: "hitno" });
    expect(action(await f.dash(at("2026-10-07T10:00:00+02:00")), "leads_switch_off")).toMatchObject({ tone: "uskoro" });
    expect(action(d, "follow_up_text_missing")).toEqual({ rule: "follow_up_text_missing", tone: "uskoro", count: 2, section: "leadovi/follow-up", query: {} });
    expect(action(await f.dash(at("2026-10-07T10:00:00+02:00")), "follow_up_text_missing")).toMatchObject({ tone: "info" });

    process.env.FAIR_LEADS_ENABLED = "true";
    process.env.FAIR_FOLLOWUP_ENABLED = "true";
    await f.t.run(async (ctx) => {
      await ctx.db.insert("fairConsentConfigs", { eventId: f.eventId, leadKind: "interest", version: 1, text: "TEST {izlagac}", status: "active", activatedAt: SEED_AT, createdAt: SEED_AT, updatedAt: SEED_AT });
      await ctx.db.insert("fairExhibitorFollowUpTemplates", { eventId: f.eventId, participationId: f.a, subject: "TEST", plainText: "TEST {modeli}", status: "active", version: 1, updatedByUserId: f.adminId, createdAt: SEED_AT, updatedAt: SEED_AT });
    });
    await addLead(f, "volta-x2", f.a, at("2026-10-10T09:00:00+02:00"));
    await addLead(f, "volta-x1", f.a, at("2026-10-09T15:00:00+02:00"), "delivered");
    d = await f.dash(fairDay);
    for (const rule of ["interest_form_without_consent", "leads_switch_off", "follow_up_switch_off"] as const) expect(rules(d)).not.toContain(rule);
    expect(action(d, "test_drive_form_without_consent")).toMatchObject({ count: 1 });
    expect(action(d, "follow_up_text_missing")).toEqual({ rule: "follow_up_text_missing", tone: "uskoro", count: 1, section: "leadovi/follow-up", query: { izlagac: f.b } });
    expect(d.kpis.leads).toEqual({ newToday: 1, undelivered: 1, total: 2, capped: false });

    // After the fair: undelivered leads become urgent 3 days before 15 Nov; the follow-up text only where there are leads.
    expect(action(await f.dash(at("2026-11-13T10:00:00+01:00")), "leads_undelivered")).toMatchObject({ tone: "hitno", count: 1 });
    await f.t.run(async (ctx) => {
      const active = (await ctx.db.query("fairExhibitorFollowUpTemplates").withIndex("by_eventId_and_status", (q) => q.eq("eventId", f.eventId).eq("status", "active")).unique())!;
      await ctx.db.patch(active._id, { status: "retired" });
    });
    d = await f.dash(at("2026-10-12T12:00:00+02:00"));
    expect(action(d, "follow_up_text_missing")).toEqual({ rule: "follow_up_text_missing", tone: "hitno", count: 1, section: "leadovi/follow-up", query: { izlagac: f.a } });
    delete process.env.FAIR_FOLLOWUP_ENABLED;
    expect(action(await f.dash(at("2026-10-12T12:00:00+02:00")), "follow_up_switch_off")).toMatchObject({ tone: "hitno" });
    expect(rules(await f.dash(fairFollowUpAt(CLOSE) + 1))).not.toContain("follow_up_switch_off");
  });

  test("daily reports: waiting for approval, failed, missing after 60 minutes — the newest run decides", async () => {
    const f = await setup();
    let d = await f.dash(at("2026-10-10T00:30:00+02:00"));
    expect(rules(d)).not.toContain("reports_missing");
    d = await f.dash(at("2026-10-10T10:00:00+02:00"));
    expect(action(d, "reports_missing")).toEqual({ rule: "reports_missing", tone: "uskoro", count: 2, section: "izvestaji", query: { status: "ceka-podatke", dan: "2026-10-09" } });

    await addRun(f, f.day1, f.a, "failed", at("2026-10-10T00:10:00+02:00"));
    await addRun(f, f.day1, f.a, "pending_review", at("2026-10-10T00:20:00+02:00"));
    await addRun(f, f.day1, f.b, "failed", at("2026-10-10T00:20:00+02:00"));
    d = await f.dash(at("2026-10-10T10:00:00+02:00"));
    expect(action(d, "reports_pending_review")).toEqual({ rule: "reports_pending_review", tone: "hitno", count: 1, section: "izvestaji", query: { status: "ceka-odobrenje" } });
    expect(action(d, "reports_failed")).toEqual({ rule: "reports_failed", tone: "hitno", count: 1, section: "izvestaji", query: { status: "greska" } });
    expect(rules(d)).not.toContain("reports_missing");
    expect(d.kpis.reports).toEqual({ pendingReview: 1 });
    expect(d.sections.izvestaji).toEqual({ pendingReview: 1, failed: 1, sent: 0 });

    d = await f.dash(at("2026-10-12T10:00:00+02:00"));
    expect(action(d, "reports_missing")).toMatchObject({ count: 4, query: { status: "ceka-podatke" } });
  });

  test("brand passport: not created after the opening, hidden while eligible, frozen with a withdrawn car", async () => {
    const f = await setup();
    const fairDay = at("2026-10-10T10:00:00+02:00");
    // TEST Volta (x1 Napredni, x2 Starter) meets the condition; TEST Amper and TEST Om have an `included` model.
    let d = await f.dash(fairDay);
    expect(action(d, "passport_missing")).toEqual({ rule: "passport_missing", tone: "info", count: 1, section: "interakcije", query: { stanje: "nije-napravljen" } });
    expect(rules(await f.dash(at("2026-10-07T10:00:00+02:00")))).not.toContain("passport_missing");

    const { passportId } = await f.t.mutation(internal.fairDevFixtures.seedTestPassport, { eventCode: EM, brandName: "TEST Volta" });
    await f.t.run(async (ctx) => ctx.db.patch(passportId, { hiddenAt: SEED_AT }));
    d = await f.dash(fairDay);
    expect(rules(d)).not.toContain("passport_missing");
    expect(action(d, "passport_hidden")).toEqual({ rule: "passport_hidden", tone: "info", count: 1, section: "interakcije", query: { stanje: "sakriven" } });
    expect(d.sections.interakcije).toMatchObject({ passports: 0, passportsHidden: 1 });

    await f.t.run(async (ctx) => {
      await ctx.db.patch(passportId, { hiddenAt: undefined });
      await ctx.db.patch(f.models["volta-x2"], { status: "withdrawn" });
    });
    d = await f.dash(fairDay);
    expect(action(d, "passport_blocked")).toEqual({ rule: "passport_blocked", tone: "hitno", count: 1, section: "interakcije", query: { stanje: "zamrznut" } });
    expect(rules(d)).not.toContain("passport_hidden");
  });

  test("days until the 16 Nov purge: info, uskoro in the last week", async () => {
    const f = await setup();
    expect(action(await f.dash(at("2026-10-20T10:00:00+02:00")), "pii_purge_countdown")).toEqual({ rule: "pii_purge_countdown", tone: "info", count: 26, section: "brisanje", query: {} });
    expect(action(await f.dash(at("2026-11-10T10:00:00+01:00")), "pii_purge_countdown")).toMatchObject({ tone: "uskoro", count: 5 });
    expect(action(await f.dash(at("2026-11-15T20:00:00+01:00")), "pii_purge_countdown")).toMatchObject({ tone: "uskoro", count: 0 });
  });
});

describe("A10 dashboard order, numbers and bounds", () => {
  test("items are sorted hitno → uskoro → info, then by count", async () => {
    const f = await setup();
    const d = await f.dash(at("2026-10-10T10:00:00+02:00"));
    const rank = { hitno: 0, uskoro: 1, info: 2 } as const;
    expect(d.actions.length).toBeGreaterThan(3);
    for (let index = 1; index < d.actions.length; index += 1) {
      const [previous, current] = [d.actions[index - 1], d.actions[index]];
      expect(rank[previous.tone] < rank[current.tone] || (previous.tone === current.tone && previous.count >= current.count)).toBe(true);
    }
    expect(d.actions[0].tone).toBe("hitno");
  });

  test("KPI row and section cards: models by package, QR, scans from the stand counters (admin scans excluded), exhibitors", async () => {
    const f = await setup();
    await f.t.mutation(internal.fairDevFixtures.seedTestQr, { eventCode: EM, modelExternalKey: "test-em26-volta-x1" });
    await f.t.run(async (ctx) => {
      const [first, second] = f.stands;
      for (const [key, value] of [
        [`scan_total:stand:${first}`, 7], [`scan_total:stand:${second}`, 5], [`scan_total:stand:${first}:2026-10-10`, 3],
        [`scan_unique:stand:${first}`, 4], [`scan_unique:stand:${second}`, 2], [`scan_unique:stand:${second}:2026-10-10`, 1],
        // Another day and a model key: not part of today's / the stand sums.
        [`scan_total:stand:${first}:2026-10-09`, 4], [`scan_total:model:${f.models["volta-x1"]}`, 99],
      ] as const) {
        await ctx.db.insert("fairMetricCountShards", { key, shard: 0, value });
      }
      await ctx.db.patch(f.models["om-z2"], { status: "draft" });
    });
    const d = await f.dash(at("2026-10-10T10:00:00+02:00"));
    expect(d.kpis.models).toEqual({ published: 5, total: 6, byTier: { included: 2, starter: 2, advanced: 2 } });
    expect(d.kpis.qr).toEqual({ assigned: 1, inventory: 1, inventoryCapped: false });
    expect(d.kpis.scans).toEqual({ today: 3, total: 12, uniqueToday: 1, uniqueTotal: 6, capped: false });
    expect(d.sections.modeli).toEqual({ published: 5, draft: 1, withdrawn: 0, withErrors: 0 });
    expect(d.sections.qr).toEqual({ assigned: 1, publishedWithoutQr: 4, onWithdrawn: 0, inventory: 1 });
    expect(d.sections.izlagaci).toEqual({ active: 2, total: 2, withAdvanced: 2 });
    expect(d.sections.leadovi).toEqual({ total: 0, undelivered: 0, followUpActive: 0, followUpNeeded: 2 });
  });

  test("without a package that has the function, its KPI and card are left out (no fake zeros)", async () => {
    const f = await setup();
    await f.t.run(async (ctx) => {
      for (const id of Object.values(f.models)) await ctx.db.patch(id, { packageTier: "included" });
    });
    const d = await f.dash(at("2026-10-10T10:00:00+02:00"));
    expect(d.kpis.leads).toBeNull();
    expect(d.kpis.questions).toBeNull();
    expect(d.kpis.reports).toBeNull();
    expect(d.sections.leadovi).toBeNull();
    expect(d.sections.sponzorisano).toBeNull();
    expect(d.sections.izvestaji).toBeNull();
    for (const rule of ["question_missing_today", "sponsored_question_missing", "leads_switch_off", "follow_up_switch_off", "follow_up_text_missing", "reports_missing"] as const) {
      expect(rules(d)).not.toContain(rule);
    }
  });

  test("bounded reads: more stands or leads than the caps give partial numbers flagged `capped`", async () => {
    const f = await setup();
    await f.t.run(async (ctx) => {
      const model = (await ctx.db.get(f.models["volta-x1"]))!;
      for (let index = 0; index < FAIR_DASHBOARD_STANDS_CAP; index += 1) {
        await ctx.db.insert("fairStands", { eventId: f.eventId, participationId: f.a, externalKey: `test-a10-stand-${index}`, code: `T${index}`, displayName: `TEST štand ${index}`, mapLocationId: `test-a10-${index}`, status: "draft", createdAt: SEED_AT, updatedAt: SEED_AT });
      }
      const visitorId = await ctx.db.insert("fairVisitors", { visitorHash: "c".repeat(64), firstSeenAt: SEED_AT, lastSeenAt: SEED_AT });
      for (let index = 0; index <= FAIR_DASHBOARD_LEADS_CAP; index += 1) {
        await ctx.db.insert("fairLeads", {
          submissionId: `test-a10-cap-${index}`, kind: "interest", visitorId, eventId: f.eventId, eventModelId: model._id, participationId: f.a, contactName: "TEST",
          consentAccepted: true, consentVersion: 1, consentTextSnapshot: "TEST", consentedAt: SEED_AT, status: "received", followUpSuppressed: false, createdAt: SEED_AT + index, purgeAt: FAIR_PII_PURGE_AT_MS,
        });
      }
    });
    const d = await f.dash(at("2026-10-10T10:00:00+02:00"));
    expect(d.kpis.scans.capped).toBe(true);
    expect(d.kpis.leads).toMatchObject({ total: FAIR_DASHBOARD_LEADS_CAP, capped: true });
  }, 120_000);
});

describe("A10 dashboard authz and privacy", () => {
  test("anonymous and non-admin callers are refused; the admin result has no contact, visitor or code", async () => {
    const f = await setup();
    await addLead(f, "volta-x2", f.a, at("2026-10-10T09:00:00+02:00"));
    const { resolverCode } = await f.t.mutation(internal.fairDevFixtures.seedTestQr, { eventCode: EM, modelExternalKey: "test-em26-volta-x1" });
    const args = { eventId: f.eventId, at: at("2026-10-10T10:00:00+02:00") };
    await expect(f.t.query(api.fairDashboard.getEventDashboard, args)).rejects.toThrow("Niste prijavljeni.");
    await expect(f.member.query(api.fairDashboard.getEventDashboard, args)).rejects.toThrow("Nemate administratorski pristup.");
    await expect(f.admin.query(api.fairDashboard.getEventDashboard, { ...args, at: Number.NaN })).rejects.toThrow();
    const text = JSON.stringify(await f.dash(args.at));
    for (const secret of ["TEST Posetilac A10", "posetilac.a10@example.invalid", "TEST saglasnost", resolverCode, "SMK-TEST", "SML-TEST"]) {
      expect({ secret, leaked: text.includes(secret) }).toEqual({ secret, leaked: false });
    }
    expect(text).not.toMatch(/"(visitorId|visitorHash|contactName|email|phone|recipient)"\s*:/);
  });
});
