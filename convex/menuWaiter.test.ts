/// <reference types="vite/client" />

// ScanMe Menu V1 — K22: the waiter panel (master §8.4, §10; plan K19 §4.3,
// K19-13…K19-17): entry, PIN sign-in with its device / venue / network limits,
// the 12 hour staff session, the live work queue, the request detail and the
// transitions Preuzmi / Završi / Otkaži. Staff management (convex/menuStaff.ts)
// is used only for setup.
//
// Time is frozen (fake timers, T0) so every deadline is asserted exactly; the
// clock moves with vi.setSystemTime, and only the expiry test fires the
// scheduler. Fictional tenants only (the repo is public): "Kafana kod Mike"
// (tenant a), "Demo restoran" (tenant b); people are "Ana", "Marko", "Jelena".

import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import { PIN_LOCK_MS, PIN_WINDOW_MS, STAFF_SESSION_MS } from "../lib/menu/pin-policy";
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

const T0 = Date.UTC(2026, 9, 21, 10, 0, 0);
const MINUTE = 60_000;
/** A PIN nobody has in tenant a (Ana 246, Marko 135). */
const WRONG = "999";
/** The pseudonym of the guest's phone: it must never reach a waiter's screen. */
const GUEST_DEVICE = "guest-device-pseudonym-6f2c1a";
/** An IP bucket key: 32 lowercase hex characters. */
const ip = (n: number) => n.toString(16).padStart(32, "0");

// -----------------------------------------------------------------------------
// World, staff, sign-in
// -----------------------------------------------------------------------------

type Env = {
  t: T;
  w: MenuWorldSeed;
  owner: ReturnType<typeof as>;
  /** The panel code of tenant a / tenant b. */
  code: string;
  bCode: string;
};

async function world(): Promise<Env> {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  const t = newTest();
  const w = await t.run(async (ctx) => await seedMenuWorld(ctx));
  const owner = as(t, w.ownerId);
  const { code } = await owner.mutation(api.menuStaff.ensurePanelCode, { menuServiceId: w.a.menuServiceId });
  const other = as(t, w.otherOwnerId);
  const { code: bCode } = await other.mutation(api.menuStaff.ensurePanelCode, { menuServiceId: w.b.menuServiceId });
  return { t, w, owner, code, bCode };
}

type Venue = "a" | "b";

async function addStaff(
  env: Env,
  displayName: string,
  pin?: string,
  options: { venue?: Venue; panelRole?: "staff" | "manager" } = {},
) {
  const b = options.venue === "b";
  const who = b ? as(env.t, env.w.otherOwnerId) : env.owner;
  const { staffId } = await who.mutation(api.menuStaff.create, {
    menuServiceId: b ? env.w.b.menuServiceId : env.w.a.menuServiceId,
    displayName,
    ...(options.panelRole ? { panelRole: options.panelRole } : {}),
  });
  if (pin) await who.mutation(api.menuStaff.setPin, { staffId, pin });
  return staffId;
}

function panel(env: Env, sessionToken?: string, venue: Venue = "a") {
  return {
    slug: venue === "b" ? SLUG_B : SLUG_A,
    panelCode: venue === "b" ? env.bCode : env.code,
    ...(sessionToken !== undefined ? { sessionToken } : {}),
  };
}

type LoginOptions = { deviceToken?: string; ipHash?: string; venue?: Venue };

function login(env: Env, pin: string, options: LoginOptions = {}) {
  const { slug, panelCode } = panel(env, undefined, options.venue);
  return env.t.mutation(api.menuWaiter.loginWithPin, {
    slug,
    panelCode,
    pin,
    ...(options.deviceToken ? { deviceToken: options.deviceToken } : {}),
    ...(options.ipHash ? { ipHash: options.ipHash } : {}),
  });
}
type Login = Awaited<ReturnType<typeof login>>;

async function signIn(env: Env, pin: string, options: LoginOptions = {}) {
  const outcome = await login(env, pin, options);
  if (!outcome.ok) throw new Error(`sign-in refused: ${JSON.stringify(outcome)}`);
  return outcome;
}

function deviceOf(outcome: Login): string {
  if (!("deviceToken" in outcome)) throw new Error(`no device token in ${JSON.stringify(outcome)}`);
  return outcome.deviceToken;
}

// -----------------------------------------------------------------------------
// Panel calls
// -----------------------------------------------------------------------------

type Opts = { venue?: Venue; who?: Caller };

const getMe = (env: Env, token?: string, o: Opts = {}) =>
  (o.who ?? env.t).query(api.menuWaiter.me, panel(env, token, o.venue));
const getQueue = (env: Env, token?: string, o: Opts = {}) =>
  (o.who ?? env.t).query(api.menuWaiter.activeRequests, panel(env, token, o.venue));
const getDetail = (env: Env, token: string | undefined, requestId: Id<"menuRequests">, o: Opts = {}) =>
  (o.who ?? env.t).query(api.menuWaiter.requestDetail, { ...panel(env, token, o.venue), requestId });

type ActionName = "accept" | "complete" | "cancel";

function act(
  env: Env,
  name: ActionName,
  requestId: Id<"menuRequests">,
  o: Opts & { token?: string; expectedStatus?: Doc<"menuRequests">["status"] } = {},
) {
  const who = o.who ?? env.t;
  const args = { ...panel(env, o.token, o.venue), requestId };
  if (name === "cancel") {
    return who.mutation(api.menuWaiter.cancel, { ...args, ...(o.expectedStatus ? { expectedStatus: o.expectedStatus } : {}) });
  }
  return who.mutation(name === "accept" ? api.menuWaiter.accept : api.menuWaiter.complete, args);
}

// -----------------------------------------------------------------------------
// Reading rows back
// -----------------------------------------------------------------------------

const sessionRows = (t: T) => t.run(async (ctx) => await ctx.db.query("menuStaffSessions").take(100));
const attemptRows = (t: T) => t.run(async (ctx) => await ctx.db.query("menuPinAttempts").take(100));
const requestRow = (t: T, id: Id<"menuRequests">) => t.run(async (ctx) => await ctx.db.get(id));

async function auditRows(t: T, action: string) {
  const rows = await t.run(async (ctx) => await ctx.db.query("menuAuditLog").take(1000));
  return rows.filter((row) => row.action === action);
}

// -----------------------------------------------------------------------------
// Tables and requests (what K20/K21 would have written)
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
      expiresAt: now + 3 * 60 * MINUTE,
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
      const now = Date.now();
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
          updatedAt: now,
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

/** Ana (246) and Marko (135) on the floor, both signed in, and a table "Sto 12" in zone "Terasa". */
async function shift(env: Env) {
  const anaId = await addStaff(env, "Ana", "246");
  const markoId = await addStaff(env, "Marko", "135");
  const ana = (await signIn(env, "246")).sessionToken;
  const marko = (await signIn(env, "135")).sessionToken;
  const table = await addTable(env.t, env.w.a, "Sto 12", "Terasa");
  return { anaId, markoId, ana, marko, table };
}

// =============================================================================
// 1. Entry
// =============================================================================

describe("entry", () => {
  test("panelEntry answers for the right venue and code only, whatever the case", async () => {
    const env = await world();
    const entry = { businessName: "Kafana kod Mike", pinAvailable: true };
    expect(await env.t.query(api.menuWaiter.panelEntry, panel(env))).toEqual(entry);
    expect(
      await env.t.query(api.menuWaiter.panelEntry, { slug: SLUG_A.toUpperCase(), panelCode: env.code.toLowerCase() }),
    ).toEqual(entry);
    expect(await env.t.query(api.menuWaiter.panelEntry, panel(env, undefined, "b"))).toEqual({
      businessName: "Demo restoran",
      pinAvailable: true,
    });
  });

  test("a wrong, foreign or malformed code is no panel", async () => {
    const env = await world();
    const none = async (slug: string, panelCode: string) =>
      expect(await env.t.query(api.menuWaiter.panelEntry, { slug, panelCode })).toBeNull();
    await none(SLUG_A, "ZZZZZZZZZZ"); // well-formed, but nobody's
    await none(SLUG_A, env.bCode); // another venue's code with this slug
    await none(SLUG_B, env.code);
    for (const bad of ["", "abc", `${env.code}0`, "!!!!!!!!!!", "UUUUUUUUUU", "x".repeat(40)]) {
      await none(SLUG_A, bad);
    }
    await none("Not A Slug!", env.code);
    await none("", env.code);
  });

  test("without a usable pepper the panel exists but PINs are unavailable", async () => {
    const env = await world();
    delete process.env.MENU_PIN_PEPPER;
    expect(await env.t.query(api.menuWaiter.panelEntry, panel(env))).toEqual({
      businessName: "Kafana kod Mike",
      pinAvailable: false,
    });
    process.env.MENU_PIN_PEPPER = "too-short"; // a typo, not a secret
    expect(await env.t.query(api.menuWaiter.panelEntry, panel(env))).toMatchObject({ pinAvailable: false });
  });

  test("accountEntry lets the Owner, a Manager and a ScanMe admin in; nobody else", async () => {
    const env = await world();
    const { w, t } = env;
    const entry = (userId?: Id<"users">, venue?: Venue) =>
      (userId ? as(t, userId) : t).query(api.menuWaiter.accountEntry, panel(env, undefined, venue));
    expect(await entry(w.ownerId)).toEqual({ displayName: "vlasnik" });
    expect(await entry(w.managerId)).toEqual({ displayName: "menadzer" });
    expect(await entry(w.adminId)).toEqual({ displayName: "admin" });
    for (const userId of [w.editorId, w.financeId, w.viewOnlyId, w.outsiderId, w.otherOwnerId, undefined]) {
      expect(await entry(userId)).toBeNull();
    }
    // The Owner of a is nobody at b's panel, and a wrong code is no panel at all.
    expect(await entry(w.ownerId, "b")).toBeNull();
    expect(
      await as(t, w.ownerId).query(api.menuWaiter.accountEntry, { slug: SLUG_A, panelCode: "ZZZZZZZZZZ" }),
    ).toBeNull();
  });
});

