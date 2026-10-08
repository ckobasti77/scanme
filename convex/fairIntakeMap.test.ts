/// <reference types="vite/client" />

// Sajam 2026 P2 — Aleksa's intake on the map and the stickers of the 15 real
// cars (SYNC-1008 §2.3, §2.4). The real intake payload (b1-payload.json)
// through convex/fairSetup.ts exactly as RUNBOOK-EVENT-SETUP §1 runs it, plus
// the organizer's site list (lib/fair-import/izlagaci-2026.ts):
//  - JMEV/CUBI on 9, Grand Motors (Mazda, Chery) and AUTO MIG (Foton) share 6,
//    Ferum/Yudo on 1A, BENTU on 1B; the site list makes no second record of
//    those brands, in either order (site list before or after the intake);
//  - „Poveži nalepnicu“ offers the 15 cars by exhibitor and stand, and the
//    printed SA26-001 … SA26-015 link in every typed form.
// The intake and the site list are real data; the stickers are a TEST
// provisioning of the printed series (no real code, no real scan).

import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id, TableNames } from "./_generated/dataModel";
import schema from "./schema";
import type { FairImportPayload } from "./fairImport";
import { validateMapLocationIds } from "./lib/fairCatalog";
import { buildCatalogView } from "../components/admin/events/event-catalog";
import { exhibitorCars, linkExhibitors } from "../lib/admin-v1/qr-link";
import { ELEKTROMOBILNOST_2026_EXHIBITORS } from "../lib/fair-import/izlagaci-2026";
import payloadJson from "../docs/events/sajam-automobila-2026/intake/elektromobilnost-2026-2026-10-07/b1-payload.json";
import slugsJson from "../docs/events/sajam-automobila-2026/intake/elektromobilnost-2026-2026-10-07/model-slugs.json";

vi.mock("server-only", () => ({}));

const modules = import.meta.glob("./**/*.ts");
// 8. 10.: Aleksa sets up the event and puts the stickers on the cars.
const NOW = Date.parse("2026-10-08T10:00:00+02:00");
const ADMIN_EMAIL = "fair-p2-intake@scanme.test";
const ISSUER = "https://fair-p2.test";
const EVENT = "elektromobilnost-2026";
const LIST = "elektromobilnost-2026" as const;
const payload = payloadJson as FairImportPayload;

// The six site brands that are intake exhibitors, and the intake participation each one is.
const COVERED: Record<string, string> = {
  jmev: "elektromobilnost-2026-jmev",
  mazda: "elektromobilnost-2026-grand-motors",
  chery: "elektromobilnost-2026-grand-motors",
  foton: "elektromobilnost-2026-auto-mig",
  "ferum-yudo": "elektromobilnost-2026-ferum",
  bentu: "elektromobilnost-2026-bentu",
};
const SITE_NAMES_OF_COVERED = ["JMEV", "Mazda", "Chery", "Foton", "Ferum Yudo", "Bentu"];

