/// <reference types="vite/client" />

// ScanMe Menu V1 — K29: analytics (master §14; docs/menu/ANALITIKA-DEFINICIJE.md).
// The tag in brackets at the start of a test name is the rule of the document
// the test proves (`npx vitest run convex/menuAnalytics.test.ts -t "otvaranja"`).
//
// Proven here: the opens and their daily series for 7 and 30 days (zero-filled,
// oldest first, today last), the detail opens and the top articles (names from
// the live menu, a removed article left out, at most 10), the server events
// written by the REAL request and reservation writers and what the queries
// make of them, the card scans (aggregated days plus today's live ones), the
// session reliability rule (95%), the plan gate, the period rules, the
// comparison and the rule of 20, the breakdowns (names, at most 20 values and
// the rest in `ostalo`) and the tenant boundary. The cron's two-minute guard
// and its "never twice" rule are shown on the way.
//
// Time is frozen (fake timers, T0 = Wednesday 2026-10-21 12:00 in Belgrade);
// the device sends its own day (`danas`), so the queries never read the clock,
// but the rollup does (events younger than two minutes wait), so the tests move
// the clock with vi.setSystemTime. Fictional tenants only (the repo is public):
// "Kafana kod Mike" (a), "Demo restoran" (b). The helpers are copied from
// convex/menuPanelHome.test.ts and convex/menuGuestRequests.test.ts on purpose
// (a test file is not a module to import from).

import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { zabeleziDogadjaj } from "./lib/menuAnalytics";
import { applyRequestAction, type RequestActorDoc } from "./lib/menuRequests";
import { applyReservationAction, type ReservationActorDoc } from "./lib/menuReservationWriter";
import type { GuestRequestOutcome } from "./menuGuest";
import schema from "./schema";
import type { Dimenzija, Metrika } from "../lib/menu/analitika/definicije";
import { ANALYTICS_ERROR } from "../lib/menu/errors/analytics";
import { MENU_PLAN_ERROR } from "../lib/menu/errors/plan";
import { REQUEST_ERROR } from "../lib/menu/errors/requests";
import type { RequestAction } from "../lib/menu/request-status";
import type { ReservationAction } from "../lib/menu/reservation-status";
import { addDays } from "../lib/menu/working-hours";
import {
  SLUG_A,
  TEST_ADMIN_EMAIL,
  TEST_ISSUER,
  grantAccountPremium,
  seedMenuWorld,
  seedQrLink,
  type MenuTenantSeed,
  type MenuWorldSeed,
} from "../lib/menu/testkit/seed";

const modules = import.meta.glob("./**/*.ts");

beforeEach(() => {
  process.env.SCANME_ADMIN_EMAILS = TEST_ADMIN_EMAIL;
});

afterEach(() => {
  vi.useRealTimers();
});

const newTest = () => {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  return t;
};
type T = ReturnType<typeof newTest>;
type Caller = Pick<T, "query" | "mutation">;

function as(t: T, userId: Id<"users">) {
  return t.withIdentity({ subject: userId, issuer: TEST_ISSUER });
}

function must<V>(value: V | null | undefined, what = "value"): V {
  if (value === null || value === undefined) throw new Error(`expected ${what}, got ${String(value)}`);
  return value;
}

const T0 = Date.UTC(2026, 9, 21, 10, 0, 0); // Wednesday 12:00 in Belgrade (CEST)
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
/** The device's Belgrade day at T0. */
const DANAS = "2026-10-21";
/** The Belgrade day `back` days before today. */
const dan = (back: number) => addDays(DANAS, -back);
/** Oldest first: the value of each `daysAgo` that has one, else 0. */
const series = (length: number, byDaysAgo: Record<number, number>) =>
  Array.from({ length }, (_, index) => byDaysAgo[length - 1 - index] ?? 0);
/** Day keys of the last `length` days, oldest first. */
const lastDays = (length: number) => Array.from({ length }, (_, index) => dan(length - 1 - index));

/** Valid key shapes (alphabet 0123456789abcdefghjkmnpqrstvwxyz). */
const PAGE = "pg_5k2m9q0x7c1d";
const articleKey = (n: number) => `ar_5k2m9q0x7c${String(n).padStart(2, "0")}`;
const ARTICLE = articleKey(1);
/** The pseudonym of the guest's phone: it must never reach an analytics event. */
const GUEST_DEVICE = "guest-device-pseudonym-6f2c1a";
const IP = "0123456789abcdef0123456789abcdef";

// -----------------------------------------------------------------------------
// World and callers
// -----------------------------------------------------------------------------

async function world() {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  const t = newTest();
  const w: MenuWorldSeed = await t.run(async (ctx) => await seedMenuWorld(ctx));
  return { t, w };
}
type Env = Awaited<ReturnType<typeof world>>;

async function premium(env: Env, tenant: "a" | "b" | "both" = "a") {
  await env.t.run(async (ctx) => {
    if (tenant !== "b") await grantAccountPremium(ctx, { accountId: env.w.a.accountId, via: "plan" });
    if (tenant !== "a") await grantAccountPremium(ctx, { accountId: env.w.b.accountId, via: "plan" });
  });
}

type Who = "owner" | "manager" | "admin" | "editor" | "finance" | "viewOnly" | "outsider" | "otherOwner" | "anonymous";

function callers(env: Env): Record<Who, Caller> {
  const { t, w } = env;
  return {
    owner: as(t, w.ownerId),
    manager: as(t, w.managerId),
    admin: as(t, w.adminId),
    editor: as(t, w.editorId),
    finance: as(t, w.financeId),
    viewOnly: as(t, w.viewOnlyId),
    outsider: as(t, w.outsiderId),
    otherOwner: as(t, w.otherOwnerId),
    anonymous: t,
  };
}

const pregled = (who: Caller, menuServiceId: Id<"menuServices">, dana: 7 | 30 = 7, danas: string = DANAS) =>
  who.query(api.menuAnalytics.pregled, { menuServiceId, danas, dana });

const periodOf = (
  who: Caller,
  menuServiceId: Id<"menuServices">,
  od: string,
  doDana: string,
  poredi = false,
  danas: string = DANAS,
) => who.query(api.menuAnalytics.period, { menuServiceId, danas, od, do: doDana, poredi });

const raspodelaOf = (
  who: Caller,
  menuServiceId: Id<"menuServices">,
  od: string,
  doDana: string,
  metrika: Metrika,
  dimenzija: Dimenzija,
  danas: string = DANAS,
) => who.query(api.menuAnalytics.raspodela, { menuServiceId, danas, od, do: doDana, metrika, dimenzija });

// -----------------------------------------------------------------------------
// Raw events, daily rows, the rollup
// -----------------------------------------------------------------------------

type EventKind = Doc<"menuAnalyticsEvents">["vrsta"];
type RawFields = Partial<
  Omit<Doc<"menuAnalyticsEvents">, "_id" | "_creationTime" | "menuServiceId" | "vrsta" | "occurredAt" | "dayKey" | "sat">
>;
const PAGE_OPEN: RawFields = { stranica: PAGE, uredjaj: "telefon", jezik: "sr" };

/** `count` raw events of one kind, received `daysAgo` days before T0 (Belgrade noon of that day). */
async function addEvents(
  t: T,
  menuServiceId: Id<"menuServices">,
  vrsta: EventKind,
  daysAgo: number,
  count: number,
  fields: RawFields | ((index: number) => RawFields) = {},
) {
  await t.run(async (ctx) => {
    for (let index = 0; index < count; index += 1) {
      await ctx.db.insert("menuAnalyticsEvents", {
        menuServiceId,
        vrsta,
        occurredAt: T0 - daysAgo * DAY + index * 1000,
        dayKey: dan(daysAgo),
        sat: 12,
        ...(typeof fields === "function" ? fields(index) : fields),
      });
    }
  });
}

const eventsOf = (t: T, menuServiceId: Id<"menuServices">) =>
  t.run(async (ctx) => {
    const rows = await ctx.db.query("menuAnalyticsEvents").collect();
    return rows.filter((row) => row.menuServiceId === menuServiceId);
  });

/** Moves the clock past the two-minute guard and runs the events rollup once. */
async function rollup(t: T) {
  vi.setSystemTime(Date.now() + 3 * MINUTE);
  return await t.mutation(internal.menuAnalyticsRollup.zbir, {});
}

type Totals = Record<string, number>;
type Breakdown = Record<string, Record<string, Record<string, number>>>;

