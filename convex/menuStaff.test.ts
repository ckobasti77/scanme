/// <reference types="vite/client" />

// ScanMe Menu V1 — K22: the staff of a venue and the waiter-panel link (convex/menuStaff.ts). Proven here: the `staff.pin`
// permission and the refusal code each caller gets, tenant isolation, the three-digit PIN rules, that a PIN is stored only as
// the lookup HMAC and the salted hash (never audited), that resetting/changing a PIN, deactivating a member and rotating the
// panel code sign devices out, the staff limit, the panel code and the lifting of PIN locks.
// Fictional people and venues only (the repo is public): "Ana", "Marko", "Kafana kod Mike", "Demo restoran".

import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { MENU_ERROR } from "../lib/menu/errors/core";
import { STAFF_ERROR } from "../lib/menu/errors/waiter";
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
const PEPPER = "test-pepper-0123456789abcdef";
const PANEL_CODE_PATTERN = /^[0-9A-HJKMNP-TV-Z]{10}$/;

beforeEach(() => {
  process.env.SCANME_ADMIN_EMAILS = TEST_ADMIN_EMAIL;
  process.env.MENU_PIN_PEPPER = PEPPER;
});
afterEach(() => {
  delete process.env.MENU_PIN_PEPPER;
});

const newTest = () => {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  return t;
};
type T = ReturnType<typeof newTest>;
/** Anything that can call a function: the anonymous client or one signed in as a user. */
type Caller = Pick<T, "mutation" | "query">;

function as(t: T, userId: Id<"users">) {
  return t.withIdentity({ subject: userId, issuer: TEST_ISSUER });
}

type Who = "owner" | "manager" | "admin" | "editor" | "finance" | "viewOnly" | "outsider" | "otherOwner";
const PERMITTED = ["owner", "manager", "admin"] as const satisfies readonly Who[];
const REFUSED = ["editor", "finance", "viewOnly", "outsider", "otherOwner"] as const satisfies readonly Who[];

function userOf(w: MenuWorldSeed, who: Who): Id<"users"> {
  const ids: Record<Who, Id<"users">> = {
    owner: w.ownerId,
    manager: w.managerId,
    admin: w.adminId,
    editor: w.editorId,
    finance: w.financeId,
    viewOnly: w.viewOnlyId,
    outsider: w.outsiderId,
    otherOwner: w.otherOwnerId,
  };
  return ids[who];
}

// -----------------------------------------------------------------------------
// Data helpers
// -----------------------------------------------------------------------------

async function world() {
  const t = newTest();
  const w = await t.run((ctx) => seedMenuWorld(ctx));
  return { t, w, owner: as(t, w.ownerId) };
}

/** The ConvexError code a call is refused with, or "ok" when it went through. */
async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "ok";
  } catch (error) {
    if (error instanceof ConvexError && typeof error.data === "string") return error.data;
    throw error;
  }
}

/** A member inserted straight into the table (no PIN, no audit): fast set-up. */
function insertStaff(t: T, tenant: MenuTenantSeed, displayName: string, active = true) {
  return t.run(async (ctx) => {
    const now = Date.now();
    const { menuServiceId, businessId } = tenant;
    return await ctx.db.insert("menuStaff", { menuServiceId, businessId, displayName, panelRole: "staff", active, createdAt: now, updatedAt: now });
  });
}

/** A member created through the API with an explicit PIN. */
async function memberWithPin(owner: Caller, tenant: MenuTenantSeed, displayName: string, pin: string) {
  const { staffId } = await owner.mutation(api.menuStaff.create, { menuServiceId: tenant.menuServiceId, displayName });
  await owner.mutation(api.menuStaff.setPin, { staffId, pin });
  return staffId;
}

async function panelCodeOf(owner: Caller, tenant: MenuTenantSeed) {
  return (await owner.mutation(api.menuStaff.ensurePanelCode, { menuServiceId: tenant.menuServiceId })).code;
}

async function listOf(caller: Caller, tenant: MenuTenantSeed) {
  const rows = await caller.query(api.menuStaff.list, { menuServiceId: tenant.menuServiceId });
  if (!rows) throw new Error("list was refused");
  return rows;
}

const staffRow = (t: T, id: Id<"menuStaff">) => t.run((ctx) => ctx.db.get(id));
const sessionRows = (t: T, staffId: Id<"menuStaff">) =>
  t.run((ctx) => ctx.db.query("menuStaffSessions").withIndex("by_staffId", (q) => q.eq("staffId", staffId)).collect());
const auditRows = (t: T, menuServiceId: Id<"menuServices">, action: string) =>
  t.run(async (ctx) => {
    const rows = await ctx.db
      .query("menuAuditLog")
      .withIndex("by_menuServiceId_and_createdAt", (q) => q.eq("menuServiceId", menuServiceId))
      .collect();
    return rows.filter((row) => row.action === action);
  });

const WRITTEN_TABLES = ["menuStaff", "menuStaffSessions", "menuPinAttempts", "menuSecrets", "menuAuditLog"] as const;
/** Everything the staff mutations can write, counted: a refusal must leave it unchanged. */
const rowCounts = (t: T) =>
  t.run(async (ctx) => Promise.all(WRITTEN_TABLES.map(async (table) => (await ctx.db.query(table).collect()).length)));

// -----------------------------------------------------------------------------
// Waiter-panel helpers (sign-in goes through the real menuWaiter functions)
// -----------------------------------------------------------------------------