beforeEach(() => {
  process.env.SCANME_ADMIN_EMAILS = ADMIN_EMAIL;
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

async function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  const adminId = await t.run((ctx) => ctx.db.insert("users", { email: ADMIN_EMAIL }));
  return { t, admin: t.withIdentity({ subject: adminId, issuer: ISSUER }) };
}
type Fixture = Awaited<ReturnType<typeof setup>>;

/** RUNBOOK-EVENT-SETUP §1, steps 1–4 (DEV/test: no --prod). */
async function runbook(f: Fixture, steps: { bootstrap?: boolean } = { bootstrap: true }) {
  if (steps.bootstrap) await f.t.mutation(internal.fairSetup.bootstrapEvent, { actorEmail: ADMIN_EMAIL });
  const dry = await f.t.query(internal.fairSetup.importDryRun, { payload });
  expect(dry.ok).toBe(true);
  await f.t.mutation(internal.fairSetup.importCommit, { payload, actorEmail: ADMIN_EMAIL });
  const published = await f.t.mutation(internal.fairSetup.publishEventModels, { eventCode: EVENT, actorEmail: ADMIN_EMAIL });
  expect(published.published).toHaveLength(15);
}

const site = {
  import: (f: Fixture) => f.t.mutation(internal.fairExhibitorImport.importSiteExhibitors, { ownerEmail: ADMIN_EMAIL, eventCode: EVENT, list: LIST }),
  place: (f: Fixture) => f.t.mutation(internal.fairExhibitorImport.placeSiteExhibitors, { ownerEmail: ADMIN_EMAIL, eventCode: EVENT, list: LIST }),
  reconcile: (f: Fixture, dryRun?: boolean) =>
    f.t.mutation(internal.fairExhibitorImport.reconcileSiteExhibitorsWithIntake, { ownerEmail: ADMIN_EMAIL, eventCode: EVENT, list: LIST, ...(dryRun === undefined ? {} : { dryRun }) }),
};

const TABLES: TableNames[] = ["fairParticipations", "fairStands", "fairEventModels", "accounts", "businesses", "brands", "adminAuditLog"];
async function snapshot(f: Fixture) {
  return f.t.run(async (ctx) => JSON.stringify(await Promise.all(TABLES.map((table) => ctx.db.query(table).collect()))));
}

async function eventMap(f: Fixture) {
  const map = (await f.t.query(api.fairPublic.getEventMap, { eventSlug: EVENT }))!;
  const at = (mapLocationId: string) => map.stands.filter((row) => row.mapLocationId === mapLocationId).map((row) => row.exhibitorName).sort((a, b) => a.localeCompare(b, "sr"));
  return { map, at };
}

/** The intake as the RUNBOOK lays it out: JMEV/CUBI 9, Grand Motors + AUTO MIG share 6, Ferum/Yudo 1A, BENTU 1B. */
async function expectIntakeOnMap(f: Fixture) {
  const { map, at } = await eventMap(f);
  expect(at("hala-9")).toEqual(["CUBI d.o.o."]);
  expect(at("hala-6")).toEqual(["AUTO MIG d.o.o. Niš", "Grand Motors d.o.o."]);
  // Ferum BAW is a site exhibitor of its own on 1A (another brand); Ferum d.o.o. is Yudo.
  expect(at("hala-1a")).toEqual(["Ferum BAW", "Ferum d.o.o."]);
  expect(at("hala-1b")).toEqual(["BENTU MOTORS D.O.O"]);
  // No second record of the six brands, anywhere on the map or in the list.
  const names = [...map.stands.map((row) => row.exhibitorName), ...map.exhibitorsWithoutLocation.map((row) => row.exhibitorName)];
  for (const name of SITE_NAMES_OF_COVERED) expect({ name, onMap: names.includes(name) }).toEqual({ name, onMap: false });
  // Stand 6 shows both exhibitors with their own brands and cars (O4).
  const brandsOn6 = map.stands
    .filter((row) => row.mapLocationId === "hala-6")
    .map((row) => [row.exhibitorName, row.brands.map((brand) => `${brand.brandName} ${brand.models.length}`).sort()])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0]), "sr"));
  expect(brandsOn6).toEqual([["AUTO MIG d.o.o. Niš", ["Foton 4"]], ["Grand Motors d.o.o.", ["Chery 3", "Mazda 3"]]]);
  // All 15 published cars are on the map, under their unchanged slugs.
  const slugs = map.stands.flatMap((row) => row.brands.flatMap((brand) => brand.models.map((model) => model.slug))).sort();
  expect(slugs).toEqual(slugsJson.models.map((row) => row.slug).sort());
  // 38 organizer exhibitors − 6 covered + 5 intake = 37; Markus Pro has no place yet.
  expect(new Set([...map.stands.map((row) => row.participationId), ...map.exhibitorsWithoutLocation.map((row) => row.participationId)]).size).toBe(37);
  expect(map.exhibitorsWithoutLocation.map((row) => row.exhibitorName)).toEqual(["Auto servis Markus Pro"]);
  return map;
}

