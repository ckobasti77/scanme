import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { isAdminEmail } from "./lib/access";
import { normalizeAdminSearchText } from "./lib/adminV1Validators";
import { activeAssignmentForModel, fairEventByCode, setFairModelStatus, upsertFairEvent, upsertFairEventDay } from "./lib/fairCatalog";
import { accessDisplayContext, channelProjectionPatch, createChannel, syncChannel, uniqueCode } from "./lib/accessOperations";
import { writeAdminAudit } from "./lib/adminAudit";
import { assignFairQr } from "./lib/fairQr";
import { createEventOnlyClient } from "./fairAdmin";
import { commitFairImport, type FairImportPayload } from "./fairImport";
import { FAIR_IMPORT_VERSION, fairModelPath } from "../lib/fair-contract";
import { fairBrandPassportEligible, getFairEntitlements } from "../lib/fair-entitlements";
import { fairModelQuestions, fairModelSurveys } from "./lib/fairInteractions";
import { fairLeadConfig } from "./lib/fairLeads";
import { fairTimeKeys } from "./lib/fairScans";
import { fairPackageTier } from "./lib/fairValidators";
import { fairActiveSponsoredSnapshot, fairPublishedSponsoredSnapshots, fairSponsoredItems, fairSponsoredOrder, fairSponsoredSeed } from "./lib/fairSponsored";

// Sajam automobila 2026 — B1 DEV TEST catalog. Run ONLY against a developer
// deployment: `npx convex run fairDevFixtures:seedTestCatalog` (never --prod).
// Everything is an obvious TEST fixture: keys/slugs start with `test-`, names
// with `TEST`, contact emails are @example.invalid. No real exhibitor, price,
// specification or photo; no QR code is created (the TEST inventory client
// exists so a TEST digital QR can later be made through the normal access
// flow). Idempotent: a re-run creates nothing and reports "unchanged".

type ModelSpec = {
  key: string;
  name: string;
  variant?: string;
  tier: "included" | "starter" | "advanced";
  price?: string;
  specs: number;
  highlights: number;
};

const TEST_SPEC_LABELS = ["TEST snaga", "TEST domet", "TEST baterija", "TEST punjenje", "TEST pogon"];

function testSpecifications(count: number, highlights: number) {
  return TEST_SPEC_LABELS.slice(0, count).map((label, index) => ({
    id: `test-spec-${index + 1}`,
    groupId: index < 3 ? "test-performanse" : "test-ostalo",
    groupLabel: index < 3 ? "TEST performanse" : "TEST ostalo",
    groupOrder: index < 3 ? 1 : 2,
    label,
    value: `TEST vrednost ${index + 1}`,
    order: index + 1,
    isHighlight: index < highlights,
  }));
}

function model(prefix: string, spec: ModelSpec, activeFrom: string) {
  return {
    externalKey: `${prefix}-${spec.key}`,
    displayName: spec.name,
    ...(spec.variant ? { variant: spec.variant } : {}),
    ...(spec.price ? { priceText: spec.price } : {}),
    packageTier: spec.tier,
    ...(spec.tier !== "included" ? { packageActiveFrom: activeFrom } : {}),
    specifications: testSpecifications(spec.specs, spec.highlights),
    passportEligible: spec.tier !== "included",
  };
}

// TEST stands sit on stand locations that are free (gray) on the organizer
// maps (M0 geometry, lib/fair-map), so validateMapLocationIds accepts them.
const EVENTS = [
  {
    code: "test-elektromobilnost-2026",
    prefix: "test-em26",
    title: "TEST Sajam elektromobilnosti",
    startsAt: Date.parse("2026-10-09T00:00:00+02:00"),
    endsAt: Date.parse("2026-10-12T00:00:00+02:00"),
    days: ["2026-10-09", "2026-10-10", "2026-10-11"],
    activeFrom: "2026-10-09T09:00:00+02:00",
    exhibitorA: {
      voltaStand: "hala-12",
      amperStand: "ispred-14",
      volta: [
        { key: "volta-x1", name: "TEST Volta X1", variant: "TEST Premium", tier: "advanced", price: "TEST cena", specs: 5, highlights: 4 },
        { key: "volta-x2", name: "TEST Volta X2", tier: "starter", price: "TEST cena", specs: 3, highlights: 2 },
      ] as ModelSpec[],
      amper: [
        { key: "amper-y1", name: "TEST Amper Y1", tier: "starter", specs: 4, highlights: 1 },
        { key: "amper-y2", name: "TEST Amper Y2", tier: "included", specs: 2, highlights: 0 },
      ] as ModelSpec[],
    },
    exhibitorB: {
      stand: "ispred-18",
      models: [
        { key: "om-z1", name: "TEST Om Z1", tier: "advanced", specs: 5, highlights: 3 },
        { key: "om-z2", name: "TEST Om Z2", tier: "included", price: "TEST cena", specs: 2, highlights: 1 },
      ] as ModelSpec[],
    },
  },
  {
    code: "test-auto-moto-fest-2026",
    prefix: "test-amf26",
    title: "TEST Auto Moto Fest",
    startsAt: Date.parse("2026-10-30T00:00:00+01:00"),
    endsAt: Date.parse("2026-11-02T00:00:00+01:00"),
    days: ["2026-10-30", "2026-10-31", "2026-11-01"],
    activeFrom: "2026-10-30T09:00:00+01:00",
    exhibitorA: {
      voltaStand: "ispred-14",
      amperStand: null,
      volta: [{ key: "volta-x1", name: "TEST Volta X1", variant: "TEST Premium", tier: "starter", price: "TEST cena", specs: 5, highlights: 2 }] as ModelSpec[],
      amper: [] as ModelSpec[],
    },
    exhibitorB: {
      stand: "ispred-18",
      models: [
        { key: "om-z1", name: "TEST Om Z1", tier: "advanced", price: "TEST cena", specs: 4, highlights: 4 },
        { key: "om-z3", name: "TEST Om Z3", tier: "starter", specs: 3, highlights: 1 },
        { key: "om-z4", name: "TEST Om Z4", tier: "included", specs: 2, highlights: 0 },
      ] as ModelSpec[],
    },
  },
] as const;

