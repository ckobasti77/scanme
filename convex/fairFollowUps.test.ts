/// <reference types="vite/client" />

// Sajam 2026 Admin UX A8 — the post-fair follow-up per EXHIBITOR (ADMIN-UX
// §7, §12.3; MASTER §8; FAIR-BACKEND-CONTRACT §34). One email per (visitor
// email, exhibitor) pair, with the exhibitor's text and merge fields, through
// the B4 outbox with the K3 switch and the suppression checked right before
// sending. NOTHING IS SENT: global `fetch` is a mock for every test and the
// Resend key is a fake.

import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Doc, Id, TableNames } from "./_generated/dataModel";
import schema from "./schema";
import { buildFairLeadEmail } from "./lib/fairEmails";
import {
  fairFollowUpFieldsUsed,
  fairFollowUpSampleValues,
  fairFollowUpUnknownField,
  fairJoinNames,
  renderFairFollowUp,
} from "./lib/fairFollowUp";
import { eventLeadEmailSr } from "../lib/i18n/sr/event-lead-email";

vi.mock("server-only", () => ({}));
const { fairVisitorHash, generateFairVisitorToken } = await import("../lib/fair-server/visitor");

const modules = import.meta.glob("./**/*.ts");
// The TEST elektromobilnost fair runs 9–11 Oct 2026; the follow-up moment is 13 Oct 10:00 (24–48 h after the end).
const BEFORE_OPENING = Date.parse("2026-10-08T12:00:00+02:00");
const DAY1 = Date.parse("2026-10-09T10:00:00+02:00");
const EVENT_ENDS = Date.parse("2026-10-12T00:00:00+02:00");
const FOLLOW_UP_AT = Date.parse("2026-10-13T10:00:00+02:00");
const ADMIN_EMAIL = "fair-a8-followup@scanme.test";
const ISSUER = "https://fair-a8-followup.test";
const SECRET = "test-fair-visitor-secret-0123456789abcdef";
const GATEWAY_SECRET = "test-fair-gateway-secret-0123456789abcdef";
const LEGAL = { legalApprovedBy: "TEST pravna provera", legalApprovedAt: Date.parse("2026-10-01T12:00:00+02:00") };
const EMAIL = "posetilac.a8@example.invalid";
const SUBJECT = "TEST {ime}, hvala od {izlagac}";
const TEXT = "Dragi {ime},\n\nvideli smo vaše interesovanje za {modeli}.\n\nProbna vožnja: {modeli_probna_voznja}. Događaj: {dogadjaj}.";

type ResendCall = { key: string | null; body: { to: string[]; subject: string; text: string; html: string } };
let calls: ResendCall[] = [];

beforeEach(() => {
  process.env.SCANME_ADMIN_EMAILS = ADMIN_EMAIL;
  process.env.FAIR_GATEWAY_SECRET = GATEWAY_SECRET;
  process.env.RESEND_API_KEY = "re_test_not_a_real_key";
  process.env.RESEND_FROM_EMAIL = "ScanMe TEST <test-sender@example.invalid>";
  process.env.FAIR_LEADS_ENABLED = "true";
  process.env.FAIR_FOLLOWUP_ENABLED = "true";
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    calls.push({ key: headers.get("idempotency-key"), body: JSON.parse(String(init?.body)) });
    return Response.json({ id: `re_test_message_${calls.length}` });
  }));
  vi.useFakeTimers();
  vi.setSystemTime(BEFORE_OPENING);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete process.env.RESEND_API_KEY;
  delete process.env.RESEND_FROM_EMAIL;
  delete process.env.FAIR_LEADS_ENABLED;
  delete process.env.FAIR_FOLLOWUP_ENABLED;
});

const spec = (order: number) => ({ label: `TEST stavka ${order}`, value: `TEST ${order}`, order, isHighlight: order === 1 });
const visitor = () => fairVisitorHash(generateFairVisitorToken(), SECRET);
let sequence = 0;
const submissionId = () => `test-a8-submission-${++sequence}`;

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({ data: expect.objectContaining({ code }) });
}

type Tier = "included" | "starter" | "advanced";

