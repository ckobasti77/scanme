/// <reference types="vite/client" />

// ScanMe Menu V1 - K33 (hardening): three load simulations, run in convex-test
// with the REAL Convex transaction limits enforced on every call
// (`transactionLimits: true`: 32,000 documents read, 4,096 index ranges, 16,000
// documents written, 16 MiB), so a call that goes over a platform limit throws
// here. Costs are measured with `ctx.meta.getTransactionMetrics()` around a
// nested `ctx.runQuery` (documents read and index ranges the call itself used).
//   A  the waiter panel of a venue with 300 tables: `menuWaiter.activeRequests`,
//      `menuPanel.operations` and `menuPanel.home` read a bounded set, whatever
//      the history (5,000 finished requests) is.
//   B  analytics: 10,000 raw events are summed exactly by the rollup chain; the
//      panel queries read only aggregates (same answers after the raw events are
//      deleted); the retention cron deletes them within one hour's chain.
//   C  scans: the hourly cron moves the scans of a venue with 300 cards, one
//      service per transaction, and continues where it stopped.
// The printed milliseconds are in-memory convex-test time: an orientation, not a
// threshold. Time is frozen only where the crons read the clock (B, C). Fictional
// tenants only (the repo is public). The helpers are copied per file on purpose
// (a test file is not a module to import from).

import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import type { GenericMutationCtx } from "convex/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { DataModel, Doc, Id } from "./_generated/dataModel";
import {
  MAX_NASTAVAKA,
  RETENCIJA_MAX_NASTAVAKA,
  RETENCIJA_SERIJA,
  SKENOVI_MAX_NASTAVAKA,
  SKENOVI_USLUGA_PO_SERIJI,
  ZBIR_SERIJA,
} from "./menuAnalyticsRollup";
import schema from "./schema";
import { danUBeogradu, satUBeogradu } from "../lib/menu/analitika/vreme";
import { MENU_MAX_ACTIVE_REQUESTS, MENU_MAX_QR_CARDS, MENU_MAX_RECENT_CANCELLED } from "../lib/menu/limits";
import { addDays } from "../lib/menu/working-hours";
import {
  SLUG_A,
  TEST_ADMIN_EMAIL,
  TEST_ISSUER,
  addVenueToAccount,
  grantAccountPremium,
  seedMenuWorld,
  seedQrLink,
  type MenuTenantSeed,
  type MenuWorldSeed,
} from "../lib/menu/testkit/seed";

const modules = import.meta.glob("./**/*.ts");

// The wall clock of the printed timings, taken before any test installs fake timers.
const clock = performance.now.bind(performance);

beforeEach(() => {
  process.env.SCANME_ADMIN_EMAILS = TEST_ADMIN_EMAIL;
  process.env.MENU_PIN_PEPPER = "test-pepper-0123456789abcdef";
});

afterEach(() => {
  delete process.env.MENU_PIN_PEPPER;
  vi.useRealTimers();
});

const newTest = () => {
  const t = convexTest({ schema, modules, transactionLimits: true });
  rateLimiterTest.register(t);
  return t;
};
type T = ReturnType<typeof newTest>;
type RunCtx = GenericMutationCtx<DataModel>;

function as(t: T, userId: Id<"users">) {
  return t.withIdentity({ subject: userId, issuer: TEST_ISSUER });
}

function must<V>(value: V | null | undefined, what = "value"): V {
  if (value === null || value === undefined) throw new Error(`expected ${what}, got ${String(value)}`);
  return value;
}

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Wednesday 2026-10-21 12:00 in Belgrade (CEST, UTC+2). */
const T0 = Date.UTC(2026, 9, 21, 10, 0, 0);
const TODAY = "2026-10-21";
const YESTERDAY = "2026-10-20";
/** The Belgrade day `back` days before today. */
const dan = (back: number) => addDays(TODAY, -back);

/** The pseudonym of the guest's phone. */
const GUEST_DEVICE = "guest-device-pseudonym-6f2c1a";

// -----------------------------------------------------------------------------
// Measuring
// -----------------------------------------------------------------------------

type Cost = { documentsRead: number; databaseQueries: number; bytesRead: number };

/** Runs `call` inside `who.run` and returns its result with what it read (the delta of the transaction metrics). */
async function measured<R>(who: Pick<T, "run">, call: (ctx: RunCtx) => Promise<R>): Promise<Cost & { result: R }> {
  return await who.run(async (ctx) => {
    const before = await ctx.meta.getTransactionMetrics();
    const result = await call(ctx);
    const after = await ctx.meta.getTransactionMetrics();
    return {
      result,
      documentsRead: after.documentsRead.used - before.documentsRead.used,
      databaseQueries: after.databaseQueries.used - before.databaseQueries.used,
      bytesRead: after.bytesRead.used - before.bytesRead.used,
    };
  });
}

/** The median wall time of `runs` calls (ms), and the last result. */
async function timed<R>(call: () => Promise<R>, runs = 3): Promise<{ result: R; ms: number }> {
  const samples: number[] = [];
  let result: R | undefined;
  for (let run = 0; run < runs; run += 1) {
    const start = clock();
    result = await call();
    samples.push(clock() - start);
  }
  samples.sort((a, b) => a - b);
  return { result: result as R, ms: Math.round(samples[Math.floor(samples.length / 2)] * 10) / 10 };
}