function signIn(t: T, panelCode: string, pin: string, deviceToken?: string, slug = SLUG_A, ipHash?: string) {
  return t.mutation(api.menuWaiter.loginWithPin, {
    slug,
    panelCode,
    pin,
    ...(deviceToken ? { deviceToken } : {}),
    ...(ipHash ? { ipHash } : {}),
  });
}

async function signInOk(t: T, panelCode: string, pin: string, deviceToken?: string, slug = SLUG_A) {
  const result = await signIn(t, panelCode, pin, deviceToken, slug);
  if (!result.ok) throw new Error(`sign-in with ${pin} was refused: ${result.code}`);
  return result;
}

async function isSignedIn(t: T, panelCode: string, sessionToken: string, slug = SLUG_A) {
  return (await t.query(api.menuWaiter.me, { slug, panelCode, sessionToken })) !== null;
}

/** Five wrong PINs from one device: the fifth locks it. Returns the device token. */
async function lockDevice(t: T, panelCode: string): Promise<string> {
  let deviceToken: string | undefined;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const result = await signIn(t, panelCode, "000", deviceToken);
    if (result.ok || !("deviceToken" in result)) throw new Error("a wrong PIN must answer with a device token");
    expect(result.code).toBe(attempt < 5 ? STAFF_ERROR.wrongPin : STAFF_ERROR.locked);
    deviceToken = result.deviceToken;
  }
  return deviceToken as string;
}

// ===== 1. Roles =====

type Ids = { menuServiceId: Id<"menuServices">; staffId: Id<"menuStaff"> };
type Op = { name: string; target: "service" | "row"; run: (caller: Caller, ids: Ids) => Promise<unknown> };

const OPS: Op[] = [
  { name: "create", target: "service", run: (c, i) => c.mutation(api.menuStaff.create, { menuServiceId: i.menuServiceId, displayName: "Nova" }) },
  { name: "setPin", target: "row", run: (c, i) => c.mutation(api.menuStaff.setPin, { staffId: i.staffId }) },
  { name: "resetPin", target: "row", run: (c, i) => c.mutation(api.menuStaff.resetPin, { staffId: i.staffId }) },
  { name: "deactivate", target: "row", run: (c, i) => c.mutation(api.menuStaff.deactivate, { staffId: i.staffId }) },
  { name: "unlockPins", target: "service", run: (c, i) => c.mutation(api.menuStaff.unlockPins, { menuServiceId: i.menuServiceId }) },
  { name: "ensurePanelCode", target: "service", run: (c, i) => c.mutation(api.menuStaff.ensurePanelCode, { menuServiceId: i.menuServiceId }) },
  { name: "rotatePanelCode", target: "service", run: (c, i) => c.mutation(api.menuStaff.rotatePanelCode, { menuServiceId: i.menuServiceId }) },
  { name: "rename", target: "row", run: (c, i) => c.mutation(api.menuStaff.rename, { staffId: i.staffId, displayName: "Novo ime" }) },
  { name: "setPanelRole", target: "row", run: (c, i) => c.mutation(api.menuStaff.setPanelRole, { staffId: i.staffId, panelRole: "manager" }) },
];

/**
 * Addressed by menuServiceId, any caller without the permission is `menu/forbidden`. Addressed by a member row, a caller with NO
 * Menu role in that venue (finance and view-only account members, outsiders, another venue's owner) gets `menu/not_found` (no
 * existence oracle); only the Urednik, who has a role without `staff.pin`, is told `menu/forbidden`.
 */
function refusalOf(op: Op, who: (typeof REFUSED)[number]): string {
  return op.target === "row" && who !== "editor" ? MENU_ERROR.notFound : MENU_ERROR.forbidden;
}

describe("permission staff.pin", () => {
  for (const op of OPS) {
    test(`${op.name}: Owner, Manager and ScanMe admin may`, async () => {
      const { t, w } = await world();
      for (const who of PERMITTED) {
        const staffId = await insertStaff(t, w.a, `Ana (${who})`);
        expect(await codeOf(op.run(as(t, userOf(w, who)), { menuServiceId: w.a.menuServiceId, staffId })), who).toBe("ok");
      }
    });

    test(`${op.name}: Urednik, finance, view-only, outsider and another venue's owner are refused, nothing is written`, async () => {
      const { t, w } = await world();
      const staffId = await insertStaff(t, w.a, "Ana");
      const before = await rowCounts(t);
      for (const who of REFUSED) {
        const outcome = await codeOf(op.run(as(t, userOf(w, who)), { menuServiceId: w.a.menuServiceId, staffId }));
        expect(outcome, who).toBe(refusalOf(op, who));
      }
      expect(await rowCounts(t)).toEqual(before);
    });
  }

  test("an anonymous caller is menu/unauthenticated on every mutation", async () => {
    const { t, w } = await world();
    const staffId = await insertStaff(t, w.a, "Ana");
    for (const op of OPS) {
      expect(await codeOf(op.run(t, { menuServiceId: w.a.menuServiceId, staffId })), op.name).toBe(MENU_ERROR.unauthenticated);
    }
  });

  test("list and panelLink answer Owner, Manager and admin; everyone else gets null", async () => {
    const { t, w, owner } = await world();
    const code = await panelCodeOf(owner, w.a);
    await insertStaff(t, w.a, "Ana");
    const args = { menuServiceId: w.a.menuServiceId };

    for (const who of PERMITTED) {
      const caller = as(t, userOf(w, who));
      expect((await caller.query(api.menuStaff.list, args))?.map((row) => row.displayName), who).toEqual(["Ana"]);
      expect(await caller.query(api.menuStaff.panelLink, args), who).toEqual({ code, path: `/${SLUG_A}/konobar/${code}` });
    }
    for (const who of REFUSED) {
      expect(await as(t, userOf(w, who)).query(api.menuStaff.list, args), who).toBeNull();
      expect(await as(t, userOf(w, who)).query(api.menuStaff.panelLink, args), who).toBeNull();
    }
    expect(await t.query(api.menuStaff.list, args)).toBeNull();
    expect(await t.query(api.menuStaff.panelLink, args)).toBeNull();
  });

  test("the audit trail names the actor: a user, or the ScanMe admin", async () => {
    const { t, w, owner } = await world();
    const args = { menuServiceId: w.a.menuServiceId };
    const byOwner = await owner.mutation(api.menuStaff.create, { ...args, displayName: "Ana" });
    const byAdmin = await as(t, w.adminId).mutation(api.menuStaff.create, { ...args, displayName: "Marko" });
    const rows = await auditRows(t, w.a.menuServiceId, "staff.created");
    expect(rows.find((row) => row.entityKey === byOwner.staffId)).toMatchObject({ actorKind: "user", actorUserId: w.ownerId });
    expect(rows.find((row) => row.entityKey === byAdmin.staffId)).toMatchObject({ actorKind: "admin", actorUserId: w.adminId });
  });
});

