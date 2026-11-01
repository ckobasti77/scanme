/// <reference types="vite/client" />

// ScanMe Menu V1 — K25: reservations, the STAFF side (master §11.3–§11.7; plan
// docs/meni/planovi/K24.md): `forPanel` (one subscription: what waits for an
// answer, the accepted ones in the window, the arrived, the recently cancelled;
// no contact), `detail` (the contact and the note), `accept`, `decline`,
// `proposeChange`, `acceptProposal`, `cancelByStaff`, `bindPosition`,
// `markArrived`. Two kinds of staff are exercised: a PIN waiter (loginWithPin) and
// the Owner/Manager/ScanMe admin with their own account (withIdentity, no session
// token). Proven here: the acceptance flow (submit → accept → bind a table →
// arrived → the table is occupied only with the optional module on), only staff
// bind tables, every transition and its audit, the stale-screen guard
// (expectedStatus), that lateness is the client's arithmetic and nothing ever
// changes a status on its own, tenant isolation and the role matrix.
//
// Time is frozen (fake timers, T0 = Wednesday 2026-10-21 10:00 Belgrade); the
// clock moves with vi.setSystemTime. Fictional tenants only (the repo is public):
// "Kafana kod Mike" (a), "Demo restoran" (b); people are "Ana", "Marko", "Petar".
// The helpers are copied from convex/menuWaiterFloor.test.ts on purpose (a test
// file is not a module to import from).

import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import type { FunctionArgs } from "convex/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import { belgradeLocalToEpoch } from "../lib/belgrade-time";
import { menuKonobarSr } from "../lib/i18n/sr/menu-konobar";
import { RESERVATION_ERROR } from "../lib/menu/errors/reservations";
import { STAFF_ERROR } from "../lib/menu/errors/waiter";
import { MENU_MAX_PANEL_RESERVATIONS, MENU_MAX_RECENT_CANCELLED_RESERVATIONS, MENU_RESERVATION_PANEL_WINDOW_MS } from "../lib/menu/limits";
import { reservationTiming } from "../lib/menu/reservation-late";
import { STAFF_SESSION_MS } from "../lib/menu/pin-policy";
import { newMenuToken } from "../lib/menu/tokens";
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

const T0 = Date.UTC(2026, 9, 21, 8, 0, 0); // Wednesday 10:00 in Belgrade (CEST)
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
/** What the panel passes as `fromMs`: the start of the current hour minus 12 hours. */
const FROM_MS = T0 - 12 * HOUR;

function belgrade(local: string): number {
  return must(belgradeLocalToEpoch(local), `a Belgrade time for ${local}`);
}

/** Thursday 19:00 in Belgrade: inside the hours, on the grid, more than a day ahead. */
const THU_19 = belgrade("2026-10-22T19:00");

const DAILY = [{ start: 12 * 60, end: 23 * 60 }];
const LATE = [{ start: 12 * 60, end: 25 * 60 }];
const WEEK = { days: [DAILY, DAILY, DAILY, DAILY, LATE, LATE, DAILY] };

/** Well-formed (43 url-safe characters), but nobody's session token. */
const BOGUS_TOKEN = "A".repeat(43);
const SIGNED_OUT = { ok: false, code: STAFF_ERROR.signedOut };
const NOT_FOUND = { ok: false, code: RESERVATION_ERROR.notFound };

// -----------------------------------------------------------------------------
// World, staff, sign-in
// -----------------------------------------------------------------------------

async function world() {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  const t = newTest();
  const w: MenuWorldSeed = await t.run(async (ctx) => await seedMenuWorld(ctx));
  const owner = as(t, w.ownerId);
  const { code } = await owner.mutation(api.menuStaff.ensurePanelCode, { menuServiceId: w.a.menuServiceId });
  const other = as(t, w.otherOwnerId);
  const { code: bCode } = await other.mutation(api.menuStaff.ensurePanelCode, { menuServiceId: w.b.menuServiceId });
  return { t, w, owner, code, bCode };
}
type Env = Awaited<ReturnType<typeof world>>;
type Venue = "a" | "b";

/** The working hours, then the ScanMe form, for venue a. */
async function openForm(env: Env, contact: "email" | "phone" | "both" = "both") {
  await env.owner.mutation(api.menuSettings.setWorkingHours, {
    menuServiceId: env.w.a.menuServiceId,
    workingHours: WEEK,
  });
  const outcome = await env.owner.mutation(api.menuServices.setReservations, {
    menuServiceId: env.w.a.menuServiceId,
    mode: "form",
    contact,
  });
  if (!outcome.ok) throw new Error(`setReservations refused: ${JSON.stringify(outcome)}`);
}

/** Switch the optional occupancy module on (what the Funkcionalnosti switch does). */
async function occupancyModule(env: Env, enabled: boolean) {
  await env.owner.mutation(api.menuServices.setFeature, {
    menuServiceId: env.w.a.menuServiceId,
    feature: "occupancy",
    enabled,
  });
}