const CLIENTS = {
  a: { smk: "SMK-TEST-FAIR-A", sml: "SML-TEST-FAIR-A", name: "TEST Izlagač A", slug: "test-sajam-izlagac-a" },
  b: { smk: "SMK-TEST-FAIR-B", sml: "SML-TEST-FAIR-B", name: "TEST Izlagač B", slug: "test-sajam-izlagac-b" },
  inventory: { smk: "SMK-TEST-FAIR-QR", sml: "SML-TEST-FAIR-QR", name: "TEST Sajam automobila 2026 — QR inventar", slug: "test-sajam-qr-inventar" },
} as const;

// B7: the 8 Oct 2026 integration test runs one day before the first fair.
const TEST_REHEARSAL = {
  eventCode: "test-elektromobilnost-2026",
  dateKey: "2026-10-08",
  label: "TEST generalna proba",
  startsAt: Date.parse("2026-10-08T00:00:00+02:00"),
  activeFrom: "2026-10-08T00:00:00+02:00",
} as const;

async function fixtureActor(ctx: MutationCtx) {
  const users = await ctx.db.query("users").take(100);
  const admin = users.find((user) => isAdminEmail(user.email));
  if (!admin) throw new Error("fair_dev_fixture_admin_missing");
  return admin._id;
}

async function ensureTestBrand(ctx: MutationCtx, accountId: Id<"accounts">, name: string, now: number) {
  const normalizedName = normalizeAdminSearchText(name);
  const existing = await ctx.db
    .query("brands")
    .withIndex("by_accountId_and_normalizedName", (q) => q.eq("accountId", accountId).eq("normalizedName", normalizedName))
    .first();
  if (existing) return { created: false };
  await ctx.db.insert("brands", { accountId, name, normalizedName, revision: "1", colors: [], createdAt: now, updatedAt: now });
  return { created: true };
}

const counts = v.object({ created: v.number(), updated: v.number(), unchanged: v.number() });
const catalogSummary = v.object({
  events: counts,
  days: counts,
  clients: v.object({ created: v.number(), unchanged: v.number() }),
  brands: v.object({ created: v.number(), unchanged: v.number() }),
  participations: counts,
  stands: counts,
  models: counts,
  activations: v.number(),
  publishedNow: v.number(),
});

export const seedTestCatalog = internalMutation({
  args: {},
  returns: catalogSummary,
  handler: (ctx) => ensureTestCatalog(ctx, { rehearsal: false }),
});

/**
 * `rehearsal: true` (B7 integration seed only) opens the TEST elektromobilnost
 * fair one day early for the 8 Oct integration test: the window starts on
 * 8 Oct, a `TEST generalna proba` day is added and newly created TEST
 * packages start then (existing rows: alignTestRehearsalPackages).
 */
async function ensureTestCatalog(ctx: MutationCtx, options: { rehearsal: boolean }) {
    const actorUserId = await fixtureActor(ctx);
    const now = Date.now();
    const out = {
      events: { created: 0, updated: 0, unchanged: 0 },
      days: { created: 0, updated: 0, unchanged: 0 },
      clients: { created: 0, unchanged: 0 },
      brands: { created: 0, unchanged: 0 },
      participations: { created: 0, updated: 0, unchanged: 0 },
      stands: { created: 0, updated: 0, unchanged: 0 },
      models: { created: 0, updated: 0, unchanged: 0 },
      activations: 0,
      publishedNow: 0,
    };

    const clientIds: Record<keyof typeof CLIENTS, Id<"accounts">> = {} as Record<keyof typeof CLIENTS, Id<"accounts">>;
    let inventoryBusinessId: Id<"businesses"> | null = null;
    for (const [slot, client] of Object.entries(CLIENTS) as [keyof typeof CLIENTS, (typeof CLIENTS)[keyof typeof CLIENTS]][]) {
      const result = await createEventOnlyClient(ctx, {
        accountName: client.name,
        ownerDisplayName: `${client.name} vlasnik`,
        smkCode: client.smk,
        contact: { firstName: "TEST", lastName: `Kontakt ${slot.toUpperCase()}`, email: `${client.slug}@example.invalid`, positionTitle: "TEST kontakt" },
        venue: { name: client.name, slug: client.slug, smlCode: client.sml },
      }, actorUserId, now);
      out.clients[result.result] += 1;
      clientIds[slot] = result.accountId;
      if (slot === "inventory") inventoryBusinessId = result.businessId;
    }
    for (const [accountId, name] of [[clientIds.a, "TEST Volta"], [clientIds.a, "TEST Amper"], [clientIds.b, "TEST Om"]] as const) {
      const { created } = await ensureTestBrand(ctx, accountId, name, now);
      out.brands[created ? "created" : "unchanged"] += 1;
    }

    for (const event of EVENTS) {
      const rehearsal = options.rehearsal && event.code === TEST_REHEARSAL.eventCode;
      const activeFrom = rehearsal ? TEST_REHEARSAL.activeFrom : event.activeFrom;
      const { eventId, result } = await upsertFairEvent(ctx, {
        code: event.code,
        slug: event.code,
        title: event.title,
        venueName: "TEST Beogradski sajam",
        startsAt: rehearsal ? TEST_REHEARSAL.startsAt : event.startsAt,
        endsAt: event.endsAt,
        status: "published",
        garagePriority: event.code.includes("elektromobilnost") ? 1 : 2,
        ...(inventoryBusinessId ? { qrInventoryBusinessId: inventoryBusinessId } : {}),
      }, now);
      out.events[result] += 1;
      for (const [index, dateKey] of event.days.entries()) {
        const day = await upsertFairEventDay(ctx, { eventId, dateKey, label: `TEST dan ${index + 1}`, sortOrder: index + 1 });
        out.days[day.result] += 1;
      }
      if (rehearsal) {
        const day = await upsertFairEventDay(ctx, { eventId, dateKey: TEST_REHEARSAL.dateKey, label: TEST_REHEARSAL.label, sortOrder: 0 });
        out.days[day.result] += 1;
      }

      const a = event.exhibitorA;
      const brandsA = [
        { externalKey: "test-volta", name: "TEST Volta", stand: { externalKey: `${event.prefix}-stand-a1`, code: "TEST-A1", displayName: "TEST štand A1", mapLocationId: a.voltaStand }, models: a.volta.map((m) => model(event.prefix, m, activeFrom)) },
        ...(a.amperStand
          ? [{ externalKey: "test-amper", name: "TEST Amper", stand: { externalKey: `${event.prefix}-stand-a2`, code: "TEST-A2", displayName: "TEST štand A2", mapLocationId: a.amperStand }, models: a.amper.map((m) => model(event.prefix, m, activeFrom)) }]
          : []),
      ];
      const payload: FairImportPayload = {
        version: FAIR_IMPORT_VERSION,
        eventCode: event.code,
        participations: [
          { externalKey: `${event.prefix}-izlagac-a`, accountExternalKey: CLIENTS.a.smk, businessExternalKey: CLIENTS.a.sml, clientSegment: "event_only", brands: brandsA },
          {
            externalKey: `${event.prefix}-izlagac-b`,
            accountExternalKey: CLIENTS.b.smk,
            businessExternalKey: CLIENTS.b.sml,
            clientSegment: "event_only",
            brands: [{ externalKey: "test-om", name: "TEST Om", stand: { externalKey: `${event.prefix}-stand-b1`, code: "TEST-B1", displayName: "TEST štand B1", mapLocationId: event.exhibitorB.stand }, models: event.exhibitorB.models.map((m) => model(event.prefix, m, activeFrom)) }],
          },
        ],
      };
      const committed = await commitFairImport(ctx, payload, actorUserId, now);
      if (!committed.committed) {
        throw new Error(`fair_dev_fixture_import_failed:${committed.issues.filter((i) => i.severity === "error").map((i) => `${i.code}@${i.path}`).join(",")}`);
      }
      for (const key of ["participations", "stands", "models"] as const) {
        for (const kind of ["created", "updated", "unchanged"] as const) out[key][kind] += committed.results[key][kind];
      }

      const models = await ctx.db.query("fairEventModels").withIndex("by_eventId_and_externalKey", (q) => q.eq("eventId", eventId)).take(50);
      for (const row of models) {
        if (!row.externalKey.startsWith("test-")) continue;
        const { changed } = await setFairModelStatus(ctx, row._id, "published", now);
        if (changed) out.publishedNow += 1;
        const activations = await ctx.db.query("fairPackageActivations").withIndex("by_eventModelId_and_activatedAt", (q) => q.eq("eventModelId", row._id)).take(10);
        out.activations += activations.length;
      }
    }
    return out;
}