// ===== 2. Tenant isolation =====

describe("tenant isolation", () => {
  test("another venue's owner cannot touch a staff id of this venue, and the member stays as it was", async () => {
    const { t, w, owner } = await world();
    const ana = await memberWithPin(owner, w.a, "Ana", "246");
    const before = await staffRow(t, ana);
    const stranger = as(t, w.otherOwnerId);
    const attempts = [
      () => stranger.mutation(api.menuStaff.setPin, { staffId: ana }),
      () => stranger.mutation(api.menuStaff.resetPin, { staffId: ana }),
      () => stranger.mutation(api.menuStaff.deactivate, { staffId: ana }),
      () => stranger.mutation(api.menuStaff.rename, { staffId: ana, displayName: "Presimljena" }),
      () => stranger.mutation(api.menuStaff.setPanelRole, { staffId: ana, panelRole: "manager" }),
    ];
    for (const attempt of attempts) expect(await codeOf(attempt())).toBe(MENU_ERROR.notFound);
    expect(await staffRow(t, ana)).toEqual(before);
  });

  test("a staff id of the other venue, a deleted id and the other venue's service id are all refused", async () => {
    const { t, w, owner } = await world();
    const marko = await memberWithPin(as(t, w.otherOwnerId), w.b, "Marko", "135");
    expect(await codeOf(owner.mutation(api.menuStaff.setPin, { staffId: marko }))).toBe(MENU_ERROR.notFound);

    const gone = await insertStaff(t, w.a, "Ivan");
    await t.run((ctx) => ctx.db.delete(gone));
    expect(await codeOf(owner.mutation(api.menuStaff.setPin, { staffId: gone }))).toBe(MENU_ERROR.notFound);
    // Addressed by the venue itself, the same caller is a plain refusal.
    expect(await codeOf(owner.mutation(api.menuStaff.create, { menuServiceId: w.b.menuServiceId, displayName: "Ana" }))).toBe(MENU_ERROR.forbidden);
  });

  test("list shows only the venue's own staff", async () => {
    const { t, w, owner } = await world();
    for (const name of ["Ana", "Ivan"]) await insertStaff(t, w.a, name);
    await insertStaff(t, w.b, "Marko");
    const names = (rows: { displayName: string }[]) => rows.map((row) => row.displayName).sort();

    expect(names(await listOf(owner, w.a))).toEqual(["Ana", "Ivan"]);
    expect(names(await listOf(as(t, w.otherOwnerId), w.b))).toEqual(["Marko"]);
    expect(names(await listOf(as(t, w.adminId), w.a))).toEqual(["Ana", "Ivan"]);
    expect(await as(t, w.otherOwnerId).query(api.menuStaff.list, { menuServiceId: w.a.menuServiceId })).toBeNull();
  });

  test("the same PIN may be held in both venues at once, under different lookups", async () => {
    const { t, w, owner } = await world();
    const ana = await memberWithPin(owner, w.a, "Ana", "739");
    const marko = await memberWithPin(as(t, w.otherOwnerId), w.b, "Marko", "739");
    const lookupA = (await staffRow(t, ana))?.pinLookup;
    const lookupB = (await staffRow(t, marko))?.pinLookup;
    expect(lookupA).toMatch(/^[0-9a-f]{64}$/);
    expect(lookupB).toMatch(/^[0-9a-f]{64}$/);
    expect(lookupA).not.toBe(lookupB);
  });
});

// ===== 3. PIN rules =====