async function setup() {
  vi.setSystemTime(BEFORE_OPENING);
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  const ids = await t.run(async (ctx) => {
    const adminId = await ctx.db.insert("users", { email: ADMIN_EMAIL });
    const memberId = await ctx.db.insert("users", { email: "klijent@example.invalid" });
    const client = async (code: string, brandName: string | null) => {
      const accountId = await ctx.db.insert("accounts", {
        name: `TEST klijent ${code}`, plan: "basic", status: "active", smkCode: `SMK-${code}`, ownerDisplayName: `TEST vlasnik ${code}`,
        normalizedOwnerDisplayName: `test vlasnik ${code.toLowerCase()}`, clientStatus: "active", adminV1MigrationVersion: 1, createdAt: BEFORE_OPENING, updatedAt: BEFORE_OPENING,
      });
      const businessId = await ctx.db.insert("businesses", {
        accountId, name: `TEST izlagač ${code}`, slug: `test-izlagac-${code.toLowerCase()}`, smlCode: `SML-${code}`, kind: "business", clientStatus: "active",
        adminV1MigrationVersion: 1, status: "active", createdAt: BEFORE_OPENING,
      });
      const brandId = brandName
        ? await ctx.db.insert("brands", { accountId, name: brandName, normalizedName: brandName.toLowerCase(), revision: "1", colors: [], createdAt: BEFORE_OPENING, updatedAt: BEFORE_OPENING })
        : null;
      return { accountId, businessId, brandId };
    };
    return { adminId, memberId, a: await client("TA", "TEST Volta"), b: await client("TB", "TEST Om"), c: await client("TC", "TEST Kulon"), inventory: await client("TQ", null) };
  });
  const admin = t.withIdentity({ subject: ids.adminId, issuer: ISSUER });
  const member = t.withIdentity({ subject: ids.memberId, issuer: ISSUER });
  const { eventId } = await admin.mutation(api.fairAdmin.upsertEvent, {
    code: "test-elektromobilnost-2026", slug: "test-elektromobilnost-2026", title: "TEST elektromobilnost", venueName: "TEST hala",
    startsAt: Date.parse("2026-10-09T00:00:00+02:00"), endsAt: EVENT_ENDS, status: "published", garagePriority: 1, qrInventoryBusinessId: ids.inventory.businessId,
  });
  await admin.mutation(api.fairAdmin.upsertEventDay, { eventId, dateKey: "2026-10-09", label: "TEST dan 1", sortOrder: 1 });
  const exhibitor = async (key: string, client: typeof ids.a, location: string) => {
    const { participationId } = await admin.mutation(api.fairAdmin.upsertParticipation, { eventId, externalKey: `test-em-${key}`, accountId: client.accountId, businessId: client.businessId });
    const { standId } = await admin.mutation(api.fairAdmin.upsertStand, { eventId, participationId, externalKey: `test-em-stand-${key}`, code: `TEST-${key}`, displayName: `TEST štand ${key}`, mapLocationId: location });
    const model = async (externalKey: string, packageTier: Tier) => {
      const { modelId } = await admin.mutation(api.fairAdmin.upsertModel, {
        eventId, participationId, standId, brandId: client.brandId!, externalKey, displayName: `TEST ${externalKey}`, priceText: "TEST cena",
        specifications: [spec(1), spec(2)], packageTier, passportEligible: true,
      });
      await admin.mutation(api.fairAdmin.publishModel, { eventModelId: modelId });
      await admin.mutation(api.fairLeadsAdmin.upsertLeadConfig, { eventModelId: modelId, leadKind: "interest", contactRequirement: "one_of", enabled: packageTier !== "included" });
      if (packageTier === "advanced") await admin.mutation(api.fairLeadsAdmin.upsertLeadConfig, { eventModelId: modelId, leadKind: "test_drive", contactRequirement: "one_of", enabled: true });
      return modelId;
    };
    return { participationId, model };
  };
  const a = await exhibitor("a", ids.a, "ispred-14");
  const b = await exhibitor("b", ids.b, "ispred-15-1");
  const c = await exhibitor("c", ids.c, "ispred-16");
  const models = {
    x2: await a.model("test-volta-x2", "advanced"),
    x3: await a.model("test-volta-x3", "advanced"),
    x1: await a.model("test-volta-x1", "starter"),
    z2: await b.model("test-om-z2", "advanced"),
    z3: await b.model("test-om-z3", "advanced"),
    k1: await c.model("test-kulon-k1", "starter"),
    k2: await c.model("test-kulon-k2", "starter"),
  };
  for (const leadKind of ["interest", "test_drive"] as const) {
    const { consentId } = await admin.mutation(api.fairLeadsAdmin.saveConsentDraft, { eventId, leadKind, text: "TEST saglasnost: ScanMe i {izlagac}." });
    await admin.mutation(api.fairLeadsAdmin.activateConsent, { consentId, ...LEGAL });
  }
  vi.setSystemTime(DAY1);
  return { t, admin, member, ...ids, eventId, a, b, c, models };
}
type Fixture = Awaited<ReturnType<typeof setup>>;

