/// <reference types="vite/client" />

// ScanMe Menu V1 - K29: the analytics ingest and the three crons (rollup,
// scans, retention) of docs/menu/ANALITIKA-DEFINICIJE.md (section 2, 3 and 7).
// Proven here: what `menuAnalytics.ingest` accepts and stores (counts, public
// service only, clean fields, card ids, the per-IP bucket), the Belgrade day of
// the daily rows, that a rollup run sums an event exactly once (cursor, the
// 2 minute gap, batches of 500 that continue themselves), tenant isolation of
// the sums, the 30 minute session rule (boundary, midnight, steps, across runs,
// per venue), the move of finished-day scans from dailyCardMetrics, and every
// retention window (90 days raw, 24 hours sessions, 24 months daily rows).
//
// Time is frozen (fake timers) and moved with vi.setSystemTime. convex-test
// stamps _creationTime from Date.now() at insert (a second document in the same
// millisecond gets +0.001), so the fake clock at insert time IS the creation
// time the rollup cursor and the retention read. Raw events are mostly inserted
// directly so occurredAt / dayKey are exact (the rollup trusts the stored
// values). Fictional tenants only (the repo is public). The helpers are copied
// per file on purpose (a test file is not a module to import from).

import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import { sesijePouzdane, type Korak, type Uredjaj } from "../lib/menu/analitika/definicije";
import { danUBeogradu, satUBeogradu } from "../lib/menu/analitika/vreme";
import {
  SLUG_A,
  SLUG_B,
  addVenueToAccount,
  seedMenuWorld,
  seedQrLink,
  type MenuTenantSeed,
  type MenuWorldSeed,
} from "../lib/menu/testkit/seed";

const modules = import.meta.glob("./**/*.ts");

afterEach(() => {
  vi.useRealTimers();
});

const newTest = () => {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  return t;
};
type T = ReturnType<typeof newTest>;

// -----------------------------------------------------------------------------
// Fixtures
// -----------------------------------------------------------------------------

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Wednesday 2026-10-21 12:00 in Belgrade (CEST, UTC+2). */
const T0 = Date.UTC(2026, 9, 21, 10, 0, 0);
/** The base of the session tests: 11:00 in Belgrade, the same day as T0. */
const S = Date.UTC(2026, 9, 21, 9, 0, 0);
/** The Belgrade day of T0 and S. */
const TODAY = "2026-10-21";

const PAGE = "pg_5k2m9q0x7c1d";
const PAGE_2 = "pg_7q3n8d2f9a4b";
const ARTICLE = "ar_5k2m9q0x7c1d";
const ARTICLE_2 = "ar_3d8f2a9c4e7b";
const SES_1 = "abcdefgh23456789";
const SES_2 = "jkmnpqrs23456789";
const IP_A = "a".repeat(32);
const IP_B = "b".repeat(32);
const REFUSED = { ok: false, primljeno: 0 } as const;

// -----------------------------------------------------------------------------
// World
// -----------------------------------------------------------------------------

/** A published (publicly served) service: one live version row and the pointer to it. */
async function goLive(t: T, w: MenuWorldSeed, tenant: MenuTenantSeed) {
  await t.run(async (ctx) => {
    const versionId = await ctx.db.insert("menuVersions", {
      menuServiceId: tenant.menuServiceId,
      number: 1,
      publishedAt: Date.now(),
      publishedByUserId: w.adminId,
      actorKind: "admin",
      draftRevision: 0,
      summary: {
        changedPrices: 0,
        newArticles: 0,
        removedArticles: 0,
        structural: { hidden: 0, removedFromPage: 0, deleted: 0, reordered: 0 },
      },
      languages: ["sr"],
      pageCount: 1,
      articleCount: 0,
      bytes: 0,
      partCount: 0,
      formatVersion: 1,
      contentHash: "fixture",
    });
    await ctx.db.patch(tenant.menuServiceId, { liveVersionId: versionId, liveVersionNumber: 1 });
  });
}

/** Both venues seeded at `startMs` on a frozen clock; A is published, B too unless `liveB` is false. */
async function world(startMs: number, options: { liveB?: boolean } = {}) {
  vi.useFakeTimers();
  vi.setSystemTime(startMs);
  const t = newTest();
  const w: MenuWorldSeed = await t.run(async (ctx) => await seedMenuWorld(ctx));
  await goLive(t, w, w.a);
  if (options.liveB ?? true) await goLive(t, w, w.b);
  return { t, w };
}

const advance = (ms: number) => vi.setSystemTime(Date.now() + ms);
const settle = async (t: T) => {
  await t.finishAllScheduledFunctions(vi.runAllTimers);
};

// -----------------------------------------------------------------------------
// Ingest
// -----------------------------------------------------------------------------

type Incoming = {
  vrsta: string;
  stranica?: string;
  artikal?: string;
  kartica?: string;
  jezik?: string;
  korak?: string;
  sesija?: string;
};

async function ingest(
  t: T,
  dogadjaji: Incoming[],
  over: { slug?: string; ipHash?: string; uredjaj?: Uredjaj } = {},
) {
  return await t.mutation(api.menuAnalytics.ingest, {
    slug: over.slug ?? SLUG_A,
    ipHash: over.ipHash ?? IP_A,
    uredjaj: over.uredjaj ?? "telefon",
    dogadjaji,
  });
}

const openPage: Incoming = { vrsta: "stranica", stranica: PAGE };
const times = <V,>(n: number, value: V): V[] => Array.from({ length: n }, () => value);

// -----------------------------------------------------------------------------
// Raw events inserted directly
// -----------------------------------------------------------------------------

type RawEvent = Omit<
  Doc<"menuAnalyticsEvents">,
  "_id" | "_creationTime" | "menuServiceId" | "occurredAt" | "dayKey" | "sat"
> & { at: number };