// =============================================================================
// A. The waiter panel of a venue with 300 tables
// =============================================================================

const TABLES = 300;
const ZONES = 6;
const DONE_HISTORY = 5_000;
const CANCELLED = 25;
const RS_ITEMS = 2_000;
const RS_WARNED = 7;

type Table = {
  positionId: Id<"menuPositions">;
  guestSessionId: Id<"menuGuestSessions">;
  zoneId: Id<"menuZones">;
  label: string;
};

/** 6 zones, 300 tables and one guest session per table, in one transaction. */
async function seedFloor(t: T, w: MenuWorldSeed): Promise<Table[]> {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const menuServiceId = w.a.menuServiceId;
    const zoneIds: Id<"menuZones">[] = [];
    for (let z = 0; z < ZONES; z += 1) {
      zoneIds.push(
        await ctx.db.insert("menuZones", {
          menuServiceId,
          key: `zn_k33${z}`,
          name: `Zona ${z + 1}`,
          nameNormalized: `zona ${z + 1}`,
          order: z,
          active: true,
          createdAt: now,
          updatedAt: now,
        }),
      );
    }
    const tables: Table[] = [];
    for (let n = 0; n < TABLES; n += 1) {
      const label = `Sto ${n + 1}`;
      const zoneId = zoneIds[n % ZONES];
      const positionId = await ctx.db.insert("menuPositions", {
        menuServiceId,
        key: `ps_k33${n}`,
        kind: "table",
        label,
        labelNormalized: label.toLowerCase(),
        zoneId,
        order: n,
        active: true,
        createdAt: now,
        updatedAt: now,
      });
      const guestSessionId = await ctx.db.insert("menuGuestSessions", {
        menuServiceId,
        tokenHash: `k33-guest-token-hash-${n}`,
        deviceKeyHash: GUEST_DEVICE,
        positionId,
        createdAt: now,
        lastSeenAt: now,
        expiresAt: now + 3 * HOUR,
      });
      tables.push({ positionId, guestSessionId, zoneId, label });
    }
    return tables;
  });
}

type RequestFields = Partial<Omit<Doc<"menuRequests">, "_id" | "_creationTime">>;

/** `count` requests spread over the tables; `fields` gives the status and the stamps of the one at `index`. */
async function addRequests(
  t: T,
  w: MenuWorldSeed,
  tables: Table[],
  count: number,
  fields: (index: number) => RequestFields,
) {
  await t.run(async (ctx) => {
    const now = Date.now();
    for (let index = 0; index < count; index += 1) {
      const table = tables[index % tables.length];
      await ctx.db.insert("menuRequests", {
        menuServiceId: w.a.menuServiceId,
        businessId: w.a.businessId,
        kind: "call",
        status: "new",
        channel: "standard",
        positionId: table.positionId,
        positionLabel: table.label,
        positionKind: "table",
        zoneId: table.zoneId,
        guestSessionId: table.guestSessionId,
        deviceKeyHash: GUEST_DEVICE,
        createdAt: now,
        updatedAt: now,
        ...fields(index),
      });
    }
  });
}

/** 2,000 Room service articles on one category; the first `warned` of them have a price warning. */
async function addRoomServiceItems(t: T, w: MenuWorldSeed, count: number, warned: number) {
  const menuServiceId = w.a.menuServiceId;
  const categoryId = await t.run(async (ctx) => {
    const now = Date.now();
    return await ctx.db.insert("menuRoomServiceCategories", {
      menuServiceId,
      key: "rc_k33category",
      name: "Hrana u sobu",
      order: 1024,
      createdAt: now,
      updatedAt: now,
    });
  });
  for (let from = 0; from < count; from += 500) {
    await t.run(async (ctx) => {
      const now = Date.now();
      for (let n = from; n < Math.min(count, from + 500); n += 1) {
        const articleId = await ctx.db.insert("menuArticles", {
          menuServiceId,
          key: `ar_k33rs${String(n).padStart(5, "0")}`,
          kind: "item",
          name: `Jelo broj ${n + 1}`,
          nameNormalized: `jelo broj ${n + 1}`,
          basePriceRsd: 150,
          mediaMode: "none",
          createdAt: now,
          updatedAt: now,
        });
        await ctx.db.insert("menuRoomServiceItems", {
          menuServiceId,
          categoryId,
          articleId,
          order: (n + 1) * 1024,
          markupApplies: false,
          ...(n < warned ? { manualPriceRsd: 180, priceWarning: { oldBaseRsd: 150, newBaseRsd: 170, at: now } } : {}),
          createdAt: now,
          updatedAt: now,
        });
      }
    });
  }
}