function submit(f: Fixture, visitorHash: string, eventModelId: Id<"fairEventModels">, args: { kind?: "interest" | "test_drive"; email?: string; contactName?: string } = {}) {
  return f.t.mutation(api.fairLeads.submitLead, {
    gatewaySecret: GATEWAY_SECRET, visitorHash, eventModelId, kind: args.kind ?? "interest", submissionId: submissionId(),
    contactName: args.contactName ?? "TEST Goran", email: args.email ?? EMAIL, consentAccepted: true, consentVersion: 1,
  });
}

async function activeText(f: Fixture, participationId: Id<"fairParticipations">, text = { subject: SUBJECT, plainText: TEXT }) {
  const draft = await f.admin.mutation(api.fairFollowUps.saveExhibitorFollowUpDraft, { participationId, ...text });
  return f.admin.mutation(api.fairFollowUps.activateExhibitorFollowUp, { templateId: draft.templateId });
}

async function rows<T extends TableNames>(f: Fixture, table: T): Promise<Doc<T>[]> {
  return f.t.run(async (ctx) => ctx.db.query(table).collect());
}
const followUpRows = async (f: Fixture) => (await rows(f, "fairEmailDeliveries")).filter((row) => row.kind === "post_event_follow_up");
const followUpCalls = () => calls.filter((call) => call.key?.endsWith("/post_event_follow_up"));
const runEverything = (f: Fixture) => f.t.finishAllScheduledFunctions(vi.runAllTimers);

/** One visitor (same email, one with other casing): 3 Advanced leads at A and 2 at B = 5 follow-up rows. */
async function fiveLeadsAtTwoExhibitors(f: Fixture) {
  const hash = visitor();
  await submit(f, hash, f.models.x2, { contactName: "TEST Goran Prvi" });
  await submit(f, hash, f.models.x2, { kind: "test_drive" });
  await submit(f, hash, f.models.x3, { email: "Posetilac.A8@Example.invalid" });
  await submit(f, hash, f.models.z2);
  vi.setSystemTime(DAY1 + 60_000);
  await submit(f, hash, f.models.z3, { contactName: "TEST Goran Ispravljeno" });
  return hash;
}