async function addEvents(t: T, menuServiceId: Id<"menuServices">, events: RawEvent[]) {
  await t.run(async (ctx) => {
    for (const { at, ...fields } of events) {
      await ctx.db.insert("menuAnalyticsEvents", {
        ...fields,
        menuServiceId,
        occurredAt: at,
        dayKey: danUBeogradu(at),
        sat: satUBeogradu(at),
      });
    }
  });
}

const opening = (at: number, sesija?: string): RawEvent => ({
  at,
  vrsta: "stranica",
  stranica: PAGE,
  ...(sesija ? { sesija } : {}),
});
const detail = (at: number, sesija?: string, artikal = ARTICLE): RawEvent => ({
  at,
  vrsta: "detalj",
  stranica: PAGE,
  artikal,
  ...(sesija ? { sesija } : {}),
});
const step = (at: number, korak: Korak, sesija: string): RawEvent => ({ at, vrsta: "korak", korak, sesija });

// -----------------------------------------------------------------------------
// Reading
// -----------------------------------------------------------------------------

const plain = (row: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(row).filter(([key]) => key !== "_id" && key !== "_creationTime"));

async function allEvents(t: T) {
  return await t.run(async (ctx) => await ctx.db.query("menuAnalyticsEvents").collect());
}

async function totalsOf(t: T, menuServiceId: Id<"menuServices">, dayKey: string): Promise<Record<string, number>> {
  const row = await t.run(async (ctx) =>
    ctx.db
      .query("menuAnalyticsDaily")
      .withIndex("by_menuServiceId_and_dayKey", (q) => q.eq("menuServiceId", menuServiceId).eq("dayKey", dayKey))
      .unique(),
  );
  return row?.brojevi ?? {};
}

async function dimsOf(t: T, menuServiceId: Id<"menuServices">, dayKey: string): Promise<Doc<"menuAnalyticsDailyDims">["po"]> {
  const row = await t.run(async (ctx) =>
    ctx.db
      .query("menuAnalyticsDailyDims")
      .withIndex("by_menuServiceId_and_dayKey", (q) => q.eq("menuServiceId", menuServiceId).eq("dayKey", dayKey))
      .unique(),
  );
  return row?.po ?? {};
}

async function dailyDays(t: T, menuServiceId: Id<"menuServices">): Promise<string[]> {
  const rows = await t.run(async (ctx) => await ctx.db.query("menuAnalyticsDaily").collect());
  return rows
    .filter((row) => row.menuServiceId === menuServiceId)
    .map((row) => row.dayKey)
    .sort();
}

async function dimsDays(t: T, menuServiceId: Id<"menuServices">): Promise<string[]> {
  const rows = await t.run(async (ctx) => await ctx.db.query("menuAnalyticsDailyDims").collect());
  return rows
    .filter((row) => row.menuServiceId === menuServiceId)
    .map((row) => row.dayKey)
    .sort();
}

async function cursorOf(t: T, kljuc: "dogadjaji" | "skenovi") {
  return await t.run(async (ctx) =>
    ctx.db
      .query("menuAnalyticsCursors")
      .withIndex("by_kljuc", (q) => q.eq("kljuc", kljuc))
      .first(),
  );
}

async function sessionRows(t: T) {
  const rows = await t.run(async (ctx) => await ctx.db.query("menuAnalyticsSessions").collect());
  return rows.sort((a, b) => a.sesija.localeCompare(b.sesija) || a.pocetak - b.pocetak);
}

async function pendingJobs(t: T) {
  return await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
}

// -----------------------------------------------------------------------------
// The crons
// -----------------------------------------------------------------------------

/** Moves the clock 3 minutes on (past the 2 minute gap), then runs one rollup transaction. */
async function zbir(t: T) {
  advance(3 * MINUTE);
  return await t.mutation(internal.menuAnalyticsRollup.zbir, {});
}

async function skenovi(t: T) {
  return await t.mutation(internal.menuAnalyticsRollup.skenovi, {});
}

async function retencija(t: T) {
  return await t.mutation(internal.menuAnalyticsRollup.retencija, {});
}

// =============================================================================
// [prijem] the ingest
// =============================================================================