async function addStaff(env: Env, displayName: string, pin: string, venue: Venue = "a") {
  const b = venue === "b";
  const who = b ? as(env.t, env.w.otherOwnerId) : env.owner;
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

/** A PIN waiter, created and signed in. */
async function signedIn(env: Env, displayName: string, pin: string, venue: Venue = "a") {
  const staffId = await addStaff(env, displayName, pin, venue);
  const { slug, panelCode } = panel(env, undefined, venue);
  const outcome = await env.t.mutation(api.menuWaiter.loginWithPin, { slug, panelCode, pin });
  if (!outcome.ok) throw new Error(`sign-in refused: ${JSON.stringify(outcome)}`);
  return { staffId, token: outcome.sessionToken };
}

// -----------------------------------------------------------------------------
// The guest's request, rows, positions
// -----------------------------------------------------------------------------

type SubmitArgs = FunctionArgs<typeof api.menuReservations.submit>;

let seq = 0;
const nextSeq = () => {
  seq += 1;
  return seq;
};
const ipOf = (n: number) => n.toString(16).padStart(32, "0");

/** A valid request of a fresh device; returns the guest's secrets too. */
async function guestRequest(env: Env, overrides: Partial<SubmitArgs> = {}) {
  const n = nextSeq();
  const args: SubmitArgs = {
    slug: SLUG_A,
    deviceToken: newMenuToken(),
    clientRequestId: `req-${String(n).padStart(8, "0")}`,
    cancelToken: newMenuToken(),
    guestName: "Marija Gost",
    partySize: 4,
    requestedAt: THU_19,
    contactEmail: "gost@example.com",
    contactPhone: "+381 60 000 0000",
    ipHash: ipOf(n),
    ...overrides,
  };
  const result = await env.t.mutation(api.menuReservations.submit, args);
  if (!result.ok) throw new Error(`submit refused: ${JSON.stringify(result)}`);
  return { args, reservationId: result.reservationId };
}

let hashCounter = 0;

type RowInput = {
  status: Doc<"menuReservations">["status"];
  requestedAt: number;
  guestName?: string;
  cancelledAt?: number;
  tenant?: MenuTenantSeed;
};

/** A row written straight into the table (what a long-running venue would have). */
async function putReservation(env: Env, input: RowInput) {
  hashCounter += 1;
  const tenant = input.tenant ?? env.w.a;
  return await env.t.run(
    async (ctx) =>
      await ctx.db.insert("menuReservations", {
        menuServiceId: tenant.menuServiceId,
        businessId: tenant.businessId,
        status: input.status,
        guestName: input.guestName ?? `Gost ${hashCounter}`,
        partySize: 2,
        requestedAt: input.requestedAt,
        contactEmail: "gost@example.com",
        contactPhone: "+381 60 000 0000",
        note: "Pored prozora",
        cancelTokenHash: `seeded-hash-${hashCounter}`,
        deviceKeyHash: `seeded-device-${hashCounter}`,
        ...(input.cancelledAt !== undefined ? { cancelledAt: input.cancelledAt, cancelledBy: "guest" as const } : {}),
        createdAt: T0,
        updatedAt: T0,
      }),
  );
}

async function addPosition(env: Env, label: string, options: { venue?: Venue; active?: boolean } = {}) {
  hashCounter += 1;
  const tenant = options.venue === "b" ? env.w.b : env.w.a;
  return await env.t.run(async (ctx) => {
    const now = Date.now();
    return await ctx.db.insert("menuPositions", {
      menuServiceId: tenant.menuServiceId,
      key: `ps_resv${hashCounter}`,
      kind: "table",
      label,
      labelNormalized: label.toLowerCase(),
      order: 0,
      active: options.active ?? true,
      createdAt: now,
      updatedAt: now,
    });
  });
}

const rowOf = (env: Env, id: Id<"menuReservations">) => env.t.run(async (ctx) => await ctx.db.get(id));
const mustRow = async (env: Env, id: Id<"menuReservations">) => must(await rowOf(env, id), "the reservation row");
const occupancyRows = (env: Env) => env.t.run(async (ctx) => await ctx.db.query("menuPositionOccupancy").take(100));
const auditAll = (env: Env) => env.t.run(async (ctx) => await ctx.db.query("menuAuditLog").take(5000));
const auditRows = async (env: Env, action: string) => (await auditAll(env)).filter((row) => row.action === action);

// -----------------------------------------------------------------------------
// Panel calls
// -----------------------------------------------------------------------------

type Opts = { venue?: Venue; who?: Caller };
type Status = Doc<"menuReservations">["status"];
type ActOpts = Opts & { expectedStatus?: Status };

const forPanelOf = (env: Env, token?: string, o: Opts & { fromMs?: number } = {}) =>
  (o.who ?? env.t).query(api.menuReservations.forPanel, { ...panel(env, token, o.venue), fromMs: o.fromMs ?? FROM_MS });
const detailOf = (env: Env, token: string | undefined, reservationId: Id<"menuReservations">, o: Opts = {}) =>
  (o.who ?? env.t).query(api.menuReservations.detail, { ...panel(env, token, o.venue), reservationId });

const actArgs = (env: Env, token: string | undefined, reservationId: Id<"menuReservations">, o: ActOpts) => ({
  ...panel(env, token, o.venue),
  reservationId,
  ...(o.expectedStatus ? { expectedStatus: o.expectedStatus } : {}),
});
const accept = (env: Env, token: string | undefined, id: Id<"menuReservations">, o: ActOpts = {}) =>
  (o.who ?? env.t).mutation(api.menuReservations.accept, actArgs(env, token, id, o));
const decline = (env: Env, token: string | undefined, id: Id<"menuReservations">, o: ActOpts = {}) =>
  (o.who ?? env.t).mutation(api.menuReservations.decline, actArgs(env, token, id, o));
const acceptProposal = (env: Env, token: string | undefined, id: Id<"menuReservations">, o: ActOpts = {}) =>
  (o.who ?? env.t).mutation(api.menuReservations.acceptProposal, actArgs(env, token, id, o));
const cancelByStaff = (env: Env, token: string | undefined, id: Id<"menuReservations">, o: ActOpts = {}) =>
  (o.who ?? env.t).mutation(api.menuReservations.cancelByStaff, actArgs(env, token, id, o));
const propose = (
  env: Env,
  token: string | undefined,
  id: Id<"menuReservations">,
  proposedAt: number,
  proposalNote?: string,
  o: ActOpts = {},
) =>
  (o.who ?? env.t).mutation(api.menuReservations.proposeChange, {
    ...actArgs(env, token, id, o),
    proposedAt,
    ...(proposalNote !== undefined ? { proposalNote } : {}),
  });
const bind = (
  env: Env,
  token: string | undefined,
  id: Id<"menuReservations">,
  positionId: Id<"menuPositions"> | null,
  o: ActOpts = {},
) => (o.who ?? env.t).mutation(api.menuReservations.bindPosition, { ...actArgs(env, token, id, o), positionId });
const arrive = (
  env: Env,
  token: string | undefined,
  id: Id<"menuReservations">,
  positionId?: Id<"menuPositions">,
  o: ActOpts = {},
) =>
  (o.who ?? env.t).mutation(api.menuReservations.markArrived, {
    ...actArgs(env, token, id, o),
    ...(positionId !== undefined ? { positionId } : {}),
  });

const linkView = (env: Env, token: string) => env.t.query(api.menuReservations.byCancelToken, { slug: SLUG_A, token });

// =============================================================================
// 1. forPanel
// =============================================================================

describe("forPanel", () => {
  test("null for a wrong code, a signed-out token, another venue's code or token, an Urednik and anonymous callers", async () => {
    const env = await world();
    await openForm(env);
    const { token: ana } = await signedIn(env, "Ana", "246");
    const { token: petar } = await signedIn(env, "Petar", "246", "b");
    expect(await forPanelOf(env, ana)).not.toBeNull(); // baseline

    // A wrong code, and another venue's code with this slug.
    expect(
      await env.t.query(api.menuReservations.forPanel, { slug: SLUG_A, panelCode: "ZZZZZZZZZZ", sessionToken: ana, fromMs: FROM_MS }),
    ).toBeNull();
    expect(
      await env.t.query(api.menuReservations.forPanel, { slug: SLUG_A, panelCode: env.bCode, sessionToken: ana, fromMs: FROM_MS }),
    ).toBeNull();
    expect(
      await env.t.query(api.menuReservations.forPanel, { slug: "nema-takvog-lokala", panelCode: env.code, sessionToken: ana, fromMs: FROM_MS }),
    ).toBeNull();

    // A token of another venue is nobody here (and fine at its own).
    expect(await forPanelOf(env, petar)).toBeNull();
    expect(await forPanelOf(env, petar, { venue: "b" })).not.toBeNull();
    // Dead, malformed and invented tokens; an invented token never falls back to the account.
    expect(await forPanelOf(env, BOGUS_TOKEN)).toBeNull();
    expect(await forPanelOf(env, "kratak")).toBeNull();
    expect(await forPanelOf(env, BOGUS_TOKEN, { who: as(env.t, env.w.ownerId) })).toBeNull();
    // Signed out.
    await env.t.mutation(api.menuWaiter.logout, { ...panel(env, ana), sessionToken: ana });
    expect(await forPanelOf(env, ana)).toBeNull();

    // An Urednik (editor) has no waiter.work; neither have finance, view-only, outsiders and the other venue's owner.
    for (const userId of [env.w.editorId, env.w.financeId, env.w.viewOnlyId, env.w.outsiderId, env.w.otherOwnerId]) {
      expect(await forPanelOf(env, undefined, { who: as(env.t, userId) })).toBeNull();
    }
    expect(await forPanelOf(env)).toBeNull();
    // The Owner, a Manager and a ScanMe admin work with their account.
    for (const userId of [env.w.ownerId, env.w.managerId, env.w.adminId]) {
      expect(await forPanelOf(env, undefined, { who: as(env.t, userId) })).not.toBeNull();
    }
  });

  test("holdMinutes defaults to 15 and follows the setting; mode reflects the Funkcionalnosti switch", async () => {
    const env = await world();
    const { token: ana } = await signedIn(env, "Ana", "246");
    expect(await forPanelOf(env, ana)).toEqual({ rows: [], truncated: false, mode: "off", holdMinutes: 15 });

    await openForm(env);
    expect(await forPanelOf(env, ana)).toMatchObject({ mode: "form", holdMinutes: 15 });

    await env.owner.mutation(api.menuSettings.setReservationHold, { menuServiceId: env.w.a.menuServiceId, holdMinutes: 40 });
    expect(await forPanelOf(env, ana)).toMatchObject({ mode: "form", holdMinutes: 40 });

    await env.owner.mutation(api.menuServices.setReservations, {
      menuServiceId: env.w.a.menuServiceId,
      mode: "external",
      externalUrl: "https://rezervacije.example.com/kafana",
    });
    expect(await forPanelOf(env, ana)).toMatchObject({ mode: "external", holdMinutes: 40 });

    // A broken stored value falls back to the default.
    await env.t.run(async (ctx) => {
      const service = must(await ctx.db.get(env.w.a.menuServiceId));
      await ctx.db.patch(env.w.a.menuServiceId, {
        settings: { ...service.settings, reservation: { contact: "both", holdMinutes: 3 } },
      });
    });
    expect(await forPanelOf(env, ana)).toMatchObject({ holdMinutes: 15 });
  });

  test("rows carry the queue fields only: no contact, no note text, no hashes, no device pseudonym", async () => {
    const env = await world();
    await openForm(env);
    const { token: ana } = await signedIn(env, "Ana", "246");
    const withNote = await guestRequest(env, { note: "Alergija na orašaste plodove" });
    const plain = await guestRequest(env, { guestName: "Petar Gost" });
    const sto = await addPosition(env, "Sto 7");
    await accept(env, ana, plain.reservationId);
    await bind(env, ana, plain.reservationId, sto);

    const result = must(await forPanelOf(env, ana));
    expect(result.rows).toHaveLength(2);
    const byId = new Map(result.rows.map((row) => [row.id, row]));
    expect(byId.get(withNote.reservationId)).toEqual({
      id: withNote.reservationId,
      status: "new",
      guestName: "Marija Gost",
      partySize: 4,
      requestedAt: THU_19,
      createdAt: T0,
      positionId: null,
      positionLabel: null,
      hasNote: true,
      proposedAt: null,
      arrivedAt: null,
      cancelledAt: null,
      cancelledBy: null,
    });
    expect(byId.get(plain.reservationId)).toMatchObject({
      status: "accepted",
      guestName: "Petar Gost",
      hasNote: false,
      positionId: sto,
      positionLabel: "Sto 7",
    });

    const stored = await mustRow(env, withNote.reservationId);
    for (const row of result.rows) {
      for (const key of ["contactEmail", "contactPhone", "note", "deviceKeyHash", "cancelTokenHash", "clientRequestId", "proposalNote"]) {
        expect(Object.keys(row), key).not.toContain(key);
      }
    }
    const text = JSON.stringify(result);
    for (const secret of [
      "gost@example.com",
      "+381",
      "Alergija",
      stored.cancelTokenHash,
      must(stored.deviceKeyHash),
      withNote.args.cancelToken,
      withNote.args.deviceToken,
    ]) {
      expect(text, secret).not.toContain(secret);
    }
  });

  test("the window: new and proposed of ANY date, accepted only inside [fromMs, fromMs + 60 h), arrived from fromMs, cancelled since fromMs", async () => {
    const env = await world();
    await openForm(env);
    const { token: ana } = await signedIn(env, "Ana", "246");
    const end = FROM_MS + MENU_RESERVATION_PANEL_WINDOW_MS;
    expect(MENU_RESERVATION_PANEL_WINDOW_MS).toBe(60 * HOUR);

    const included = new Map<string, Id<"menuReservations">>();
    const excluded = new Map<string, Id<"menuReservations">>();
    const plan: [boolean, string, RowInput][] = [
      [true, "novi daleko", { status: "new", requestedAt: T0 + 50 * DAY }],
      [true, "novi davno", { status: "new", requestedAt: T0 - 30 * DAY }],
      [true, "predlog davno", { status: "change_proposed", requestedAt: T0 - 10 * DAY }],
      [true, "predlog daleko", { status: "change_proposed", requestedAt: T0 + 40 * DAY }],
      [true, "prihvacen na pocetku", { status: "accepted", requestedAt: FROM_MS }],
      [true, "prihvacen na kraju", { status: "accepted", requestedAt: end - 1 }],
      [false, "prihvacen pre prozora", { status: "accepted", requestedAt: FROM_MS - 1 }],
      [false, "prihvacen posle prozora", { status: "accepted", requestedAt: end }],
      [false, "prihvacen daleko", { status: "accepted", requestedAt: T0 + 30 * DAY }],
      [true, "stigao na pocetku", { status: "arrived", requestedAt: FROM_MS }],
      [true, "stigao kasnije", { status: "arrived", requestedAt: T0 + 100 * HOUR }],
      [false, "stigao pre prozora", { status: "arrived", requestedAt: FROM_MS - 1 }],
      [true, "otkazan skoro", { status: "cancelled", requestedAt: T0 + 10 * DAY, cancelledAt: FROM_MS }],
      [false, "otkazan davno", { status: "cancelled", requestedAt: T0 + 10 * DAY, cancelledAt: FROM_MS - 1 }],
      [false, "odbijen", { status: "declined", requestedAt: T0 + HOUR }],
    ];
    for (const [isIncluded, name, input] of plan) {
      const id = await putReservation(env, { ...input, guestName: name });
      (isIncluded ? included : excluded).set(name, id);
    }
    // Venue b's rows never appear.
    await putReservation(env, { status: "new", requestedAt: THU_19, guestName: "tudji gost", tenant: env.w.b });

    const result = must(await forPanelOf(env, ana));
    expect(result.truncated).toBe(false);
    expect(result.rows.map((row) => row.guestName).sort()).toEqual([...included.keys()].sort());
    expect(new Set(result.rows.map((row) => row.id)).size).toBe(result.rows.length); // no row listed twice

    // A later fromMs moves the window of the accepted ones with it (the panel passes a new hour each hour).
    const later = must(await forPanelOf(env, ana, { fromMs: FROM_MS + 10 * HOUR }));
    const names = later.rows.map((row) => row.guestName);
    expect(names).not.toContain("prihvacen na pocetku");
    expect(names).toContain("prihvacen na kraju");
    expect(names).toContain("novi davno");
    expect(names).not.toContain("otkazan skoro"); // cancelled before the new fromMs
  });

  test("bounded: 200 of one status at most (truncated says so) and the last 20 cancelled", async () => {
    const env = await world();
    await openForm(env);
    const { token: ana } = await signedIn(env, "Ana", "246");
    await env.t.run(async (ctx) => {
      for (let i = 0; i < MENU_MAX_PANEL_RESERVATIONS + 1; i += 1) {
        await ctx.db.insert("menuReservations", {
          menuServiceId: env.w.a.menuServiceId,
          businessId: env.w.a.businessId,
          status: "new",
          guestName: `Novi ${i}`,
          partySize: 2,
          requestedAt: T0 + (i + 1) * HOUR,
          cancelTokenHash: `bulk-new-${i}`,
          createdAt: T0,
          updatedAt: T0,
        });
      }
      for (let i = 0; i < MENU_MAX_RECENT_CANCELLED_RESERVATIONS + 5; i += 1) {
        await ctx.db.insert("menuReservations", {
          menuServiceId: env.w.a.menuServiceId,
          businessId: env.w.a.businessId,
          status: "cancelled",
          guestName: `Otkazan ${i}`,
          partySize: 2,
          requestedAt: T0 + DAY,
          cancelledAt: FROM_MS + i * MINUTE,
          cancelledBy: "guest",
          cancelTokenHash: `bulk-cancelled-${i}`,
          createdAt: T0,
          updatedAt: T0,
        });
      }
    });
    const result = must(await forPanelOf(env, ana));
    expect(result.truncated).toBe(true);
    expect(result.rows.filter((row) => row.status === "new")).toHaveLength(MENU_MAX_PANEL_RESERVATIONS);
    const cancelled = result.rows.filter((row) => row.status === "cancelled");
    expect(cancelled).toHaveLength(MENU_MAX_RECENT_CANCELLED_RESERVATIONS);
    // The newest cancellations.
    expect(Math.min(...cancelled.map((row) => must(row.cancelledAt)))).toBe(FROM_MS + 5 * MINUTE);
  });
});

// =============================================================================
// 2. detail
// =============================================================================

describe("detail", () => {
  test("returns the contact and the note, and who decided, bound and received the guests", async () => {
    const env = await world();
    await openForm(env);
    const { token: ana } = await signedIn(env, "Ana", "246");
    const { reservationId } = await guestRequest(env, { note: "Alergija na orašaste plodove" });
    const sto = await addPosition(env, "Sto 7");

    const fresh = must(await detailOf(env, ana, reservationId));
    expect(fresh.reservation).toMatchObject({
      id: reservationId,
      status: "new",
      guestName: "Marija Gost",
      partySize: 4,
      requestedAt: THU_19,
      contactEmail: "gost@example.com",
      contactPhone: "+381 60 000 0000",
      note: "Alergija na orašaste plodove",
      hasNote: true,
      decidedBy: null,
      boundBy: null,
      arrivedBy: null,
      cancelledByName: null,
    });
    expect(fresh.sameTable).toEqual([]);
    // Never the hashes or the guest's device pseudonym.
    const stored = await mustRow(env, reservationId);
    const text = JSON.stringify(fresh);
    expect(text).not.toContain(stored.cancelTokenHash);
    expect(text).not.toContain(must(stored.deviceKeyHash));
    expect(Object.keys(fresh.reservation)).not.toContain("cancelTokenHash");
    expect(Object.keys(fresh.reservation)).not.toContain("deviceKeyHash");

    await accept(env, ana, reservationId);
    await bind(env, ana, reservationId, sto);
    await arrive(env, ana, reservationId);
    const done = must(await detailOf(env, ana, reservationId));
    expect(done.reservation).toMatchObject({
      status: "arrived",
      positionId: sto,
      positionLabel: "Sto 7",
      decidedBy: "Ana",
      boundBy: "Ana",
      arrivedBy: "Ana",
      cancelledByName: null,
    });
  });

  test("an account is named for others by its name, else by a neutral label (never the e-mail)", async () => {
    const env = await world();
    await openForm(env);
    await env.t.run(async (ctx) => await ctx.db.patch(env.w.ownerId, { name: "Jelena" }));
    const first = await guestRequest(env);
    const second = await guestRequest(env);
    await accept(env, undefined, first.reservationId, { who: as(env.t, env.w.ownerId) });
    await accept(env, undefined, second.reservationId, { who: as(env.t, env.w.managerId) });
    const owner = as(env.t, env.w.ownerId);
    expect(must(await detailOf(env, undefined, first.reservationId, { who: owner })).reservation.decidedBy).toBe("Jelena");
    const unnamed = must(await detailOf(env, undefined, second.reservationId, { who: owner })).reservation.decidedBy;
    expect(unnamed).toBe(menuKonobarSr.zaglavlje.nalogBezImena);
    expect(JSON.stringify(unnamed)).not.toContain("menadzer@example.com");
  });

  test("the other reservations of the same table that day: accepted or arrived, earliest first", async () => {
    const env = await world();
    await openForm(env);
    const { token: ana } = await signedIn(env, "Ana", "246");
    const sto = await addPosition(env, "Sto 7");
    const dinner = await guestRequest(env, { requestedAt: belgrade("2026-10-22T20:00") });
    const lunch = await guestRequest(env, { requestedAt: belgrade("2026-10-22T13:00") });
    const cancelled = await guestRequest(env, { requestedAt: belgrade("2026-10-22T16:00") });
    const nextDay = await guestRequest(env, { requestedAt: belgrade("2026-10-24T19:00") });
    for (const { reservationId } of [dinner, lunch, cancelled, nextDay]) {
      await accept(env, ana, reservationId);
      await bind(env, ana, reservationId, sto);
    }
    await cancelByStaff(env, ana, cancelled.reservationId);

    const detail = must(await detailOf(env, ana, dinner.reservationId));
    expect(detail.sameTable.map((row) => row.id)).toEqual([lunch.reservationId]);
    expect(detail.sameTable[0]).toMatchObject({ status: "accepted", positionLabel: "Sto 7", guestName: "Marija Gost" });
  });

  test("another venue's reservation, a wrong panel and an Urednik read null", async () => {
    const env = await world();
    await openForm(env);
    const { token: ana } = await signedIn(env, "Ana", "246");
    const { token: petar } = await signedIn(env, "Petar", "246", "b");
    const { reservationId } = await guestRequest(env);

    expect(await detailOf(env, ana, reservationId)).not.toBeNull(); // baseline
    expect(await detailOf(env, petar, reservationId, { venue: "b" })).toBeNull(); // venue b's waiter, venue a's row
    expect(await detailOf(env, petar, reservationId)).toBeNull(); // venue b's token at venue a's panel
    expect(await detailOf(env, undefined, reservationId, { venue: "b", who: as(env.t, env.w.otherOwnerId) })).toBeNull();
    expect(await detailOf(env, BOGUS_TOKEN, reservationId)).toBeNull();
    expect(await detailOf(env, undefined, reservationId)).toBeNull();
    expect(await detailOf(env, undefined, reservationId, { who: as(env.t, env.w.editorId) })).toBeNull();
    expect(await detailOf(env, undefined, reservationId, { who: as(env.t, env.w.outsiderId) })).toBeNull();
  });
});

// =============================================================================
// 3. the acceptance flow: submit → accept → bind → arrived → occupancy
// =============================================================================

describe("the flow: submit → accept → bind a table → guests arrived", () => {
  test("occupancy module OFF: the reservation is realized and the table is NOT marked", async () => {
    const env = await world();
    await openForm(env);
    const { staffId, token: ana } = await signedIn(env, "Ana", "246");
    const sto = await addPosition(env, "Sto 7");
    const { reservationId } = await guestRequest(env);

    vi.setSystemTime(T0 + MINUTE);
    expect(await accept(env, ana, reservationId)).toEqual({ ok: true, status: "accepted", changed: true });
    vi.setSystemTime(T0 + 2 * MINUTE);
    expect(await bind(env, ana, reservationId, sto)).toEqual({ ok: true, status: "accepted", changed: true });
    vi.setSystemTime(T0 + 3 * MINUTE);
    expect(await arrive(env, ana, reservationId)).toEqual({ ok: true, status: "arrived", changed: true });

    expect(await mustRow(env, reservationId)).toMatchObject({
      status: "arrived",
      positionId: sto,
      positionLabel: "Sto 7",
      decidedAt: T0 + MINUTE,
      decidedByStaffId: staffId,
      boundAt: T0 + 2 * MINUTE,
      boundByStaffId: staffId,
      arrivedAt: T0 + 3 * MINUTE,
      arrivedByStaffId: staffId,
    });
    expect(await occupancyRows(env)).toEqual([]);
    expect(await env.t.query(api.menuWaiter.occupancy, panel(env, ana))).toEqual({ off: true });
  });

  test("occupancy module ON: only the arrival marks the bound table occupied, by the waiter who received the guests", async () => {
    const env = await world();
    await openForm(env);
    await occupancyModule(env, true);
    const { staffId, token: ana } = await signedIn(env, "Ana", "246");
    const sto = await addPosition(env, "Sto 7");
    const { reservationId } = await guestRequest(env);

    vi.setSystemTime(T0 + MINUTE);
    await accept(env, ana, reservationId);
    expect(await occupancyRows(env)).toEqual([]); // accepted: nothing yet
    vi.setSystemTime(T0 + 2 * MINUTE);
    await bind(env, ana, reservationId, sto);
    expect(await occupancyRows(env)).toEqual([]); // bound: still nothing, the guests are not here
    vi.setSystemTime(T0 + 3 * MINUTE);
    expect(await arrive(env, ana, reservationId)).toEqual({ ok: true, status: "arrived", changed: true });

    const rows = await occupancyRows(env);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      menuServiceId: env.w.a.menuServiceId,
      positionId: sto,
      state: "occupied",
      updatedAt: T0 + 3 * MINUTE,
      updatedByStaffId: staffId,
    });
    expect(rows[0].updatedByUserId).toBeUndefined();
    // The floor reads it back with the waiter's name.
    expect(await env.t.query(api.menuWaiter.occupancy, panel(env, ana))).toEqual({
      off: false,
      states: [{ positionId: sto, state: "occupied", updatedAt: T0 + 3 * MINUTE, updatedBy: "Ana" }],
    });
  });

  test("an Owner with their account does the same, recorded as a user", async () => {
    const env = await world();
    await openForm(env);
    await occupancyModule(env, true);
    const owner = as(env.t, env.w.ownerId);
    const sto = await addPosition(env, "Sto 7");
    const { reservationId } = await guestRequest(env);
    expect(await accept(env, undefined, reservationId, { who: owner })).toEqual({ ok: true, status: "accepted", changed: true });
    expect(await bind(env, undefined, reservationId, sto, { who: owner })).toEqual({ ok: true, status: "accepted", changed: true });
    expect(await arrive(env, undefined, reservationId, undefined, { who: owner })).toEqual({
      ok: true,
      status: "arrived",
      changed: true,
    });
    const row = await mustRow(env, reservationId);
    expect(row).toMatchObject({ decidedByUserId: env.w.ownerId, boundByUserId: env.w.ownerId, arrivedByUserId: env.w.ownerId });
    expect(row.decidedByStaffId).toBeUndefined();
    expect(row.boundByStaffId).toBeUndefined();
    expect(row.arrivedByStaffId).toBeUndefined();
    const [occupancy] = await occupancyRows(env);
    expect(occupancy).toMatchObject({ positionId: sto, state: "occupied", updatedByUserId: env.w.ownerId });
    expect(occupancy.updatedByStaffId).toBeUndefined();
  });

  test("markArrived with a positionId on an UNBOUND accepted reservation binds it (module on: and marks it)", async () => {
    const env = await world();
    await openForm(env);
    await occupancyModule(env, true);
    const { staffId, token: ana } = await signedIn(env, "Ana", "246");
    const sto = await addPosition(env, "Sto 3");
    const { reservationId } = await guestRequest(env);
    await accept(env, ana, reservationId);
    expect((await mustRow(env, reservationId)).positionId).toBeUndefined();

    vi.setSystemTime(T0 + MINUTE);
    expect(await arrive(env, ana, reservationId, sto)).toEqual({ ok: true, status: "arrived", changed: true });
    expect(await mustRow(env, reservationId)).toMatchObject({
      status: "arrived",
      positionId: sto,
      positionLabel: "Sto 3",
      boundAt: T0 + MINUTE,
      boundByStaffId: staffId,
      arrivedByStaffId: staffId,
    });
    expect(await occupancyRows(env)).toMatchObject([{ positionId: sto, state: "occupied", updatedByStaffId: staffId }]);
  });

  test("markArrived with a positionId, module OFF: the reservation is bound but the table is not marked", async () => {
    const env = await world();
    await openForm(env);
    const { token: ana } = await signedIn(env, "Ana", "246");
    const sto = await addPosition(env, "Sto 3");
    const { reservationId } = await guestRequest(env);
    await accept(env, ana, reservationId);
    expect(await arrive(env, ana, reservationId, sto)).toEqual({ ok: true, status: "arrived", changed: true });
    expect(await mustRow(env, reservationId)).toMatchObject({ status: "arrived", positionId: sto });
    expect(await occupancyRows(env)).toEqual([]);
  });

  test("a table chosen at arrival replaces the bound one: only the chosen table is marked", async () => {
    const env = await world();
    await openForm(env);
    await occupancyModule(env, true);
    const { token: ana } = await signedIn(env, "Ana", "246");
    const first = await addPosition(env, "Sto 1");
    const second = await addPosition(env, "Sto 2");
    const { reservationId } = await guestRequest(env);
    await accept(env, ana, reservationId);
    await bind(env, ana, reservationId, first);
    expect(await arrive(env, ana, reservationId, second)).toEqual({ ok: true, status: "arrived", changed: true });
    expect(await mustRow(env, reservationId)).toMatchObject({ positionId: second, positionLabel: "Sto 2" });
    expect(await occupancyRows(env)).toMatchObject([{ positionId: second, state: "occupied" }]);
  });

  test("an existing mark is replaced by the arrival; an occupied one is left as it was; a repeated arrival changes nothing", async () => {
    const env = await world();
    await openForm(env);
    await occupancyModule(env, true);
    const { staffId, token: ana } = await signedIn(env, "Ana", "246");
    const reservedTable = await addPosition(env, "Sto 1");
    const busyTable = await addPosition(env, "Sto 2");
    await env.t.mutation(api.menuWaiter.setOccupancy, { ...panel(env, ana), positionId: reservedTable, state: "reserved" });
    vi.setSystemTime(T0 + MINUTE);
    await env.t.mutation(api.menuWaiter.setOccupancy, { ...panel(env, ana), positionId: busyTable, state: "occupied" });

    const first = await guestRequest(env);
    const second = await guestRequest(env);
    for (const [reservationId, table] of [
      [first.reservationId, reservedTable],
      [second.reservationId, busyTable],
    ] as const) {
      await accept(env, ana, reservationId);
      await bind(env, ana, reservationId, table);
    }

    vi.setSystemTime(T0 + 5 * MINUTE);
    await arrive(env, ana, first.reservationId);
    await arrive(env, ana, second.reservationId);
    const rows = await occupancyRows(env);
    expect(rows).toHaveLength(2); // one row per table, never a second one
    const byPosition = new Map(rows.map((row) => [row.positionId, row]));
    expect(byPosition.get(reservedTable)).toMatchObject({ state: "occupied", updatedAt: T0 + 5 * MINUTE, updatedByStaffId: staffId });
    // Already occupied: untouched (its stamp is the one from the hand marking).
    expect(byPosition.get(busyTable)).toMatchObject({ state: "occupied", updatedAt: T0 + MINUTE });

    // A repeated arrival does not mark the table again after the waiter freed it.
    await env.t.mutation(api.menuWaiter.setOccupancy, { ...panel(env, ana), positionId: reservedTable, state: "free" });
    vi.setSystemTime(T0 + 9 * MINUTE);
    expect(await arrive(env, ana, first.reservationId)).toEqual({ ok: true, status: "arrived", changed: false });
    expect((await occupancyRows(env)).find((row) => row.positionId === reservedTable)?.state).toBe("free");
  });

  test("an arrival that is refused marks nothing and binds nothing", async () => {
    const env = await world();
    await openForm(env);
    await occupancyModule(env, true);
    const { token: ana } = await signedIn(env, "Ana", "246");
    const sto = await addPosition(env, "Sto 1");
    const archived = await addPosition(env, "Stari sto", { active: false });
    const foreign = await addPosition(env, "Sto B1", { venue: "b" });

    // A request nobody accepted yet.
    const fresh = await guestRequest(env);
    expect(await arrive(env, ana, fresh.reservationId, sto)).toEqual({
      ok: false,
      code: RESERVATION_ERROR.invalidTransition,
      status: "new",
    });
    expect(await mustRow(env, fresh.reservationId)).toMatchObject({ status: "new" });
    expect((await mustRow(env, fresh.reservationId)).positionId).toBeUndefined();

    // An accepted one with a table that is archived, another venue's, or gone.
    const accepted = await guestRequest(env);
    await accept(env, ana, accepted.reservationId);
    const gone = await addPosition(env, "Privremeni sto");
    await env.t.run(async (ctx) => await ctx.db.delete(gone));
    for (const positionId of [archived, foreign, gone]) {
      expect(await arrive(env, ana, accepted.reservationId, positionId)).toEqual({
        ok: false,
        code: RESERVATION_ERROR.positionInvalid,
        status: "accepted",
      });
    }
    const row = await mustRow(env, accepted.reservationId);
    expect(row.status).toBe("accepted");
    expect(row.positionId).toBeUndefined();
    expect(row.arrivedAt).toBeUndefined();

    // A declined, a cancelled one.
    const declined = await guestRequest(env);
    await decline(env, ana, declined.reservationId);
    expect(await arrive(env, ana, declined.reservationId)).toMatchObject({ ok: false, code: RESERVATION_ERROR.invalidTransition });
    expect(await occupancyRows(env)).toEqual([]);
  });
});