/** Writes (replaces) the daily totals row of one service and day, and its breakdown row when given. */
async function setDaily(t: T, menuServiceId: Id<"menuServices">, dayKey: string, brojevi: Totals, po?: Breakdown) {
  await t.run(async (ctx) => {
    const now = Date.now();
    const totals = await ctx.db
      .query("menuAnalyticsDaily")
      .withIndex("by_menuServiceId_and_dayKey", (q) => q.eq("menuServiceId", menuServiceId).eq("dayKey", dayKey))
      .unique();
    if (totals) await ctx.db.replace(totals._id, { menuServiceId, dayKey, brojevi, updatedAt: now });
    else await ctx.db.insert("menuAnalyticsDaily", { menuServiceId, dayKey, brojevi, updatedAt: now });
    if (!po) return;
    const dims = await ctx.db
      .query("menuAnalyticsDailyDims")
      .withIndex("by_menuServiceId_and_dayKey", (q) => q.eq("menuServiceId", menuServiceId).eq("dayKey", dayKey))
      .unique();
    if (dims) await ctx.db.replace(dims._id, { menuServiceId, dayKey, po, updatedAt: now });
    else await ctx.db.insert("menuAnalyticsDailyDims", { menuServiceId, dayKey, po, updatedAt: now });
  });
}

async function addArticle(t: T, menuServiceId: Id<"menuServices">, key: string, name: string) {
  await t.run(async (ctx) => {
    const now = Date.now();
    await ctx.db.insert("menuArticles", {
      menuServiceId,
      key,
      kind: "item",
      name,
      nameNormalized: name.toLowerCase(),
      mediaMode: "none",
      createdAt: now,
      updatedAt: now,
    });
  });
}

// -----------------------------------------------------------------------------
// Cards and scans
// -----------------------------------------------------------------------------

/** A Menu card of one tenant with its label (card codes avoid I, L, O and U). */
async function addCard(t: T, tenant: MenuTenantSeed, createdByUserId: Id<"users">, cardCode: string, label: string) {
  return await t.run(async (ctx) => {
    const seeded = await seedQrLink(ctx, {
      menuServiceId: tenant.menuServiceId,
      businessId: tenant.businessId,
      pageKey: PAGE,
      createdByUserId,
      cardCode,
    });
    await ctx.db.patch(seeded.cardId, { label });
    return seeded.cardId;
  });
}

/** What the card resolver's rollup holds for one card and day. */
async function addScans(t: T, cardId: Id<"cards">, dateKey: string, scans: number) {
  await t.run(async (ctx) => {
    await ctx.db.insert("dailyCardMetrics", { cardId, dateKey, scans, updatedAt: Date.now() });
  });
}

async function setScanCursor(t: T, fields: { dan?: string; radniDan?: string; stranica?: string }) {
  await t.run(async (ctx) => {
    await ctx.db.insert("menuAnalyticsCursors", { kljuc: "skenovi", ...fields, updatedAt: Date.now() });
  });
}

async function scanWorld() {
  const env = await world();
  const { t, w } = env;
  const c1 = await addCard(t, w.a, w.adminId, "AN000001", "Terasa 1");
  const c2 = await addCard(t, w.a, w.adminId, "AN000002", "Bašta 2");
  const cb = await addCard(t, w.b, w.adminId, "AN000003", "Demo sto");
  return { ...env, c1, c2, cb };
}

// -----------------------------------------------------------------------------
// Requests and reservations (what the guest would have written, then the REAL writers)
// -----------------------------------------------------------------------------

type Table = {
  tenant: MenuTenantSeed;
  positionId: Id<"menuPositions">;
  guestSessionId: Id<"menuGuestSessions">;
  label: string;
};

let keyCounter = 0;

async function addTable(t: T, tenant: MenuTenantSeed, label = "Sto 12"): Promise<Table> {
  keyCounter += 1;
  return await t.run(async (ctx) => {
    const now = Date.now();
    const menuServiceId = tenant.menuServiceId;
    const positionId = await ctx.db.insert("menuPositions", {
      menuServiceId,
      key: `ps_test${keyCounter}`,
      kind: "table",
      label,
      labelNormalized: label.toLowerCase(),
      order: 0,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    const guestSessionId = await ctx.db.insert("menuGuestSessions", {
      menuServiceId,
      tokenHash: `guest-token-hash-${keyCounter}`,
      deviceKeyHash: GUEST_DEVICE,
      positionId,
      createdAt: now,
      lastSeenAt: now,
      expiresAt: now + 3 * HOUR,
    });
    return { tenant, positionId, guestSessionId, label };
  });
}

type RequestKind = Doc<"menuRequests">["kind"];
type RequestChannel = Doc<"menuRequests">["channel"];

/** A new request row and its `zahtev_poslat` event, as menuGuest.insertRequest writes them. */
async function sendRequest(t: T, table: Table, kind: RequestKind, channel: RequestChannel = "standard") {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const requestId = await ctx.db.insert("menuRequests", {
      menuServiceId: table.tenant.menuServiceId,
      businessId: table.tenant.businessId,
      kind,
      status: "new",
      channel,
      positionId: table.positionId,
      positionLabel: table.label,
      positionKind: "table",
      guestSessionId: table.guestSessionId,
      deviceKeyHash: GUEST_DEVICE,
      createdAt: now,
      updatedAt: now,
    });
    await zabeleziDogadjaj(ctx, table.tenant.menuServiceId, { vrsta: "zahtev_poslat", zahtev: kind, kanal: channel }, now);
    return requestId;
  });
}

/** The REAL status writer (applyRequestAction), on the current row. */
async function actOnRequest(t: T, requestId: Id<"menuRequests">, action: RequestAction, actor: RequestActorDoc) {
  return await t.run(async (ctx) => {
    const request = await ctx.db.get(requestId);
    if (!request) throw new Error("request missing");
    return await applyRequestAction(ctx, request, action, actor, Date.now());
  });
}

async function addReservation(t: T, tenant: MenuTenantSeed) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const reservationId = await ctx.db.insert("menuReservations", {
      menuServiceId: tenant.menuServiceId,
      businessId: tenant.businessId,
      status: "new",
      guestName: "Marija Gost",
      partySize: 4,
      requestedAt: T0 + DAY,
      contactPhone: "+381 60 000 0000",
      cancelTokenHash: `cancel-token-hash-${keyCounter++}`,
      deviceKeyHash: GUEST_DEVICE,
      createdAt: now,
      updatedAt: now,
    });
    // menuReservations.submit writes this event with the new row.
    await zabeleziDogadjaj(ctx, tenant.menuServiceId, { vrsta: "rezervacija_poslata" }, now);
    return reservationId;
  });
}

/** The REAL reservation status writer (applyReservationAction), on the current row. */
async function actOnReservation(
  t: T,
  reservationId: Id<"menuReservations">,
  action: ReservationAction,
  actor: ReservationActorDoc,
) {
  return await t.run(async (ctx) => {
    const reservation = await ctx.db.get(reservationId);
    if (!reservation) throw new Error("reservation missing");
    const proposal = action === "propose" ? { proposedAt: T0 + 2 * DAY, proposalNote: "Slobodan je sto u 20:00" } : undefined;
    return await applyReservationAction(ctx, reservation, action, actor, Date.now(), proposal);
  });
}

// =============================================================================
// otvaranja, trend
// =============================================================================

