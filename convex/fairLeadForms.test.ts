/// <reference types="vite/client" />

// Admin UX A7 — the lead forms `Zainteresovan sam` / `Probna vožnja` per
// exhibitor (ADMIN-UX §6 Forme; MASTER §8): the exhibitor default applied to
// every model in one move, the model's exception that wins, the package that
// still decides (interest Starter+, test drive Advanced) with a clear reason
// instead of a silent skip, and the public getLeadForm reading the result.
// The K3 switches and the consent gate are unchanged. TEST data only.

import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const BEFORE_OPENING = Date.parse("2026-10-08T12:00:00+02:00");
const ADMIN_EMAIL = "fair-a7-forms@scanme.test";
const ISSUER = "https://fair-a7-forms.test";
const CONSENT_TEXT = "TEST saglasnost: ScanMe prima podatke i prosleđuje ih izlagaču {izlagac}.";
// K3: a TEST legal approval record (not a real review), required by every activation.
const LEGAL = { legalApprovedBy: "TEST pravna provera", legalApprovedAt: Date.parse("2026-10-01T12:00:00+02:00") };

beforeEach(() => {
  process.env.SCANME_ADMIN_EMAILS = ADMIN_EMAIL;
  process.env.FAIR_LEADS_ENABLED = "true";
  delete process.env.FAIR_FOLLOWUP_ENABLED;
  vi.useFakeTimers();
  vi.setSystemTime(BEFORE_OPENING);
});
afterEach(() => {
  delete process.env.FAIR_LEADS_ENABLED;
  delete process.env.FAIR_FOLLOWUP_ENABLED;
  vi.useRealTimers();
});

const spec = (order: number) => ({ label: `TEST stavka ${order}`, value: `TEST ${order}`, order, isHighlight: order === 1 });

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({ data: expect.objectContaining({ code }) });
}

type Tier = "included" | "starter" | "advanced";

async function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  const ids = await t.run(async (ctx) => {
    const adminId = await ctx.db.insert("users", { email: ADMIN_EMAIL });
    const memberId = await ctx.db.insert("users", { email: "klijent-a7@example.invalid" });
    const client = async (code: string, brandName: string) => {
      const accountId = await ctx.db.insert("accounts", {
        name: `TEST klijent ${code}`, plan: "basic", status: "active", smkCode: `SMK-${code}`, ownerDisplayName: `TEST vlasnik ${code}`,
        normalizedOwnerDisplayName: `test vlasnik ${code.toLowerCase()}`, clientStatus: "active", adminV1MigrationVersion: 1, createdAt: BEFORE_OPENING, updatedAt: BEFORE_OPENING,
      });
      const businessId = await ctx.db.insert("businesses", {
        accountId, name: `TEST izlagač ${code}`, slug: `test-izlagac-${code.toLowerCase()}`, smlCode: `SML-${code}`, kind: "business", clientStatus: "active",
        adminV1MigrationVersion: 1, status: "active", createdAt: BEFORE_OPENING,
      });
      const brandId = await ctx.db.insert("brands", { accountId, name: brandName, normalizedName: brandName.toLowerCase(), revision: "1", colors: [], createdAt: BEFORE_OPENING, updatedAt: BEFORE_OPENING });
      return { accountId, businessId, brandId };
    };
    return { adminId, memberId, a: await client("TA", "TEST Volta"), b: await client("TB", "TEST Om") };
  });
  const admin = t.withIdentity({ subject: ids.adminId, issuer: ISSUER });
  const member = t.withIdentity({ subject: ids.memberId, issuer: ISSUER });
  const { eventId } = await admin.mutation(api.fairAdmin.upsertEvent, {
    code: "test-elektromobilnost-2026", slug: "test-elektromobilnost-2026", title: "TEST elektromobilnost", venueName: "TEST hala",
    startsAt: Date.parse("2026-10-09T00:00:00+02:00"), endsAt: Date.parse("2026-10-12T00:00:00+02:00"), status: "published", garagePriority: 1,
  });
  const exhibitor = async (key: string, client: typeof ids.a, location: string) => {
    const { participationId } = await admin.mutation(api.fairAdmin.upsertParticipation, { eventId, externalKey: `test-em-${key}`, accountId: client.accountId, businessId: client.businessId });
    const { standId } = await admin.mutation(api.fairAdmin.upsertStand, {
      eventId, participationId, externalKey: `test-em-stand-${key}`, code: `TEST-${key}`, displayName: `TEST štand ${key}`, mapLocationId: location,
    });
    const model = async (externalKey: string, packageTier: Tier) => {
      const { modelId } = await admin.mutation(api.fairAdmin.upsertModel, {
        eventId, participationId, standId, brandId: client.brandId, externalKey, displayName: `TEST ${externalKey}`, priceText: "TEST cena",
        specifications: [spec(1), spec(2)], packageTier, passportEligible: false,
      });
      await admin.mutation(api.fairAdmin.publishModel, { eventModelId: modelId });
      return modelId;
    };
    return { participationId, model };
  };
  const a = await exhibitor("a", ids.a, "ispred-14");
  const b = await exhibitor("b", ids.b, "ispred-15");
  const models = {
    included: await a.model("test-volta-x0", "included"),
    starter: await a.model("test-volta-x1", "starter"),
    advanced: await a.model("test-volta-x2", "advanced"),
    other: await b.model("test-om-z1", "advanced"),
  };
  for (const leadKind of ["interest", "test_drive"] as const) {
    const { consentId } = await admin.mutation(api.fairLeadsAdmin.saveConsentDraft, { eventId, leadKind, text: CONSENT_TEXT });
    await admin.mutation(api.fairLeadsAdmin.activateConsent, { consentId, ...LEGAL });
  }
  return { t, admin, member, eventId, a, b, models };
}
type Fixture = Awaited<ReturnType<typeof setup>>;