// Review fixture based on five publicly listed 2026 exhibitors from
// https://sajamautomobila.com/ucesnici-2026/. Only the exhibitor/brand names
// come from that page; every model, price, contact and specification below is
// deliberately invented and visibly marked TEST. DEV only, never --prod.
const SHOWCASE_EVENT = {
  code: "test-auto-moto-fest-2026",
  prefix: "test-amf26-review",
  title: "TEST Auto Moto Fest 2026",
  startsAt: Date.parse("2026-10-30T00:00:00+01:00"),
  endsAt: Date.parse("2026-11-02T00:00:00+01:00"),
  activeFrom: "2026-10-30T09:00:00+01:00",
  days: ["2026-10-30", "2026-10-31", "2026-11-01"],
} as const;

const SHOWCASE_INVENTORY = {
  smk: "SMK-TEST-AMF26-QR",
  sml: "SML-TEST-AMF26-QR",
  name: "TEST Auto Moto Fest 2026 — QR inventar",
  slug: "test-amf26-qr-inventar",
} as const;

const SHOWCASE_EXHIBITORS = [
  {
    key: "toyota", name: "TEST Toyota", smk: "SMK-TEST-AMF26-TOYOTA", sml: "SML-TEST-AMF26-TOYOTA", slug: "test-amf26-toyota",
    stand: "hala-1", standCode: "TEST-T01",
    models: [
      { key: "toyota-urban-ev", name: "TEST Toyota Urban EV", variant: "TEST Launch", tier: "advanced", price: "TEST cena 34.990 EUR", specs: 5, highlights: 4 },
      { key: "toyota-cross-hybrid", name: "TEST Toyota Cross Hybrid", tier: "starter", price: "TEST cena 29.990 EUR", specs: 4, highlights: 2 },
    ] as ModelSpec[],
  },
  {
    key: "citroen", name: "TEST Citroën", smk: "SMK-TEST-AMF26-CITROEN", sml: "SML-TEST-AMF26-CITROEN", slug: "test-amf26-citroen",
    stand: "hala-2", standCode: "TEST-C02",
    models: [
      { key: "citroen-c4-electric", name: "TEST Citroën C4 Electric", tier: "starter", price: "TEST cena 31.500 EUR", specs: 4, highlights: 2 },
      { key: "citroen-c5-concept", name: "TEST Citroën C5 Concept", tier: "included", specs: 2, highlights: 0 },
    ] as ModelSpec[],
  },
  {
    key: "byd", name: "TEST BYD", smk: "SMK-TEST-AMF26-BYD", sml: "SML-TEST-AMF26-BYD", slug: "test-amf26-byd",
    stand: "hala-3", standCode: "TEST-B03",
    models: [
      { key: "byd-dolphin-demo", name: "TEST BYD Dolphin Demo", tier: "advanced", price: "TEST cena 28.900 EUR", specs: 5, highlights: 3 },
      { key: "byd-seal-demo", name: "TEST BYD Seal Demo", tier: "starter", specs: 4, highlights: 2 },
    ] as ModelSpec[],
  },
  {
    key: "geely", name: "TEST Geely", smk: "SMK-TEST-AMF26-GEELY", sml: "SML-TEST-AMF26-GEELY", slug: "test-amf26-geely",
    stand: "hala-5", standCode: "TEST-G05",
    models: [
      { key: "geely-ex5-demo", name: "TEST Geely EX5 Demo", tier: "included", price: "TEST cena 32.400 EUR", specs: 3, highlights: 1 },
      { key: "geely-starray-demo", name: "TEST Geely Starray Demo", tier: "advanced", specs: 5, highlights: 4 },
    ] as ModelSpec[],
  },
  {
    key: "ford", name: "TEST Ford", smk: "SMK-TEST-AMF26-FORD", sml: "SML-TEST-AMF26-FORD", slug: "test-amf26-ford",
    stand: "hala-6-7", standCode: "TEST-F67",
    models: [
      { key: "ford-puma-electric", name: "TEST Ford Puma Electric", tier: "starter", price: "TEST cena 30.700 EUR", specs: 4, highlights: 2 },
      { key: "ford-explorer-demo", name: "TEST Ford Explorer Demo", tier: "included", specs: 2, highlights: 0 },
    ] as ModelSpec[],
  },
] as const;

