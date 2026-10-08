/// <reference types="vite/client" />

// Sajam 2026 B4 — leads `Zainteresovan sam` / `Probna vožnja` and email
// (BACKEND-HANDOFF §4.4, §5.4, §7, §9, §10, §12 "Leadovi/email"; MASTER §8,
// §13). Visitor hashes come from the real Next-side helper, exactly as the
// gateway makes them. NOTHING IS SENT: global `fetch` is replaced by a mock
// for every test, so the Node sender (convex/fairEmailSender.ts) talks only
// to the mock; the Resend key below is a fake.
// K3: the hard switches FAIR_LEADS_ENABLED / FAIR_FOLLOWUP_ENABLED are turned
// on in beforeEach (TEST env only), so the B4 tests run against an open flow;
// the "K3 hard switches" block turns them off on purpose.

import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { afterEach, beforeEach, describe, expect, expectTypeOf, test, vi } from "vitest";
import type { Infer } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Doc, Id, TableNames } from "./_generated/dataModel";
import schema from "./schema";
import type { FairLeadFormView, FairLeadSubmitResult } from "../lib/fair-contract";
import {
  FAIR_LEAD_CONFIRMATIONS_PER_RECIPIENT,
  normalizeFairLeadEmail,
  normalizeFairLeadName,
  normalizeFairLeadPhone,
} from "../lib/fair-contract";
import { fairLeadFormView, fairLeadSubmitResultView } from "./lib/fairValidators";
import { FAIR_EMAIL_MAX_ATTEMPTS, fairFollowUpAt, fairFollowUpScheduleFor } from "./lib/fairLeads";
import { buildFairLeadEmail, fairPublicBaseUrl, sendFairResendEmail, type FairLeadEmailMessage } from "./lib/fairEmails";
import * as fairLeadsModule from "./fairLeads";
import * as fairEmailsModule from "./fairEmails";
import * as fairEmailSenderModule from "./fairEmailSender";
import * as fairLeadsAdminModule from "./fairLeadsAdmin";

vi.mock("server-only", () => ({}));
const { fairVisitorHash, generateFairVisitorToken } = await import("../lib/fair-server/visitor");

const modules = import.meta.glob("./**/*.ts");
// The TEST elektromobilnost fair runs 9–11 Oct 2026 (Europe/Belgrade); endsAt is 12 Oct 00:00.
const BEFORE_OPENING = Date.parse("2026-10-08T12:00:00+02:00");
const DAY1 = Date.parse("2026-10-09T10:00:00+02:00");
const EVENT_ENDS = Date.parse("2026-10-12T00:00:00+02:00");
const FOLLOW_UP_AT = Date.parse("2026-10-13T10:00:00+02:00");
const PURGE_AT = Date.parse("2026-11-16T00:00:00+01:00");
const ADMIN_EMAIL = "fair-admin@scanme.test";
const ISSUER = "https://fair-b4.test";
const SECRET = "test-fair-visitor-secret-0123456789abcdef";
const CONSENT_TEXT = "TEST saglasnost: ScanMe prima podatke i prosleđuje ih izlagaču {izlagac}.";
// K3: a TEST legal approval record (not a real review), required by every activation.
const LEGAL = { legalApprovedBy: "TEST pravna provera", legalApprovedAt: Date.parse("2026-10-01T12:00:00+02:00") };
const NAME = "TEST Posetilac Jedan";
const EMAIL = "posetilac.b4@example.invalid";
const PHONE = "+381 60 000 0004";
const PHONE_E164 = "+381600000004";

// -----------------------------------------------------------------------------
// Resend mock (the only `fetch` any test can reach)
// -----------------------------------------------------------------------------

type ResendCall = { url: string; key: string | null; auth: string | null; body: { to: string[]; subject: string; text: string; html: string; reply_to?: string } };
let calls: ResendCall[] = [];
let respond: (call: number) => Response = (call) => Response.json({ id: `re_test_message_${call}` });

// K1: a TEST gateway secret (not a real value), set as the Convex env in beforeEach.
const GATEWAY_SECRET = "test-fair-gateway-secret-0123456789abcdef";

beforeEach(() => {
  process.env.SCANME_ADMIN_EMAILS = ADMIN_EMAIL;
  process.env.FAIR_GATEWAY_SECRET = GATEWAY_SECRET;
  process.env.RESEND_API_KEY = "re_test_not_a_real_key";
  process.env.RESEND_FROM_EMAIL = "ScanMe TEST <test-sender@example.invalid>";
  process.env.FAIR_LEADS_ENABLED = "true";
  process.env.FAIR_FOLLOWUP_ENABLED = "true";
  delete process.env.FAIR_PUBLIC_BASE_URL;
  delete process.env.FAIR_EMAIL_REPLY_TO;
  calls = [];
  respond = (call) => Response.json({ id: `re_test_message_${call}` });
  vi.stubGlobal("fetch", vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    calls.push({ url: String(url), key: headers.get("idempotency-key"), auth: headers.get("authorization"), body: JSON.parse(String(init?.body)) });
    return respond(calls.length);
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
  delete process.env.FAIR_PUBLIC_BASE_URL;
  delete process.env.FAIR_EMAIL_REPLY_TO;
});

const spec = (order: number) => ({ label: `TEST stavka ${order}`, value: `TEST ${order}`, order, isHighlight: order === 1 });
const visitor = () => fairVisitorHash(generateFairVisitorToken(), SECRET);
let submissionSequence = 0;
const submissionId = () => `test-b4-submission-${++submissionSequence}`;

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({ data: expect.objectContaining({ code }) });
}

type Tier = "included" | "starter" | "advanced";

async function setup(opts: { consent?: boolean } = {}) {
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
    return { adminId, memberId, a: await client("TA", "TEST Volta"), b: await client("TB", "TEST Om"), inventory: await client("TQ", null) };
  });
  const admin = t.withIdentity({ subject: ids.adminId, issuer: ISSUER });
  const member = t.withIdentity({ subject: ids.memberId, issuer: ISSUER });

  const { eventId } = await admin.mutation(api.fairAdmin.upsertEvent, {
    code: "test-elektromobilnost-2026", slug: "test-elektromobilnost-2026", title: "TEST elektromobilnost", venueName: "TEST hala",
    startsAt: Date.parse("2026-10-09T00:00:00+02:00"), endsAt: EVENT_ENDS, status: "published", garagePriority: 1,
    qrInventoryBusinessId: ids.inventory.businessId,
  });
  await admin.mutation(api.fairAdmin.upsertEventDay, { eventId, dateKey: "2026-10-09", label: "TEST dan 1", sortOrder: 1 });
  const exhibitor = async (key: string, client: typeof ids.a, location: string) => {
    const { participationId } = await admin.mutation(api.fairAdmin.upsertParticipation, {
      eventId, externalKey: `test-em-${key}`, accountId: client.accountId, businessId: client.businessId,
    });
    const { standId } = await admin.mutation(api.fairAdmin.upsertStand, {
      eventId, participationId, externalKey: `test-em-stand-${key}`, code: `TEST-${key}`, displayName: `TEST štand ${key}`, mapLocationId: location,
    });
    const model = async (externalKey: string, packageTier: Tier) => {
      const { modelId } = await admin.mutation(api.fairAdmin.upsertModel, {
        eventId, participationId, standId, brandId: client.brandId!, externalKey, displayName: `TEST ${externalKey}`, priceText: "TEST cena",
        specifications: [spec(1), spec(2)], packageTier, passportEligible: true,
      });
      await admin.mutation(api.fairAdmin.publishModel, { eventModelId: modelId });
      return modelId;
    };
    return { participationId, model };
  };
  const a = await exhibitor("a", ids.a, "ispred-14");
  const b = await exhibitor("b", ids.b, "ispred-15-1");
  const included = await a.model("test-volta-x0", "included");
  const starter = await a.model("test-volta-x1", "starter");
  const advanced = await a.model("test-volta-x2", "advanced");
  const advancedB = await b.model("test-om-z2", "advanced");

  const enable = (eventModelId: Id<"fairEventModels">, leadKind: "interest" | "test_drive", contactRequirement: "one_of" | "email" | "phone" | "both" = "one_of") =>
    admin.mutation(api.fairLeadsAdmin.upsertLeadConfig, { eventModelId, leadKind, contactRequirement, enabled: true });
  await enable(starter, "interest");
  await enable(advanced, "interest");
  await enable(advanced, "test_drive", "both");
  await enable(advancedB, "interest");
  await admin.mutation(api.fairLeadsAdmin.upsertFollowUpTemplate, {
    eventModelId: advanced, subject: "TEST naslov izlagača", plainText: "TEST tekst izlagača.\n\nTEST drugi pasus.",
  });

  const consents: Partial<Record<"interest" | "test_drive", Id<"fairConsentConfigs">>> = {};
  if (opts.consent !== false) {
    for (const leadKind of ["interest", "test_drive"] as const) {
      const { consentId } = await admin.mutation(api.fairLeadsAdmin.saveConsentDraft, { eventId, leadKind, text: CONSENT_TEXT });
      await admin.mutation(api.fairLeadsAdmin.activateConsent, { consentId, ...LEGAL });
      consents[leadKind] = consentId;
    }
  }
  vi.setSystemTime(DAY1);
  return { t, admin, member, ...ids, eventId, a, b, models: { included, starter, advanced, advancedB }, consents, enable };
}
type Fixture = Awaited<ReturnType<typeof setup>>;

type LeadArgs = { kind?: "interest" | "test_drive"; submissionId?: string; contactName?: string; email?: string; phone?: string; consentAccepted?: boolean; consentVersion?: number };
function submit(f: Fixture, visitorHash: string, eventModelId: Id<"fairEventModels">, args: LeadArgs = {}) {
  return f.t.mutation(api.fairLeads.submitLead, {
    gatewaySecret: GATEWAY_SECRET,
    visitorHash, eventModelId, kind: "interest", submissionId: submissionId(), contactName: NAME, email: EMAIL,
    consentAccepted: true, consentVersion: 1, ...args,
  });
}

async function rows<T extends TableNames>(f: Fixture, table: T): Promise<Doc<T>[]> {
  return f.t.run(async (ctx) => ctx.db.query(table).collect());
}
const scheduled = (f: Fixture) => f.t.run(async (ctx) => ctx.db.system.query("_scheduled_functions").collect());
/** Runs only what is due now (the immediate confirmation), not the follow-up days later. */
async function runDueNow(f: Fixture) {
  vi.advanceTimersByTime(1);
  await f.t.finishInProgressScheduledFunctions();
}
const runEverything = (f: Fixture) => f.t.finishAllScheduledFunctions(vi.runAllTimers);
async function delivery(f: Fixture, kind: "immediate_confirmation" | "post_event_follow_up") {
  return (await rows(f, "fairEmailDeliveries")).filter((row) => row.kind === kind);
}
async function expectNothingStored(f: Fixture) {
  expect(await rows(f, "fairLeads")).toHaveLength(0);
  expect(await rows(f, "fairEmailDeliveries")).toHaveLength(0);
  expect(await rows(f, "fairVisitors")).toHaveLength(0);
  expect(await scheduled(f)).toHaveLength(0);
}

