/// <reference types="vite/client" />

// ScanMe Menu V1 — K27: Operativa of the client panel and the quiet reminder to
// the waiter (master §13.5; plan docs/meni/planovi/K24.md §4.3, K24-20).
// `menuPanel.ping`, `menuPanel.operations` and `menuPanel.requestDetail` on the
// Owner's side; `menuWaiter.activeRequests.notices` and `menuWaiter.seeNotice` on
// the waiter's side. Proven here: a reminder reaches only the PIN waiter who took
// the request, in the same venue (the acceptance test); who may send it; the
// refusals as values (`ping/no_responsible`, `ping/too_soon`); that closing it is
// the receiver's alone; the bounds (5 reminders, 300 requests per status); and
// that nothing a guest or a secret owns (contact, note, device pseudonym, hashes,
// tokens) leaves through any of these queries.
//
// Time is frozen (fake timers, T0 = Wednesday 2026-10-21 12:00 in Belgrade); the
// clock moves with vi.setSystemTime. Fictional tenants only (the repo is public):
// "Kafana kod Mike" (a), "Demo restoran" (b); people are "Ana", "Marko",
// "Petar", "Jelena". The helpers are copied from convex/menuWaiter.test.ts on
// purpose (a test file is not a module to import from).

import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import { menuDomenSr } from "../lib/i18n/sr/menu-domen";
import {
  MENU_MAX_ACTIVE_REQUESTS,
  MENU_MAX_PANEL_RESERVATIONS,
  MENU_MAX_STAFF_NOTICES,
  MENU_PING_COOLDOWN_MS,
  MENU_RESERVATION_PANEL_WINDOW_MS,
} from "../lib/menu/limits";
import { STAFF_SESSION_MS } from "../lib/menu/pin-policy";
import {
  SLUG_A,
  SLUG_B,
  TEST_ADMIN_EMAIL,
  TEST_ISSUER,
  seedMenuWorld,
  type MenuTenantSeed,
  type MenuWorldSeed,
} from "../lib/menu/testkit/seed";

const modules = import.meta.glob("./**/*.ts");

beforeEach(() => {
  process.env.SCANME_ADMIN_EMAILS = TEST_ADMIN_EMAIL;
  process.env.MENU_PIN_PEPPER = "test-pepper-0123456789abcdef";
});