// =============================================================================
// 4. only staff bind tables
// =============================================================================

describe("bindPosition", () => {
  test("refused unless the reservation is ACCEPTED (new, proposed, declined, cancelled, arrived)", async () => {
    const env = await world();
    await openForm(env);
    const { token: ana } = await signedIn(env, "Ana", "246");
    const sto = await addPosition(env, "Sto 7");
    const refusal = (status: Status) => ({ ok: false, code: RESERVATION_ERROR.invalidTransition, status });

    const fresh = await guestRequest(env);
    expect(await bind(env, ana, fresh.reservationId, sto)).toEqual(refusal("new"));

    const proposed = await guestRequest(env);
    await propose(env, ana, proposed.reservationId, belgrade("2026-10-22T21:00"));
    expect(await bind(env, ana, proposed.reservationId, sto)).toEqual(refusal("change_proposed"));

    const declined = await guestRequest(env);
    await decline(env, ana, declined.reservationId);
    expect(await bind(env, ana, declined.reservationId, sto)).toEqual(refusal("declined"));

    const cancelled = await guestRequest(env);
    await accept(env, ana, cancelled.reservationId);
    await cancelByStaff(env, ana, cancelled.reservationId);
    expect(await bind(env, ana, cancelled.reservationId, sto)).toEqual(refusal("cancelled"));

    const arrived = await guestRequest(env);
    await accept(env, ana, arrived.reservationId);
    await arrive(env, ana, arrived.reservationId);
    expect(await bind(env, ana, arrived.reservationId, sto)).toEqual(refusal("arrived"));
    // Unbinding is refused the same way.
    expect(await bind(env, ana, fresh.reservationId, null)).toEqual(refusal("new"));

    for (const { reservationId } of [fresh, proposed, declined, cancelled, arrived]) {
      expect((await mustRow(env, reservationId)).positionId).toBeUndefined();
    }
  });

  test("a table of another venue, an archived table or a deleted one → reservation/position_invalid; nothing is written", async () => {
    const env = await world();
    await openForm(env);
    const { token: ana } = await signedIn(env, "Ana", "246");
    const { reservationId } = await guestRequest(env);
    await accept(env, ana, reservationId);
    const foreign = await addPosition(env, "Sto B1", { venue: "b" });
    const archived = await addPosition(env, "Stari sto", { active: false });
    const gone = await addPosition(env, "Privremeni sto");
    await env.t.run(async (ctx) => await ctx.db.delete(gone));
    const before = await mustRow(env, reservationId);

    for (const positionId of [foreign, archived, gone]) {
      expect(await bind(env, ana, reservationId, positionId)).toEqual({
        ok: false,
        code: RESERVATION_ERROR.positionInvalid,
        status: "accepted",
      });
    }
    expect(await mustRow(env, reservationId)).toEqual(before);
  });

  test("bind, bind the same again, change, and unbind with null", async () => {
    const env = await world();
    await openForm(env);
    const { staffId, token: ana } = await signedIn(env, "Ana", "246");
    const { token: marko } = await signedIn(env, "Marko", "135");
    const first = await addPosition(env, "Sto 1");
    const second = await addPosition(env, "Sto 2");
    const { reservationId } = await guestRequest(env);
    await accept(env, ana, reservationId);

    vi.setSystemTime(T0 + MINUTE);
    expect(await bind(env, ana, reservationId, first)).toEqual({ ok: true, status: "accepted", changed: true });
    expect(await mustRow(env, reservationId)).toMatchObject({ positionId: first, positionLabel: "Sto 1", boundAt: T0 + MINUTE, boundByStaffId: staffId });

    // The same table again: nothing is rewritten.
    vi.setSystemTime(T0 + 2 * MINUTE);
    expect(await bind(env, marko, reservationId, first)).toEqual({ ok: true, status: "accepted", changed: false });
    expect(await mustRow(env, reservationId)).toMatchObject({ boundAt: T0 + MINUTE, boundByStaffId: staffId });

    // Another table, by someone else.
    vi.setSystemTime(T0 + 3 * MINUTE);
    expect(await bind(env, marko, reservationId, second)).toEqual({ ok: true, status: "accepted", changed: true });
    const moved = await mustRow(env, reservationId);
    expect(moved).toMatchObject({ positionId: second, positionLabel: "Sto 2", boundAt: T0 + 3 * MINUTE });
    expect(moved.boundByStaffId).not.toBe(staffId);

    // Unbind with null; a second null changes nothing.
    vi.setSystemTime(T0 + 4 * MINUTE);
    expect(await bind(env, ana, reservationId, null)).toEqual({ ok: true, status: "accepted", changed: true });
    const unbound = await mustRow(env, reservationId);
    expect(unbound.positionId).toBeUndefined();
    expect(unbound.positionLabel).toBeUndefined();
    expect(unbound.status).toBe("accepted");
    expect(await bind(env, ana, reservationId, null)).toEqual({ ok: true, status: "accepted", changed: false });
    // The panel row has no table any more.
    expect(must(await forPanelOf(env, ana)).rows[0]).toMatchObject({ positionId: null, positionLabel: null });
  });

  test("an Urednik, finance, view-only, an outsider and an anonymous caller get staff/signed_out; nothing is bound", async () => {
    const env = await world();
    await openForm(env);
    const { token: ana } = await signedIn(env, "Ana", "246");
    const sto = await addPosition(env, "Sto 7");
    const { reservationId } = await guestRequest(env);
    await accept(env, ana, reservationId);

    for (const userId of [env.w.editorId, env.w.financeId, env.w.viewOnlyId, env.w.outsiderId, env.w.otherOwnerId]) {
      expect(await bind(env, undefined, reservationId, sto, { who: as(env.t, userId) })).toEqual(SIGNED_OUT);
      expect(await arrive(env, undefined, reservationId, sto, { who: as(env.t, userId) })).toEqual(SIGNED_OUT);
    }
    expect(await bind(env, undefined, reservationId, sto)).toEqual(SIGNED_OUT);
    expect(await bind(env, BOGUS_TOKEN, reservationId, sto)).toEqual(SIGNED_OUT);
    expect(await bind(env, BOGUS_TOKEN, reservationId, sto, { who: as(env.t, env.w.ownerId) })).toEqual(SIGNED_OUT);
    const row = await mustRow(env, reservationId);
    expect(row.positionId).toBeUndefined();
    expect(row.status).toBe("accepted");
  });

  test("the guest has no way to bind: the reservation of a guest-only flow never has a table", async () => {
    const env = await world();
    await openForm(env);
    const { reservationId, args } = await guestRequest(env);
    await env.t.mutation(api.menuReservations.cancelByToken, { slug: SLUG_A, token: args.cancelToken });
    const row = await mustRow(env, reservationId);
    expect(row.positionId).toBeUndefined();
    expect(row.boundAt).toBeUndefined();
    expect(row.boundByStaffId).toBeUndefined();
    expect(row.boundByUserId).toBeUndefined();
  });
});