// =============================================================================
// 2. Sign-in
// =============================================================================

describe("sign-in with a PIN", () => {
  test("a correct PIN opens a 12 hour session; only a hash of its token is stored", async () => {
    const env = await world();
    const staffId = await addStaff(env, "Ana", "246");
    const result = await login(env, "246");
    if (!result.ok) throw new Error(JSON.stringify(result));
    expect(Object.keys(result).sort()).toEqual(["deviceToken", "displayName", "expiresAt", "ok", "sessionToken"]);
    expect(result.displayName).toBe("Ana");
    expect(result.expiresAt).toBe(T0 + STAFF_SESSION_MS);
    expect(result.sessionToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(result.deviceToken).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const rows = await sessionRows(env.t);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ staffId, menuServiceId: env.w.a.menuServiceId, createdAt: T0, expiresAt: T0 + STAFF_SESSION_MS });
    expect(rows[0].endedAt).toBeUndefined();
    expect(rows[0].tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0].tokenHash).not.toBe(result.sessionToken);
    expect(rows[0].deviceKeyHash).not.toBe(result.deviceToken);

    const audit = await auditRows(env.t, "staff.login");
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      actorKind: "staff",
      actorRef: staffId,
      entityType: "staff",
      entityKey: staffId,
      details: { method: "pin" },
    });
  });

  test("without a pepper nobody signs in; a wrong link is panel_not_found", async () => {
    const env = await world();
    await addStaff(env, "Ana", "246");
    expect(
      await env.t.mutation(api.menuWaiter.loginWithPin, { slug: SLUG_A, panelCode: "ZZZZZZZZZZ", pin: "246" }),
    ).toEqual({ ok: false, code: "staff/panel_not_found" });
    expect(
      await env.t.mutation(api.menuWaiter.loginWithPin, { slug: SLUG_B, panelCode: env.code, pin: "246" }),
    ).toEqual({ ok: false, code: "staff/panel_not_found" });
    delete process.env.MENU_PIN_PEPPER;
    expect(await login(env, "246")).toEqual({ ok: false, code: "staff/pin_unavailable" });
    expect(await sessionRows(env.t)).toHaveLength(0);
  });

  test("a wrong PIN is returned, not thrown, so its counters survive", async () => {
    const env = await world();
    await addStaff(env, "Ana", "246");
    expect(await login(env, WRONG)).toMatchObject({ ok: false, code: "staff/wrong_pin", attemptsLeft: 4 });
    const attempts = await attemptRows(env.t);
    expect(attempts.map((row) => [row.scope, row.failures]).sort()).toEqual([
      ["device", 1],
      ["venue", 1],
    ]);
    expect(await sessionRows(env.t)).toHaveLength(0);
  });

  test("anything that is not three digits is just a wrong PIN", async () => {
    const env = await world();
    await addStaff(env, "Ana", "246");
    const first = await login(env, "12");
    const device = deviceOf(first);
    const lefts = [(first as { attemptsLeft: number }).attemptsLeft];
    for (const pin of ["1234", "abc", ""]) {
      const outcome = await login(env, pin, { deviceToken: device });
      expect(outcome).toMatchObject({ ok: false, code: "staff/wrong_pin" });
      lefts.push((outcome as { attemptsLeft: number }).attemptsLeft);
    }
    expect(lefts).toEqual([4, 3, 2, 1]);
  });

  // Security review K22: a success no longer wipes the misses of a window that is still open,
  // otherwise one valid PIN lets its holder probe the other PINs four at a time.
  test("a success keeps the misses of an open window (no probing with a valid PIN); an old window counts nothing", async () => {
    const env = await world();
    await addStaff(env, "Ana", "246");
    const device = deviceOf(await login(env, WRONG));
    await login(env, WRONG, { deviceToken: device });
    await login(env, WRONG, { deviceToken: device }); // 3 misses
    await signIn(env, "246", { deviceToken: device });
    const row = (await attemptRows(env.t)).find((r) => r.scope === "device");
    expect(row).toMatchObject({ failures: 3, lastSuccessAt: T0 });
    expect(await login(env, WRONG, { deviceToken: device })).toMatchObject({ code: "staff/wrong_pin", attemptsLeft: 1 });
    // The fifth miss of the window locks the device, although it signed in in between.
    expect(await login(env, WRONG, { deviceToken: device })).toMatchObject({ code: "staff/locked" });

    // After the lock and a full window, the counting starts over.
    vi.setSystemTime(T0 + 2 * PIN_WINDOW_MS);
    expect(await login(env, WRONG, { deviceToken: device })).toMatchObject({ code: "staff/wrong_pin", attemptsLeft: 4 });
  });

  test("a success after the window passed starts the counter over", async () => {
    const env = await world();
    await addStaff(env, "Ana", "246");
    const device = deviceOf(await login(env, WRONG));
    vi.setSystemTime(T0 + PIN_WINDOW_MS);
    await signIn(env, "246", { deviceToken: device });
    const row = (await attemptRows(env.t)).find((r) => r.scope === "device");
    expect(row).toMatchObject({ failures: 0, lastSuccessAt: T0 + PIN_WINDOW_MS });
  });
});

// =============================================================================
// 3. Acceptance: five wrong PINs, the sixth is blocked even with the right PIN
// =============================================================================

describe("device lock", () => {
  test("five wrong PINs lock the device; the sixth try fails even with the right PIN", async () => {
    const env = await world();
    await addStaff(env, "Ana", "246");

    const first = await login(env, WRONG);
    expect(first).toMatchObject({ ok: false, code: "staff/wrong_pin", attemptsLeft: 4 });
    const device = deviceOf(first);
    for (const left of [3, 2, 1]) {
      expect(await login(env, WRONG, { deviceToken: device })).toMatchObject({
        ok: false,
        code: "staff/wrong_pin",
        attemptsLeft: left,
      });
    }
    // The fifth miss places the lock for 15 minutes.
    expect(await login(env, WRONG, { deviceToken: device })).toEqual({
      ok: false,
      code: "staff/locked",
      deviceToken: device,
      lockedUntil: T0 + PIN_LOCK_MS,
    });

    // The sixth, with the RIGHT PIN: still locked, no session.
    expect(await login(env, "246", { deviceToken: device })).toEqual({
      ok: false,
      code: "staff/locked",
      deviceToken: device,
      lockedUntil: T0 + PIN_LOCK_MS,
    });
    expect(await sessionRows(env.t)).toHaveLength(0);
    expect(await auditRows(env.t, "staff.login")).toHaveLength(0);

    const locks = await auditRows(env.t, "staff.pin_locked");
    expect(locks).toHaveLength(1);
    expect(locks[0]).toMatchObject({
      actorKind: "system",
      entityType: "panel",
      details: { scope: "device", lockedUntil: T0 + PIN_LOCK_MS },
    });

    // A different device of the same venue is not locked by this one.
    expect(await login(env, "246")).toMatchObject({ ok: true, displayName: "Ana" });
  });

  test("the lock ends after exactly 15 minutes and the right PIN works again", async () => {
    const env = await world();
    await addStaff(env, "Ana", "246");
    const device = deviceOf(await login(env, WRONG));
    for (let miss = 1; miss < 5; miss += 1) await login(env, WRONG, { deviceToken: device });

    vi.setSystemTime(T0 + PIN_LOCK_MS - 1);
    expect(await login(env, "246", { deviceToken: device })).toMatchObject({ ok: false, code: "staff/locked" });
    vi.setSystemTime(T0 + PIN_LOCK_MS);
    expect(await login(env, "246", { deviceToken: device })).toMatchObject({ ok: true, displayName: "Ana" });
    expect(await sessionRows(env.t)).toHaveLength(1);
  });

  test("after a lock the next five misses are counted afresh", async () => {
    const env = await world();
    await addStaff(env, "Ana", "246");
    const device = deviceOf(await login(env, WRONG));
    for (let miss = 1; miss < 5; miss += 1) await login(env, WRONG, { deviceToken: device });
    vi.setSystemTime(T0 + PIN_LOCK_MS);
    expect(await login(env, WRONG, { deviceToken: device })).toMatchObject({ code: "staff/wrong_pin", attemptsLeft: 4 });
  });
});

// =============================================================================
// 4. The venue lock stops new devices only
// =============================================================================