describe("A8 follow-up per exhibitor: one email per (visitor email, exhibitor)", () => {
  test("5 leads at 2 exhibitors give 2 follow-up emails; the other 3 rows are FOLLOW_UP_MERGED", async () => {
    const f = await setup();
    await activeText(f, f.a.participationId);
    await activeText(f, f.b.participationId);
    await fiveLeadsAtTwoExhibitors(f);
    expect(await followUpRows(f)).toHaveLength(5);
    expect((await followUpRows(f)).every((row) => row.status === "queued" && row.scheduledFor === FOLLOW_UP_AT)).toBe(true);

    await runEverything(f);
    // 5 immediate confirmations + exactly 2 follow-ups.
    expect(calls).toHaveLength(7);
    expect(followUpCalls()).toHaveLength(2);
    const outcome = (await followUpRows(f)).map((row) => `${row.status}:${row.lastError ?? ""}`).sort();
    expect(outcome).toEqual(["sent:", "sent:", "skipped:FOLLOW_UP_MERGED", "skipped:FOLLOW_UP_MERGED", "skipped:FOLLOW_UP_MERGED"]);

    // Merge fields: the exhibitor's own models only, the newest name, the event; a field without value takes its fallback.
    const fromA = followUpCalls().find((call) => call.body.subject.includes("TEST izlagač TA"))!;
    const fromB = followUpCalls().find((call) => call.body.subject.includes("TEST izlagač TB"))!;
    expect(fromA.body.to).toEqual([EMAIL]);
    expect(fromA.body.subject).toBe("TEST TEST Goran, hvala od TEST izlagač TA");
    expect(fromA.body.text).toContain("Dragi TEST Goran,");
    expect(fromA.body.text).toContain("vaše interesovanje za TEST test-volta-x2 i TEST test-volta-x3.");
    expect(fromA.body.text).toContain("Probna vožnja: TEST test-volta-x2. Događaj: TEST elektromobilnost.");
    expect(fromA.body.text).not.toMatch(/test-om-z|\{[a-z_]+\}/);
    expect(fromB.body.text).toContain("Dragi TEST Goran Ispravljeno,");
    expect(fromB.body.text).toContain("vaše interesovanje za TEST test-om-z2 i TEST test-om-z3.");
    expect(fromB.body.text).toContain(`Probna vožnja: ${eventLeadEmailSr.followUpFallbacks.modeli_probna_voznja}.`);
    expect(fromB.body.text).not.toContain("test-volta");
    // The ScanMe footer names the pair's models and keeps "the only message after the fair".
    expect(fromA.body.text).toContain("ostavili kontakt za: TEST test-volta-x2 i TEST test-volta-x3. Ovo je jedina poruka posle sajma.");
    // The sent key is the claimed row's dedupeKey (Resend Idempotency-Key).
    const sentKeys = (await followUpRows(f)).filter((row) => row.status === "sent").map((row) => row.dedupeKey).sort();
    expect(followUpCalls().map((call) => call.key).sort()).toEqual(sentKeys);
  });

  test("the test drive confirmation says the request was received and passed on to the exhibitor", async () => {
    const f = await setup();
    await submit(f, visitor(), f.models.x2, { kind: "test_drive" });
    await f.t.finishInProgressScheduledFunctions();
    vi.advanceTimersByTime(1);
    await f.t.finishInProgressScheduledFunctions();
    const confirmation = calls.find((call) => call.key?.endsWith("/immediate_confirmation"))!;
    expect(confirmation.body.text).toContain("Vaš zahtev je primljen i prosleđen izlagaču TEST izlagač TA");
    expect(confirmation.body.text).toContain("Ovo je zahtev, a ne zakazan termin");
  });

  test("re-running the outbox (and a submit retry) never makes a second email for the pair", async () => {
    const f = await setup();
    await activeText(f, f.a.participationId);
    await activeText(f, f.b.participationId);
    await fiveLeadsAtTwoExhibitors(f);
    await runEverything(f);
    expect(followUpCalls()).toHaveLength(2);
    for (const row of await followUpRows(f)) await f.t.action(internal.fairEmailSender.sendDelivery, { deliveryId: row._id });
    await runEverything(f);
    expect(followUpCalls()).toHaveLength(2);
    // A merged row is final: an admin retry is refused (only `failed` is retried).
    const merged = (await followUpRows(f)).find((row) => row.lastError === "FOLLOW_UP_MERGED")!;
    await expectCode(f.admin.mutation(api.fairLeadsAdmin.retryEmailDelivery, { deliveryId: merged._id }), "FAIR_EMAIL_DELIVERY_STATUS");
    expect(await followUpRows(f)).toHaveLength(5);
  });

  test("an exhibitor without an Advanced model gets no follow-up, even with an active text", async () => {
    const f = await setup();
    await activeText(f, f.c.participationId);
    const hash = visitor();
    await submit(f, hash, f.models.k1);
    await submit(f, hash, f.models.k2);
    expect(await followUpRows(f)).toHaveLength(0);
    await runEverything(f);
    expect(calls).toHaveLength(2);
    expect(followUpCalls()).toHaveLength(0);
    const list = await f.admin.query(api.fairFollowUps.getExhibitorFollowUps, { eventId: f.eventId });
    expect(list.find((row) => row.participationId === f.c.participationId)).toMatchObject({ advancedModels: 0, active: { version: 1, status: "active" } });
    const estimate = await f.admin.query(api.fairFollowUps.estimateFollowUps, { eventId: f.eventId });
    expect(estimate.byParticipation.find((row) => row.participationId === f.c.participationId)).toBeUndefined();
  });

  test("an exhibitor without an ACTIVE text gets no follow-up (a draft is not enough); the pair has one failed row to retry", async () => {
    const f = await setup();
    await activeText(f, f.a.participationId);
    await f.admin.mutation(api.fairFollowUps.saveExhibitorFollowUpDraft, { participationId: f.b.participationId, subject: SUBJECT, plainText: TEXT });
    await fiveLeadsAtTwoExhibitors(f);
    await runEverything(f);
    expect(followUpCalls()).toHaveLength(1);
    expect(followUpCalls()[0].body.subject).toContain("TEST izlagač TA");
    const ofB = await f.t.run(async (ctx) => {
      const leads = await ctx.db.query("fairLeads").withIndex("by_participationId_and_createdAt", (q) => q.eq("participationId", f.b.participationId)).collect();
      const out = [];
      for (const lead of leads) out.push((await ctx.db.query("fairEmailDeliveries").withIndex("by_leadId_and_kind", (q) => q.eq("leadId", lead._id).eq("kind", "post_event_follow_up")).unique())!);
      return out;
    });
    expect(ofB.map((row) => `${row.status}:${row.lastError}`).sort()).toEqual(["failed:FOLLOW_UP_TEMPLATE_MISSING", "skipped:FOLLOW_UP_MERGED"]);
  });

  test("suppression on ONE lead of a pair stops the whole pair; the other exhibitor still sends", async () => {
    const f = await setup();
    await activeText(f, f.a.participationId);
    await activeText(f, f.b.participationId);
    await fiveLeadsAtTwoExhibitors(f);
    const leadOfA = (await rows(f, "fairLeads")).find((lead) => lead.eventModelId === f.models.x3)!;
    await f.admin.mutation(api.fairLeadsAdmin.setFollowUpSuppressed, { leadId: leadOfA._id, suppressed: true });
    await runEverything(f);
    expect(followUpCalls()).toHaveLength(1);
    expect(followUpCalls()[0].body.subject).toContain("TEST izlagač TB");
    const leadsOfA = new Set((await rows(f, "fairLeads")).filter((lead) => lead.participationId === f.a.participationId).map((lead) => lead._id));
    const rowsOfA = (await followUpRows(f)).filter((row) => row.leadId && leadsOfA.has(row.leadId));
    expect(rowsOfA.map((row) => row.status)).toEqual(["suppressed", "suppressed", "suppressed"]);
    const estimate = await f.admin.query(api.fairFollowUps.estimateFollowUps, { eventId: f.eventId });
    expect(estimate.byParticipation.find((row) => row.participationId === f.a.participationId)).toMatchObject({ pairs: 0, suppressed: 1 });
  });

  test("K3: with FAIR_FOLLOWUP_ENABLED off at sending time nothing goes out; off at submit time nothing is queued", async () => {
    const f = await setup();
    await activeText(f, f.a.participationId);
    await activeText(f, f.b.participationId);
    await fiveLeadsAtTwoExhibitors(f);
    vi.setSystemTime(FOLLOW_UP_AT - 60_000);
    await f.t.finishInProgressScheduledFunctions();
    process.env.FAIR_FOLLOWUP_ENABLED = "false";
    await runEverything(f);
    expect(followUpCalls()).toHaveLength(0);
    expect((await followUpRows(f)).map((row) => `${row.status}:${row.lastError}`)).toEqual(Array(5).fill("skipped:FOLLOW_UP_DISABLED"));

    const g = await setup();
    await activeText(g, g.a.participationId);
    process.env.FAIR_FOLLOWUP_ENABLED = "";
    await submit(g, visitor(), g.models.x2);
    expect(await followUpRows(g)).toHaveLength(0);
  });

  test("estimate per exhibitor counts pairs, not leads", async () => {
    const f = await setup();
    await activeText(f, f.a.participationId);
    await fiveLeadsAtTwoExhibitors(f);
    await submit(f, visitor(), f.models.x2, { email: "drugi.posetilac@example.invalid" });
    const estimate = await f.admin.query(api.fairFollowUps.estimateFollowUps, { eventId: f.eventId });
    const byId = new Map(estimate.byParticipation.map((row) => [row.participationId, row]));
    expect(byId.get(f.a.participationId)).toMatchObject({ pairs: 2, sent: 0, suppressed: 0 });
    expect(byId.get(f.b.participationId)).toMatchObject({ pairs: 1 });
    expect(estimate.capped).toBe(false);
  });
});