const showcaseSummary = v.object({
  eventId: v.id("fairEvents"),
  clients: v.object({ created: v.number(), unchanged: v.number() }),
  brands: v.object({ created: v.number(), unchanged: v.number() }),
  days: counts,
  participations: counts,
  stands: counts,
  models: counts,
  publishedNow: v.number(),
  qr: v.object({ created: v.number(), unchanged: v.number() }),
  passport: v.object({ created: v.boolean(), requiredModels: v.number() }),
  leadConfigs: v.object({ created: v.number(), unchanged: v.number() }),
  surveys: v.object({ created: v.number(), unchanged: v.number() }),
  questions: v.object({ created: v.number(), unchanged: v.number() }),
  snapshot: v.object({ created: v.boolean(), items: v.number() }),
});

export const seedShowcaseCatalog = internalMutation({
  args: {},
  returns: showcaseSummary,
  handler: async (ctx) => {
    const actorUserId = await fixtureActor(ctx);
    const now = Date.now();
    const clients = { created: 0, unchanged: 0 };
    const brands = { created: 0, unchanged: 0 };

    const inventory = await createEventOnlyClient(ctx, {
      accountName: SHOWCASE_INVENTORY.name,
      ownerDisplayName: "TEST QR inventar vlasnik",
      smkCode: SHOWCASE_INVENTORY.smk,
      contact: { firstName: "TEST", lastName: "QR Inventar", email: "test-amf26-qr@example.invalid", positionTitle: "TEST kontakt" },
      venue: { name: SHOWCASE_INVENTORY.name, slug: SHOWCASE_INVENTORY.slug, smlCode: SHOWCASE_INVENTORY.sml },
    }, actorUserId, now);
    clients[inventory.result] += 1;

    for (const exhibitor of SHOWCASE_EXHIBITORS) {
      const result = await createEventOnlyClient(ctx, {
        accountName: exhibitor.name,
        ownerDisplayName: `${exhibitor.name} vlasnik`,
        smkCode: exhibitor.smk,
        contact: { firstName: "TEST", lastName: exhibitor.name.slice(5), email: `${exhibitor.slug}@example.invalid`, positionTitle: "TEST sajamski kontakt" },
        venue: { name: exhibitor.name, slug: exhibitor.slug, smlCode: exhibitor.sml },
      }, actorUserId, now);
      clients[result.result] += 1;
      const brand = await ensureTestBrand(ctx, result.accountId, exhibitor.name, now);
      brands[brand.created ? "created" : "unchanged"] += 1;
    }

    const event = await upsertFairEvent(ctx, {
      code: SHOWCASE_EVENT.code,
      slug: SHOWCASE_EVENT.code,
      title: SHOWCASE_EVENT.title,
      venueName: "TEST Hala Čair, Niš",
      startsAt: SHOWCASE_EVENT.startsAt,
      endsAt: SHOWCASE_EVENT.endsAt,
      status: "published",
      garagePriority: 1,
      qrInventoryBusinessId: inventory.businessId,
    }, now);
    const dayCounts = { created: 0, updated: 0, unchanged: 0 };
    for (const [index, dateKey] of SHOWCASE_EVENT.days.entries()) {
      const day = await upsertFairEventDay(ctx, { eventId: event.eventId, dateKey, label: `TEST dan ${index + 1}`, sortOrder: index + 1 });
      dayCounts[day.result] += 1;
    }

    const payload: FairImportPayload = {
      version: FAIR_IMPORT_VERSION,
      eventCode: SHOWCASE_EVENT.code,
      participations: SHOWCASE_EXHIBITORS.map((exhibitor) => ({
        externalKey: `${SHOWCASE_EVENT.prefix}-${exhibitor.key}`,
        accountExternalKey: exhibitor.smk,
        businessExternalKey: exhibitor.sml,
        clientSegment: "event_only" as const,
        reportEmail: `${exhibitor.slug}-izvestaji@example.invalid`,
        leadDeliveryNote: "TEST isporuka leadova — bez stvarnog slanja",
        brands: [{
          externalKey: `test-${exhibitor.key}`,
          name: exhibitor.name,
          stand: {
            externalKey: `${SHOWCASE_EVENT.prefix}-stand-${exhibitor.key}`,
            code: exhibitor.standCode,
            displayName: `${exhibitor.name} štand`,
            mapLocationId: exhibitor.stand,
          },
          models: exhibitor.models.map((entry) => model(SHOWCASE_EVENT.prefix, entry, SHOWCASE_EVENT.activeFrom)),
        }],
      })),
    };
    const committed = await commitFairImport(ctx, payload, actorUserId, now);
    if (!committed.committed) {
      throw new Error(`fair_showcase_fixture_import_failed:${committed.issues.filter((issue) => issue.severity === "error").map((issue) => `${issue.code}@${issue.path}`).join(",")}`);
    }

    let publishedNow = 0;
    const qr = { created: 0, unchanged: 0 };
    const leadConfigs = { created: 0, unchanged: 0 };
    const surveys = { created: 0, unchanged: 0 };
    const questions = { created: 0, unchanged: 0 };
    const firstDay = await ctx.db
      .query("fairEventDays")
      .withIndex("by_eventId_and_dateKey", (q) => q.eq("eventId", event.eventId).eq("dateKey", SHOWCASE_EVENT.days[0]))
      .unique();
    if (!firstDay) throw new Error("fair_showcase_fixture_day_missing");

    const storedModels = (
      await ctx.db.query("fairEventModels").withIndex("by_eventId_and_externalKey", (q) => q.eq("eventId", event.eventId)).take(50)
    ).filter((row) => row.externalKey.startsWith(SHOWCASE_EVENT.prefix));
    for (const stored of storedModels) {
      const status = await setFairModelStatus(ctx, stored._id, "published", now);
      if (status.changed) publishedNow += 1;
      const code = await ensureTestQr(ctx, SHOWCASE_EVENT.code, stored.externalKey);
      qr[code.created ? "created" : "unchanged"] += 1;

      const rights = getFairEntitlements(stored.packageTier);
      for (const leadKind of [...(rights.interest ? ["interest" as const] : []), ...(rights.testDrive ? ["test_drive" as const] : [])]) {
        if (await fairLeadConfig(ctx, stored._id, leadKind)) leadConfigs.unchanged += 1;
        else {
          await ctx.db.insert("fairLeadConfigs", { eventModelId: stored._id, leadKind, contactRequirement: "one_of", enabled: true, updatedByUserId: actorUserId, createdAt: now, updatedAt: now });
          leadConfigs.created += 1;
        }
      }

      if (rights.survey) {
        if ((await fairModelSurveys(ctx, stored._id)).length) surveys.unchanged += 1;
        else {
          await ctx.db.insert("fairSurveys", { eventId: event.eventId, eventModelId: stored._id, title: "TEST anketa", status: "published", questions: TEST_SURVEY_QUESTIONS, version: 1, createdAt: now, updatedAt: now });
          surveys.created += 1;
        }
      }
      if (rights.audienceQuestionsPerDay > 0) {
        const externalKey = `${stored.externalKey}-q-dan-1`;
        const existing = await ctx.db.query("fairAudienceQuestions").withIndex("by_eventId_and_externalKey", (q) => q.eq("eventId", event.eventId).eq("externalKey", externalKey)).first();
        if (existing) questions.unchanged += 1;
        else {
          await ctx.db.insert("fairAudienceQuestions", {
            eventId: event.eventId,
            eventDayId: firstDay._id,
            eventModelId: stored._id,
            externalKey,
            prompt: "TEST Koji detalj vam je najvažniji?",
            options: [
              { id: "test-dizajn", label: "TEST dizajn", order: 1 },
              { id: "test-tehnologija", label: "TEST tehnologija", order: 2 },
            ],
            status: "published",
            sortOrder: 1,
            startsAt: firstDay.startsAt,
            endsAt: firstDay.endsAt,
            showOnSponsoredRotation: rights.sponsoredMapRotation,
            createdAt: now,
            updatedAt: now,
          });
          questions.created += 1;
        }
      }
    }

    const passport = await ensureTestPassport(ctx, SHOWCASE_EVENT.code, "TEST Toyota");
    const snapshot = await publishTestSponsoredSnapshot(ctx, SHOWCASE_EVENT.code, { rotationQuestions: false });
    return {
      eventId: event.eventId,
      clients,
      brands,
      days: dayCounts,
      participations: committed.results.participations,
      stands: committed.results.stands,
      models: committed.results.models,
      publishedNow,
      qr,
      passport: { created: passport.created, requiredModels: passport.requiredModelIds.length },
      leadConfigs,
      surveys,
      questions,
      snapshot: { created: snapshot.created, items: snapshot.eventModelIds.length },
    };
  },
});