// =============================================================================
// 5. transitions
// =============================================================================

describe("transitions", () => {
  test("accept: new → accepted (stamped), again → ok and unchanged", async () => {
    const env = await world();
    await openForm(env);
    const { staffId, token: ana } = await signedIn(env, "Ana", "246");
    const { reservationId } = await guestRequest(env);
    vi.setSystemTime(T0 + MINUTE);
    expect(await accept(env, ana, reservationId)).toEqual({ ok: true, status: "accepted", changed: true });
    expect(await mustRow(env, reservationId)).toMatchObject({ status: "accepted", decidedAt: T0 + MINUTE, decidedByStaffId: staffId, updatedAt: T0 + MINUTE });

    vi.setSystemTime(T0 + 5 * MINUTE);
    expect(await accept(env, ana, reservationId)).toEqual({ ok: true, status: "accepted", changed: false });
    expect(await mustRow(env, reservationId)).toMatchObject({ decidedAt: T0 + MINUTE, updatedAt: T0 + MINUTE });
    // Accepting is not audited (the row carries who and when).
    expect(await auditRows(env, "reservation.accepted")).toEqual([]);
  });

  test("decline: new → declined, audited; again → ok; accepted cannot be declined", async () => {
    const env = await world();
    await openForm(env);
    const { staffId, token: ana } = await signedIn(env, "Ana", "246");
    const { args, reservationId } = await guestRequest(env);
    vi.setSystemTime(T0 + MINUTE);
    expect(await decline(env, ana, reservationId)).toEqual({ ok: true, status: "declined", changed: true });
    expect(await mustRow(env, reservationId)).toMatchObject({ status: "declined", decidedAt: T0 + MINUTE, decidedByStaffId: staffId });

    const audit = await auditRows(env, "reservation.declined");
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      menuServiceId: env.w.a.menuServiceId,
      actorKind: "staff",
      actorRef: staffId,
      entityType: "reservation",
      entityKey: reservationId,
      details: { from: "new", by: "staff" },
      createdAt: T0 + MINUTE,
    });
    expect(await linkView(env, args.cancelToken)).toMatchObject({ status: "declined", canCancel: false });

    expect(await decline(env, ana, reservationId)).toEqual({ ok: true, status: "declined", changed: false });
    expect(await auditRows(env, "reservation.declined")).toHaveLength(1);
    expect(await accept(env, ana, reservationId)).toEqual({ ok: false, code: RESERVATION_ERROR.invalidTransition, status: "declined" });

    const accepted = await guestRequest(env);
    await accept(env, ana, accepted.reservationId);
    expect(await decline(env, ana, accepted.reservationId)).toEqual({
      ok: false,
      code: RESERVATION_ERROR.invalidTransition,
      status: "accepted",
    });
  });

  test("a proposal the guest did not take can be declined", async () => {
    const env = await world();
    await openForm(env);
    const { token: ana } = await signedIn(env, "Ana", "246");
    const { reservationId } = await guestRequest(env);
    await propose(env, ana, reservationId, belgrade("2026-10-22T21:00"));
    expect(await decline(env, ana, reservationId)).toEqual({ ok: true, status: "declined", changed: true });
    expect((await auditRows(env, "reservation.declined"))[0].details).toMatchObject({ from: "change_proposed", by: "staff" });
  });

  test("proposeChange: sets proposedAt and a cleaned proposalNote; the guest sees it, the requested time stays", async () => {
    const env = await world();
    await openForm(env);
    const { staffId, token: ana } = await signedIn(env, "Ana", "246");
    const { args, reservationId } = await guestRequest(env);
    const proposedAt = belgrade("2026-10-22T21:00");
    vi.setSystemTime(T0 + MINUTE);

    expect(await propose(env, ana, reservationId, proposedAt, "  Imamo   sto u 21:00 ")).toEqual({
      ok: true,
      status: "change_proposed",
      changed: true,
    });
    expect(await mustRow(env, reservationId)).toMatchObject({
      status: "change_proposed",
      requestedAt: THU_19,
      proposedAt,
      proposalNote: "Imamo sto u 21:00",
      decidedAt: T0 + MINUTE,
      decidedByStaffId: staffId,
    });
    // The cancel link shows the proposal while it waits, and the guest may still cancel.
    expect(await linkView(env, args.cancelToken)).toEqual({
      businessName: "Kafana kod Mike",
      status: "change_proposed",
      requestedAt: THU_19,
      partySize: 4,
      proposedAt,
      proposalNote: "Imamo sto u 21:00",
      canCancel: true,
    });
    // The panel lists it (any date) with the proposed time.
    expect(must(await forPanelOf(env, ana)).rows).toMatchObject([{ id: reservationId, status: "change_proposed", proposedAt }]);

    // Proposing again replaces the earlier proposal (and an empty note clears the message).
    const later = belgrade("2026-10-22T22:00");
    expect(await propose(env, ana, reservationId, later, "   ")).toEqual({ ok: true, status: "change_proposed", changed: true });
    const replaced = await mustRow(env, reservationId);
    expect(replaced.proposedAt).toBe(later);
    expect(replaced.proposalNote).toBeUndefined();
  });

  test("proposeChange: a past time → in_past, over 60 days → too_far, a note over 300 characters → invalid_input; nothing is written", async () => {
    const env = await world();
    await openForm(env);
    const { token: ana } = await signedIn(env, "Ana", "246");
    const { reservationId } = await guestRequest(env);
    const before = await mustRow(env, reservationId);

    expect(await propose(env, ana, reservationId, T0 - HOUR)).toEqual({ ok: false, code: RESERVATION_ERROR.inPast });
    expect(await propose(env, ana, reservationId, T0)).toEqual({ ok: false, code: RESERVATION_ERROR.inPast }); // right now is past
    expect(await propose(env, ana, reservationId, T0 + 60 * DAY + 1)).toEqual({ ok: false, code: RESERVATION_ERROR.tooFar });
    expect(await propose(env, ana, reservationId, T0 + 400 * DAY)).toEqual({ ok: false, code: RESERVATION_ERROR.tooFar });
    expect(await propose(env, ana, reservationId, belgrade("2026-10-22T21:00"), "x".repeat(301))).toEqual({
      ok: false,
      code: RESERVATION_ERROR.invalidInput,
    });
    expect(await mustRow(env, reservationId)).toEqual(before);

    // The edges are fine: exactly 60 days ahead, and a 300-character message.
    expect(await propose(env, ana, reservationId, T0 + 60 * DAY, "x".repeat(300))).toEqual({
      ok: true,
      status: "change_proposed",
      changed: true,
    });
    expect((await mustRow(env, reservationId)).proposalNote).toHaveLength(300);
  });

  test("proposeChange from an accepted, declined or cancelled reservation → invalid_transition", async () => {
    const env = await world();
    await openForm(env);
    const { token: ana } = await signedIn(env, "Ana", "246");
    const proposedAt = belgrade("2026-10-22T21:00");
    const accepted = await guestRequest(env);
    await accept(env, ana, accepted.reservationId);
    expect(await propose(env, ana, accepted.reservationId, proposedAt)).toEqual({
      ok: false,
      code: RESERVATION_ERROR.invalidTransition,
      status: "accepted",
    });
    const declined = await guestRequest(env);
    await decline(env, ana, declined.reservationId);
    expect(await propose(env, ana, declined.reservationId, proposedAt)).toMatchObject({ ok: false, status: "declined" });
    expect((await mustRow(env, accepted.reservationId)).proposedAt).toBeUndefined();
  });

  test("acceptProposal: the proposed time becomes the reservation's time", async () => {
    const env = await world();
    await openForm(env);
    const { staffId, token: ana } = await signedIn(env, "Ana", "246");
    const { args, reservationId } = await guestRequest(env);
    const proposedAt = belgrade("2026-10-22T21:00");
    await propose(env, ana, reservationId, proposedAt, "Imamo sto u 21:00");

    vi.setSystemTime(T0 + 10 * MINUTE);
    expect(await acceptProposal(env, ana, reservationId, { expectedStatus: "change_proposed" })).toEqual({
      ok: true,
      status: "accepted",
      changed: true,
    });
    expect(await mustRow(env, reservationId)).toMatchObject({
      status: "accepted",
      requestedAt: proposedAt,
      decidedAt: T0 + 10 * MINUTE,
      decidedByStaffId: staffId,
    });
    // The guest's link shows the new time and no pending proposal any more.
    expect(await linkView(env, args.cancelToken)).toMatchObject({
      status: "accepted",
      requestedAt: proposedAt,
      proposedAt: null,
      proposalNote: null,
      canCancel: true,
    });
    expect(must(await forPanelOf(env, ana)).rows).toMatchObject([{ id: reservationId, status: "accepted", requestedAt: proposedAt }]);
    // K25 (main agent): the accepted proposal is cleared from the row, so no screen shows it as open.
    expect(must(await forPanelOf(env, ana)).rows[0]).toMatchObject({ proposedAt: null });
    const row = await mustRow(env, reservationId);
    expect(row.proposedAt).toBeUndefined();
    expect(row.proposalNote).toBeUndefined();

    // Only a pending proposal can be accepted.
    expect(await acceptProposal(env, ana, reservationId)).toEqual({ ok: false, code: RESERVATION_ERROR.invalidTransition, status: "accepted" });
    const fresh = await guestRequest(env);
    expect(await acceptProposal(env, ana, fresh.reservationId)).toEqual({
      ok: false,
      code: RESERVATION_ERROR.invalidTransition,
      status: "new",
    });
  });

  test("cancelByStaff: accepted or proposed → cancelled by staff and audited; a new request is declined instead", async () => {
    const env = await world();
    await openForm(env);
    const { staffId, token: ana } = await signedIn(env, "Ana", "246");
    const accepted = await guestRequest(env);
    const proposed = await guestRequest(env);
    const fresh = await guestRequest(env);
    await accept(env, ana, accepted.reservationId);
    await propose(env, ana, proposed.reservationId, belgrade("2026-10-22T21:00"));

    vi.setSystemTime(T0 + 7 * MINUTE);
    expect(await cancelByStaff(env, ana, accepted.reservationId)).toEqual({ ok: true, status: "cancelled", changed: true });
    expect(await mustRow(env, accepted.reservationId)).toMatchObject({
      status: "cancelled",
      cancelledBy: "staff",
      cancelledAt: T0 + 7 * MINUTE,
      cancelledByStaffId: staffId,
    });
    expect(await cancelByStaff(env, ana, proposed.reservationId)).toEqual({ ok: true, status: "cancelled", changed: true });

    const audit = await auditRows(env, "reservation.cancelled");
    expect(audit).toHaveLength(2);
    expect(audit.find((row) => row.entityKey === accepted.reservationId)).toMatchObject({
      actorKind: "staff",
      actorRef: staffId,
      entityType: "reservation",
      details: { from: "accepted", by: "staff" },
    });
    expect(audit.find((row) => row.entityKey === proposed.reservationId)?.details).toMatchObject({ from: "change_proposed", by: "staff" });

    // The detail names who cancelled; the panel shows the row in the recently cancelled strip.
    expect(must(await detailOf(env, ana, accepted.reservationId)).reservation).toMatchObject({ cancelledByName: "Ana", cancelledBy: "staff" });
    expect(must(await forPanelOf(env, ana)).rows.filter((row) => row.status === "cancelled")).toHaveLength(2);

    // Cancelling again is fine and silent.
    expect(await cancelByStaff(env, ana, accepted.reservationId)).toEqual({ ok: true, status: "cancelled", changed: false });
    expect(await auditRows(env, "reservation.cancelled")).toHaveLength(2);

    // A NEW request is declined, not cancelled.
    expect(await cancelByStaff(env, ana, fresh.reservationId)).toEqual({
      ok: false,
      code: RESERVATION_ERROR.invalidTransition,
      status: "new",
    });
    expect((await mustRow(env, fresh.reservationId)).status).toBe("new");
  });

  test("cancelByStaff on a realized, declined or guest-cancelled reservation", async () => {
    const env = await world();
    await openForm(env);
    const { token: ana } = await signedIn(env, "Ana", "246");
    const arrived = await guestRequest(env);
    await accept(env, ana, arrived.reservationId);
    await arrive(env, ana, arrived.reservationId);
    expect(await cancelByStaff(env, ana, arrived.reservationId)).toEqual({
      ok: false,
      code: RESERVATION_ERROR.notCancellable,
      status: "arrived",
    });

    const declined = await guestRequest(env);
    await decline(env, ana, declined.reservationId);
    expect(await cancelByStaff(env, ana, declined.reservationId)).toMatchObject({ ok: false, code: RESERVATION_ERROR.notCancellable });

    const byGuest = await guestRequest(env);
    await env.t.mutation(api.menuReservations.cancelByToken, { slug: SLUG_A, token: byGuest.args.cancelToken });
    expect(await cancelByStaff(env, ana, byGuest.reservationId)).toEqual({ ok: true, status: "cancelled", changed: false });
    // The guest's cancellation stays the guest's.
    expect(await mustRow(env, byGuest.reservationId)).toMatchObject({ cancelledBy: "guest" });
  });

  test("expectedStatus guard: when the reservation moved meanwhile, every action answers status_changed and writes nothing", async () => {
    const env = await world();
    await openForm(env);
    const { token: ana } = await signedIn(env, "Ana", "246");
    const sto = await addPosition(env, "Sto 7");
    const { args, reservationId } = await guestRequest(env);
    // The waiter's screen still shows "new"; the guest cancelled meanwhile.
    expect(await env.t.mutation(api.menuReservations.cancelByToken, { slug: SLUG_A, token: args.cancelToken })).toEqual({
      ok: true,
      status: "cancelled",
    });
    const before = await mustRow(env, reservationId);
    const auditBefore = (await auditAll(env)).length;
    const stale = { ok: false, code: RESERVATION_ERROR.statusChanged, status: "cancelled" };
    const o: ActOpts = { expectedStatus: "new" };

    expect(await accept(env, ana, reservationId, o)).toEqual(stale);
    expect(await decline(env, ana, reservationId, o)).toEqual(stale);
    expect(await propose(env, ana, reservationId, belgrade("2026-10-22T21:00"), "Imamo sto", o)).toEqual(stale);
    expect(await acceptProposal(env, ana, reservationId, o)).toEqual(stale);
    expect(await cancelByStaff(env, ana, reservationId, o)).toEqual(stale);
    expect(await bind(env, ana, reservationId, sto, o)).toEqual(stale);
    expect(await arrive(env, ana, reservationId, sto, o)).toEqual(stale);

    expect(await mustRow(env, reservationId)).toEqual(before);
    expect((await auditAll(env)).length).toBe(auditBefore);
    expect(await occupancyRows(env)).toEqual([]);
  });

  test("expectedStatus that still matches lets the action through", async () => {
    const env = await world();
    await openForm(env);
    const { token: ana } = await signedIn(env, "Ana", "246");
    const { reservationId } = await guestRequest(env);
    expect(await accept(env, ana, reservationId, { expectedStatus: "new" })).toEqual({ ok: true, status: "accepted", changed: true });
    // Now the screen is stale the other way round.
    expect(await decline(env, ana, reservationId, { expectedStatus: "new" })).toEqual({
      ok: false,
      code: RESERVATION_ERROR.statusChanged,
      status: "accepted",
    });
    expect(await decline(env, ana, reservationId, { expectedStatus: "accepted" })).toEqual({
      ok: false,
      code: RESERVATION_ERROR.invalidTransition,
      status: "accepted",
    });
  });

  test("the waiter's action bucket (60 a minute per session) answers staff/rate_limited", async () => {
    const env = await world();
    await openForm(env);
    const { token: ana } = await signedIn(env, "Ana", "246");
    const { reservationId } = await guestRequest(env);
    await accept(env, ana, reservationId); // 1
    for (let i = 0; i < 59; i += 1) await accept(env, ana, reservationId);
    expect(await accept(env, ana, reservationId)).toEqual({ ok: false, code: STAFF_ERROR.rateLimited });
    // Another waiter's session has its own bucket.
    const { token: marko } = await signedIn(env, "Marko", "135");
    expect(await accept(env, marko, reservationId)).toEqual({ ok: true, status: "accepted", changed: false });
  });
});