describe("otvaranja i trend", () => {
  test("[otvaranja] [trend] pregled 7 days: total and one entry per day, oldest first, zeros for empty days, today last; days outside are not counted", async () => {
    const { t, w } = await world();
    const service = w.a.menuServiceId;
    await addEvents(t, service, "stranica", 0, 3, PAGE_OPEN);
    await addEvents(t, service, "stranica", 2, 2, PAGE_OPEN);
    await addEvents(t, service, "stranica", 6, 1, PAGE_OPEN);
    await addEvents(t, service, "stranica", 7, 4, PAGE_OPEN); // the day before the window
    await addEvents(t, service, "stranica", 30, 6, PAGE_OPEN);
    await rollup(t);

    const week = must(await pregled(as(t, w.ownerId), service, 7));
    expect(week.period).toEqual({ od: dan(6), do: DANAS, dana: 7 });
    expect(week.dani).toEqual(lastDays(7));
    expect(week.metrike.otvaranja).toEqual({ ukupno: 6, poDanu: [1, 0, 0, 0, 2, 0, 3] });
    expect(week.metrike.otvaranja.poDanu).toHaveLength(7);
    // Today is the last entry.
    expect(week.dani[6]).toBe(DANAS);
    expect(week.metrike.otvaranja.poDanu[6]).toBe(3);
  });

  test("[otvaranja] [trend] pregled 30 days: 30 entries, the window ends at today and starts 29 days back", async () => {
    const { t, w } = await world();
    const service = w.a.menuServiceId;
    const counts = { 0: 3, 2: 2, 6: 1, 7: 4, 29: 5, 30: 6, 31: 8 };
    for (const [daysAgo, count] of Object.entries(counts)) {
      await addEvents(t, service, "stranica", Number(daysAgo), count, PAGE_OPEN);
    }
    await rollup(t);

    const month = must(await pregled(as(t, w.ownerId), service, 30));
    expect(month.period).toEqual({ od: dan(29), do: DANAS, dana: 30 });
    expect(month.dani).toEqual(lastDays(30));
    expect(month.metrike.otvaranja.poDanu).toHaveLength(30);
    // 30 and 31 days back are outside; 29 days back is the first day of the window.
    expect(month.metrike.otvaranja).toEqual({
      ukupno: 3 + 2 + 1 + 4 + 5,
      poDanu: series(30, { 0: 3, 2: 2, 6: 1, 7: 4, 29: 5 }),
    });
    expect(month.metrike.otvaranja.poDanu[0]).toBe(5);
    expect(month.metrike.otvaranja.poDanu[29]).toBe(3);
  });

  test("[otvaranja] [trend] a service without events has a zero-filled series for every metric; a detail click is not an opening", async () => {
    const { t, w } = await world();
    const service = w.a.menuServiceId;
    const owner = as(t, w.ownerId);

    const empty = must(await pregled(owner, service, 7));
    for (const [metrika, niz] of Object.entries(empty.metrike)) {
      expect(niz, metrika).toEqual({ ukupno: 0, poDanu: [0, 0, 0, 0, 0, 0, 0] });
    }
    expect(empty.najotvaraniji).toEqual([]);
    expect(empty.skenovi).toEqual([]);
    expect(empty.sesije).toEqual({ broj: null, pokrivenost: null });
    expect(empty.konverzije).toBeNull();
    expect(empty.prethodni).toBeNull();

    await addEvents(t, service, "stranica", 1, 2, PAGE_OPEN);
    await addEvents(t, service, "detalj", 0, 4, { stranica: PAGE, artikal: ARTICLE });
    await rollup(t);
    const week = must(await pregled(owner, service, 7));
    expect(week.metrike.otvaranja.ukupno).toBe(2);
    expect(week.metrike.detalji).toEqual({ ukupno: 4, poDanu: [0, 0, 0, 0, 0, 0, 4] });
  });
});

describe("zbir", () => {
  test("[zbir] events wait for the two-minute guard, are summed once and never counted twice", async () => {
    const { t, w } = await world();
    const service = w.a.menuServiceId;
    const owner = as(t, w.ownerId);
    await addEvents(t, service, "stranica", 0, 3, PAGE_OPEN);

    // Younger than two minutes: left for the next run.
    vi.setSystemTime(T0 + MINUTE);
    expect(await t.mutation(internal.menuAnalyticsRollup.zbir, {})).toEqual({ obradjeno: 0, jos: false });
    expect(must(await pregled(owner, service)).metrike.otvaranja.ukupno).toBe(0);

    vi.setSystemTime(T0 + 3 * MINUTE);
    expect(await t.mutation(internal.menuAnalyticsRollup.zbir, {})).toEqual({ obradjeno: 3, jos: false });
    expect(must(await pregled(owner, service)).metrike.otvaranja.ukupno).toBe(3);

    // Run again: the cursor moved in the same transaction, so nothing is counted twice.
    expect(await rollup(t)).toEqual({ obradjeno: 0, jos: false });
    expect(must(await pregled(owner, service)).metrike.otvaranja.ukupno).toBe(3);

    // A later event is added on top.
    await addEvents(t, service, "stranica", 0, 2, PAGE_OPEN);
    expect(await rollup(t)).toEqual({ obradjeno: 2, jos: false });
    expect(must(await pregled(owner, service)).metrike.otvaranja.ukupno).toBe(5);
  });
});

// =============================================================================
// detalji, najotvaraniji
// =============================================================================

describe("detalji", () => {
  test("[detalji] [najotvaraniji] top articles sorted by count with names from menuArticles; an article that is no longer in the menu is left out", async () => {
    const { t, w } = await world();
    const service = w.a.menuServiceId;
    const [salata, pita, burek, removed] = [articleKey(1), articleKey(2), articleKey(3), articleKey(4)];
    await addArticle(t, service, salata, "Cezar salata");
    await addArticle(t, service, pita, "Pita sa sirom");
    await addArticle(t, service, burek, "Burek");
    // `removed` has no menuArticles row and the most clicks of all.
    const clicks: [string, number][] = [[salata, 5], [pita, 3], [burek, 3], [removed, 9]];
    for (const [artikal, count] of clicks) {
      await addEvents(t, service, "detalj", 0, count, { stranica: PAGE, artikal, jezik: "sr", uredjaj: "telefon" });
    }
    // Clicks outside the window (30 days back) are not counted.
    await addEvents(t, service, "detalj", 40, 7, { stranica: PAGE, artikal: burek });
    await addEvents(t, service, "detalj", 10, 7, { stranica: PAGE, artikal: burek });
    await rollup(t);

    const week = must(await pregled(as(t, w.ownerId), service, 7));
    expect(week.metrike.detalji.ukupno).toBe(5 + 3 + 3 + 9);
    // Ties are broken by the article key.
    expect(week.najotvaraniji).toEqual([
      { artikal: salata, naziv: "Cezar salata", broj: 5 },
      { artikal: pita, naziv: "Pita sa sirom", broj: 3 },
      { artikal: burek, naziv: "Burek", broj: 3 },
    ]);
    expect(week.najotvaraniji.map((row) => row.artikal)).not.toContain(removed);

    const month = must(await pregled(as(t, w.ownerId), service, 30));
    expect(month.najotvaraniji.map((row) => [row.artikal, row.broj])).toEqual([
      [burek, 10],
      [salata, 5],
      [pita, 3],
    ]);
  });

  test("[detalji] [najotvaraniji] at most 10 articles", async () => {
    const { t, w } = await world();
    const service = w.a.menuServiceId;
    for (let n = 1; n <= 13; n += 1) {
      await addArticle(t, service, articleKey(n), `Jelo ${n}`);
      await addEvents(t, service, "detalj", 0, 14 - n, { stranica: PAGE, artikal: articleKey(n) });
    }
    await rollup(t);

    const week = must(await pregled(as(t, w.ownerId), service, 7));
    expect(week.najotvaraniji).toHaveLength(10);
    expect(week.najotvaraniji[0]).toEqual({ artikal: articleKey(1), naziv: "Jelo 1", broj: 13 });
    expect(week.najotvaraniji[9]).toEqual({ artikal: articleKey(10), naziv: "Jelo 10", broj: 4 });
    expect(week.najotvaraniji.map((row) => row.artikal)).not.toContain(articleKey(11));
    // The total still counts every click.
    expect(week.metrike.detalji.ukupno).toBe((13 * 14) / 2);
  });
});

// =============================================================================
// zahtevi, ishodi
// =============================================================================