const configs = (f: Fixture) => f.t.run(async (ctx) => ctx.db.query("fairLeadConfigs").collect());
const configOf = async (f: Fixture, eventModelId: Id<"fairEventModels">, leadKind: "interest" | "test_drive") =>
  (await configs(f)).find((row) => row.eventModelId === eventModelId && row.leadKind === leadKind) ?? null;
const pick = (row: Doc<"fairLeadConfigs"> | null) =>
  row ? { enabled: row.enabled, contactRequirement: row.contactRequirement, preferredContact: row.preferredContact, source: row.source } : null;
const setDefault = (f: Fixture, participationId: Id<"fairParticipations">, leadKind: "interest" | "test_drive", values: { enabled: boolean; contactRequirement: "one_of" | "email" | "phone" | "both"; preferredContact?: "email" | "phone" }) =>
  f.admin.mutation(api.fairLeadsAdmin.upsertParticipationLeadDefault, { participationId, leadKind, ...values });
const apply = (f: Fixture, participationId: Id<"fairParticipations">, leadKind?: "interest" | "test_drive") =>
  f.admin.mutation(api.fairLeadsAdmin.applyLeadDefaultsToModels, { participationId, ...(leadKind ? { leadKind } : {}) });
const form = (f: Fixture, eventModelId: Id<"fairEventModels">, kind: "interest" | "test_drive") => f.t.query(api.fairPublic.getLeadForm, { eventModelId, kind });