describe("[prijem] ingest", () => {
  test("[prijem] 0 or 11 events are refused and store nothing, 1 to 10 are taken", async () => {
    const { t } = await world(T0);

    expect(await ingest(t, [])).toEqual(REFUSED);
    expect(await ingest(t, times(11, openPage))).toEqual(REFUSED);
    expect(await allEvents(t)).toEqual([]);

    expect(await ingest(t, times(10, openPage))).toEqual({ ok: true, primljeno: 10 });
    expect(await ingest(t, [openPage])).toEqual({ ok: true, primljeno: 1 });
    expect(await allEvents(t)).toHaveLength(11);
  });

  test("[prijem] an unknown slug, an inactive venue and a service that is not public store nothing", async () => {
    const { t, w } = await world(T0, { liveB: false });

    // Control: A is published and takes the event.
    expect(await ingest(t, [openPage])).toEqual({ ok: true, primljeno: 1 });

    expect(await ingest(t, [openPage], { slug: "nema-takvog-lokala" })).toEqual(REFUSED);
    // B has a Menu service but never went live.
    expect(await ingest(t, [openPage], { slug: SLUG_B })).toEqual(REFUSED);

    // A venue that is switched off stops taking events ...
    await t.run(async (ctx) => await ctx.db.patch(w.a.businessId, { status: "inactive" }));
    expect(await ingest(t, [openPage])).toEqual(REFUSED);
    await t.run(async (ctx) => await ctx.db.patch(w.a.businessId, { status: "active" }));
    expect(await ingest(t, [openPage])).toEqual({ ok: true, primljeno: 1 });

    // ... and so does a venue whose Menu service profile is not active.
    await t.run(async (ctx) => await ctx.db.patch(w.a.serviceProfileId, { status: "inactive" }));
    expect(await ingest(t, [openPage])).toEqual(REFUSED);

    // Nothing but the two accepted events was ever stored, all on A's service.
    const rows = await allEvents(t);
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.menuServiceId === w.a.menuServiceId)).toBe(true);
  });

  test("[prijem] a valid batch stores one clean row per good event, from server time, and nothing for dropped data", async () => {
    const { t, w } = await world(T0);

    const first = await ingest(
      t,
      [
        { vrsta: "stranica", stranica: PAGE, jezik: "sr", sesija: SES_1 },
        { vrsta: "detalj", stranica: PAGE, artikal: ARTICLE, jezik: "en" },
        { vrsta: "stranica", stranica: "_rs" },
        // The event is kept, its three broken optional fields are dropped.
        { vrsta: "stranica", stranica: PAGE, jezik: "SRB", sesija: "short", kartica: "not-a-card-id" },
        { vrsta: "korak", korak: "porudzbina", sesija: SES_1 },
        // Dropped whole: a broken or missing required field, or a step without a session.
        { vrsta: "stranica", stranica: "pg_BAD" },
        { vrsta: "stranica" },
        { vrsta: "detalj", stranica: PAGE },
        { vrsta: "detalj", stranica: PAGE, artikal: PAGE },
        { vrsta: "korak", korak: "porudzbina" },
      ],
      { uredjaj: "tablet" },
    );
    expect(first).toEqual({ ok: true, primljeno: 5 });

    const second = await ingest(
      t,
      [
        { vrsta: "korak", korak: "plati", sesija: SES_1 },
        { vrsta: "zahtev_poslat" },
        { vrsta: "korak", korak: "zahtev", sesija: "ABCDEFGH23456789" },
      ],
      { uredjaj: "tablet" },
    );
    expect(second).toMatchObject({ ok: true, primljeno: 0 });

    // Server time: 2026-10-21T10:00Z is 12:00 in Belgrade.
    const stamp = { menuServiceId: w.a.menuServiceId, uredjaj: "tablet", occurredAt: T0, dayKey: "2026-10-21", sat: 12 };
    const rows = await allEvents(t);
    expect(rows.map(plain)).toEqual([
      { ...stamp, vrsta: "stranica", stranica: PAGE, jezik: "sr", sesija: SES_1 },
      { ...stamp, vrsta: "detalj", stranica: PAGE, artikal: ARTICLE, jezik: "en" },
      { ...stamp, vrsta: "stranica", stranica: "room_service" },
      { ...stamp, vrsta: "stranica", stranica: PAGE },
      { ...stamp, vrsta: "korak", korak: "porudzbina", sesija: SES_1 },
    ]);
    // Nothing about the caller is stored.
    expect(JSON.stringify(rows)).not.toContain(IP_A);
  });

  test("[prijem] a kartica that is not a cards id is dropped, a real card id is kept", async () => {
    const { t, w } = await world(T0);
    const { cardId } = await t.run(
      async (ctx) =>
        await seedQrLink(ctx, {
          menuServiceId: w.a.menuServiceId,
          businessId: w.a.businessId,
          pageKey: PAGE,
          createdByUserId: w.adminId,
          targetKind: "menu",
        }),
    );

    const result = await ingest(t, [
      { vrsta: "stranica", stranica: PAGE, kartica: cardId },
      // Well-shaped, but the id of a business, not of a card.
      { vrsta: "stranica", stranica: PAGE, kartica: w.a.businessId },
      // Not even shaped like an id.
      { vrsta: "stranica", stranica: PAGE, kartica: "not-a-card-id" },
    ]);
    expect(result).toEqual({ ok: true, primljeno: 3 });

    const rows = await allEvents(t);
    expect(rows).toHaveLength(3);
    expect(rows[0].kartica).toBe(cardId);
    expect(rows[1]).not.toHaveProperty("kartica");
    expect(rows[2]).not.toHaveProperty("kartica");
  });

  test("[prijem] the bucket takes 300 events per IP hash and a minute, the next call is refused", async () => {
    const { t } = await world(T0);
    const ten = times(10, openPage);

    for (let call = 0; call < 30; call += 1) {
      expect(await ingest(t, ten, { ipHash: IP_A })).toEqual({ ok: true, primljeno: 10 });
    }
    expect(await allEvents(t)).toHaveLength(300);

    expect(await ingest(t, ten, { ipHash: IP_A })).toEqual(REFUSED);
    expect(await ingest(t, [openPage], { ipHash: IP_A })).toEqual(REFUSED);
    expect(await allEvents(t)).toHaveLength(300);

    // Another address has its own bucket.
    expect(await ingest(t, ten, { ipHash: IP_B })).toEqual({ ok: true, primljeno: 10 });
    expect(await allEvents(t)).toHaveLength(310);

    // A minute later the first address is taken again.
    advance(MINUTE);
    expect(await ingest(t, ten, { ipHash: IP_A })).toEqual({ ok: true, primljeno: 10 });
    expect(await allEvents(t)).toHaveLength(320);
  });
});

// =============================================================================
// [zbir] the rollup
// =============================================================================