describe("setPin", () => {
  test("without a pin the system picks a three-digit PIN, shown once and never listed", async () => {
    const { t, w, owner } = await world();
    const { staffId } = await owner.mutation(api.menuStaff.create, { menuServiceId: w.a.menuServiceId, displayName: "Ana" });
    expect((await listOf(owner, w.a))[0]).toMatchObject({ hasPin: false, pinSetAt: null });

    const { pin, endedSessions } = await owner.mutation(api.menuStaff.setPin, { staffId });
    expect(pin).toMatch(/^\d{3}$/);
    expect(endedSessions).toBe(0);

    const rows = await listOf(owner, w.a);
    const stored = await staffRow(t, staffId);
    expect(rows[0]).toMatchObject({ hasPin: true, active: true, displayName: "Ana", pinSetAt: expect.any(Number) });
    expect(Object.keys(rows[0])).not.toContain("pinHash");
    expect(Object.keys(rows[0])).not.toContain("pinLookup");
    expect(Object.values(rows[0])).not.toContain(pin);
    expect(Object.values(rows[0])).not.toContain(stored?.pinHash);
    expect(JSON.stringify(rows)).not.toContain("pbkdf2");
    expect(JSON.stringify(rows)).not.toContain(stored?.pinLookup as string);
  });

  test("generated PINs of 30 members are all distinct", async () => {
    const { t, w, owner } = await world();
    const ids: Id<"menuStaff">[] = [];
    for (let i = 1; i <= 30; i += 1) ids.push(await insertStaff(t, w.a, `Konobar ${i}`));
    const pins: string[] = [];
    for (const staffId of ids) pins.push((await owner.mutation(api.menuStaff.setPin, { staffId })).pin);

    for (const pin of pins) expect(pin).toMatch(/^\d{3}$/);
    expect(new Set(pins).size).toBe(30);
    const lookups = await Promise.all(ids.map(async (id) => (await staffRow(t, id))?.pinLookup));
    expect(new Set(lookups).size).toBe(30);
  });

  test("a PIN that is not exactly three digits is staff/pin_format", async () => {
    const { t, w, owner } = await world();
    const staffId = await insertStaff(t, w.a, "Ana");
    for (const pin of ["12", "1234", "abc", "", "12a", " 123", "123 ", "123\n", "1.5"]) {
      expect(await codeOf(owner.mutation(api.menuStaff.setPin, { staffId, pin })), JSON.stringify(pin)).toBe(STAFF_ERROR.pinFormat);
    }
    expect((await staffRow(t, staffId))?.pinLookup).toBeUndefined();
    expect(await codeOf(owner.mutation(api.menuStaff.setPin, { staffId, pin: "000" }))).toBe("ok");
  });

  test("a PIN held by another active member is staff/pin_taken; the holder may set the same PIN again", async () => {
    const { t, w, owner } = await world();
    const ana = await memberWithPin(owner, w.a, "Ana", "246");
    const marko = await insertStaff(t, w.a, "Marko");

    expect(await codeOf(owner.mutation(api.menuStaff.setPin, { staffId: marko, pin: "246" }))).toBe(STAFF_ERROR.pinTaken);
    expect((await staffRow(t, marko))?.pinLookup).toBeUndefined();
    expect(await owner.mutation(api.menuStaff.setPin, { staffId: ana, pin: "246" })).toMatchObject({ pin: "246" });
    expect(await owner.mutation(api.menuStaff.setPin, { staffId: marko, pin: "247" })).toMatchObject({ pin: "247" });
  });

  test("a deactivated holder frees the PIN for another member", async () => {
    const { t, w, owner } = await world();
    const ana = await memberWithPin(owner, w.a, "Ana", "246");
    const marko = await insertStaff(t, w.a, "Marko");
    await owner.mutation(api.menuStaff.deactivate, { staffId: ana });

    expect(await owner.mutation(api.menuStaff.setPin, { staffId: marko, pin: "246" })).toMatchObject({ pin: "246" });
    expect((await staffRow(t, ana))?.pinLookup).toBeUndefined();
  });

  test("without MENU_PIN_PEPPER (or with a too short one) no PIN can be set, but the rest of the staff works", async () => {
    const { t, w, owner } = await world();
    const staffId = await insertStaff(t, w.a, "Ana");

    delete process.env.MENU_PIN_PEPPER;
    expect(await codeOf(owner.mutation(api.menuStaff.setPin, { staffId }))).toBe(STAFF_ERROR.pinUnavailable);
    expect(await codeOf(owner.mutation(api.menuStaff.setPin, { staffId, pin: "246" }))).toBe(STAFF_ERROR.pinUnavailable);
    process.env.MENU_PIN_PEPPER = "too-short";
    expect(await codeOf(owner.mutation(api.menuStaff.setPin, { staffId }))).toBe(STAFF_ERROR.pinUnavailable);
    expect((await staffRow(t, staffId))?.pinLookup).toBeUndefined();

    expect(await codeOf(owner.mutation(api.menuStaff.create, { menuServiceId: w.a.menuServiceId, displayName: "Marko" }))).toBe("ok");
    expect(await codeOf(owner.mutation(api.menuStaff.resetPin, { staffId }))).toBe("ok");
    process.env.MENU_PIN_PEPPER = PEPPER;
    expect(await codeOf(owner.mutation(api.menuStaff.setPin, { staffId }))).toBe("ok");
  });
});

// ===== 4. The PIN is stored as a hash only =====