describe("A7 lead forms per exhibitor (ADMIN-UX §6 Forme, MASTER §8)", () => {
  test("the exhibitor default is applied to all its models in one move, the package decides and says why; a second run changes nothing", async () => {
    const f = await setup();
    expect(await setDefault(f, f.a.participationId, "interest", { enabled: true, contactRequirement: "email" })).toMatchObject({ result: "created" });
    expect(await setDefault(f, f.a.participationId, "interest", { enabled: true, contactRequirement: "email" })).toMatchObject({ result: "unchanged" });
    await setDefault(f, f.a.participationId, "test_drive", { enabled: true, contactRequirement: "both", preferredContact: "phone" });

    const result = await apply(f, f.a.participationId);
    expect(result).toEqual({
      created: 6, updated: 0, unchanged: 0, skippedOverride: 0, missingDefault: [],
      notEntitled: [
        { eventModelId: f.models.included, leadKind: "interest" },
        { eventModelId: f.models.included, leadKind: "test_drive" },
        { eventModelId: f.models.starter, leadKind: "test_drive" },
      ],
    });
    expect(pick(await configOf(f, f.models.starter, "interest"))).toEqual({ enabled: true, contactRequirement: "email", preferredContact: undefined, source: "default" });
    expect(pick(await configOf(f, f.models.advanced, "test_drive"))).toEqual({ enabled: true, contactRequirement: "both", preferredContact: "phone", source: "default" });
    // No package right: switched off (never enabled), and reported above.
    expect(pick(await configOf(f, f.models.included, "interest"))).toMatchObject({ enabled: false, source: "default" });
    expect(pick(await configOf(f, f.models.starter, "test_drive"))).toMatchObject({ enabled: false, source: "default" });
    // Another exhibitor is not touched.
    expect(await configOf(f, f.models.other, "interest")).toBeNull();

    const snapshot = JSON.stringify(await configs(f));
    expect(await apply(f, f.a.participationId)).toMatchObject({ created: 0, updated: 0, unchanged: 6, skippedOverride: 0 });
    expect(JSON.stringify(await configs(f))).toBe(snapshot);

    // A changed default reaches every following model on the next "Primeni".
    await setDefault(f, f.a.participationId, "interest", { enabled: true, contactRequirement: "one_of", preferredContact: "email" });
    expect(await apply(f, f.a.participationId, "interest")).toMatchObject({ created: 0, updated: 3, unchanged: 0 });
    expect(pick(await configOf(f, f.models.advanced, "interest"))).toEqual({ enabled: true, contactRequirement: "one_of", preferredContact: "email", source: "default" });
    expect((await f.t.run(async (ctx) => ctx.db.query("adminAuditLog").collect())).filter((row) => row.action === "fair_lead_defaults_applied")).toHaveLength(2);
  });

  test("the model's exception wins over the default until it is cleared", async () => {
    const f = await setup();
    await setDefault(f, f.a.participationId, "interest", { enabled: true, contactRequirement: "email" });
    await f.admin.mutation(api.fairLeadsAdmin.upsertLeadConfig, { eventModelId: f.models.advanced, leadKind: "interest", contactRequirement: "phone", enabled: false });
    expect(pick(await configOf(f, f.models.advanced, "interest"))).toEqual({ enabled: false, contactRequirement: "phone", preferredContact: undefined, source: "override" });

    expect(await apply(f, f.a.participationId, "interest")).toMatchObject({ created: 2, skippedOverride: 1 });
    expect(pick(await configOf(f, f.models.advanced, "interest"))).toMatchObject({ enabled: false, contactRequirement: "phone", source: "override" });
    expect((await form(f, f.models.advanced, "interest")).state).toBe("unavailable");

    expect(await f.admin.mutation(api.fairLeadsAdmin.clearLeadOverride, { eventModelId: f.models.advanced, leadKind: "interest" })).toEqual({ result: "updated", enabled: true, entitled: true });
    expect(pick(await configOf(f, f.models.advanced, "interest"))).toEqual({ enabled: true, contactRequirement: "email", preferredContact: undefined, source: "default" });
    expect(await form(f, f.models.advanced, "interest")).toMatchObject({ state: "open", contactRequirement: "email" });

    // A pre-A7 row (no `source`) is an exception too, and clearing needs a default.
    await f.t.run(async (ctx) => {
      const row = (await ctx.db.query("fairLeadConfigs").collect()).find((config) => config.eventModelId === f.models.starter && config.leadKind === "interest")!;
      await ctx.db.patch(row._id, { source: undefined, contactRequirement: "both" });
    });
    expect(await apply(f, f.a.participationId, "interest")).toMatchObject({ skippedOverride: 1 });
    expect(pick(await configOf(f, f.models.starter, "interest"))).toMatchObject({ contactRequirement: "both" });
    await expectCode(f.admin.mutation(api.fairLeadsAdmin.clearLeadOverride, { eventModelId: f.models.starter, leadKind: "test_drive" }), "FAIR_LEAD_DEFAULT_MISSING");
  });

  test("a model without the package never gets the test drive: off by the default, refused as an exception, closed publicly", async () => {
    const f = await setup();
    await setDefault(f, f.a.participationId, "test_drive", { enabled: true, contactRequirement: "phone" });
    const result = await apply(f, f.a.participationId, "test_drive");
    expect(result.notEntitled).toEqual([
      { eventModelId: f.models.included, leadKind: "test_drive" },
      { eventModelId: f.models.starter, leadKind: "test_drive" },
    ]);
    expect(result.missingDefault).toEqual([]);
    expect((await configOf(f, f.models.starter, "test_drive"))?.enabled).toBe(false);
    await expectCode(
      f.admin.mutation(api.fairLeadsAdmin.upsertLeadConfig, { eventModelId: f.models.starter, leadKind: "test_drive", contactRequirement: "phone", enabled: true }),
      "FAIR_FEATURE_NOT_ENTITLED",
    );
    expect(await form(f, f.models.starter, "test_drive")).toEqual({ eventModelId: f.models.starter, kind: "test_drive", state: "unavailable" });
    expect((await form(f, f.models.included, "test_drive")).state).toBe("unavailable");
    // Without a default for the interest form nothing is written for it, and that is said.
    expect((await apply(f, f.a.participationId)).missingDefault).toEqual(["interest"]);
    expect(await configOf(f, f.models.starter, "interest")).toBeNull();
  });

  test("getLeadForm returns the state the forms produce; the K3 switch and the consent gate stay in front", async () => {
    const f = await setup();
    await setDefault(f, f.a.participationId, "interest", { enabled: true, contactRequirement: "one_of" });
    await setDefault(f, f.a.participationId, "test_drive", { enabled: true, contactRequirement: "both", preferredContact: "phone" });
    await apply(f, f.a.participationId);

    expect(await form(f, f.models.advanced, "test_drive")).toEqual({
      eventModelId: f.models.advanced, kind: "test_drive", state: "open", contactRequirement: "both", preferredContact: "phone",
      consent: { version: 1, text: "TEST saglasnost: ScanMe prima podatke i prosleđuje ih izlagaču TEST izlagač TA." },
    });
    expect(await form(f, f.models.starter, "interest")).toMatchObject({ state: "open", contactRequirement: "one_of" });
    expect((await form(f, f.models.other, "interest")).state).toBe("unavailable");

    // The admin view shows the same state, with where it comes from.
    const forms = await f.admin.query(api.fairLeadsAdmin.getEventLeadForms, { eventId: f.eventId });
    expect(forms.defaults.map((row) => `${row.leadKind}:${row.contactRequirement}`).sort()).toEqual(["interest:one_of", "test_drive:both"]);
    expect(forms.models.find((row) => row.eventModelId === f.models.starter)).toMatchObject({
      packageTier: "starter",
      interest: { entitled: true, config: { enabled: true, source: "default" } },
      testDrive: { entitled: false, config: { enabled: false, source: "default" } },
    });
    expect(forms.models.find((row) => row.eventModelId === f.models.other)).toMatchObject({ interest: { entitled: true, config: null } });

    // K3: the switch closes everything regardless of the forms; the admin sees only booleans.
    expect(await f.admin.query(api.fairLeadsAdmin.getLeadSwitches, {})).toEqual({ leadsEnabled: true, followUpEnabled: false });
    delete process.env.FAIR_LEADS_ENABLED;
    expect((await form(f, f.models.advanced, "test_drive")).state).toBe("leads_disabled");
    expect(await f.admin.query(api.fairLeadsAdmin.getLeadSwitches, {})).toEqual({ leadsEnabled: false, followUpEnabled: false });
  });

  test("withdrawn models are left out; the forms functions refuse non-admins before writing", async () => {
    const f = await setup();
    await f.admin.mutation(api.fairAdmin.withdrawModel, { eventModelId: f.models.starter });
    await setDefault(f, f.a.participationId, "interest", { enabled: true, contactRequirement: "email" });
    expect(await apply(f, f.a.participationId, "interest")).toMatchObject({ created: 2 });
    expect(await configOf(f, f.models.starter, "interest")).toBeNull();
    expect((await f.admin.query(api.fairLeadsAdmin.getEventLeadForms, { eventId: f.eventId })).models.map((row) => row.eventModelId)).not.toContain(f.models.starter);

    const before = JSON.stringify(await f.t.run(async (ctx) => [await ctx.db.query("fairLeadConfigs").collect(), await ctx.db.query("fairParticipationLeadDefaults").collect()]));
    for (const caller of [f.t, f.member]) {
      await expect(caller.query(api.fairLeadsAdmin.getEventLeadForms, { eventId: f.eventId })).rejects.toThrow();
      await expect(caller.query(api.fairLeadsAdmin.getLeadSwitches, {})).rejects.toThrow();
      await expect(caller.mutation(api.fairLeadsAdmin.upsertParticipationLeadDefault, { participationId: f.a.participationId, leadKind: "interest", enabled: false, contactRequirement: "phone" })).rejects.toThrow();
      await expect(caller.mutation(api.fairLeadsAdmin.applyLeadDefaultsToModels, { participationId: f.a.participationId })).rejects.toThrow();
      await expect(caller.mutation(api.fairLeadsAdmin.clearLeadOverride, { eventModelId: f.models.advanced, leadKind: "interest" })).rejects.toThrow();
    }
    expect(JSON.stringify(await f.t.run(async (ctx) => [await ctx.db.query("fairLeadConfigs").collect(), await ctx.db.query("fairParticipationLeadDefaults").collect()]))).toBe(before);
  });
});