describe("[zbir] rollup", () => {
  test("[zbir] [dan-beograd] events are summed into the Belgrade day of their arrival on the server", async () => {
    // 2026-10-20 is summer time: Belgrade is UTC+2, so 21:59Z is 23:59 and 22:01Z is 00:01 the next day.
    const { t, w } = await world(Date.UTC(2026, 9, 20, 21, 0, 0));
    const a = w.a.menuServiceId;
    const { cardId } = await t.run(
      async (ctx) =>
        await seedQrLink(ctx, {
          menuServiceId: a,
          businessId: w.a.businessId,
          pageKey: PAGE,
          createdByUserId: w.adminId,
          targetKind: "menu",
        }),
    );
    const open = (jezik: string): Incoming => ({ vrsta: "stranica", stranica: PAGE, kartica: cardId, jezik });

    vi.setSystemTime(Date.UTC(2026, 9, 20, 21, 59, 0));
    expect(await ingest(t, [open("sr")], { uredjaj: "telefon" })).toEqual({ ok: true, primljeno: 1 });
    vi.setSystemTime(Date.UTC(2026, 9, 20, 22, 1, 0));
    expect(await ingest(t, [open("en")], { uredjaj: "racunar" })).toEqual({ ok: true, primljeno: 1 });

    expect(await zbir(t)).toEqual({ obradjeno: 2, jos: false });

    expect(await totalsOf(t, a, "2026-10-20")).toEqual({ otvaranja: 1 });
    expect(await totalsOf(t, a, "2026-10-21")).toEqual({ otvaranja: 1 });
    expect(await dimsOf(t, a, "2026-10-20")).toEqual({
      otvaranja: {
        stranica: { [PAGE]: 1 },
        kartica: { [cardId]: 1 },
        jezik: { sr: 1 },
        uredjaj: { telefon: 1 },
        sat: { "23": 1 },
      },
    });
    expect(await dimsOf(t, a, "2026-10-21")).toEqual({
      otvaranja: {
        stranica: { [PAGE]: 1 },
        kartica: { [cardId]: 1 },
        jezik: { en: 1 },
        uredjaj: { racunar: 1 },
        sat: { "0": 1 },
      },
    });
    expect(await dailyDays(t, a)).toEqual(["2026-10-20", "2026-10-21"]);
  });

  test("[zbir] [dan-beograd] in winter time the Belgrade midnight is 23:00Z", async () => {
    // 2026-11-10 is winter time: Belgrade is UTC+1, so 22:30Z is 23:30 and 23:30Z is 00:30 the next day.
    const { t, w } = await world(Date.UTC(2026, 10, 10, 20, 0, 0));
    const a = w.a.menuServiceId;

    vi.setSystemTime(Date.UTC(2026, 10, 10, 22, 30, 0));
    await ingest(t, [openPage]);
    vi.setSystemTime(Date.UTC(2026, 10, 10, 23, 30, 0));
    await ingest(t, [openPage]);

    const rows = await allEvents(t);
    expect(rows.map((row) => [row.dayKey, row.sat])).toEqual([
      ["2026-11-10", 23],
      ["2026-11-11", 0],
    ]);

    await zbir(t);
    expect(await totalsOf(t, a, "2026-11-10")).toEqual({ otvaranja: 1 });
    expect(await totalsOf(t, a, "2026-11-11")).toEqual({ otvaranja: 1 });
    expect((await dimsOf(t, a, "2026-11-10")).otvaranja.sat).toEqual({ "23": 1 });
    expect((await dimsOf(t, a, "2026-11-11")).otvaranja.sat).toEqual({ "0": 1 });
  });

  test("[zbir] a run counts each event once, leaves events younger than 2 minutes and moves the cursor", async () => {
    const { t, w } = await world(T0);
    const a = w.a.menuServiceId;
    expect(await ingest(t, times(3, openPage))).toEqual({ ok: true, primljeno: 3 });

    // 1 ms short of the 2 minute gap: nothing is summed, no cursor moves.
    vi.setSystemTime(T0 + 2 * MINUTE - 1);
    expect(await t.mutation(internal.menuAnalyticsRollup.zbir, {})).toEqual({ obradjeno: 0, jos: false });
    expect(await totalsOf(t, a, TODAY)).toEqual({});
    expect((await cursorOf(t, "dogadjaji"))?.poslednji ?? 0).toBe(0);

    // The gap has passed: all three are summed.
    vi.setSystemTime(T0 + 2 * MINUTE + 1);
    expect(await t.mutation(internal.menuAnalyticsRollup.zbir, {})).toEqual({ obradjeno: 3, jos: false });
    expect(await totalsOf(t, a, TODAY)).toEqual({ otvaranja: 3 });
    const firstRows = await allEvents(t);
    const firstCursor = await cursorOf(t, "dogadjaji");
    expect(firstCursor?.poslednji).toBe(Math.max(...firstRows.map((row) => row._creationTime)));

    // Running again changes nothing.
    expect(await zbir(t)).toEqual({ obradjeno: 0, jos: false });
    expect(await totalsOf(t, a, TODAY)).toEqual({ otvaranja: 3 });
    expect((await cursorOf(t, "dogadjaji"))?.poslednji).toBe(firstCursor?.poslednji);

    // Two new events are added on top, once, and the cursor moves past them.
    expect(await ingest(t, times(2, openPage))).toEqual({ ok: true, primljeno: 2 });
    expect(await zbir(t)).toEqual({ obradjeno: 2, jos: false });
    expect(await totalsOf(t, a, TODAY)).toEqual({ otvaranja: 5 });
    const secondRows = await allEvents(t);
    const secondCursor = await cursorOf(t, "dogadjaji");
    expect(secondCursor?.poslednji).toBe(Math.max(...secondRows.map((row) => row._creationTime)));
    expect(secondCursor?.poslednji).toBeGreaterThan(firstCursor?.poslednji ?? Infinity);
    expect(await zbir(t)).toEqual({ obradjeno: 0, jos: false });
    expect(await totalsOf(t, a, TODAY)).toEqual({ otvaranja: 5 });
  });

  test("[zbir] more than 500 events are summed in batches of 500 that continue themselves", async () => {
    const { t, w } = await world(T0);
    const a = w.a.menuServiceId;
    await addEvents(t, a, times(501, opening(T0)));

    expect(await zbir(t)).toEqual({ obradjeno: 500, jos: true });
    expect(await totalsOf(t, a, TODAY)).toEqual({ otvaranja: 500 });
    const jobs = await pendingJobs(t);
    expect(jobs).toEqual([
      expect.objectContaining({ name: expect.stringContaining("menuAnalyticsRollup"), args: [{ nastavak: 1 }] }),
    ]);

    await settle(t);
    expect(await totalsOf(t, a, TODAY)).toEqual({ otvaranja: 501 });
    const rows = await allEvents(t);
    expect((await cursorOf(t, "dogadjaji"))?.poslednji).toBe(Math.max(...rows.map((row) => row._creationTime)));
    expect(await zbir(t)).toEqual({ obradjeno: 0, jos: false });
    expect(await totalsOf(t, a, TODAY)).toEqual({ otvaranja: 501 });
  });

  test("[zbir] the sums of one venue never contain the events of another", async () => {
    const { t, w } = await world(T0);
    const a = w.a.menuServiceId;
    const b = w.b.menuServiceId;
    await addEvents(t, a, [
      opening(T0),
      opening(T0),
      opening(T0),
      { at: T0, vrsta: "detalj", stranica: PAGE, artikal: ARTICLE },
    ]);
    await addEvents(t, b, [
      { at: T0, vrsta: "stranica", stranica: PAGE_2 },
      { at: T0, vrsta: "stranica", stranica: PAGE_2 },
      { at: T0, vrsta: "detalj", stranica: PAGE_2, artikal: ARTICLE_2 },
      { at: T0, vrsta: "zahtev_poslat", zahtev: "order", kanal: "standard" },
    ]);

    expect(await zbir(t)).toEqual({ obradjeno: 8, jos: false });

    expect(await totalsOf(t, a, TODAY)).toEqual({ otvaranja: 3, detalji: 1 });
    expect(await totalsOf(t, b, TODAY)).toEqual({ otvaranja: 2, detalji: 1, zahtevi: 1, porudzbine: 1 });

    const dimsA = await dimsOf(t, a, TODAY);
    const dimsB = await dimsOf(t, b, TODAY);
    expect(dimsA.otvaranja.stranica).toEqual({ [PAGE]: 3 });
    expect(dimsA.detalji.artikal).toEqual({ [ARTICLE]: 1 });
    expect(dimsB.otvaranja.stranica).toEqual({ [PAGE_2]: 2 });
    expect(dimsB.detalji.artikal).toEqual({ [ARTICLE_2]: 1 });
    expect(dimsB.zahtevi).toEqual({ zahtev: { order: 1 }, kanal: { standard: 1 }, sat: { "12": 1 } });
    expect(dimsB.porudzbine).toEqual({ kanal: { standard: 1 } });
    expect(JSON.stringify(dimsA)).not.toContain(PAGE_2);
    expect(JSON.stringify(dimsA)).not.toContain(ARTICLE_2);
    expect(JSON.stringify(dimsB)).not.toContain(PAGE);
    expect(dimsA.zahtevi).toBeUndefined();
  });
});

