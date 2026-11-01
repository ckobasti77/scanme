/// <reference types="vite/client" />

// ScanMe Menu V1 — K23: the floor of the waiter panel (master §9.3, §9.4,
// §10.2–§10.5; plan K19 §4.4, K19-17…K19-21): `floor` (the static part: zones,
// positions, staff zones, timing, the occupancy switch), `occupancy` (only with
// the optional module), `positionDetail` (the cards of the open table),
// `setOccupancy` (by hand, never audited), `setMyZone` and `setStaffZone`
// (audited). Staff management (convex/menuStaff.ts) is used only for setup.
//
// Time is frozen (fake timers, T0) so every stamp is asserted exactly; the clock
// moves with vi.setSystemTime. Fictional tenants only (the repo is public):
// "Kafana kod Mike" (tenant a), "Demo restoran" (tenant b); people are "Ana",
// "Marko", "Jelena". The helpers are copied from convex/menuWaiter.test.ts on
// purpose (a test file is not a module to import from).

import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import { menuKonobarSr } from "../lib/i18n/sr/menu-konobar";
import { MENU_ERROR } from "../lib/menu/errors/core";
import { STAFF_ERROR } from "../lib/menu/errors/waiter";
import { MENU_MAX_CARDS_ON_POSITION } from "../lib/menu/limits";
import { OCCUPANCY_STATES, type OccupancyState } from "../lib/menu/occupancy";
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

// Every non-test source of convex/ as text, for the structural test at the end.
const sources = import.meta.glob(["./*.ts", "./lib/**/*.ts", "!./**/*.test.ts"], {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

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
/** The pseudonym of the guest's phone: it must never reach a waiter's screen. */
const GUEST_DEVICE = "guest-device-pseudonym-6f2c1a";
/** Well-formed (43 url-safe characters), but nobody's session token. */
const BOGUS_TOKEN = "A".repeat(43);

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

async function signIn(env: Env, pin: string, options: { venue?: Venue } = {}) {
  const { slug, panelCode } = panel(env, undefined, options.venue);
  const outcome = await env.t.mutation(api.menuWaiter.loginWithPin, { slug, panelCode, pin });
  if (!outcome.ok) throw new Error(`sign-in refused: ${JSON.stringify(outcome)}`);
  return outcome;
}

/** Ana (246) and Marko (135) on the floor of venue a, both signed in. */
async function crew(env: Env) {
  const anaId = await addStaff(env, "Ana", "246");
  const markoId = await addStaff(env, "Marko", "135");
  const ana = (await signIn(env, "246")).sessionToken;
  const marko = (await signIn(env, "135")).sessionToken;
  return { anaId, markoId, ana, marko };
}

// -----------------------------------------------------------------------------
// Panel calls
// -----------------------------------------------------------------------------

type Opts = { venue?: Venue; who?: Caller };

const floorOf = (env: Env, token?: string, o: Opts = {}) =>
  (o.who ?? env.t).query(api.menuWaiter.floor, panel(env, token, o.venue));
const occupancyOf = (env: Env, token?: string, o: Opts = {}) =>
  (o.who ?? env.t).query(api.menuWaiter.occupancy, panel(env, token, o.venue));
const detailOf = (env: Env, token: string | undefined, positionId: Id<"menuPositions">, o: Opts = {}) =>
  (o.who ?? env.t).query(api.menuWaiter.positionDetail, { ...panel(env, token, o.venue), positionId });
const queueOf = (env: Env, token?: string, o: Opts = {}) =>
  (o.who ?? env.t).query(api.menuWaiter.activeRequests, panel(env, token, o.venue));
const setOccupancy = (
  env: Env,
  token: string | undefined,
  positionId: Id<"menuPositions">,
  state: OccupancyState | null,
  o: Opts = {},
) => (o.who ?? env.t).mutation(api.menuWaiter.setOccupancy, { ...panel(env, token, o.venue), positionId, state });
const setMyZone = (env: Env, token: string | undefined, zoneId: Id<"menuZones"> | null, o: Opts = {}) =>
  (o.who ?? env.t).mutation(api.menuWaiter.setMyZone, { ...panel(env, token, o.venue), zoneId });
const setStaffZone = (
  env: Env,
  token: string | undefined,
  staffId: Id<"menuStaff">,
  zoneId: Id<"menuZones"> | null,
  o: Opts = {},
) => (o.who ?? env.t).mutation(api.menuWaiter.setStaffZone, { ...panel(env, token, o.venue), staffId, zoneId });

async function mustFloor(env: Env, token?: string, o: Opts = {}) {
  const floor = await floorOf(env, token, o);
  if (!floor) throw new Error("the floor is null");
  return floor;
}

// -----------------------------------------------------------------------------
// Reading rows back
// -----------------------------------------------------------------------------

const staffRow = (t: T, id: Id<"menuStaff">) => t.run(async (ctx) => await ctx.db.get(id));
const occupancyRows = (t: T) => t.run(async (ctx) => await ctx.db.query("menuPositionOccupancy").take(1000));
const auditAll = (t: T) => t.run(async (ctx) => await ctx.db.query("menuAuditLog").take(5000));

async function auditRows(t: T, action: string) {
  return (await auditAll(t)).filter((row) => row.action === action);
}

// -----------------------------------------------------------------------------
// Zones, positions, cards, requests (what K20/K21 would have written)
// -----------------------------------------------------------------------------

let keyCounter = 0;

async function addZone(
  t: T,
  tenant: MenuTenantSeed,
  name: string,
  options: { order?: number; active?: boolean } = {},
): Promise<Id<"menuZones">> {
  keyCounter += 1;
  return await t.run(async (ctx) => {
    const now = Date.now();
    return await ctx.db.insert("menuZones", {
      menuServiceId: tenant.menuServiceId,
      key: `zn_floor${keyCounter}`,
      name,
      nameNormalized: name.toLowerCase(),
      order: options.order ?? 0,
      active: options.active ?? true,
      createdAt: now,
      updatedAt: now,
    });
  });
}

type PositionOptions = {
  zoneId?: Id<"menuZones">;
  active?: boolean;
  seats?: number;
  layout?: Doc<"menuPositions">["layout"];
  kind?: Doc<"menuPositions">["kind"];
  order?: number;
};

async function addPosition(
  t: T,
  tenant: MenuTenantSeed,
  label: string,
  options: PositionOptions = {},
): Promise<Id<"menuPositions">> {
  keyCounter += 1;
  return await t.run(async (ctx) => {
    const now = Date.now();
    return await ctx.db.insert("menuPositions", {
      menuServiceId: tenant.menuServiceId,
      key: `ps_floor${keyCounter}`,
      kind: options.kind ?? "table",
      label,
      labelNormalized: label.toLowerCase(),
      ...(options.seats !== undefined ? { seats: options.seats } : {}),
      ...(options.zoneId ? { zoneId: options.zoneId } : {}),
      ...(options.layout ? { layout: options.layout } : {}),
      order: options.order ?? 0,
      active: options.active ?? true,
      createdAt: now,
      updatedAt: now,
    });
  });
}

type Table = {
  tenant: MenuTenantSeed;
  positionId: Id<"menuPositions">;
  guestSessionId: Id<"menuGuestSessions">;
  zoneId?: Id<"menuZones">;
  label: string;
};

/** One table with a guest session (so requests can stand on it), optionally in a new zone. */
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

/** `count` tables "Sto 1…" with a guest session each, in ONE transaction; order = index. */
async function addTables(t: T, tenant: MenuTenantSeed, count: number): Promise<Table[]> {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const tables: Table[] = [];
    for (let index = 0; index < count; index += 1) {
      keyCounter += 1;
      const label = `Sto ${index + 1}`;
      const positionId = await ctx.db.insert("menuPositions", {
        menuServiceId: tenant.menuServiceId,
        key: `ps_bulk${keyCounter}`,
        kind: "table",
        label,
        labelNormalized: label.toLowerCase(),
        order: index,
        active: true,
        createdAt: now,
        updatedAt: now,
      });
      const guestSessionId = await ctx.db.insert("menuGuestSessions", {
        menuServiceId: tenant.menuServiceId,
        tokenHash: `guest-token-hash-bulk-${keyCounter}`,
        deviceKeyHash: GUEST_DEVICE,
        positionId,
        createdAt: now,
        lastSeenAt: now,
        expiresAt: now + 3 * 60 * MINUTE,
      });
      tables.push({ tenant, positionId, guestSessionId, label });
    }
    return tables;
  });
}