// =============================================================================
// Production gate and consent
// =============================================================================

describe("B4 consent gate (MASTER §8, §13; HANDOFF §5.4)", () => {
  test("without an ACTIVE consent the lead is refused with CONSENT_NOT_CONFIGURED and nothing is written", async () => {
    const f = await setup({ consent: false });
    await expectCode(submit(f, visitor(), f.models.starter), "CONSENT_NOT_CONFIGURED");
    await expectNothingStored(f);
    expect(await f.t.query(api.fairPublic.getLeadForm, { eventModelId: f.models.starter, kind: "interest" })).toEqual({
      eventModelId: f.models.starter, kind: "interest", state: "consent_not_configured",
    });

    // A saved but not activated draft is still not a consent.
    await f.admin.mutation(api.fairLeadsAdmin.saveConsentDraft, { eventId: f.eventId, leadKind: "interest", text: CONSENT_TEXT });
    await expectCode(submit(f, visitor(), f.models.starter), "CONSENT_NOT_CONFIGURED");
    await expectNothingStored(f);
    expect(calls).toHaveLength(0);
  });

  test("activation needs the exhibitor token, retires the previous version, and retiring closes the gate again", async () => {
    const f = await setup({ consent: false });
    const noToken = await f.admin.mutation(api.fairLeadsAdmin.saveConsentDraft, { eventId: f.eventId, leadKind: "interest", text: "TEST tekst bez izlagača." });
    await expectCode(f.admin.mutation(api.fairLeadsAdmin.activateConsent, { consentId: noToken.consentId, ...LEGAL }), "FAIR_CONSENT_EXHIBITOR_MISSING");
    await f.admin.mutation(api.fairLeadsAdmin.saveConsentDraft, { eventId: f.eventId, leadKind: "interest", text: CONSENT_TEXT, consentId: noToken.consentId });
    const v1 = await f.admin.mutation(api.fairLeadsAdmin.activateConsent, { consentId: noToken.consentId, ...LEGAL });
    expect(v1).toMatchObject({ version: 1, retiredConsentId: null });
    // Active and retired versions are immutable.
    await expectCode(f.admin.mutation(api.fairLeadsAdmin.saveConsentDraft, { eventId: f.eventId, leadKind: "interest", text: "x", consentId: noToken.consentId }), "FAIR_CONSENT_STATUS");

    const v2 = await f.admin.mutation(api.fairLeadsAdmin.saveConsentDraft, { eventId: f.eventId, leadKind: "interest", text: `${CONSENT_TEXT} v2` });
    expect(v2.version).toBe(2);
    expect(await f.admin.mutation(api.fairLeadsAdmin.activateConsent, { consentId: v2.consentId, ...LEGAL })).toMatchObject({ version: 2, retiredConsentId: noToken.consentId });
    const consents = await f.admin.query(api.fairLeadsAdmin.getEventConsents, { eventId: f.eventId });
    expect(consents.filter((row) => row.leadKind === "interest").map((row) => [row.version, row.status])).toEqual([[2, "active"], [1, "retired"]]);

    // A stale version shown to the visitor is not consent to the current text.
    await expectCode(submit(f, visitor(), f.models.starter, { consentVersion: 1 }), "CONSENT_REQUIRED");
    await submit(f, visitor(), f.models.starter, { consentVersion: 2 });

    await f.admin.mutation(api.fairLeadsAdmin.retireConsent, { consentId: v2.consentId });
    await expectCode(submit(f, visitor(), f.models.starter, { consentVersion: 2 }), "CONSENT_NOT_CONFIGURED");
    expect(await rows(f, "fairLeads")).toHaveLength(1);
  });

  test("a declined consent stores and sends nothing (HANDOFF §12)", async () => {
    const f = await setup();
    const hash = visitor();
    await expectCode(submit(f, hash, f.models.starter, { consentAccepted: false }), "CONSENT_REQUIRED");
    await expectCode(submit(f, hash, f.models.advanced, { kind: "test_drive", phone: PHONE, consentAccepted: false }), "CONSENT_REQUIRED");
    await expectNothingStored(f);
    await runEverything(f);
    expect(calls).toHaveLength(0);
  });

  test("the server renders and stores the exact consent snapshot; the form shows the same text", async () => {
    const f = await setup();
    const form = await f.t.query(api.fairPublic.getLeadForm, { eventModelId: f.models.advanced, kind: "test_drive" });
    const rendered = "TEST saglasnost: ScanMe prima podatke i prosleđuje ih izlagaču TEST izlagač TA.";
    expect(form).toEqual({
      eventModelId: f.models.advanced, kind: "test_drive", state: "open", contactRequirement: "both", consent: { version: 1, text: rendered },
    });
    await submit(f, visitor(), f.models.advanced, { kind: "test_drive", phone: PHONE });
    const [lead] = await rows(f, "fairLeads");
    expect(lead).toMatchObject({ consentAccepted: true, consentVersion: 1, consentTextSnapshot: rendered, consentedAt: DAY1, purgeAt: PURGE_AT, status: "received", followUpSuppressed: false });
    // The browser cannot send consent text: the validator refuses the field.
    await expect(f.t.mutation(api.fairLeads.submitLead, {
      gatewaySecret: GATEWAY_SECRET,
      visitorHash: visitor(), eventModelId: f.models.starter, kind: "interest", submissionId: submissionId(), contactName: NAME, email: EMAIL,
      consentAccepted: true, consentVersion: 1, consentText: "proizvoljan tekst",
    } as never)).rejects.toThrow();
  });
});

// =============================================================================
// Entitlement and contact rule
// =============================================================================

describe("B4 entitlement per kind and contact rule (HANDOFF §4.4, §12)", () => {
  test("interest is Starter+, test drive Advanced only; a refusal writes nothing", async () => {
    const f = await setup();
    await f.admin.mutation(api.fairLeadsAdmin.upsertLeadConfig, { eventModelId: f.models.included, leadKind: "interest", contactRequirement: "one_of", enabled: false });
    await expectCode(f.admin.mutation(api.fairLeadsAdmin.upsertLeadConfig, { eventModelId: f.models.included, leadKind: "interest", contactRequirement: "one_of", enabled: true }), "FAIR_FEATURE_NOT_ENTITLED");
    await expectCode(f.admin.mutation(api.fairLeadsAdmin.upsertLeadConfig, { eventModelId: f.models.starter, leadKind: "test_drive", contactRequirement: "one_of", enabled: true }), "FAIR_FEATURE_NOT_ENTITLED");

    await expectCode(submit(f, visitor(), f.models.included), "FEATURE_NOT_ENTITLED");
    await expectCode(submit(f, visitor(), f.models.starter, { kind: "test_drive", phone: PHONE }), "FEATURE_NOT_ENTITLED");
    await expectNothingStored(f);
    expect(await f.t.query(api.fairPublic.getLeadForm, { eventModelId: f.models.starter, kind: "test_drive" })).toMatchObject({ state: "unavailable" });
    expect(await f.t.query(api.fairPublic.getLeadForm, { eventModelId: f.models.included, kind: "interest" })).toMatchObject({ state: "unavailable" });

    expect(await submit(f, visitor(), f.models.starter)).toMatchObject({ kind: "interest", duplicate: false, confirmationEmail: true, followUpScheduled: false });
    expect(await submit(f, visitor(), f.models.advanced, { kind: "test_drive", phone: PHONE })).toMatchObject({ kind: "test_drive", followUpScheduled: true });
    expect(await submit(f, visitor(), f.models.advanced)).toMatchObject({ kind: "interest", followUpScheduled: true });
    expect((await rows(f, "fairLeads")).map((row) => [row.kind, row.eventModelId])).toEqual([
      ["interest", f.models.starter], ["test_drive", f.models.advanced], ["interest", f.models.advanced],
    ]);
  });

  test("a disabled or missing lead config refuses the kind even when the package has the right", async () => {
    const f = await setup();
    await f.admin.mutation(api.fairLeadsAdmin.upsertLeadConfig, { eventModelId: f.models.starter, leadKind: "interest", contactRequirement: "one_of", enabled: false });
    await expectCode(submit(f, visitor(), f.models.starter), "FEATURE_NOT_ENTITLED");
    await expectCode(submit(f, visitor(), f.models.advancedB, { kind: "test_drive", phone: PHONE }), "FEATURE_NOT_ENTITLED");
    await expectNothingStored(f);
  });

  test("name plus the configured contact; preferredContact never makes a field required", async () => {
    const f = await setup();
    await f.admin.mutation(api.fairLeadsAdmin.upsertLeadConfig, { eventModelId: f.models.starter, leadKind: "interest", contactRequirement: "one_of", preferredContact: "phone", enabled: true });
    await expectCode(submit(f, visitor(), f.models.starter, { email: undefined }), "CONTACT_REQUIREMENT_NOT_MET");
    await expectCode(submit(f, visitor(), f.models.starter, { email: "  ", phone: " " }), "CONTACT_REQUIREMENT_NOT_MET");
    await expectCode(submit(f, visitor(), f.models.starter, { email: "nije-email" }), "INVALID_INPUT");
    await expectCode(submit(f, visitor(), f.models.starter, { email: undefined, phone: "12" }), "INVALID_INPUT");
    await expectCode(submit(f, visitor(), f.models.starter, { contactName: "   " }), "INVALID_INPUT");
    await expectCode(submit(f, visitor(), f.models.advanced, { kind: "test_drive" }), "CONTACT_REQUIREMENT_NOT_MET");
    await expectCode(submit(f, visitor(), f.models.advanced, { kind: "test_drive", email: undefined, phone: PHONE }), "CONTACT_REQUIREMENT_NOT_MET");
    await expectCode(submit(f, visitor(), f.models.starter, { submissionId: "kratko" }), "INVALID_INPUT");
    await expectNothingStored(f);

    // `preferredContact: phone` with one_of: an email alone is enough.
    await submit(f, visitor(), f.models.starter, { contactName: "  TEST   Ime  " });
    // A phone-only lead is stored, but there is no address for a confirmation.
    expect(await submit(f, visitor(), f.models.starter, { email: undefined, phone: PHONE })).toMatchObject({ confirmationEmail: false, followUpScheduled: false });
    const leads = await rows(f, "fairLeads");
    // N5: the phone is stored in E.164 (PHONE is "+381 60 000 0004").
    expect(leads.map((row) => [row.contactName, row.email, row.phone])).toEqual([["TEST Ime", EMAIL, undefined], [NAME, undefined, PHONE_E164]]);
    expect(await delivery(f, "immediate_confirmation")).toHaveLength(1);
  });

  test("a lead from before an upgrade stays as it was; only later leads get the Advanced follow-up (HANDOFF §10)", async () => {
    const f = await setup();
    const hash = visitor();
    await submit(f, hash, f.models.starter);
    const [before] = await rows(f, "fairLeads");
    vi.setSystemTime(DAY1 + 60_000);
    await f.admin.mutation(api.fairAdmin.upgradePackage, { eventModelId: f.models.starter, toTier: "advanced" });
    expect(await rows(f, "fairLeads")).toEqual([before]);
    expect(await delivery(f, "post_event_follow_up")).toHaveLength(0);

    vi.setSystemTime(DAY1 + 120_000);
    // N5: the same visitor gets the stored lead back — still without a follow-up.
    expect(await submit(f, hash, f.models.starter)).toMatchObject({ duplicate: true, followUpScheduled: false });
    expect(await rows(f, "fairLeads")).toEqual([before]);
    expect(await submit(f, visitor(), f.models.starter)).toMatchObject({ duplicate: false, followUpScheduled: true });
    const followUps = await delivery(f, "post_event_follow_up");
    expect(followUps).toHaveLength(1);
    expect(followUps[0].leadId).not.toBe(before._id);
  });

  test("fairLeadSubmit: 3 per visitor and model, then RATE_LIMITED; other models and other visitors are separate", async () => {
    const f = await setup();
    const hash = visitor();
    const duplicates: boolean[] = [];
    for (let i = 0; i < 3; i += 1) duplicates.push((await submit(f, hash, f.models.starter)).duplicate);
    // N5: one lead per visitor, model and kind — the 2nd and 3rd submit return it, but still spend the bucket.
    expect(duplicates).toEqual([false, true, true]);
    await expectCode(submit(f, hash, f.models.starter), "RATE_LIMITED");
    await submit(f, hash, f.models.advanced);
    await submit(f, visitor(), f.models.starter);
    expect(await rows(f, "fairLeads")).toHaveLength(3);
  });

  test("refused for an unpublished model or an ended event", async () => {
    const f = await setup();
    await f.admin.mutation(api.fairAdmin.withdrawModel, { eventModelId: f.models.starter });
    await expectCode(submit(f, visitor(), f.models.starter), "FAIR_MODEL_NOT_FOUND");
    await f.admin.mutation(api.fairAdmin.upsertEvent, {
      code: "test-elektromobilnost-2026", slug: "test-elektromobilnost-2026", title: "TEST elektromobilnost", venueName: "TEST hala",
      startsAt: Date.parse("2026-10-09T00:00:00+02:00"), endsAt: EVENT_ENDS, status: "ended", garagePriority: 1, qrInventoryBusinessId: f.inventory.businessId,
    });
    await expectCode(submit(f, visitor(), f.models.advanced), "EVENT_NOT_ACTIVE");
    await expectNothingStored(f);
  });
});