// =============================================================================
// [sesija-30] the server session rule
// =============================================================================

describe("[sesija-30] sessions", () => {
  test("[sesija-30] a pause of exactly 30 minutes starts a new session, 29:59 does not", async () => {
    const { t, w } = await world(T0);
    const a = w.a.menuServiceId;
    const second = S + 29 * MINUTE + 59 * SECOND;
    const third = second + 30 * MINUTE;
    await addEvents(t, a, [opening(S, SES_1), opening(second, SES_1), opening(third, SES_1)]);

    await zbir(t);

    expect(await totalsOf(t, a, TODAY)).toEqual({ otvaranja: 3, otvaranjaSaSesijom: 3, sesije: 2 });
    // One row per id: the newest segment.
    const rows = await sessionRows(t);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ menuServiceId: a, sesija: SES_1, dayKey: TODAY, pocetak: third, poslednji: third });
  });

  test("[sesija-30] a pause measured from the last event, not the start, keeps one long session", async () => {
    const { t, w } = await world(T0);
    const a = w.a.menuServiceId;
    // 29:59.999 apart each time: two hours of activity would be four sessions from the start.
    const second = S + 30 * MINUTE - 1;
    const third = second + 30 * MINUTE - 1;
    await addEvents(t, a, [opening(S, SES_1), opening(second, SES_1), opening(third, SES_1)]);

    await zbir(t);

    expect(await totalsOf(t, a, TODAY)).toEqual({ otvaranja: 3, otvaranjaSaSesijom: 3, sesije: 1 });
    const rows = await sessionRows(t);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ pocetak: S, poslednji: third });
  });

  test("[sesija-30] a session continues from one rollup run to the next, and its steps are not counted twice", async () => {
    const { t, w } = await world(T0);
    const a = w.a.menuServiceId;
    const run = async (events: RawEvent[]) => {
      await addEvents(t, a, events);
      await zbir(t);
      return await totalsOf(t, a, TODAY);
    };

    expect(await run([opening(S, SES_1)])).toMatchObject({ sesije: 1 });
    expect(await run([detail(S + 10 * MINUTE, SES_1)])).toMatchObject({ sesije: 1, sesijeSaDetaljem: 1 });
    expect(await run([detail(S + 20 * MINUTE, SES_1)])).toMatchObject({ sesije: 1, sesijeSaDetaljem: 1 });
    // Exactly 30 minutes after the last event of the stored session: a new one.
    expect(await run([opening(S + 50 * MINUTE, SES_1)])).toEqual({
      otvaranja: 2,
      otvaranjaSaSesijom: 2,
      detalji: 2,
      sesije: 2,
      sesijeSaDetaljem: 1,
    });
  });

  test("[sesija-30] a session that crosses the Belgrade midnight is counted once, on the day it started", async () => {
    const { t, w } = await world(T0);
    const a = w.a.menuServiceId;
    // 23:50 in Belgrade on 2026-10-20 (UTC+2); the next events are 00:10 and 00:30 on the 21st.
    const start = Date.UTC(2026, 9, 20, 21, 50, 0);
    await addEvents(t, a, [
      opening(start, SES_1),
      detail(start + 20 * MINUTE, SES_1),
      opening(start + 40 * MINUTE, SES_1),
    ]);

    await zbir(t);

    expect(await totalsOf(t, a, "2026-10-20")).toEqual({
      otvaranja: 1,
      otvaranjaSaSesijom: 1,
      sesije: 1,
      sesijeSaDetaljem: 1,
    });
    // The events after midnight count on the 21st, the session and its step do not.
    expect(await totalsOf(t, a, "2026-10-21")).toEqual({ otvaranja: 1, otvaranjaSaSesijom: 1, detalji: 1 });
    const rows = await sessionRows(t);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ dayKey: "2026-10-20", pocetak: start, poslednji: start + 40 * MINUTE });
  });

  test("[sesija-30] each step of a session counts once, however often it is repeated", async () => {
    const { t, w } = await world(T0);
    const a = w.a.menuServiceId;
    await addEvents(t, a, [
      // Session 1: opens, two details, an order twice. An order is also a request.
      opening(S, SES_1),
      opening(S + MINUTE, SES_2),
      detail(S + 1 * MINUTE, SES_1, ARTICLE),
      detail(S + 2 * MINUTE, SES_1, ARTICLE_2),
      step(S + 3 * MINUTE, "porudzbina", SES_1),
      step(S + 4 * MINUTE, "porudzbina", SES_1),
      // Session 2: a request and a reservation, the request twice.
      step(S + 2 * MINUTE, "zahtev", SES_2),
      step(S + 3 * MINUTE, "rezervacija", SES_2),
      step(S + 4 * MINUTE, "zahtev", SES_2),
    ]);

    await zbir(t);

    expect(await totalsOf(t, a, TODAY)).toEqual({
      otvaranja: 2,
      otvaranjaSaSesijom: 2,
      detalji: 2,
      sesije: 2,
      sesijeSaDetaljem: 1,
      sesijeSaZahtevom: 2,
      sesijeSaPorudzbinom: 1,
      sesijeSaRezervacijom: 1,
    });
    const rows = await sessionRows(t);
    expect(rows.map((row) => [row.sesija, row.koraci])).toEqual([
      [SES_1, { detalj: true, zahtev: true, porudzbina: true }],
      [SES_2, { zahtev: true, rezervacija: true }],
    ]);
  });

  test("[sesija-30] a new segment after a pause counts its steps again", async () => {
    const { t, w } = await world(T0);
    const a = w.a.menuServiceId;
    await addEvents(t, a, [detail(S, SES_1), detail(S + 31 * MINUTE, SES_1)]);

    await zbir(t);

    expect(await totalsOf(t, a, TODAY)).toEqual({ detalji: 2, sesije: 2, sesijeSaDetaljem: 2 });
  });

  test("[sesija-30] the same id in another venue is another session", async () => {
    const { t, w } = await world(T0);
    const a = w.a.menuServiceId;
    const b = w.b.menuServiceId;
    await addEvents(t, a, [opening(S, SES_1), opening(S + 5 * MINUTE, SES_1)]);
    await addEvents(t, b, [opening(S + MINUTE, SES_1), step(S + 2 * MINUTE, "rezervacija", SES_1)]);

    await zbir(t);

    expect(await totalsOf(t, a, TODAY)).toEqual({ otvaranja: 2, otvaranjaSaSesijom: 2, sesije: 1 });
    expect(await totalsOf(t, b, TODAY)).toEqual({
      otvaranja: 1,
      otvaranjaSaSesijom: 1,
      sesije: 1,
      sesijeSaRezervacijom: 1,
    });
    const rows = await sessionRows(t);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.menuServiceId).sort()).toEqual([a, b].sort());
  });

  test("[sesije-pouzdane] only opens that carried a session id count as otvaranjaSaSesijom", async () => {
    const { t, w } = await world(T0);
    const a = w.a.menuServiceId;
    await addEvents(t, a, [
      opening(S, SES_1),
      opening(S + MINUTE, SES_2),
      opening(S + 2 * MINUTE),
      // Not opens: a detail with a session, a step, a detail without one.
      detail(S + 3 * MINUTE, SES_1),
      step(S + 4 * MINUTE, "zahtev", SES_1),
      detail(S + 5 * MINUTE),
    ]);

    await zbir(t);

    const totals = await totalsOf(t, a, TODAY);
    expect(totals).toMatchObject({ otvaranja: 3, otvaranjaSaSesijom: 2, detalji: 2 });
    // Two thirds of the opens had an identifier: far below the 95% the panel needs for a session count.
    expect(sesijePouzdane(totals.otvaranjaSaSesijom, totals.otvaranja)).toBe(false);
    expect(sesijePouzdane(19, 20)).toBe(true);
  });
});