describe("PIN storage", () => {
  test("only a lookup HMAC and a salted PBKDF2 hash are stored, and the audit trail never holds the PIN", async () => {
    const { t, w, owner } = await world();
    const staffId = await memberWithPin(owner, w.a, "Ana", "739");
    const row = await staffRow(t, staffId);

    expect(row?.pinHash).toMatch(/^pbkdf2-sha256\$/);
    expect(row?.pinHash).not.toBe("739");
    expect(row?.pinLookup).toMatch(/^[0-9a-f]{64}$/);
    expect(row).toMatchObject({ pinSetByUserId: w.ownerId, pinSetAt: expect.any(Number) });
    expect(Object.values(row ?? {}).filter((value) => typeof value === "string")).not.toContain("739");

    const audit = await t.run((ctx) => ctx.db.query("menuAuditLog").collect());
    const pinSet = audit.filter((entry) => entry.action === "staff.pin_set");
    expect(pinSet).toHaveLength(1);
    expect(pinSet[0]).toMatchObject({ entityType: "staff", entityKey: staffId, actorUserId: w.ownerId });
    for (const entry of audit) {
      expect(Object.keys(entry.details ?? {}), entry.action).not.toContain("pin");
      expect(Object.values(entry.details ?? {}), entry.action).not.toContain("739");
      expect(Object.values(entry), entry.action).not.toContain("739");
    }
  });

  test("setting the same PIN again keeps the lookup but draws a fresh salt", async () => {
    const { t, w, owner } = await world();
    const staffId = await memberWithPin(owner, w.a, "Ana", "739");
    const first = await staffRow(t, staffId);
    await owner.mutation(api.menuStaff.setPin, { staffId, pin: "739" });
    const second = await staffRow(t, staffId);

    expect(second?.pinLookup).toBe(first?.pinLookup);
    expect(second?.pinHash).not.toBe(first?.pinHash);
  });
});

// ===== 5. Reset, change and deactivation end sessions =====

describe("sessions", () => {
  test("resetPin clears the PIN and signs out every device of that member only", async () => {
    const { t, w, owner } = await world();
    const ana = await memberWithPin(owner, w.a, "Ana", "246");
    const marko = await memberWithPin(owner, w.a, "Marko", "135");
    const code = await panelCodeOf(owner, w.a);
    const anaPhone = await signInOk(t, code, "246");
    const anaTablet = await signInOk(t, code, "246");
    const markoPhone = await signInOk(t, code, "135");
    const me = await t.query(api.menuWaiter.me, { slug: SLUG_A, panelCode: code, sessionToken: anaPhone.sessionToken });
    expect(me).toMatchObject({ kind: "staff", displayName: "Ana" });

    expect(await owner.mutation(api.menuStaff.resetPin, { staffId: ana })).toEqual({ ok: true, endedSessions: 2 });

    expect(await isSignedIn(t, code, anaPhone.sessionToken)).toBe(false);
    expect(await isSignedIn(t, code, anaTablet.sessionToken)).toBe(false);
    expect(await isSignedIn(t, code, markoPhone.sessionToken)).toBe(true);
    const sessions = await sessionRows(t, ana);
    expect(sessions).toHaveLength(2);
    for (const session of sessions) expect(session).toMatchObject({ endReason: "pin_reset", endedAt: expect.any(Number) });
    for (const session of await sessionRows(t, marko)) expect(session.endedAt).toBeUndefined();

    const row = await staffRow(t, ana);
    expect(row).toMatchObject({ active: true, displayName: "Ana" });
    for (const field of ["pinHash", "pinLookup", "pinSetAt", "pinSetByUserId"] as const) expect(row?.[field], field).toBeUndefined();
    expect((await listOf(owner, w.a)).find((entry) => entry.id === ana)).toMatchObject({ hasPin: false, pinSetAt: null });
    expect(await signIn(t, code, "246")).toMatchObject({ ok: false, code: STAFF_ERROR.wrongPin });

    const audit = await auditRows(t, w.a.menuServiceId, "staff.pin_reset");
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ entityKey: ana, actorUserId: w.ownerId, details: { endedSessions: 2 } });
  });

  test("resetPin on a member without a PIN is a harmless no-op; a new PIN then ends nothing", async () => {
    const { t, w, owner } = await world();
    const ana = await insertStaff(t, w.a, "Ana");
    expect(await owner.mutation(api.menuStaff.resetPin, { staffId: ana })).toEqual({ ok: true, endedSessions: 0 });
    expect(await owner.mutation(api.menuStaff.setPin, { staffId: ana })).toMatchObject({ endedSessions: 0 });
    expect(await t.run((ctx) => ctx.db.query("menuStaffSessions").collect())).toHaveLength(0);
  });

  test("changing an existing PIN signs the member's devices out; the first PIN ends nothing", async () => {
    const { t, w, owner } = await world();
    const { staffId } = await owner.mutation(api.menuStaff.create, { menuServiceId: w.a.menuServiceId, displayName: "Ana" });
    const code = await panelCodeOf(owner, w.a);
    expect(await owner.mutation(api.menuStaff.setPin, { staffId, pin: "246" })).toEqual({ pin: "246", endedSessions: 0 });
    const device = await signInOk(t, code, "246");

    expect(await owner.mutation(api.menuStaff.setPin, { staffId, pin: "135" })).toEqual({ pin: "135", endedSessions: 1 });

    expect(await isSignedIn(t, code, device.sessionToken)).toBe(false);
    expect((await sessionRows(t, staffId))[0]).toMatchObject({ endReason: "pin_reset" });
    expect(await signIn(t, code, "246")).toMatchObject({ ok: false, code: STAFF_ERROR.wrongPin });
    expect(await signIn(t, code, "135")).toMatchObject({ ok: true, displayName: "Ana" });
    const audit = await auditRows(t, w.a.menuServiceId, "staff.pin_set");
    expect(audit.map((entry) => entry.details)).toEqual([
      { generated: false, replaced: false, endedSessions: 0 },
      { generated: false, replaced: true, endedSessions: 1 },
    ]);
  });

  test("deactivate clears the PIN, signs the member out, is audited and idempotent", async () => {
    const { t, w, owner } = await world();
    const ana = await memberWithPin(owner, w.a, "Ana", "246");
    const marko = await memberWithPin(owner, w.a, "Marko", "135");
    const code = await panelCodeOf(owner, w.a);
    const device = await signInOk(t, code, "246");

    expect(await owner.mutation(api.menuStaff.deactivate, { staffId: ana })).toEqual({ ok: true, endedSessions: 1 });

    const row = await staffRow(t, ana);
    expect(row).toMatchObject({ active: false, deactivatedAt: expect.any(Number) });
    for (const field of ["pinHash", "pinLookup", "pinSetAt"] as const) expect(row?.[field], field).toBeUndefined();
    expect(await isSignedIn(t, code, device.sessionToken)).toBe(false);
    expect((await sessionRows(t, ana))[0]).toMatchObject({ endReason: "deactivated" });
    expect(await signIn(t, code, "246")).toMatchObject({ ok: false, code: STAFF_ERROR.wrongPin });
    const audit = await auditRows(t, w.a.menuServiceId, "staff.deactivated");
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ entityKey: ana, actorUserId: w.ownerId, details: { endedSessions: 1 } });

    // Second time: nothing changes, nothing is audited.
    expect(await owner.mutation(api.menuStaff.deactivate, { staffId: ana })).toEqual({ ok: true, endedSessions: 0 });
    expect(await auditRows(t, w.a.menuServiceId, "staff.deactivated")).toHaveLength(1);
    // Active members are listed first; the other member keeps his PIN.
    const rows = await listOf(owner, w.a);
    expect(rows.map((entry) => [entry.displayName, entry.active])).toEqual([["Marko", true], ["Ana", false]]);
    expect(rows[0]).toMatchObject({ id: marko, hasPin: true });
  });

  test("rename, setPanelRole and setPin on a deactivated member are staff/inactive", async () => {
    const { t, w, owner } = await world();
    const ana = await insertStaff(t, w.a, "Ana", false);
    const before = await staffRow(t, ana);

    expect(await codeOf(owner.mutation(api.menuStaff.rename, { staffId: ana, displayName: "Anica" }))).toBe(STAFF_ERROR.inactive);
    expect(await codeOf(owner.mutation(api.menuStaff.setPanelRole, { staffId: ana, panelRole: "manager" }))).toBe(STAFF_ERROR.inactive);
    expect(await codeOf(owner.mutation(api.menuStaff.setPin, { staffId: ana }))).toBe(STAFF_ERROR.inactive);
    expect(await codeOf(owner.mutation(api.menuStaff.setPin, { staffId: ana, pin: "246" }))).toBe(STAFF_ERROR.inactive);
    expect(await staffRow(t, ana)).toEqual(before);
  });
});