describe("P2 — the intake on the map, without duplicates of the site list", () => {
  test("the site list knows which intake participation each of the six brands is, on the same stand location", () => {
    const covered = Object.fromEntries(ELEKTROMOBILNOST_2026_EXHIBITORS.filter((row) => row.intakeParticipationKey).map((row) => [row.key, row.intakeParticipationKey]));
    expect(covered).toEqual(COVERED);
    for (const [key, intakeKey] of Object.entries(COVERED)) {
      const siteRow = ELEKTROMOBILNOST_2026_EXHIBITORS.find((row) => row.key === key)!;
      const intake = payload.participations.find((row) => row.externalKey === intakeKey)!;
      const intakeLocations = [...new Set(intake.brands.map((brand) => brand.stand.mapLocationId))];
      expect({ key, locations: siteRow.locations }).toEqual({ key, locations: intakeLocations });
    }
  });

  test("RUNBOOK first, then the site list: the six brands are skipped, the reconciliation only fills; map 9 / 6 (two) / 1A / 1B; idempotent", async () => {
    const f = await setup();
    await runbook(f);
    const imported = await site.import(f);
    expect(imported.covered.map((row) => row.key).sort()).toEqual(Object.keys(COVERED).sort());
    expect(imported.participations.created).toBe(32);
    const placed = await site.place(f);
    expect(placed.skipped.filter((row) => row.reason === "covered_by_intake").map((row) => row.key).sort()).toEqual(Object.keys(COVERED).sort());
    expect(placed.skipped.filter((row) => row.reason !== "covered_by_intake")).toEqual([{ key: "markus-pro", reason: "no_map_location" }]);
    expect(placed.stands.created).toBe(33);

    // Dry run first: what a real run does, nothing written.
    const before = await snapshot(f);
    const dry = await site.reconcile(f);
    expect(dry.dryRun).toBe(true);
    expect(await snapshot(f)).toBe(before);
    expect(dry.rows.map((row) => [row.key, row.site, row.fill])).toEqual([
      ["ferum-yudo", "absent", ["category", "logo", "website"]],
      ["bentu", "absent", ["category", "logo", "website"]],
      ["foton", "absent", ["category", "logo", "website"]],
      // Grand Motors stands for two site brands: the category only, never one brand's logo.
      ["mazda", "absent", ["category"]],
      ["chery", "absent", []],
      ["jmev", "absent", ["category", "logo", "website"]],
    ]);
    expect(dry.rows.find((row) => row.key === "jmev")!.intake).toEqual({ exhibitorName: "CUBI d.o.o.", status: "active", stands: [{ code: "9", mapLocationId: "hala-9", status: "active" }] });
    expect(dry.summary).toEqual({ siteParticipationsWithdrawn: 0, siteStandsWithdrawn: 0, intakeFilled: 5 });

    const real = await site.reconcile(f, false);
    expect(real.rows).toEqual(dry.rows);
    expect(real.summary).toEqual(dry.summary);
    const map = await expectIntakeOnMap(f);
    const cubi = map.stands.find((row) => row.exhibitorName === "CUBI d.o.o.")!;
    expect(cubi).toMatchObject({ category: "automobili", logoUrl: "/fair/izlagaci/2026/jmev.jpg", websiteUrl: "https://www.jmev.rs/" });
    const grand = map.stands.find((row) => row.exhibitorName === "Grand Motors d.o.o.")!;
    expect(grand.category).toBe("automobili");
    expect(grand.logoUrl).toBeUndefined();
    expect(grand.websiteUrl).toBeUndefined();

    // Aleksa's records keep their names and keys; nothing of hers is duplicated.
    const intake = await f.t.run(async (ctx) => {
      const event = (await ctx.db.query("fairEvents").withIndex("by_code", (q) => q.eq("code", EVENT)).unique())!;
      const rows = await ctx.db.query("fairParticipations").withIndex("by_eventId_and_externalKey", (q) => q.eq("eventId", event._id)).collect();
      return rows.filter((row) => row.externalKey.startsWith("elektromobilnost-2026-")).map((row) => row.externalKey).sort();
    });
    expect(intake).toEqual([...new Set(Object.values(COVERED))].sort());

    // Again: nothing to do, nothing written; the site list brings nothing back.
    const settled = await snapshot(f);
    expect((await site.reconcile(f, false)).summary).toEqual({ siteParticipationsWithdrawn: 0, siteStandsWithdrawn: 0, intakeFilled: 0 });
    expect((await site.import(f)).participations).toEqual({ created: 0, updated: 0, unchanged: 32 });
    expect((await site.place(f)).stands).toEqual({ created: 0, updated: 0, unchanged: 33 });
    expect(await snapshot(f)).toBe(settled);
  });

  test("the site list BEFORE the intake: the reconciliation withdraws the six duplicates (dry run first); nothing comes back", async () => {
    const f = await setup();
    await f.t.mutation(internal.fairSetup.bootstrapEvent, { actorEmail: ADMIN_EMAIL });
    expect((await site.import(f)).covered).toEqual([]);
    expect((await site.place(f)).stands.created).toBe(39);
    await runbook(f, {});
    // The duplicates as they are before the reconciliation: Foton, Mazda and Chery next to AUTO MIG and Grand Motors.
    expect((await eventMap(f)).at("hala-6")).toEqual(["AUTO MIG d.o.o. Niš", "Chery", "Foton", "Grand Motors d.o.o.", "Mazda"]);

    const before = await snapshot(f);
    const dry = await site.reconcile(f, true);
    expect(await snapshot(f)).toBe(before);
    expect(dry.rows.map((row) => [row.key, row.site, row.siteStands])).toEqual([
      ["ferum-yudo", "withdraw", 1], ["bentu", "withdraw", 1], ["foton", "withdraw", 1], ["mazda", "withdraw", 1], ["chery", "withdraw", 1], ["jmev", "withdraw", 1],
    ]);
    expect(dry.summary).toEqual({ siteParticipationsWithdrawn: 6, siteStandsWithdrawn: 6, intakeFilled: 5 });

    const real = await site.reconcile(f, false);
    expect(real.summary).toEqual(dry.summary);
    await expectIntakeOnMap(f);
    const withdrawn = await f.t.run(async (ctx) => {
      const event = (await ctx.db.query("fairEvents").withIndex("by_code", (q) => q.eq("code", EVENT)).unique())!;
      const out: string[] = [];
      for (const key of Object.keys(COVERED)) {
        const participation = (await ctx.db.query("fairParticipations").withIndex("by_eventId_and_externalKey", (q) => q.eq("eventId", event._id).eq("externalKey", `izl26-${key}`)).unique())!;
        const stands = await ctx.db.query("fairStands").withIndex("by_eventId_and_participationId", (q) => q.eq("eventId", event._id).eq("participationId", participation._id)).collect();
        out.push(`${key}:${participation.status}:${stands.map((stand) => stand.status).join(",")}`);
      }
      return out;
    });
    expect(withdrawn).toEqual(Object.keys(COVERED).map((key) => `${key}:withdrawn:withdrawn`));
    const audit = await f.t.run(async (ctx) => (await ctx.db.query("adminAuditLog").collect()).filter((row) => row.action === "fair_site_exhibitors_reconciled"));
    expect(audit).toHaveLength(1);

    // Re-running everything changes nothing and never revives a withdrawn duplicate.
    const settled = await snapshot(f);
    expect((await site.reconcile(f, false)).rows.map((row) => row.site)).toEqual(Array(6).fill("withdrawn"));
    expect((await site.import(f)).covered).toHaveLength(6);
    expect((await site.place(f)).stands.created).toBe(0);
    expect(await snapshot(f)).toBe(settled);
  });

  test("a site record that holds a car is kept for a person to decide (has_models); a non-admin and an unknown event are refused", async () => {
    const f = await setup();
    await f.t.mutation(internal.fairSetup.bootstrapEvent, { actorEmail: ADMIN_EMAIL });
    await site.import(f);
    await site.place(f);
    await runbook(f, {});
    // A car was put on the site record of Foton by hand.
    await f.t.run(async (ctx) => {
      const event = (await ctx.db.query("fairEvents").withIndex("by_code", (q) => q.eq("code", EVENT)).unique())!;
      const participation = (await ctx.db.query("fairParticipations").withIndex("by_eventId_and_externalKey", (q) => q.eq("eventId", event._id).eq("externalKey", "izl26-foton")).unique())!;
      const stand = (await ctx.db.query("fairStands").withIndex("by_eventId_and_participationId", (q) => q.eq("eventId", event._id).eq("participationId", participation._id)).first())!;
      const brandId = (await ctx.db.query("brands").collect())[0]._id;
      await ctx.db.insert("fairEventModels", {
        eventId: event._id, participationId: participation._id, standId: stand._id, brandId, externalKey: "test-p2-rucni-model", slug: "test-p2-rucni-model",
        displayName: "TEST ručni model", priceText: "TEST", specifications: [], packageTier: "included", packageActivatedAt: NOW, passportEligible: false,
        status: "draft", sortOrder: 1, createdAt: NOW, updatedAt: NOW,
      });
    });
    const real = await site.reconcile(f, false);
    expect(real.rows.find((row) => row.key === "foton")).toMatchObject({ site: "has_models", siteStands: 0 });
    expect(real.summary.siteParticipationsWithdrawn).toBe(5);
    expect((await eventMap(f)).at("hala-6")).toEqual(["AUTO MIG d.o.o. Niš", "Foton", "Grand Motors d.o.o."]);

    await expect(f.t.mutation(internal.fairExhibitorImport.reconcileSiteExhibitorsWithIntake, { ownerEmail: "neko@example.invalid", eventCode: EVENT, list: LIST }))
      .rejects.toThrow("fair_exhibitor_import_admin_missing");
    await expect(f.t.mutation(internal.fairExhibitorImport.reconcileSiteExhibitorsWithIntake, { ownerEmail: ADMIN_EMAIL, eventCode: "nepostojeci", list: LIST }))
      .rejects.toThrow("fair_exhibitor_import_event_missing");
  });

  test("every intake stand passes validateMapLocationIds: no error, only the O4 shared-location warnings", async () => {
    const f = await setup();
    await runbook(f);
    await site.import(f);
    await site.place(f);
    await site.reconcile(f, false);
    const issues = await f.t.run(async (ctx) => {
      const event = (await ctx.db.query("fairEvents").withIndex("by_code", (q) => q.eq("code", EVENT)).unique())!;
      const stands = (await ctx.db.query("fairStands").withIndex("by_eventId_and_externalKey", (q) => q.eq("eventId", event._id)).collect())
        .filter((stand) => stand.externalKey.startsWith("elektromobilnost-2026-"));
      expect(stands.map((stand) => `${stand.code}:${stand.mapLocationId}`).sort()).toEqual(["1A:hala-1a", "1B:hala-1b", "6:hala-6", "6:hala-6", "9:hala-9"]);
      return validateMapLocationIds(ctx, event._id, stands.map((stand) => ({ standKey: stand.externalKey, participationId: stand.participationId, mapLocationId: stand.mapLocationId, path: stand.externalKey })));
    });
    expect(issues.filter((issue) => issue.severity === "error")).toEqual([]);
    expect([...new Set(issues.map((issue) => `${issue.code}:${issue.details?.mapLocationId}`))].sort()).toEqual(["FAIR_MAP_LOCATION_TAKEN:hala-1a", "FAIR_MAP_LOCATION_TAKEN:hala-6"]);
    const admin = await f.admin.query(api.fairAdmin.listValidationIssues, { eventId: (await f.t.run(async (ctx) => (await ctx.db.query("fairEvents").withIndex("by_code", (q) => q.eq("code", EVENT)).unique())!._id)) });
    expect(admin.flatMap((row) => row.issues).filter((issue) => issue.severity === "error")).toEqual([]);
  });
});