// =============================================================================
// [skenovi] the move of finished-day scans
// =============================================================================

async function addScans(t: T, cardId: Id<"cards">, dateKey: string, scans: number) {
  await t.run(async (ctx) => {
    await ctx.db.insert("dailyCardMetrics", { cardId, dateKey, scans, updatedAt: Date.now() });
  });
}

async function scanWorld() {
  const env = await world(T0);
  const { t, w } = env;
  const cards = await t.run(async (ctx) => ({
    a: await seedQrLink(ctx, {
      menuServiceId: w.a.menuServiceId,
      businessId: w.a.businessId,
      pageKey: PAGE,
      createdByUserId: w.adminId,
      cardCode: "MENUQR01",
      targetKind: "menu",
    }),
    b: await seedQrLink(ctx, {
      menuServiceId: w.b.menuServiceId,
      businessId: w.b.businessId,
      pageKey: PAGE_2,
      createdByUserId: w.adminId,
      cardCode: "MENUQR02",
      targetKind: "menu",
    }),
  }));
  return { ...env, cardA: cards.a.cardId, cardB: cards.b.cardId };
}

describe("[skenovi] scans", () => {
  test("[skenovi] the first run moves the scans of the last 30 finished days, not older ones and not today", async () => {
    const { t, w, cardA, cardB } = await scanWorld();
    const a = w.a.menuServiceId;
    const b = w.b.menuServiceId;
    // Today is 2026-10-21, yesterday 2026-10-20; the 30 days are 2026-09-21 .. 2026-10-20.
    await addScans(t, cardA, "2026-10-20", 12);
    await addScans(t, cardA, "2026-09-21", 4);
    await addScans(t, cardA, "2026-09-20", 9);
    await addScans(t, cardA, "2026-09-11", 7); // 40 days ago
    await addScans(t, cardA, "2026-10-21", 5); // today: the panel reads it live
    await addScans(t, cardB, "2026-10-20", 3);

    expect(await skenovi(t)).toEqual({ dan: "2026-09-21" });
    await settle(t);

    expect(await dailyDays(t, a)).toEqual(["2026-09-21", "2026-10-20"]);
    expect(await totalsOf(t, a, "2026-10-20")).toEqual({ skenovi: 12 });
    expect(await totalsOf(t, a, "2026-09-21")).toEqual({ skenovi: 4 });
    expect(await dimsOf(t, a, "2026-10-20")).toEqual({ skenovi: { kartica: { [cardA]: 12 } } });
    expect(await dimsOf(t, a, "2026-09-21")).toEqual({ skenovi: { kartica: { [cardA]: 4 } } });
    // Tenant B got only its own card's day.
    expect(await dailyDays(t, b)).toEqual(["2026-10-20"]);
    expect(await totalsOf(t, b, "2026-10-20")).toEqual({ skenovi: 3 });
    expect(await dimsOf(t, b, "2026-10-20")).toEqual({ skenovi: { kartica: { [cardB]: 3 } } });
    expect(JSON.stringify(await dimsOf(t, a, "2026-10-20"))).not.toContain(cardB);

    const cursor = await cursorOf(t, "skenovi");
    expect(cursor?.dan).toBe("2026-10-20");
    expect(cursor?.radniDan).toBeUndefined();
    expect(cursor?.stranica).toBeUndefined();
  });

  test("[skenovi] running again counts nothing twice, the next day moves only the day that finished", async () => {
    const { t, w, cardA } = await scanWorld();
    const a = w.a.menuServiceId;
    await addScans(t, cardA, "2026-10-20", 12);
    await addScans(t, cardA, "2026-10-21", 5);
    await skenovi(t);
    await settle(t);
    expect(await totalsOf(t, a, "2026-10-20")).toEqual({ skenovi: 12 });

    // Nothing left to move the same day.
    expect(await skenovi(t)).toEqual({ dan: null });
    await settle(t);
    expect(await dailyDays(t, a)).toEqual(["2026-10-20"]);
    expect(await totalsOf(t, a, "2026-10-20")).toEqual({ skenovi: 12 });

    // A day later 2026-10-21 is finished: only it is moved, once.
    advance(DAY);
    expect(await skenovi(t)).toEqual({ dan: "2026-10-21" });
    await settle(t);
    expect(await dailyDays(t, a)).toEqual(["2026-10-20", "2026-10-21"]);
    expect(await totalsOf(t, a, "2026-10-20")).toEqual({ skenovi: 12 });
    expect(await totalsOf(t, a, "2026-10-21")).toEqual({ skenovi: 5 });
    expect((await cursorOf(t, "skenovi"))?.dan).toBe("2026-10-21");
    expect(await skenovi(t)).toEqual({ dan: null });
    expect(await totalsOf(t, a, "2026-10-21")).toEqual({ skenovi: 5 });
  });

  test("[skenovi] a day that spans several pages of services is moved once, page by page", async () => {
    const { t, w, cardA } = await scanWorld();
    const a = w.a.menuServiceId;
    // Seven services (A, B and five more): one per transaction (K33: SKENOVI_USLUGA_PO_SERIJI) means seven pages.
    const extras = await t.run(async (ctx) => {
      const created: MenuTenantSeed[] = [];
      for (let index = 1; index <= 5; index += 1) {
        created.push(
          await addVenueToAccount(ctx, {
            accountId: w.a.accountId,
            name: `Pomocni lokal ${index}`,
            slug: `pomocni-lokal-${index}`,
            actorUserId: w.adminId,
          }),
        );
      }
      return created;
    });
    const last = extras[4];
    const { cardId: cardLast } = await t.run(
      async (ctx) =>
        await seedQrLink(ctx, {
          menuServiceId: last.menuServiceId,
          businessId: last.businessId,
          pageKey: PAGE,
          createdByUserId: w.adminId,
          cardCode: "MENUQR09",
          targetKind: "menu",
        }),
    );
    // Only 2026-10-20 is left to move.
    await t.run(async (ctx) => {
      await ctx.db.insert("menuAnalyticsCursors", { kljuc: "skenovi", dan: "2026-10-19", updatedAt: Date.now() });
    });
    await addScans(t, cardA, "2026-10-20", 12);
    await addScans(t, cardLast, "2026-10-20", 8);

    // First transaction: the first page only; the day stays open in the cursor.
    expect(await skenovi(t)).toEqual({ dan: "2026-10-20" });
    const middle = await cursorOf(t, "skenovi");
    expect(middle?.dan).toBe("2026-10-19");
    expect(middle?.radniDan).toBe("2026-10-20");
    expect(typeof middle?.stranica).toBe("string");
    expect(await totalsOf(t, a, "2026-10-20")).toEqual({ skenovi: 12 });
    expect(await totalsOf(t, last.menuServiceId, "2026-10-20")).toEqual({});
    expect(await pendingJobs(t)).toHaveLength(1);

    await settle(t);

    expect(await totalsOf(t, a, "2026-10-20")).toEqual({ skenovi: 12 });
    expect(await totalsOf(t, last.menuServiceId, "2026-10-20")).toEqual({ skenovi: 8 });
    expect(await dimsOf(t, last.menuServiceId, "2026-10-20")).toEqual({ skenovi: { kartica: { [cardLast]: 8 } } });
    const done = await cursorOf(t, "skenovi");
    expect(done?.dan).toBe("2026-10-20");
    expect(done?.radniDan).toBeUndefined();
    expect(done?.stranica).toBeUndefined();
    expect(await skenovi(t)).toEqual({ dan: null });
    expect(await totalsOf(t, a, "2026-10-20")).toEqual({ skenovi: 12 });
  });
});