describe("venue lock", () => {
  test(
    "30 wrong PINs from new devices lock every new device, but not a device that already signed in",
    { timeout: 120_000 },
    async () => {
      const env = await world();
      await addStaff(env, "Ana", "246");
      const known = await signIn(env, "246"); // a known device (signed in within 12 h)

      for (let device = 0; device < 30; device += 1) {
        const outcome = await login(env, WRONG, { ipHash: ip(Math.floor(device / 10)) });
        expect(outcome).toMatchObject({ ok: false, code: "staff/wrong_pin", attemptsLeft: 4 });
      }
      const locks = await auditRows(env.t, "staff.pin_locked");
      expect(locks).toHaveLength(1);
      expect(locks[0]).toMatchObject({ details: { scope: "venue", lockedUntil: T0 + PIN_LOCK_MS } });

      // A new device is refused with the RIGHT PIN, a wrong one is not even counted.
      expect(await login(env, "246", { ipHash: ip(9) })).toMatchObject({
        ok: false,
        code: "staff/locked",
        lockedUntil: T0 + PIN_LOCK_MS,
      });
      expect(await login(env, WRONG, { ipHash: ip(9) })).toMatchObject({ code: "staff/locked" });
      expect(await auditRows(env.t, "staff.pin_locked")).toHaveLength(1);

      // The known device keeps working, and its own misses still count only for itself.
      expect(await login(env, WRONG, { deviceToken: known.deviceToken })).toMatchObject({
        code: "staff/wrong_pin",
        attemptsLeft: 4,
      });
      const again = await signIn(env, "246", { deviceToken: known.deviceToken });
      expect(again.displayName).toBe("Ana");

      // 15 minutes later new devices may sign in again.
      vi.setSystemTime(T0 + PIN_LOCK_MS);
      expect(await login(env, "246", { ipHash: ip(9) })).toMatchObject({ ok: true, displayName: "Ana" });
    },
  );

  test("wrong PINs of a known device never reach the venue counter", async () => {
    const env = await world();
    await addStaff(env, "Ana", "246");
    const known = await signIn(env, "246");
    for (const left of [4, 3, 2, 1]) {
      expect(await login(env, WRONG, { deviceToken: known.deviceToken })).toMatchObject({ attemptsLeft: left });
    }
    // Its own device lock still applies to it.
    expect(await login(env, WRONG, { deviceToken: known.deviceToken })).toMatchObject({ code: "staff/locked" });
    expect((await attemptRows(env.t)).filter((row) => row.scope === "venue")).toHaveLength(0);
  });
});

// =============================================================================
// 5. The network bucket
// =============================================================================

describe("network bucket", () => {
  test(
    "20 wrong PINs from one address stop the 21st attempt; another address is unaffected",
    { timeout: 120_000 },
    async () => {
      const env = await world();
      await addStaff(env, "Ana", "246");
      for (let miss = 0; miss < 20; miss += 1) {
        expect(await login(env, WRONG, { ipHash: ip(1) })).toMatchObject({ ok: false, code: "staff/wrong_pin" });
      }
      // The 21st, from a new device, with any PIN (even the right one).
      for (const pin of [WRONG, "246"]) {
        const outcome = await login(env, pin, { ipHash: ip(1) });
        expect(outcome).toMatchObject({ ok: false, code: "staff/rate_limited" });
        const retryAt = (outcome as { retryAt: number | null }).retryAt;
        expect(retryAt).toBeGreaterThan(T0);
        expect(retryAt).toBeLessThanOrEqual(T0 + 15 * MINUTE);
      }
      expect(await sessionRows(env.t)).toHaveLength(0);
      expect(await login(env, "246", { ipHash: ip(2) })).toMatchObject({ ok: true });
    },
  );

  test("a correct PIN does not use up the bucket", { timeout: 120_000 }, async () => {
    const env = await world();
    await addStaff(env, "Ana", "246");
    for (let miss = 0; miss < 19; miss += 1) await login(env, WRONG, { ipHash: ip(1) });
    for (let hit = 0; hit < 5; hit += 1) {
      expect(await login(env, "246", { ipHash: ip(1) })).toMatchObject({ ok: true });
    }
    // 19 tokens spent, one left: this miss is answered, the next one is not.
    expect(await login(env, WRONG, { ipHash: ip(1) })).toMatchObject({ code: "staff/wrong_pin" });
    expect(await login(env, WRONG, { ipHash: ip(1) })).toMatchObject({ code: "staff/rate_limited" });
  });

  test("a missing or malformed address shares one bucket", { timeout: 120_000 }, async () => {
    const env = await world();
    await addStaff(env, "Ana", "246");
    const keys = [undefined, "not-hex", "ABCDEF0123456789ABCDEF0123456789", "ab"];
    for (let miss = 0; miss < 20; miss += 1) {
      await login(env, WRONG, { ipHash: keys[miss % keys.length] });
    }
    expect(await login(env, WRONG)).toMatchObject({ code: "staff/rate_limited" });
    expect(await login(env, WRONG, { ipHash: "not-hex" })).toMatchObject({ code: "staff/rate_limited" });
  });
});

// =============================================================================
// 6. Acceptance: another venue's PIN does not open this panel
// =============================================================================

describe("PINs belong to their venue", () => {
  test("a PIN of tenant b does not open tenant a's panel", async () => {
    const env = await world();
    await addStaff(env, "Ana", "246");
    await addStaff(env, "Jelena", "555", { venue: "b" });
    expect(await login(env, "555")).toMatchObject({ ok: false, code: "staff/wrong_pin", attemptsLeft: 4 });
    expect(await login(env, "555", { venue: "b" })).toMatchObject({ ok: true, displayName: "Jelena" });
    expect(await login(env, "246", { venue: "b" })).toMatchObject({ ok: false, code: "staff/wrong_pin" });
  });

  test("the same digits may exist in both venues; each opens only its own panel", async () => {
    const env = await world();
    await addStaff(env, "Ana", "246");
    await addStaff(env, "Jelena", "246", { venue: "b" });
    const ana = await signIn(env, "246");
    const jelena = await signIn(env, "246", { venue: "b" });
    expect(ana.displayName).toBe("Ana");
    expect(jelena.displayName).toBe("Jelena");
    expect(await getMe(env, ana.sessionToken)).toMatchObject({ displayName: "Ana", businessName: "Kafana kod Mike" });
    expect(await getMe(env, jelena.sessionToken, { venue: "b" })).toMatchObject({
      displayName: "Jelena",
      businessName: "Demo restoran",
    });
    // Neither token works at the other venue's panel.
    expect(await getMe(env, ana.sessionToken, { venue: "b" })).toBeNull();
    expect(await getMe(env, jelena.sessionToken)).toBeNull();
    // A miss at one venue does not touch the other's counters.
    await login(env, WRONG, { venue: "b" });
    const scoped = (await attemptRows(env.t)).filter((row) => row.menuServiceId === env.w.a.menuServiceId);
    expect(scoped.filter((row) => row.failures > 0)).toHaveLength(0);
  });
});

// =============================================================================
// 7. Ending access from the management side
// =============================================================================

describe("ending access", () => {
  test("a deactivated member's PIN stops working and their session ends", async () => {
    const env = await world();
    const anaId = await addStaff(env, "Ana", "246");
    const ana = await signIn(env, "246");
    expect(await getQueue(env, ana.sessionToken)).not.toBeNull();

    expect(await env.owner.mutation(api.menuStaff.deactivate, { staffId: anaId })).toEqual({ ok: true, endedSessions: 1 });
    expect(await getMe(env, ana.sessionToken)).toBeNull();
    expect(await getQueue(env, ana.sessionToken)).toBeNull();
    expect((await sessionRows(env.t))[0].endReason).toBe("deactivated");
    expect(await login(env, "246")).toMatchObject({ ok: false, code: "staff/wrong_pin" });

    // The PIN is free again, for someone else.
    await addStaff(env, "Marko", "246");
    expect(await login(env, "246")).toMatchObject({ ok: true, displayName: "Marko" });
  });

  test("resetting or changing a PIN signs the member out everywhere", async () => {
    const env = await world();
    const anaId = await addStaff(env, "Ana", "246");
    const phone = await signIn(env, "246");
    const tablet = await signIn(env, "246");
    expect(await env.owner.mutation(api.menuStaff.resetPin, { staffId: anaId })).toEqual({ ok: true, endedSessions: 2 });
    for (const session of [phone, tablet]) {
      expect(await getMe(env, session.sessionToken)).toBeNull();
      expect(await getQueue(env, session.sessionToken)).toBeNull();
    }
    expect((await sessionRows(env.t)).map((row) => row.endReason)).toEqual(["pin_reset", "pin_reset"]);
    expect(await login(env, "246")).toMatchObject({ code: "staff/wrong_pin" });

    await env.owner.mutation(api.menuStaff.setPin, { staffId: anaId, pin: "246" });
    const back = await signIn(env, "246");
    expect(await env.owner.mutation(api.menuStaff.setPin, { staffId: anaId, pin: "135" })).toMatchObject({ endedSessions: 1 });
    expect(await getMe(env, back.sessionToken)).toBeNull();
    expect(await login(env, "246")).toMatchObject({ code: "staff/wrong_pin" });
    expect(await login(env, "135")).toMatchObject({ ok: true, displayName: "Ana" });
  });

  test("a new panel code kills the old link and every session", async () => {
    const env = await world();
    await addStaff(env, "Ana", "246");
    const ana = await signIn(env, "246");
    const rotated = await env.owner.mutation(api.menuStaff.rotatePanelCode, { menuServiceId: env.w.a.menuServiceId });
    expect(rotated.code).not.toBe(env.code);
    expect(rotated.endedSessions).toBe(1);

    expect(await env.t.query(api.menuWaiter.panelEntry, panel(env))).toBeNull();
    expect(await login(env, "246")).toEqual({ ok: false, code: "staff/panel_not_found" });
    expect(await getMe(env, ana.sessionToken)).toBeNull();

    const renewed: Env = { ...env, code: rotated.code };
    expect(await env.t.query(api.menuWaiter.panelEntry, panel(renewed))).toMatchObject({ businessName: "Kafana kod Mike" });
    expect(await getMe(renewed, ana.sessionToken)).toBeNull(); // the old token is dead
    expect((await sessionRows(env.t))[0].endReason).toBe("code_rotated");
    expect(await login(renewed, "246")).toMatchObject({ ok: true, displayName: "Ana" });
  });
});