// =============================================================================
// 6. lateness is the client's arithmetic; nothing changes on its own
// =============================================================================

describe("lateness and time", () => {
  test("holdMinutes from forPanel drives reservationTiming: u-terminu just before the hold, kasni at it; no status ever changes by itself", async () => {
    const env = await world();
    await openForm(env);
    const { token: ana } = await signedIn(env, "Ana", "246");
    const { reservationId } = await guestRequest(env);
    await accept(env, ana, reservationId);
    await env.owner.mutation(api.menuSettings.setReservationHold, { menuServiceId: env.w.a.menuServiceId, holdMinutes: 20 });

    const panelNow = must(await forPanelOf(env, ana));
    expect(panelNow.holdMinutes).toBe(20);
    const row = must(panelNow.rows.find((r) => r.id === reservationId));
    const hold = panelNow.holdMinutes;

    // The client's arithmetic (lib/menu/reservation-late.ts) on the values the query returned.
    expect(reservationTiming(row.requestedAt, hold, row.requestedAt - 3 * HOUR).phase).toBe("kasnije");
    expect(reservationTiming(row.requestedAt, hold, row.requestedAt - HOUR).phase).toBe("uskoro");
    expect(reservationTiming(row.requestedAt, hold, row.requestedAt - 1)).toEqual({ phase: "uskoro", lateSeconds: null });
    expect(reservationTiming(row.requestedAt, hold, row.requestedAt)).toEqual({ phase: "u-terminu", lateSeconds: 0 });
    expect(reservationTiming(row.requestedAt, hold, row.requestedAt + hold * MINUTE - 1000).phase).toBe("u-terminu");
    expect(reservationTiming(row.requestedAt, hold, row.requestedAt + hold * MINUTE)).toEqual({ phase: "kasni", lateSeconds: hold * 60 });
    // With the default 15 the same moment is already red: the hold really is the venue's own.
    expect(reservationTiming(row.requestedAt, 15, row.requestedAt + 16 * MINUTE).phase).toBe("kasni");
    expect(reservationTiming(row.requestedAt, hold, row.requestedAt + 16 * MINUTE).phase).toBe("u-terminu");

    // Hours past the term, with every scheduled function run: the status is still "accepted".
    const farPast = row.requestedAt + 5 * HOUR;
    vi.advanceTimersByTime(farPast - Date.now());
    await env.t.finishAllScheduledFunctions(vi.runAllTimers);
    await env.t.mutation(internal.menuWaiter.sweepExpiredSessions, {});
    await env.t.mutation(internal.menuGuest.sweepExpiredSessions, {});
    expect(Date.now()).toBeGreaterThanOrEqual(farPast);
    expect(await forPanelOf(env, ana)).toBeNull(); // the 12 h staff session really expired: the sweeps DID run
    expect(Date.now() - T0).toBeGreaterThan(STAFF_SESSION_MS);

    const stored = await mustRow(env, reservationId);
    expect(stored.status).toBe("accepted");
    expect(stored.cancelledAt).toBeUndefined();
    expect(stored.arrivedAt).toBeUndefined();
    expect(stored.updatedAt).toBe(T0); // untouched since the accept
    expect(await auditRows(env, "reservation.cancelled")).toEqual([]);
    const owner = as(env.t, env.w.ownerId);
    const later = must(await forPanelOf(env, undefined, { who: owner, fromMs: Date.now() - 12 * HOUR }));
    expect(later.rows).toMatchObject([{ id: reservationId, status: "accepted" }]);
    expect(reservationTiming(row.requestedAt, later.holdMinutes, Date.now()).phase).toBe("kasni");
  });

  test("an unanswered request and an unbound accepted one also stay as they are for days", async () => {
    const env = await world();
    await openForm(env);
    await occupancyModule(env, true);
    const { token: ana } = await signedIn(env, "Ana", "246");
    const fresh = await guestRequest(env);
    const accepted = await guestRequest(env);
    await accept(env, ana, accepted.reservationId);
    const sto = await addPosition(env, "Sto 7");
    await bind(env, ana, accepted.reservationId, sto);

    vi.advanceTimersByTime(3 * DAY);
    await env.t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await mustRow(env, fresh.reservationId)).status).toBe("new");
    expect(await mustRow(env, accepted.reservationId)).toMatchObject({ status: "accepted", positionId: sto });
    expect(await occupancyRows(env)).toEqual([]); // the table never became occupied without a person
  });
});