// B2 — ONE TEST digital QR for the DEV scan proof (`npx convex run
// fairDevFixtures:seedTestQr`, DEV only, never --prod). Same steps as
// adminProducts.createDigital (subject → channel → digitalQrCodes, healthy,
// redirect on), created in the TEST QR inventory business of the TEST event,
// then assigned to one TEST model through the normal fairAdmin path
// (assignFairQr). Idempotent: a model that already has an active assignment
// gets no new code. Never the 100 real codes.
export const seedTestQr = internalMutation({
  args: { eventCode: v.optional(v.string()), modelExternalKey: v.optional(v.string()) },
  returns: v.object({ created: v.boolean(), resolverCode: v.string(), eventModelId: v.id("fairEventModels"), path: v.string() }),
  handler: (ctx, args) => ensureTestQr(ctx, args.eventCode ?? "test-elektromobilnost-2026", args.modelExternalKey ?? "test-em26-volta-x1"),
});

async function ensureTestQr(ctx: MutationCtx, eventCode: string, modelKey: string) {
    if (!eventCode.startsWith("test-") || !modelKey.startsWith("test-")) throw new Error("fair_dev_fixture_not_test");
    const event = await fairEventByCode(ctx, eventCode);
    if (!event) throw new Error("fair_dev_fixture_event_missing");
    const model = await ctx.db
      .query("fairEventModels")
      .withIndex("by_eventId_and_externalKey", (q) => q.eq("eventId", event._id).eq("externalKey", modelKey))
      .first();
    if (!model) throw new Error("fair_dev_fixture_model_missing");
    const path = fairModelPath(event.slug, model.slug);
    const existing = await activeAssignmentForModel(ctx, model._id);
    if (existing) return { created: false, resolverCode: existing.resolverCode, eventModelId: model._id, path };

    if (!event.qrInventoryBusinessId) throw new Error("fair_dev_fixture_inventory_missing");
    const inventory = await ctx.db.get(event.qrInventoryBusinessId);
    if (!inventory || !inventory.accountId || !inventory.smlCode?.startsWith("SML-TEST-")) throw new Error("fair_dev_fixture_inventory_not_test");
    const accountId = inventory.accountId;
    const actorUserId = await fixtureActor(ctx);
    const now = Date.now();
    const smqCode = await uniqueCode(ctx, "SMQ");
    const subjectId = await ctx.db.insert("accessSubjects", { accountId, businessId: inventory._id, destinationKind: "legacy", createdAt: now, updatedAt: now });
    const displayContext = await accessDisplayContext(ctx, accountId, inventory._id);
    const channel = await createChannel(ctx, (await ctx.db.get(subjectId))!, "qr", actorUserId, now, undefined, displayContext);
    const digitalQrId = await ctx.db.insert("digitalQrCodes", { accountId, businessId: inventory._id, smqCode, channelId: channel.channelId, originalSubjectId: subjectId, createdByUserId: actorUserId, createdAt: now });
    await ctx.db.patch(subjectId, { digitalQrId });
    await ctx.db.patch(channel.channelId, {
      digitalQrId,
      smqCode,
      health: "healthy",
      redirectEnabled: true,
      ...channelProjectionPatch({ resolverCode: channel.resolverCode, smqCode, kind: "qr" }, displayContext),
    });
    await syncChannel(ctx, (await ctx.db.get(channel.channelId))!, (await ctx.db.get(subjectId))!, { kind: "admin", userId: actorUserId }, "digital_created", now);
    await writeAdminAudit(ctx, { actorUserId, accountId, businessId: inventory._id, action: "digital_qr_created", detail: { digitalQrId, smqCode }, now });
    await assignFairQr(ctx, { eventModelId: model._id, resolverCode: channel.resolverCode, reason: "TEST B2 dokaz skeniranja" }, actorUserId, now);
    return { created: true, resolverCode: channel.resolverCode, eventModelId: model._id, path };
}