/** `perTable` new "call" requests on every table, in ONE transaction; createdAt = T0 + 1 s × index. */
async function addRequestsOn(t: T, tables: Table[], perTable: number): Promise<Id<"menuRequests">[]> {
  return await t.run(async (ctx) => {
    const ids: Id<"menuRequests">[] = [];
    for (const table of tables) {
      for (let n = 0; n < perTable; n += 1) {
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
            createdAt: T0 + ids.length * 1000,
            updatedAt: Date.now(),
          }),
        );
      }
    }
    return ids;
  });
}

type CardOptions = {
  linkActive?: boolean;
  cardStatus?: "active" | "disabled";
  /** The business that owns the card row (default: the tenant's). */
  cardBusinessId?: Id<"businesses">;
  /** The Menu service named on the link row (default: the tenant's). */
  linkServiceId?: Id<"menuServices">;
};

/** A QR card with a menuQrLinks row onto a position. Card codes avoid the letters U, O, I, L. */
async function addCardOn(
  t: T,
  tenant: MenuTenantSeed,
  positionId: Id<"menuPositions">,
  label: string,
  options: CardOptions = {},
) {
  keyCounter += 1;
  return await t.run(async (ctx) => {
    const now = Date.now();
    const cardId = await ctx.db.insert("cards", {
      businessId: options.cardBusinessId ?? tenant.businessId,
      cardCode: `KARTA${String(keyCounter).padStart(3, "0")}`,
      label,
      status: options.cardStatus ?? "active",
      totalScans: 0,
      createdAt: now,
      updatedAt: now,
    });
    const linkId = await ctx.db.insert("menuQrLinks", {
      menuServiceId: options.linkServiceId ?? tenant.menuServiceId,
      cardId,
      positionId,
      active: options.linkActive ?? true,
      createdAt: now,
      updatedAt: now,
    });
    return { cardId, linkId };
  });
}

/** Switch the optional occupancy module of a venue on or off (what the Funkcionalnosti switch does). */
async function setModule(t: T, menuServiceId: Id<"menuServices">, on: boolean) {
  await t.run(async (ctx) => {
    const service = await ctx.db.get(menuServiceId);
    if (!service) throw new Error("no such Menu service");
    await ctx.db.patch(menuServiceId, { features: { ...service.features, occupancy: on } });
  });
}

/** An occupancy row written straight into the table (what the module left behind). */
async function putOccupancy(
  t: T,
  tenant: MenuTenantSeed,
  positionId: Id<"menuPositions">,
  state: OccupancyState,
  by: { staffId?: Id<"menuStaff">; userId?: Id<"users"> } = {},
  updatedAt = T0,
) {
  return await t.run(
    async (ctx) =>
      await ctx.db.insert("menuPositionOccupancy", {
        menuServiceId: tenant.menuServiceId,
        positionId,
        state,
        updatedAt,
        ...(by.staffId ? { updatedByStaffId: by.staffId } : {}),
        ...(by.userId ? { updatedByUserId: by.userId } : {}),
      }),
  );
}

// =============================================================================
// 1. floor
// =============================================================================