describe("A. waiter panel, 300 tables", () => {
  test(
    "activeRequests, operations and home read a bounded set: 600 requests, the history is never read, the 301st new one is cut",
    { timeout: 180_000 },
    async () => {
      const t = newTest();
      const w: MenuWorldSeed = await t.run(async (ctx) => await seedMenuWorld(ctx));
      const A = w.a.menuServiceId;
      const owner = as(t, w.ownerId);
      const { code } = await owner.mutation(api.menuStaff.ensurePanelCode, { menuServiceId: A });
      const { staffId } = await owner.mutation(api.menuStaff.create, { menuServiceId: A, displayName: "Ana" });
      await owner.mutation(api.menuStaff.setPin, { staffId, pin: "246" });
      const login = await t.mutation(api.menuWaiter.loginWithPin, { slug: SLUG_A, panelCode: code, pin: "246" });
      if (!login.ok) throw new Error(`sign-in refused: ${JSON.stringify(login)}`);
      const waiter = { slug: SLUG_A, panelCode: code, sessionToken: login.sessionToken };

      const base = Date.now();
      const tables = await seedFloor(t, w);
      expect(MENU_MAX_ACTIVE_REQUESTS).toBe(TABLES);
      // 300 new and 300 accepted (taken by Ana): exactly the ceiling of each status.
      await addRequests(t, w, tables, TABLES, (index) => ({ createdAt: base + index * 1000 }));
      await addRequests(t, w, tables, TABLES, (index) => ({
        status: "accepted",
        createdAt: base - 10_000_000 + index * 1000,
        acceptedAt: base,
        acceptedByStaffId: staffId,
      }));
      // More cancelled ones than the panel lists.
      await addRequests(t, w, tables, CANCELLED, (index) => ({
        status: "cancelled",
        createdAt: base - 30_000_000 + index * 1000,
        cancelledAt: base - 29_000_000 + index * 1000,
        cancelledBy: "guest",
      }));

      const fromMs = base - 12 * HOUR;
      const queue = () => measured(t, (ctx) => ctx.runQuery(api.menuWaiter.activeRequests, waiter));
      const operations = () => measured(owner, (ctx) => ctx.runQuery(api.menuPanel.operations, { menuServiceId: A, fromMs }));
      const home = () => measured(owner, (ctx) => ctx.runQuery(api.menuPanel.home, { menuServiceId: A, fromMs }));

      // --- Without any history ------------------------------------------------
      const queue0 = await queue();
      const operations0 = await operations();
      const home0 = await home();

      const waiterQueue = must(queue0.result);
      expect(waiterQueue.requests).toHaveLength(2 * MENU_MAX_ACTIVE_REQUESTS);
      expect(waiterQueue.truncated).toBe(false);
      expect(waiterQueue.recentlyCancelled).toHaveLength(MENU_MAX_RECENT_CANCELLED);
      expect(waiterQueue.requests.slice(0, TABLES).every((row) => row.status === "new")).toBe(true);
      expect(waiterQueue.requests.slice(TABLES).every((row) => row.status === "accepted")).toBe(true);
      expect(waiterQueue.requests[TABLES].acceptedBy).toEqual({ name: "Ana", isMe: true });
      // 600 requests + 20 cancelled + the venue, the panel code, the session, the staff and the 6 zones.
      expect(queue0.documentsRead).toBeLessThanOrEqual(760);
      expect(queue0.databaseQueries).toBeLessThanOrEqual(60);

      const ops = must(operations0.result);
      expect(ops.requests).toHaveLength(2 * MENU_MAX_ACTIVE_REQUESTS);
      expect(ops.truncated).toBe(false);
      expect(ops.reservations).toEqual([]);
      expect(ops.zones).toHaveLength(ZONES);
      expect(ops.onShift.map((member) => member.name)).toEqual(["Ana"]);
      expect(operations0.documentsRead).toBeLessThanOrEqual(760);
      expect(operations0.databaseQueries).toBeLessThanOrEqual(60);

      const overview = must(home0.result);
      expect(Object.keys(overview).sort()).toEqual(["mail", "menu", "operations", "roomServicePriceWarnings"]);
      expect(overview.operations?.requests).toHaveLength(2 * MENU_MAX_ACTIVE_REQUESTS);
      expect(overview.operations?.requestsTruncated).toBe(false);
      expect(overview.operations?.staffSessions).toHaveLength(1);
      expect(overview.roomServicePriceWarnings).toBeNull();
      expect(home0.documentsRead).toBeLessThanOrEqual(760);
      expect(home0.databaseQueries).toBeLessThanOrEqual(60);

      // --- 5,000 finished requests change nothing -------------------------------
      for (let from = 0; from < DONE_HISTORY; from += 1_000) {
        await addRequests(t, w, tables, 1_000, (index) => ({
          status: "done",
          createdAt: base - 60_000_000 + (from + index) * 1000,
          doneAt: base - 59_000_000 + (from + index) * 1000,
        }));
      }
      const queue1 = await queue();
      const operations1 = await operations();
      const home1 = await home();
      expect(queue1.result).toEqual(queue0.result);
      expect(operations1.result).toEqual(operations0.result);
      expect(home1.result).toEqual(home0.result);
      for (const [after, before] of [
        [queue1, queue0],
        [operations1, operations0],
        [home1, home0],
      ] as const) {
        expect(after.documentsRead).toBe(before.documentsRead);
        expect(after.databaseQueries).toBe(before.databaseQueries);
      }

      // --- The 301st new request: the answer stays at 600 and says so -------------
      await addRequests(t, w, tables, 1, () => ({ createdAt: base + 10_000_000 }));
      const queue2 = await queue();
      const operations2 = await operations();
      const home2 = await home();
      const cut = must(queue2.result);
      expect(cut.truncated).toBe(true);
      expect(cut.requests).toHaveLength(2 * MENU_MAX_ACTIVE_REQUESTS);
      expect(cut.requests.map((row) => row.id)).toEqual(waiterQueue.requests.map((row) => row.id));
      expect(queue2.documentsRead).toBe(queue1.documentsRead + 1);
      expect(queue2.databaseQueries).toBe(queue1.databaseQueries);
      expect(must(operations2.result).truncated).toBe(true);
      expect(must(operations2.result).requests).toHaveLength(2 * MENU_MAX_ACTIVE_REQUESTS);
      expect(operations2.documentsRead).toBe(operations1.documentsRead + 1);
      expect(must(home2.result).operations?.requestsTruncated).toBe(true);
      expect(must(home2.result).operations?.requests).toHaveLength(2 * MENU_MAX_ACTIVE_REQUESTS);
      expect(home2.documentsRead).toBe(home1.documentsRead + 1);

      // --- home with Room service: C4 (the warnings read up to 2,000 rows on every change) ---
      await t.run(async (ctx) => {
        await grantAccountPremium(ctx, { accountId: w.a.accountId, via: "plan" });
      });
      await owner.mutation(api.menuServices.setFeature, { menuServiceId: A, feature: "roomService", enabled: true });
      await addRoomServiceItems(t, w, RS_ITEMS, RS_WARNED);
      const home3 = await home();
      expect(must(home3.result).roomServicePriceWarnings).toBe(RS_WARNED);
      // 601 requests + the 2,000 Room service rows + the rest (sessions, entitlement, draft state).
      expect(home3.documentsRead).toBeGreaterThanOrEqual(home2.documentsRead + RS_ITEMS);
      expect(home3.documentsRead).toBeLessThanOrEqual(3_000);
      expect(home3.databaseQueries).toBeLessThanOrEqual(100);

      // --- Wall time (orientation only) ----------------------------------------
      const queueMs = await timed(() => t.query(api.menuWaiter.activeRequests, waiter));
      const operationsMs = await timed(() => owner.query(api.menuPanel.operations, { menuServiceId: A, fromMs }));
      const homeMs = await timed(() => owner.query(api.menuPanel.home, { menuServiceId: A, fromMs }));
      console.log(
        `[K33 A] ${TABLES} tables, ${2 * TABLES} active + ${DONE_HISTORY} done + ${CANCELLED} cancelled | ` +
          `activeRequests ${queue1.documentsRead} docs / ${queue1.databaseQueries} queries / ${queueMs.ms} ms | ` +
          `operations ${operations1.documentsRead} docs / ${operations1.databaseQueries} queries / ${operationsMs.ms} ms | ` +
          `home ${home1.documentsRead} docs / ${home1.databaseQueries} queries / ${homeMs.ms} ms | ` +
          `home with ${RS_ITEMS} Room service rows ${home3.documentsRead} docs / ${home3.databaseQueries} queries | ` +
          `301st new: +1 doc, truncated`,
      );
    },
  );
});