afterEach(() => {
  delete process.env.MENU_PIN_PEPPER;
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

/** The ConvexError code a call throws, or null when it does not throw. */
async function codeOf(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    if (error instanceof ConvexError && typeof error.data === "string") return error.data;
    throw error;
  }
}

const T0 = Date.UTC(2026, 9, 21, 10, 0, 0); // Wednesday 12:00 in Belgrade (CEST)
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
/** What the panel passes as `fromMs`: the start of the current hour minus 12 hours. */
const FROM_MS = T0 - 12 * HOUR;
/** The pseudonym of the guest's phone: it must never reach the Owner's screen. */
const GUEST_DEVICE = "guest-device-pseudonym-6f2c1a";
/** Well-formed (43 url-safe characters), but nobody's session token. */
const BOGUS_TOKEN = "A".repeat(43);

// -----------------------------------------------------------------------------
// World, staff, sign-in
// -----------------------------------------------------------------------------

async function world() {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  const t = newTest();
  const w: MenuWorldSeed = await t.run(async (ctx) => await seedMenuWorld(ctx));
  const owner = as(t, w.ownerId);
  const other = as(t, w.otherOwnerId);
  const { code } = await owner.mutation(api.menuStaff.ensurePanelCode, { menuServiceId: w.a.menuServiceId });
  const { code: bCode } = await other.mutation(api.menuStaff.ensurePanelCode, { menuServiceId: w.b.menuServiceId });
  return { t, w, owner, other, code, bCode };
}
type Env = Awaited<ReturnType<typeof world>>;
type Venue = "a" | "b";

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

async function addStaff(env: Env, displayName: string, pin: string, venue: Venue = "a") {
  const b = venue === "b";
  const who = b ? env.other : env.owner;
  const { staffId } = await who.mutation(api.menuStaff.create, {
    menuServiceId: b ? env.w.b.menuServiceId : env.w.a.menuServiceId,
    displayName,
  });
  await who.mutation(api.menuStaff.setPin, { staffId, pin });
  return staffId;
}

function panel(env: Env, sessionToken?: string, venue: Venue = "a") {
  return {
    slug: venue === "b" ? SLUG_B : SLUG_A,
    panelCode: venue === "b" ? env.bCode : env.code,
    ...(sessionToken !== undefined ? { sessionToken } : {}),
  };
}

/** A PIN sign-in on a NEW device (no device token), so one person may sit on several. */
async function signIn(env: Env, pin: string, venue: Venue = "a") {
  const { slug, panelCode } = panel(env, undefined, venue);
  const outcome = await env.t.mutation(api.menuWaiter.loginWithPin, { slug, panelCode, pin });
  if (!outcome.ok) throw new Error(`sign-in refused: ${JSON.stringify(outcome)}`);
  return outcome.sessionToken;
}

// -----------------------------------------------------------------------------
// Panel calls
// -----------------------------------------------------------------------------

type Opts = { venue?: Venue; who?: Caller };

const queue = (env: Env, token?: string, o: Opts = {}) =>
  (o.who ?? env.t).query(api.menuWaiter.activeRequests, panel(env, token, o.venue));

type ActionName = "accept" | "complete" | "cancel";

function act(env: Env, name: ActionName, requestId: Id<"menuRequests">, o: Opts & { token?: string } = {}) {
  const who = o.who ?? env.t;
  const args = { ...panel(env, o.token, o.venue), requestId };
  if (name === "accept") return who.mutation(api.menuWaiter.accept, args);
  if (name === "complete") return who.mutation(api.menuWaiter.complete, args);
  return who.mutation(api.menuWaiter.cancel, args);
}

const seeNotice = (env: Env, token: string | undefined, noticeId: Id<"menuStaffNotices">, o: Opts = {}) =>
  (o.who ?? env.t).mutation(api.menuWaiter.seeNotice, { ...panel(env, token, o.venue), noticeId });

const ping = (who: Caller, menuServiceId: Id<"menuServices">, requestId: Id<"menuRequests">) =>
  who.mutation(api.menuPanel.ping, { menuServiceId, requestId });

const operations = (who: Caller, menuServiceId: Id<"menuServices">, fromMs: number = FROM_MS) =>
  who.query(api.menuPanel.operations, { menuServiceId, fromMs });

const detailOf = (who: Caller, menuServiceId: Id<"menuServices">, requestId: Id<"menuRequests">) =>
  who.query(api.menuPanel.requestDetail, { menuServiceId, requestId });

// -----------------------------------------------------------------------------
// Reading rows back
// -----------------------------------------------------------------------------

const noticeRows = (t: T) => t.run(async (ctx) => await ctx.db.query("menuStaffNotices").take(1000));
const noticeRow = (t: T, id: Id<"menuStaffNotices">) => t.run(async (ctx) => await ctx.db.get(id));
const requestRow = (t: T, id: Id<"menuRequests">) => t.run(async (ctx) => await ctx.db.get(id));

async function auditRows(t: T, action: string) {
  const rows = await t.run(async (ctx) => await ctx.db.query("menuAuditLog").take(1000));
  return rows.filter((row) => row.action === action);
}

// -----------------------------------------------------------------------------
// Tables, requests, reservations (what K21 / K25 would have written)
// -----------------------------------------------------------------------------

type Table = {
  tenant: MenuTenantSeed;
  positionId: Id<"menuPositions">;
  guestSessionId: Id<"menuGuestSessions">;
  zoneId?: Id<"menuZones">;
  label: string;
};

let keyCounter = 0;

async function addTable(t: T, tenant: MenuTenantSeed, label = "Sto 12", zoneName?: string): Promise<Table> {
  keyCounter += 1;
  return await t.run(async (ctx) => {
    const now = Date.now();
    const menuServiceId = tenant.menuServiceId;
    const zoneId = zoneName
      ? await ctx.db.insert("menuZones", {
          menuServiceId,
          key: `zn_test${keyCounter}`,
          name: zoneName,
          nameNormalized: zoneName.toLowerCase(),
          order: 0,
          active: true,
          createdAt: now,
          updatedAt: now,
        })
      : undefined;
    const positionId = await ctx.db.insert("menuPositions", {
      menuServiceId,
      key: `ps_test${keyCounter}`,
      kind: "table",
      label,
      labelNormalized: label.toLowerCase(),
      ...(zoneId ? { zoneId } : {}),
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
    return { tenant, positionId, guestSessionId, ...(zoneId ? { zoneId } : {}), label };
  });
}

type RequestFields = Partial<Omit<Doc<"menuRequests">, "_id" | "_creationTime">>;

/** `count` requests of one table in one transaction; createdAt = T0 + 1 s × index unless given. */
async function addRequests(t: T, table: Table, count: number, fields: RequestFields = {}) {
  return await t.run(async (ctx) => {
    const ids: Id<"menuRequests">[] = [];
    for (let index = 0; index < count; index += 1) {
      ids.push(
        await ctx.db.insert("menuRequests", {
          menuServiceId: table.tenant.menuServiceId,
          businessId: table.tenant.businessId,
          kind: "call",
          status: "new",
          channel: "standard",
          positionId: table.positionId,
          positionLabel: table.label,
          positionKind: "table",
          ...(table.zoneId ? { zoneId: table.zoneId } : {}),
          guestSessionId: table.guestSessionId,
          deviceKeyHash: GUEST_DEVICE,
          createdAt: T0 + index * 1000,
          updatedAt: Date.now(),
          ...fields,
        }),
      );
    }
    return ids;
  });
}

async function addRequest(t: T, table: Table, fields: RequestFields = {}) {
  const [id] = await addRequests(t, table, 1, { createdAt: Date.now(), ...fields });
  return id;
}

/** A request a PIN waiter has already taken (written directly; the accept path has its own tests). */
const held = (env: Env, table: Table, staffId: Id<"menuStaff">, fields: RequestFields = {}) =>
  addRequest(env.t, table, { status: "accepted", acceptedAt: Date.now(), acceptedByStaffId: staffId, ...fields });

let reservationCounter = 0;

type ReservationFields = Partial<Omit<Doc<"menuReservations">, "_id" | "_creationTime">>;

/** A reservation carrying every personal field the form collects. */
async function addReservation(t: T, tenant: MenuTenantSeed, fields: ReservationFields = {}) {
  reservationCounter += 1;
  return await t.run(async (ctx) => {
    const now = Date.now();
    return await ctx.db.insert("menuReservations", {
      menuServiceId: tenant.menuServiceId,
      businessId: tenant.businessId,
      status: "new",
      guestName: "Marija Gost",
      partySize: 4,
      requestedAt: FROM_MS + DAY,
      contactEmail: "marija.gost@example.com",
      contactPhone: "+381 60 000 0000",
      note: "Slavimo rodjendan",
      cancelTokenHash: `cancel-token-hash-secret-${reservationCounter}`,
      deviceKeyHash: GUEST_DEVICE,
      createdAt: now,
      updatedAt: now,
      ...fields,
    });
  });
}

/** Ana (246) and Marko (135) on the floor, both signed in, and a table "Sto 12" in zone "Terasa". */
async function shift(env: Env) {
  const anaId = await addStaff(env, "Ana", "246");
  const markoId = await addStaff(env, "Marko", "135");
  const ana = await signIn(env, "246");
  const marko = await signIn(env, "135");
  const table = await addTable(env.t, env.w.a, "Sto 12", "Terasa");
  return { anaId, markoId, ana, marko, table };
}

/** Ana holds a request and the Owner has reminded her of it at T0 + 10 min. */
async function pinged(env: Env) {
  const base = await shift(env);
  const requestId = await held(env, base.table, base.anaId);
  vi.setSystemTime(T0 + 10 * MINUTE);
  const outcome = await ping(env.owner, env.w.a.menuServiceId, requestId);
  if (!outcome.ok) throw new Error(`ping refused: ${JSON.stringify(outcome)}`);
  const [notice] = await noticeRows(env.t);
  return { ...base, requestId, noticeId: notice._id, sentAt: outcome.sentAt };
}

/** Values that must never leave through a panel query: secrets of the DB rows and the raw tokens. */
async function secretsOf(t: T): Promise<string[]> {
  return await t.run(async (ctx) => {
    const staff = await ctx.db.query("menuStaff").take(100);
    const sessions = await ctx.db.query("menuStaffSessions").take(100);
    const guests = await ctx.db.query("menuGuestSessions").take(100);
    return [
      ...staff.flatMap((row) => [row.pinHash, row.pinLookup]),
      ...sessions.flatMap((row) => [row.tokenHash, row.deviceKeyHash]),
      ...guests.map((row) => row.tokenHash),
    ].filter((value): value is string => typeof value === "string");
  });
}

const LEAK_KEYS = ["deviceKeyHash", "tokenHash", "pinHash", "pinLookup", "cancelTokenHash", "contactEmail", "contactPhone", "guestName"];

/** Deep search of the whole JSON: no secret key, no secret value, and no `@` (no e-mail address anywhere). */
function expectNoLeak(value: unknown, values: string[] = []) {
  const json = JSON.stringify(value);
  for (const needle of [...LEAK_KEYS, ...values]) {
    expect(needle.length, `a real needle (${needle})`).toBeGreaterThan(3);
    expect(json, needle).not.toContain(needle);
  }
  expect(json, "an @ (an e-mail address)").not.toContain("@");
}

// =============================================================================
// 1. Ping
// =============================================================================

describe("ping", () => {
  test("Ping stiže samo odgovornom konobaru istog lokala", async () => {
    const env = await world();
    const { t, w, owner, other } = env;
    const A = w.a.menuServiceId;
    await t.run(async (ctx) => {
      await ctx.db.patch(w.ownerId, { name: "Mika Vlasnik" });
    });
    const { anaId, ana, marko, table } = await shift(env);
    const requestId = await addRequest(t, table, { kind: "call" });

    vi.setSystemTime(T0 + 2 * MINUTE);
    expect(await act(env, "accept", requestId, { token: ana })).toEqual({ ok: true, status: "accepted", changed: true });

    // The Owner reminds the waiter who took it.
    const sentAt = T0 + 10 * MINUTE;
    vi.setSystemTime(sentAt);
    expect(await ping(owner, A, requestId)).toEqual({ ok: true, sentAt });

    const notices = await noticeRows(t);
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({
      menuServiceId: A,
      staffId: anaId,
      kind: "ping",
      requestId,
      createdByUserId: w.ownerId,
      createdAt: sentAt,
    });
    expect(notices[0].seenAt).toBeUndefined();
    const audit = await auditRows(t, "operations.ping");
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      menuServiceId: A,
      actorKind: "user",
      actorUserId: w.ownerId,
      entityType: "menuRequests",
      entityKey: requestId,
      details: { staffId: anaId },
      createdAt: sentAt,
    });
    // Nothing is reassigned and no status changes.
    expect(await requestRow(t, requestId)).toMatchObject({
      status: "accepted",
      acceptedByStaffId: anaId,
      acceptedAt: T0 + 2 * MINUTE,
    });

    // Ana sees it, in exactly this shape.
    expect(must(await queue(env, ana)).notices).toEqual([
      {
        id: notices[0]._id,
        requestId,
        kind: "call",
        positionLabel: "Sto 12",
        requestCreatedAt: T0,
        createdAt: sentAt,
        from: "Mika Vlasnik",
      },
    ]);
    // Marko (same venue, another waiter) and an account in the waiter panel do not.
    expect(must(await queue(env, marko)).notices).toEqual([]);
    expect(must(await queue(env, undefined, { who: owner })).notices).toEqual([]);
    expect(await queue(env)).toBeNull();

    // The other venue: its waiter sees nothing of venue a.
    const jelenaId = await addStaff(env, "Jelena", "555", "b");
    const jelena = await signIn(env, "555", "b");
    const bTable = await addTable(t, w.b, "Sto 3");
    const bRequest = await addRequest(t, bTable);
    const jelenaQueue = must(await queue(env, jelena, { venue: "b" }));
    expect(jelenaQueue.notices).toEqual([]);
    expect(jelenaQueue.requests.map((row) => row.id)).toEqual([bRequest]);
    expect(await queue(env, ana, { venue: "b" })).toBeNull();

    // The other venue's Owner cannot remind about venue a: no role there, so not_found (like a missing id).
    expect(await codeOf(ping(other, A, requestId))).toBe("menu/not_found");
    // With his own venue and our request id: the request is simply not his.
    expect(await ping(other, w.b.menuServiceId, requestId)).toEqual({ ok: false, code: "request/not_found" });
    // And the Owner of a has no business with venue b.
    expect(await codeOf(ping(owner, w.b.menuServiceId, bRequest))).toBe("menu/not_found");
    expect(await noticeRows(t)).toHaveLength(1);
    expect(await auditRows(t, "operations.ping")).toHaveLength(1);

    // Venue b's own reminder reaches only venue b's waiter.
    expect(await act(env, "accept", bRequest, { token: jelena, venue: "b" })).toMatchObject({ ok: true });
    expect(await ping(other, w.b.menuServiceId, bRequest)).toMatchObject({ ok: true });
    expect(must(await queue(env, jelena, { venue: "b" })).notices.map((n) => n.requestId)).toEqual([bRequest]);
    expect(must(await queue(env, ana)).notices.map((n) => n.requestId)).toEqual([requestId]);
    expect(must(await queue(env, marko)).notices).toEqual([]);
    expect((await noticeRows(t)).map((row) => row.staffId).sort()).toEqual([anaId, jelenaId].sort());
  });

  test("an unnamed account is shown by the neutral label, never by its e-mail", async () => {
    const env = await world();
    const { anaId, ana, table } = await shift(env);
    const requestId = await held(env, table, anaId);
    await ping(env.owner, env.w.a.menuServiceId, requestId);
    const q = must(await queue(env, ana));
    expect(q.notices.map((n) => n.from)).toEqual(["Vlasnik ili menadžer"]);
    expect(JSON.stringify(q)).not.toContain("@");
  });

  test("nobody is responsible: a new request, one taken by an account, a finished, a cancelled one, a deactivated or a foreign waiter", async () => {
    const env = await world();
    const { t, w, owner } = env;
    const A = w.a.menuServiceId;
    const { ana, marko, markoId, table } = await shift(env);
    const jelenaId = await addStaff(env, "Jelena", "555", "b");

    const fresh = await addRequest(t, table);
    const byAccount = await addRequest(t, table);
    expect(await act(env, "accept", byAccount, { who: owner })).toMatchObject({ ok: true, status: "accepted" });
    const finished = await addRequest(t, table);
    await act(env, "accept", finished, { token: ana });
    expect(await act(env, "complete", finished, { token: ana })).toMatchObject({ ok: true, status: "done" });
    const cancelled = await addRequest(t, table);
    await act(env, "accept", cancelled, { token: ana });
    expect(await act(env, "cancel", cancelled, { token: ana })).toMatchObject({ ok: true, status: "cancelled" });
    const ofDeactivated = await addRequest(t, table);
    await act(env, "accept", ofDeactivated, { token: marko });
    expect(await owner.mutation(api.menuStaff.deactivate, { staffId: markoId })).toMatchObject({ ok: true });
    // A request "taken" by a member of ANOTHER venue (a corrupt row) is nobody's to remind either.
    const ofForeign = await held(env, table, jelenaId);

    const refused = { ok: false, code: "ping/no_responsible" };
    for (const requestId of [fresh, byAccount, finished, cancelled, ofDeactivated, ofForeign]) {
      expect(await ping(owner, A, requestId)).toEqual(refused);
    }
    expect(await noticeRows(t)).toHaveLength(0);
    expect(await auditRows(t, "operations.ping")).toHaveLength(0);
    // The refusals have text for the Owner's screen.
    expect(menuDomenSr.errors["ping/no_responsible"].length).toBeGreaterThan(10);
    expect(menuDomenSr.errors["ping/too_soon"].length).toBeGreaterThan(10);
  });

  test("one reminder per request per 5 minutes: too_soon with the time of the last one, allowed again at exactly +5 min", async () => {
    const env = await world();
    const { t, w, owner } = env;
    const A = w.a.menuServiceId;
    const { anaId, ana, table } = await shift(env);
    const requestId = await held(env, table, anaId);
    const another = await held(env, table, anaId);
    expect(MENU_PING_COOLDOWN_MS).toBe(5 * MINUTE);

    const first = T0 + 10 * MINUTE;
    vi.setSystemTime(first);
    expect(await ping(owner, A, requestId)).toEqual({ ok: true, sentAt: first });
    expect(await ping(owner, A, requestId)).toEqual({ ok: false, code: "ping/too_soon", lastAt: first });
    // The cooldown belongs to the request, not to who sends: a Manager is held back too.
    expect(await ping(callers(env).manager, A, requestId)).toEqual({ ok: false, code: "ping/too_soon", lastAt: first });
    // ...and it belongs to ONE request: another request of the same waiter is free.
    expect(await ping(owner, A, another)).toEqual({ ok: true, sentAt: first });
    // Closing the reminder does not shorten the cooldown.
    const [notice] = await noticeRows(t);
    expect(await seeNotice(env, ana, notice._id)).toEqual({ ok: true, changed: true });
    expect(await ping(owner, A, requestId)).toEqual({ ok: false, code: "ping/too_soon", lastAt: first });

    vi.setSystemTime(first + MENU_PING_COOLDOWN_MS - 1);
    expect(await ping(owner, A, requestId)).toEqual({ ok: false, code: "ping/too_soon", lastAt: first });
    const second = first + MENU_PING_COOLDOWN_MS;
    vi.setSystemTime(second);
    expect(await ping(owner, A, requestId)).toEqual({ ok: true, sentAt: second });
    // The next wait is counted from the latest one.
    vi.setSystemTime(second + MINUTE);
    expect(await ping(owner, A, requestId)).toEqual({ ok: false, code: "ping/too_soon", lastAt: second });

    expect(await noticeRows(t)).toHaveLength(3);
    expect(await auditRows(t, "operations.ping")).toHaveLength(3);
  });

  test("sixty reminders a minute from one account at most", { timeout: 60_000 }, async () => {
    const env = await world();
    const { t, w, owner } = env;
    const { anaId, table } = await shift(env);
    const ids = await addRequests(t, table, 61, { status: "accepted", acceptedAt: T0, acceptedByStaffId: anaId });
    const outcomes: Awaited<ReturnType<typeof ping>>[] = [];
    for (const requestId of ids) outcomes.push(await ping(owner, w.a.menuServiceId, requestId));
    expect(outcomes.slice(0, 60).every((outcome) => outcome.ok)).toBe(true);
    expect(outcomes[60]).toEqual({ ok: false, code: "staff/rate_limited" });
    expect(await noticeRows(t)).toHaveLength(60);
  });

  test("the Owner, a Manager and a ScanMe admin may remind; every other caller is refused", async () => {
    const env = await world();
    const { t, w } = env;
    const A = w.a.menuServiceId;
    const { anaId, table } = await shift(env);
    const who = callers(env);

    for (const name of ["owner", "manager", "admin"] as const) {
      const requestId = await held(env, table, anaId);
      expect(await ping(who[name], A, requestId), name).toMatchObject({ ok: true });
    }
    const sent = await noticeRows(t);
    expect(sent.map((row) => row.createdByUserId)).toEqual([w.ownerId, w.managerId, w.adminId]);
    const audit = await auditRows(t, "operations.ping");
    expect(audit.map((row) => [row.actorKind, row.actorUserId])).toEqual([
      ["user", w.ownerId],
      ["user", w.managerId],
      ["admin", w.adminId],
    ]);

    // An Urednik is a member without the permission; the rest have no role in this venue (like a missing id).
    const refusals: [Who, string][] = [
      ["editor", "menu/forbidden"],
      ["finance", "menu/not_found"],
      ["viewOnly", "menu/not_found"],
      ["outsider", "menu/not_found"],
      ["otherOwner", "menu/not_found"],
      ["anonymous", "menu/unauthenticated"],
    ];
    const target = await held(env, table, anaId);
    for (const [name, code] of refusals) {
      expect(await codeOf(ping(who[name], A, target)), name).toBe(code);
    }
    expect(await noticeRows(t)).toHaveLength(3);
    expect(await auditRows(t, "operations.ping")).toHaveLength(3);
  });
});

// =============================================================================
// 2. seeNotice ("U redu")
// =============================================================================

describe("seeNotice", () => {
  test("the waiter closes her reminder once: seenAt is set, it leaves the queue, a second close changes nothing", async () => {
    const env = await world();
    const { t } = env;
    const s = await pinged(env);
    expect(must(await queue(env, s.ana)).notices).toHaveLength(1);
    // The query never reads the clock: the device decides how old is too old.
    vi.setSystemTime(T0 + 3 * HOUR);
    expect(must(await queue(env, s.ana)).notices).toHaveLength(1);

    const closedAt = T0 + 12 * MINUTE;
    vi.setSystemTime(closedAt);
    expect(await seeNotice(env, s.ana, s.noticeId)).toEqual({ ok: true, changed: true });
    expect((await noticeRow(t, s.noticeId))?.seenAt).toBe(closedAt);
    expect(must(await queue(env, s.ana)).notices).toEqual([]);

    vi.setSystemTime(closedAt + MINUTE);
    expect(await seeNotice(env, s.ana, s.noticeId)).toEqual({ ok: true, changed: false });
    expect((await noticeRow(t, s.noticeId))?.seenAt).toBe(closedAt);
    // Closing a reminder is not an action on the request.
    expect(await requestRow(t, s.requestId)).toMatchObject({ status: "accepted", acceptedByStaffId: s.anaId });
  });

  test("nobody else closes it: another waiter, an account, another venue, a missing one — all menu/not_found, the reminder stays unseen", async () => {
    const env = await world();
    const { t, owner } = env;
    const s = await pinged(env);
    const notFound = { ok: false, code: "menu/not_found" };
    await addStaff(env, "Jelena", "555", "b");
    const jelena = await signIn(env, "555", "b");

    expect(await seeNotice(env, s.marko, s.noticeId)).toEqual(notFound);
    expect(await seeNotice(env, undefined, s.noticeId, { who: owner })).toEqual(notFound);
    expect(await seeNotice(env, undefined, s.noticeId, { who: callers(env).manager })).toEqual(notFound);
    expect(await seeNotice(env, jelena, s.noticeId, { venue: "b" })).toEqual(notFound);

    const gone = await t.run(async (ctx) => {
      const id = await ctx.db.insert("menuStaffNotices", {
        menuServiceId: env.w.a.menuServiceId,
        staffId: s.anaId,
        kind: "ping",
        requestId: s.requestId,
        createdByUserId: env.w.ownerId,
        createdAt: Date.now(),
      });
      await ctx.db.delete(id);
      return id;
    });
    expect(await seeNotice(env, s.ana, gone)).toEqual(notFound);

    expect((await noticeRow(t, s.noticeId))?.seenAt).toBeUndefined();
    expect(must(await queue(env, s.ana)).notices).toHaveLength(1);
  });

  test("signed out is staff/signed_out: a bad or foreign token, no token, a logged-out waiter", async () => {
    const env = await world();
    const { t } = env;
    const s = await pinged(env);
    const signedOut = { ok: false, code: "staff/signed_out" };
    await addStaff(env, "Jelena", "555", "b");

    expect(await seeNotice(env, BOGUS_TOKEN, s.noticeId)).toEqual(signedOut);
    expect(await seeNotice(env, "nope", s.noticeId)).toEqual(signedOut);
    expect(await seeNotice(env, undefined, s.noticeId)).toEqual(signedOut);
    expect(await seeNotice(env, s.ana, s.noticeId, { venue: "b" })).toEqual(signedOut);

    const logout = await t.mutation(api.menuWaiter.logout, { slug: SLUG_A, panelCode: env.code, sessionToken: s.ana });
    expect(logout).toEqual({ ok: true });
    expect(await seeNotice(env, s.ana, s.noticeId)).toEqual(signedOut);
    expect((await noticeRow(t, s.noticeId))?.seenAt).toBeUndefined();
  });
});

// =============================================================================
// 3. The reminders in the waiter's queue
// =============================================================================

describe("notices in the waiter queue", () => {
  test("a reminder only counts while the waiter still holds the request: finished and cancelled ones disappear", async () => {
    const env = await world();
    const { t, w, owner } = env;
    const { anaId, ana, table } = await shift(env);
    const finished = await held(env, table, anaId);
    const cancelled = await held(env, table, anaId);
    const open = await held(env, table, anaId);
    for (const requestId of [finished, cancelled, open]) {
      expect(await ping(owner, w.a.menuServiceId, requestId)).toMatchObject({ ok: true });
    }
    expect(must(await queue(env, ana)).notices).toHaveLength(3);

    expect(await act(env, "complete", finished, { token: ana })).toMatchObject({ ok: true, status: "done" });
    expect(await act(env, "cancel", cancelled, { token: ana })).toMatchObject({ ok: true, status: "cancelled" });
    expect(must(await queue(env, ana)).notices.map((n) => n.requestId)).toEqual([open]);
    // The rows are kept (unseen), they just no longer point at anything to remind about.
    expect((await noticeRows(t)).filter((row) => row.seenAt === undefined)).toHaveLength(3);
  });

  test("at most 5 unseen reminders, the newest first; closing one lets the next older one in", async () => {
    const env = await world();
    const { t, w, owner } = env;
    const { anaId, ana, table } = await shift(env);
    const ids = await addRequests(t, table, 7, { status: "accepted", acceptedAt: T0, acceptedByStaffId: anaId });
    for (const [index, requestId] of ids.entries()) {
      vi.setSystemTime(T0 + 10 * MINUTE + index * 1000);
      expect(await ping(owner, w.a.menuServiceId, requestId)).toMatchObject({ ok: true });
    }
    expect(MENU_MAX_STAFF_NOTICES).toBe(5);

    const newestFirst = [...ids].reverse();
    const first = must(await queue(env, ana)).notices;
    expect(first.map((n) => n.requestId)).toEqual(newestFirst.slice(0, 5));

    expect(await seeNotice(env, ana, first[0].id)).toEqual({ ok: true, changed: true });
    expect(must(await queue(env, ana)).notices.map((n) => n.requestId)).toEqual(newestFirst.slice(1, 6));
  });

  test("the queue carries no device pseudonym, hash, token or e-mail", async () => {
    const env = await world();
    const { t, w, owner } = env;
    const { anaId, ana, marko, table } = await shift(env);
    await addRequest(t, table, { kind: "order", itemCount: 2, totalRsd: 640 });
    const requestId = await held(env, table, anaId);
    await ping(owner, w.a.menuServiceId, requestId);

    const secrets = [GUEST_DEVICE, ana, marko, env.code, ...(await secretsOf(t))];
    for (const token of [ana, marko, undefined]) {
      const result = await queue(env, token, { who: token === undefined ? owner : undefined });
      expect(JSON.stringify(result)).toContain("Sto 12"); // it is the real queue, not an empty one
      expectNoLeak(result, secrets);
    }
  });
});

// =============================================================================
// 4. operations
// =============================================================================

describe("operations", () => {
  test("the Owner, a Manager and a ScanMe admin get the overview; every other caller gets null", async () => {
    const env = await world();
    const { w } = env;
    const A = w.a.menuServiceId;
    const { table } = await shift(env);
    await addRequest(env.t, table);
    const who = callers(env);

    for (const name of ["owner", "manager", "admin"] as const) {
      const ops = await operations(who[name], A);
      expect(ops, name).not.toBeNull();
      expect(ops?.requests, name).toHaveLength(1);
    }
    for (const name of ["editor", "finance", "viewOnly", "outsider", "otherOwner", "anonymous"] as const) {
      expect(await operations(who[name], A), name).toBeNull();
    }
    // The other venue's Owner reads his own venue, which holds none of ours.
    expect(must(await operations(who.otherOwner, w.b.menuServiceId)).requests).toEqual([]);
    // A malformed time is a refusal, not an error.
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(await operations(who.owner, A, bad), String(bad)).toBeNull();
    }
  });

  test("rows say who took the request and what became of the last reminder", async () => {
    const env = await world();
    const { t, w, owner } = env;
    const A = w.a.menuServiceId;
    await t.run(async (ctx) => {
      await ctx.db.patch(w.ownerId, { name: "Mika Vlasnik" });
    });
    const { anaId, ana, table } = await shift(env);
    const zoneId = must(table.zoneId, "the zone of the table");
    const fresh = await addRequest(t, table, { kind: "call", createdAt: T0 + 1000 });
    const byAna = await addRequest(t, table, { kind: "order", createdAt: T0, itemCount: 2, subtotalRsd: 640, totalRsd: 640 });
    const byOwner = await addRequest(t, table, { kind: "bill", paymentPreference: "card", createdAt: T0 + 2000 });
    await addRequest(t, table, { status: "done", doneAt: T0 });
    await addRequest(t, table, { status: "cancelled", cancelledAt: T0, cancelledBy: "guest" });

    vi.setSystemTime(T0 + 2 * MINUTE);
    await act(env, "accept", byAna, { token: ana });
    await act(env, "accept", byOwner, { who: owner });

    let ops = must(await operations(owner, A));
    // Only Novi and Prihvaćen, the new ones first, each oldest first.
    expect(ops.requests.map((row) => row.id)).toEqual([fresh, byAna, byOwner]);
    expect(ops.truncated).toBe(false);
    expect(ops.requests[0]).toEqual({
      id: fresh,
      kind: "call",
      status: "new",
      channel: "standard",
      positionLabel: "Sto 12",
      zoneId,
      zoneName: "Terasa",
      createdAt: T0 + 1000,
      acceptedAt: null,
      paymentPreference: null,
      itemCount: null,
      totalRsd: null,
      acceptedBy: null,
      lastPing: null,
    });
    expect(ops.requests[1]).toEqual({
      id: byAna,
      kind: "order",
      status: "accepted",
      channel: "standard",
      positionLabel: "Sto 12",
      zoneId,
      zoneName: "Terasa",
      createdAt: T0,
      acceptedAt: T0 + 2 * MINUTE,
      paymentPreference: null,
      itemCount: 2,
      totalRsd: 640,
      acceptedBy: { kind: "staff", staffId: anaId, name: "Ana" },
      lastPing: null,
    });
    expect(ops.requests[2]).toMatchObject({
      kind: "bill",
      paymentPreference: "card",
      itemCount: null,
      totalRsd: null,
      acceptedBy: { kind: "account", name: "Mika Vlasnik" },
    });

    // A reminder: sent, then seen, then a newer one replaces it.
    const first = T0 + 10 * MINUTE;
    vi.setSystemTime(first);
    expect(await ping(owner, A, byAna)).toEqual({ ok: true, sentAt: first });
    ops = must(await operations(owner, A));
    expect(ops.requests[1].lastPing).toEqual({ at: first, seen: false });
    expect(ops.requests[0].lastPing).toBeNull();
    expect(ops.requests[2].lastPing).toBeNull();

    const [notice] = await noticeRows(t);
    vi.setSystemTime(first + MINUTE);
    expect(await seeNotice(env, ana, notice._id)).toEqual({ ok: true, changed: true });
    ops = must(await operations(owner, A));
    expect(ops.requests[1].lastPing).toEqual({ at: first, seen: true });

    const second = first + 6 * MINUTE;
    vi.setSystemTime(second);
    expect(await ping(owner, A, byAna)).toEqual({ ok: true, sentAt: second });
    ops = must(await operations(owner, A));
    expect(ops.requests[1].lastPing).toEqual({ at: second, seen: false });

    // A reminder from before `fromMs` is old news.
    await t.run(async (ctx) => {
      await ctx.db.insert("menuStaffNotices", {
        menuServiceId: A,
        staffId: anaId,
        kind: "ping",
        requestId: byOwner,
        createdByUserId: w.ownerId,
        createdAt: FROM_MS - 1,
      });
    });
    ops = must(await operations(owner, A));
    expect(ops.requests[2].lastPing).toBeNull();
    expect(must(await operations(owner, A, FROM_MS - 2)).requests[2].lastPing).toEqual({ at: FROM_MS - 1, seen: false });
  });

  test("a request taken by a waiter who was deactivated since still names her", async () => {
    const env = await world();
    const { owner } = env;
    const { anaId, table } = await shift(env);
    const requestId = await held(env, table, anaId);
    await owner.mutation(api.menuStaff.deactivate, { staffId: anaId });
    const ops = must(await operations(owner, env.w.a.menuServiceId));
    expect(ops.requests.find((row) => row.id === requestId)?.acceptedBy).toEqual({ kind: "staff", staffId: anaId, name: "Ana" });
  });

  test("onShift lists the PIN staff signed in (name, zone, since), not the logged-out, deactivated or long-expired", async () => {
    const env = await world();
    const { t, w, owner } = env;
    const A = w.a.menuServiceId;
    const anaId = await addStaff(env, "Ana", "246");
    const markoId = await addStaff(env, "Marko", "135");
    const petarId = await addStaff(env, "Petar", "357");
    const table = await addTable(t, w.a, "Sto 12", "Terasa");
    expect(must(await operations(owner, A)).onShift).toEqual([]);

    const ana = await signIn(env, "246"); // T0
    vi.setSystemTime(T0 + MINUTE);
    const marko = await signIn(env, "135");
    vi.setSystemTime(T0 + 2 * MINUTE);
    await signIn(env, "357");
    expect(
      await t.mutation(api.menuWaiter.setMyZone, { ...panel(env, ana), zoneId: must(table.zoneId, "the zone of the table") }),
    ).toEqual({ ok: true, changed: true });

    expect(must(await operations(owner, A)).onShift).toEqual([
      { staffId: anaId, name: "Ana", zoneName: "Terasa", since: T0, expiresAt: T0 + STAFF_SESSION_MS },
      { staffId: markoId, name: "Marko", zoneName: null, since: T0 + MINUTE, expiresAt: T0 + MINUTE + STAFF_SESSION_MS },
      { staffId: petarId, name: "Petar", zoneName: null, since: T0 + 2 * MINUTE, expiresAt: T0 + 2 * MINUTE + STAFF_SESSION_MS },
    ]);

    // Marko signs out, Petar is deactivated: both leave.
    expect(await t.mutation(api.menuWaiter.logout, { slug: SLUG_A, panelCode: env.code, sessionToken: marko })).toEqual({ ok: true });
    expect(await owner.mutation(api.menuStaff.deactivate, { staffId: petarId })).toMatchObject({ ok: true });
    expect(must(await operations(owner, A)).onShift.map((row) => row.name)).toEqual(["Ana"]);

    // A session that expired exactly at `fromMs` is not read; one expiring a moment later is (the device compares with its clock).
    const sessionId = await t.run(async (ctx) => {
      return await ctx.db.insert("menuStaffSessions", {
        menuServiceId: A,
        staffId: markoId,
        deviceKeyHash: "old-device",
        tokenHash: "old-session-token-hash",
        createdAt: FROM_MS - 11 * HOUR,
        expiresAt: FROM_MS,
      });
    });
    expect(must(await operations(owner, A)).onShift.map((row) => row.name)).toEqual(["Ana"]);
    await t.run(async (ctx) => {
      await ctx.db.patch(sessionId, { expiresAt: FROM_MS + 1 });
    });
    // Oldest sign-in first.
    expect(must(await operations(owner, A)).onShift.map((row) => row.name)).toEqual(["Marko", "Ana"]);

    // Another venue's waiter is never on our shift.
    const jelenaId = await addStaff(env, "Jelena", "555", "b");
    await signIn(env, "555", "b");
    expect(must(await operations(owner, A)).onShift.map((row) => row.name)).toEqual(["Marko", "Ana"]);
    expect(must(await operations(env.other, w.b.menuServiceId)).onShift.map((row) => row.staffId)).toEqual([jelenaId]);
  });

  test("one person on two devices is one entry, with the later session", async () => {
    const env = await world();
    const { owner } = env;
    const anaId = await addStaff(env, "Ana", "246");
    await signIn(env, "246");
    vi.setSystemTime(T0 + MINUTE);
    await signIn(env, "246"); // another phone, another device: both sessions are live

    const live = await env.t.run(async (ctx) => (await ctx.db.query("menuStaffSessions").take(10)).filter((row) => row.endedAt === undefined));
    expect(live).toHaveLength(2);
    expect(must(await operations(owner, env.w.a.menuServiceId)).onShift).toEqual([
      { staffId: anaId, name: "Ana", zoneName: null, since: T0 + MINUTE, expiresAt: T0 + MINUTE + STAFF_SESSION_MS },
    ]);
  });

  test("zones are the active ones in order, empty when the venue has none; an archived zone loses its name on the row", async () => {
    const env = await world();
    const { t, w, owner } = env;
    const A = w.a.menuServiceId;
    const bare = await addTable(t, w.a, "Sto 1");
    await addRequest(t, bare);
    expect(must(await operations(owner, A)).zones).toEqual([]);

    const terasa = await addTable(t, w.a, "Sto 2", "Terasa"); // order 0
    const extra = await t.run(async (ctx) => {
      const now = Date.now();
      const zone = (name: string, order: number, active: boolean) =>
        ctx.db.insert("menuZones", {
          menuServiceId: A,
          key: `zn_extra_${order}`,
          name,
          nameNormalized: name.toLowerCase(),
          order,
          active,
          createdAt: now,
          updatedAt: now,
        });
      return { basta: await zone("Bašta", 1, true), stara: await zone("Stara sala", 2, false) };
    });
    expect(must(await operations(owner, A)).zones).toEqual([
      { id: must(terasa.zoneId, "the zone of the table"), name: "Terasa" },
      { id: extra.basta, name: "Bašta" },
    ]);

    const onTerasa = await addRequest(t, terasa);
    expect(must(await operations(owner, A)).requests.find((row) => row.id === onTerasa)).toMatchObject({
      zoneId: terasa.zoneId,
      zoneName: "Terasa",
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(must(terasa.zoneId), { active: false });
    });
    const ops = must(await operations(owner, A));
    expect(ops.requests.find((row) => row.id === onTerasa)).toMatchObject({ zoneId: terasa.zoneId, zoneName: null });
    expect(ops.zones.map((zone) => zone.name)).toEqual(["Bašta"]);
  });

  test("at most 300 requests per status, oldest first, with truncated: true", { timeout: 60_000 }, async () => {
    const env = await world();
    const { t, w, owner } = env;
    const A = w.a.menuServiceId;
    const table = await addTable(t, w.a, "Sto 12");
    expect(MENU_MAX_ACTIVE_REQUESTS).toBe(300);

    await addRequests(t, table, 300); // exactly the ceiling
    let ops = must(await operations(owner, A));
    expect(ops.requests).toHaveLength(300);
    expect(ops.truncated).toBe(false);

    await addRequest(t, table, { createdAt: T0 + 300 * 1000 }); // the 301st `new`
    ops = must(await operations(owner, A));
    expect(ops.requests).toHaveLength(300);
    expect(ops.truncated).toBe(true);
    expect(ops.requests[0].createdAt).toBe(T0);
    expect(ops.requests[299].createdAt).toBe(T0 + 299 * 1000); // the newest one is the one cut

    // The accepted ones are a separate budget: new requests do not push them out.
    await addRequests(t, table, 2, { status: "accepted", acceptedAt: T0 });
    ops = must(await operations(owner, A));
    expect(ops.requests).toHaveLength(302);
    expect(ops.requests.filter((row) => row.status === "accepted")).toHaveLength(2);
    expect(ops.truncated).toBe(true);
  });

  test("reservations: waiting ones whatever the date, accepted and arrived ones in the window; only the five safe fields", async () => {
    const env = await world();
    const { t, w, owner } = env;
    const A = w.a.menuServiceId;
    const WINDOW = MENU_RESERVATION_PANEL_WINDOW_MS;
    const at = async (status: Doc<"menuReservations">["status"], requestedAt: number, fields: ReservationFields = {}) =>
      await addReservation(t, w.a, { status, requestedAt, ...fields });

    const waitingPast = await at("new", FROM_MS - 40 * DAY);
    const waitingFuture = await at("new", FROM_MS + 40 * DAY);
    const proposed = await at("change_proposed", FROM_MS + HOUR);
    const acceptedFirst = await at("accepted", FROM_MS, { positionLabel: "Sto 5" });
    const acceptedLast = await at("accepted", FROM_MS + WINDOW - 1);
    const arrivedFirst = await at("arrived", FROM_MS);
    const arrivedLate = await at("arrived", FROM_MS + 100 * DAY);
    // Outside: accepted before / at the end of the window, arrived before it, declined, cancelled, another venue's.
    await at("accepted", FROM_MS - 1);
    await at("accepted", FROM_MS + WINDOW);
    await at("arrived", FROM_MS - 1);
    await at("declined", FROM_MS + HOUR);
    await at("cancelled", FROM_MS + HOUR);
    await addReservation(t, w.b, { status: "new", requestedAt: FROM_MS + HOUR });

    const ops = must(await operations(owner, A));
    expect(ops.reservations.map((row) => row.id).sort()).toEqual(
      [waitingPast, waitingFuture, proposed, acceptedFirst, acceptedLast, arrivedFirst, arrivedLate].sort(),
    );
    expect(ops.reservationsTruncated).toBe(false);
    for (const row of ops.reservations) {
      expect(Object.keys(row).sort()).toEqual(["id", "partySize", "positionLabel", "requestedAt", "status"]);
    }
    expect(ops.reservations.find((row) => row.id === acceptedFirst)).toEqual({
      id: acceptedFirst,
      status: "accepted",
      requestedAt: FROM_MS,
      partySize: 4,
      positionLabel: "Sto 5",
    });
    expect(ops.reservations.find((row) => row.id === waitingPast)?.positionLabel).toBeNull();
    expectNoLeak(ops, ["marija.gost", "Marija Gost", "+381 60", "Slavimo rodjendan", "cancel-token-hash-secret", GUEST_DEVICE]);
  });

  test("reservations: at most 200 per status, with reservationsTruncated", { timeout: 60_000 }, async () => {
    const env = await world();
    const { t, w, owner } = env;
    expect(MENU_MAX_PANEL_RESERVATIONS).toBe(200);
    await t.run(async (ctx) => {
      const now = Date.now();
      for (let index = 0; index < MENU_MAX_PANEL_RESERVATIONS + 1; index += 1) {
        await ctx.db.insert("menuReservations", {
          menuServiceId: w.a.menuServiceId,
          businessId: w.a.businessId,
          status: "new",
          guestName: "Marija Gost",
          partySize: 2,
          requestedAt: FROM_MS + DAY + index * MINUTE,
          cancelTokenHash: `cancel-token-hash-bulk-${index}`,
          createdAt: now,
          updatedAt: now,
        });
      }
    });
    const ops = must(await operations(owner, w.a.menuServiceId));
    expect(ops.reservations).toHaveLength(200);
    expect(ops.reservationsTruncated).toBe(true);
  });

  test("nothing a guest or a secret owns leaves through operations, whoever asks", async () => {
    const env = await world();
    const { t, w, owner } = env;
    const A = w.a.menuServiceId;
    const { anaId, ana, marko, table } = await shift(env);
    const order = await addRequest(t, table, { kind: "order", itemCount: 1, subtotalRsd: 450, totalRsd: 450, sourceLabel: "Kartica 12-B" });
    await t.run(async (ctx) => {
      await ctx.db.insert("menuRequestItems", {
        requestId: order,
        menuServiceId: A,
        articleKey: "ar_test1",
        name: "Pljeskavica",
        addons: [],
        unitPriceRsd: 450,
        quantity: 1,
        lineTotalRsd: 450,
        note: "Bez luka molim",
        order: 0,
      });
    });
    const byAna = await held(env, table, anaId);
    await ping(owner, A, byAna);
    await addReservation(t, w.a, { status: "new" });
    await addReservation(t, w.a, { status: "accepted", positionLabel: "Sto 5" });

    const secrets = [
      GUEST_DEVICE,
      ana,
      marko,
      env.code,
      "marija.gost",
      "Marija Gost",
      "+381 60",
      "Slavimo rodjendan",
      "cancel-token-hash-secret",
      "Bez luka molim",
      "Kartica 12-B",
      ...(await secretsOf(t)),
    ];
    const who = callers(env);
    for (const name of ["owner", "manager", "admin"] as const) {
      const ops = await operations(who[name], A);
      expect(ops?.requests.length, name).toBeGreaterThan(0);
      expect(ops?.reservations.length, name).toBeGreaterThan(0);
      expect(ops?.onShift.length, name).toBeGreaterThan(0);
      expectNoLeak(ops, secrets);
    }
    // The guest's phone-side fields are absent by key, and the note of a reservation too.
    expect(JSON.stringify(must(await operations(owner, A)))).not.toContain('"note"');
  });

  test("the venue's own thresholds are passed on; the defaults are 15 and 15 minutes", async () => {
    const env = await world();
    const { w, owner } = env;
    const A = w.a.menuServiceId;
    expect(must(await operations(owner, A))).toMatchObject({ lateThresholdMin: 15, holdMinutes: 15 });
    await owner.mutation(api.menuSettings.setPanelTiming, { menuServiceId: A, lateThresholdMin: 20, reminderMin: 5 });
    await owner.mutation(api.menuSettings.setReservationHold, { menuServiceId: A, holdMinutes: 30 });
    expect(must(await operations(owner, A))).toMatchObject({ lateThresholdMin: 20, holdMinutes: 30 });
    // The other venue keeps its defaults.
    expect(must(await operations(env.other, w.b.menuServiceId))).toMatchObject({ lateThresholdMin: 15, holdMinutes: 15 });
  });

  test("another venue's requests, staff and reservations never show up", async () => {
    const env = await world();
    const { t, w, owner, other } = env;
    const { table } = await shift(env);
    const mine = await addRequest(t, table);
    const bTable = await addTable(t, w.b, "Sto 3", "Bašta");
    const theirs = await addRequest(t, bTable);
    await addStaff(env, "Jelena", "555", "b");
    await signIn(env, "555", "b");
    const bReservation = await addReservation(t, w.b, { status: "new" });

    const ops = must(await operations(owner, w.a.menuServiceId));
    expect(ops.requests.map((row) => row.id)).toEqual([mine]);
    expect(ops.onShift.map((row) => row.name).sort()).toEqual(["Ana", "Marko"]);
    expect(ops.zones.map((zone) => zone.name)).toEqual(["Terasa"]);
    expect(ops.reservations).toEqual([]);

    const theirOps = must(await operations(other, w.b.menuServiceId));
    expect(theirOps.requests.map((row) => row.id)).toEqual([theirs]);
    expect(theirOps.onShift.map((row) => row.name)).toEqual(["Jelena"]);
    expect(theirOps.reservations.map((row) => row.id)).toEqual([bReservation]);
  });
});