describe("floor", () => {
  test("zones, positions and staff of the venue: active only, in order, nothing foreign", async () => {
    const env = await world();
    const { t, w } = env;
    const { ana, anaId, markoId } = await crew(env);
    const jelenaId = await addStaff(env, "Jelena", "777", { panelRole: "manager" });
    const draganId = await addStaff(env, "Dragan");
    await env.owner.mutation(api.menuStaff.deactivate, { staffId: draganId });
    const petarId = await addStaff(env, "Petar", "246", { venue: "b" });

    const sala = await addZone(t, w.a, "Sala", { order: 1 });
    const terasa = await addZone(t, w.a, "Terasa", { order: 2 });
    const basta = await addZone(t, w.a, "Basta", { order: 0 });
    const stara = await addZone(t, w.a, "Stara sala", { order: 3, active: false });
    const foreignZone = await addZone(t, w.b, "Terasa B", { order: 0 });
    await addZone(t, w.a, "Sala za slavlja", { order: 4, active: false });

    const layout = { x: 1, y: 2, w: 3, h: 2, shape: "rect" } as const;
    const round = { x: 0, y: 0, w: 2, h: 2, shape: "round" } as const;
    const sto1 = await addPosition(t, w.a, "Sto 1", { seats: 4, zoneId: sala, layout, order: 0 });
    const sto2 = await addPosition(t, w.a, "Sto 2", { seats: 2, zoneId: terasa, layout: round, order: 1 });
    const soba = await addPosition(t, w.a, "Soba 7", { kind: "room", order: 2 });
    const sank = await addPosition(t, w.a, "Šank", { kind: "other", zoneId: stara, order: 3 });
    const sto9 = await addPosition(t, w.a, "Sto 9", { zoneId: foreignZone, order: 4 });
    await addPosition(t, w.a, "Stari sto", { active: false, zoneId: sala, order: 5 });
    await addPosition(t, w.b, "Sto B1", { order: 0 });

    // Marko works a zone that was archived since; Ana works Sala; the foreign member stays foreign.
    await t.run(async (ctx) => {
      await ctx.db.patch(anaId, { activeZoneId: sala });
      await ctx.db.patch(markoId, { activeZoneId: stara });
      await ctx.db.patch(petarId, { activeZoneId: foreignZone });
    });

    const floor = await mustFloor(env, ana);
    expect(floor.zones).toEqual([
      { id: basta, name: "Basta", order: 0 },
      { id: sala, name: "Sala", order: 1 },
      { id: terasa, name: "Terasa", order: 2 },
    ]);
    expect(floor.positions).toEqual([
      { id: sto1, kind: "table", label: "Sto 1", seats: 4, zoneId: sala, layout, order: 0 },
      { id: sto2, kind: "table", label: "Sto 2", seats: 2, zoneId: terasa, layout: round, order: 1 },
      { id: soba, kind: "room", label: "Soba 7", seats: null, zoneId: null, layout: null, order: 2 },
      // An archived zone and another venue's zone both read as "Bez zone".
      { id: sank, kind: "other", label: "Šank", seats: null, zoneId: null, layout: null, order: 3 },
      { id: sto9, kind: "table", label: "Sto 9", seats: null, zoneId: null, layout: null, order: 4 },
    ]);
    // Names only: exactly these four keys, no PIN, hash or lookup.
    const staff = [...floor.staff].sort((a, b) => a.name.localeCompare(b.name));
    expect(staff).toEqual([
      { id: anaId, name: "Ana", panelRole: "staff", activeZoneId: sala },
      { id: jelenaId, name: "Jelena", panelRole: "manager", activeZoneId: null },
      { id: markoId, name: "Marko", panelRole: "staff", activeZoneId: null },
    ]);

    // Venue b sees only its own.
    await addStaff(env, "Jelena", "135", { venue: "b" });
    const bToken = (await signIn(env, "135", { venue: "b" })).sessionToken;
    const bFloor = await mustFloor(env, bToken, { venue: "b" });
    expect(bFloor.zones).toEqual([{ id: foreignZone, name: "Terasa B", order: 0 }]);
    expect(bFloor.positions.map((position) => position.label)).toEqual(["Sto B1"]);
    expect(bFloor.staff.map((member) => member.name).sort()).toEqual(["Jelena", "Petar"]);
  });

  test("a venue without zones or positions has an empty floor", async () => {
    const env = await world();
    const { ana } = await crew(env);
    const floor = await mustFloor(env, ana);
    expect(floor.zones).toEqual([]);
    expect(floor.positions).toEqual([]);
    expect(floor.staff.map((member) => member.name).sort()).toEqual(["Ana", "Marko"]);
  });

  test("me: the staff member on the device, or the account (no staff id)", async () => {
    const env = await world();
    const { t, w } = env;
    const { ana, anaId } = await crew(env);
    const jelenaId = await addStaff(env, "Jelena", "777", { panelRole: "manager" });
    const jelena = (await signIn(env, "777")).sessionToken;
    const sala = await addZone(t, w.a, "Sala");

    expect((await mustFloor(env, ana)).me).toEqual({ staffId: anaId, activeZoneId: null, canAssignZones: false });
    expect((await mustFloor(env, jelena)).me).toEqual({ staffId: jelenaId, activeZoneId: null, canAssignZones: true });

    await t.run(async (ctx) => await ctx.db.patch(anaId, { activeZoneId: sala }));
    expect((await mustFloor(env, ana)).me).toEqual({ staffId: anaId, activeZoneId: sala, canAssignZones: false });

    // The Owner, a Manager and a ScanMe admin enter with their account: no staff row, may assign zones.
    for (const userId of [w.ownerId, w.managerId, w.adminId]) {
      const floor = await mustFloor(env, undefined, { who: as(t, userId) });
      expect(floor.me).toEqual({ staffId: null, activeZoneId: null, canAssignZones: true });
    }
  });

  test("timing: the defaults 15 and 5 until the venue sets its own; invalid stored values fall back field by field", async () => {
    const env = await world();
    const { t, w } = env;
    const { ana } = await crew(env);
    expect((await mustFloor(env, ana)).timing).toEqual({ lateThresholdMin: 15, reminderMin: 5 });

    await env.owner.mutation(api.menuSettings.setPanelTiming, {
      menuServiceId: w.a.menuServiceId,
      lateThresholdMin: 30,
      reminderMin: 0,
    });
    // 0 (reminder off) is a value, not "unset".
    expect((await mustFloor(env, ana)).timing).toEqual({ lateThresholdMin: 30, reminderMin: 0 });

    // Venue b is not touched.
    await addStaff(env, "Jelena", "246", { venue: "b" });
    const jelena = (await signIn(env, "246", { venue: "b" })).sessionToken;
    expect((await mustFloor(env, jelena, { venue: "b" })).timing).toEqual({ lateThresholdMin: 15, reminderMin: 5 });

    // The validators accept any number: a bad stored value must not reach the panel.
    await t.run(async (ctx) => {
      const service = await ctx.db.get(w.a.menuServiceId);
      await ctx.db.patch(w.a.menuServiceId, {
        settings: { ...service?.settings, panel: { lateThresholdMin: 45, reminderMin: 999 } },
      });
    });
    expect((await mustFloor(env, ana)).timing).toEqual({ lateThresholdMin: 45, reminderMin: 5 });
  });

  test("occupancyEnabled mirrors features.occupancy", async () => {
    const env = await world();
    const { t, w } = env;
    const { ana } = await crew(env);
    expect((await mustFloor(env, ana)).occupancyEnabled).toBe(false);
    await setModule(t, w.a.menuServiceId, true);
    expect((await mustFloor(env, ana)).occupancyEnabled).toBe(true);
    // Venue b has its own switch.
    await addStaff(env, "Jelena", "246", { venue: "b" });
    const jelena = (await signIn(env, "246", { venue: "b" })).sessionToken;
    expect((await mustFloor(env, jelena, { venue: "b" })).occupancyEnabled).toBe(false);
    await setModule(t, w.a.menuServiceId, false);
    expect((await mustFloor(env, ana)).occupancyEnabled).toBe(false);
  });

  test("null for a wrong code, a signed-out token, another venue's token, an Urednik and anonymous callers", async () => {
    const env = await world();
    const { t, w } = env;
    const { ana, marko } = await crew(env);
    await addStaff(env, "Jelena", "246", { venue: "b" });
    const jelenaB = (await signIn(env, "246", { venue: "b" })).sessionToken;
    expect(await floorOf(env, marko)).not.toBeNull(); // baseline

    // A wrong code, and another venue's code with this slug.
    expect(
      await t.query(api.menuWaiter.floor, { slug: SLUG_A, panelCode: "ZZZZZZZZZZ", sessionToken: marko }),
    ).toBeNull();
    expect(await t.query(api.menuWaiter.floor, { slug: SLUG_A, panelCode: env.bCode, sessionToken: marko })).toBeNull();

    // Signed out: logged out, never issued, malformed.
    await t.mutation(api.menuWaiter.logout, { ...panel(env, ana), sessionToken: ana });
    expect(await floorOf(env, ana)).toBeNull();
    expect(await floorOf(env, BOGUS_TOKEN)).toBeNull();
    expect(await floorOf(env, "short")).toBeNull();

    // A token of another venue is nobody at this panel (and fine at its own).
    expect(await floorOf(env, jelenaB)).toBeNull();
    expect(await floorOf(env, jelenaB, { venue: "b" })).not.toBeNull();

    // An Urednik (editor) has no waiter.work; neither have finance, view-only or outsiders.
    for (const userId of [w.editorId, w.financeId, w.viewOnlyId, w.outsiderId, w.otherOwnerId]) {
      expect(await floorOf(env, undefined, { who: as(t, userId) })).toBeNull();
    }
    expect(await floorOf(env)).toBeNull();
    // A token that does not check out never falls back to the signed-in account.
    expect(await floorOf(env, BOGUS_TOKEN, { who: as(t, w.ownerId) })).toBeNull();
  });

  test("bounded: forty positions all come back, in order", async () => {
    const env = await world();
    const { ana } = await crew(env);
    const tables = await addTables(env.t, env.w.a, 40);
    const floor = await mustFloor(env, ana);
    expect(floor.positions).toHaveLength(40);
    expect(floor.positions.map((position) => position.id)).toEqual(tables.map((table) => table.positionId));
  });
});

// =============================================================================
// 2. occupancy (the query)
// =============================================================================