describe("zahtevi i ishodi", () => {
  test("[zahtevi] [ishodi] server events end to end: the real writers, then the rollup and the queries", async () => {
    const { t, w } = await world();
    const service = w.a.menuServiceId;
    const table = await addTable(t, w.a);
    const staff: RequestActorDoc = { kind: "user", userId: w.ownerId };
    const guest: RequestActorDoc = { kind: "guest" };

    // call 1: accepted, then finished
    const call1 = await sendRequest(t, table, "call");
    await actOnRequest(t, call1, "accept", staff);
    await actOnRequest(t, call1, "done", staff);
    // call 2: finished straight from new (counts as accepted too)
    const call2 = await sendRequest(t, table, "call");
    expect(await actOnRequest(t, call2, "done", staff)).toEqual({ ok: true, status: "done", changed: true });
    // bill 1: cancelled by the guest while new
    const bill1 = await sendRequest(t, table, "bill");
    await actOnRequest(t, bill1, "cancel", guest);
    // bill 2: accepted, then cancelled by the staff
    const bill2 = await sendRequest(t, table, "bill");
    await actOnRequest(t, bill2, "accept", staff);
    await actOnRequest(t, bill2, "cancel", staff);
    // order 1 on the standard pages: accepted and finished
    const order1 = await sendRequest(t, table, "order", "standard");
    await actOnRequest(t, order1, "accept", staff);
    await actOnRequest(t, order1, "done", staff);
    // order 2 on Room service: cancelled by the staff while new
    const order2 = await sendRequest(t, table, "order", "room_service");
    await actOnRequest(t, order2, "cancel", staff);

    expect(await eventsOf(t, service)).toHaveLength(16);
    // Nothing is summed before the two-minute guard has passed.
    expect(await t.mutation(internal.menuAnalyticsRollup.zbir, {})).toEqual({ obradjeno: 0, jos: false });
    expect(await rollup(t)).toEqual({ obradjeno: 16, jos: false });

    const week = must(await pregled(as(t, w.ownerId), service, 7));
    expect(week.zahtevi).toEqual({
      call: { poslato: 2, prihvaceno: 2, zavrseno: 2, otkazano: 0 },
      bill: { poslato: 2, prihvaceno: 1, zavrseno: 0, otkazano: 2 },
      order: { poslato: 2, prihvaceno: 1, zavrseno: 1, otkazano: 1 },
    });
    expect(week.zahteviOtkazao).toEqual({ gost: 1, osoblje: 2 });
    expect(week.porudzbinePoKanalu).toEqual({ standard: 1, roomService: 1 });
    expect(week.metrike.zahtevi.ukupno).toBe(6);
    expect(week.metrike.porudzbine.ukupno).toBe(2);
    expect(week.metrike.zahteviPrihvaceni.ukupno).toBe(4);
    expect(week.metrike.zahteviZavrseni.ukupno).toBe(3);
    expect(week.metrike.zahteviOtkazani.ukupno).toBe(3);
    // The outcomes are counted on the day of the transition: today, the last entry.
    expect(week.metrike.zahtevi.poDanu).toEqual([0, 0, 0, 0, 0, 0, 6]);
    expect(week.metrike.zahteviZavrseni.poDanu).toEqual([0, 0, 0, 0, 0, 0, 3]);

    // The other venue sees none of it.
    const other = must(await pregled(as(t, w.otherOwnerId), w.b.menuServiceId, 7));
    expect(other.metrike.zahtevi.ukupno).toBe(0);
    expect(other.zahtevi.call).toEqual({ poslato: 0, prihvaceno: 0, zavrseno: 0, otkazano: 0 });
  });

  test("[zahtevi] [ishodi] a transition that changes nothing, and a refused one, write no event; events carry no personal data", async () => {
    const { t, w } = await world();
    const service = w.a.menuServiceId;
    const table = await addTable(t, w.a);
    const owner: RequestActorDoc = { kind: "user", userId: w.ownerId };
    const manager: RequestActorDoc = { kind: "user", userId: w.managerId };
    const guest: RequestActorDoc = { kind: "guest" };

    const call = await sendRequest(t, table, "call");
    expect(await actOnRequest(t, call, "accept", owner)).toMatchObject({ ok: true, status: "accepted", changed: true });
    // The same person accepts again: nothing changes.
    expect(await actOnRequest(t, call, "accept", owner)).toMatchObject({ ok: true, status: "accepted", changed: false });
    // Someone else cannot take it; a guest cannot cancel an accepted request.
    expect(await actOnRequest(t, call, "accept", manager)).toEqual({ ok: false, code: REQUEST_ERROR.requestTaken });
    expect(await actOnRequest(t, call, "cancel", guest)).toMatchObject({ ok: false });
    expect(await actOnRequest(t, call, "done", owner)).toMatchObject({ ok: true, status: "done", changed: true });
    // Repeating done changes nothing; nothing leaves a finished request.
    expect(await actOnRequest(t, call, "done", owner)).toMatchObject({ ok: true, status: "done", changed: false });
    expect(await actOnRequest(t, call, "cancel", owner)).toMatchObject({ ok: false });
    expect(await actOnRequest(t, call, "cancel", guest)).toMatchObject({ ok: false });
    expect(await actOnRequest(t, call, "accept", owner)).toMatchObject({ ok: false });

    const bill = await sendRequest(t, table, "bill");
    expect(await actOnRequest(t, bill, "cancel", owner)).toMatchObject({ ok: true, status: "cancelled", changed: true });
    expect(await actOnRequest(t, bill, "cancel", owner)).toMatchObject({ ok: true, changed: false });
    expect(await actOnRequest(t, bill, "cancel", guest)).toMatchObject({ ok: true, changed: false });

    const events = await eventsOf(t, service);
    expect(events.map((row) => row.vrsta)).toEqual([
      "zahtev_poslat",
      "zahtev_prihvacen",
      "zahtev_zavrsen",
      "zahtev_poslat",
      "zahtev_otkazan",
    ]);
    expect(events[4]).toMatchObject({ zahtev: "bill", kanal: "standard", ko: "staff" });
    // Only the fields of the analytics event; never the device pseudonym, a name or a token.
    const allowed = new Set([
      "_id",
      "_creationTime",
      "menuServiceId",
      "vrsta",
      "occurredAt",
      "dayKey",
      "sat",
      "zahtev",
      "kanal",
      "kartica",
      "ko",
    ]);
    for (const event of events) {
      expect(Object.keys(event).filter((key) => !allowed.has(key))).toEqual([]);
    }
    expect(JSON.stringify(events)).not.toContain(GUEST_DEVICE);

    await rollup(t);
    const week = must(await pregled(as(t, w.ownerId), service, 7));
    expect(week.zahtevi.call).toEqual({ poslato: 1, prihvaceno: 1, zavrseno: 1, otkazano: 0 });
    expect(week.zahtevi.bill).toEqual({ poslato: 1, prihvaceno: 0, zavrseno: 0, otkazano: 1 });
  });

  test("[zahtevi] [ishodi] the guest's real call: a new request counts once, a deduped repeat does not, the guest's cancellation counts; per card and per Belgrade hour", async () => {
    const { t, w } = await world();
    const service = w.a.menuServiceId;
    const owner = as(t, w.ownerId);

    // Content, the switch, a publication, a table with a card and a phone that scanned it
    // (the pattern of convex/menuGuestRequests.test.ts).
    const section = await owner.mutation(api.menuCatalog.addSection, { pageId: w.a.defaultPageId, name: "Pića" });
    const added = await owner.mutation(api.menuCatalog.quickAddArticle, {
      sectionId: section.sectionId,
      name: "Jelen pivo",
      priceRsd: 200,
    });
    expect(added.status).toBe("created");
    await owner.mutation(api.menuServices.setFeature, { menuServiceId: service, feature: "callWaiter", enabled: true });
    const preview = must(await owner.query(api.menuPublishing.publishPreview, { menuServiceId: service }));
    const published = await owner.mutation(api.menuPublishing.publish, {
      menuServiceId: service,
      expectedRevision: preview.revision,
      acknowledgedWarnings: preview.fingerprint,
    });
    expect(published.ok).toBe(true);
    const positionId = await t.run(async (ctx) => {
      const now = Date.now();
      return await ctx.db.insert("menuPositions", {
        menuServiceId: service,
        key: "ps_analytics1",
        kind: "table",
        label: "Sto 12",
        labelNormalized: "sto 12",
        order: 0,
        active: true,
        createdAt: now,
        updatedAt: now,
      });
    });
    const cardCode = "AN00000G";
    const { cardId } = await t.run(async (ctx) => {
      const seeded = await seedQrLink(ctx, {
        menuServiceId: service,
        businessId: w.a.businessId,
        pageKey: "unused",
        createdByUserId: w.adminId,
        cardCode,
      });
      await ctx.db.patch(seeded.linkId, { pageKey: undefined, positionId });
      return seeded;
    });
    const hop = await t.mutation(api.menuGuest.mintFromCard, { cardCode, ipHash: IP });
    if (hop.kind !== "menu" || !hop.session) throw new Error(`expected a session, got ${JSON.stringify(hop)}`);
    const { guestToken, deviceToken } = hop.session;

    const okOutcome = (outcome: GuestRequestOutcome) => {
      if (!outcome.ok) throw new Error(`expected ok, got ${JSON.stringify(outcome)}`);
      return outcome;
    };
    const call = () => t.mutation(api.menuGuest.callWaiter, { slug: SLUG_A, guestToken, ipHash: IP });

    const first = okOutcome(await call());
    expect(first.deduped).toBe(false);
    const again = okOutcome(await call());
    expect(again.deduped).toBe(true);
    const cancelled = await t.mutation(api.menuGuest.cancelRequest, {
      slug: SLUG_A,
      deviceToken,
      requestId: must(first.requestId),
      ipHash: IP,
    });
    expect(cancelled).toEqual({ ok: true, status: "cancelled" });
    const second = okOutcome(await call());
    expect(second.deduped).toBe(false);

    expect((await eventsOf(t, service)).map((row) => row.vrsta)).toEqual([
      "zahtev_poslat",
      "zahtev_otkazan",
      "zahtev_poslat",
    ]);
    await rollup(t);

    const week = must(await pregled(owner, service, 7));
    expect(week.zahtevi.call).toEqual({ poslato: 2, prihvaceno: 0, zavrseno: 0, otkazano: 1 });
    expect(week.zahteviOtkazao).toEqual({ gost: 1, osoblje: 0 });
    expect(week.porudzbinePoKanalu).toEqual({ standard: 0, roomService: 0 });

    // The request carries the card the guest scanned; the hour is the Belgrade hour (12:00 at T0).
    await premium({ t, w });
    const range = [dan(6), DANAS] as const;
    const byCard = must(await raspodelaOf(owner, service, ...range, "zahtevi", "kartica"));
    expect(byCard.vrednosti).toEqual([
      { vrednost: cardId, naziv: "Sto 1", ukupno: 2, poDanu: [0, 0, 0, 0, 0, 0, 2] },
    ]);
    const byHour = must(await raspodelaOf(owner, service, ...range, "zahtevi", "sat"));
    expect(byHour.vrednosti.map((row) => [row.vrednost, row.ukupno])).toEqual([["12", 2]]);
  });
});