// M1 — ONE TEST brand passport for the DEV map proof (`npx convex run
// fairDevFixtures:seedTestPassport`, DEV only, never --prod). Same rules and
// rows as fairInteractionsAdmin.publishPassport: ≥2 exhibited models, all
// published, passport candidates and Starter+ (fairBrandPassportEligible),
// frozen before the event opens. Only `test-` events and a `TEST` brand.
// Idempotent: an existing passport of the brand is returned unchanged.
export const seedTestPassport = internalMutation({
  args: { eventCode: v.optional(v.string()), brandName: v.optional(v.string()) },
  returns: v.object({ created: v.boolean(), passportId: v.id("fairPassportConfigs"), requiredModelIds: v.array(v.id("fairEventModels")) }),
  handler: (ctx, args) => ensureTestPassport(ctx, args.eventCode ?? "test-elektromobilnost-2026", args.brandName ?? "TEST Volta"),
});

async function ensureTestPassport(ctx: MutationCtx, eventCode: string, brandName: string) {
    if (!eventCode.startsWith("test-") || !brandName.startsWith("TEST")) throw new Error("fair_dev_fixture_not_test");
    const event = await fairEventByCode(ctx, eventCode);
    if (!event) throw new Error("fair_dev_fixture_event_missing");
    const participations = await ctx.db
      .query("fairParticipations")
      .withIndex("by_eventId_and_externalKey", (q) => q.eq("eventId", event._id))
      .take(20);
    let brandId: Id<"brands"> | null = null;
    for (const participation of participations) {
      const brand = await ctx.db
        .query("brands")
        .withIndex("by_accountId_and_normalizedName", (q) => q.eq("accountId", participation.accountId).eq("normalizedName", normalizeAdminSearchText(brandName)))
        .first();
      if (brand) brandId = brand._id;
    }
    if (!brandId) throw new Error("fair_dev_fixture_brand_missing");
    const foundBrandId = brandId;
    const existing = await ctx.db
      .query("fairPassportConfigs")
      .withIndex("by_eventId_and_brandId", (q) => q.eq("eventId", event._id).eq("brandId", foundBrandId))
      .first();
    if (existing) {
      const members = await ctx.db
        .query("fairPassportEligibleModels")
        .withIndex("by_passportConfigId_and_status", (q) => q.eq("passportConfigId", existing._id).eq("status", "required"))
        .take(50);
      return { created: false, passportId: existing._id, requiredModelIds: members.map((row) => row.eventModelId) };
    }
    const now = Date.now();
    if (now >= event.startsAt) throw new Error("fair_dev_fixture_event_started");
    const models = (
      await ctx.db
        .query("fairEventModels")
        .withIndex("by_eventId_and_brandId", (q) => q.eq("eventId", event._id).eq("brandId", foundBrandId))
        .take(50)
    ).filter((model) => model.status !== "withdrawn");
    const participationIds = new Set(models.map((model) => model.participationId));
    if (
      !models.every((model) => model.externalKey.startsWith("test-") && model.status === "published" && model.passportEligible) ||
      !fairBrandPassportEligible(models) ||
      participationIds.size !== 1
    ) {
      throw new Error("fair_dev_fixture_passport_not_eligible");
    }
    const passportId = await ctx.db.insert("fairPassportConfigs", {
      eventId: event._id,
      brandId: foundBrandId,
      participationId: models[0].participationId,
      status: "published",
      frozenAt: now,
      publishedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    for (const model of models) {
      await ctx.db.insert("fairPassportEligibleModels", {
        passportConfigId: passportId,
        eventId: event._id,
        brandId: foundBrandId,
        eventModelId: model._id,
        status: "required",
        createdAt: now,
      });
    }
    return { created: true, passportId, requiredModelIds: models.map((model) => model._id) };
}

// M2 — DEV TEST sponsored snapshot for the map/display rotation proof
// (`npx convex run fairDevFixtures:seedTestSponsoredSnapshot`, DEV only, never
// --prod). Same rows and order as fairSponsoredAdmin.publishSponsoredSnapshot
// (fairSponsoredSeed + fairSponsoredOrder by Belgrade dayKey, previous
// `published` → `retired`, items never edited) with ONE documented DEV
// difference: the TEST Advanced packages start on the fair day (9/30 Oct), so
// the fixture takes every published `test-` model whose PURCHASED tier is
// Advanced instead of waiting for the activation. Each one gets one TEST
// rotation question with no votes (the map shows "Glasanje je u toku"); no
// vote and no result is invented. Idempotent: an equal active snapshot of the
// same day is returned unchanged.
export const seedTestSponsoredSnapshot = internalMutation({
  args: { eventCode: v.optional(v.string()) },
  returns: v.object({
    created: v.boolean(),
    snapshotId: v.id("fairSponsoredSnapshots"),
    version: v.number(),
    eventModelIds: v.array(v.id("fairEventModels")),
    questionsCreated: v.number(),
  }),
  handler: (ctx, args) => publishTestSponsoredSnapshot(ctx, args.eventCode ?? "test-elektromobilnost-2026", { rotationQuestions: true }),
});

/**
 * `rotationQuestions: false` (B7 integration seed) keeps the questions the
 * caller already selected with showOnSponsoredRotation. Idempotent per day:
 * a new version is published only when the order or a selected question
 * differs from the active snapshot.
 */
async function publishTestSponsoredSnapshot(ctx: MutationCtx, eventCode: string, options: { rotationQuestions: boolean }) {
    if (!eventCode.startsWith("test-")) throw new Error("fair_dev_fixture_not_test");
    const event = await fairEventByCode(ctx, eventCode);
    if (!event) throw new Error("fair_dev_fixture_event_missing");
    const now = Date.now();
    const models = (
      await ctx.db
        .query("fairEventModels")
        .withIndex("by_eventId_and_packageTier", (q) => q.eq("eventId", event._id).eq("packageTier", "advanced"))
        .take(50)
    ).filter((model) => model.status === "published" && model.externalKey.startsWith("test-") && model.displayName.startsWith("TEST"));
    if (!models.length) throw new Error("fair_dev_fixture_no_advanced_model");
    const firstDay = await ctx.db
      .query("fairEventDays")
      .withIndex("by_eventId_and_dateKey", (q) => q.eq("eventId", event._id))
      .first();
    if (!firstDay) throw new Error("fair_dev_fixture_day_missing");

    let questionsCreated = 0;
    for (const model of options.rotationQuestions ? models : []) {
      const externalKey = `${model.externalKey}-q-rotacija`;
      const existing = await ctx.db
        .query("fairAudienceQuestions")
        .withIndex("by_eventId_and_externalKey", (q) => q.eq("eventId", event._id).eq("externalKey", externalKey))
        .first();
      if (existing) continue;
      await ctx.db.insert("fairAudienceQuestions", {
        eventId: event._id,
        eventDayId: firstDay._id,
        eventModelId: model._id,
        externalKey,
        prompt: "TEST pitanje za rotaciju?",
        options: [
          { id: "test-da", label: "TEST da", order: 1 },
          { id: "test-ne", label: "TEST ne", order: 2 },
        ],
        status: "published",
        sortOrder: 1,
        startsAt: firstDay.startsAt,
        endsAt: firstDay.endsAt,
        showOnSponsoredRotation: true,
        createdAt: now,
        updatedAt: now,
      });
      questionsCreated += 1;
    }

    const dayKey = fairTimeKeys(now).dateKey;
    const seed = fairSponsoredSeed(event._id);
    const order = fairSponsoredOrder(models.map((model) => model._id), seed, dayKey);
    const chosen = new Map<Id<"fairEventModels">, Id<"fairAudienceQuestions">>();
    for (const eventModelId of order) {
      const questions = await ctx.db
        .query("fairAudienceQuestions")
        .withIndex("by_eventModelId_and_eventDayId", (q) => q.eq("eventModelId", eventModelId))
        .take(50);
      const selected = questions.find((row) => row.showOnSponsoredRotation && row.status !== "draft");
      if (selected) chosen.set(eventModelId, selected._id);
    }
    const active = await fairActiveSponsoredSnapshot(ctx, event._id);
    if (active && active.dayKey === dayKey) {
      const items = await fairSponsoredItems(ctx, active._id);
      if (items.length === order.length && items.every((item, index) => item.eventModelId === order[index] && item.audienceQuestionId === chosen.get(item.eventModelId))) {
        return { created: false, snapshotId: active._id, version: active.version, eventModelIds: order, questionsCreated };
      }
    }
    const actorUserId = await fixtureActor(ctx);
    const latest = await ctx.db
      .query("fairSponsoredSnapshots")
      .withIndex("by_eventId_and_version", (q) => q.eq("eventId", event._id))
      .order("desc")
      .first();
    const version = (latest?.version ?? 0) + 1;
    for (const previous of await fairPublishedSponsoredSnapshots(ctx, event._id)) {
      await ctx.db.patch(previous._id, { status: "retired" });
    }
    const snapshotId = await ctx.db.insert("fairSponsoredSnapshots", {
      eventId: event._id,
      version,
      dayKey,
      seed,
      status: "published",
      publishedAt: now,
      publishedByUserId: actorUserId,
    });
    for (const [index, eventModelId] of order.entries()) {
      const audienceQuestionId = chosen.get(eventModelId);
      await ctx.db.insert("fairSponsoredSnapshotItems", { snapshotId, eventModelId, order: index, ...(audienceQuestionId ? { audienceQuestionId } : {}) });
    }
    return { created: true, snapshotId, version, eventModelIds: order, questionsCreated };
}

// =============================================================================
// B7 — integration TEST seed for the 8 Oct 2026 test (`npx convex run
// fairDevFixtures:seedIntegrationTest`, DEV only, never --prod). Builds on
// the fixtures above and is idempotent (a re-run reports everything as
// unchanged). Everything is `test-`/`TEST`; nothing real is invented:
// - both TEST fairs, 2 TEST exhibitors, 10 TEST models over all 3 packages;
// - the elektromobilnost TEST fair opens on 8 Oct with a `TEST generalna
//   proba` day; its TEST packages start then (only the initial activation of
//   a never-upgraded TEST model moves). The auto-moto-fest TEST fair stays
//   the future second event (packages from 30 Oct);
// - one TEST digital QR per TEST model (TEST inventory; never the 100 real);
// - the TEST Volta passport; one TEST question per Starter+ model on the
//   rehearsal day (the Advanced one is the map result); one TEST survey per
//   Advanced model; enabled lead forms (one_of) — but NO consent text, so a
//   lead ends in CONSENT_NOT_CONFIGURED until a real text is approved;
// - a published TEST sponsored snapshot for both fairs.
// =============================================================================

const TEST_SURVEY_QUESTIONS = [
  { id: "test-preporuka", prompt: "TEST da li biste preporučili ovaj model?", kind: "yes_no" as const, options: [], required: false, order: 1 },
  {
    id: "test-vaznije",
    prompt: "TEST šta vam je najvažnije?",
    kind: "single_choice" as const,
    options: [
      { id: "test-cena", label: "TEST cena", order: 1 },
      { id: "test-domet", label: "TEST domet", order: 2 },
    ],
    required: false,
    order: 2,
  },
];

async function testModelsOf(ctx: MutationCtx, eventId: Id<"fairEvents">) {
  return (
    await ctx.db.query("fairEventModels").withIndex("by_eventId_and_externalKey", (q) => q.eq("eventId", eventId)).take(50)
  ).filter((model) => model.externalKey.startsWith("test-") && model.displayName.startsWith("TEST") && model.status === "published");
}

/** Existing TEST rows: the initial activation of a never-upgraded TEST model moves to the rehearsal start. */
async function alignTestRehearsalPackages(ctx: MutationCtx, models: readonly Doc<"fairEventModels">[], now: number) {
  let moved = 0;
  for (const model of models) {
    if (model.packageTier === "included" || model.packageActivatedAt <= TEST_REHEARSAL.startsAt) continue;
    const activations = await ctx.db
      .query("fairPackageActivations")
      .withIndex("by_eventModelId_and_activatedAt", (q) => q.eq("eventModelId", model._id))
      .take(10);
    const [initial] = activations;
    if (activations.length !== 1 || initial.note !== "initial_tier" || initial.activatedAt !== model.packageActivatedAt) continue;
    await ctx.db.patch(initial._id, { activatedAt: TEST_REHEARSAL.startsAt });
    await ctx.db.patch(model._id, { packageActivatedAt: TEST_REHEARSAL.startsAt, updatedAt: now });
    moved += 1;
  }
  return moved;
}

export const seedIntegrationTest = internalMutation({
  args: {},
  returns: v.object({
    catalog: catalogSummary,
    rehearsal: v.object({ eventStartsAt: v.number(), dayId: v.id("fairEventDays"), activationsMoved: v.number() }),
    qr: v.array(v.object({ eventCode: v.string(), modelExternalKey: v.string(), tier: fairPackageTier, resolverCode: v.string(), path: v.string(), created: v.boolean() })),
    passport: v.object({ created: v.boolean(), requiredModels: v.number() }),
    leadConfigs: v.object({ created: v.number(), unchanged: v.number() }),
    surveys: v.object({ created: v.number(), unchanged: v.number() }),
    questions: v.object({ created: v.number(), unchanged: v.number() }),
    snapshots: v.array(v.object({ eventCode: v.string(), created: v.boolean(), version: v.number(), items: v.number() })),
  }),
  handler: async (ctx) => {
    const now = Date.now();
    const catalog = await ensureTestCatalog(ctx, { rehearsal: true });
    const actorUserId = await fixtureActor(ctx);
    const em = await fairEventByCode(ctx, TEST_REHEARSAL.eventCode);
    if (!em) throw new Error("fair_dev_fixture_event_missing");
    const rehearsalDay = await ctx.db
      .query("fairEventDays")
      .withIndex("by_eventId_and_dateKey", (q) => q.eq("eventId", em._id).eq("dateKey", TEST_REHEARSAL.dateKey))
      .unique();
    if (!rehearsalDay) throw new Error("fair_dev_fixture_day_missing");
    const activationsMoved = await alignTestRehearsalPackages(ctx, await testModelsOf(ctx, em._id), now);

    const passport = await ensureTestPassport(ctx, TEST_REHEARSAL.eventCode, "TEST Volta");

    const qr = [];
    const leadConfigs = { created: 0, unchanged: 0 };
    for (const event of EVENTS) {
      const row = await fairEventByCode(ctx, event.code);
      if (!row) throw new Error("fair_dev_fixture_event_missing");
      for (const model of await testModelsOf(ctx, row._id)) {
        const code = await ensureTestQr(ctx, event.code, model.externalKey);
        qr.push({ eventCode: event.code, modelExternalKey: model.externalKey, tier: model.packageTier, resolverCode: code.resolverCode, path: code.path, created: code.created });
        const rights = getFairEntitlements(model.packageTier);
        for (const leadKind of [...(rights.interest ? ["interest" as const] : []), ...(rights.testDrive ? ["test_drive" as const] : [])]) {
          if (await fairLeadConfig(ctx, model._id, leadKind)) {
            leadConfigs.unchanged += 1;
            continue;
          }
          await ctx.db.insert("fairLeadConfigs", { eventModelId: model._id, leadKind, contactRequirement: "one_of", enabled: true, updatedByUserId: actorUserId, createdAt: now, updatedAt: now });
          leadConfigs.created += 1;
        }
      }
    }

    const surveys = { created: 0, unchanged: 0 };
    const questions = { created: 0, unchanged: 0 };
    for (const model of await testModelsOf(ctx, em._id)) {
      const rights = getFairEntitlements(model.packageTier);
      if (rights.survey) {
        if ((await fairModelSurveys(ctx, model._id)).length) {
          surveys.unchanged += 1;
        } else {
          await ctx.db.insert("fairSurveys", { eventId: em._id, eventModelId: model._id, title: "TEST anketa", status: "published", questions: TEST_SURVEY_QUESTIONS, version: 1, createdAt: now, updatedAt: now });
          surveys.created += 1;
        }
      }
      if (rights.audienceQuestionsPerDay === 0) continue;
      const externalKey = `${model.externalKey}-q-proba`;
      let question = await ctx.db
        .query("fairAudienceQuestions")
        .withIndex("by_eventId_and_externalKey", (q) => q.eq("eventId", em._id).eq("externalKey", externalKey))
        .first();
      if (question) {
        questions.unchanged += 1;
      } else {
        const questionId = await ctx.db.insert("fairAudienceQuestions", {
          eventId: em._id,
          eventDayId: rehearsalDay._id,
          eventModelId: model._id,
          externalKey,
          prompt: "TEST pitanje generalne probe?",
          options: [
            { id: "test-da", label: "TEST da", order: 1 },
            { id: "test-ne", label: "TEST ne", order: 2 },
          ],
          status: "published",
          sortOrder: 1,
          startsAt: rehearsalDay.startsAt,
          endsAt: rehearsalDay.endsAt,
          showOnSponsoredRotation: false,
          createdAt: now,
          updatedAt: now,
        });
        question = await ctx.db.get(questionId);
        questions.created += 1;
      }
      // The Advanced model's map/display result is the rehearsal question
      // (same exclusivity as fairInteractionsAdmin.setSponsoredResultQuestion).
      if (question && rights.sponsoredMapRotation) {
        for (const row of await fairModelQuestions(ctx, model._id)) {
          const want = row._id === question._id;
          if (row.showOnSponsoredRotation !== want) await ctx.db.patch(row._id, { showOnSponsoredRotation: want, updatedAt: now });
        }
      }
    }

    const snapshots = [];
    for (const event of EVENTS) {
      const published = await publishTestSponsoredSnapshot(ctx, event.code, { rotationQuestions: event.code !== TEST_REHEARSAL.eventCode });
      snapshots.push({ eventCode: event.code, created: published.created, version: published.version, items: published.eventModelIds.length });
    }

    return {
      catalog,
      rehearsal: { eventStartsAt: (await ctx.db.get(em._id))?.startsAt ?? em.startsAt, dayId: rehearsalDay._id, activationsMoved },
      qr,
      passport: { created: passport.created, requiredModels: passport.requiredModelIds.length },
      leadConfigs,
      surveys,
      questions,
      snapshots,
    };
  },
});