describe("occupancy", () => {
  test("{ off: true } while the module is off, even if rows exist", async () => {
    const env = await world();
    const { t, w } = env;
    const { ana, anaId } = await crew(env);
    const sto = await addPosition(t, w.a, "Sto 1");
    await putOccupancy(t, w.a, sto, "occupied", { staffId: anaId });
    expect(await occupancyOf(env, ana)).toEqual({ off: true });
    expect(await occupancyOf(env, undefined, { who: as(t, w.ownerId) })).toEqual({ off: true });

    // Switching it on shows the rows that stayed; off hides them again (they are neither shown nor deleted).
    await setModule(t, w.a.menuServiceId, true);
    expect(await occupancyOf(env, ana)).toMatchObject({ off: false, states: [{ positionId: sto, state: "occupied" }] });
    await setModule(t, w.a.menuServiceId, false);
    expect(await occupancyOf(env, ana)).toEqual({ off: true });
    expect(await occupancyRows(t)).toHaveLength(1);
  });

  test("with the module on: the rows with the name of who set them; another venue's rows never appear", async () => {
    const env = await world();
    const { t, w } = env;
    const { ana, anaId } = await crew(env);
    const petarId = await addStaff(env, "Petar", "246", { venue: "b" });
    await t.run(async (ctx) => await ctx.db.patch(w.ownerId, { name: "Jelena" }));
    await setModule(t, w.a.menuServiceId, true);
    await setModule(t, w.b.menuServiceId, true);

    const p1 = await addPosition(t, w.a, "Sto 1", { order: 0 });
    const p2 = await addPosition(t, w.a, "Sto 2", { order: 1 });
    const p3 = await addPosition(t, w.a, "Sto 3", { order: 2 });
    const p4 = await addPosition(t, w.a, "Sto 4", { order: 3 });
    const p5 = await addPosition(t, w.a, "Sto 5", { order: 4 });
    const pb = await addPosition(t, w.b, "Sto B1");
    await putOccupancy(t, w.a, p1, "occupied", { staffId: anaId }, T0);
    await putOccupancy(t, w.a, p2, "reserved", { userId: w.ownerId }, T0 + MINUTE);
    await putOccupancy(t, w.a, p3, "free", { userId: w.managerId }, T0 + 2 * MINUTE); // an account without a name
    await putOccupancy(t, w.a, p4, "out_of_service", {}, T0 + 3 * MINUTE); // nobody recorded
    await putOccupancy(t, w.a, p5, "occupied", { staffId: petarId }, T0 + 4 * MINUTE); // a member of another venue
    await putOccupancy(t, w.b, pb, "occupied", { staffId: petarId }, T0);

    const result = await occupancyOf(env, ana);
    if (!result || result.off) throw new Error(`expected rows, got ${JSON.stringify(result)}`);
    expect(result.states).toHaveLength(5);
    const byPosition = new Map(result.states.map((state) => [state.positionId, state]));
    expect(byPosition.get(p1)).toEqual({ positionId: p1, state: "occupied", updatedAt: T0, updatedBy: "Ana" });
    expect(byPosition.get(p2)).toEqual({ positionId: p2, state: "reserved", updatedAt: T0 + MINUTE, updatedBy: "Jelena" });
    // Never the e-mail of an account: a neutral label.
    expect(byPosition.get(p3)).toEqual({
      positionId: p3,
      state: "free",
      updatedAt: T0 + 2 * MINUTE,
      updatedBy: menuKonobarSr.zaglavlje.nalogBezImena,
    });
    expect(byPosition.get(p4)).toEqual({ positionId: p4, state: "out_of_service", updatedAt: T0 + 3 * MINUTE, updatedBy: null });
    expect(byPosition.get(p5)).toMatchObject({ state: "occupied", updatedBy: null });
    expect(byPosition.has(pb)).toBe(false);
    // Names and stamps only: no staff or user id leaves the server.
    for (const state of result.states) {
      expect(Object.keys(state).sort()).toEqual(["positionId", "state", "updatedAt", "updatedBy"]);
    }

    // The Owner's account sees the same rows; venue b sees only its own.
    const ownerView = await occupancyOf(env, undefined, { who: as(t, w.ownerId) });
    expect(ownerView).toMatchObject({ off: false });
    const bView = await occupancyOf(env, undefined, { venue: "b", who: as(t, w.otherOwnerId) });
    expect(bView).toEqual({
      off: false,
      states: [{ positionId: pb, state: "occupied", updatedAt: T0, updatedBy: "Petar" }],
    });
  });

  test("a venue with the module on and no marked table has no rows; null for anyone not signed in", async () => {
    const env = await world();
    const { t, w } = env;
    const { ana } = await crew(env);
    await setModule(t, w.a.menuServiceId, true);
    expect(await occupancyOf(env, ana)).toEqual({ off: false, states: [] });
    expect(await occupancyOf(env, BOGUS_TOKEN)).toBeNull();
    expect(await occupancyOf(env)).toBeNull();
    expect(await occupancyOf(env, undefined, { who: as(t, w.editorId) })).toBeNull();
  });
});

// =============================================================================
// 3. setOccupancy
// =============================================================================

describe("setOccupancy", () => {
  test("refused with staff/occupancy_off while the module is off, and nothing is written", async () => {
    const env = await world();
    const { t, w } = env;
    const { ana } = await crew(env);
    const sto = await addPosition(t, w.a, "Sto 1");
    const auditBefore = (await auditAll(t)).length;

    expect(await setOccupancy(env, ana, sto, "occupied")).toEqual({ ok: false, code: STAFF_ERROR.occupancyOff });
    expect(await setOccupancy(env, ana, sto, null)).toEqual({ ok: false, code: "staff/occupancy_off" });
    expect(await setOccupancy(env, undefined, sto, "free", { who: as(t, w.ownerId) })).toEqual({
      ok: false,
      code: "staff/occupancy_off",
    });
    expect(await occupancyRows(t)).toEqual([]);
    expect((await auditAll(t)).length).toBe(auditBefore);
  });

  test("records who and when; the same state again changes nothing; a new state replaces the row", async () => {
    const env = await world();
    const { t, w } = env;
    const { ana, anaId, marko, markoId } = await crew(env);
    await setModule(t, w.a.menuServiceId, true);
    const sto = await addPosition(t, w.a, "Sto 1");

    expect(await setOccupancy(env, ana, sto, "occupied")).toEqual({ ok: true, changed: true });
    let rows = await occupancyRows(t);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      menuServiceId: w.a.menuServiceId,
      positionId: sto,
      state: "occupied",
      updatedAt: T0,
      updatedByStaffId: anaId,
    });
    expect(rows[0].updatedByUserId).toBeUndefined();

    // The same state a minute later by someone else: no write at all (stamp and author stay).
    vi.setSystemTime(T0 + MINUTE);
    expect(await setOccupancy(env, marko, sto, "occupied")).toEqual({ ok: true, changed: false });
    rows = await occupancyRows(t);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ state: "occupied", updatedAt: T0, updatedByStaffId: anaId });

    // A different state replaces the one row, with the new stamp and author.
    vi.setSystemTime(T0 + 2 * MINUTE);
    expect(await setOccupancy(env, marko, sto, "free")).toEqual({ ok: true, changed: true });
    rows = await occupancyRows(t);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ state: "free", updatedAt: T0 + 2 * MINUTE, updatedByStaffId: markoId });

    // The panel reads it back with the name.
    expect(await occupancyOf(env, ana)).toEqual({
      off: false,
      states: [{ positionId: sto, state: "free", updatedAt: T0 + 2 * MINUTE, updatedBy: "Marko" }],
    });
  });

  test("every one of the four states can be set, and each table has its own row", async () => {
    const env = await world();
    const { t, w } = env;
    const { ana } = await crew(env);
    await setModule(t, w.a.menuServiceId, true);
    const positions: Id<"menuPositions">[] = [];
    for (const [index, state] of OCCUPANCY_STATES.entries()) {
      const position = await addPosition(t, w.a, `Sto ${index + 1}`, { order: index });
      positions.push(position);
      expect(await setOccupancy(env, ana, position, state)).toEqual({ ok: true, changed: true });
    }
    const result = await occupancyOf(env, ana);
    if (!result || result.off) throw new Error("expected rows");
    expect(result.states.map((row) => [row.positionId, row.state])).toEqual(
      positions.map((position, index) => [position, OCCUPANCY_STATES[index]]),
    );
  });

  test("null returns the table to neutral: the row is deleted, and null again changes nothing", async () => {
    const env = await world();
    const { t, w } = env;
    const { ana } = await crew(env);
    await setModule(t, w.a.menuServiceId, true);
    const sto = await addPosition(t, w.a, "Sto 1");
    const other = await addPosition(t, w.a, "Sto 2");

    // Neutral already: nothing to delete.
    expect(await setOccupancy(env, ana, sto, null)).toEqual({ ok: true, changed: false });
    await setOccupancy(env, ana, sto, "reserved");
    await setOccupancy(env, ana, other, "occupied");
    expect(await occupancyRows(t)).toHaveLength(2);

    expect(await setOccupancy(env, ana, sto, null)).toEqual({ ok: true, changed: true });
    const rows = await occupancyRows(t);
    expect(rows).toHaveLength(1);
    expect(rows[0].positionId).toBe(other);
    expect(await setOccupancy(env, ana, sto, null)).toEqual({ ok: true, changed: false });
    expect(await occupancyOf(env, ana)).toMatchObject({ off: false, states: [{ positionId: other }] });
  });

  test("a position of another venue and an archived position are menu/not_found; nothing is written", async () => {
    const env = await world();
    const { t, w } = env;
    const { ana } = await crew(env);
    await setModule(t, w.a.menuServiceId, true);
    await setModule(t, w.b.menuServiceId, true);
    const foreign = await addPosition(t, w.b, "Sto B1");
    const archived = await addPosition(t, w.a, "Stari sto", { active: false });

    expect(await setOccupancy(env, ana, foreign, "occupied")).toEqual({ ok: false, code: MENU_ERROR.notFound });
    expect(await setOccupancy(env, ana, foreign, null)).toEqual({ ok: false, code: "menu/not_found" });
    expect(await setOccupancy(env, ana, archived, "free")).toEqual({ ok: false, code: "menu/not_found" });
    expect(await setOccupancy(env, ana, archived, null)).toEqual({ ok: false, code: "menu/not_found" });
    expect(await occupancyRows(t)).toEqual([]);
  });

  test("signed out: staff/signed_out for a dead token, no sign-in, and an Urednik", async () => {
    const env = await world();
    const { t, w } = env;
    const { ana } = await crew(env);
    await setModule(t, w.a.menuServiceId, true);
    const sto = await addPosition(t, w.a, "Sto 1");

    await t.mutation(api.menuWaiter.logout, { ...panel(env, ana), sessionToken: ana });
    const signedOut = { ok: false, code: STAFF_ERROR.signedOut };
    expect(await setOccupancy(env, ana, sto, "occupied")).toEqual(signedOut);
    expect(await setOccupancy(env, BOGUS_TOKEN, sto, "occupied")).toEqual(signedOut);
    expect(await setOccupancy(env, undefined, sto, "occupied")).toEqual(signedOut);
    expect(await setOccupancy(env, undefined, sto, "occupied", { who: as(t, w.editorId) })).toEqual(signedOut);
    expect(await setOccupancy(env, BOGUS_TOKEN, sto, "occupied", { who: as(t, w.ownerId) })).toEqual(signedOut);
    expect(await occupancyRows(t)).toEqual([]);
  });

  test("an unknown state is refused by the validator", async () => {
    const env = await world();
    const { ana } = await crew(env);
    await setModule(env.t, env.w.a.menuServiceId, true);
    const sto = await addPosition(env.t, env.w.a, "Sto 1");
    await expect(
      env.t.mutation(api.menuWaiter.setOccupancy, {
        ...panel(env, ana),
        positionId: sto,
        // @ts-expect-error not one of the four states
        state: "dirty",
      }),
    ).rejects.toThrow();
    expect(await occupancyRows(env.t)).toEqual([]);
  });

  test("the Owner, a Manager and a ScanMe admin work with their account and are recorded as users", async () => {
    const env = await world();
    const { t, w } = env;
    const { ana, anaId } = await crew(env);
    await setModule(t, w.a.menuServiceId, true);
    const sto = await addPosition(t, w.a, "Sto 1");
    await t.run(async (ctx) => await ctx.db.patch(w.ownerId, { name: "Jelena" }));

    expect(await setOccupancy(env, undefined, sto, "occupied", { who: as(t, w.ownerId) })).toEqual({
      ok: true,
      changed: true,
    });
    let [row] = await occupancyRows(t);
    expect(row).toMatchObject({ state: "occupied", updatedAt: T0, updatedByUserId: w.ownerId });
    expect(row.updatedByStaffId).toBeUndefined();
    expect(await occupancyOf(env, ana)).toMatchObject({ states: [{ updatedBy: "Jelena" }] });

    for (const [userId, state] of [
      [w.managerId, "reserved"],
      [w.adminId, "out_of_service"],
    ] as const) {
      expect(await setOccupancy(env, undefined, sto, state, { who: as(t, userId) })).toEqual({ ok: true, changed: true });
      [row] = await occupancyRows(t);
      expect(row).toMatchObject({ state, updatedByUserId: userId });
    }

    // A staff member after an account: the author switches over completely.
    expect(await setOccupancy(env, ana, sto, "free")).toEqual({ ok: true, changed: true });
    const rows = await occupancyRows(t);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ state: "free", updatedByStaffId: anaId });
    expect(rows[0].updatedByUserId).toBeUndefined();
  });

  test("it is NOT audited: no menuAuditLog row, whatever the change", async () => {
    const env = await world();
    const { t, w } = env;
    const { ana } = await crew(env);
    await setModule(t, w.a.menuServiceId, true);
    const sto = await addPosition(t, w.a, "Sto 1");
    const before = (await auditAll(t)).length;

    await setOccupancy(env, ana, sto, "occupied");
    await setOccupancy(env, ana, sto, "reserved");
    await setOccupancy(env, undefined, sto, "free", { who: as(t, w.ownerId) });
    await setOccupancy(env, ana, sto, null);
    await setOccupancy(env, ana, sto, null);

    const after = await auditAll(t);
    expect(after.length).toBe(before);
    expect(after.filter((row) => /occupan/i.test(`${row.action} ${row.entityType ?? ""}`))).toEqual([]);
  });
});

