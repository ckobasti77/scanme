/// <reference types="vite/client" />

// Sajam 2026 B1 — internal import (BACKEND-HANDOFF §8, DATA-INTAKE-SPEC):
// dryRun never writes, commit is idempotent by event + externalKey, hard errors
// block every write, missing price/photo are warnings (never invented data).

import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { TableNames } from "./_generated/dataModel";
import schema from "./schema";
import { FAIR_PRICE_ON_REQUEST_TEXT } from "../lib/fair-contract";
import type { FairImportPayload } from "./fairImport";

const modules = import.meta.glob("./**/*.ts");
const NOW = Date.parse("2026-10-03T10:00:00Z");
const ADMIN_EMAIL = "fair-import@scanme.test";
const ISSUER = "https://fair-import.test";

beforeEach(() => {
  process.env.SCANME_ADMIN_EMAILS = ADMIN_EMAIL;
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

const FAIR_TABLES = ["fairParticipations", "fairStands", "fairEventModels", "fairPackageActivations", "fairQrAssignments", "cardTargets", "accessDestinationHistory", "adminAuditLog"] as const;

async function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  const ids = await t.run(async (ctx) => {
    const adminId = await ctx.db.insert("users", { email: ADMIN_EMAIL });
    const client = async (code: string, brands: string[], segment?: "event_only") => {
      const accountId = await ctx.db.insert("accounts", {
        name: `Klijent ${code}`, plan: "basic", status: "active", smkCode: `SMK-${code}`, ownerDisplayName: `Vlasnik ${code}`,
        normalizedOwnerDisplayName: `vlasnik ${code.toLowerCase()}`, clientStatus: "active", adminV1MigrationVersion: 1,
        ...(segment ? { clientSegment: segment } : {}), createdAt: NOW, updatedAt: NOW,
      });
      await ctx.db.insert("accountContacts", {
        accountId, firstName: "Kontakt", lastName: code, normalizedName: `kontakt ${code.toLowerCase()}`, normalizedEmail: `${code.toLowerCase()}@example.invalid`,
        positionTitle: "Vlasnik", isOwner: true, status: "active", createdAt: NOW, updatedAt: NOW,
      });
      const businessId = await ctx.db.insert("businesses", {
        accountId, name: `Lokal ${code}`, slug: `lokal-${code.toLowerCase()}`, smlCode: `SML-${code}`, kind: "business", clientStatus: "active",
        adminV1MigrationVersion: 1, status: "active", createdAt: NOW,
      });
      for (const name of brands) await ctx.db.insert("brands", { accountId, name, normalizedName: name.toLowerCase(), revision: "1", colors: [], createdAt: NOW, updatedAt: NOW });
      return { accountId, businessId };
    };
    const a = await client("FA", ["Volta"], "event_only");
    const b = await client("FB", ["Om"]);
    const inventory = await client("QR", []);
    return { adminId, a, b, inventory };
  });
  const admin = t.withIdentity({ subject: ids.adminId, issuer: ISSUER });
  await admin.mutation(api.fairAdmin.upsertEvent, {
    code: "elektromobilnost-2026", slug: "elektromobilnost-2026", title: "Sajam elektromobilnosti", venueName: "Beogradski sajam",
    startsAt: Date.parse("2026-10-09T00:00:00+02:00"), endsAt: Date.parse("2026-10-12T00:00:00+02:00"), garagePriority: 1,
    qrInventoryBusinessId: ids.inventory.businessId,
  });
  const qr = async (key: string) => {
    const id = await admin.mutation(api.adminProducts.createDigital, { accountId: ids.inventory.accountId, businessId: ids.inventory.businessId, key });
    return t.run(async (ctx) => (await ctx.db.get((await ctx.db.get(id))!.channelId))!.resolverCode);
  };
  return { t, admin, ...ids, qr };
}
type Fixture = Awaited<ReturnType<typeof setup>>;

function payload(codes: { x1?: string; z1?: string } = {}): FairImportPayload {
  return {
    version: 1,
    eventCode: "elektromobilnost-2026",
    participations: [
      {
        externalKey: "em26-izlagac-a", accountExternalKey: "smk-fa", businessExternalKey: "SML-FA", clientSegment: "event_only",
        reportEmail: "Izvestaji@Example.invalid", primaryContactEmail: "fa@example.invalid",
        brands: [{
          externalKey: "volta", name: "Volta",
          stand: { externalKey: "em26-stand-a12", code: "A12", mapLocationId: "hala-1a" },
          models: [
            {
              externalKey: "em26-volta-x1", displayName: "Volta X1", variant: "Premium", priceText: "4.990.000 RSD", packageTier: "starter",
              packageActiveFrom: "2026-10-09T09:00:00+02:00", photoUrl: "https://cdn.example.invalid/x1.jpg", passportEligible: true,
              ...(codes.x1 ? { assignedResolverCode: codes.x1 } : {}),
              specifications: [
                { label: "Snaga", value: "150 kW", order: 1, groupId: "pogon", groupLabel: "Pogon", groupOrder: 1, isHighlight: true },
                { label: "Domet", value: "420 km", order: 2, groupId: "pogon", groupLabel: "Pogon", groupOrder: 1 },
              ],
            },
            { externalKey: "em26-volta-x2", displayName: "Volta X2", packageTier: "included", passportEligible: false, specifications: [{ label: "Snaga", value: "90 kW", order: 1 }] },
          ],
        }],
      },
      {
        externalKey: "em26-izlagac-b", accountExternalKey: "SMK-FB", businessExternalKey: "SML-FB",
        brands: [{
          externalKey: "om", name: "Om",
          stand: { externalKey: "em26-stand-b3", code: "B3", displayName: "Om štand", mapLocationId: "hala-1b" },
          models: [{
            externalKey: "em26-om-z1", displayName: "Om Z1", priceText: "Cena po dogovoru", packageTier: "advanced", passportEligible: true,
            ...(codes.z1 ? { assignedResolverCode: codes.z1 } : {}),
            specifications: [{ label: "Baterija", value: "77 kWh", order: 1 }],
          }],
        }],
      },
    ],
  };
}

async function snapshot(f: Fixture) {
  return f.t.run(async (ctx) => {
    const out: Record<string, unknown[]> = {};
    for (const table of FAIR_TABLES) out[table] = await ctx.db.query(table as TableNames).collect();
    return out;
  });
}

describe("dry run", () => {
  test("returns errors and warnings and never writes", async () => {
    const f = await setup();
    const x1 = await f.qr("inv-1");
    const before = await snapshot(f);
    const result = await f.admin.query(api.fairImport.dryRun, { payload: payload({ x1 }) });
    expect(result.ok).toBe(true);
    expect(result.summary).toEqual({ participations: { new: 2, existing: 0 }, stands: { new: 2, existing: 0 }, models: { new: 3, existing: 0 }, upgrades: 0, qrAssignments: 1 });
    expect(result.issues.map((i) => `${i.severity}:${i.code}:${i.path}`).sort()).toEqual([
      "warning:FAIR_PHOTO_MISSING:participations[0].brands[0].models[1].photoUrl",
      "warning:FAIR_PHOTO_MISSING:participations[1].brands[0].models[0].photoUrl",
      "warning:FAIR_PRICE_MISSING:participations[0].brands[0].models[1].priceText",
      "warning:FAIR_QR_MISSING:participations[0].brands[0].models[1].assignedResolverCode",
      "warning:FAIR_QR_MISSING:participations[1].brands[0].models[0].assignedResolverCode",
    ]);
    expect(await snapshot(f)).toEqual(before);
  });

  test("hard errors: unknown/conflicting links, duplicates, taken QR, bad map location, downgrade", async () => {
    const f = await setup();
    const x1 = await f.qr("inv-1");
    await f.admin.mutation(api.fairImport.commit, { payload: payload({ x1 }) });
    const bad = payload({ z1: x1 });
    const [a, b] = bad.participations;
    bad.participations = [
      { ...a, businessExternalKey: "SML-FB", brands: [{ ...a.brands[0], models: [{ ...a.brands[0].models[0], packageTier: "included" }, a.brands[0].models[1]] }] },
      { ...b, brands: [{ ...b.brands[0], name: "Nepostojeci", stand: { ...b.brands[0].stand, mapLocationId: "hala-1a" } }] },
      { ...b, externalKey: "em26-izlagac-c", accountExternalKey: "SMK-NEMA" },
      { ...b, externalKey: "em26-izlagac-d", clientSegment: "event_only", brands: [{ ...b.brands[0], stand: { ...b.brands[0].stand, externalKey: "em26-stand-d" }, models: [{ ...b.brands[0].models[0], externalKey: "em26-volta-x1", displayName: "Volta X1", variant: "Premium", assignedResolverCode: "NEPOSTOJI" }] }] },
    ];
    const result = await f.admin.query(api.fairImport.dryRun, { payload: bad });
    expect(result.ok).toBe(false);
    const errors = result.issues.filter((i) => i.severity === "error").map((i) => `${i.code}:${i.path}`);
    expect(errors).toEqual(expect.arrayContaining([
      "FAIR_LINK_CONFLICT:participations[0].businessExternalKey",
      "FAIR_LINK_NOT_FOUND:participations[1].brands[0].name",
      "FAIR_LINK_NOT_FOUND:participations[2].accountExternalKey",
      "FAIR_DUPLICATE_KEY:participations[3].businessExternalKey",
      "FAIR_CLIENT_SEGMENT_MISMATCH:participations[3].clientSegment",
      "FAIR_LINK_CONFLICT:participations[3].brands[0].models[0]",
      "FAIR_QR_NOT_IN_INVENTORY:participations[3].brands[0].models[0].assignedResolverCode",
    ]));

    // Model-level conflicts on a clean participation structure.
    const dup = payload({ x1, z1: x1 });
    dup.participations[0].brands[0].models[0].packageTier = "included";
    dup.participations[1].brands[0].models.push({ ...dup.participations[1].brands[0].models[0], externalKey: "em26-om-z1b", assignedResolverCode: undefined });
    dup.participations[1].brands[0].stand.mapLocationId = "hala-1a";
    const dupErrors = (await f.admin.query(api.fairImport.dryRun, { payload: dup })).issues.filter((i) => i.severity === "error").map((i) => `${i.code}:${i.path}`);
    expect(dupErrors).toEqual(expect.arrayContaining([
      "FAIR_PACKAGE_DOWNGRADE:participations[0].brands[0].models[0].packageTier",
      "FAIR_QR_ALREADY_ASSIGNED:participations[1].brands[0].models[0].assignedResolverCode",
      "FAIR_SLUG_TAKEN:participations[1].brands[0].models[1].slug",
    ]));
    // Owner decision O4: a map location shared by two exhibitors is a warning, not an error.
    const dupWarnings = (await f.admin.query(api.fairImport.dryRun, { payload: dup })).issues.filter((i) => i.severity === "warning").map((i) => `${i.code}:${i.path}`);
    expect(dupWarnings).toContain("FAIR_MAP_LOCATION_TAKEN:participations[1].brands[0].stand.mapLocationId");
    expect(dupErrors.filter((issue) => issue.startsWith("FAIR_MAP_LOCATION_TAKEN"))).toEqual([]);

    const unsupported = await f.admin.query(api.fairImport.dryRun, { payload: { ...payload(), version: 2 } });
    expect(unsupported.issues).toEqual([expect.objectContaining({ code: "FAIR_IMPORT_VERSION_UNSUPPORTED" })]);

    // commit with any error writes nothing.
    const before = await snapshot(f);
    const committed = await f.admin.mutation(api.fairImport.commit, { payload: dup });
    expect(committed.committed).toBe(false);
    expect(await snapshot(f)).toEqual(before);
  });
});

describe("commit", () => {
  test("is idempotent by event + externalKey and assigns only existing inventory QR", async () => {
    const f = await setup();
    const x1 = await f.qr("inv-1");
    const first = await f.admin.mutation(api.fairImport.commit, { payload: payload({ x1 }) });
    expect(first.committed).toBe(true);
    expect(first.results).toEqual({
      participations: { created: 2, updated: 0, unchanged: 0 },
      stands: { created: 2, updated: 0, unchanged: 0 },
      models: { created: 3, updated: 0, unchanged: 0 },
      upgrades: 0,
      qrAssignments: 1,
    });
    const stored = await f.t.run(async (ctx) => ({
      models: await ctx.db.query("fairEventModels").collect(),
      participations: await ctx.db.query("fairParticipations").collect(),
      stands: await ctx.db.query("fairStands").collect(),
      activations: await ctx.db.query("fairPackageActivations").collect(),
      assignment: await ctx.db.query("fairQrAssignments").unique(),
    }));
    const x1Model = stored.models.find((m) => m.externalKey === "em26-volta-x1")!;
    expect(x1Model).toMatchObject({ slug: "volta-x1-premium", status: "draft", packageTier: "starter", packageActivatedAt: Date.parse("2026-10-09T09:00:00+02:00"), photoUrl: "https://cdn.example.invalid/x1.jpg" });
    expect(x1Model.specifications.map((s) => [s.id, s.groupId, s.groupLabel, s.isHighlight])).toEqual([["spec-1", "pogon", "Pogon", true], ["spec-2", "pogon", "Pogon", false]]);
    const x2Model = stored.models.find((m) => m.externalKey === "em26-volta-x2")!;
    expect(x2Model.priceText).toBe(FAIR_PRICE_ON_REQUEST_TEXT);
    expect(x2Model.photoUrl).toBeUndefined();
    expect(stored.participations.find((p) => p.externalKey === "em26-izlagac-a")).toMatchObject({ reportRecipientEmail: "izvestaji@example.invalid", accountId: f.a.accountId, businessId: f.a.businessId });
    expect(stored.stands.find((s) => s.externalKey === "em26-stand-a12")!.displayName).toBe("Volta");
    expect(stored.activations.map((a) => [a.fromTier, a.toTier]).sort()).toEqual([["included", "advanced"], ["included", "starter"]]);
    expect(stored.assignment).toMatchObject({ eventModelId: x1Model._id, resolverCode: x1, status: "assigned" });

    const before = await snapshot(f);
    vi.setSystemTime(NOW + 60_000);
    const second = await f.admin.mutation(api.fairImport.commit, { payload: payload({ x1 }) });
    expect(second.results).toEqual({
      participations: { created: 0, updated: 0, unchanged: 2 },
      stands: { created: 0, updated: 0, unchanged: 2 },
      models: { created: 0, updated: 0, unchanged: 3 },
      upgrades: 0,
      qrAssignments: 0,
    });
    const after = await snapshot(f);
    // Only the import audit row is new; no fair/QR row was created or patched.
    for (const table of FAIR_TABLES.filter((name) => name !== "adminAuditLog")) expect(after[table]).toEqual(before[table]);
    expect(after.adminAuditLog).toHaveLength(before.adminAuditLog.length + 1);
  });

  test("a later import upgrades the package with an audit row and keeps the QR", async () => {
    const f = await setup();
    const x1 = await f.qr("inv-1");
    await f.admin.mutation(api.fairImport.commit, { payload: payload({ x1 }) });
    const target = async () => f.t.run(async (ctx) => {
      const assignment = (await ctx.db.query("fairQrAssignments").unique())!;
      return { assignment, subject: (await ctx.db.get(assignment.accessSubjectId))!.currentTargetId };
    });
    const qrBefore = await target();
    vi.setSystemTime(NOW + 3_600_000);
    const upgraded = payload({ x1 });
    upgraded.participations[0].brands[0].models[0].packageTier = "advanced";
    const dry = await f.admin.query(api.fairImport.dryRun, { payload: upgraded });
    expect(dry.summary.upgrades).toBe(1);
    const result = await f.admin.mutation(api.fairImport.commit, { payload: upgraded });
    expect(result.results.upgrades).toBe(1);
    const rows = await f.t.run(async (ctx) => {
      const model = (await ctx.db.query("fairEventModels").withIndex("by_eventId_and_externalKey").collect()).find((m) => m.externalKey === "em26-volta-x1")!;
      return { model, activations: await ctx.db.query("fairPackageActivations").withIndex("by_eventModelId_and_activatedAt", (q) => q.eq("eventModelId", model._id)).collect() };
    });
    // Upgraded before the imported Starter start (9 Oct 09:00): Advanced starts
    // with it, so the history never reads as a downgrade.
    const opening = Date.parse("2026-10-09T09:00:00+02:00");
    expect(rows.model).toMatchObject({ packageTier: "advanced", packageActivatedAt: opening });
    expect(rows.activations.map((a) => [a.fromTier, a.toTier, a.activatedAt])).toEqual([
      ["included", "starter", opening],
      ["starter", "advanced", opening],
    ]);
    expect(await target()).toEqual(qrBefore);
  });
});