// =============================================================================
// Idempotency, outbox and sending (all against the fetch mock)
// =============================================================================

describe("B4 outbox: idempotency, one confirmation, retries without duplicates (HANDOFF §5.4, §9, §12)", () => {
  test("a submission retry duplicates neither the lead nor the email", async () => {
    const f = await setup();
    const hash = visitor();
    const id = submissionId();
    const first = await submit(f, hash, f.models.starter, { submissionId: id });
    const retry = await submit(f, hash, f.models.starter, { submissionId: id });
    expect(first.duplicate).toBe(false);
    expect(first.confirmationEmail).toBe(true);
    // D1 (RN N2): the retry queued nothing, so it announces no confirmation.
    expect(retry).toEqual({ ...first, duplicate: true, confirmationEmail: false });
    expect(await rows(f, "fairLeads")).toHaveLength(1);
    expect(await rows(f, "fairEmailDeliveries")).toHaveLength(1);

    // The same submissionId from another visitor (or for another model) is refused.
    await expectCode(submit(f, visitor(), f.models.starter, { submissionId: id }), "SUBMISSION_DUPLICATE");
    await expectCode(submit(f, hash, f.models.advanced, { submissionId: id }), "SUBMISSION_DUPLICATE");

    await runEverything(f);
    expect(calls).toHaveLength(1);
    // A retry after sending still writes and sends nothing.
    expect(await submit(f, hash, f.models.starter, { submissionId: id })).toMatchObject({ duplicate: true, confirmationEmail: false });
    await runEverything(f);
    expect(calls).toHaveLength(1);
  });

  test("the immediate confirmation is sent exactly once, with Idempotency-Key = dedupeKey", async () => {
    const f = await setup();
    await submit(f, visitor(), f.models.starter);
    const [row] = await delivery(f, "immediate_confirmation");
    expect(row).toMatchObject({ status: "queued", attemptCount: 0, recipient: EMAIL, dedupeKey: `fair-lead/${row.leadId}/immediate_confirmation`, scheduledFor: DAY1 });
    await runEverything(f);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ url: "https://api.resend.com/emails", key: row.dedupeKey, auth: "Bearer re_test_not_a_real_key" });
    expect(calls[0].body.to).toEqual([EMAIL]);
    expect(calls[0].body.subject).toBe("Primili smo vaše interesovanje: TEST test-volta-x1");
    expect(calls[0].body.text).toContain("TEST izlagač TA");
    // Starter: no follow-up, so the confirmation does not offer to cancel one.
    expect(calls[0].body.text).not.toContain("odgovorite na ovaj email");
    expect((await delivery(f, "immediate_confirmation"))[0]).toMatchObject({ status: "sent", attemptCount: 1, providerMessageId: "re_test_message_1" });

    // Running the sender again for a sent row is a no-op.
    await f.t.action(internal.fairEmailSender.sendDelivery, { deliveryId: row._id });
    expect(calls).toHaveLength(1);
  });

  test("a provider failure is retried with the SAME key; a final failure waits for an admin retry", async () => {
    const f = await setup();
    respond = (call) => (call === 1 ? new Response(JSON.stringify({ message: `bounce for ${EMAIL}` }), { status: 503 }) : Response.json({ id: `re_test_message_${call}` }));
    await submit(f, visitor(), f.models.starter);
    await runEverything(f);
    expect(calls).toHaveLength(2);
    expect(calls[0].key).toBe(calls[1].key);
    const [sent] = await delivery(f, "immediate_confirmation");
    expect(sent).toMatchObject({ status: "sent", attemptCount: 2, providerMessageId: "re_test_message_2" });
    expect(sent.lastError).toBeUndefined();

    // A non-retryable rejection fails at once; the stored error never echoes the provider message.
    respond = () => new Response(JSON.stringify({ message: `invalid ${EMAIL}` }), { status: 422 });
    await submit(f, visitor(), f.models.starter);
    await runEverything(f);
    const failed = (await delivery(f, "immediate_confirmation")).find((row) => row.status === "failed")!;
    expect(failed).toMatchObject({ attemptCount: 1, lastError: "PROVIDER_REJECTED:422" });
    expect(JSON.stringify(failed.lastError)).not.toContain(EMAIL);
    await expect(f.member.mutation(api.fairLeadsAdmin.retryEmailDelivery, { deliveryId: failed._id })).rejects.toThrow();
    respond = (call) => Response.json({ id: `re_test_message_${call}` });
    await f.admin.mutation(api.fairLeadsAdmin.retryEmailDelivery, { deliveryId: failed._id });
    await runEverything(f);
    expect(calls[calls.length - 1].key).toBe(failed.dedupeKey);
    expect((await f.t.run(async (ctx) => ctx.db.get(failed._id)))).toMatchObject({ status: "sent", attemptCount: 2 });
    await expectCode(f.admin.mutation(api.fairLeadsAdmin.retryEmailDelivery, { deliveryId: failed._id }), "FAIR_EMAIL_DELIVERY_STATUS");
  });

  test("without Resend configuration nothing is sent and the row says why", async () => {
    const f = await setup();
    delete process.env.RESEND_API_KEY;
    await submit(f, visitor(), f.models.starter);
    await runEverything(f);
    expect(calls).toHaveLength(0);
    expect((await delivery(f, "immediate_confirmation"))[0]).toMatchObject({ status: "failed", lastError: "RESEND_NOT_CONFIGURED" });
  });
});