// =============================================================================
// 4. nothing scheduled ever writes occupancy
// =============================================================================

// Occupancy is set BY HAND and nothing frees a table on its own (master §9.4;
// plan K19-19). Two guards:
//
//  1. STRUCTURAL: the table name may appear only in convex/schema.ts (the
//     definition), convex/lib/menuAccess.ts (a type-only name in the union of
//     tenant-owned tables), convex/menuFloor.ts (archivePosition deletes the
//     mark of the position it archives — a person's action that removes the
//     table, never a scheduled one) and convex/menuWaiter.ts. In menuWaiter.ts it may be
//     touched only by the `occupancy` query (reads) and the `setOccupancy`
//     mutation (the only writer: a public mutation, no scheduler); no
//     internalMutation / internalAction and no ctx.scheduler call can reference
//     it, because every other top-level block is free of the name. No module
//     and no cron may call setOccupancy either. (A later step that writes the
//     table from elsewhere — K25 "arrived" — has to update this test on purpose.)
//     The sources are read as text with import.meta.glob (node:fs does not
//     exist in the edge runtime).
//  2. BEHAVIOURAL: run the scheduled expiry and every sweep after a long time
//     and read the rows back unchanged.

type Block = { name: string; text: string };

/** Top-level declarations of a module, each with the text up to the next one. */
function topLevelBlocks(source: string): Block[] {
  const lines = source.split(/\r?\n/);
  const starts: { name: string; line: number }[] = [];
  lines.forEach((line, index) => {
    const match = /^(?:export\s+)?(?:async\s+)?(?:const|function|type)\s+(\w+)/.exec(line);
    if (match) starts.push({ name: match[1], line: index });
  });
  return starts.map((start, index) => ({
    name: start.name,
    text: lines.slice(start.line, index + 1 < starts.length ? starts[index + 1].line : lines.length).join("\n"),
  }));
}