// ===== 6. create, rename, setPanelRole, the limit =====

describe("members", () => {
  test("create trims the name, defaults the panel role to staff and writes staff.created", async () => {
    const { t, w, owner } = await world();
    const args = { menuServiceId: w.a.menuServiceId };
    const { staffId } = await owner.mutation(api.menuStaff.create, { ...args, displayName: "  Ana   Jović  " });

    expect(await staffRow(t, staffId)).toMatchObject({
      displayName: "Ana Jović",
      panelRole: "staff",
      active: true,
      menuServiceId: w.a.menuServiceId,
      businessId: w.a.businessId,
      createdByUserId: w.ownerId,
    });
    expect((await listOf(owner, w.a))[0]).toEqual({
      id: staffId,
      displayName: "Ana Jović",
      panelRole: "staff",
      active: true,
      hasPin: false,
      pinSetAt: null,
      activeZoneId: null,
      createdAt: expect.any(Number),
    });
    const audit = await auditRows(t, w.a.menuServiceId, "staff.created");
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ entityType: "staff", entityKey: staffId, details: { panelRole: "staff" } });

    const manager = await owner.mutation(api.menuStaff.create, { ...args, displayName: "Marko", panelRole: "manager" });
    expect((await staffRow(t, manager.staffId))?.panelRole).toBe("manager");
    expect((await auditRows(t, w.a.menuServiceId, "staff.created"))[1].details).toEqual({ panelRole: "manager" });
  });

  test("an empty or longer than 40 characters name is staff/name_invalid (create and rename)", async () => {
    const { t, w, owner } = await world();
    const ana = await insertStaff(t, w.a, "Ana");
    const create = (displayName: string) => codeOf(owner.mutation(api.menuStaff.create, { menuServiceId: w.a.menuServiceId, displayName }));
    const rename = (displayName: string) => codeOf(owner.mutation(api.menuStaff.rename, { staffId: ana, displayName }));

    for (const name of ["", "   ", "x".repeat(41)]) {
      expect(await create(name), JSON.stringify(name)).toBe(STAFF_ERROR.nameInvalid);
      expect(await rename(name), JSON.stringify(name)).toBe(STAFF_ERROR.nameInvalid);
    }
    expect(await create("x".repeat(40))).toBe("ok");
    expect(await rename("y".repeat(40))).toBe("ok");
    expect((await staffRow(t, ana))?.displayName).toBe("y".repeat(40));
    expect(await auditRows(t, w.a.menuServiceId, "staff.created")).toHaveLength(1);
  });

  test("rename and setPanelRole change the member", async () => {
    const { t, w, owner } = await world();
    const ana = await insertStaff(t, w.a, "Ana");
    expect(await owner.mutation(api.menuStaff.rename, { staffId: ana, displayName: "  Anica " })).toEqual({ ok: true });
    expect(await owner.mutation(api.menuStaff.setPanelRole, { staffId: ana, panelRole: "manager" })).toEqual({ ok: true });
    expect(await owner.mutation(api.menuStaff.setPanelRole, { staffId: ana, panelRole: "manager" })).toEqual({ ok: true });
    expect(await staffRow(t, ana)).toMatchObject({ displayName: "Anica", panelRole: "manager" });
  });

  test("the 101st active member is staff/limit; a deactivated one frees a place; the other venue is unaffected", async () => {
    const { t, w, owner } = await world();
    const first = await insertStaff(t, w.a, "Konobar 1");
    for (let i = 2; i <= 100; i += 1) await insertStaff(t, w.a, `Konobar ${i}`);
    const create = (displayName: string) => codeOf(owner.mutation(api.menuStaff.create, { menuServiceId: w.a.menuServiceId, displayName }));

    expect(await create("Višak")).toBe(STAFF_ERROR.staffLimit);
    const otherCreate = as(t, w.otherOwnerId).mutation(api.menuStaff.create, { menuServiceId: w.b.menuServiceId, displayName: "Marko" });
    expect(await codeOf(otherCreate)).toBe("ok");

    await owner.mutation(api.menuStaff.deactivate, { staffId: first });
    expect(await create("Zamena")).toBe("ok");
    expect(await create("Opet višak")).toBe(STAFF_ERROR.staffLimit);
    const rows = await listOf(owner, w.a);
    expect(rows.filter((row) => row.active)).toHaveLength(100);
    expect(rows.filter((row) => !row.active)).toHaveLength(1);
  });
});