describe("B4 Advanced follow-up (MASTER §8, DATA-INTAKE §6.7, HANDOFF §12)", () => {
  test("follow-up only for Advanced, scheduled once 24–48 h after the fair, sent exactly once", async () => {
    const f = await setup();
    process.env.FAIR_PUBLIC_BASE_URL = "https://test-sajam.example.invalid/ignored-path";
    process.env.FAIR_EMAIL_REPLY_TO = "odgovori@example.invalid";
    await submit(f, visitor(), f.models.starter);
    await submit(f, visitor(), f.models.advanced, { kind: "test_drive", phone: PHONE });
    const followUps = await delivery(f, "post_event_follow_up");
    expect(followUps).toHaveLength(1);
    expect(followUps[0]).toMatchObject({ status: "queued", scheduledFor: FOLLOW_UP_AT, recipient: EMAIL });
    expect(FOLLOW_UP_AT - EVENT_ENDS).toBeGreaterThanOrEqual(24 * 3_600_000);
    expect(FOLLOW_UP_AT - EVENT_ENDS).toBeLessThanOrEqual(48 * 3_600_000);

    // Now: two confirmations; the follow-up waits for its time.
    await runDueNow(f);
    expect(calls).toHaveLength(2);
    const advancedConfirmation = calls.find((call) => call.body.subject.includes("probnu vožnju"))!;
    expect(advancedConfirmation.body.text).toContain("odgovorite na ovaj email");
    expect(advancedConfirmation.body.text).toContain("Ovo je zahtev, a ne zakazan termin");
    expect(advancedConfirmation.body.text).toContain("https://test-sajam.example.invalid/sajam/test-elektromobilnost-2026/model/");
    expect(advancedConfirmation.body.reply_to).toBe("odgovori@example.invalid");
    expect((await delivery(f, "post_event_follow_up"))[0].status).toBe("queued");

    await runEverything(f);
    expect(calls).toHaveLength(3);
    const followUp = calls[2];
    expect(followUp.key).toBe(followUps[0].dedupeKey);
    expect(followUp.body.subject).toBe("TEST naslov izlagača");
    expect(followUp.body.text).toContain("TEST tekst izlagača.\n\nTEST drugi pasus.");
    expect(followUp.body.text).toContain("Ovo je jedina poruka posle sajma.");
    expect((await delivery(f, "post_event_follow_up"))[0]).toMatchObject({ status: "sent", attemptCount: 1 });

    await f.t.action(internal.fairEmailSender.sendDelivery, { deliveryId: followUps[0]._id });
    await runEverything(f);
    expect(calls).toHaveLength(3);
  });

  test("a suppressed lead gets no follow-up; suppression is admin-only", async () => {
    const f = await setup();
    await submit(f, visitor(), f.models.advanced);
    const [lead] = await rows(f, "fairLeads");
    await runDueNow(f);
    expect(calls).toHaveLength(1);

    await expect(f.t.mutation(api.fairLeadsAdmin.setFollowUpSuppressed, { leadId: lead._id, suppressed: true })).rejects.toThrow();
    await expect(f.member.mutation(api.fairLeadsAdmin.setFollowUpSuppressed, { leadId: lead._id, suppressed: true })).rejects.toThrow();
    expect(await f.admin.mutation(api.fairLeadsAdmin.setFollowUpSuppressed, { leadId: lead._id, suppressed: true })).toEqual({ leadId: lead._id, followUpSuppressed: true });
    expect((await rows(f, "fairLeads"))[0]).toMatchObject({ followUpSuppressed: true, suppressedAt: expect.any(Number), suppressedByUserId: f.adminId });

    await runEverything(f);
    expect(calls).toHaveLength(1);
    expect((await delivery(f, "post_event_follow_up"))[0]).toMatchObject({ status: "suppressed", attemptCount: 0 });
  });

  test("without the exhibitor's text the follow-up is not invented and not sent", async () => {
    const f = await setup();
    await submit(f, visitor(), f.models.advancedB);
    await runEverything(f);
    expect(calls).toHaveLength(1);
    expect((await delivery(f, "post_event_follow_up"))[0]).toMatchObject({ status: "failed", lastError: "FOLLOW_UP_TEMPLATE_MISSING" });
  });

  test("the follow-up moment is a morning inside the 24–48 h window, also across DST; no follow-up after the window", () => {
    expect(fairFollowUpAt(EVENT_ENDS)).toBe(FOLLOW_UP_AT);
    // Auto Moto Fest ends after the October DST change.
    const amfEnds = Date.parse("2026-11-02T00:00:00+01:00");
    expect(fairFollowUpAt(amfEnds)).toBe(Date.parse("2026-11-03T10:00:00+01:00"));
    // An evening end lands on the next-but-one morning, still inside 48 h.
    const evening = Date.parse("2026-10-11T20:00:00+02:00");
    expect(fairFollowUpAt(evening)).toBe(Date.parse("2026-10-13T10:00:00+02:00"));
    for (const end of [EVENT_ENDS, amfEnds, evening, Date.parse("2026-10-11T10:00:01+02:00")]) {
      const at = fairFollowUpAt(end);
      expect(at - end).toBeGreaterThanOrEqual(24 * 3_600_000);
      expect(at - end).toBeLessThanOrEqual(48 * 3_600_000);
    }
    expect(fairFollowUpScheduleFor(EVENT_ENDS, DAY1)).toBe(FOLLOW_UP_AT);
    const late = EVENT_ENDS + 47 * 3_600_000;
    expect(fairFollowUpScheduleFor(EVENT_ENDS, late)).toBe(late);
    expect(fairFollowUpScheduleFor(EVENT_ENDS, EVENT_ENDS + 49 * 3_600_000)).toBeNull();
  });
});

// =============================================================================
// K3 hard switches and the legal approval record (RF nalaz 3)
// =============================================================================

describe("K3 hard switches FAIR_LEADS_ENABLED / FAIR_FOLLOWUP_ENABLED and the legal approval record", () => {
  const OFF_VALUES = [undefined, "", "false", "TRUE", " true", "true ", "1", "yes"] as const;
  const setEnv = (name: "FAIR_LEADS_ENABLED" | "FAIR_FOLLOWUP_ENABLED", value: string | undefined) => {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  };
  const formStates = async (f: Fixture) => {
    const states: string[] = [];
    for (const kind of ["interest", "test_drive"] as const) {
      for (const model of Object.values(f.models)) states.push((await f.t.query(api.fairPublic.getLeadForm, { eventModelId: model, kind })).state);
    }
    return states;
  };

  test("leads switch off (the default, or anything but exactly \"true\"): LEADS_DISABLED, the form is closed, no PII stored, nothing sent", async () => {
    const f = await setup();
    for (const value of OFF_VALUES) {
      setEnv("FAIR_LEADS_ENABLED", value);
      await expectCode(submit(f, visitor(), f.models.starter), "LEADS_DISABLED");
      await expectCode(submit(f, visitor(), f.models.advanced, { kind: "test_drive", phone: PHONE }), "LEADS_DISABLED");
      // Before every other check: an invalid hash or a model without the right is still LEADS_DISABLED…
      await expectCode(submit(f, "not-a-hash", f.models.included), "LEADS_DISABLED");
      // …but only after the K1 gateway secret.
      await expectCode(f.t.mutation(api.fairLeads.submitLead, {
        gatewaySecret: "wrong-secret", visitorHash: visitor(), eventModelId: f.models.starter, kind: "interest", submissionId: submissionId(),
        contactName: NAME, email: EMAIL, consentAccepted: true, consentVersion: 1,
      }), "FAIR_GATEWAY_UNAUTHORIZED");
      expect(new Set(await formStates(f))).toEqual(new Set(["leads_disabled"]));
    }
    await expectNothingStored(f);
    await runEverything(f);
    expect(calls).toHaveLength(0);

    // On only with exactly "true": the same submit is stored and confirmed (one mock call).
    setEnv("FAIR_LEADS_ENABLED", "true");
    expect(await f.t.query(api.fairPublic.getLeadForm, { eventModelId: f.models.starter, kind: "interest" })).toMatchObject({ state: "open" });
    expect(await submit(f, visitor(), f.models.starter)).toMatchObject({ duplicate: false, confirmationEmail: true, followUpScheduled: false });
    expect(await rows(f, "fairLeads")).toHaveLength(1);
    await runEverything(f);
    expect(calls).toHaveLength(1);
    expect((await delivery(f, "immediate_confirmation"))[0]).toMatchObject({ status: "sent" });
  });

  test("an existing consent and lead config change nothing while the leads switch is off; CONSENT_NOT_CONFIGURED still applies once it is on", async () => {
    const f = await setup({ consent: false });
    setEnv("FAIR_LEADS_ENABLED", undefined);
    await expectCode(submit(f, visitor(), f.models.starter), "LEADS_DISABLED");
    setEnv("FAIR_LEADS_ENABLED", "true");
    await expectCode(submit(f, visitor(), f.models.starter), "CONSENT_NOT_CONFIGURED");
    expect(await f.t.query(api.fairPublic.getLeadForm, { eventModelId: f.models.starter, kind: "interest" })).toMatchObject({ state: "consent_not_configured" });
    await expectNothingStored(f);
  });

  test("follow-up switch off: an Advanced lead gets its confirmation (without the cancel note) but no follow-up, not even when the switch is turned on later", async () => {
    const f = await setup();
    for (const value of OFF_VALUES) {
      setEnv("FAIR_FOLLOWUP_ENABLED", value);
      expect(await submit(f, visitor(), f.models.advanced, { kind: "test_drive", phone: PHONE })).toMatchObject({ confirmationEmail: true, followUpScheduled: false });
    }
    expect(await delivery(f, "post_event_follow_up")).toHaveLength(0);
    expect(await delivery(f, "immediate_confirmation")).toHaveLength(OFF_VALUES.length);

    setEnv("FAIR_FOLLOWUP_ENABLED", "true");
    await runEverything(f);
    expect(calls).toHaveLength(OFF_VALUES.length);
    for (const call of calls) expect(call.body.text).not.toContain("odgovorite na ovaj email");
    expect(await delivery(f, "post_event_follow_up")).toHaveLength(0);
  });

  test("checked again right before sending: leads switch turned off after queueing → confirmation and follow-up are skipped, nothing is sent", async () => {
    const f = await setup();
    await submit(f, visitor(), f.models.advanced, { kind: "test_drive", phone: PHONE });
    const [confirmation] = await delivery(f, "immediate_confirmation");
    const [followUp] = await delivery(f, "post_event_follow_up");
    expect([confirmation.status, followUp.status]).toEqual(["queued", "queued"]);

    setEnv("FAIR_LEADS_ENABLED", "false");
    await runEverything(f);
    expect(calls).toHaveLength(0);
    expect((await delivery(f, "immediate_confirmation"))[0]).toMatchObject({ status: "skipped", lastError: "LEADS_DISABLED", attemptCount: 0 });
    expect((await delivery(f, "post_event_follow_up"))[0]).toMatchObject({ status: "skipped", lastError: "LEADS_DISABLED", attemptCount: 0 });

    // Closed for good: turning the switch back on does not send a skipped row, and an admin retry is only for `failed`.
    setEnv("FAIR_LEADS_ENABLED", "true");
    await f.t.action(internal.fairEmailSender.sendDelivery, { deliveryId: confirmation._id });
    await expectCode(f.admin.mutation(api.fairLeadsAdmin.retryEmailDelivery, { deliveryId: confirmation._id }), "FAIR_EMAIL_DELIVERY_STATUS");
    await runEverything(f);
    expect(calls).toHaveLength(0);
  });

  test("checked again right before sending: follow-up switch turned off between scheduling and sending → the follow-up is skipped", async () => {
    const f = await setup();
    await submit(f, visitor(), f.models.advanced, { kind: "test_drive", phone: PHONE });
    await runDueNow(f);
    expect(calls).toHaveLength(1);
    expect(calls[0].body.text).toContain("odgovorite na ovaj email");

    setEnv("FAIR_FOLLOWUP_ENABLED", "false");
    await runEverything(f);
    expect(calls).toHaveLength(1);
    expect((await delivery(f, "post_event_follow_up"))[0]).toMatchObject({ status: "skipped", lastError: "FOLLOW_UP_DISABLED", attemptCount: 0 });
  });

  test("follow-up switch off before the confirmation goes out: the confirmation does not announce a follow-up that cannot be sent", async () => {
    const f = await setup();
    await submit(f, visitor(), f.models.advanced, { kind: "test_drive", phone: PHONE });
    setEnv("FAIR_FOLLOWUP_ENABLED", undefined);
    await runEverything(f);
    expect(calls).toHaveLength(1);
    expect(calls[0].body.text).not.toContain("odgovorite na ovaj email");
    expect((await delivery(f, "immediate_confirmation"))[0]).toMatchObject({ status: "sent" });
    expect((await delivery(f, "post_event_follow_up"))[0]).toMatchObject({ status: "skipped", lastError: "FOLLOW_UP_DISABLED" });
  });

  test("the leads switch also guards the follow-up: leads off at follow-up time → skipped LEADS_DISABLED", async () => {
    const f = await setup();
    await submit(f, visitor(), f.models.advanced, { kind: "test_drive", phone: PHONE });
    await runDueNow(f);
    expect(calls).toHaveLength(1);
    setEnv("FAIR_LEADS_ENABLED", undefined);
    await runEverything(f);
    expect(calls).toHaveLength(1);
    expect((await delivery(f, "post_event_follow_up"))[0]).toMatchObject({ status: "skipped", lastError: "LEADS_DISABLED" });
  });

  test("activation without the legal approval record is refused and changes nothing; with it both values are stored and audited", async () => {
    const f = await setup({ consent: false });
    const { consentId } = await f.admin.mutation(api.fairLeadsAdmin.saveConsentDraft, { eventId: f.eventId, leadKind: "interest", text: CONSENT_TEXT });
    const refusals: [{ legalApprovedBy?: string; legalApprovedAt?: number }, "legalApprovedBy" | "legalApprovedAt"][] = [
      [{}, "legalApprovedBy"],
      [{ legalApprovedAt: LEGAL.legalApprovedAt }, "legalApprovedBy"],
      [{ legalApprovedBy: "   ", legalApprovedAt: LEGAL.legalApprovedAt }, "legalApprovedBy"],
      [{ legalApprovedBy: "x".repeat(121), legalApprovedAt: LEGAL.legalApprovedAt }, "legalApprovedBy"],
      [{ legalApprovedBy: LEGAL.legalApprovedBy }, "legalApprovedAt"],
      [{ legalApprovedBy: LEGAL.legalApprovedBy, legalApprovedAt: 0 }, "legalApprovedAt"],
      [{ legalApprovedBy: LEGAL.legalApprovedBy, legalApprovedAt: -1 }, "legalApprovedAt"],
      // Not in the future (system time is DAY1).
      [{ legalApprovedBy: LEGAL.legalApprovedBy, legalApprovedAt: DAY1 + 60_000 }, "legalApprovedAt"],
    ];
    for (const [approval, field] of refusals) {
      await expect(f.admin.mutation(api.fairLeadsAdmin.activateConsent, { consentId, ...approval })).rejects.toMatchObject({
        data: { code: "FAIR_CONSENT_LEGAL_APPROVAL_REQUIRED", details: { field } },
      });
    }
    const [draft] = await rows(f, "fairConsentConfigs");
    expect(draft).toMatchObject({ status: "draft" });
    expect(draft.activatedAt).toBeUndefined();
    expect(draft.legalApprovedBy).toBeUndefined();
    expect((await rows(f, "adminAuditLog")).filter((row) => row.action === "fair_consent_activated")).toHaveLength(0);
    await expectCode(submit(f, visitor(), f.models.starter), "CONSENT_NOT_CONFIGURED");
    // Only an admin may activate, with or without the record.
    await expect(f.member.mutation(api.fairLeadsAdmin.activateConsent, { consentId, ...LEGAL })).rejects.toThrow();
    await expect(f.t.mutation(api.fairLeadsAdmin.activateConsent, { consentId, ...LEGAL })).rejects.toThrow();

    // With the record (name trimmed and collapsed; approved earlier the same day is fine).
    await f.admin.mutation(api.fairLeadsAdmin.activateConsent, { consentId, legalApprovedBy: "  TEST  pravna   provera ", legalApprovedAt: DAY1 });
    expect((await rows(f, "fairConsentConfigs"))[0]).toMatchObject({ status: "active", activatedAt: DAY1, legalApprovedBy: "TEST pravna provera", legalApprovedAt: DAY1 });
    const [version] = await f.admin.query(api.fairLeadsAdmin.getEventConsents, { eventId: f.eventId });
    expect(version).toMatchObject({ status: "active", legalApprovedBy: "TEST pravna provera", legalApprovedAt: DAY1 });
    const audit = (await rows(f, "adminAuditLog")).filter((row) => row.action === "fair_consent_activated");
    expect(audit).toHaveLength(1);
    expect(audit[0].actorUserId).toBe(f.adminId);
    expect(JSON.parse(audit[0].detail!)).toEqual({ eventId: f.eventId, leadKind: "interest", version: 1, legalApprovedBy: "TEST pravna provera", legalApprovedAt: DAY1 });

    // The public form shows only the rendered consent text, never the approval record.
    const form = await f.t.query(api.fairPublic.getLeadForm, { eventModelId: f.models.starter, kind: "interest" });
    expect(form).toMatchObject({ state: "open", consent: { version: 1 } });
    expect(JSON.stringify(form)).not.toMatch(/legalApproved|TEST pravna provera/);
  });
});