// =============================================================================
// 8. The session
// =============================================================================

describe("session", () => {
  test("me answers who is signed in on this device", async () => {
    const env = await world();
    await addStaff(env, "Ana", "246");
    await addStaff(env, "Petar", "357", { panelRole: "manager" });
    const ana = await signIn(env, "246");
    const petar = await signIn(env, "357");
    expect(await getMe(env, ana.sessionToken)).toEqual({
      kind: "staff",
      displayName: "Ana",
      role: "staff",
      businessName: "Kafana kod Mike",
      expiresAt: T0 + STAFF_SESSION_MS,
    });
    expect(await getMe(env, petar.sessionToken)).toMatchObject({ displayName: "Petar", role: "manager" });
  });

  test("after 12 hours the scheduled expiry ends the session", async () => {
    const env = await world();
    await addStaff(env, "Ana", "246");
    const ana = await signIn(env, "246");
    expect(await getMe(env, ana.sessionToken)).not.toBeNull();

    vi.advanceTimersByTime(STAFF_SESSION_MS + 1000);
    await env.t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await getMe(env, ana.sessionToken)).toBeNull();
    expect(await getQueue(env, ana.sessionToken)).toBeNull();
    const [row] = await sessionRows(env.t);
    expect(row).toMatchObject({ endReason: "expired", endedAt: ana.expiresAt });
  });

  test("logout ends the session, is audited once and is idempotent", async () => {
    const env = await world();
    const anaId = await addStaff(env, "Ana", "246");
    const ana = await signIn(env, "246");
    const logout = (token: string, venue?: Venue) =>
      env.t.mutation(api.menuWaiter.logout, { ...panel(env, undefined, venue), sessionToken: token });

    // Nonsense, and a token shown at another venue's panel, change nothing.
    expect(await logout("nonsense")).toEqual({ ok: true });
    expect(await logout(ana.sessionToken, "b")).toEqual({ ok: true });
    expect(await getMe(env, ana.sessionToken)).not.toBeNull();

    vi.setSystemTime(T0 + MINUTE);
    expect(await logout(ana.sessionToken)).toEqual({ ok: true });
    expect(await getMe(env, ana.sessionToken)).toBeNull();
    expect(await logout(ana.sessionToken)).toEqual({ ok: true });
    expect((await sessionRows(env.t))[0]).toMatchObject({ endReason: "logout", endedAt: T0 + MINUTE });
    const audit = await auditRows(env.t, "staff.logout");
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actorKind: "staff", actorRef: anaId, entityKey: anaId });
  });

  test("signing in again on the same device replaces the previous session", async () => {
    const env = await world();
    await addStaff(env, "Ana", "246");
    await addStaff(env, "Marko", "135");
    const first = await signIn(env, "246");
    const second = await signIn(env, "246", { deviceToken: first.deviceToken });
    expect(await getMe(env, first.sessionToken)).toBeNull();
    expect(await getMe(env, second.sessionToken)).toMatchObject({ displayName: "Ana" });

    // As someone else on the same device: Ana is out, Marko is in.
    const third = await signIn(env, "135", { deviceToken: first.deviceToken });
    expect(await getMe(env, second.sessionToken)).toBeNull();
    expect(await getMe(env, third.sessionToken)).toMatchObject({ displayName: "Marko" });
    const rows = await sessionRows(env.t);
    expect(rows.map((row) => row.endReason)).toEqual(["replaced", "replaced", undefined]);

    // Another device keeps its own session.
    const other = await signIn(env, "246");
    expect(await getMe(env, third.sessionToken)).not.toBeNull();
    expect(await getMe(env, other.sessionToken)).not.toBeNull();
  });

  test("a token that does not check out is signed out, never a fallback to the account", async () => {
    const env = await world();
    await addStaff(env, "Ana", "246");
    const ana = await signIn(env, "246");
    for (const bad of ["", "nope", "A".repeat(43), ana.sessionToken.slice(1)]) {
      expect(await getMe(env, bad, { who: as(env.t, env.w.ownerId) })).toBeNull();
      expect(await getQueue(env, bad, { who: as(env.t, env.w.ownerId) })).toBeNull();
    }
    expect(await getMe(env, ana.sessionToken, { venue: "b" })).toBeNull();
    // The right token still works with the wrong identity attached.
    expect(await getMe(env, ana.sessionToken, { who: as(env.t, env.w.outsiderId) })).toMatchObject({ displayName: "Ana" });
  });

  test("the Owner and Managers work with their account, no PIN and no session row", async () => {
    const env = await world();
    const { t, w } = env;
    const account = (userId: Id<"users">) => ({ who: as(t, userId) });
    expect(await getMe(env, undefined, account(w.ownerId))).toEqual({
      kind: "account",
      displayName: "vlasnik",
      role: "owner",
      businessName: "Kafana kod Mike",
      expiresAt: null,
    });
    expect(await getMe(env, undefined, account(w.managerId))).toMatchObject({ kind: "account", role: "manager" });
    expect(await getMe(env, undefined, account(w.adminId))).toMatchObject({ kind: "account", role: "admin" });
    for (const userId of [w.editorId, w.financeId, w.outsiderId, w.otherOwnerId]) {
      expect(await getMe(env, undefined, account(userId))).toBeNull();
    }
    expect(await getMe(env)).toBeNull();
    expect(await sessionRows(t)).toHaveLength(0);
  });

  test("loginWithAccount is audited for the Owner, a Manager and an admin; an Urednik is signed out", async () => {
    const env = await world();
    const { t, w } = env;
    const enter = (who: Caller) => who.mutation(api.menuWaiter.loginWithAccount, panel(env));
    expect(await enter(as(t, w.ownerId))).toEqual({ ok: true, displayName: "vlasnik" });
    expect(await enter(as(t, w.managerId))).toEqual({ ok: true, displayName: "menadzer" });
    expect(await enter(as(t, w.adminId))).toEqual({ ok: true, displayName: "admin" });
    const audit = await auditRows(t, "staff.login");
    expect(audit.map((row) => [row.actorKind, row.actorUserId])).toEqual([
      ["user", w.ownerId],
      ["user", w.managerId],
      ["admin", w.adminId],
    ]);
    for (const row of audit) expect(row).toMatchObject({ entityType: "panel", details: { method: "account" } });

    for (const who of [as(t, w.editorId), as(t, w.outsiderId), t]) {
      expect(await enter(who)).toEqual({ ok: false, code: "staff/signed_out" });
    }
    expect(await auditRows(t, "staff.login")).toHaveLength(3);
  });

  test("the cron backstop ends lost expiries, deletes old rows and forgets stale PIN counters", async () => {
    const env = await world();
    await addStaff(env, "Ana", "246");
    const ana = await signIn(env, "246");
    await login(env, WRONG); // a new device with one miss: two more counters
    expect(await attemptRows(env.t)).toHaveLength(3);

    vi.setSystemTime(T0 + STAFF_SESSION_MS + 1000); // the scheduled expiry never ran
    await env.t.mutation(internal.menuWaiter.sweepExpiredSessions, {});
    expect(await getMe(env, ana.sessionToken)).toBeNull();
    expect((await sessionRows(env.t))[0]).toMatchObject({ endReason: "expired", endedAt: ana.expiresAt });
    expect(await attemptRows(env.t)).toHaveLength(3); // 12 h old: not yet stale (12 h 15 min)

    vi.setSystemTime(T0 + STAFF_SESSION_MS + 24 * 60 * MINUTE + 1000);
    await env.t.mutation(internal.menuWaiter.sweepExpiredSessions, {});
    expect(await sessionRows(env.t)).toHaveLength(0);
    expect(await attemptRows(env.t)).toHaveLength(0);
  });
});

// =============================================================================
// 9. The work queue
// =============================================================================