// ===== 7. The panel link =====

describe("panel code", () => {
  test("ensurePanelCode is idempotent and returns the panel path", async () => {
    const { t, w, owner } = await world();
    const args = { menuServiceId: w.a.menuServiceId };
    expect(await owner.query(api.menuStaff.panelLink, args)).toBeNull();

    const first = await owner.mutation(api.menuStaff.ensurePanelCode, args);
    const second = await as(t, w.managerId).mutation(api.menuStaff.ensurePanelCode, args);

    expect(first.code).toMatch(PANEL_CODE_PATTERN);
    expect(first.path).toBe(`/${SLUG_A}/konobar/${first.code}`);
    expect(second).toEqual(first);
    const secrets = await t.run((ctx) => ctx.db.query("menuSecrets").collect());
    expect(secrets).toHaveLength(1);
    expect(secrets[0]).toMatchObject({ menuServiceId: w.a.menuServiceId, kind: "panel_code", value: first.code });
    const audit = await auditRows(t, w.a.menuServiceId, "panel.code_rotated");
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ entityType: "panel", details: { first: true } });
  });

  test("the code opens its own venue's panel only; every venue has its own", async () => {
    const { t, w, owner } = await world();
    const codeA = await panelCodeOf(owner, w.a);
    const other = await as(t, w.otherOwnerId).mutation(api.menuStaff.ensurePanelCode, { menuServiceId: w.b.menuServiceId });

    expect(other.code).not.toBe(codeA);
    expect(other.path).toBe(`/${SLUG_B}/konobar/${other.code}`);
    expect(await t.query(api.menuWaiter.panelEntry, { slug: SLUG_A, panelCode: codeA })).toEqual({
      businessName: "Kafana kod Mike",
      pinAvailable: true,
    });
    expect(await t.query(api.menuWaiter.panelEntry, { slug: SLUG_B, panelCode: codeA })).toBeNull();
    expect(await t.query(api.menuWaiter.panelEntry, { slug: SLUG_A, panelCode: other.code })).toBeNull();
  });

  test("rotatePanelCode changes the code, signs every device of the venue out and closes the old link", async () => {
    const { t, w, owner } = await world();
    const ana = await memberWithPin(owner, w.a, "Ana", "246");
    const marko = await memberWithPin(owner, w.a, "Marko", "135");
    const oldCode = await panelCodeOf(owner, w.a);
    const anaDevice = await signInOk(t, oldCode, "246");
    const markoDevice = await signInOk(t, oldCode, "135");
    // The other venue's session must survive.
    const otherOwner = as(t, w.otherOwnerId);
    await memberWithPin(otherOwner, w.b, "Ivan", "246");
    const codeB = await panelCodeOf(otherOwner, w.b);
    const ivanDevice = await signInOk(t, codeB, "246", undefined, SLUG_B);

    const rotated = await as(t, w.managerId).mutation(api.menuStaff.rotatePanelCode, { menuServiceId: w.a.menuServiceId });

    expect(rotated.code).toMatch(PANEL_CODE_PATTERN);
    expect(rotated.code).not.toBe(oldCode);
    expect(rotated.path).toBe(`/${SLUG_A}/konobar/${rotated.code}`);
    expect(rotated.endedSessions).toBe(2);
    expect(await isSignedIn(t, oldCode, anaDevice.sessionToken)).toBe(false);
    expect(await isSignedIn(t, oldCode, markoDevice.sessionToken)).toBe(false);
    expect(await isSignedIn(t, rotated.code, anaDevice.sessionToken)).toBe(false);
    for (const id of [ana, marko]) {
      expect((await sessionRows(t, id))[0]).toMatchObject({ endReason: "code_rotated", endedAt: expect.any(Number) });
    }
    expect(await isSignedIn(t, codeB, ivanDevice.sessionToken, SLUG_B)).toBe(true);

    expect(await t.query(api.menuWaiter.panelEntry, { slug: SLUG_A, panelCode: oldCode })).toBeNull();
    expect(await t.query(api.menuWaiter.panelEntry, { slug: SLUG_A, panelCode: rotated.code })).not.toBeNull();
    expect(await signIn(t, oldCode, "246")).toEqual({ ok: false, code: STAFF_ERROR.panelNotFound });
    expect(await signIn(t, rotated.code, "246")).toMatchObject({ ok: true, displayName: "Ana" });
    const args = { menuServiceId: w.a.menuServiceId };
    const current = { code: rotated.code, path: rotated.path };
    expect(await owner.query(api.menuStaff.panelLink, args)).toEqual(current);
    expect(await owner.mutation(api.menuStaff.ensurePanelCode, args)).toEqual(current);

    const secrets = await t.run(async (ctx) => (await ctx.db.query("menuSecrets").collect()).filter((row) => row.menuServiceId === w.a.menuServiceId));
    expect(secrets).toHaveLength(1);
    expect(secrets[0]).toMatchObject({ value: rotated.code, rotatedAt: expect.any(Number) });
    const audit = await auditRows(t, w.a.menuServiceId, "panel.code_rotated");
    expect(audit).toHaveLength(2);
    expect(audit[1]).toMatchObject({ actorUserId: w.managerId, entityType: "panel", details: { first: false, endedSessions: 2 } });
  });

  test("rotatePanelCode before any code exists creates the first one", async () => {
    const { t, w, owner } = await world();
    const rotated = await owner.mutation(api.menuStaff.rotatePanelCode, { menuServiceId: w.a.menuServiceId });

    expect(rotated).toMatchObject({ endedSessions: 0, path: `/${SLUG_A}/konobar/${rotated.code}` });
    expect(rotated.code).toMatch(PANEL_CODE_PATTERN);
    expect(await t.run((ctx) => ctx.db.query("menuSecrets").collect())).toHaveLength(1);
    expect((await auditRows(t, w.a.menuServiceId, "panel.code_rotated"))[0].details).toEqual({ first: true, endedSessions: 0 });
  });
});