// =============================================================================
// N5 — normalization, risky names, duplicates, caps, the outbox sweep and the
// confirmation content (all against the fetch mock; nothing is sent)
// =============================================================================

/** Builds characters from code points, so this file stays plain ASCII around them. */
const ch = (...codes: number[]) => String.fromCodePoint(...codes);
const sweep = (f: Fixture) => f.t.mutation(internal.fairEmails.requeueStaleDeliveries, {});
const deliveryRow = (f: Fixture, id: Id<"fairEmailDeliveries">) => f.t.run(async (ctx) => ctx.db.get(id));
/** Simulates a lost send: the pending scheduled sender of one outbox row is dropped. */
async function loseScheduledSend(f: Fixture, deliveryId: Id<"fairEmailDeliveries">) {
  const dropped = await f.t.run(async (ctx) => {
    let count = 0;
    for (const job of await ctx.db.system.query("_scheduled_functions").collect()) {
      if (job.state.kind === "pending" && (job.args[0] as { deliveryId?: string } | undefined)?.deliveryId === deliveryId) {
        await ctx.scheduler.cancel(job._id);
        count += 1;
      }
    }
    return count;
  });
  expect(dropped).toBe(1);
}

describe("N5 lead fields: normalization and validation (lib/fair-contract.ts, the same code in Next and Convex)", () => {
  test("phone: E.164 with +381 for national numbers; a number without +, 00 or 0 is refused", () => {
    const accepted: Array<[string, string]> = [
      ["064 123 4567", "+381641234567"],
      ["0641234567", "+381641234567"],
      ["064/123-456", "+38164123456"],
      ["+381 64 123 4567", "+381641234567"],
      ["00381 64 123-4567", "+381641234567"],
      ["+381 (0)64 123 4567", "+381641234567"],
      ["(011) 123-4567", "+381111234567"],
      ["018 123 456", "+38118123456"],
      ["+44 20 7946 0958", "+442079460958"],
      [PHONE, PHONE_E164],
    ];
    for (const [raw, e164] of accepted) expect(normalizeFairLeadPhone(raw), raw).toBe(e164);
    for (const raw of ["", "12", "64 123 4567", "381641234567", "+381 6", "06 12", "0641234567890123", "+0 64 123 4567", "064 abc 4567", "064 123 4567 lok. 2", "+381 64 123 4567 89"]) {
      expect(normalizeFairLeadPhone(raw), raw).toBeNull();
    }
  });

  test("email: trimmed and lowercase; a stricter but reasonable shape", () => {
    expect(normalizeFairLeadEmail("  Posetilac.N5@Example.INVALID ")).toBe("posetilac.n5@example.invalid");
    expect(normalizeFairLeadEmail("ime+sajam@poddomen.example.co.rs")).toBe("ime+sajam@poddomen.example.co.rs");
    for (const raw of ["", "a@b", "@example.invalid", "ime@", "ime..prezime@example.invalid", ".ime@example.invalid", "ime@-example.invalid", "ime@example-.invalid", "ime prezime@example.invalid", "ime@example.invalid@x.rs", "ime@example.c", "ime@exa_mple.rs", `${"a".repeat(65)}@example.invalid`, "ime@primer.срб"]) {
      expect(normalizeFairLeadEmail(raw), raw).toBeNull();
    }
  });

  test("name: letters (any script), spaces, . , ' ’ - and up to 3 digits; links, addresses, invisible/bidi characters, phone numbers and sentences are refused with a reason", () => {
    for (const name of ["Marko Petrović", "Ana-Marija O’Brien", "M. Petrović", "J.Petrović", "J.Petrovic", "Ana J.Petrovic", "Đorđe Đokić", "Љубица Јовановић", "TEST A0", "  Ana   Ivić  "]) {
      expect(normalizeFairLeadName(name), name).toEqual({ ok: true, value: name.trim().replace(/\s+/g, " ") });
    }
    const refused: Array<[string, string]> = [
      ["", "empty"],
      ["   ", "empty"],
      ["Marko www.primer-banka.rs", "link"],
      ["Hitno https://primer.invalid/prijava", "link"],
      ["Pogledaj bit.ly", "link"],
      ["Prijava na x.com", "link"],
      // D1: the initial exemption covers only a capitalized surname, never a lowercase domain.
      ["Prijava na X.com", "link"],
      ["J.bit.ly", "link"],
      ["marko@primer.invalid", "link"],
      [`Marko${ch(0x202e)}exe.knom`, "invisible"],
      [`Ma${ch(0x200b)}rko`, "invisible"],
      [`Marko ${ch(0x2066)}Petrović${ch(0x2069)}`, "invisible"],
      [`Marko${ch(0x200f)} Petrović`, "invisible"],
      [`Marko${ch(10)}Petrović`, "invisible"],
      [`Marko${ch(0xfeff)}Petrović`, "invisible"],
      [`Marko${ch(0xe0041)}`, "invisible"],
      ["Pozovite 064 123 4567", "characters"],
      ["<b>Marko</b>", "characters"],
      ["Vaš nalog je blokiran!", "characters"],
      ["Marko: potvrdite", "characters"],
      ["...", "characters"],
      ["Vaš paket čeka potvrdite podatke odmah danas", "too_long"],
      ["A".repeat(121), "too_long"],
    ];
    for (const [name, reason] of refused) expect(normalizeFairLeadName(name), JSON.stringify(name)).toEqual({ ok: false, reason });
  });

  test("submitLead stores the normalized email (lead and recipient) and the E.164 phone", async () => {
    const f = await setup();
    const phones: Array<[string, string]> = [["064 123 4567", "+381641234567"], ["00381 64 123-4567", "+381641234567"], ["+381 (0)64 123 4567", "+381641234567"], ["+44 20 7946 0958", "+442079460958"]];
    for (const [phone] of phones) await submit(f, visitor(), f.models.starter, { email: "  Posetilac.N5@Example.INVALID ", phone });
    const leads = await rows(f, "fairLeads");
    expect(leads.map((row) => row.phone)).toEqual(phones.map(([, e164]) => e164));
    expect(new Set(leads.map((row) => row.email))).toEqual(new Set(["posetilac.n5@example.invalid"]));
    expect(new Set((await delivery(f, "immediate_confirmation")).map((row) => row.recipient))).toEqual(new Set(["posetilac.n5@example.invalid"]));
    await runDueNow(f);
    expect(calls.map((call) => call.body.to)).toEqual(phones.map(() => ["posetilac.n5@example.invalid"]));
  });

  test("a refused field is INVALID_INPUT with { field, reason } (never the value) and nothing is stored", async () => {
    const f = await setup();
    const cases: Array<[LeadArgs, string, string]> = [
      [{ phone: "64 123 4567", email: undefined }, "phone", "format"],
      [{ phone: "+381 6", email: undefined }, "phone", "format"],
      [{ email: "ime..prezime@example.invalid" }, "email", "format"],
      [{ email: "ime prezime@example.invalid" }, "email", "format"],
    ];
    for (const [args, field, reason] of cases) {
      const error = await submit(f, visitor(), f.models.starter, args).then(() => null, (caught: unknown) => caught);
      expect(error).toMatchObject({ data: { code: "INVALID_INPUT", details: { field, reason } } });
      expect(JSON.stringify((error as { data: unknown }).data)).not.toMatch(/64 123|\+381 6|ime\.\.prezime|ime prezime/);
    }
    await expectNothingStored(f);
  });

  test("a name with a URL, an address, invisible/bidi characters, a phone number or phishing text is refused before anything is stored or sent", async () => {
    const f = await setup();
    const refused: Array<[string, string]> = [
      ["Marko www.primer-banka.rs", "link"],
      ["Vaš račun je blokiran https://primer.invalid", "link"],
      ["podrska@primer.invalid", "link"],
      [`Marko${ch(0x202e)}exe.knom`, "invisible"],
      [`Ma${ch(0x200b)}rko`, "invisible"],
      ["Pozovite 064 123 4567", "characters"],
      ["Hitno potvrdite nalog odmah klikom ovde danas", "too_long"],
    ];
    for (const [contactName, reason] of refused) {
      await expect(submit(f, visitor(), f.models.starter, { contactName })).rejects.toMatchObject({ data: { code: "INVALID_INPUT", details: { field: "contactName", reason } } });
    }
    await expectNothingStored(f);
    await runEverything(f);
    expect(calls).toHaveLength(0);
  });
});