describe("the queue", () => {
  test("new requests oldest first, then accepted, each with its position, zone and taker", async () => {
    const env = await world();
    const { anaId, ana, marko, table } = await shift(env);
    const plain = await addTable(env.t, env.w.a, "Sto 3");
    const foreign = await addTable(env.t, env.w.b, "Sto 1");
    const r1 = await addRequest(env.t, table, { createdAt: T0 + 1000 });
    const r2 = await addRequest(env.t, plain, { kind: "bill", paymentPreference: "card", createdAt: T0 + 3000 });
    const r3 = await addRequest(env.t, table, { kind: "order", itemCount: 2, totalRsd: 650, createdAt: T0 + 2000 });
    const r4 = await addRequest(env.t, plain, {
      status: "accepted",
      createdAt: T0 + 500,
      acceptedAt: T0 + 900,
      acceptedByStaffId: anaId,
    });
    await addRequest(env.t, table, { status: "done", createdAt: T0 + 400, doneAt: T0 + 800 });
    await addRequest(env.t, foreign, { createdAt: T0 + 100 }); // another venue's request

    const queue = await getQueue(env, ana);
    expect(queue?.truncated).toBe(false);
    expect(queue?.requests.map((row) => row.id)).toEqual([r1, r3, r2, r4]);
    expect(queue?.requests[0]).toEqual({
      id: r1,
      kind: "call",
      // K23: the floor groups requests by position and zone.
      positionId: table.positionId,
      zoneId: table.zoneId,
      status: "new",
      channel: "standard",
      positionLabel: "Sto 12",
      positionKind: "table",
      zoneName: "Terasa",
      createdAt: T0 + 1000,
      acceptedAt: null,
      paymentPreference: null,
      itemCount: null,
      totalRsd: null,
      acceptedBy: null,
    });
    expect(queue?.requests[1]).toMatchObject({ kind: "order", itemCount: 2, totalRsd: 650 });
    expect(queue?.requests[2]).toMatchObject({ kind: "bill", paymentPreference: "card", zoneName: null, positionLabel: "Sto 3" });
    expect(queue?.requests[3]).toMatchObject({
      status: "accepted",
      acceptedAt: T0 + 900,
      acceptedBy: { name: "Ana", isMe: true },
    });
    expect(queue?.recentlyCancelled).toEqual([]);

    // Marko sees the same queue; the request is Ana's, not his.
    const seenByMarko = await getQueue(env, marko);
    expect(seenByMarko?.requests.map((row) => row.id)).toEqual([r1, r3, r2, r4]);
    expect(seenByMarko?.requests[3].acceptedBy).toEqual({ name: "Ana", isMe: false });
  });

  test("the account of the Owner sees the queue and is recognised as the taker", async () => {
    const env = await world();
    const { anaId, table } = await shift(env);
    const mine = await addRequest(env.t, table, { status: "accepted", acceptedByUserId: env.w.ownerId, acceptedAt: T0 });
    const anas = await addRequest(env.t, table, { status: "accepted", acceptedByStaffId: anaId, acceptedAt: T0 });
    const asOwner = await getQueue(env, undefined, { who: env.owner });
    const byId = new Map(asOwner?.requests.map((row) => [row.id, row.acceptedBy]));
    // Staff never see an account's e-mail: a nameless account is "Vlasnik ili menadžer" (security review K22).
    expect(byId.get(mine)).toEqual({ name: "Vlasnik ili menadžer", isMe: true });
    expect(byId.get(anas)).toEqual({ name: "Ana", isMe: false });
    const asManager = await getQueue(env, undefined, { who: as(env.t, env.w.managerId) });
    expect(new Map(asManager?.requests.map((row) => [row.id, row.acceptedBy])).get(mine)).toEqual({ name: "Vlasnik ili menadžer", isMe: false });
  });

  test("beyond 300 of one status the oldest 300 are shown and the queue says so", async () => {
    const env = await world();
    const { ana, table } = await shift(env);
    const ids = await addRequests(env.t, table, 300);
    let queue = await getQueue(env, ana);
    expect(queue?.requests).toHaveLength(300);
    expect(queue?.truncated).toBe(false);

    const [newest] = await addRequests(env.t, table, 1, { createdAt: T0 + 10_000_000 });
    queue = await getQueue(env, ana);
    expect(queue?.truncated).toBe(true);
    expect(queue?.requests).toHaveLength(300);
    expect(queue?.requests.map((row) => row.id)).toEqual(ids);
    expect(queue?.requests.map((row) => row.id)).not.toContain(newest);
  });

  test("more than 300 accepted requests are cut the same way", async () => {
    const env = await world();
    const { ana, table } = await shift(env);
    await addRequests(env.t, table, 301, { status: "accepted", acceptedAt: T0 });
    const queue = await getQueue(env, ana);
    expect(queue?.requests).toHaveLength(300);
    expect(queue?.truncated).toBe(true);
  });

  test("recentlyCancelled lists the last 20, newest first, with who cancelled", async () => {
    const env = await world();
    const { ana, table } = await shift(env);
    const ids: Id<"menuRequests">[] = [];
    for (let index = 0; index < 22; index += 1) {
      ids.push(
        await addRequest(env.t, table, {
          kind: index % 2 === 0 ? "call" : "bill",
          status: "cancelled",
          createdAt: T0 + index * 1000,
          cancelledAt: T0 + index * 1000 + 500,
          cancelledBy: index % 2 === 0 ? "guest" : "staff",
        }),
      );
    }
    const queue = await getQueue(env, ana);
    expect(queue?.requests).toEqual([]);
    expect(queue?.recentlyCancelled).toHaveLength(20);
    expect(queue?.recentlyCancelled[0]).toEqual({
      id: ids[21],
      kind: "bill",
      positionLabel: "Sto 12",
      cancelledAt: T0 + 21 * 1000 + 500,
      cancelledBy: "staff",
    });
    expect(queue?.recentlyCancelled[1]).toMatchObject({ id: ids[20], cancelledBy: "guest" });
    expect(queue?.recentlyCancelled[19].id).toBe(ids[2]);
  });

  test("no pseudonym, hash or token of anyone is in what the panel receives", async () => {
    const env = await world();
    const { anaId, ana, table } = await shift(env);
    const id = await addRequest(env.t, table, { kind: "order", itemCount: 1, totalRsd: 200, status: "accepted", acceptedByStaffId: anaId });
    await addRequests(env.t, table, 1, { status: "cancelled", cancelledAt: T0, cancelledBy: "guest" });
    await env.t.run(async (ctx) => {
      await ctx.db.insert("menuRequestItems", {
        requestId: id,
        menuServiceId: env.w.a.menuServiceId,
        articleKey: "ar_pivo",
        name: "Jelen pivo",
        addons: [],
        unitPriceRsd: 200,
        quantity: 1,
        lineTotalRsd: 200,
        order: 0,
      });
    });
    const serialized = JSON.stringify([await getQueue(env, ana), await getDetail(env, ana, id)]);
    for (const forbidden of [GUEST_DEVICE, "deviceKeyHash", "tokenHash", "guest-token-hash", "pinHash", "pinLookup", "guestSessionId"]) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(serialized).toContain("Jelen pivo"); // the check looks at real content
  });

  test("only a live staff session or a Manager's account sees it", async () => {
    const env = await world();
    const { ana, table } = await shift(env);
    await addRequest(env.t, table);
    const { w, t } = env;
    expect(await getQueue(env, ana)).not.toBeNull();
    expect(await getQueue(env, undefined, { who: env.owner })).not.toBeNull();
    expect(await getQueue(env, undefined, { who: as(t, w.managerId) })).not.toBeNull();
    for (const userId of [w.editorId, w.financeId, w.outsiderId, w.otherOwnerId]) {
      expect(await getQueue(env, undefined, { who: as(t, userId) })).toBeNull();
    }
    expect(await getQueue(env)).toBeNull();
    expect(await getQueue(env, "nope")).toBeNull();
    expect(await getQueue(env, ana, { venue: "b" })).toBeNull();
  });
});

// =============================================================================
// 10. The request detail
// =============================================================================