// =============================================================================
// rezervacije
// =============================================================================

describe("rezervacije", () => {
  test("[rezervacije] sent and outcomes through the real writer: accept, decline, propose, acceptProposal, arrive, cancel by guest and by staff", async () => {
    const { t, w } = await world();
    const service = w.a.menuServiceId;
    const staff: ReservationActorDoc = { kind: "user", userId: w.ownerId };
    const guest: ReservationActorDoc = { kind: "guest" };

    // R1: accepted, then the guests arrived
    const r1 = await addReservation(t, w.a);
    await actOnReservation(t, r1, "accept", staff);
    await actOnReservation(t, r1, "arrive", staff);
    // R2: declined
    const r2 = await addReservation(t, w.a);
    await actOnReservation(t, r2, "decline", staff);
    // R3: a change proposed, then the guest agreed (counted as accepted)
    const r3 = await addReservation(t, w.a);
    await actOnReservation(t, r3, "propose", staff);
    await actOnReservation(t, r3, "acceptProposal", staff);
    // R4: cancelled by the guest while new
    const r4 = await addReservation(t, w.a);
    await actOnReservation(t, r4, "cancel", guest);
    // R5: accepted, then cancelled by the staff
    const r5 = await addReservation(t, w.a);
    await actOnReservation(t, r5, "accept", staff);
    await actOnReservation(t, r5, "cancel", staff);
    const after = (await eventsOf(t, service)).length;
    expect(after).toBe(5 + 8);

    // Nothing that changes no status writes an event.
    expect(await actOnReservation(t, r1, "arrive", staff)).toMatchObject({ ok: true, changed: false });
    expect(await actOnReservation(t, r2, "decline", staff)).toMatchObject({ ok: true, changed: false });
    expect(await actOnReservation(t, r4, "cancel", guest)).toMatchObject({ ok: true, changed: false });
    expect(await actOnReservation(t, r1, "accept", staff)).toMatchObject({ ok: false });
    expect(await actOnReservation(t, r5, "accept", staff)).toMatchObject({ ok: false });
    expect(await actOnReservation(t, r3, "accept", guest)).toMatchObject({ ok: false });
    expect(await eventsOf(t, service)).toHaveLength(after);

    expect(await rollup(t)).toEqual({ obradjeno: 13, jos: false });
    const week = must(await pregled(as(t, w.ownerId), service, 7));
    expect(week.rezervacije).toEqual({
      poslato: 5,
      prihvaceno: 3,
      odbijeno: 1,
      predlozeno: 1,
      realizovano: 1,
      otkazano: 2,
      otkazao: { gost: 1, osoblje: 1 },
    });
    expect(week.metrike.rezervacije.ukupno).toBe(5);
    expect(week.metrike.rezervacijePrihvacene.ukupno).toBe(3);
    expect(week.metrike.rezervacijeOdbijene.ukupno).toBe(1);
    expect(week.metrike.rezervacijePredlozi.ukupno).toBe(1);
    expect(week.metrike.rezervacijeRealizovane.ukupno).toBe(1);
    expect(week.metrike.rezervacijeOtkazane.ukupno).toBe(2);
    expect(week.metrike.rezervacije.poDanu).toEqual([0, 0, 0, 0, 0, 0, 5]);
  });
});

// =============================================================================
// skenovi
// =============================================================================

describe("skenovi", () => {
  test("[skenovi] scans per card: finished days from the aggregates, today live; the total is both; a card of another venue never shows", async () => {
    const { t, w, c1, c2, cb } = await scanWorld();
    const yesterday = dan(1);
    await setDaily(t, w.a.menuServiceId, yesterday, { skenovi: 7 }, { skenovi: { kartica: { [c1]: 4, [c2]: 3 } } });
    await setDaily(t, w.b.menuServiceId, yesterday, { skenovi: 2 }, { skenovi: { kartica: { [cb]: 2 } } });
    await setScanCursor(t, { dan: yesterday });
    // Today's scans are in the resolver's rollup only.
    await addScans(t, c1, DANAS, 2);
    await addScans(t, c2, DANAS, 4);
    await addScans(t, cb, DANAS, 5);
    // A scan of the card on a day the cursor has passed is not read live a second time.
    await addScans(t, c1, yesterday, 99);

    const week = must(await pregled(as(t, w.ownerId), w.a.menuServiceId, 7));
    expect(week.metrike.skenovi).toEqual({ ukupno: 7 + 6, poDanu: series(7, { 1: 7, 0: 6 }) });
    expect(week.skenovi).toEqual([
      { kartica: c2, naziv: "Bašta 2", broj: 7 },
      { kartica: c1, naziv: "Terasa 1", broj: 6 },
    ]);

    // Venue b sees its own card only.
    const other = must(await pregled(as(t, w.otherOwnerId), w.b.menuServiceId, 7));
    expect(other.skenovi).toEqual([{ kartica: cb, naziv: "Demo sto", broj: 7 }]);
    expect(other.metrike.skenovi.ukupno).toBe(2 + 5);
  });

  test("[skenovi] a day the cron is moving right now is not read live (never counted twice)", async () => {
    const { t, w, c1 } = await scanWorld();
    await setScanCursor(t, { dan: dan(3), radniDan: dan(1), stranica: "cursor-of-the-page" });
    await addScans(t, c1, dan(1), 5); // being moved: left to the cron
    await addScans(t, c1, DANAS, 2);

    const week = must(await pregled(as(t, w.ownerId), w.a.menuServiceId, 7));
    expect(week.metrike.skenovi).toEqual({ ukupno: 2, poDanu: series(7, { 0: 2 }) });
    expect(week.skenovi).toEqual([{ kartica: c1, naziv: "Terasa 1", broj: 2 }]);
  });

  test("[skenovi] without a cursor at most the last three days are read live", async () => {
    const { t, w, c1 } = await scanWorld();
    await addScans(t, c1, DANAS, 1);
    await addScans(t, c1, dan(1), 2);
    await addScans(t, c1, dan(2), 3);
    await addScans(t, c1, dan(3), 4); // a fourth day back: waits for the cron

    const week = must(await pregled(as(t, w.ownerId), w.a.menuServiceId, 7));
    expect(week.metrike.skenovi).toEqual({ ukupno: 6, poDanu: series(7, { 0: 1, 1: 2, 2: 3 }) });
  });

  test("[skenovi] the hourly cron moves finished days into the aggregates once; today stays live", async () => {
    const { t, w, c1, cb } = await scanWorld();
    await addScans(t, c1, dan(5), 1);
    await addScans(t, c1, dan(3), 3);
    await addScans(t, c1, dan(2), 4);
    await addScans(t, c1, dan(1), 2);
    await addScans(t, c1, DANAS, 5);
    await addScans(t, cb, dan(2), 9);

    // The first run moves the last 30 days, one day per run.
    let moved = 0;
    for (; moved < 100; moved += 1) {
      const result = await t.mutation(internal.menuAnalyticsRollup.skenovi, {});
      if (result.dan === null) break;
    }
    // K33 C2: one service per transaction, so a day takes one run per service (the world has two).
    const services = (await t.run(async (ctx) => await ctx.db.query("menuServices").collect())).length;
    expect(services).toBe(2);
    expect(moved).toBe(30 * services);
    // Running it again moves nothing and counts nothing twice.
    expect(await t.mutation(internal.menuAnalyticsRollup.skenovi, {})).toEqual({ dan: null });

    const week = must(await pregled(as(t, w.ownerId), w.a.menuServiceId, 7));
    expect(week.metrike.skenovi).toEqual({ ukupno: 1 + 3 + 4 + 2 + 5, poDanu: series(7, { 5: 1, 3: 3, 2: 4, 1: 2, 0: 5 }) });
    expect(week.skenovi).toEqual([{ kartica: c1, naziv: "Terasa 1", broj: 15 }]);
    const other = must(await pregled(as(t, w.otherOwnerId), w.b.menuServiceId, 7));
    expect(other.skenovi).toEqual([{ kartica: cb, naziv: "Demo sto", broj: 9 }]);
  });
});