// =============================================================================
// 5. requestDetail
// =============================================================================

describe("requestDetail", () => {
  async function addLine(
    t: T,
    request: { id: Id<"menuRequests">; menuServiceId: Id<"menuServices"> },
    line: Partial<Omit<Doc<"menuRequestItems">, "_id" | "_creationTime">> & { name: string; order: number },
  ) {
    return await t.run(async (ctx) => {
      return await ctx.db.insert("menuRequestItems", {
        requestId: request.id,
        menuServiceId: request.menuServiceId,
        articleKey: `ar_test${line.order}`,
        addons: [],
        unitPriceRsd: 100,
        quantity: 1,
        lineTotalRsd: 100,
        ...line,
      });
    });
  }

  test("the Owner reads the lines of an order in their order; the guest's own fields stay out", async () => {
    const env = await world();
    const { t, w, owner } = env;
    const A = w.a.menuServiceId;
    const { table } = await shift(env);
    const orderId = await addRequest(t, table, {
      kind: "order",
      itemCount: 3,
      subtotalRsd: 1250,
      deliveryFeeRsd: 150,
      totalRsd: 1400,
      sourceLabel: "Kartica 12-B",
    });
    const request = { id: orderId, menuServiceId: A };
    // Inserted out of order on purpose.
    await addLine(t, request, { name: "Espreso", order: 2, unitPriceRsd: 150, lineTotalRsd: 150 });
    await addLine(t, request, { name: "Jelen pivo", order: 0, unitPriceRsd: 200, lineTotalRsd: 200 });
    await addLine(t, request, {
      name: "Pljeskavica",
      order: 1,
      variantKey: "va_test1",
      variantName: "Velika",
      unitPriceRsd: 450,
      quantity: 2,
      lineTotalRsd: 900,
      promoApplied: true,
      note: "Bez luka",
      addons: [
        { groupKey: "ag_test1", groupName: "Prilozi", optionKey: "ao_test1", optionName: "Pomfrit", priceDeltaRsd: 0 },
        { groupKey: "ag_test1", groupName: "Prilozi", optionKey: "ao_test2", optionName: "Kajmak", priceDeltaRsd: 60 },
      ],
    });

    const detail = await detailOf(owner, A, orderId);
    expect(detail).toEqual({
      sourceLabel: "Kartica 12-B",
      subtotalRsd: 1250,
      deliveryFeeRsd: 150,
      items: [
        { name: "Jelen pivo", variantName: null, addons: [], quantity: 1, lineTotalRsd: 200, note: null },
        { name: "Pljeskavica", variantName: "Velika", addons: ["Pomfrit", "Kajmak"], quantity: 2, lineTotalRsd: 900, note: "Bez luka" },
        { name: "Espreso", variantName: null, addons: [], quantity: 1, lineTotalRsd: 150, note: null },
      ],
    });
    expectNoLeak(detail, [GUEST_DEVICE, ...(await secretsOf(t))]);

    // A call has no lines; a finished request can still be opened.
    const call = await addRequest(t, table, { status: "done", doneAt: T0 });
    expect(await detailOf(owner, A, call)).toEqual({ sourceLabel: null, subtotalRsd: null, deliveryFeeRsd: null, items: [] });
  });

  test("the Owner, a Manager and a ScanMe admin read it; the others and other venues get null", async () => {
    const env = await world();
    const { t, w } = env;
    const A = w.a.menuServiceId;
    const { table } = await shift(env);
    const mine = await addRequest(t, table, { kind: "order" });
    const bTable = await addTable(t, w.b, "Sto 3");
    const theirs = await addRequest(t, bTable, { kind: "order" });
    const who = callers(env);

    for (const name of ["owner", "manager", "admin"] as const) {
      expect(await detailOf(who[name], A, mine), name).not.toBeNull();
    }
    for (const name of ["editor", "finance", "viewOnly", "outsider", "otherOwner", "anonymous"] as const) {
      expect(await detailOf(who[name], A, mine), name).toBeNull();
    }
    // A request of another venue, asked through our venue or through its own with our role.
    expect(await detailOf(who.owner, A, theirs)).toBeNull();
    expect(await detailOf(who.otherOwner, w.b.menuServiceId, mine)).toBeNull();
    expect(await detailOf(who.owner, w.b.menuServiceId, theirs)).toBeNull();
    expect(await detailOf(who.otherOwner, w.b.menuServiceId, theirs)).not.toBeNull();

    // A deleted request is the same null.
    await t.run(async (ctx) => {
      await ctx.db.delete(mine);
    });
    expect(await detailOf(who.owner, A, mine)).toBeNull();
  });
});