// =============================================================================
// B. Analytics: 10,000 events
// =============================================================================

const EVENTS = 10_000;
const DAYS = 30;
const CARDS = 40;
const ARTICLES = 300;
const PAGE = "pg_5k2m9q0x7c1d";
const articleKey = (n: number) => `ar_5k2m9q0x${String(n).padStart(4, "0")}`;
const DEVICES = ["telefon", "tablet", "racunar"] as const;
const KINDS = ["call", "bill", "order"] as const;

/** A fixed pseudo-random number below `n` (the same every run). */
const pick = (i: number, n: number) => (Math.imul(i + 1, 2654435761) >>> 0) % n;

type Raw = Omit<Doc<"menuAnalyticsEvents">, "_id" | "_creationTime">;

/**
 * `count` events of one service over the last 30 Belgrade days: per slot of ten, six page opens, three detail
 * opens (over 300 articles) and one request; 80% of the client events carry a session id (every one its own).
 */
function rawEvents(menuServiceId: Id<"menuServices">, cards: Id<"cards">[], count: number): Raw[] {
  const events: Raw[] = [];
  for (let i = 0; i < count; i += 1) {
    const daysAgo = i % DAYS;
    const seq = Math.floor(i / DAYS);
    const slot = seq % 10;
    const at = T0 - daysAgo * DAY + (pick(i, 10) - 5) * HOUR;
    const common = { menuServiceId, occurredAt: at, dayKey: danUBeogradu(at), sat: satUBeogradu(at) };
    const uredjaj = DEVICES[i % 3];
    const sesija = seq % 5 !== 4 ? { sesija: `ses${String(i).padStart(13, "0")}` } : {};
    const kartica = cards.length > 0 ? { kartica: cards[pick(i * 3 + 1, cards.length)] } : {};
    if (slot < 6) {
      events.push({ ...common, vrsta: "stranica", stranica: PAGE, jezik: i % 2 === 0 ? "sr" : "en", uredjaj, ...kartica, ...sesija });
    } else if (slot < 9) {
      events.push({ ...common, vrsta: "detalj", stranica: PAGE, artikal: articleKey(pick(i, ARTICLES)), jezik: "sr", uredjaj, ...sesija });
    } else {
      events.push({ ...common, vrsta: "zahtev_poslat", zahtev: KINDS[i % 3], kanal: "standard", ...kartica });
    }
  }
  return events;
}