describe("A8 the exhibitor's text: versions, merge fields and preview", () => {
  test("draft → active → retired with versions; an unknown {field} is refused when saving", async () => {
    const f = await setup();
    const first = await f.admin.mutation(api.fairFollowUps.saveExhibitorFollowUpDraft, { participationId: f.a.participationId, subject: "TEST\nnaslov {ime}", plainText: TEXT });
    expect(first).toMatchObject({ version: 1, result: "created" });
    expect(await f.admin.mutation(api.fairFollowUps.saveExhibitorFollowUpDraft, { participationId: f.a.participationId, subject: "TEST naslov {ime}", plainText: TEXT })).toMatchObject({ version: 1, result: "unchanged" });
    await f.admin.mutation(api.fairFollowUps.activateExhibitorFollowUp, { templateId: first.templateId });
    await expectCode(f.admin.mutation(api.fairFollowUps.activateExhibitorFollowUp, { templateId: first.templateId }), "FAIR_FOLLOWUP_STATUS");
    const second = await f.admin.mutation(api.fairFollowUps.saveExhibitorFollowUpDraft, { participationId: f.a.participationId, subject: "TEST novi", plainText: "TEST {modeli}" });
    expect(second).toMatchObject({ version: 2, result: "created" });
    const activated = await f.admin.mutation(api.fairFollowUps.activateExhibitorFollowUp, { templateId: second.templateId });
    expect(activated).toMatchObject({ version: 2, retiredTemplateId: first.templateId });
    const stored = (await rows(f, "fairExhibitorFollowUpTemplates")).map((row) => [row.version, row.status, row.subject]);
    expect(stored).toEqual([[1, "retired", "TEST naslov {ime}"], [2, "active", "TEST novi"]]);
    const audit = (await rows(f, "adminAuditLog")).filter((row) => row.action.startsWith("fair_followup_"));
    expect(audit.map((row) => row.action)).toEqual(["fair_followup_activated", "fair_followup_activated"]);

    await expectCode(
      f.admin.mutation(api.fairFollowUps.saveExhibitorFollowUpDraft, { participationId: f.a.participationId, subject: "TEST", plainText: "Zdravo {Ime}, {modeli}" }),
      "FAIR_FOLLOWUP_UNKNOWN_FIELD",
    );
    await expect(
      f.admin.mutation(api.fairFollowUps.saveExhibitorFollowUpDraft, { participationId: f.a.participationId, subject: "TEST {kupac}", plainText: "TEST" }),
    ).rejects.toMatchObject({ data: { code: "FAIR_FOLLOWUP_UNKNOWN_FIELD", details: { field: "kupac" } } });
    await expectCode(f.admin.mutation(api.fairFollowUps.saveExhibitorFollowUpDraft, { participationId: f.a.participationId, subject: " ", plainText: "TEST" }), "INVALID_INPUT");
    expect((await rows(f, "fairExhibitorFollowUpTemplates")).filter((row) => row.status === "draft")).toHaveLength(0);

    await f.admin.mutation(api.fairFollowUps.retireExhibitorFollowUp, { templateId: second.templateId });
    await expectCode(f.admin.mutation(api.fairFollowUps.retireExhibitorFollowUp, { templateId: second.templateId }), "FAIR_FOLLOWUP_STATUS");
    expect((await f.admin.query(api.fairFollowUps.getExhibitorFollowUps, { eventId: f.eventId })).find((row) => row.participationId === f.a.participationId)).toMatchObject({
      active: null, draft: null, advancedModels: 2, modelTexts: 0,
    });
  });

  test("merge fields: escaped in HTML, fallback for an empty value, a value is never expanded again, unknown fields are found", () => {
    const rendered = renderFairFollowUp(
      { subject: "Za {ime}\n{nepoznato}", plainText: "Dragi {ime},\n\n{modeli} · {modeli_ocenjeni} · {modeli_probna_voznja}" },
      { ime: "<b>Ana</b> {modeli}", modeli: "TEST A & B", modeli_ocenjeni: "  ", modeli_probna_voznja: null },
    );
    expect(rendered.subject).toBe("Za <b>Ana</b> {modeli} {nepoznato}");
    expect(rendered.plainText).toBe(`Dragi <b>Ana</b> {modeli},\n\nTEST A & B · ${eventLeadEmailSr.followUpFallbacks.modeli_ocenjeni} · ${eventLeadEmailSr.followUpFallbacks.modeli_probna_voznja}`);
    const email = buildFairLeadEmail({
      kind: "post_event_follow_up", dedupeKey: "k", recipient: EMAIL, leadKind: "interest", contactName: "x", modelName: "TEST A & B", exhibitorName: "TEST <izlagač>",
      eventTitle: "TEST sajam", modelPath: "/sajam/test/model/test-a", followUpScheduled: false, template: rendered,
    }, "https://scanme.rs");
    expect(email.html).toContain("Dragi &lt;b&gt;Ana&lt;/b&gt; {modeli}");
    expect(email.html).toContain("TEST A &amp; B");
    expect(email.html).not.toContain("<b>Ana</b>");
    expect(fairFollowUpUnknownField({ subject: "{ime}", plainText: "{modeli} {modeli_x}" })).toBe("modeli_x");
    expect(fairFollowUpUnknownField({ subject: "{ime}", plainText: "Cena: {} " })).toBe("");
    expect(fairFollowUpUnknownField({ subject: "{ime}", plainText: "{dogadjaj} {izlagac}" })).toBeNull();
    expect(fairFollowUpFieldsUsed({ subject: "{izlagac}", plainText: "{ime} {ime}" })).toEqual(["ime", "izlagac"]);
    expect(fairJoinNames(["A", "B", "A", " ", "C"])).toBe("A, B i C");
    expect(fairFollowUpSampleValues({ exhibitorName: "TEST izlagač", eventTitle: "TEST sajam", modelNames: ["TEST M1"] })).toMatchObject({
      ime: eventLeadEmailSr.followUpSampleName, modeli: "TEST M1", modeli_probna_voznja: "TEST M1",
    });
  });

  test("preview gives the chosen lead's pair values or a marked example, never another exhibitor's model", async () => {
    const f = await setup();
    await fiveLeadsAtTwoExhibitors(f);
    const sample = await f.admin.query(api.fairFollowUps.previewExhibitorFollowUp, { participationId: f.a.participationId });
    expect(sample).toMatchObject({ source: "sample", values: { ime: eventLeadEmailSr.followUpSampleName, izlagac: "TEST izlagač TA", dogadjaj: "TEST elektromobilnost" } });
    expect(sample.leads).toHaveLength(3);
    const lead = sample.leads[0];
    const preview = await f.admin.query(api.fairFollowUps.previewExhibitorFollowUp, { participationId: f.a.participationId, leadId: lead.leadId });
    expect(preview).toMatchObject({ source: "lead", values: { ime: "TEST Goran", modeli: "TEST test-volta-x2 i TEST test-volta-x3", modeli_probna_voznja: "TEST test-volta-x2", modeli_ocenjeni: null } });
    expect(JSON.stringify(preview.values)).not.toContain("test-om");
    // A lead of another exhibitor is not used for this exhibitor's preview.
    const leadOfB = (await rows(f, "fairLeads")).find((row) => row.participationId === f.b.participationId)!;
    expect(await f.admin.query(api.fairFollowUps.previewExhibitorFollowUp, { participationId: f.a.participationId, leadId: leadOfB._id })).toMatchObject({ source: "sample" });
  });

  test("{modeli_ocenjeni}: the exhibitor's models the visitor rated", async () => {
    const f = await setup();
    const hash = visitor();
    await submit(f, hash, f.models.x2);
    await f.t.mutation(api.fairInteractions.upsertRating, { gatewaySecret: GATEWAY_SECRET, visitorHash: hash, eventModelId: f.models.x3, appearance: 4 });
    await f.t.mutation(api.fairInteractions.upsertRating, { gatewaySecret: GATEWAY_SECRET, visitorHash: hash, eventModelId: f.models.z2, price: 5 });
    const [lead] = await rows(f, "fairLeads");
    const preview = await f.admin.query(api.fairFollowUps.previewExhibitorFollowUp, { participationId: f.a.participationId, leadId: lead._id });
    expect(preview.values.modeli_ocenjeni).toBe("TEST test-volta-x3");
  });
});