// =============================================================================
// 7. tenant isolation
// =============================================================================

describe("tenant isolation", () => {
  test("staff of venue b cannot act on, bind to, receive or read venue a's reservation", async () => {
    const env = await world();
    await openForm(env);
    await occupancyModule(env, true);
    const { token: ana } = await signedIn(env, "Ana", "246");
    const { token: petar } = await signedIn(env, "Petar", "246", "b");
    const sto = await addPosition(env, "Sto 7");
    const stoB = await addPosition(env, "Sto B1", { venue: "b" });
    const { reservationId } = await guestRequest(env);
    await accept(env, ana, reservationId);
    await bind(env, ana, reservationId, sto);
    const before = await mustRow(env, reservationId);
    const auditBefore = (await auditAll(env)).length;
    const b: ActOpts = { venue: "b" };

    expect(await accept(env, petar, reservationId, b)).toEqual(NOT_FOUND);
    expect(await decline(env, petar, reservationId, b)).toEqual(NOT_FOUND);
    expect(await propose(env, petar, reservationId, belgrade("2026-10-22T21:00"), undefined, b)).toEqual(NOT_FOUND);
    expect(await acceptProposal(env, petar, reservationId, b)).toEqual(NOT_FOUND);
    expect(await cancelByStaff(env, petar, reservationId, b)).toEqual(NOT_FOUND);
    expect(await bind(env, petar, reservationId, stoB, b)).toEqual(NOT_FOUND);
    expect(await bind(env, petar, reservationId, null, b)).toEqual(NOT_FOUND);
    expect(await arrive(env, petar, reservationId, undefined, b)).toEqual(NOT_FOUND);
    expect(await arrive(env, petar, reservationId, stoB, b)).toEqual(NOT_FOUND);
    expect(await detailOf(env, petar, reservationId, b)).toBeNull();
    expect(must(await forPanelOf(env, petar, b)).rows).toEqual([]);

    // Venue b's owner with b's panel: the same.
    const otherOwner = { venue: "b" as const, who: as(env.t, env.w.otherOwnerId) };
    expect(await accept(env, undefined, reservationId, otherOwner)).toEqual(NOT_FOUND);
    expect(await arrive(env, undefined, reservationId, stoB, otherOwner)).toEqual(NOT_FOUND);
    expect(await detailOf(env, undefined, reservationId, otherOwner)).toBeNull();

    // And venue b's people at venue a's panel (a's slug and code) are nobody.
    expect(await accept(env, petar, reservationId)).toEqual(SIGNED_OUT);
    expect(await accept(env, undefined, reservationId, { who: as(env.t, env.w.otherOwnerId) })).toEqual(SIGNED_OUT);
    // Venue a's waiter at venue b's panel, and a's slug with b's code, are nobody either.
    expect(await accept(env, ana, reservationId, b)).toEqual(SIGNED_OUT);
    expect(
      await env.t.mutation(api.menuReservations.accept, { slug: SLUG_A, panelCode: env.bCode, sessionToken: ana, reservationId }),
    ).toEqual(SIGNED_OUT);

    expect(await mustRow(env, reservationId)).toEqual(before);
    expect((await auditAll(env)).length).toBe(auditBefore);
    expect(await occupancyRows(env)).toEqual([]);
    // Venue a still sees it.
    expect(must(await forPanelOf(env, ana)).rows).toHaveLength(1);
  });

  test("a table of venue a cannot be bound to venue b's reservation either", async () => {
    const env = await world();
    const other = as(env.t, env.w.otherOwnerId);
    await other.mutation(api.menuSettings.setWorkingHours, { menuServiceId: env.w.b.menuServiceId, workingHours: WEEK });
    await other.mutation(api.menuServices.setReservations, { menuServiceId: env.w.b.menuServiceId, mode: "form" });
    const { token: petar } = await signedIn(env, "Petar", "246", "b");
    const stoA = await addPosition(env, "Sto 7");
    const guest = await guestRequest(env, { slug: SLUG_B });
    await accept(env, petar, guest.reservationId, { venue: "b" });

    expect(await bind(env, petar, guest.reservationId, stoA, { venue: "b" })).toEqual({
      ok: false,
      code: RESERVATION_ERROR.positionInvalid,
      status: "accepted",
    });
    expect(await arrive(env, petar, guest.reservationId, stoA, { venue: "b" })).toEqual({
      ok: false,
      code: RESERVATION_ERROR.positionInvalid,
      status: "accepted",
    });
    expect((await mustRow(env, guest.reservationId)).positionId).toBeUndefined();
  });
});