type DayTally = {
  brojevi: Record<string, number>;
  artikal: Record<string, number>;
  kartica: Record<string, number>;
  zahtev: Record<string, number>;
};

const bump = (counts: Record<string, number>, key: string) => {
  counts[key] = (counts[key] ?? 0) + 1;
};

/** What the rollup must have written, counted here from the events by the definitions (one session per session id). */
function tallyOf(events: Raw[]): Map<string, DayTally> {
  const days = new Map<string, DayTally>();
  for (const event of events) {
    let day = days.get(event.dayKey);
    if (!day) {
      day = { brojevi: {}, artikal: {}, kartica: {}, zahtev: {} };
      days.set(event.dayKey, day);
    }
    if (event.vrsta === "stranica") {
      bump(day.brojevi, "otvaranja");
      if (event.kartica) bump(day.kartica, event.kartica);
      if (event.sesija) {
        bump(day.brojevi, "otvaranjaSaSesijom");
        bump(day.brojevi, "sesije");
      }
    } else if (event.vrsta === "detalj") {
      bump(day.brojevi, "detalji");
      if (event.artikal) bump(day.artikal, event.artikal);
      if (event.sesija) {
        bump(day.brojevi, "sesije");
        bump(day.brojevi, "sesijeSaDetaljem");
      }
    } else if (event.vrsta === "zahtev_poslat") {
      bump(day.brojevi, "zahtevi");
      if (event.zahtev) bump(day.zahtev, event.zahtev);
      if (event.zahtev === "order") bump(day.brojevi, "porudzbine");
    }
  }
  return days;
}

/** Events inserted directly in batches of 1,000, the clock moving one second per batch (so _creationTime grows). */
async function insertEvents(t: T, events: Raw[]) {
  for (let from = 0; from < events.length; from += 1_000) {
    await t.run(async (ctx) => {
      for (const event of events.slice(from, from + 1_000)) await ctx.db.insert("menuAnalyticsEvents", event);
    });
    vi.setSystemTime(Date.now() + SECOND);
  }
}

async function deleteAllEvents(t: T) {
  for (;;) {
    const deleted = await t.run(async (ctx) => {
      const rows = await ctx.db.query("menuAnalyticsEvents").take(1_000);
      for (const row of rows) await ctx.db.delete(row._id);
      return rows.length;
    });
    if (deleted === 0) return;
  }
}

async function analyticsWorld(startMs: number) {
  vi.useFakeTimers();
  vi.setSystemTime(startMs);
  const t = newTest();
  const w: MenuWorldSeed = await t.run(async (ctx) => await seedMenuWorld(ctx));
  return { t, w };
}

const settle = async (t: T) => {
  await t.finishAllScheduledFunctions(vi.runAllTimers);
};

const pendingJobs = (t: T) => t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());

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

async function cursorOf(t: T, kljuc: "dogadjaji" | "skenovi") {
  return await t.run(async (ctx) =>
    ctx.db
      .query("menuAnalyticsCursors")
      .withIndex("by_kljuc", (q) => q.eq("kljuc", kljuc))
      .first(),
  );
}

/** Cards of one service, each with its link row (the card ids the events carry). */
let cardCounter = 0;
async function addMenuCards(t: T, w: MenuWorldSeed, tenant: MenuTenantSeed, count: number): Promise<Id<"cards">[]> {
  return await t.run(async (ctx) => {
    const ids: Id<"cards">[] = [];
    for (let n = 0; n < count; n += 1) {
      cardCounter += 1;
      const seeded = await seedQrLink(ctx, {
        menuServiceId: tenant.menuServiceId,
        businessId: tenant.businessId,
        pageKey: PAGE,
        createdByUserId: w.adminId,
        cardCode: `KB${String(cardCounter).padStart(6, "0")}`,
      });
      ids.push(seeded.cardId);
    }
    return ids;
  });
}

/** One dailyCardMetrics row per card for `dateKey`; `scansOf` gives the scans of the card at `index`. */
async function addScans(t: T, cards: Id<"cards">[], dateKey: string, scansOf: (index: number) => number) {
  await t.run(async (ctx) => {
    for (const [index, cardId] of cards.entries()) {
      await ctx.db.insert("dailyCardMetrics", { cardId, dateKey, scans: scansOf(index), updatedAt: Date.now() });
    }
  });
}

const eventCount = (t: T) => t.run(async (ctx) => (await ctx.db.query("menuAnalyticsEvents").take(20_000)).length);