describe("request detail", () => {
  test("an order shows its lines in order, the card it came from and the rest of the table", async () => {
    const env = await world();
    const { anaId, ana, table } = await shift(env);
    const other = await addTable(env.t, env.w.a, "Sto 7");
    const order = await addRequest(env.t, table, {
      kind: "order",
      itemCount: 2,
      subtotalRsd: 1260,
      totalRsd: 1260,
      sourceLabel: "Kartica 12-B",
      createdAt: T0 + 5000,
    });
    const call = await addRequest(env.t, table, { createdAt: T0 + 1000 });
    const bill = await addRequest(env.t, table, { kind: "bill", status: "accepted", acceptedByStaffId: anaId, acceptedAt: T0, createdAt: T0 + 3000 });
    await addRequest(env.t, table, { status: "done", doneAt: T0 });
    await addRequest(env.t, table, { status: "cancelled", cancelledAt: T0, cancelledBy: "guest" });
    await addRequest(env.t, other, { createdAt: T0 + 2000 }); // another table
    await env.t.run(async (ctx) => {
      const base = { requestId: order, menuServiceId: env.w.a.menuServiceId };
      await ctx.db.insert("menuRequestItems", {
        ...base,
        articleKey: "ar_pljeskavica",
        name: "Pljeskavica",
        variantName: "Velika",
        addons: [{ groupKey: "ag_prilozi", groupName: "Prilozi", optionKey: "ao_kajmak", optionName: "Kajmak", priceDeltaRsd: 80 }],
        unitPriceRsd: 530,
        quantity: 2,
        lineTotalRsd: 1060,
        note: "Bez luka",
        order: 1,
      });
      await ctx.db.insert("menuRequestItems", {
        ...base,
        articleKey: "ar_pivo",
        name: "Jelen pivo",
        addons: [],
        unitPriceRsd: 200,
        quantity: 1,
        lineTotalRsd: 200,
        promoApplied: true,
        order: 0,
      });
    });

    const detail = await getDetail(env, ana, order);
    expect(detail?.request).toMatchObject({
      id: order,
      kind: "order",
      status: "new",
      positionLabel: "Sto 12",
      zoneName: "Terasa",
      sourceLabel: "Kartica 12-B",
      subtotalRsd: 1260,
      deliveryFeeRsd: null,
      totalRsd: 1260,
      itemCount: 2,
      doneAt: null,
      doneBy: null,
      cancelledAt: null,
      cancelledBy: null,
    });
    expect(detail?.items).toEqual([
      { name: "Jelen pivo", variantName: null, addons: [], quantity: 1, unitPriceRsd: 200, lineTotalRsd: 200, promoApplied: true, note: null },
      {
        name: "Pljeskavica",
        variantName: "Velika",
        addons: [{ groupName: "Prilozi", optionName: "Kajmak", priceDeltaRsd: 80 }],
        quantity: 2,
        unitPriceRsd: 530,
        lineTotalRsd: 1060,
        promoApplied: false,
        note: "Bez luka",
      },
    ]);
    // "Ostalo na ovom stolu": the other OPEN requests of Sto 12, oldest first.
    expect(detail?.others.map((row) => row.id)).toEqual([call, bill]);
    expect(detail?.others[1].acceptedBy).toEqual({ name: "Ana", isMe: true });
    // A call has no lines.
    expect((await getDetail(env, ana, call))?.items).toEqual([]);
  });

  test("a finished request shows who finished it", async () => {
    const env = await world();
    const { markoId, ana, table } = await shift(env);
    const id = await addRequest(env.t, table, {
      status: "done",
      acceptedAt: T0,
      acceptedByStaffId: markoId,
      doneAt: T0 + MINUTE,
      doneByStaffId: markoId,
    });
    expect((await getDetail(env, ana, id))?.request).toMatchObject({
      status: "done",
      doneAt: T0 + MINUTE,
      doneBy: "Marko",
      acceptedBy: { name: "Marko", isMe: false },
    });
    // The name outlives the person's deactivation.
    await env.owner.mutation(api.menuStaff.deactivate, { staffId: markoId });
    expect((await getDetail(env, ana, id))?.request.doneBy).toBe("Marko");
  });

  test("a request of another venue is null, with a token and with an account", async () => {
    const env = await world();
    const { ana, table } = await shift(env);
    const foreign = await addTable(env.t, env.w.b, "Sto 1");
    const theirs = await addRequest(env.t, foreign);
    const mine = await addRequest(env.t, table);
    expect(await getDetail(env, ana, theirs)).toBeNull();
    expect(await getDetail(env, undefined, theirs, { who: env.owner })).toBeNull();
    expect(await getDetail(env, ana, mine)).not.toBeNull();
    expect(await getDetail(env, "nope", mine)).toBeNull();
    expect(await getDetail(env, undefined, mine, { who: as(env.t, env.w.editorId) })).toBeNull();
  });

  test("a foreign member recorded on a request is never named", async () => {
    const env = await world();
    const { ana, table } = await shift(env);
    const jelenaId = await addStaff(env, "Jelena", undefined, { venue: "b" });
    const id = await addRequest(env.t, table, { status: "accepted", acceptedByStaffId: jelenaId, acceptedAt: T0 });
    const detail = await getDetail(env, ana, id);
    expect(detail?.request.acceptedBy).toEqual({ name: "", isMe: false });
    expect(JSON.stringify(detail)).not.toContain("Jelena");
  });
});

// =============================================================================
// 11. Preuzmi, Završi, Otkaži
// =============================================================================