describe("P2 — „Poveži nalepnicu“ with the 15 real cars", () => {
  test("offers the five exhibitors in stand order (two on stand 6) with all 15 cars; SA26-001 … SA26-015 link in every typed form and lead to their car", async () => {
    const f = await setup();
    await runbook(f);
    await site.import(f);
    await site.place(f);
    await site.reconcile(f, false);
    // The printed series, TEST provisioning of its first 15 stickers; the event uses it.
    await f.t.mutation(internal.fairPrintInventory.provisionBatch, { ownerEmail: ADMIN_EMAIL, startOrdinal: 1, count: 15 });
    await f.t.mutation(internal.fairExhibitorImport.linkEventQrInventory, { ownerEmail: ADMIN_EMAIL, eventCode: EVENT, inventorySmlCode: "SML-SAJAM-26-QR" });
    const eventId = await f.t.run(async (ctx) => (await ctx.db.query("fairEvents").withIndex("by_code", (q) => q.eq("code", EVENT)).unique())!._id);

    const read = async () => buildCatalogView(
      await f.admin.query(api.fairAdmin.getEventCatalog, { eventId }),
      await f.admin.query(api.fairAdmin.getEventDirectory, { eventId }),
      undefined,
      await f.admin.query(api.fairAdminStats.getModelQrCodes, { eventId }),
    );
    const catalog = await read();
    expect(catalog.qrConfigured).toBe(true);
    const exhibitors = linkExhibitors(catalog.participations, catalog.stands, catalog.models);
    expect(exhibitors.map((row) => [row.name, row.stands, row.brands, row.cars])).toEqual([
      ["Ferum d.o.o.", ["1A"], ["Yudo"], 1],
      ["BENTU MOTORS D.O.O", ["1B"], ["BENTU"], 1],
      ["AUTO MIG d.o.o. Niš", ["6"], ["Foton"], 4],
      ["Grand Motors d.o.o.", ["6"], ["Chery", "Mazda"], 6],
      ["CUBI d.o.o.", ["9"], ["JMEV"], 3],
    ]);
    const cars = exhibitors.flatMap((row) => exhibitorCars(catalog.models, row.id));
    expect(cars).toHaveLength(15);
    expect(cars.every((car) => car.status === "published" && car.qrCode === null)).toBe(true);
    expect(cars.map((car) => car.slug).sort()).toEqual(slugsJson.models.map((row) => row.slug).sort());

    // On the floor: the number as anyone types it, one car after another.
    const forms = ["1", "СА26-2", "SA-26-3", "SA 26 4", "#5", "SA26/6", "sa26 7", "SA26-008", "са26 9", "SA26_010", "#11", "SA-26/12", "13", "СА26 14", "SA26–015"];
    for (const [index, car] of cars.entries()) {
      const label = `SA26-${String(index + 1).padStart(3, "0")}`;
      const result = await f.admin.mutation(api.fairAdminQr.linkSticker, { eventId, code: forms[index], eventModelId: car.id as Id<"fairEventModels">, expectedHolderModelId: null });
      expect({ form: forms[index], label: result.label, created: result.created, modelStatus: result.modelStatus }).toEqual({ form: forms[index], label, created: true, modelStatus: "published" });
      expect(await f.admin.query(api.fairAdmin.resolveTest, { eventId, resolverCode: label })).toMatchObject({ outcome: "fair_model", path: `/sajam/${EVENT}/model/${car.slug}` });
    }
    const after = await read();
    expect(after.models.filter((model) => model.qrLabel).map((model) => model.qrLabel).sort()).toEqual(Array.from({ length: 15 }, (_, i) => `SA26-${String(i + 1).padStart(3, "0")}`));
  });
});