// =============================================================================
// sesije
// =============================================================================

describe("sesije", () => {
  test("[sesije-pouzdane] sessions are a number only when at least 95% of the opens carried a session id", async () => {
    const { t, w } = await world();
    const service = w.a.menuServiceId;
    const owner = as(t, w.ownerId);
    const day = dan(1);

    await setDaily(t, service, day, { otvaranja: 100, otvaranjaSaSesijom: 94, sesije: 40 });
    expect(must(await pregled(owner, service, 7)).sesije).toEqual({ broj: null, pokrivenost: 0.94 });

    await setDaily(t, service, day, { otvaranja: 100, otvaranjaSaSesijom: 95, sesije: 40 });
    expect(must(await pregled(owner, service, 7)).sesije).toEqual({ broj: 40, pokrivenost: 0.95 });

    await setDaily(t, service, day, { otvaranja: 100, otvaranjaSaSesijom: 100, sesije: 40 });
    expect(must(await pregled(owner, service, 7)).sesije).toEqual({ broj: 40, pokrivenost: 1 });

    // No identifier at all (the default: identifiers are off), and no opens at all.
    await setDaily(t, service, day, { otvaranja: 100, otvaranjaSaSesijom: 0 });
    expect(must(await pregled(owner, service, 7)).sesije).toEqual({ broj: null, pokrivenost: 0 });
    await setDaily(t, service, day, { sesije: 7 });
    expect(must(await pregled(owner, service, 7)).sesije).toEqual({ broj: null, pokrivenost: null });
  });

  test("[sesije-pouzdane] from raw events: 19 sessions of 20 opens is exactly 95% and shows, one more open without an id does not", async () => {
    const { t, w } = await world();
    const service = w.a.menuServiceId;
    const owner = as(t, w.ownerId);
    await addEvents(t, service, "stranica", 0, 19, (index) => ({
      ...PAGE_OPEN,
      sesija: `sesija-${String(index).padStart(2, "0")}`,
    }));
    await addEvents(t, service, "stranica", 0, 1, PAGE_OPEN);
    await rollup(t);

    const reliable = must(await pregled(owner, service, 7));
    expect(reliable.metrike.otvaranja.ukupno).toBe(20);
    expect(reliable.metrike.otvaranjaSaSesijom.ukupno).toBe(19);
    expect(reliable.sesije).toEqual({ broj: 19, pokrivenost: 0.95 });

    await addEvents(t, service, "stranica", 0, 1, PAGE_OPEN);
    await rollup(t);
    const unreliable = must(await pregled(owner, service, 7));
    expect(unreliable.metrike.otvaranja.ukupno).toBe(21);
    expect(unreliable.sesije.broj).toBeNull();
    expect(unreliable.sesije.pokrivenost).toBeCloseTo(19 / 21, 10);
  });
});

// =============================================================================
// premium, period
// =============================================================================

describe("premium", () => {
  test("[premium] Standard: period and raspodela refuse with plan/premium_required, pregled works; after Premium they work", async () => {
    const env = await world();
    const { t, w } = env;
    const service = w.a.menuServiceId;
    const owner = as(t, w.ownerId);
    const range = [dan(6), DANAS] as const;

    expect(await pregled(owner, service, 7)).not.toBeNull();
    expect(await pregled(owner, service, 30)).not.toBeNull();
    await expect(periodOf(owner, service, ...range)).rejects.toThrow(MENU_PLAN_ERROR.premiumRequired);
    await expect(raspodelaOf(owner, service, ...range, "otvaranja", "stranica")).rejects.toThrow(
      MENU_PLAN_ERROR.premiumRequired,
    );

    await premium(env, "a");
    expect(await pregled(owner, service, 7)).not.toBeNull();
    expect(await periodOf(owner, service, ...range)).not.toBeNull();
    expect(await raspodelaOf(owner, service, ...range, "otvaranja", "stranica")).not.toBeNull();

    // The grant is on account a: the other venue is still Standard.
    const other = as(t, w.otherOwnerId);
    expect(await pregled(other, w.b.menuServiceId, 7)).not.toBeNull();
    await expect(periodOf(other, w.b.menuServiceId, ...range)).rejects.toThrow(MENU_PLAN_ERROR.premiumRequired);
    await expect(raspodelaOf(other, w.b.menuServiceId, ...range, "otvaranja", "stranica")).rejects.toThrow(
      MENU_PLAN_ERROR.premiumRequired,
    );
  });

  test("[premium] pregled accepts only 7 or 30 days, even for Premium", async () => {
    const env = await world();
    const { t, w } = env;
    await premium(env, "a");
    const owner = as(t, w.ownerId);
    for (const dana of [0, 1, 14, 90]) {
      await expect(
        owner.query(api.menuAnalytics.pregled, { menuServiceId: w.a.menuServiceId, danas: DANAS, dana: dana as never }),
      ).rejects.toThrow();
    }
    expect(await pregled(owner, w.a.menuServiceId, 7)).not.toBeNull();
  });
});

describe("period", () => {
  test("[period] invalid ranges are refused with analytics/invalid_period", async () => {
    const env = await world();
    const { t, w } = env;
    await premium(env, "a");
    const owner = as(t, w.ownerId);
    const service = w.a.menuServiceId;
    const refused = async (od: string, doDana: string, poredi = false) => {
      await expect(periodOf(owner, service, od, doDana, poredi), `${od}..${doDana}`).rejects.toThrow(
        ANALYTICS_ERROR.invalidPeriod,
      );
      await expect(
        raspodelaOf(owner, service, od, doDana, "otvaranja", "stranica"),
        `raspodela ${od}..${doDana}`,
      ).rejects.toThrow(ANALYTICS_ERROR.invalidPeriod);
    };

    await refused(dan(1), dan(5)); // reversed
    await refused(dan(366), DANAS); // 367 days
    await refused(dan(1), addDays(DANAS, 1)); // ends in the future
    await refused(DANAS, addDays(DANAS, 3)); // entirely in the future
    await refused("2024-10-20", "2024-11-20"); // starts a day before the 24 months kept (2024-10-21)
    await refused("2026-13-01", "2026-13-05"); // not a real day
    await refused("2026-2-1", DANAS); // not the key shape
    await refused(dan(30), "kad-bude");
  });

  test("[period] a 90-day period works, so do 366 days and the oldest day kept; the data of the days is summed", async () => {
    const env = await world();
    const { t, w } = env;
    await premium(env, "a");
    const owner = as(t, w.ownerId);
    const service = w.a.menuServiceId;
    await setDaily(t, service, DANAS, { otvaranja: 10 });
    await setDaily(t, service, dan(89), { otvaranja: 4 });
    await setDaily(t, service, dan(90), { otvaranja: 1000 }); // the day before the period

    const ninety = must(await periodOf(owner, service, dan(89), DANAS));
    expect(ninety.period).toEqual({ od: dan(89), do: DANAS, dana: 90 });
    expect(ninety.dani).toHaveLength(90);
    expect(ninety.dani[0]).toBe(dan(89));
    expect(ninety.dani[89]).toBe(DANAS);
    expect(ninety.metrike.otvaranja.ukupno).toBe(14);
    expect(ninety.metrike.otvaranja.poDanu[0]).toBe(4);
    expect(ninety.metrike.otvaranja.poDanu[89]).toBe(10);
    // Without the comparison there is no previous period.
    expect(ninety.prethodni).toBeNull();

    const year = must(await periodOf(owner, service, dan(365), DANAS));
    expect(year.period.dana).toBe(366);
    expect(year.metrike.otvaranja.ukupno).toBe(1014);

    const oldest = must(await periodOf(owner, service, "2024-10-21", "2024-12-01"));
    expect(oldest.period.dana).toBe(42);
    // One day only is a period too.
    const single = must(await periodOf(owner, service, DANAS, DANAS));
    expect(single.period.dana).toBe(1);
    expect(single.metrike.otvaranja).toEqual({ ukupno: 10, poDanu: [10] });
  });

  test("[period] a malformed `danas` answers null for pregled", async () => {
    const { t, w } = await world();
    const owner = as(t, w.ownerId);
    expect(await pregled(owner, w.a.menuServiceId, 7, "21.10.2026")).toBeNull();
    expect(await pregled(owner, w.a.menuServiceId, 7, "2026-02-30")).toBeNull();
    expect(await pregled(owner, w.a.menuServiceId, 7, DANAS)).not.toBeNull();
  });
});