describe("N5 duplicates and caps", () => {
  test("one lead per visitor, model and kind: sending the form again (new submissionId) returns the stored lead with duplicate: true and no second email", async () => {
    const f = await setup();
    const hash = visitor();
    const first = await submit(f, hash, f.models.advanced, { kind: "test_drive", phone: PHONE });
    expect(first).toMatchObject({ duplicate: false, confirmationEmail: true, followUpScheduled: true });
    vi.setSystemTime(DAY1 + 60_000);
    const again = await submit(f, hash, f.models.advanced, { kind: "test_drive", phone: "+381 64 999 9999", contactName: "TEST Drugo Ime" });
    expect(again).toEqual({ ...first, duplicate: true, confirmationEmail: false });
    const [lead] = await rows(f, "fairLeads");
    expect(await rows(f, "fairLeads")).toHaveLength(1);
    expect(lead).toMatchObject({ contactName: NAME, phone: PHONE_E164, createdAt: DAY1 });
    expect(await rows(f, "fairEmailDeliveries")).toHaveLength(2);
    await runDueNow(f);
    expect(calls).toHaveLength(1);
    expect(calls[0].key).toBe(`fair-lead/${lead._id}/immediate_confirmation`);

    // Another kind on the model, another model and another visitor are new leads.
    expect(await submit(f, hash, f.models.advanced, { kind: "interest" })).toMatchObject({ duplicate: false });
    expect(await submit(f, hash, f.models.starter)).toMatchObject({ duplicate: false });
    expect(await submit(f, visitor(), f.models.advanced, { kind: "test_drive", phone: PHONE })).toMatchObject({ duplicate: false });
    expect(await rows(f, "fairLeads")).toHaveLength(4);
    // B4 idempotency by submissionId is unchanged: the same id from another visitor is still refused.
    await expectCode(submit(f, visitor(), f.models.advanced, { kind: "test_drive", phone: PHONE, submissionId: lead.submissionId }), "SUBMISSION_DUPLICATE");
  });

  test("D1 (RN N2): a duplicate with another address announces no confirmation (confirmationEmail: false) and queues nothing for the new address", async () => {
    const f = await setup();
    const hash = visitor();
    const first = await submit(f, hash, f.models.starter);
    expect(first).toMatchObject({ duplicate: false, confirmationEmail: true });
    vi.setSystemTime(DAY1 + 60_000);
    const other = "drugi.posetilac@example.invalid";
    const again = await submit(f, hash, f.models.starter, { email: other });
    expect(again).toEqual({ ...first, duplicate: true, confirmationEmail: false });
    // The answer matches the gateway's view (same shape for the frontend).
    expect(Object.keys(again).sort()).toEqual(["confirmationEmail", "duplicate", "eventModelId", "followUpScheduled", "kind", "submittedAt"]);
    const confirmations = await delivery(f, "immediate_confirmation");
    expect(confirmations.map((row) => row.recipient)).toEqual([EMAIL]);
    await runEverything(f);
    expect(calls.flatMap((call) => call.body.to)).toEqual([EMAIL]);
  });

  test("soft cap per address: lead 11 within an hour is stored, its confirmation is skipped (RECIPIENT_CAP), it gets no follow-up and nothing is sent for it", async () => {
    const f = await setup();
    for (let i = 0; i < FAIR_LEAD_CONFIRMATIONS_PER_RECIPIENT; i += 1) {
      expect(await submit(f, visitor(), f.models.starter, { email: i % 2 ? EMAIL : EMAIL.toUpperCase() })).toMatchObject({ confirmationEmail: true });
    }
    const capped = await submit(f, visitor(), f.models.advanced, { kind: "test_drive", phone: PHONE });
    expect(capped).toMatchObject({ duplicate: false, confirmationEmail: false, followUpScheduled: false });
    expect(await rows(f, "fairLeads")).toHaveLength(FAIR_LEAD_CONFIRMATIONS_PER_RECIPIENT + 1);
    const confirmations = await delivery(f, "immediate_confirmation");
    const cappedRow = confirmations[confirmations.length - 1];
    expect(cappedRow).toMatchObject({ recipient: EMAIL, status: "skipped", lastError: "RECIPIENT_CAP", attemptCount: 0 });
    expect(await delivery(f, "post_event_follow_up")).toHaveLength(0);
    await runEverything(f);
    expect(calls).toHaveLength(FAIR_LEAD_CONFIRMATIONS_PER_RECIPIENT);
    expect(calls.map((call) => call.key)).not.toContain(cappedRow.dedupeKey);
    expect(await deliveryRow(f, cappedRow._id)).toMatchObject({ status: "skipped", lastError: "RECIPIENT_CAP" });
    // Closed for good: not an admin retry, not the outbox sweep.
    await expectCode(f.admin.mutation(api.fairLeadsAdmin.retryEmailDelivery, { deliveryId: cappedRow._id }), "FAIR_EMAIL_DELIVERY_STATUS");
    vi.setSystemTime(DAY1 + 10 * 60_000);
    expect(await sweep(f)).toEqual({ requeued: 0, failed: 0, inFlight: 0 });
  });
});

describe("N5 outbox sweep (5-minute cron): stuck queued rows run again, never twice", () => {
  test("a lost send is re-run after 5 minutes with the same Idempotency-Key and sent once; a future follow-up is not touched", async () => {
    const f = await setup();
    await submit(f, visitor(), f.models.advanced, { kind: "test_drive", phone: PHONE });
    const [confirmation] = await delivery(f, "immediate_confirmation");
    const [followUp] = await delivery(f, "post_event_follow_up");
    await loseScheduledSend(f, confirmation._id);
    await runDueNow(f);
    expect(calls).toHaveLength(0);

    vi.setSystemTime(DAY1 + 4 * 60_000);
    expect(await sweep(f)).toEqual({ requeued: 0, failed: 0, inFlight: 0 });
    vi.setSystemTime(DAY1 + 6 * 60_000);
    expect(await sweep(f)).toEqual({ requeued: 1, failed: 0, inFlight: 0 });
    await runDueNow(f);
    expect(calls).toHaveLength(1);
    expect(calls[0].key).toBe(confirmation.dedupeKey);
    const sent = await deliveryRow(f, confirmation._id);
    expect(sent).toMatchObject({ status: "sent", attemptCount: 1 });
    expect(sent!.claimedAt).toBeUndefined();

    vi.setSystemTime(DAY1 + 11 * 60_000);
    expect(await sweep(f)).toEqual({ requeued: 0, failed: 0, inFlight: 0 });
    await runDueNow(f);
    expect(calls).toHaveLength(1);
    expect(await deliveryRow(f, followUp._id)).toMatchObject({ status: "queued", attemptCount: 0, scheduledFor: FOLLOW_UP_AT });
  });

  test("a send that crashed after its claim is left alone while the claim is live, then re-run with the same key; two re-runs still send once", async () => {
    const f = await setup();
    await submit(f, visitor(), f.models.starter);
    const [row] = await delivery(f, "immediate_confirmation");
    await loseScheduledSend(f, row._id);
    // A sender claimed the row and died before markSent/markFailed.
    expect(await f.t.mutation(internal.fairEmails.claimDelivery, { deliveryId: row._id })).toMatchObject({ action: "send" });
    // While that claim is live, a second sender skips the row.
    expect(await f.t.mutation(internal.fairEmails.claimDelivery, { deliveryId: row._id })).toEqual({ action: "skip" });
    vi.setSystemTime(DAY1 + 6 * 60_000);
    expect(await sweep(f)).toEqual({ requeued: 0, failed: 0, inFlight: 1 });
    await runDueNow(f);
    expect(calls).toHaveLength(0);

    vi.setSystemTime(DAY1 + 12 * 60_000);
    // Two ticks before the sender runs: two scheduled sends of the same row.
    expect(await sweep(f)).toEqual({ requeued: 1, failed: 0, inFlight: 0 });
    expect(await sweep(f)).toEqual({ requeued: 1, failed: 0, inFlight: 0 });
    await runDueNow(f);
    expect(calls).toHaveLength(1);
    expect(calls[0].key).toBe(row.dedupeKey);
    expect(await deliveryRow(f, row._id)).toMatchObject({ status: "sent", attemptCount: 2 });
    await runEverything(f);
    expect(calls).toHaveLength(1);
  });

  test("a row whose last attempt crashed becomes failed (PROVIDER_UNAVAILABLE:stalled) instead of a fourth try; the admin retry sends it once", async () => {
    const f = await setup();
    await submit(f, visitor(), f.models.starter);
    const [row] = await delivery(f, "immediate_confirmation");
    await loseScheduledSend(f, row._id);
    await f.t.run(async (ctx) => { await ctx.db.patch(row._id, { attemptCount: FAIR_EMAIL_MAX_ATTEMPTS - 1 }); });
    expect(await f.t.mutation(internal.fairEmails.claimDelivery, { deliveryId: row._id })).toMatchObject({ action: "send" });
    vi.setSystemTime(DAY1 + 12 * 60_000);
    expect(await sweep(f)).toEqual({ requeued: 0, failed: 1, inFlight: 0 });
    const failed = await deliveryRow(f, row._id);
    expect(failed).toMatchObject({ status: "failed", lastError: "PROVIDER_UNAVAILABLE:stalled", attemptCount: FAIR_EMAIL_MAX_ATTEMPTS });
    expect(failed!.claimedAt).toBeUndefined();
    await runEverything(f);
    expect(calls).toHaveLength(0);

    await f.admin.mutation(api.fairLeadsAdmin.retryEmailDelivery, { deliveryId: row._id });
    await runDueNow(f);
    expect(calls).toHaveLength(1);
    expect(calls[0].key).toBe(row.dedupeKey);
    expect(await deliveryRow(f, row._id)).toMatchObject({ status: "sent" });
  });

  test("without Resend: one console.warn without PII, the row stays failed/RESEND_NOT_CONFIGURED (the sweep leaves it), the admin retry sends it once configured", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const f = await setup();
      delete process.env.RESEND_API_KEY;
      await submit(f, visitor(), f.models.starter);
      await runEverything(f);
      expect(calls).toHaveLength(0);
      const [row] = await delivery(f, "immediate_confirmation");
      expect(row).toMatchObject({ status: "failed", lastError: "RESEND_NOT_CONFIGURED" });
      const logged = warn.mock.calls.map((args) => args.map(String).join(" ")).join("\n");
      expect(logged).toContain("RESEND_NOT_CONFIGURED");
      for (const secret of [EMAIL, NAME, row.dedupeKey, String(row.leadId), "re_test"]) expect(logged).not.toContain(secret);

      vi.setSystemTime(DAY1 + 10 * 60_000);
      expect(await sweep(f)).toEqual({ requeued: 0, failed: 0, inFlight: 0 });
      process.env.RESEND_API_KEY = "re_test_not_a_real_key";
      await f.admin.mutation(api.fairLeadsAdmin.retryEmailDelivery, { deliveryId: row._id });
      await runDueNow(f);
      expect(calls).toHaveLength(1);
      expect(calls[0].key).toBe(row.dedupeKey);
      expect(await deliveryRow(f, row._id)).toMatchObject({ status: "sent" });
    } finally {
      warn.mockRestore();
    }
  });
});