// =============================================================================
// 8. roles by account
// =============================================================================

describe("roles by account", () => {
  test("the Owner, a Manager and a ScanMe admin work with their account (no session token), recorded as users", async () => {
    const env = await world();
    await openForm(env);
    for (const userId of [env.w.ownerId, env.w.managerId, env.w.adminId]) {
      const { reservationId } = await guestRequest(env);
      const who = as(env.t, userId);
      expect(await accept(env, undefined, reservationId, { who })).toEqual({ ok: true, status: "accepted", changed: true });
      const row = await mustRow(env, reservationId);
      expect(row.decidedByUserId).toBe(userId);
      expect(row.decidedByStaffId).toBeUndefined();

      const next = await guestRequest(env);
      expect(await decline(env, undefined, next.reservationId, { who })).toEqual({ ok: true, status: "declined", changed: true });
    }
    const audit = await auditRows(env, "reservation.declined");
    expect(audit).toHaveLength(3);
    expect(audit.map((row) => row.actorKind).sort()).toEqual(["user", "user", "user"]);
    expect(audit.map((row) => row.actorUserId).sort()).toEqual([env.w.ownerId, env.w.managerId, env.w.adminId].sort());
    for (const row of audit) expect(row.actorRef).toBeUndefined();
  });

  test("finance, view-only, an Urednik, an outsider, another venue's owner and anonymous callers cannot: staff/signed_out", async () => {
    const env = await world();
    await openForm(env);
    const { reservationId } = await guestRequest(env);
    const sto = await addPosition(env, "Sto 7");
    const proposedAt = belgrade("2026-10-22T21:00");
    const before = await mustRow(env, reservationId);
    const callers: [string, Caller][] = [
      ["finance", as(env.t, env.w.financeId)],
      ["viewOnly", as(env.t, env.w.viewOnlyId)],
      ["editor", as(env.t, env.w.editorId)],
      ["outsider", as(env.t, env.w.outsiderId)],
      ["otherOwner", as(env.t, env.w.otherOwnerId)],
      ["anonymous", env.t],
    ];
    for (const [name, who] of callers) {
      expect(await accept(env, undefined, reservationId, { who }), name).toEqual(SIGNED_OUT);
      expect(await decline(env, undefined, reservationId, { who }), name).toEqual(SIGNED_OUT);
      expect(await propose(env, undefined, reservationId, proposedAt, undefined, { who }), name).toEqual(SIGNED_OUT);
      expect(await acceptProposal(env, undefined, reservationId, { who }), name).toEqual(SIGNED_OUT);
      expect(await cancelByStaff(env, undefined, reservationId, { who }), name).toEqual(SIGNED_OUT);
      expect(await bind(env, undefined, reservationId, sto, { who }), name).toEqual(SIGNED_OUT);
      expect(await arrive(env, undefined, reservationId, undefined, { who }), name).toEqual(SIGNED_OUT);
      expect(await forPanelOf(env, undefined, { who }), name).toBeNull();
      expect(await detailOf(env, undefined, reservationId, { who }), name).toBeNull();
    }
    expect(await mustRow(env, reservationId)).toEqual(before);
    expect(await auditRows(env, "reservation.declined")).toEqual([]);
  });

  test("a PIN waiter who is deactivated or signed out cannot act any more", async () => {
    const env = await world();
    await openForm(env);
    const { token: ana } = await signedIn(env, "Ana", "246");
    const { staffId: markoId, token: marko } = await signedIn(env, "Marko", "135");
    const { reservationId } = await guestRequest(env);
    expect(await accept(env, ana, reservationId)).toMatchObject({ ok: true });

    await env.t.mutation(api.menuWaiter.logout, { ...panel(env, ana), sessionToken: ana });
    expect(await decline(env, ana, reservationId)).toEqual(SIGNED_OUT);
    await env.owner.mutation(api.menuStaff.deactivate, { staffId: markoId });
    expect(await cancelByStaff(env, marko, reservationId)).toEqual(SIGNED_OUT);
    expect((await mustRow(env, reservationId)).status).toBe("accepted");
  });
});