// =============================================================================
// poredjenje, konverzije
// =============================================================================

describe("poredjenje", () => {
  test("[poredjenje] the previous period of the same length, the difference always, the percentage only from 20 in the previous period", async () => {
    const env = await world();
    const { t, w } = env;
    await premium(env, "a");
    const owner = as(t, w.ownerId);
    const service = w.a.menuServiceId;
    // Selected period 2026-10-15 … 2026-10-21; the previous one is 2026-10-08 … 2026-10-14.
    await setDaily(t, service, dan(1), {
      otvaranja: 30,
      zahtevi: 9,
      detalji: 3,
      rezervacije: 5,
      rezervacijePrihvacene: 30,
      rezervacijeOdbijene: 10,
    });
    await setDaily(t, service, dan(11), {
      otvaranja: 25,
      zahtevi: 5,
      rezervacije: 19,
      rezervacijePrihvacene: 20,
      rezervacijeOdbijene: 40,
    });
    // Outside both periods.
    await setDaily(t, service, dan(14), { otvaranja: 500 });

    const result = must(await periodOf(owner, service, dan(6), DANAS, true));
    const previous = must(result.prethodni);
    expect(previous.period).toEqual({ od: dan(13), do: dan(7) });
    expect(previous.period).toEqual({ od: "2026-10-08", do: "2026-10-14" });
    expect(previous.ukupno.otvaranja).toBe(25);
    expect(previous.ukupno.rezervacije).toBe(19);
    expect(previous.poredjenje.otvaranja).toEqual({ razlika: 5, procenat: 20 }); // 25 ≥ 20: a percentage
    expect(previous.poredjenje.zahtevi).toEqual({ razlika: 4, procenat: null }); // 5 < 20
    expect(previous.poredjenje.detalji).toEqual({ razlika: 3, procenat: null }); // 0 < 20
    expect(previous.poredjenje.rezervacije).toEqual({ razlika: -14, procenat: null }); // 19 < 20
    expect(previous.poredjenje.rezervacijePrihvacene).toEqual({ razlika: 10, procenat: 50 }); // exactly 20
    expect(previous.poredjenje.rezervacijeOdbijene).toEqual({ razlika: -30, procenat: -75 });
    expect(previous.poredjenje.skenovi).toEqual({ razlika: 0, procenat: null });

    // The same period without `poredi` carries no comparison; neither does pregled.
    expect(must(await periodOf(owner, service, dan(6), DANAS, false)).prethodni).toBeNull();
    expect(must(await pregled(owner, service, 7)).prethodni).toBeNull();
  });

  test("[poredjenje] a custom period of 3 days compares with the 3 days right before it", async () => {
    const env = await world();
    const { t, w } = env;
    await premium(env, "a");
    const service = w.a.menuServiceId;
    await setDaily(t, service, dan(3), { otvaranja: 60 });
    await setDaily(t, service, dan(0), { otvaranja: 30 });

    const result = must(await periodOf(as(t, w.ownerId), service, dan(2), DANAS, true));
    const previous = must(result.prethodni);
    expect(previous.period).toEqual({ od: dan(5), do: dan(3) });
    expect(previous.ukupno.otvaranja).toBe(60);
    expect(previous.poredjenje.otvaranja).toEqual({ razlika: -30, procenat: -50 });
  });
});

describe("konverzije", () => {
  test("[konverzije] [pravilo-20] the funnel is null while sessions are unreliable; shares are null under 20 sessions and a number from 20", async () => {
    const env = await world();
    const { t, w } = env;
    await premium(env, "a");
    const owner = as(t, w.ownerId);
    const service = w.a.menuServiceId;
    const day = dan(1);
    const range = [dan(6), DANAS] as const;
    const steps = { sesijeSaDetaljem: 10, sesijeSaZahtevom: 5, sesijeSaPorudzbinom: 2, sesijeSaRezervacijom: 1 };

    // 90% of the opens had a session id: not reliable, so no funnel at all.
    await setDaily(t, service, day, { otvaranja: 100, otvaranjaSaSesijom: 90, sesije: 40, ...steps });
    expect(must(await periodOf(owner, service, ...range)).konverzije).toBeNull();

    // Reliable, but 19 sessions: the counts show, the shares do not.
    await setDaily(t, service, day, { otvaranja: 19, otvaranjaSaSesijom: 19, sesije: 19, ...steps });
    expect(must(await periodOf(owner, service, ...range)).konverzije).toEqual({
      sesije: 19,
      saDetaljem: 10,
      saZahtevom: 5,
      saPorudzbinom: 2,
      saRezervacijom: 1,
      udeo: { detalj: null, zahtev: null, porudzbina: null, rezervacija: null },
    });

    // 20 sessions: the rule of 20 is met.
    await setDaily(t, service, day, { otvaranja: 20, otvaranjaSaSesijom: 20, sesije: 20, ...steps });
    expect(must(await periodOf(owner, service, ...range)).konverzije).toEqual({
      sesije: 20,
      saDetaljem: 10,
      saZahtevom: 5,
      saPorudzbinom: 2,
      saRezervacijom: 1,
      udeo: { detalj: 50, zahtev: 25, porudzbina: 10, rezervacija: 5 },
    });

    // A step reached by sessions that began before the period is never shown above 100%.
    await setDaily(t, service, day, { otvaranja: 20, otvaranjaSaSesijom: 20, sesije: 20, sesijeSaDetaljem: 25 });
    expect(must(await periodOf(owner, service, ...range)).konverzije?.udeo.detalj).toBe(100);

    // The funnel is a Premium answer: pregled never carries it.
    expect(must(await pregled(owner, service, 7)).konverzije).toBeNull();
  });
});

// =============================================================================
// raspodela
// =============================================================================