describe("transitions", () => {
  test("Preuzmi then Završi writes who and when, and repeating is a no-op", async () => {
    const env = await world();
    const { anaId, ana, table } = await shift(env);
    const id = await addRequest(env.t, table);

    vi.setSystemTime(T0 + MINUTE);
    expect(await act(env, "accept", id, { token: ana })).toEqual({ ok: true, status: "accepted", changed: true });
    expect(await requestRow(env.t, id)).toMatchObject({ status: "accepted", acceptedByStaffId: anaId, acceptedAt: T0 + MINUTE });

    vi.setSystemTime(T0 + 2 * MINUTE);
    expect(await act(env, "accept", id, { token: ana })).toEqual({ ok: true, status: "accepted", changed: false });
    expect(await requestRow(env.t, id)).toMatchObject({ acceptedAt: T0 + MINUTE, updatedAt: T0 + MINUTE });

    vi.setSystemTime(T0 + 3 * MINUTE);
    expect(await act(env, "complete", id, { token: ana })).toEqual({ ok: true, status: "done", changed: true });
    expect(await requestRow(env.t, id)).toMatchObject({
      status: "done",
      acceptedByStaffId: anaId,
      doneByStaffId: anaId,
      doneAt: T0 + 3 * MINUTE,
    });
    expect(await act(env, "complete", id, { token: ana })).toEqual({ ok: true, status: "done", changed: false });
    // Neither step is audited (hundreds a day; the row is the trace).
    expect(await auditRows(env.t, "request.accepted")).toHaveLength(0);
    expect((await getQueue(env, ana))?.requests).toEqual([]);
  });

  test("Završi on a new request accepts it at the same moment", async () => {
    const env = await world();
    const { anaId, ana, table } = await shift(env);
    const id = await addRequest(env.t, table);
    vi.setSystemTime(T0 + MINUTE);
    expect(await act(env, "complete", id, { token: ana })).toEqual({ ok: true, status: "done", changed: true });
    expect(await requestRow(env.t, id)).toMatchObject({
      status: "done",
      acceptedAt: T0 + MINUTE,
      acceptedByStaffId: anaId,
      doneAt: T0 + MINUTE,
      doneByStaffId: anaId,
    });
  });

  test("when two people reach for it, the first one keeps it", async () => {
    const env = await world();
    const { anaId, markoId, ana, marko, table } = await shift(env);
    const id = await addRequest(env.t, table);
    expect(await act(env, "accept", id, { token: ana })).toMatchObject({ ok: true, changed: true });
    expect(await act(env, "accept", id, { token: marko })).toEqual({
      ok: false,
      code: "request/taken",
      status: "accepted",
      takenBy: "Ana",
    });
    expect(await requestRow(env.t, id)).toMatchObject({ status: "accepted", acceptedByStaffId: anaId });

    // Finishing is open to the floor: Marko may close Ana's request, and both are on the row.
    expect(await act(env, "complete", id, { token: marko })).toEqual({ ok: true, status: "done", changed: true });
    expect(await requestRow(env.t, id)).toMatchObject({ acceptedByStaffId: anaId, doneByStaffId: markoId });
  });

  test("a request the guest cancelled cannot be accepted or finished", async () => {
    const env = await world();
    const { ana, table } = await shift(env);
    const id = await addRequest(env.t, table, { status: "cancelled", cancelledAt: T0, cancelledBy: "guest" });
    for (const name of ["accept", "complete"] as const) {
      expect(await act(env, name, id, { token: ana })).toEqual({
        ok: false,
        code: "request/invalid_transition",
        status: "cancelled",
      });
    }
    expect(await act(env, "cancel", id, { token: ana })).toEqual({ ok: true, status: "cancelled", changed: false });
    const row = await requestRow(env.t, id);
    expect(row).toMatchObject({ status: "cancelled", cancelledBy: "guest" });
    expect(row?.cancelledByStaffId).toBeUndefined();
    expect(await auditRows(env.t, "request.cancelled")).toHaveLength(0);
  });

  test("staff may cancel a new or an accepted request; it is written and audited", async () => {
    const env = await world();
    const { anaId, markoId, ana, marko, table } = await shift(env);
    const accepted = await addRequest(env.t, table, { kind: "bill", status: "accepted", acceptedByStaffId: markoId, acceptedAt: T0 });
    const fresh = await addRequest(env.t, table);

    vi.setSystemTime(T0 + MINUTE);
    expect(await act(env, "cancel", accepted, { token: ana })).toEqual({ ok: true, status: "cancelled", changed: true });
    expect(await requestRow(env.t, accepted)).toMatchObject({
      status: "cancelled",
      cancelledBy: "staff",
      cancelledByStaffId: anaId,
      cancelledAt: T0 + MINUTE,
      acceptedByStaffId: markoId,
    });
    expect(await act(env, "cancel", fresh, { token: marko })).toMatchObject({ ok: true, changed: true });

    const audit = await auditRows(env.t, "request.cancelled");
    expect(audit).toHaveLength(2);
    expect(audit[0]).toMatchObject({
      actorKind: "staff",
      actorRef: anaId,
      entityType: "request",
      entityKey: accepted,
      details: { kind: "bill", channel: "standard", from: "accepted", by: "staff" },
    });
    expect(audit[1]).toMatchObject({ actorKind: "staff", actorRef: markoId, entityKey: fresh, details: { from: "new" } });
    // The guest's own cancel reads "Gost je otkazao"; this one says staff.
    expect((await getQueue(env, ana))?.recentlyCancelled.map((row) => row.cancelledBy)).toEqual(["staff", "staff"]);
  });

  test("Otkaži with a stale expectation writes nothing", async () => {
    const env = await world();
    const { markoId, ana, table } = await shift(env);
    const id = await addRequest(env.t, table, { status: "accepted", acceptedByStaffId: markoId, acceptedAt: T0 });
    expect(await act(env, "cancel", id, { token: ana, expectedStatus: "new" })).toEqual({
      ok: false,
      code: "staff/status_changed",
      status: "accepted",
    });
    expect(await requestRow(env.t, id)).toMatchObject({ status: "accepted", acceptedByStaffId: markoId });
    expect(await auditRows(env.t, "request.cancelled")).toHaveLength(0);

    expect(await act(env, "cancel", id, { token: ana, expectedStatus: "accepted" })).toEqual({
      ok: true,
      status: "cancelled",
      changed: true,
    });
    expect(await auditRows(env.t, "request.cancelled")).toHaveLength(1);
  });

  test("done is final", async () => {
    const env = await world();
    const { ana, table } = await shift(env);
    const id = await addRequest(env.t, table, { status: "done", acceptedAt: T0, doneAt: T0 });
    for (const name of ["accept", "cancel"] as const) {
      expect(await act(env, name, id, { token: ana })).toEqual({
        ok: false,
        code: "request/invalid_transition",
        status: "done",
      });
    }
    expect(await act(env, "complete", id, { token: ana })).toEqual({ ok: true, status: "done", changed: false });
    expect(await requestRow(env.t, id)).toMatchObject({ status: "done" });
    expect(await auditRows(env.t, "request.cancelled")).toHaveLength(0);
  });

  test("the Owner's account works requests too, recorded as a user, and clashes with staff", async () => {
    const env = await world();
    const { anaId, ana, table } = await shift(env);
    const { w, t } = env;
    const id = await addRequest(env.t, table);
    expect(await act(env, "accept", id, { who: env.owner })).toEqual({ ok: true, status: "accepted", changed: true });
    const row = await requestRow(t, id);
    expect(row).toMatchObject({ acceptedByUserId: w.ownerId });
    expect(row?.acceptedByStaffId).toBeUndefined();
    expect(await act(env, "accept", id, { who: env.owner })).toMatchObject({ ok: true, changed: false });
    expect(await act(env, "accept", id, { token: ana })).toEqual({
      ok: false,
      code: "request/taken",
      status: "accepted",
      takenBy: "Vlasnik ili menadžer",
    });
    // A Manager is a different person from the Owner.
    expect(await act(env, "accept", id, { who: as(t, w.managerId) })).toMatchObject({ ok: false, code: "request/taken", takenBy: "Vlasnik ili menadžer" });

    // The Owner cancels; the audit says a user did, and the row names the account.
    expect(await act(env, "cancel", id, { who: env.owner })).toMatchObject({ ok: true, status: "cancelled" });
    expect(await requestRow(t, id)).toMatchObject({ cancelledBy: "staff", cancelledByUserId: w.ownerId });
    expect((await auditRows(t, "request.cancelled"))[0]).toMatchObject({ actorKind: "user", actorUserId: w.ownerId });

    // The other direction: Ana has it, the Manager is told so.
    const second = await addRequest(t, table);
    await act(env, "accept", second, { token: ana });
    expect(await act(env, "accept", second, { who: as(t, w.managerId) })).toMatchObject({ code: "request/taken", takenBy: "Ana" });
    expect(await requestRow(t, second)).toMatchObject({ acceptedByStaffId: anaId });
  });

  test("a signed-out caller changes nothing", async () => {
    const env = await world();
    const { ana, table } = await shift(env);
    const id = await addRequest(env.t, table);
    const { w, t } = env;
    const callers: (Opts & { token?: string })[] = [
      { token: "nope" },
      { token: "A".repeat(43) },
      { token: "" },
      { token: ana, venue: "b" }, // a real token at another venue's panel
      { who: as(t, w.editorId) },
      { who: as(t, w.financeId) },
      { who: as(t, w.outsiderId) },
      { who: as(t, w.otherOwnerId) },
      {},
      { who: env.owner, token: "nope" }, // a bad token is never a fallback to the account
    ];
    for (const caller of callers) {
      for (const name of ["accept", "complete", "cancel"] as const) {
        expect(await act(env, name, id, caller)).toEqual({ ok: false, code: "staff/signed_out" });
      }
    }
    expect(await requestRow(t, id)).toMatchObject({ status: "new" });
  });

  test("a request of another venue is request/not_found and stays untouched", async () => {
    const env = await world();
    const { ana, table } = await shift(env);
    const foreign = await addTable(env.t, env.w.b, "Sto 1");
    const theirs = await addRequest(env.t, foreign);
    const mine = await addRequest(env.t, table);
    for (const name of ["accept", "complete", "cancel"] as const) {
      expect(await act(env, name, theirs, { token: ana })).toEqual({ ok: false, code: "request/not_found" });
      expect(await act(env, name, theirs, { who: env.owner })).toEqual({ ok: false, code: "request/not_found" });
    }
    expect(await requestRow(env.t, theirs)).toMatchObject({ status: "new" });
    expect(await act(env, "accept", mine, { token: ana })).toMatchObject({ ok: true });
  });

  test("a session past its 12 hours cannot act even before the expiry is written", async () => {
    const env = await world();
    const { table } = await shift(env);
    await addStaff(env, "Nikola", "468");
    const nikola = await signIn(env, "468");
    const id = await addRequest(env.t, table);

    vi.setSystemTime(nikola.expiresAt - 1);
    expect(await act(env, "accept", id, { token: nikola.sessionToken })).toMatchObject({ ok: true });
    vi.setSystemTime(nikola.expiresAt);
    // Queries see only the materialized end (they cannot read the clock) ...
    expect(await getMe(env, nikola.sessionToken)).not.toBeNull();
    // ... mutations compare expiresAt with the clock.
    for (const name of ["accept", "complete", "cancel"] as const) {
      expect(await act(env, name, id, { token: nikola.sessionToken })).toEqual({ ok: false, code: "staff/signed_out" });
    }
    expect(await requestRow(env.t, id)).toMatchObject({ status: "accepted" });
  });

  test("a stuck client is held at 60 actions a minute per session", async () => {
    const env = await world();
    const { ana, marko, table } = await shift(env);
    const id = await addRequest(env.t, table);
    for (let tap = 0; tap < 60; tap += 1) {
      expect(await act(env, "accept", id, { token: ana })).toMatchObject({ ok: true });
    }
    expect(await act(env, "accept", id, { token: ana })).toEqual({ ok: false, code: "staff/rate_limited" });
    // Another session has its own bucket; a minute later Ana's has refilled.
    expect(await act(env, "accept", id, { token: marko })).toMatchObject({ code: "request/taken" });
    vi.setSystemTime(T0 + MINUTE);
    expect(await act(env, "accept", id, { token: ana })).toMatchObject({ ok: true, changed: false });
  });
});

// =============================================================================
// 12. No PIN in the clear anywhere
// =============================================================================

type Found = { strings: string[]; numbers: number[]; keys: string[] };

function scan(value: unknown, found: Found) {
  if (typeof value === "string") found.strings.push(value);
  else if (typeof value === "number") found.numbers.push(value);
  else if (Array.isArray(value)) for (const item of value) scan(item, found);
  else if (value && typeof value === "object") {
    for (const [key, inner] of Object.entries(value)) {
      found.keys.push(key);
      scan(inner, found);
    }
  }
}