// =============================================================================
// [retencija] the retention windows
// =============================================================================

describe("[retencija] retention", () => {
  test("[retencija-90] a raw event is deleted 90 days and 1 ms after it arrived, one of 89 days stays", async () => {
    const { t, w } = await world(T0 - 100 * DAY);
    const a = w.a.menuServiceId;

    vi.setSystemTime(T0 - 90 * DAY - 1);
    await addEvents(t, a, [opening(Date.now())]);
    vi.setSystemTime(T0 - 89 * DAY);
    await addEvents(t, a, [opening(Date.now())]);
    // convex-test stamps _creationTime from the faked clock.
    expect((await allEvents(t)).map((row) => row._creationTime)).toEqual([T0 - 90 * DAY - 1, T0 - 89 * DAY]);

    vi.setSystemTime(T0);
    expect(await retencija(t)).toEqual({ sirovi: 1, sesije: 0, dnevni: 0, raspodele: 0 });
    expect((await allEvents(t)).map((row) => row._creationTime)).toEqual([T0 - 89 * DAY]);

    // Nothing more to delete.
    expect(await retencija(t)).toEqual({ sirovi: 0, sesije: 0, dnevni: 0, raspodele: 0 });
    expect(await allEvents(t)).toHaveLength(1);
  });

  test("[retencija-90] more than 500 old events are deleted in batches of 500 that continue themselves", async () => {
    const { t, w } = await world(T0 - 100 * DAY);
    const a = w.a.menuServiceId;
    vi.setSystemTime(T0 - 91 * DAY);
    await addEvents(t, a, times(501, opening(Date.now())));
    vi.setSystemTime(T0 - 10 * DAY);
    await addEvents(t, a, [opening(Date.now())]);
    vi.setSystemTime(T0);

    expect(await retencija(t)).toEqual({ sirovi: 500, sesije: 0, dnevni: 0, raspodele: 0 });
    expect(await allEvents(t)).toHaveLength(2);
    expect(await pendingJobs(t)).toEqual([
      expect.objectContaining({ name: expect.stringContaining("retencija"), args: [{ nastavak: 1 }] }),
    ]);

    await settle(t);

    // Only the recent event is left.
    const left = await allEvents(t);
    expect(left).toHaveLength(1);
    expect(left[0]._creationTime).toBe(T0 - 10 * DAY);
  });

  test("[retencija-sesije] a session row is deleted 24 hours after its last event, a newer one stays", async () => {
    const { t, w } = await world(T0);
    const a = w.a.menuServiceId;
    const row = (sesija: string, poslednji: number) => ({
      menuServiceId: a,
      sesija,
      dayKey: TODAY,
      pocetak: poslednji,
      poslednji,
      koraci: {},
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("menuAnalyticsSessions", row("aaaaaaaa23456789", T0 - DAY - 1));
      await ctx.db.insert("menuAnalyticsSessions", row("bbbbbbbb23456789", T0 - DAY + 1));
      await ctx.db.insert("menuAnalyticsSessions", row("cccccccc23456789", T0 - HOUR));
    });

    expect(await retencija(t)).toEqual({ sirovi: 0, sesije: 1, dnevni: 0, raspodele: 0 });

    expect((await sessionRows(t)).map((session) => session.sesija)).toEqual(["bbbbbbbb23456789", "cccccccc23456789"]);
  });

  test("[retencija-24m] daily and breakdown rows before the same date 24 months back are deleted, the row on it stays", async () => {
    // Today is 2026-10-21 in Belgrade, so 2024-10-21 is the oldest day kept.
    const { t, w } = await world(T0);
    const a = w.a.menuServiceId;
    const b = w.b.menuServiceId;
    await t.run(async (ctx) => {
      const put = async (menuServiceId: Id<"menuServices">, dayKey: string) => {
        await ctx.db.insert("menuAnalyticsDaily", { menuServiceId, dayKey, brojevi: { otvaranja: 1 }, updatedAt: Date.now() });
        await ctx.db.insert("menuAnalyticsDailyDims", {
          menuServiceId,
          dayKey,
          po: { otvaranja: { stranica: { [PAGE]: 1 } } },
          updatedAt: Date.now(),
        });
      };
      for (const dayKey of ["2020-01-01", "2024-10-20", "2024-10-21", "2026-10-20"]) await put(a, dayKey);
      await put(b, "2024-10-20");
      await put(b, "2025-01-01");
    });

    expect(await retencija(t)).toEqual({ sirovi: 0, sesije: 0, dnevni: 3, raspodele: 3 });

    expect(await dailyDays(t, a)).toEqual(["2024-10-21", "2026-10-20"]);
    expect(await dimsDays(t, a)).toEqual(["2024-10-21", "2026-10-20"]);
    expect(await dailyDays(t, b)).toEqual(["2025-01-01"]);
    expect(await dimsDays(t, b)).toEqual(["2025-01-01"]);
    // The kept row is untouched.
    expect(await totalsOf(t, a, "2024-10-21")).toEqual({ otvaranja: 1 });
  });

  test("[retencija-24m] on 29 February the oldest kept day is 28 February two years back", async () => {
    const { t, w } = await world(Date.UTC(2028, 1, 29, 10, 0, 0));
    const a = w.a.menuServiceId;
    await t.run(async (ctx) => {
      for (const dayKey of ["2026-02-27", "2026-02-28", "2026-03-01"]) {
        await ctx.db.insert("menuAnalyticsDaily", { menuServiceId: a, dayKey, brojevi: { otvaranja: 1 }, updatedAt: Date.now() });
      }
    });

    expect(await retencija(t)).toEqual({ sirovi: 0, sesije: 0, dnevni: 1, raspodele: 0 });

    expect(await dailyDays(t, a)).toEqual(["2026-02-28", "2026-03-01"]);
  });
});