describe("N5 confirmation content", () => {
  test("it says what was received, where (stand and venue), the next step, the shared contact, the privacy line and „Ako niste vi…“, in text and HTML", async () => {
    const f = await setup();
    await submit(f, visitor(), f.models.advanced, { kind: "test_drive", phone: PHONE });
    await submit(f, visitor(), f.models.starter, { email: "drugi.n5@example.invalid" });
    await runDueNow(f);
    expect(calls).toHaveLength(2);
    const testDrive = calls.find((call) => call.body.subject.includes("probnu vožnju"))!;
    const interest = calls.find((call) => call.body.subject.includes("interesovanje"))!;
    for (const call of [testDrive, interest]) {
      expect(call.body.text).toContain("Gde ga možete videti:\nTEST štand a, TEST hala");
      expect(call.body.html).toContain("<p>Gde ga možete videti:<br>TEST štand a, TEST hala</p>");
      expect(call.body.text).toContain("ScanMe je podatke primio uz vašu saglasnost i prosleđuje ih samo izlagaču TEST izlagač TA; trajno se brišu 16. 11. 2026.");
      expect(call.body.text).toContain("Ako niste vi poslali ovaj zahtev, odgovorite na ovaj mejl.");
      expect(call.body.text).toContain("ScanMe, digitalni partner Sajma automobila");
    }
    expect(testDrive.body.subject).toBe("Primili smo vaš zahtev za probnu vožnju: TEST test-volta-x2");
    expect(testDrive.body.text).toContain(`Zdravo, ${NAME},`);
    expect(testDrive.body.text).toContain("hvala na zahtevu za probnu vožnju modela TEST test-volta-x2 na događaju TEST elektromobilnost");
    expect(testDrive.body.text).toContain("Šta sledi:\nOvo je zahtev, a ne zakazan termin — izlagač TEST izlagač TA će vas kontaktirati da dogovorite termin.");
    expect(testDrive.body.text).toContain(`Kontakt koji ste ostavili:\n${EMAIL}, ${PHONE_E164}\n`);
    expect(interest.body.text).toContain("Šta sledi:\nIzlagač TEST izlagač TA će vas kontaktirati.");
    expect(interest.body.text).toContain("Kontakt koji ste ostavili:\ndrugi.n5@example.invalid\n");
    // Order: received → where → next step → contact → privacy → „Ako niste vi“ → link → signature.
    const order = ["hvala na zahtevu", "Gde ga možete videti", "Šta sledi", "Kontakt koji ste ostavili", "ScanMe je podatke primio", "Ako niste vi", "Model: https://scanme.rs/sajam/test-elektromobilnost-2026/model/", "ScanMe, digitalni partner"];
    const at = order.map((part) => testDrive.body.text.indexOf(part));
    expect(at.every((index) => index >= 0)).toBe(true);
    expect([...at].sort((left, right) => left - right)).toEqual(at);
  });

  test("it never contains raw HTML from the input and never repeats a risky name", () => {
    const base: FairLeadEmailMessage = {
      kind: "immediate_confirmation", dedupeKey: "fair-lead/x/immediate_confirmation", recipient: EMAIL, leadKind: "interest", contactName: "TEST Ime",
      modelName: "TEST <script>alert(1)</script>", exhibitorName: "TEST <img src=x onerror=alert(1)>", eventTitle: "TEST & sajam", modelPath: "/sajam/test/model/x",
      followUpScheduled: false, standName: "Štand <b>2</b>", venueName: "Hala \"Čair\", Niš", contactEmail: EMAIL, contactPhone: PHONE_E164,
    };
    const email = buildFairLeadEmail(base, "https://scanme.rs");
    expect(email.html).not.toMatch(/<script|<img|<b>/);
    expect(email.html).toContain("TEST &lt;script&gt;alert(1)&lt;/script&gt;");
    expect(email.html).toContain("TEST &lt;img src=x onerror=alert(1)&gt;");
    expect(email.html).toContain("Štand &lt;b&gt;2&lt;/b&gt;, Hala &quot;Čair&quot;, Niš");
    expect(email.text).toContain("Zdravo, TEST Ime,");
    // A name stored before N5 with a link, invisible characters or a phone number is dropped from the greeting.
    for (const contactName of ["Marko www.primer-banka.rs", `Marko${ch(0x202e)}exe.knom`, "Pozovite 0641234567"]) {
      const risky = buildFairLeadEmail({ ...base, contactName }, "https://scanme.rs");
      expect(risky.text.startsWith("Zdravo,\n\n")).toBe(true);
      for (const part of [contactName, "primer-banka", "0641234567", ch(0x202e)]) {
        expect(risky.text).not.toContain(part);
        expect(risky.html).not.toContain(part);
      }
    }
  });
});

// =============================================================================
// PII boundary
// =============================================================================

describe("B4 PII boundary: public functions never return contacts (HANDOFF §7, §12)", () => {
  test("submit results, the lead form and every public/visitor projection carry no contact value", async () => {
    const f = await setup();
    const hash = visitor();
    const id = submissionId();
    const outputs: unknown[] = [];
    outputs.push(await submit(f, hash, f.models.advanced, { kind: "test_drive", submissionId: id, phone: PHONE }));
    outputs.push(await submit(f, hash, f.models.advanced, { kind: "test_drive", submissionId: id, phone: PHONE }));
    outputs.push(await submit(f, hash, f.models.starter));
    for (const kind of ["interest", "test_drive"] as const) {
      for (const model of Object.values(f.models)) outputs.push(await f.t.query(api.fairPublic.getLeadForm, { eventModelId: model, kind }));
    }
    outputs.push(await f.t.query(api.fairPublic.getModelsByIds, { ids: Object.values(f.models) }));
    outputs.push(await f.t.query(api.fairPublic.getEventBySlug, { slug: "test-elektromobilnost-2026" }));
    for (const model of Object.values(f.models)) outputs.push(await f.t.query(api.fairInteractions.getMyModelState, { gatewaySecret: GATEWAY_SECRET, visitorHash: hash, eventModelId: model }));
    outputs.push(await f.t.query(api.fairInteractions.getMyPassportProgress, { gatewaySecret: GATEWAY_SECRET, visitorHash: hash, eventSlug: "test-elektromobilnost-2026" }));
    const text = JSON.stringify(outputs);
    for (const secret of [NAME, EMAIL, PHONE, hash, "consentTextSnapshot"]) expect(text).not.toContain(secret);

    // Anonymous and non-admin callers cannot read leads, settings or consent.
    const page = { numItems: 10, cursor: null };
    for (const caller of [f.t, f.member]) {
      await expect(caller.query(api.fairLeadsAdmin.exportLeads, { eventId: f.eventId, participationId: f.a.participationId, paginationOpts: page })).rejects.toThrow();
      await expect(caller.query(api.fairLeadsAdmin.getModelLeadSettings, { eventModelId: f.models.advanced })).rejects.toThrow();
      await expect(caller.query(api.fairLeadsAdmin.getEventConsents, { eventId: f.eventId })).rejects.toThrow();
    }
  });

  test("the only public lead function is the gateway submit; outbox, sender and purge are internal", () => {
    type Registered = { isPublic?: boolean; isInternal?: boolean };
    const visibility = (module: Record<string, unknown>) =>
      Object.fromEntries(Object.entries(module).map(([name, fn]) => [name, (fn as Registered).isPublic ? "public" : (fn as Registered).isInternal ? "internal" : "other"]));
    expect(visibility(fairLeadsModule)).toEqual({ submitLead: "public" });
    expect(visibility(fairEmailsModule)).toEqual({
      claimDelivery: "internal", markSent: "internal", markFailed: "internal", purgeLeadPiiBatch: "internal",
      // N5: the 5-minute outbox sweep (cron only).
      requeueStaleDeliveries: "internal",
    });
    expect(visibility(fairEmailSenderModule)).toEqual({ sendDelivery: "internal", sendDevTestEmail: "internal" });
    // Admin functions are public endpoints guarded by requireAdmin (tested above).
    expect(Object.values(visibility(fairLeadsAdminModule)).every((value) => value === "public")).toBe(true);
  });

  test("view validators equal the contract types", () => {
    expectTypeOf<Infer<typeof fairLeadFormView>>().toEqualTypeOf<FairLeadFormView>();
    expectTypeOf<Infer<typeof fairLeadSubmitResultView>>().toEqualTypeOf<FairLeadSubmitResult>();
  });
});