describe("B. analytics, 10,000 events", () => {
  test(
    "the rollup chain sums 10,000 events exactly in 20 transactions; the panel reads only aggregates, so deleting the raw events changes no answer",
    { timeout: 180_000 },
    async () => {
      const { t, w } = await analyticsWorld(T0);
      const A = w.a.menuServiceId;
      const owner = as(t, w.ownerId);
      await t.run(async (ctx) => {
        await grantAccountPremium(ctx, { accountId: w.a.accountId, via: "plan" });
        const now = Date.now();
        for (let n = 0; n < ARTICLES; n += 1) {
          await ctx.db.insert("menuArticles", {
            menuServiceId: A,
            key: articleKey(n),
            kind: "item",
            name: `Artikal ${n}`,
            nameNormalized: `artikal ${n}`,
            mediaMode: "none",
            createdAt: now,
            updatedAt: now,
          });
        }
      });
      const cards = await addMenuCards(t, w, w.a, CARDS);
      // Scans the panel reads live (no scans cursor yet: the last three days).
      await addScans(t, cards.slice(0, 3), TODAY, (index) => [5, 3, 1][index]);
      await addScans(t, cards.slice(0, 1), YESTERDAY, () => 4);

      const events = rawEvents(A, cards, EVENTS);
      const tally = tallyOf(events);
      await insertEvents(t, events);
      expect(await eventCount(t)).toBe(EVENTS);

      // --- The rollup: 10,000 / 500 = 20 transactions (one by hand, 19 continuations) -----
      vi.setSystemTime(Date.now() + 3 * MINUTE);
      const rollupStart = clock();
      expect(await t.mutation(internal.menuAnalyticsRollup.zbir, {})).toEqual({ obradjeno: ZBIR_SERIJA, jos: true });
      await settle(t);
      const rollupMs = Math.round(clock() - rollupStart);
      const jobs = await pendingJobs(t);
      expect(jobs).toHaveLength(EVENTS / ZBIR_SERIJA - 1);
      expect(jobs.every((job) => job.state.kind === "success")).toBe(true);
      expect(EVENTS / ZBIR_SERIJA).toBeLessThanOrEqual(MAX_NASTAVAKA + 1);
      vi.setSystemTime(Date.now() + 3 * MINUTE);
      expect(await t.mutation(internal.menuAnalyticsRollup.zbir, {})).toEqual({ obradjeno: 0, jos: false });
      expect(await eventCount(t)).toBe(EVENTS);

      const lastCreated = Math.max(...(await t.run(async (ctx) => (await ctx.db.query("menuAnalyticsEvents").collect()).map((row) => row._creationTime))));
      expect((await cursorOf(t, "dogadjaji"))?.poslednji).toBe(lastCreated);

      // Exact sums, day by day: the totals, and the breakdowns of the three busiest dimensions.
      const days = Array.from({ length: DAYS }, (_, k) => dan(DAYS - 1 - k));
      expect([...tally.keys()].sort()).toEqual(days);
      let grandTotal = 0;
      for (const day of days) {
        const expected = must(tally.get(day));
        expect(await totalsOf(t, A, day)).toEqual(expected.brojevi);
        const po = await dimsOf(t, A, day);
        expect(po.detalji?.artikal ?? {}).toEqual(expected.artikal);
        expect(po.otvaranja?.kartica ?? {}).toEqual(expected.kartica);
        expect(po.zahtevi?.zahtev ?? {}).toEqual(expected.zahtev);
        grandTotal += (expected.brojevi.otvaranja ?? 0) + (expected.brojevi.detalji ?? 0) + (expected.brojevi.zahtevi ?? 0);
      }
      expect(grandTotal).toBe(EVENTS);

      // --- The panel reads aggregates only -------------------------------------
      const from = dan(DAYS - 1);
      const period = { menuServiceId: A, danas: TODAY, od: from, do: TODAY };
      const read = async () => ({
        pregled: await measured(owner, (ctx) => ctx.runQuery(api.menuAnalytics.pregled, { menuServiceId: A, danas: TODAY, dana: 30 })),
        period: await measured(owner, (ctx) => ctx.runQuery(api.menuAnalytics.period, { ...period, poredi: true })),
        artikli: await measured(owner, (ctx) =>
          ctx.runQuery(api.menuAnalytics.raspodela, { ...period, metrika: "detalji", dimenzija: "artikal" }),
        ),
        kartice: await measured(owner, (ctx) =>
          ctx.runQuery(api.menuAnalytics.raspodela, { ...period, metrika: "otvaranja", dimenzija: "kartica" }),
        ),
      });
      const withEvents = await read();
      const pregledMs = await timed(() => owner.query(api.menuAnalytics.pregled, { menuServiceId: A, danas: TODAY, dana: 30 }));

      const report = must(withEvents.pregled.result);
      expect(report.dani).toEqual(days);
      for (const [metrika, key] of [
        ["otvaranja", "otvaranja"],
        ["detalji", "detalji"],
        ["zahtevi", "zahtevi"],
        ["porudzbine", "porudzbine"],
      ] as const) {
        expect(report.metrike[metrika].poDanu, metrika).toEqual(days.map((day) => tally.get(day)?.brojevi[key] ?? 0));
      }
      expect(report.metrike.skenovi).toMatchObject({ ukupno: 13 });
      // The top 10 articles: the sorted counts of all days, names from the menu.
      const perArticle = new Map<string, number>();
      for (const day of tally.values()) for (const [key, n] of Object.entries(day.artikal)) perArticle.set(key, (perArticle.get(key) ?? 0) + n);
      const top10 = [...perArticle.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 10);
      expect(report.najotvaraniji.map((row) => [row.artikal, row.broj])).toEqual(top10);
      expect(report.skenovi.map((row) => row.broj)).toEqual([9, 3, 1]);

      // One answer from the aggregates costs a few hundred documents, not thousands (the raw table is not read).
      for (const [name, call] of Object.entries(withEvents)) {
        expect(call.documentsRead, name).toBeLessThanOrEqual(450);
        expect(call.databaseQueries, name).toBeLessThanOrEqual(450);
      }

      // --- Delete every raw event: the same answers, bit for bit, at the same cost ----
      await deleteAllEvents(t);
      expect(await eventCount(t)).toBe(0);
      const withoutEvents = await read();
      for (const name of ["pregled", "period", "artikli", "kartice"] as const) {
        expect(JSON.stringify(withoutEvents[name].result), name).toBe(JSON.stringify(withEvents[name].result));
        expect(withoutEvents[name].documentsRead, name).toBe(withEvents[name].documentsRead);
        expect(withoutEvents[name].databaseQueries, name).toBe(withEvents[name].databaseQueries);
      }

      console.log(
        `[K33 B] ${EVENTS} events -> ${EVENTS / ZBIR_SERIJA} rollup transactions in ${rollupMs} ms | ` +
          `pregled ${withEvents.pregled.documentsRead} docs / ${withEvents.pregled.databaseQueries} queries / ${pregledMs.ms} ms | ` +
          `period ${withEvents.period.documentsRead} docs / ${withEvents.period.databaseQueries} queries | ` +
          `raspodela ${withEvents.artikli.documentsRead} + ${withEvents.kartice.documentsRead} docs | identical after deleting the raw events`,
      );
    },
  );

  test(
    "retencija deletes 10,000 events older than 90 days within one hour's chain",
    { timeout: 180_000 },
    async () => {
      const { t, w } = await analyticsWorld(T0 - 100 * DAY);
      vi.setSystemTime(T0 - 91 * DAY);
      await insertEvents(t, rawEvents(w.a.menuServiceId, [], EVENTS));
      expect(await eventCount(t)).toBe(EVENTS);
      vi.setSystemTime(T0);

      const start = clock();
      expect(await t.mutation(internal.menuAnalyticsRollup.retencija, {})).toMatchObject({ sirovi: RETENCIJA_SERIJA });
      await settle(t);
      const ms = Math.round(clock() - start);

      expect(await eventCount(t)).toBe(0);
      // 20 full batches of 500, then one more that finds nothing and ends the chain.
      expect(await pendingJobs(t)).toHaveLength(EVENTS / RETENCIJA_SERIJA);
      console.log(`[K33 B] retencija: ${EVENTS} old events deleted in ${EVENTS / RETENCIJA_SERIJA + 1} transactions, ${ms} ms`);
    },
  );

  test(
    "retencija reaches past the old ceiling of 10,500 deletions in one chain",
    { timeout: 180_000 },
    async () => {
      const { t, w } = await analyticsWorld(T0 - 100 * DAY);
      vi.setSystemTime(T0 - 91 * DAY);
      const count = 11_000;
      await insertEvents(t, rawEvents(w.a.menuServiceId, [], count));
      expect(await eventCount(t)).toBe(count);
      vi.setSystemTime(T0);

      await t.mutation(internal.menuAnalyticsRollup.retencija, {});
      await settle(t);

      // With the chain bound at MAX_NASTAVAKA (21 transactions) 500 events would be left.
      expect(await eventCount(t)).toBe(0);
    },
  );

  test("the capacity of each cron: retention can delete in an hour what the rollup sums in four runs", () => {
    const summedPerHour = 4 * ZBIR_SERIJA * (MAX_NASTAVAKA + 1);
    const deletedPerHour = RETENCIJA_SERIJA * (RETENCIJA_MAX_NASTAVAKA + 1);
    expect(deletedPerHour).toBeGreaterThanOrEqual(summedPerHour);
    expect(deletedPerHour).toBe(42_000);
    // One service per transaction, and the chain still reaches the 1,250 services of the old setting.
    expect(SKENOVI_USLUGA_PO_SERIJI).toBe(1);
    expect(SKENOVI_USLUGA_PO_SERIJI * (SKENOVI_MAX_NASTAVAKA + 1)).toBeGreaterThanOrEqual(1_250);
  });
});