describe("nothing scheduled ever writes occupancy", () => {
  const TABLE = "menuPositionOccupancy";

  test("the table is named only in the schema, the table-name union of menuAccess.ts, archivePosition, menuWaiter.ts and markArrived", () => {
    // Not vacuous: the glob really found the sources.
    expect(Object.keys(sources).length).toBeGreaterThan(50);
    for (const key of ["./schema.ts", "./crons.ts", "./menuWaiter.ts", "./lib/menuAccess.ts", "./menuReservations.ts"]) {
      expect(typeof sources[key], key).toBe("string");
    }
    const mentioning = Object.entries(sources)
      .filter(([, text]) => text.includes(TABLE))
      .map(([file]) => file)
      .sort();
    // K25 (intentional, plan K24-12 / K19-19): realizing a reservation may mark its table
    // occupied, only with the module on — the one writer outside setOccupancy.
    expect(mentioning).toEqual(["./lib/menuAccess.ts", "./menuFloor.ts", "./menuReservations.ts", "./menuWaiter.ts", "./schema.ts"]);

    // menuReservations.ts: only markArrived, a public mutation (a person marks the arrival), never scheduled.
    const reservationBlocks = topLevelBlocks(sources["./menuReservations.ts"]).filter((block) => block.text.includes(TABLE));
    expect(reservationBlocks.map((block) => block.name)).toEqual(["markArrived"]);
    expect(reservationBlocks[0].text).toMatch(/^export const markArrived = mutation\(/);
    expect(reservationBlocks[0].text).not.toMatch(/scheduler|internalMutation|internalAction/);
    expect(reservationBlocks[0].text).toMatch(/features\.occupancy === true/);
    expect(sources["./menuReservations.ts"]).not.toMatch(/ctx\.scheduler\./);

    // menuFloor.ts: only archivePosition, a public mutation (a person archives the table), which only deletes.
    const floorBlocks = topLevelBlocks(sources["./menuFloor.ts"]).filter((block) => block.text.includes(TABLE));
    expect(floorBlocks.map((block) => block.name)).toEqual(["archivePosition"]);
    expect(floorBlocks[0].text).toMatch(/^export const archivePosition = mutation\(/);
    expect(floorBlocks[0].text).not.toMatch(/insert\("menuPositionOccupancy"|scheduler/);

    // menuAccess.ts: one member of the MenuOwnedTable union, nothing that reads or writes.
    const access = sources["./lib/menuAccess.ts"];
    expect(access.match(new RegExp(TABLE, "g"))).toHaveLength(1);
    expect(access).toMatch(new RegExp(`\\|\\s*"${TABLE}";`));
  });

  test("no cron and no other module reaches the setOccupancy mutation", () => {
    expect(sources["./crons.ts"]).not.toMatch(/occupancy/i);
    const callers = Object.entries(sources)
      .filter(([, text]) => /\b(?:api|internal)\.menuWaiter\.setOccupancy\b/.test(text))
      .map(([file]) => file);
    expect(callers).toEqual([]);
  });

  test("in menuWaiter.ts only the occupancy query (read) and the setOccupancy mutation (write) touch the table", () => {
    const source = sources["./menuWaiter.ts"];
    const blocks = topLevelBlocks(source);
    const touching = blocks.filter((block) => block.text.includes(TABLE));
    // Every other block (the internalMutations and everything that schedules included) never names it.
    expect(touching.map((block) => block.name)).toEqual(["occupancy", "setOccupancy"]);

    const [read, write] = touching;
    expect(read.text).toMatch(/^export const occupancy = query\(/);
    expect(read.text).not.toMatch(/\.(?:insert|patch|replace|delete)\(/);
    expect(read.text).not.toMatch(/scheduler/);

    expect(write.text).toMatch(/^export const setOccupancy = mutation\(/);
    expect(write.text).not.toMatch(/scheduler/);
    expect(write.text).not.toMatch(/internalMutation|internalAction/);

    // Every write to the table in the file lies inside that one block.
    const inserts = (text: string) => text.match(new RegExp(`insert\\("${TABLE}"`, "g"))?.length ?? 0;
    expect(inserts(source)).toBe(1);
    expect(inserts(write.text)).toBe(1);
    const deletes = (text: string) => text.match(/ctx\.db\.delete\(existing\._id\)/g)?.length ?? 0;
    expect(deletes(source)).toBe(deletes(write.text));
    expect(deletes(write.text)).toBe(1);

    // And the scheduled functions of the file are the session ones, which never name the table.
    for (const block of blocks) {
      if (/\binternal(?:Mutation|Action)\(/.test(block.text) || /ctx\.scheduler\./.test(block.text)) {
        expect(block.text, block.name).not.toContain(TABLE);
        expect(block.text, block.name).not.toMatch(/occupancy/i);
      }
    }
  });

  test("the scheduled expiry and the sweeps leave occupancy exactly as it was", async () => {
    const env = await world();
    const { t, w } = env;
    const { ana, anaId } = await crew(env);
    await setModule(t, w.a.menuServiceId, true);
    const p1 = await addPosition(t, w.a, "Sto 1", { order: 0 });
    const p2 = await addPosition(t, w.a, "Sto 2", { order: 1 });
    await setOccupancy(env, ana, p1, "occupied");
    vi.setSystemTime(T0 + MINUTE);
    await setOccupancy(env, ana, p2, "reserved");
    const before = await occupancyRows(t);
    expect(before).toHaveLength(2);

    // 12 h and a day later: the sessions expire (scheduled), both sweeps run, the guest sessions end.
    vi.advanceTimersByTime(STAFF_SESSION_MS + 24 * 60 * MINUTE);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    await t.mutation(internal.menuWaiter.sweepExpiredSessions, {});
    await t.mutation(internal.menuGuest.sweepExpiredSessions, {});
    expect(await floorOf(env, ana)).toBeNull(); // the staff session really is gone

    expect(await occupancyRows(t)).toEqual(before);
    const view = await occupancyOf(env, undefined, { who: as(t, w.ownerId) });
    expect(view).toMatchObject({ off: false });
    if (!view || view.off) throw new Error("expected rows");
    expect(view.states.map((row) => [row.positionId, row.state])).toEqual([
      [p1, "occupied"],
      [p2, "reserved"],
    ]);
    expect(before[0].updatedByStaffId).toBe(anaId);
  });
});

// =============================================================================
// 5. setMyZone
// =============================================================================

describe("setMyZone", () => {
  test("a staff member sets their own zone and clears it again; only their own row changes", async () => {
    const env = await world();
    const { t, w } = env;
    const { ana, anaId, markoId } = await crew(env);
    const sala = await addZone(t, w.a, "Sala");
    const terasa = await addZone(t, w.a, "Terasa", { order: 1 });

    vi.setSystemTime(T0 + MINUTE);
    expect(await setMyZone(env, ana, sala)).toEqual({ ok: true, changed: true });
    expect(await staffRow(t, anaId)).toMatchObject({ activeZoneId: sala, updatedAt: T0 + MINUTE });
    expect((await staffRow(t, markoId))?.activeZoneId).toBeUndefined();
    const floor = await mustFloor(env, ana);
    expect(floor.me.activeZoneId).toBe(sala);
    expect(floor.staff.find((member) => member.id === anaId)?.activeZoneId).toBe(sala);
    expect(floor.staff.find((member) => member.id === markoId)?.activeZoneId).toBeNull();

    // The same zone again: no write.
    vi.setSystemTime(T0 + 2 * MINUTE);
    expect(await setMyZone(env, ana, sala)).toEqual({ ok: true, changed: false });
    expect((await staffRow(t, anaId))?.updatedAt).toBe(T0 + MINUTE);

    // Another zone, then back to "every zone": the field is cleared, not stored as null.
    expect(await setMyZone(env, ana, terasa)).toEqual({ ok: true, changed: true });
    expect((await staffRow(t, anaId))?.activeZoneId).toBe(terasa);
    expect(await setMyZone(env, ana, null)).toEqual({ ok: true, changed: true });
    const row = await staffRow(t, anaId);
    expect(row?.activeZoneId).toBeUndefined();
    expect(Object.keys(row ?? {})).not.toContain("activeZoneId");
    expect(await setMyZone(env, ana, null)).toEqual({ ok: true, changed: false });
    expect((await mustFloor(env, ana)).me.activeZoneId).toBeNull();
  });

  test("a zone of another venue or an archived zone is menu/not_found and changes nothing", async () => {
    const env = await world();
    const { t, w } = env;
    const { ana, anaId } = await crew(env);
    const sala = await addZone(t, w.a, "Sala");
    const foreign = await addZone(t, w.b, "Terasa B");
    const archived = await addZone(t, w.a, "Stara sala", { active: false });
    await setMyZone(env, ana, sala);

    expect(await setMyZone(env, ana, foreign)).toEqual({ ok: false, code: MENU_ERROR.notFound });
    expect(await setMyZone(env, ana, archived)).toEqual({ ok: false, code: "menu/not_found" });
    expect((await staffRow(t, anaId))?.activeZoneId).toBe(sala);
  });

  test("an Owner's, Manager's or admin's account is menu/forbidden (their filter lives on the device)", async () => {
    const env = await world();
    const { t, w } = env;
    const sala = await addZone(t, w.a, "Sala");
    for (const userId of [w.ownerId, w.managerId, w.adminId]) {
      expect(await setMyZone(env, undefined, sala, { who: as(t, userId) })).toEqual({
        ok: false,
        code: MENU_ERROR.forbidden,
      });
    }
  });

  test("signed out is staff/signed_out", async () => {
    const env = await world();
    const { t, w } = env;
    const sala = await addZone(t, w.a, "Sala");
    expect(await setMyZone(env, BOGUS_TOKEN, sala)).toEqual({ ok: false, code: STAFF_ERROR.signedOut });
    expect(await setMyZone(env, undefined, sala)).toEqual({ ok: false, code: "staff/signed_out" });
    expect(await setMyZone(env, undefined, sala, { who: as(t, w.editorId) })).toEqual({
      ok: false,
      code: "staff/signed_out",
    });
  });

  test("it is not audited", async () => {
    const env = await world();
    const { t, w } = env;
    const { ana } = await crew(env);
    const sala = await addZone(t, w.a, "Sala");
    const before = (await auditAll(t)).length;
    await setMyZone(env, ana, sala);
    await setMyZone(env, ana, null);
    await setMyZone(env, undefined, sala, { who: as(t, w.ownerId) }); // refused
    expect((await auditAll(t)).length).toBe(before);
    expect(await auditRows(t, "staff.zone_assigned")).toEqual([]);
  });
});

// =============================================================================
// 6. setStaffZone
// =============================================================================

describe("setStaffZone", () => {
  test("a plain staff member is menu/forbidden, whoever the target is", async () => {
    const env = await world();
    const { t, w } = env;
    const { ana, markoId } = await crew(env);
    const sala = await addZone(t, w.a, "Sala");
    const foreignStaff = await addStaff(env, "Petar", undefined, { venue: "b" });

    expect(await setStaffZone(env, ana, markoId, sala)).toEqual({ ok: false, code: MENU_ERROR.forbidden });
    expect(await setStaffZone(env, ana, foreignStaff, sala)).toEqual({ ok: false, code: "menu/forbidden" });
    expect((await staffRow(t, markoId))?.activeZoneId).toBeUndefined();
    expect(await auditRows(t, "staff.zone_assigned")).toEqual([]);
  });

  test("a staff member with panelRole manager assigns a zone; audited as staff, with the target and the zone", async () => {
    const env = await world();
    const { t, w } = env;
    const { markoId } = await crew(env);
    const jelenaId = await addStaff(env, "Jelena", "777", { panelRole: "manager" });
    const jelena = (await signIn(env, "777")).sessionToken;
    const sala = await addZone(t, w.a, "Sala");

    vi.setSystemTime(T0 + MINUTE);
    expect(await setStaffZone(env, jelena, markoId, sala)).toEqual({ ok: true, changed: true });
    expect(await staffRow(t, markoId)).toMatchObject({ activeZoneId: sala, updatedAt: T0 + MINUTE });

    const audit = await auditRows(t, "staff.zone_assigned");
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      menuServiceId: w.a.menuServiceId,
      actorKind: "staff",
      actorRef: jelenaId,
      entityType: "staff",
      entityKey: markoId,
      details: { zoneId: sala },
      createdAt: T0 + MINUTE,
    });
    expect(audit[0].actorUserId).toBeUndefined();
    // Marko's own filter on his device follows at once.
    const marko = (await signIn(env, "135")).sessionToken;
    expect((await mustFloor(env, marko)).me.activeZoneId).toBe(sala);

    // Back to every zone: cleared, audited with a null zone.
    expect(await setStaffZone(env, jelena, markoId, null)).toEqual({ ok: true, changed: true });
    expect((await staffRow(t, markoId))?.activeZoneId).toBeUndefined();
    const second = await auditRows(t, "staff.zone_assigned");
    expect(second).toHaveLength(2);
    expect(second[1]).toMatchObject({ entityKey: markoId, details: { zoneId: null } });
  });

  test("the Owner, a Manager and a ScanMe admin assign zones with their account", async () => {
    const env = await world();
    const { t, w } = env;
    const { markoId } = await crew(env);
    const sala = await addZone(t, w.a, "Sala");
    const terasa = await addZone(t, w.a, "Terasa", { order: 1 });
    const baste = await addZone(t, w.a, "Basta", { order: 2 });

    const cases = [
      { userId: w.ownerId, zone: sala, kind: "user" },
      { userId: w.managerId, zone: terasa, kind: "user" },
      { userId: w.adminId, zone: baste, kind: "admin" },
    ] as const;
    for (const { userId, zone, kind } of cases) {
      expect(await setStaffZone(env, undefined, markoId, zone, { who: as(t, userId) })).toEqual({
        ok: true,
        changed: true,
      });
      expect((await staffRow(t, markoId))?.activeZoneId).toBe(zone);
      const audit = (await auditRows(t, "staff.zone_assigned")).at(-1);
      expect(audit).toMatchObject({
        actorKind: kind,
        actorUserId: userId,
        entityType: "staff",
        entityKey: markoId,
        details: { zoneId: zone },
      });
      expect(audit?.actorRef).toBeUndefined();
    }
    expect(await auditRows(t, "staff.zone_assigned")).toHaveLength(3);
  });

  test("the same zone again is changed false and writes no second audit row", async () => {
    const env = await world();
    const { t, w } = env;
    const { anaId, markoId } = await crew(env);
    const sala = await addZone(t, w.a, "Sala");
    const owner = { who: as(t, w.ownerId) };

    expect(await setStaffZone(env, undefined, markoId, sala, owner)).toEqual({ ok: true, changed: true });
    vi.setSystemTime(T0 + MINUTE);
    expect(await setStaffZone(env, undefined, markoId, sala, owner)).toEqual({ ok: true, changed: false });
    expect(await auditRows(t, "staff.zone_assigned")).toHaveLength(1);
    expect((await staffRow(t, markoId))?.updatedAt).toBe(T0);

    // "Every zone" for someone who has no zone is no change either.
    expect(await setStaffZone(env, undefined, anaId, null, owner)).toEqual({ ok: true, changed: false });
    expect(await auditRows(t, "staff.zone_assigned")).toHaveLength(1);
  });

  test("another venue's staff, another venue's zone, an archived zone and a deactivated target are menu/not_found", async () => {
    const env = await world();
    const { t, w } = env;
    const { markoId } = await crew(env);
    const sala = await addZone(t, w.a, "Sala");
    const foreignZone = await addZone(t, w.b, "Terasa B");
    const archivedZone = await addZone(t, w.a, "Stara sala", { active: false });
    const foreignStaff = await addStaff(env, "Petar", "246", { venue: "b" });
    const leftId = await addStaff(env, "Dragan", "468");
    await env.owner.mutation(api.menuStaff.deactivate, { staffId: leftId });
    const owner = { who: as(t, w.ownerId) };

    expect(await setStaffZone(env, undefined, foreignStaff, sala, owner)).toEqual({ ok: false, code: MENU_ERROR.notFound });
    expect(await setStaffZone(env, undefined, markoId, foreignZone, owner)).toEqual({ ok: false, code: "menu/not_found" });
    expect(await setStaffZone(env, undefined, markoId, archivedZone, owner)).toEqual({ ok: false, code: "menu/not_found" });
    expect(await setStaffZone(env, undefined, leftId, sala, owner)).toEqual({ ok: false, code: "menu/not_found" });

    expect((await staffRow(t, foreignStaff))?.activeZoneId).toBeUndefined();
    expect((await staffRow(t, markoId))?.activeZoneId).toBeUndefined();
    expect((await staffRow(t, leftId))?.activeZoneId).toBeUndefined();
    expect(await auditRows(t, "staff.zone_assigned")).toEqual([]);

    // A manager of venue b has the right, but not over venue a's staff.
    await addStaff(env, "Jelena", "135", { venue: "b", panelRole: "manager" });
    const jelenaB = (await signIn(env, "135", { venue: "b" })).sessionToken;
    expect(await setStaffZone(env, jelenaB, markoId, foreignZone, { venue: "b" })).toEqual({
      ok: false,
      code: "menu/not_found",
    });
  });

  test("signed out is staff/signed_out; an Urednik cannot assign", async () => {
    const env = await world();
    const { t, w } = env;
    const { markoId } = await crew(env);
    const sala = await addZone(t, w.a, "Sala");
    expect(await setStaffZone(env, BOGUS_TOKEN, markoId, sala)).toEqual({ ok: false, code: STAFF_ERROR.signedOut });
    expect(await setStaffZone(env, undefined, markoId, sala, { who: as(t, w.editorId) })).toEqual({
      ok: false,
      code: "staff/signed_out",
    });
    expect((await staffRow(t, markoId))?.activeZoneId).toBeUndefined();
  });
});

// =============================================================================
// 7. positionDetail
// =============================================================================

describe("positionDetail", () => {
  test("the labels of the ACTIVE cards linked to the position; inactive links, disabled cards and foreign cards are ignored", async () => {
    const env = await world();
    const { t, w } = env;
    const { ana } = await crew(env);
    const sto = await addPosition(t, w.a, "Sto 12");
    const other = await addPosition(t, w.a, "Sto 13");

    await addCardOn(t, w.a, sto, "Kartica 12-B");
    await addCardOn(t, w.a, sto, "Kartica 12-C");
    await addCardOn(t, w.a, sto, "Kartica stara", { linkActive: false });
    await addCardOn(t, w.a, sto, "Kartica ugasena", { cardStatus: "disabled" });
    await addCardOn(t, w.a, sto, "Kartica tudja", { cardBusinessId: w.b.businessId });
    await addCardOn(t, w.a, sto, "Kartica druga usluga", { linkServiceId: w.b.menuServiceId });
    await addCardOn(t, w.a, other, "Kartica 13-A");

    const detail = await detailOf(env, ana, sto);
    expect(detail).not.toBeNull();
    expect(detail?.cards.map((card) => card.label).sort()).toEqual(["Kartica 12-B", "Kartica 12-C"]);
    // Labels only: no card code, no id.
    for (const card of detail?.cards ?? []) expect(Object.keys(card)).toEqual(["label"]);

    expect(await detailOf(env, ana, other)).toEqual({ cards: [{ label: "Kartica 13-A" }] });
    // The Owner's account reads the same.
    expect((await detailOf(env, undefined, sto, { who: as(t, w.ownerId) }))?.cards).toHaveLength(2);
  });

  test("a position with no card has an empty list", async () => {
    const env = await world();
    const { ana } = await crew(env);
    const sto = await addPosition(env.t, env.w.a, "Sto 12");
    expect(await detailOf(env, ana, sto)).toEqual({ cards: [] });
  });

  test("a card follows its link: archiving the link or disabling the card removes it", async () => {
    const env = await world();
    const { t, w } = env;
    const { ana } = await crew(env);
    const sto = await addPosition(t, w.a, "Sto 12");
    const { cardId, linkId } = await addCardOn(t, w.a, sto, "Kartica 12-B");
    expect((await detailOf(env, ana, sto))?.cards).toEqual([{ label: "Kartica 12-B" }]);
    await t.run(async (ctx) => await ctx.db.patch(cardId, { status: "disabled" }));
    expect(await detailOf(env, ana, sto)).toEqual({ cards: [] });
    await t.run(async (ctx) => {
      await ctx.db.patch(cardId, { status: "active" });
      await ctx.db.patch(linkId, { active: false });
    });
    expect(await detailOf(env, ana, sto)).toEqual({ cards: [] });
  });

  test("null for a position of another venue, an archived position, a dead token and anyone not signed in", async () => {
    const env = await world();
    const { t, w } = env;
    const { ana } = await crew(env);
    const foreign = await addPosition(t, w.b, "Sto B1");
    await addCardOn(t, w.b, foreign, "Kartica B-1");
    const archived = await addPosition(t, w.a, "Stari sto", { active: false });
    await addCardOn(t, w.a, archived, "Kartica stara");
    const sto = await addPosition(t, w.a, "Sto 12");

    expect(await detailOf(env, ana, foreign)).toBeNull();
    expect(await detailOf(env, undefined, foreign, { who: as(t, w.ownerId) })).toBeNull();
    expect(await detailOf(env, ana, archived)).toBeNull();
    expect(await detailOf(env, BOGUS_TOKEN, sto)).toBeNull();
    expect(await detailOf(env, undefined, sto)).toBeNull();
    expect(await detailOf(env, undefined, sto, { who: as(t, w.editorId) })).toBeNull();
  });

  test("bounded: at most MENU_MAX_CARDS_ON_POSITION cards are read", async () => {
    const env = await world();
    const { ana } = await crew(env);
    const sto = await addPosition(env.t, env.w.a, "Sto 12");
    for (let index = 0; index < MENU_MAX_CARDS_ON_POSITION + 2; index += 1) {
      await addCardOn(env.t, env.w.a, sto, `Kartica ${index + 1}`);
    }
    expect((await detailOf(env, ana, sto))?.cards).toHaveLength(MENU_MAX_CARDS_ON_POSITION);
  });

  test("an active card behind many old, inactive links is still found (inactive links are skipped, not counted)", async () => {
    const env = await world();
    const { ana } = await crew(env);
    const sto = await addPosition(env.t, env.w.a, "Sto 12");
    for (let index = 0; index < MENU_MAX_CARDS_ON_POSITION + 5; index += 1) {
      await addCardOn(env.t, env.w.a, sto, `Stara ${index + 1}`, { linkActive: false });
    }
    await addCardOn(env.t, env.w.a, sto, "12-B");
    expect((await detailOf(env, ana, sto))?.cards).toEqual([{ label: "12-B" }]);
  });
});

describe("archiving a position (K23)", () => {
  test("the mark of an archived position goes with it; the others stay; nothing else is touched", async () => {
    const env = await world();
    const { t, w } = env;
    const { ana } = await crew(env);
    await setModule(t, w.a.menuServiceId, true);
    const sto = await addPosition(t, w.a, "Sto 1");
    const other = await addPosition(t, w.a, "Sto 2");
    await setOccupancy(env, ana, sto, "occupied");
    await setOccupancy(env, ana, other, "reserved");

    await env.owner.mutation(api.menuFloor.archivePosition, { positionId: sto });
    const rows = await occupancyRows(t);
    expect(rows.map((row) => [row.positionId, row.state])).toEqual([[other, "reserved"]]);
    expect(await occupancyOf(env, ana)).toMatchObject({ off: false, states: [{ positionId: other, state: "reserved" }] });
  });
});

// =============================================================================
// 8. request rows carry the position and the zone
// =============================================================================

describe("activeRequests rows (K23)", () => {
  test("carry positionId and zoneId (null without a zone)", async () => {
    const env = await world();
    const { t } = env;
    const { ana } = await crew(env);
    const withZone = await addTable(t, env.w.a, "Sto 12", "Terasa");
    const noZone = await addTable(t, env.w.a, "Sto 7");
    const [zoned] = await addRequestsOn(t, [withZone], 1);
    const [plain] = await addRequestsOn(t, [noZone], 1);

    const queue = await queueOf(env, ana);
    expect(queue?.requests).toHaveLength(2);
    expect(queue?.requests.find((row) => row.id === zoned)).toMatchObject({
      positionId: withZone.positionId,
      zoneId: withZone.zoneId,
      zoneName: "Terasa",
      positionLabel: "Sto 12",
    });
    expect(queue?.requests.find((row) => row.id === plain)).toMatchObject({
      positionId: noZone.positionId,
      zoneId: null,
      zoneName: null,
      positionLabel: "Sto 7",
    });
  });
});

// =============================================================================
// 9. load
// =============================================================================

describe("load", () => {
  test("100 tables and 300 new requests: the queue returns all 300, the floor all 100", { timeout: 120_000 }, async () => {
    const env = await world();
    const { ana } = await crew(env);
    const tables = await addTables(env.t, env.w.a, 100);
    expect(await addRequestsOn(env.t, tables, 3)).toHaveLength(300);

    const queue = await queueOf(env, ana);
    expect(queue?.requests).toHaveLength(300);
    expect(queue?.truncated).toBe(false);
    expect(queue?.requests.every((row) => row.status === "new")).toBe(true);
    expect(new Set(queue?.requests.map((row) => row.positionId)).size).toBe(100);

    const floor = await mustFloor(env, ana);
    expect(floor.positions).toHaveLength(100);
    expect(floor.positions.map((position) => position.id)).toEqual(tables.map((table) => table.positionId));
    // Every request stands on a position of the floor.
    const onFloor = new Set(floor.positions.map((position) => position.id));
    expect(queue?.requests.every((row) => onFloor.has(row.positionId))).toBe(true);
  });
});