describe("raspodela", () => {
  const range = [dan(2), DANAS] as const;

  test("[raspodela] by article, page, device: sorted by total, names from the menu or null, series aligned with the days", async () => {
    const env = await world();
    const { t, w } = env;
    await premium(env, "a");
    const owner = as(t, w.ownerId);
    const service = w.a.menuServiceId;
    const [salata, pita, gone] = [articleKey(1), articleKey(2), articleKey(3)];
    await addArticle(t, service, salata, "Cezar salata");
    await addArticle(t, service, pita, "Pita sa sirom");
    const page = must(await t.run(async (ctx) => await ctx.db.get(w.a.defaultPageId)));

    await setDaily(t, service, dan(2), {}, {
      detalji: { artikal: { [salata]: 5, [pita]: 1, [gone]: 6 } },
      otvaranja: { stranica: { [page.key]: 9, room_service: 2 }, uredjaj: { telefon: 10, tablet: 2, racunar: 2 } },
    });
    await setDaily(t, service, dan(1), {}, {
      detalji: { artikal: { [salata]: 3, [pita]: 3 } },
    });

    const articles = must(await raspodelaOf(owner, service, ...range, "detalji", "artikal"));
    expect(articles.period).toEqual({ od: dan(2), do: DANAS, dana: 3 });
    expect(articles.dani).toEqual([dan(2), dan(1), DANAS]);
    expect(articles.metrika).toBe("detalji");
    expect(articles.dimenzija).toBe("artikal");
    expect(articles.vrednosti).toEqual([
      { vrednost: salata, naziv: "Cezar salata", ukupno: 8, poDanu: [5, 3, 0] },
      { vrednost: gone, naziv: null, ukupno: 6, poDanu: [6, 0, 0] },
      { vrednost: pita, naziv: "Pita sa sirom", ukupno: 4, poDanu: [1, 3, 0] },
    ]);
    expect(articles.ostalo).toEqual({ ukupno: 0, poDanu: [0, 0, 0] });

    const pages = must(await raspodelaOf(owner, service, ...range, "otvaranja", "stranica"));
    expect(pages.vrednosti).toEqual([
      { vrednost: page.key, naziv: page.name, ukupno: 9, poDanu: [9, 0, 0] },
      { vrednost: "room_service", naziv: null, ukupno: 2, poDanu: [2, 0, 0] },
    ]);

    // Device, language, hour, kind, channel and who cancelled are named by the panel (i18n): no name here.
    const devices = must(await raspodelaOf(owner, service, ...range, "otvaranja", "uredjaj"));
    expect(devices.vrednosti.map((row) => [row.vrednost, row.naziv, row.ukupno])).toEqual([
      ["telefon", null, 10],
      ["racunar", null, 2],
      ["tablet", null, 2],
    ]);

    // A metric the days have no breakdown for is an empty answer, not an error.
    const none = must(await raspodelaOf(owner, service, ...range, "zahtevi", "kanal"));
    expect(none.vrednosti).toEqual([]);
    expect(none.ostalo).toEqual({ ukupno: 0, poDanu: [0, 0, 0] });
  });

  test("[raspodela] at most 20 values; the rest, and the bucket the rollup keeps, are summed in `ostalo`", async () => {
    const env = await world();
    const { t, w } = env;
    await premium(env, "a");
    const service = w.a.menuServiceId;
    // 25 values with counts 25 … 1, and the rollup's own overflow bucket (7).
    const jezik: Record<string, number> = { ostalo: 7 };
    for (let n = 0; n < 25; n += 1) jezik[`l${String(n).padStart(2, "0")}`] = 25 - n;
    await setDaily(t, service, dan(1), {}, { otvaranja: { jezik } });

    const result = must(await raspodelaOf(as(t, w.ownerId), service, ...range, "otvaranja", "jezik"));
    expect(result.vrednosti).toHaveLength(20);
    expect(result.vrednosti[0]).toEqual({ vrednost: "l00", naziv: null, ukupno: 25, poDanu: [0, 25, 0] });
    expect(result.vrednosti[19]).toEqual({ vrednost: "l19", naziv: null, ukupno: 6, poDanu: [0, 6, 0] });
    expect(result.vrednosti.map((row) => row.vrednost)).not.toContain("ostalo");
    // l20 … l24 = 5 + 4 + 3 + 2 + 1, plus the bucket of 7.
    expect(result.ostalo).toEqual({ ukupno: 15 + 7, poDanu: [0, 22, 0] });
    for (const row of result.vrednosti) expect(row.poDanu).toHaveLength(result.dani.length);
  });

  test("[raspodela] [skenovi] by card: the aggregated days and today's live scans, with the card label", async () => {
    const { t, w, c1, c2 } = await scanWorld();
    await premium({ t, w });
    const service = w.a.menuServiceId;
    await setDaily(t, service, dan(1), { skenovi: 4 }, { skenovi: { kartica: { [c1]: 4 } } });
    await setScanCursor(t, { dan: dan(1) });
    await addScans(t, c1, DANAS, 2);
    await addScans(t, c2, DANAS, 1);

    const result = must(await raspodelaOf(as(t, w.ownerId), service, ...range, "skenovi", "kartica"));
    expect(result.vrednosti).toEqual([
      { vrednost: c1, naziv: "Terasa 1", ukupno: 6, poDanu: [0, 4, 2] },
      { vrednost: c2, naziv: "Bašta 2", ukupno: 1, poDanu: [0, 0, 1] },
    ]);
    expect(result.ostalo).toEqual({ ukupno: 0, poDanu: [0, 0, 0] });

    // A card the venue no longer has is not a named value; its (real) scans count in `ostalo`.
    const gone = "kd7fa2zm1c0qxe5sn3h9tbvwr4y6jp8g";
    await setDaily(t, service, dan(2), { skenovi: 3 }, { skenovi: { kartica: { [gone]: 3 } } });
    const withGone = must(await raspodelaOf(as(t, w.ownerId), service, ...range, "skenovi", "kartica"));
    expect(withGone.vrednosti.find((row) => row.vrednost === gone)).toBeUndefined();
    expect(withGone.ostalo).toEqual({ ukupno: 3, poDanu: [3, 0, 0] });
  });
});

// =============================================================================
// izolacija
// =============================================================================

describe("izolacija", () => {
  test("[izolacija] the owner, the manager and ScanMe admin read; the other venue's owner, an outsider, an editor, finance, view-only and nobody do not (null for all three queries)", async () => {
    const env = await world();
    const { t, w } = env;
    await premium(env, "both"); // the plan gate must not be what refuses
    const service = w.a.menuServiceId;
    await addEvents(t, service, "stranica", 0, 2, PAGE_OPEN);
    await rollup(t);
    const who = callers(env);
    const range = [dan(6), DANAS] as const;

    for (const name of ["owner", "manager", "admin"] as const) {
      const caller = who[name];
      expect(must(await pregled(caller, service, 7), `pregled ${name}`).metrike.otvaranja.ukupno).toBe(2);
      expect(must(await periodOf(caller, service, ...range), `period ${name}`).metrike.otvaranja.ukupno).toBe(2);
      expect(must(await raspodelaOf(caller, service, ...range, "otvaranja", "stranica"), `raspodela ${name}`).vrednosti).toHaveLength(
        1,
      );
    }
    for (const name of ["otherOwner", "outsider", "editor", "finance", "viewOnly", "anonymous"] as const) {
      const caller = who[name];
      expect(await pregled(caller, service, 7), `pregled ${name}`).toBeNull();
      expect(await periodOf(caller, service, ...range), `period ${name}`).toBeNull();
      expect(await raspodelaOf(caller, service, ...range, "otvaranja", "stranica"), `raspodela ${name}`).toBeNull();
    }
    // And the other way round: a's owner reads nothing of b.
    expect(await pregled(who.owner, w.b.menuServiceId, 7)).toBeNull();
    expect(await periodOf(who.owner, w.b.menuServiceId, ...range)).toBeNull();
    expect(await raspodelaOf(who.owner, w.b.menuServiceId, ...range, "otvaranja", "stranica")).toBeNull();
  });

  test("[izolacija] a's events, requests, articles and cards never show in b's results, even through a foreign key", async () => {
    const { t, w, c1, cb } = await scanWorld();
    await premium({ t, w }, "both");
    const a = w.a.menuServiceId;
    const b = w.b.menuServiceId;
    const ownerA = as(t, w.ownerId);
    const ownerB = as(t, w.otherOwnerId);
    const tableA = await addTable(t, w.a);
    const tableB = await addTable(t, w.b, "Demo sto 3");

    await addArticle(t, a, ARTICLE, "Tajna čorba kuće A");
    await addEvents(t, a, "stranica", 0, 4, PAGE_OPEN);
    await addEvents(t, a, "detalj", 0, 3, { stranica: PAGE, artikal: ARTICLE });
    await addEvents(t, b, "stranica", 0, 2, PAGE_OPEN);
    await sendRequest(t, tableA, "call");
    await sendRequest(t, tableA, "call");
    await sendRequest(t, tableA, "call");
    await sendRequest(t, tableB, "call");
    await addScans(t, c1, DANAS, 5);
    await addScans(t, cb, DANAS, 2);
    await rollup(t);
    // A stale row of b that names a's article and a's card: neither is resolved through b.
    await setDaily(t, b, dan(1), {}, {
      detalji: { artikal: { [ARTICLE]: 4 } },
      skenovi: { kartica: { [c1]: 9 } },
    });

    const weekA = must(await pregled(ownerA, a, 7));
    expect(weekA.metrike.otvaranja.ukupno).toBe(4);
    expect(weekA.metrike.detalji.ukupno).toBe(3);
    expect(weekA.zahtevi.call.poslato).toBe(3);
    expect(weekA.najotvaraniji).toEqual([{ artikal: ARTICLE, naziv: "Tajna čorba kuće A", broj: 3 }]);
    expect(weekA.skenovi).toEqual([{ kartica: c1, naziv: "Terasa 1", broj: 5 }]);

    const weekB = must(await pregled(ownerB, b, 7));
    expect(weekB.metrike.otvaranja.ukupno).toBe(2);
    expect(weekB.metrike.detalji.ukupno).toBe(0);
    expect(weekB.zahtevi.call.poslato).toBe(1);
    expect(weekB.najotvaraniji).toEqual([]);
    expect(weekB.skenovi).toEqual([{ kartica: cb, naziv: "Demo sto", broj: 2 }]);
    expect(JSON.stringify(weekB)).not.toContain("Tajna čorba");
    expect(JSON.stringify(weekB)).not.toContain("Terasa 1");

    const range = [dan(6), DANAS] as const;
    const periodB = must(await periodOf(ownerB, b, ...range));
    expect(periodB.metrike.otvaranja.ukupno).toBe(2);
    const articlesB = must(await raspodelaOf(ownerB, b, ...range, "detalji", "artikal"));
    // The key is b's own row, but the name belongs to a's menu and is not resolved.
    expect(articlesB.vrednosti).toEqual([
      { vrednost: ARTICLE, naziv: null, ukupno: 4, poDanu: [0, 0, 0, 0, 0, 4, 0] },
    ]);
    const cardsB = must(await raspodelaOf(ownerB, b, ...range, "skenovi", "kartica"));
    expect(cardsB.vrednosti.map((row) => row.vrednost)).toContain(cb);
    expect(cardsB.vrednosti.find((row) => row.vrednost === cb)).toMatchObject({ naziv: "Demo sto", ukupno: 2 });
    expect(JSON.stringify(cardsB)).not.toContain("Terasa 1");
  });
});