// =============================================================================
// C. Scans: a venue with 300 cards
// =============================================================================

describe("C. scans, 3 services and 300 cards", () => {
  test(
    "skenovi moves yesterday's scans of all three services, one service per transaction, within the platform limits",
    { timeout: 180_000 },
    async () => {
      const { t, w } = await analyticsWorld(T0);
      const third = await t.run(
        async (ctx) =>
          await addVenueToAccount(ctx, { accountId: w.a.accountId, name: "Pomocni lokal", slug: "pomocni-lokal", actorUserId: w.adminId }),
      );
      const services = [
        { tenant: w.a, cards: await addMenuCards(t, w, w.a, 300) },
        { tenant: w.b, cards: await addMenuCards(t, w, w.b, 50) },
        { tenant: third, cards: await addMenuCards(t, w, third, 50) },
      ];
      const scansOf = (index: number) => (index % 7) + 1;
      for (const { cards } of services) {
        await addScans(t, cards, YESTERDAY, scansOf);
        // Today's scans are not moved: the panel reads them live.
        await addScans(t, cards, TODAY, () => 2);
      }
      await t.run(async (ctx) => {
        await ctx.db.insert("menuAnalyticsCursors", { kljuc: "skenovi", dan: dan(2), updatedAt: Date.now() });
      });

      // The first transaction takes the first service (300 cards): what it reads, per card.
      const start = clock();
      const first = await measured(t, (ctx) => ctx.runMutation(internal.menuAnalyticsRollup.skenovi, {}));
      expect(first.result).toEqual({ dan: YESTERDAY });
      expect((await cursorOf(t, "skenovi"))?.radniDan).toBe(YESTERDAY);
      expect(await totalsOf(t, w.b.menuServiceId, YESTERDAY)).toEqual({});
      await settle(t);
      const ms = Math.round(clock() - start);

      for (const { tenant, cards } of services) {
        const expected: Record<string, number> = {};
        for (const [index, cardId] of cards.entries()) expected[cardId] = scansOf(index);
        const sum = Object.values(expected).reduce((a, b) => a + b, 0);
        expect(await totalsOf(t, tenant.menuServiceId, YESTERDAY), String(tenant.menuServiceId)).toEqual({ skenovi: sum });
        expect((await dimsOf(t, tenant.menuServiceId, YESTERDAY)).skenovi?.kartica).toEqual(expected);
        expect(await totalsOf(t, tenant.menuServiceId, TODAY)).toEqual({});
      }
      const cursor = await cursorOf(t, "skenovi");
      expect(cursor?.dan).toBe(YESTERDAY);
      expect(cursor?.radniDan).toBeUndefined();
      expect(cursor?.stranica).toBeUndefined();
      // Three services, one per transaction: the manual run and two continuations.
      expect(await pendingJobs(t)).toHaveLength(2);

      // The ceiling check: even a venue at MENU_MAX_QR_CARDS, with every card adopted by an access
      // channel (two more reads each), fits one transaction with room to spare; five such venues would not.
      const perCard = first.databaseQueries / 300;
      const worstTransaction = (perCard + 2) * MENU_MAX_QR_CARDS;
      expect(first.databaseQueries).toBeLessThan(1_500);
      expect(SKENOVI_USLUGA_PO_SERIJI * worstTransaction).toBeLessThan(4_096);
      expect(5 * worstTransaction).toBeGreaterThan(4_096);

      console.log(
        `[K33 C] 3 services (300 + 50 + 50 cards): first transaction (300 cards) ${first.documentsRead} docs / ${first.databaseQueries} queries ` +
          `(${perCard.toFixed(2)} per card), chain ${ms} ms; worst case ${SKENOVI_USLUGA_PO_SERIJI} x ${MENU_MAX_QR_CARDS} adopted cards = ${worstTransaction} queries`,
      );
    },
  );

  test("a chain cut at its bound is continued by the next hourly run where it stopped, and nothing is counted twice", { timeout: 180_000 }, async () => {
    const { t, w } = await analyticsWorld(T0);
    const third = await t.run(
      async (ctx) =>
        await addVenueToAccount(ctx, { accountId: w.a.accountId, name: "Pomocni lokal", slug: "pomocni-lokal", actorUserId: w.adminId }),
    );
    const tenants = [w.a, w.b, third];
    const cards = [await addMenuCards(t, w, w.a, 3), await addMenuCards(t, w, w.b, 3), await addMenuCards(t, w, third, 3)];
    for (const group of cards) await addScans(t, group, YESTERDAY, (index) => index + 1);
    await t.run(async (ctx) => {
      await ctx.db.insert("menuAnalyticsCursors", { kljuc: "skenovi", dan: dan(2), updatedAt: Date.now() });
    });
    const sixScans = { skenovi: 6 };

    // The run that reaches the bound moves one service and schedules nothing more.
    expect(await t.mutation(internal.menuAnalyticsRollup.skenovi, { nastavak: SKENOVI_MAX_NASTAVAKA })).toEqual({ dan: YESTERDAY });
    expect(await pendingJobs(t)).toHaveLength(0);
    const midway = must(await cursorOf(t, "skenovi"));
    expect(midway.radniDan).toBe(YESTERDAY);
    expect(typeof midway.stranica).toBe("string");
    expect(await totalsOf(t, tenants[0].menuServiceId, YESTERDAY)).toEqual(sixScans);
    expect(await totalsOf(t, tenants[1].menuServiceId, YESTERDAY)).toEqual({});

    // An hour later the cron starts a fresh chain and continues with the second service, then the third.
    vi.setSystemTime(Date.now() + HOUR);
    expect(await t.mutation(internal.menuAnalyticsRollup.skenovi, {})).toEqual({ dan: YESTERDAY });
    await settle(t);
    for (const tenant of tenants) expect(await totalsOf(t, tenant.menuServiceId, YESTERDAY)).toEqual(sixScans);
    const done = must(await cursorOf(t, "skenovi"));
    expect(done.dan).toBe(YESTERDAY);
    expect(done.radniDan).toBeUndefined();
    expect(done.stranica).toBeUndefined();
    expect(await t.mutation(internal.menuAnalyticsRollup.skenovi, {})).toEqual({ dan: null });
    for (const tenant of tenants) expect(await totalsOf(t, tenant.menuServiceId, YESTERDAY)).toEqual(sixScans);
  });
});