describe("P2 (RN N6) — stands on a location that is not on today's map", () => {
  test("listed with exhibitor, old location, candidates and an unambiguous proposal; withdrawn and valid stands are not; nothing is written", async () => {
    const f = await setup();
    await runbook(f);
    await site.import(f);
    await site.place(f);
    // Stands as an older deployment placed them on the M0 drawing (before 7. 10.).
    const ids = await f.t.run(async (ctx) => {
      const event = (await ctx.db.query("fairEvents").withIndex("by_code", (q) => q.eq("code", EVENT)).unique())!;
      const participation = async (key: string) => (await ctx.db.query("fairParticipations").withIndex("by_eventId_and_externalKey", (q) => q.eq("eventId", event._id).eq("externalKey", key)).unique())!._id;
      const stand = (participationKey: string, externalKey: string, mapLocationId: string, status: "active" | "draft" | "withdrawn" = "active") => participation(participationKey).then((participationId) =>
        ctx.db.insert("fairStands", { eventId: event._id, participationId, externalKey, code: externalKey, displayName: `TEST ${externalKey}`, mapLocationId, status, createdAt: NOW, updatedAt: NOW }));
      return {
        venera: await stand("izl26-venera-bike", "test-p2-staro-20", "ispred-20"),
        aster: await stand("izl26-aster-marketing", "test-p2-staro-12", "ispred-12", "draft"),
        cubi: await stand("elektromobilnost-2026-jmev", "test-p2-staro-13", "ispred-13"),
        zepter: await stand("izl26-zepter", "test-p2-staro-s3", "ispred-s3"),
        gone: await stand("izl26-zepter", "test-p2-staro-s1", "ispred-s1", "withdrawn"),
      };
    });
    const before = await snapshot(f);
    const result = await f.t.query(internal.fairExhibitorImport.listStandsOffMap, { eventCode: EVENT });
    expect(await snapshot(f)).toBe(before);
    expect(result.capped).toBe(false);
    expect(result.checked).toBe(33 + 5 + 5);
    const rows = Object.fromEntries(result.offMap.map((row) => [row.standCode, [row.exhibitorName, row.status, row.mapLocationId, row.candidates, row.proposal, row.cars]]));
    expect(rows).toEqual({
      // 20/21/22 are one outline today: one candidate.
      "test-p2-staro-20": ["Venera Bike", "active", "ispred-20", ["ispred-20-22"], "ispred-20-22", 0],
      // Two boxes on 12; the organizer's list puts Aster Marketing in the first.
      "test-p2-staro-12": ["Aster Marketing", "draft", "ispred-12", ["ispred-12-1", "ispred-12-2"], "ispred-12-1", 0],
      // Four boxes on 13 and no list entry: a person chooses.
      "test-p2-staro-13": ["CUBI d.o.o.", "active", "ispred-13", ["ispred-13-1", "ispred-13-2", "ispred-13-3", "ispred-13-4"], null, 0],
      // S1–S5 are not on this fair's map at all.
      "test-p2-staro-s3": ["Zepter", "active", "ispred-s3", [], null, 0],
    });
    expect(result.offMap.map((row) => row.standId)).not.toContain(ids.gone);
    await expect(f.t.query(internal.fairExhibitorImport.listStandsOffMap, { eventCode: "nepostojeci" })).rejects.toThrow("fair_exhibitor_import_event_missing");
  });
});