describe("secrets at rest", () => {
  test("no PIN or raw token is stored or returned; only a lookup and a salted hash", async () => {
    const env = await world();
    const anaId = await addStaff(env, "Ana", "739");
    const markoId = await addStaff(env, "Marko"); // no PIN at all
    const results: unknown[] = [];

    // Five misses lock a device, one more miss from a new device, a lock that ends, a sign-in, a logout, a sign-in.
    const first = await login(env, "111");
    const device = deviceOf(first);
    results.push(first);
    for (let miss = 1; miss < 5; miss += 1) results.push(await login(env, "111", { deviceToken: device }));
    results.push(await login(env, "739", { deviceToken: device })); // locked: refused
    results.push(await login(env, "222", { ipHash: ip(2) }));
    vi.setSystemTime(T0 + PIN_LOCK_MS + 1000);
    const ok = await signIn(env, "739", { deviceToken: device });
    results.push(ok, await getMe(env, ok.sessionToken), await getQueue(env, ok.sessionToken));
    await env.t.mutation(api.menuWaiter.logout, { ...panel(env), sessionToken: ok.sessionToken });
    const live = await signIn(env, "739", { deviceToken: device });
    results.push(live);
    results.push(await env.owner.query(api.menuStaff.list, { menuServiceId: env.w.a.menuServiceId }));

    const dump = await env.t.run(async (ctx) => ({
      menuStaff: await ctx.db.query("menuStaff").take(1000),
      menuStaffSessions: await ctx.db.query("menuStaffSessions").take(1000),
      menuPinAttempts: await ctx.db.query("menuPinAttempts").take(1000),
      menuAuditLog: await ctx.db.query("menuAuditLog").take(1000),
      menuSecrets: await ctx.db.query("menuSecrets").take(1000),
    }));
    expect(dump.menuAuditLog.map((row) => row.action)).toEqual(
      expect.arrayContaining(["staff.pin_set", "staff.pin_locked", "staff.login", "staff.logout"]),
    );
    expect(dump.menuPinAttempts.length).toBeGreaterThan(2);
    expect(dump.menuStaffSessions).toHaveLength(2);

    const found: Found = { strings: [], numbers: [], keys: [] };
    scan(dump, found);
    for (const secret of ["739", "111", "222"]) expect(found.strings).not.toContain(secret);
    expect(found.numbers).not.toContain(739);
    expect(found.keys).not.toContain("pin");
    // The raw bearer tokens are never stored either.
    for (const token of [ok.sessionToken, live.sessionToken, device, ok.deviceToken]) expect(found.strings).not.toContain(token);

    const ana = dump.menuStaff.find((row) => row._id === anaId);
    expect(ana?.pinHash?.startsWith("pbkdf2-sha256$")).toBe(true);
    expect(ana?.pinLookup).toMatch(/^[0-9a-f]{64}$/);
    const marko = dump.menuStaff.find((row) => row._id === markoId);
    expect(marko?.pinHash).toBeUndefined();
    expect(marko?.pinLookup).toBeUndefined();
    for (const session of dump.menuStaffSessions) expect(session.tokenHash).toMatch(/^[0-9a-f]{64}$/);

    // Nothing the panel or the management list returns carries a PIN, a hash or a token hash.
    const returned: Found = { strings: [], numbers: [], keys: [] };
    scan(results, returned);
    for (const secret of ["739", "111", "222"]) expect(returned.strings).not.toContain(secret);
    for (const key of ["pin", "pinHash", "pinLookup", "tokenHash", "deviceKeyHash"]) {
      expect(returned.keys).not.toContain(key);
    }
    expect(returned.strings.some((value) => value.startsWith("pbkdf2-sha256$"))).toBe(false);
    const loginAudit = dump.menuAuditLog.filter((row) => row.action === "staff.pin_set");
    expect(loginAudit.every((row) => row.details && !("pin" in row.details))).toBe(true);
  });
});

// =============================================================================
// 13. Hardening after the security review of K22
// =============================================================================

describe("hardening (security review K22)", () => {
  test("a sign-in older than the member's PIN opens nothing, even when no batch ended its row", async () => {
    const env = await world();
    const anaId = await addStaff(env, "Ana", "246");
    const ana = await signIn(env, "246");
    expect(await getMe(env, ana.sessionToken)).not.toBeNull();
    // A PIN change whose session batch missed this row (e.g. more than 500 rows).
    vi.setSystemTime(T0 + MINUTE);
    await env.t.run(async (ctx) => {
      await ctx.db.patch(anaId, { pinSetAt: Date.now() });
    });
    expect((await sessionRows(env.t))[0].endedAt).toBeUndefined();
    expect(await getMe(env, ana.sessionToken)).toBeNull();
    expect(await getQueue(env, ana.sessionToken)).toBeNull();
    const table = await addTable(env.t, env.w.a, "Sto 4");
    const [id] = await addRequests(env.t, table, 1);
    expect(await act(env, "accept", id, { token: ana.sessionToken })).toEqual({ ok: false, code: "staff/signed_out" });
  });

  test("a sign-in older than the last change of the panel code opens nothing", async () => {
    const env = await world();
    await addStaff(env, "Ana", "246");
    const ana = await signIn(env, "246");
    vi.setSystemTime(T0 + MINUTE);
    await env.t.run(async (ctx) => {
      const secret = await ctx.db
        .query("menuSecrets")
        .withIndex("by_menuServiceId_and_kind", (q) => q.eq("menuServiceId", env.w.a.menuServiceId).eq("kind", "panel_code"))
        .unique();
      if (secret) await ctx.db.patch(secret._id, { rotatedAt: Date.now() });
    });
    expect(await getMe(env, ana.sessionToken)).toBeNull();
    // A sign-in after the change works.
    vi.setSystemTime(T0 + 2 * MINUTE);
    const again = await signIn(env, "246");
    expect(await getMe(env, again.sessionToken)).toMatchObject({ displayName: "Ana" });
  });

  test("unlockPins lifts the venue lock even behind 600 device counters", async () => {
    const env = await world();
    await env.t.run(async (ctx) => {
      for (let i = 0; i < 600; i += 1) {
        await ctx.db.insert("menuPinAttempts", {
          menuServiceId: env.w.a.menuServiceId,
          scope: "device",
          scopeKey: `uredjaj-${String(i).padStart(4, "0")}`,
          failures: 1,
          windowStartedAt: T0,
          updatedAt: T0,
        });
      }
      await ctx.db.insert("menuPinAttempts", {
        menuServiceId: env.w.a.menuServiceId,
        scope: "venue",
        scopeKey: "venue",
        failures: 0,
        windowStartedAt: T0,
        lockedUntil: T0 + PIN_LOCK_MS,
        updatedAt: T0,
      });
    });
    await env.owner.mutation(api.menuStaff.unlockPins, { menuServiceId: env.w.a.menuServiceId });
    const venue = await env.t.run(async (ctx) =>
      (await ctx.db.query("menuPinAttempts").take(1000)).find((row) => row.scope === "venue"),
    );
    expect(venue?.lockedUntil).toBeUndefined();
  });

  test("the sweep always makes progress: ended rows are deleted, a lost expiry behind them is ended", async () => {
    const env = await world();
    const anaId = await addStaff(env, "Ana", "246");
    const late = await signIn(env, "246");
    await env.t.run(async (ctx) => {
      for (let i = 0; i < 250; i += 1) {
        await ctx.db.insert("menuStaffSessions", {
          menuServiceId: env.w.a.menuServiceId,
          staffId: anaId,
          deviceKeyHash: `stari-${i}`,
          tokenHash: `stari-${i}`,
          createdAt: T0 - STAFF_SESSION_MS - 60 * MINUTE,
          expiresAt: T0 - 60 * MINUTE + i,
          endedAt: T0 - 120 * MINUTE,
          endReason: "logout",
        });
      }
    });
    vi.setSystemTime(T0 + STAFF_SESSION_MS + 1000); // the scheduled expiry of `late` never ran
    await env.t.mutation(internal.menuWaiter.sweepExpiredSessions, {});
    await env.t.finishAllScheduledFunctions(vi.runAllTimers);
    const rows = await env.t.run(async (ctx) => await ctx.db.query("menuStaffSessions").take(1000));
    expect(rows.filter((row) => row.deviceKeyHash.startsWith("stari-"))).toHaveLength(0);
    // Behind 250 ended rows the lost expiry is reached and ended in the same run (deleted by a later one).
    expect(rows.find((row) => row.expiresAt === late.expiresAt)).toMatchObject({ endReason: "expired", endedAt: late.expiresAt });
    expect(await getMe(env, late.sessionToken)).toBeNull();
  });

  test("the PIN hash is keyed by the pepper: a copy of the table without it says nothing", async () => {
    const env = await world();
    const anaId = await addStaff(env, "Ana", "739");
    const hash = await env.t.run(async (ctx) => (await ctx.db.get(anaId))?.pinHash);
    expect(hash).toMatch(/^pbkdf2-sha256\$/);
    const { verifyPin } = await import("./orderingShifts");
    const { verifyStaffPin } = await import("./lib/menuPin");
    expect(await verifyPin("739", hash!)).toBe(false);
    expect(await verifyStaffPin("test-pepper-0123456789abcdef", env.w.a.menuServiceId, "739", hash)).toBe(true);
    expect(await verifyStaffPin("drugi-pepper-0123456789abcdef", env.w.a.menuServiceId, "739", hash)).toBe(false);
    expect(await verifyStaffPin("test-pepper-0123456789abcdef", env.w.b.menuServiceId, "739", hash)).toBe(false);
  });

  test("staff never see an account's e-mail: a nameless Owner who took a request is a neutral label", async () => {
    const env = await world();
    await addStaff(env, "Ana", "246");
    const ana = await signIn(env, "246");
    const table = await addTable(env.t, env.w.a, "Sto 6");
    const [id] = await addRequests(env.t, table, 1);
    await act(env, "accept", id, { who: env.owner });
    const queue = await getQueue(env, ana.sessionToken);
    const row = queue?.requests.find((r) => r.id === id);
    expect(row?.acceptedBy).toEqual({ name: "Vlasnik ili menadžer", isMe: false });
    expect(JSON.stringify(queue)).not.toContain("vlasnik@");
    expect(JSON.stringify(queue)).not.toContain('"vlasnik"');
  });
});