// =============================================================================
// Admin export and the lead/email purge seam
// =============================================================================

describe("B4 admin export and purge seam", () => {
  test("export is per exhibitor and event, newest first, paginated and bounded", async () => {
    const f = await setup();
    // N5: one lead per visitor, model and kind, so three leads on one model come from three visitors.
    for (let i = 0; i < 3; i += 1) {
      vi.setSystemTime(DAY1 + i * 1000);
      await submit(f, visitor(), f.models.advanced, { contactName: `TEST A${i}` });
    }
    await submit(f, visitor(), f.models.advancedB, { contactName: "TEST izlagač B lead" });
    const first = await f.admin.query(api.fairLeadsAdmin.exportLeads, { eventId: f.eventId, participationId: f.a.participationId, paginationOpts: { numItems: 2, cursor: null } });
    expect(first.page.map((row) => row.contactName)).toEqual(["TEST A2", "TEST A1"]);
    expect(first.page[0]).toMatchObject({ kind: "interest", email: EMAIL, consentVersion: 1, followUpSuppressed: false, confirmation: { status: "queued" }, followUp: { status: "queued", scheduledFor: FOLLOW_UP_AT } });
    const second = await f.admin.query(api.fairLeadsAdmin.exportLeads, { eventId: f.eventId, participationId: f.a.participationId, paginationOpts: { numItems: 2, cursor: first.continueCursor } });
    expect(second.page.map((row) => row.contactName)).toEqual(["TEST A0"]);
    expect(JSON.stringify([first, second])).not.toContain("TEST izlagač B lead");
    await expectCode(f.admin.query(api.fairLeadsAdmin.exportLeads, { eventId: f.eventId, participationId: f.a.participationId, paginationOpts: { numItems: 101, cursor: null } }), "INVALID_INPUT");
    const otherEvent = await f.t.run(async (ctx) => ctx.db.insert("fairEvents", {
      code: "test-auto-moto-fest-2026", slug: "test-auto-moto-fest-2026", title: "TEST AMF", venueName: "TEST hala", timezone: "Europe/Belgrade",
      startsAt: DAY1, endsAt: DAY1, status: "draft", garagePriority: 2, piiPurgeAt: PURGE_AT, minimumPublicVoteCount: 5, robotsIndexable: false, createdAt: DAY1, updatedAt: DAY1,
    }));
    await expectCode(f.admin.query(api.fairLeadsAdmin.exportLeads, { eventId: otherEvent, participationId: f.a.participationId, paginationOpts: { numItems: 2, cursor: null } }), "FAIR_LINK_NOT_FOUND");
  });

  test("purge batch stays within its limit, deletes all lead/outbox PII and keeps non-PII aggregates and settings", async () => {
    const f = await setup();
    for (let i = 0; i < 3; i += 1) await submit(f, visitor(), f.models.advanced);
    await submit(f, visitor(), f.models.starter, { email: undefined, phone: PHONE });
    await f.t.run(async (ctx) => { await ctx.db.insert("fairMetricCountShards", { key: "scan_total:model:test", shard: 0, value: 7 }); });
    expect(await rows(f, "fairEmailDeliveries")).toHaveLength(6);

    expect(await f.t.mutation(internal.fairEmails.purgeLeadPiiBatch, { limit: 4, dryRun: false })).toMatchObject({ status: "not_due", deliveries: 0, leads: 0 });
    expect(await f.t.mutation(internal.fairEmails.purgeLeadPiiBatch, { limit: 4, dryRun: true })).toEqual({ status: "dry_run", deliveries: 4, leads: 0, hasMore: true });
    expect(await rows(f, "fairLeads")).toHaveLength(4);

    vi.setSystemTime(PURGE_AT);
    const batches = [];
    for (;;) {
      const result = await f.t.mutation(internal.fairEmails.purgeLeadPiiBatch, { limit: 4, dryRun: false });
      expect(result.deliveries + result.leads).toBeLessThanOrEqual(4);
      batches.push(result);
      // No lead is deleted while an outbox row still points at it.
      const deliveries = await rows(f, "fairEmailDeliveries");
      const leadIds = new Set((await rows(f, "fairLeads")).map((row) => row._id));
      expect(deliveries.every((row) => row.leadId === undefined || leadIds.has(row.leadId))).toBe(true);
      if (!result.hasMore) break;
    }
    expect(batches.map((row) => [row.deliveries, row.leads])).toEqual([[4, 0], [2, 2], [0, 2]]);
    expect(await rows(f, "fairLeads")).toHaveLength(0);
    expect(await rows(f, "fairEmailDeliveries")).toHaveLength(0);
    expect(await rows(f, "fairMetricCountShards")).toHaveLength(1);
    expect(await rows(f, "fairConsentConfigs")).toHaveLength(2);
    expect(await rows(f, "fairLeadConfigs")).toHaveLength(4);
    expect(await rows(f, "fairMessageTemplates")).toHaveLength(1);
    // Scheduled sends of purged rows find nothing and send nothing.
    await runEverything(f);
    expect(calls).toHaveLength(0);
  });

  test("lead settings and the follow-up text are admin-managed and versioned", async () => {
    const f = await setup();
    expect(await f.admin.query(api.fairLeadsAdmin.getModelLeadSettings, { eventModelId: f.models.advanced })).toMatchObject({
      packageTier: "advanced",
      interest: { contactRequirement: "one_of", enabled: true },
      testDrive: { contactRequirement: "both", enabled: true },
      followUpTemplate: { subject: "TEST naslov izlagača", version: 1 },
    });
    expect(await f.admin.mutation(api.fairLeadsAdmin.upsertLeadConfig, { eventModelId: f.models.advanced, leadKind: "interest", contactRequirement: "one_of", enabled: true })).toMatchObject({ result: "unchanged" });
    expect(await f.admin.mutation(api.fairLeadsAdmin.upsertFollowUpTemplate, { eventModelId: f.models.advanced, subject: "TEST naslov izlagača", plainText: "TEST tekst izlagača.\n\nTEST drugi pasus." })).toMatchObject({ result: "unchanged", version: 1 });
    expect(await f.admin.mutation(api.fairLeadsAdmin.upsertFollowUpTemplate, { eventModelId: f.models.advanced, subject: "TEST novi\nnaslov", plainText: "TEST nov tekst." })).toMatchObject({ result: "updated", version: 2 });
    const templates = await rows(f, "fairMessageTemplates");
    expect(templates.map((row) => [row.version, row.status, row.subject])).toEqual([[1, "retired", "TEST naslov izlagača"], [2, "active", "TEST novi naslov"]]);
    await expectCode(f.admin.mutation(api.fairLeadsAdmin.upsertFollowUpTemplate, { eventModelId: f.models.starter, subject: "x", plainText: "y" }), "FAIR_FEATURE_NOT_ENTITLED");
    await expect(f.member.mutation(api.fairLeadsAdmin.upsertLeadConfig, { eventModelId: f.models.advanced, leadKind: "interest", contactRequirement: "one_of", enabled: true })).rejects.toThrow();
  });
});

// =============================================================================
// Pure email seam
// =============================================================================

describe("B4 email composition and the Resend seam", () => {
  const message: FairLeadEmailMessage = {
    kind: "immediate_confirmation", dedupeKey: "fair-lead/x/immediate_confirmation", recipient: EMAIL, leadKind: "interest",
    contactName: "TEST <b>Ime</b>", modelName: "TEST Model", exhibitorName: "TEST Izlagač & Co", eventTitle: "TEST sajam", modelPath: "/sajam/test/model/test-model", followUpScheduled: false,
  };

  test("links come from FAIR_PUBLIC_BASE_URL with the main domain as default; HTML is escaped", () => {
    expect(fairPublicBaseUrl(undefined)).toBe("https://scanme.rs");
    expect(fairPublicBaseUrl("ftp://bad.example")).toBe("https://scanme.rs");
    expect(fairPublicBaseUrl("nije url")).toBe("https://scanme.rs");
    expect(fairPublicBaseUrl("https://sajam.example.invalid/")).toBe("https://sajam.example.invalid");
    const email = buildFairLeadEmail(message, "https://scanme.rs");
    expect(email.text).toContain("Model: https://scanme.rs/sajam/test/model/test-model");
    expect(email.html).toContain("TEST &lt;b&gt;Ime&lt;/b&gt;");
    expect(email.html).toContain("TEST Izlagač &amp; Co");
    expect(email.html).not.toContain("<b>Ime</b>");
  });

  test("errors are stable codes; network failures and 5xx are retryable, 4xx are not", async () => {
    const config = { apiKey: "re_test", from: "TEST <t@example.invalid>", to: EMAIL, idempotencyKey: "k" };
    const email = buildFairLeadEmail(message, "https://scanme.rs");
    const reply = (status: number) => vi.fn(async () => new Response(JSON.stringify({ message: `leak ${EMAIL}` }), { status }));
    expect(await sendFairResendEmail(email, config, reply(422) as unknown as typeof fetch)).toEqual({ ok: false, retryable: false, error: "PROVIDER_REJECTED:422" });
    expect(await sendFairResendEmail(email, config, reply(429) as unknown as typeof fetch)).toEqual({ ok: false, retryable: true, error: "PROVIDER_UNAVAILABLE:429" });
    expect(await sendFairResendEmail(email, config, reply(500) as unknown as typeof fetch)).toEqual({ ok: false, retryable: true, error: "PROVIDER_UNAVAILABLE:500" });
    const offline = vi.fn(async () => { throw new Error(`offline ${EMAIL}`); });
    expect(await sendFairResendEmail(email, config, offline as unknown as typeof fetch)).toEqual({ ok: false, retryable: true, error: "PROVIDER_UNAVAILABLE:network" });
  });

  test("the DEV test email goes through the same seam and refuses a malformed address", async () => {
    const t = convexTest(schema, modules);
    expect(await t.action(internal.fairEmailSender.sendDevTestEmail, { to: "nije-adresa" })).toEqual({ ok: false, error: "INVALID_INPUT" });
    expect(calls).toHaveLength(0);
    expect(await t.action(internal.fairEmailSender.sendDevTestEmail, { to: EMAIL })).toEqual({ ok: true, providerMessageId: "re_test_message_1" });
    expect(calls[0].key).toMatch(/^fair-dev-test\//);
    expect(calls[0].body.subject).toBe("TEST: sajamski email sa DEV okruženja");
  });
});
