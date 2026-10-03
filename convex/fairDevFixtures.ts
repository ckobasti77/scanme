import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { isAdminEmail } from "./lib/access";
import { normalizeAdminSearchText } from "./lib/adminV1Validators";
import { setFairModelStatus, upsertFairEvent, upsertFairEventDay } from "./lib/fairCatalog";
import { createEventOnlyClient } from "./fairAdmin";
import { commitFairImport, type FairImportPayload } from "./fairImport";
import { FAIR_IMPORT_VERSION } from "../lib/fair-contract";

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
      voltaStand: "test-loc-em-a1",
      amperStand: "test-loc-em-a2",
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
      stand: "test-loc-em-b1",
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
      voltaStand: "test-loc-amf-a1",
      amperStand: null,
      volta: [{ key: "volta-x1", name: "TEST Volta X1", variant: "TEST Premium", tier: "starter", price: "TEST cena", specs: 5, highlights: 2 }] as ModelSpec[],
      amper: [] as ModelSpec[],
    },
    exhibitorB: {
      stand: "test-loc-amf-b1",
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

export const seedTestCatalog = internalMutation({
  args: {},
  returns: v.object({
    events: counts,
    days: counts,
    clients: v.object({ created: v.number(), unchanged: v.number() }),
    brands: v.object({ created: v.number(), unchanged: v.number() }),
    participations: counts,
    stands: counts,
    models: counts,
    activations: v.number(),
    publishedNow: v.number(),
  }),
  handler: async (ctx) => {
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
      const { eventId, result } = await upsertFairEvent(ctx, {
        code: event.code,
        slug: event.code,
        title: event.title,
        venueName: "TEST Beogradski sajam",
        startsAt: event.startsAt,
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

      const a = event.exhibitorA;
      const brandsA = [
        { externalKey: "test-volta", name: "TEST Volta", stand: { externalKey: `${event.prefix}-stand-a1`, code: "TEST-A1", displayName: "TEST štand A1", mapLocationId: a.voltaStand }, models: a.volta.map((m) => model(event.prefix, m, event.activeFrom)) },
        ...(a.amperStand
          ? [{ externalKey: "test-amper", name: "TEST Amper", stand: { externalKey: `${event.prefix}-stand-a2`, code: "TEST-A2", displayName: "TEST štand A2", mapLocationId: a.amperStand }, models: a.amper.map((m) => model(event.prefix, m, event.activeFrom)) }]
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
            brands: [{ externalKey: "test-om", name: "TEST Om", stand: { externalKey: `${event.prefix}-stand-b1`, code: "TEST-B1", displayName: "TEST štand B1", mapLocationId: event.exhibitorB.stand }, models: event.exhibitorB.models.map((m) => model(event.prefix, m, event.activeFrom)) }],
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
  },
});