// ===== 8. Lifting PIN locks =====

describe("unlockPins", () => {
  async function lockedWorld() {
    const base = await world();
    await memberWithPin(base.owner, base.w.a, "Ana", "246");
    const code = await panelCodeOf(base.owner, base.w.a);
    const deviceToken = await lockDevice(base.t, code);
    // Locked: the right PIN does not get in either.
    expect(await signIn(base.t, code, "246", deviceToken)).toMatchObject({ ok: false, code: STAFF_ERROR.locked });
    return { ...base, code, deviceToken };
  }

  test("the Owner lifts a locked device at once, and it is audited", async () => {
    const { t, w, owner, code, deviceToken } = await lockedWorld();

    const { unlocked } = await owner.mutation(api.menuStaff.unlockPins, { menuServiceId: w.a.menuServiceId });

    expect(unlocked).toBeGreaterThanOrEqual(1);
    expect(await signIn(t, code, "246", deviceToken)).toMatchObject({ ok: true, displayName: "Ana" });
    const audit = await auditRows(t, w.a.menuServiceId, "staff.pins_unlocked");
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actorKind: "user", actorUserId: w.ownerId, entityType: "panel", details: { unlocked } });
    expect(await owner.mutation(api.menuStaff.unlockPins, { menuServiceId: w.a.menuServiceId })).toEqual({ unlocked: 0 });
  });

  test("a Manager may unlock too; an Urednik and another venue's owner may not, and the device stays locked", async () => {
    const { t, w, code, deviceToken } = await lockedWorld();
    const args = { menuServiceId: w.a.menuServiceId };

    expect(await codeOf(as(t, w.editorId).mutation(api.menuStaff.unlockPins, args))).toBe(MENU_ERROR.forbidden);
    expect(await codeOf(as(t, w.otherOwnerId).mutation(api.menuStaff.unlockPins, args))).toBe(MENU_ERROR.forbidden);
    expect(await signIn(t, code, "246", deviceToken)).toMatchObject({ ok: false, code: STAFF_ERROR.locked });

    expect((await as(t, w.managerId).mutation(api.menuStaff.unlockPins, args)).unlocked).toBeGreaterThanOrEqual(1);
    expect(await signIn(t, code, "246", deviceToken)).toMatchObject({ ok: true });
  });

  test("it also lifts the venue-wide lock that 30 wrong PINs from new devices set", async () => {
    const { t, w, owner } = await world();
    await memberWithPin(owner, w.a, "Ana", "246");
    const code = await panelCodeOf(owner, w.a);
    for (let i = 0; i < 30; i += 1) {
      // A new device and a new network address each time: only the venue counter can lock.
      const result = await signIn(t, code, "000", undefined, SLUG_A, String(i).padStart(16, "0"));
      expect(result).toMatchObject({ ok: false, code: STAFF_ERROR.wrongPin });
    }
    expect(await signIn(t, code, "246")).toMatchObject({ ok: false, code: STAFF_ERROR.locked });

    const { unlocked } = await owner.mutation(api.menuStaff.unlockPins, { menuServiceId: w.a.menuServiceId });

    expect(unlocked).toBeGreaterThanOrEqual(1);
    expect(await signIn(t, code, "246")).toMatchObject({ ok: true });
  });
});
