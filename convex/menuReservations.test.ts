/// <reference types="vite/client" />

// ScanMe Menu V1 — K25: reservations, the GUEST side (master §11; plan
// docs/meni/planovi/K24.md §2): `publicEntry` (the ScanMe form, the venue's own
// system, or nothing), `submit` (the form; refusals are VALUES, never throws),
// `byCancelToken` / `cancelByToken` (the link /[slug]/meni/rezervacija/[token]),
// `mine` / `cancelByDevice` ("Moji zahtevi"). Proven here: the guest never picks a
// table, the cancel token is stored only as a hash, external mode stores nothing,
// a retry of one send attempt is idempotent, the three rate buckets and the
// three-open-requests cap, the privacy of every guest answer, tenant isolation,
// and that the Venue product's `venueReservations` is never touched.
//
// Time is frozen (fake timers, T0 = Wednesday 2026-10-21 10:00 Belgrade).
// Fictional tenants only (the repo is public): "Kafana kod Mike" (a),
// "Demo restoran" (b). The helpers are copied from convex/menuWaiterFloor.test.ts
// on purpose (a test file is not a module to import from).

import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import type { FunctionArgs } from "convex/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { belgradeLocalToEpoch } from "../lib/belgrade-time";
import { RESERVATION_ERROR } from "../lib/menu/errors/reservations";
import { MENU_MAX_MY_RESERVATIONS } from "../lib/menu/limits";
import { deviceKeyHashFor, newMenuToken, reservationCancelTokenHash } from "../lib/menu/tokens";
import {
  SLUG_A,
  SLUG_B,
  TEST_ADMIN_EMAIL,
  TEST_ISSUER,
  seedMenuWorld,
  type MenuWorldSeed,
} from "../lib/menu/testkit/seed";

const modules = import.meta.glob("./**/*.ts");

// The two modules of the reservations backend as text, for the structural test at the end.
const sources = import.meta.glob(["./menuReservations.ts", "./lib/menuReservationWriter.ts"], {
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

function belgrade(local: string): number {
  return must(belgradeLocalToEpoch(local), `a Belgrade time for ${local}`);
}

/** Thursday 19:00 in Belgrade: inside the hours, on the grid, more than a day ahead. */
const THU_19 = belgrade("2026-10-22T19:00");

const DAILY = [{ start: 12 * 60, end: 23 * 60 }];
const LATE = [{ start: 12 * 60, end: 25 * 60 }]; // 12:00 to 01:00 the next morning
/** Every day 12:00–23:00, Friday and Saturday until 01:00. Monday first. */
const WEEK = { days: [DAILY, DAILY, DAILY, DAILY, LATE, LATE, DAILY] };
const CLOSED_WEEK = { days: [[], [], [], [], [], [], []] };

// -----------------------------------------------------------------------------
// World, staff, form
// -----------------------------------------------------------------------------

async function world() {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  const t = newTest();
  const w: MenuWorldSeed = await t.run(async (ctx) => await seedMenuWorld(ctx));
  const owner = as(t, w.ownerId);
  const { code } = await owner.mutation(api.menuStaff.ensurePanelCode, { menuServiceId: w.a.menuServiceId });
  return { t, w, owner, code };
}
type Env = Awaited<ReturnType<typeof world>>;

type Contact = "email" | "phone" | "both";

/** What the venue does in Podešavanja and Funkcionalnosti: the working hours, then the ScanMe form. */
async function openForm(env: Env, contact: Contact = "both") {
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

/** A PIN waiter of venue a, signed in. */
async function signedInStaff(env: Env, displayName: string, pin: string) {
  const { staffId } = await env.owner.mutation(api.menuStaff.create, {
    menuServiceId: env.w.a.menuServiceId,
    displayName,
  });
  await env.owner.mutation(api.menuStaff.setPin, { staffId, pin });
  const outcome = await env.t.mutation(api.menuWaiter.loginWithPin, { slug: SLUG_A, panelCode: env.code, pin });
  if (!outcome.ok) throw new Error(`sign-in refused: ${JSON.stringify(outcome)}`);
  return { staffId, sessionToken: outcome.sessionToken };
}

const panelOf = (env: Env, sessionToken?: string) => ({
  slug: SLUG_A,
  panelCode: env.code,
  ...(sessionToken !== undefined ? { sessionToken } : {}),
});

// -----------------------------------------------------------------------------
// The guest's calls
// -----------------------------------------------------------------------------

type SubmitArgs = FunctionArgs<typeof api.menuReservations.submit>;

let seq = 0;
const nextSeq = () => {
  seq += 1;
  return seq;
};
/** A well-formed IP hash (16–64 lowercase hex characters). */
const ipOf = (n: number) => n.toString(16).padStart(32, "0");

/** A complete, valid request of a fresh device (own IP hash, own tokens) unless overridden. */
function submitArgs(overrides: Partial<SubmitArgs> = {}, omit: readonly (keyof SubmitArgs)[] = []): SubmitArgs {
  const n = nextSeq();
  const base: SubmitArgs = {
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
  return Object.fromEntries(
    Object.entries(base).filter(([key]) => !(omit as readonly string[]).includes(key)),
  ) as SubmitArgs;
}

const submit = (t: T, overrides: Partial<SubmitArgs> = {}, omit: readonly (keyof SubmitArgs)[] = []) =>
  t.mutation(api.menuReservations.submit, submitArgs(overrides, omit));

/** A submit that must be accepted; the arguments are returned (the tokens are the guest's). */
async function mustSubmit(t: T, overrides: Partial<SubmitArgs> = {}, omit: readonly (keyof SubmitArgs)[] = []) {
  const args = submitArgs(overrides, omit);
  const result = await t.mutation(api.menuReservations.submit, args);
  if (!result.ok) throw new Error(`submit refused: ${JSON.stringify(result)}`);
  return { args, result, reservationId: result.reservationId };
}

const view = (t: T, token: string, slug = SLUG_A) => t.query(api.menuReservations.byCancelToken, { slug, token });
const cancelByLink = (t: T, token: string, slug = SLUG_A, ipHash?: string) =>
  t.mutation(api.menuReservations.cancelByToken, { slug, token, ...(ipHash ? { ipHash } : {}) });
const mineOf = (t: T, deviceKey: string, slug = SLUG_A) => t.query(api.menuReservations.mine, { slug, deviceKey });
const cancelByDevice = (t: T, deviceToken: string, reservationId: string, slug = SLUG_A) =>
  t.mutation(api.menuReservations.cancelByDevice, { slug, deviceToken, reservationId });

const reservationRows = (t: T) => t.run(async (ctx) => await ctx.db.query("menuReservations").take(500));
const auditRows = async (t: T, action: string) =>
  (await t.run(async (ctx) => await ctx.db.query("menuAuditLog").take(5000))).filter((row) => row.action === action);

// =============================================================================
// 1. publicEntry
// =============================================================================

describe("publicEntry", () => {
  test("is off by default, also when the working hours are set but the switch is off", async () => {
    const env = await world();
    expect(await env.t.query(api.menuReservations.publicEntry, { slug: SLUG_A })).toEqual({ mode: "off" });
    await env.owner.mutation(api.menuSettings.setWorkingHours, {
      menuServiceId: env.w.a.menuServiceId,
      workingHours: WEEK,
    });
    expect(await env.t.query(api.menuReservations.publicEntry, { slug: SLUG_A })).toEqual({ mode: "off" });
  });

  test("form: the contact and the working hours, no ids", async () => {
    const env = await world();
    await openForm(env, "email");
    const entry = await env.t.query(api.menuReservations.publicEntry, { slug: SLUG_A });
    expect(entry).toEqual({ mode: "form", contact: "email", workingHours: WEEK });
    expect(Object.keys(entry).sort()).toEqual(["contact", "mode", "workingHours"]);
    const text = JSON.stringify(entry);
    for (const id of [env.w.a.menuServiceId, env.w.a.businessId, env.w.a.serviceProfileId]) {
      expect(text).not.toContain(id);
    }
  });

  test("external returns the link and nothing else", async () => {
    const env = await world();
    const set = await env.owner.mutation(api.menuServices.setReservations, {
      menuServiceId: env.w.a.menuServiceId,
      mode: "external",
      externalUrl: "https://rezervacije.example.com/kafana-kod-mike",
    });
    expect(set).toEqual({ ok: true, changed: true });
    const entry = await env.t.query(api.menuReservations.publicEntry, { slug: SLUG_A });
    expect(entry).toEqual({ mode: "external", url: "https://rezervacije.example.com/kafana-kod-mike" });
  });

  test("a form over a week with no opening hour offers nothing; opening the week brings it back", async () => {
    const env = await world();
    await openForm(env);
    await env.owner.mutation(api.menuSettings.setWorkingHours, {
      menuServiceId: env.w.a.menuServiceId,
      workingHours: CLOSED_WEEK,
    });
    expect(await env.t.query(api.menuReservations.publicEntry, { slug: SLUG_A })).toEqual({ mode: "off" });
    // And the form takes no request while there is nothing to choose from.
    expect(await submit(env.t)).toEqual({ ok: false, code: RESERVATION_ERROR.off });
    expect(await reservationRows(env.t)).toEqual([]);

    await env.owner.mutation(api.menuSettings.setWorkingHours, {
      menuServiceId: env.w.a.menuServiceId,
      workingHours: WEEK,
    });
    expect(await env.t.query(api.menuReservations.publicEntry, { slug: SLUG_A })).toMatchObject({ mode: "form" });
  });

  test("an unknown, malformed, inactive or switched-off venue is off", async () => {
    const env = await world();
    await openForm(env);
    for (const slug of ["nema-takvog-lokala", "Kafana Kod Mike", "", "x".repeat(200)]) {
      expect(await env.t.query(api.menuReservations.publicEntry, { slug }), JSON.stringify(slug)).toEqual({ mode: "off" });
    }
    // The slug is trimmed and lowercased like everywhere on the public side.
    expect(await env.t.query(api.menuReservations.publicEntry, { slug: ` ${SLUG_A.toUpperCase()} ` })).toMatchObject({
      mode: "form",
    });

    await env.t.run(async (ctx) => await ctx.db.patch(env.w.a.serviceProfileId, { status: "inactive" }));
    expect(await env.t.query(api.menuReservations.publicEntry, { slug: SLUG_A })).toEqual({ mode: "off" });
    expect(await submit(env.t)).toEqual({ ok: false, code: RESERVATION_ERROR.off });

    await env.t.run(async (ctx) => {
      await ctx.db.patch(env.w.a.serviceProfileId, { status: "active" });
      await ctx.db.patch(env.w.a.businessId, { status: "inactive" });
    });
    expect(await env.t.query(api.menuReservations.publicEntry, { slug: SLUG_A })).toEqual({ mode: "off" });
    expect(await submit(env.t)).toEqual({ ok: false, code: RESERVATION_ERROR.off });
    expect(await reservationRows(env.t)).toEqual([]);
  });

  test("venue b sees its own setting, never venue a's", async () => {
    const env = await world();
    await openForm(env, "phone");
    const other = as(env.t, env.w.otherOwnerId);
    expect(await env.t.query(api.menuReservations.publicEntry, { slug: SLUG_B })).toEqual({ mode: "off" });

    await other.mutation(api.menuSettings.setWorkingHours, {
      menuServiceId: env.w.b.menuServiceId,
      workingHours: { days: [DAILY, [], [], [], [], [], []] },
    });
    await other.mutation(api.menuServices.setReservations, {
      menuServiceId: env.w.b.menuServiceId,
      mode: "form",
      contact: "email",
    });
    expect(await env.t.query(api.menuReservations.publicEntry, { slug: SLUG_B })).toEqual({
      mode: "form",
      contact: "email",
      workingHours: { days: [DAILY, [], [], [], [], [], []] },
    });
    expect(await env.t.query(api.menuReservations.publicEntry, { slug: SLUG_A })).toEqual({
      mode: "form",
      contact: "phone",
      workingHours: WEEK,
    });
  });
});

// =============================================================================
// 2. submit: the happy path
// =============================================================================

describe("submit: the request", () => {
  test("happy path: ok + id, a NEW row without a table, only the hashed cancel token", async () => {
    const env = await world();
    await openForm(env);
    const args = submitArgs({ note: "  Rođendan, molim sto blizu prozora " });
    const result = await env.t.mutation(api.menuReservations.submit, args);
    expect(result).toMatchObject({ ok: true, requestedAt: THU_19, partySize: 4, deduped: false });
    if (!result.ok) throw new Error("not ok");

    const rows = await reservationRows(env.t);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row._id).toBe(result.reservationId);
    expect(row).toMatchObject({
      menuServiceId: env.w.a.menuServiceId,
      businessId: env.w.a.businessId,
      status: "new",
      guestName: "Marija Gost",
      partySize: 4,
      requestedAt: THU_19,
      contactEmail: "gost@example.com",
      contactPhone: "+381 60 000 0000",
      note: "Rođendan, molim sto blizu prozora",
      clientRequestId: args.clientRequestId,
      createdAt: T0,
      updatedAt: T0,
    });
    // The guest never chooses a table, and nobody has decided, arrived or cancelled anything.
    for (const key of ["positionId", "positionLabel", "boundAt", "decidedAt", "arrivedAt", "cancelledAt", "cancelledBy", "proposedAt"] as const) {
      expect(row[key], key).toBeUndefined();
    }
    // The cancel token is a secret: only its hash is stored.
    expect(row.cancelTokenHash).not.toBe(args.cancelToken);
    expect(row.cancelTokenHash).toBe(await reservationCancelTokenHash(args.cancelToken));
    expect(JSON.stringify(row)).not.toContain(args.cancelToken);
    // So is the device token: the row keeps the venue-scoped pseudonym.
    expect(row.deviceKeyHash).toBe(await deviceKeyHashFor(env.w.a.menuServiceId, args.deviceToken));
    expect(JSON.stringify(row)).not.toContain(args.deviceToken);
    // The answer carries no token, hash or pseudonym either.
    expect(JSON.stringify(result)).not.toContain(args.cancelToken);
    expect(JSON.stringify(result)).not.toContain(row.cancelTokenHash);
    expect(Object.keys(result).sort()).toEqual(["deduped", "ok", "partySize", "requestedAt", "reservationId"]);
  });

  test("the contact is stored as the venue asks: e-mail only drops a sent phone, phone only drops a sent e-mail", async () => {
    const env = await world();
    const rowOf = async (reservationId: Id<"menuReservations">) =>
      must((await reservationRows(env.t)).find((row) => row._id === reservationId), "the stored row");
    await openForm(env, "email");
    const emailOnly = await rowOf((await mustSubmit(env.t)).reservationId);
    await openForm(env, "phone");
    const phoneOnly = await rowOf((await mustSubmit(env.t)).reservationId);
    await openForm(env, "both");
    const both = await rowOf((await mustSubmit(env.t)).reservationId);
    // "email": the phone that was sent is dropped, never stored.
    expect(emailOnly.contactEmail).toBe("gost@example.com");
    expect(emailOnly.contactPhone).toBeUndefined();
    expect(JSON.stringify(emailOnly)).not.toContain("+381");
    // "phone": the e-mail that was sent is dropped.
    expect(phoneOnly.contactPhone).toBe("+381 60 000 0000");
    expect(phoneOnly.contactEmail).toBeUndefined();
    expect(JSON.stringify(phoneOnly)).not.toContain("gost@example.com");
    // "both": both.
    expect(both).toMatchObject({ contactEmail: "gost@example.com", contactPhone: "+381 60 000 0000" });
  });

  test("the e-mail is lowercased, a note is optional, the boundary slots are accepted", async () => {
    const env = await world();
    await openForm(env);
    // 12:00 (the first slot), 22:45 (the last before 23:00) and 00:45 on Saturday (Friday's hours run until 01:00).
    for (const local of ["2026-10-22T12:00", "2026-10-22T22:45", "2026-10-24T00:45"]) {
      await mustSubmit(env.t, { requestedAt: belgrade(local), contactEmail: "  Gost@Example.COM " }, ["note"]);
    }
    const rows = await reservationRows(env.t);
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.contactEmail).toBe("gost@example.com");
      expect(row.note).toBeUndefined();
    }
  });
});

// =============================================================================
// 3. the guest never chooses a table
// =============================================================================

describe("the guest does not choose a table", () => {
  test("submit with an extra positionId is rejected by the validator and writes nothing", async () => {
    const env = await world();
    await openForm(env);
    const positionId = await env.t.run(async (ctx) => {
      const now = Date.now();
      return await ctx.db.insert("menuPositions", {
        menuServiceId: env.w.a.menuServiceId,
        key: "ps_guestpick1",
        kind: "table",
        label: "Sto 7",
        labelNormalized: "sto 7",
        order: 0,
        active: true,
        createdAt: now,
        updatedAt: now,
      });
    });
    const withTable = { ...submitArgs(), positionId } as unknown as SubmitArgs;
    await expect(env.t.mutation(api.menuReservations.submit, withTable)).rejects.toThrow(/positionId/);
    expect(await reservationRows(env.t)).toEqual([]);

    // The same request without the table is fine, and the row has none.
    const ok = await mustSubmit(env.t);
    const [row] = await reservationRows(env.t);
    expect(row._id).toBe(ok.reservationId);
    expect(row.positionId).toBeUndefined();
  });

  test("no other guest function takes a position either", async () => {
    const env = await world();
    await openForm(env);
    const first = await mustSubmit(env.t);
    const positionId = await env.t.run(async (ctx) => {
      const now = Date.now();
      return await ctx.db.insert("menuPositions", {
        menuServiceId: env.w.a.menuServiceId,
        key: "ps_guestpick2",
        kind: "table",
        label: "Sto 8",
        labelNormalized: "sto 8",
        order: 0,
        active: true,
        createdAt: now,
        updatedAt: now,
      });
    });
    const deviceKey = await deviceKeyHashFor(env.w.a.menuServiceId, first.args.deviceToken);
    const attempts = await Promise.allSettled([
      env.t.query(api.menuReservations.publicEntry, { slug: SLUG_A, positionId } as never),
      env.t.query(api.menuReservations.byCancelToken, { slug: SLUG_A, token: first.args.cancelToken, positionId } as never),
      env.t.query(api.menuReservations.mine, { slug: SLUG_A, deviceKey, positionId } as never),
      env.t.mutation(api.menuReservations.cancelByToken, { slug: SLUG_A, token: first.args.cancelToken, positionId } as never),
      env.t.mutation(
        api.menuReservations.cancelByDevice,
        { slug: SLUG_A, deviceToken: first.args.deviceToken, reservationId: first.reservationId, positionId } as never,
      ),
    ]);
    expect(attempts.map((attempt) => attempt.status)).toEqual(["rejected", "rejected", "rejected", "rejected", "rejected"]);
    for (const attempt of attempts) {
      expect(String((attempt as PromiseRejectedResult).reason)).toMatch(/positionId/);
    }
    // Nothing moved.
    const [row] = await reservationRows(env.t);
    expect(row).toMatchObject({ status: "new" });
    expect(row.positionId).toBeUndefined();
  });
});

// =============================================================================
// 4. submit refusals are VALUES
// =============================================================================

describe("submit: refusals are values and write nothing", () => {
  test("malformed tokens or request id → reservation/invalid_input", async () => {
    const env = await world();
    await openForm(env);
    const refusal = { ok: false, code: RESERVATION_ERROR.invalidInput };
    expect(await submit(env.t, { deviceToken: "kratak" })).toEqual(refusal);
    expect(await submit(env.t, { deviceToken: "a".repeat(42) })).toEqual(refusal); // one character short
    expect(await submit(env.t, { deviceToken: "a".repeat(43) + "!" })).toEqual(refusal);
    expect(await submit(env.t, { cancelToken: "kratak" })).toEqual(refusal);
    expect(await submit(env.t, { cancelToken: `${newMenuToken().slice(0, 42)}+` })).toEqual(refusal);
    expect(await submit(env.t, { clientRequestId: "short" })).toEqual(refusal); // fewer than 8 characters
    expect(await submit(env.t, { clientRequestId: "has a space 1" })).toEqual(refusal);
    expect(await submit(env.t, { clientRequestId: "x".repeat(65) })).toEqual(refusal);
    // Absurdly long raw text is refused before anything is read.
    expect(await submit(env.t, { guestName: "M".repeat(2001) })).toEqual(refusal);
    expect(await submit(env.t, { note: "n".repeat(2001) })).toEqual(refusal);
    expect(await submit(env.t, { contactEmail: `${"e".repeat(2001)}@example.com` })).toEqual(refusal);
    expect(await reservationRows(env.t)).toEqual([]);
  });

  test("switch off → reservation/off, and the venue's own system (external) stores NOTHING", async () => {
    const env = await world();
    // Never switched on.
    expect(await submit(env.t)).toEqual({ ok: false, code: RESERVATION_ERROR.off });

    // Switched on, then off again.
    await openForm(env);
    await mustSubmit(env.t);
    await env.owner.mutation(api.menuServices.setReservations, { menuServiceId: env.w.a.menuServiceId, mode: "off" });
    expect(await submit(env.t)).toEqual({ ok: false, code: RESERVATION_ERROR.off });

    // The venue's own system: ScanMe only links to it.
    const set = await env.owner.mutation(api.menuServices.setReservations, {
      menuServiceId: env.w.a.menuServiceId,
      mode: "external",
      externalUrl: "https://rezervacije.example.com/kafana",
    });
    expect(set.ok).toBe(true);
    expect(await submit(env.t)).toEqual({ ok: false, code: RESERVATION_ERROR.off });
    expect(await submit(env.t, { slug: "nema-takvog-lokala" })).toEqual({ ok: false, code: RESERVATION_ERROR.off });
    // Only the one request from the time the form was on.
    expect(await reservationRows(env.t)).toHaveLength(1);
  });

  test("external mode from the start: zero rows in menuReservations", async () => {
    const env = await world();
    await env.owner.mutation(api.menuServices.setReservations, {
      menuServiceId: env.w.a.menuServiceId,
      mode: "external",
      externalUrl: "https://rezervacije.example.com/kafana",
    });
    for (let i = 0; i < 3; i += 1) {
      expect(await submit(env.t)).toEqual({ ok: false, code: RESERVATION_ERROR.off });
    }
    expect(await env.t.run(async (ctx) => await ctx.db.query("menuReservations").take(10))).toEqual([]);
  });

  test("the time: past → in_past, outside the hours or off the 15-minute grid → outside_hours, over 60 days → too_far", async () => {
    const env = await world();
    await openForm(env);
    const past = await submit(env.t, { requestedAt: T0 - HOUR });
    expect(past).toEqual({ ok: false, code: RESERVATION_ERROR.inPast, fieldErrors: { requestedAt: "in_past" } });
    // Right now is already past.
    expect(await submit(env.t, { requestedAt: T0 })).toMatchObject({ ok: false, code: RESERVATION_ERROR.inPast });

    const outside = { ok: false, code: RESERVATION_ERROR.outsideHours, fieldErrors: { requestedAt: "outside_hours" } };
    expect(await submit(env.t, { requestedAt: belgrade("2026-10-22T09:00") })).toEqual(outside); // before opening
    expect(await submit(env.t, { requestedAt: belgrade("2026-10-22T11:45") })).toEqual(outside); // a quarter before opening
    expect(await submit(env.t, { requestedAt: belgrade("2026-10-22T23:00") })).toEqual(outside); // closing time itself
    expect(await submit(env.t, { requestedAt: belgrade("2026-10-23T03:00") })).toEqual(outside); // the small hours of Friday: Thursday ends at 23:00
    expect(await submit(env.t, { requestedAt: belgrade("2026-10-24T01:00") })).toEqual(outside); // Friday's hours end at 01:00 sharp
    // Not on the 15-minute grid: ten past, and a stray second.
    expect(await submit(env.t, { requestedAt: belgrade("2026-10-22T19:10") })).toEqual(outside);
    expect(await submit(env.t, { requestedAt: THU_19 + 1000 })).toEqual(outside);

    const tooFar = { ok: false, code: RESERVATION_ERROR.tooFar, fieldErrors: { requestedAt: "too_far" } };
    expect(await submit(env.t, { requestedAt: T0 + 61 * DAY })).toEqual(tooFar);
    expect(await submit(env.t, { requestedAt: T0 + 400 * DAY })).toEqual(tooFar);
    expect(await reservationRows(env.t)).toEqual([]);
  });

  test("a venue closed on that day takes no request for it", async () => {
    const env = await world();
    await env.owner.mutation(api.menuSettings.setWorkingHours, {
      menuServiceId: env.w.a.menuServiceId,
      workingHours: { days: [[], [], [], DAILY, [], [], []] }, // Thursday only
    });
    await env.owner.mutation(api.menuServices.setReservations, {
      menuServiceId: env.w.a.menuServiceId,
      mode: "form",
    });
    expect(await submit(env.t, { requestedAt: belgrade("2026-10-23T19:00") })).toMatchObject({
      ok: false,
      code: RESERVATION_ERROR.outsideHours,
    }); // Friday
    expect(await submit(env.t, { requestedAt: THU_19 })).toMatchObject({ ok: true });
  });

  test("a missing or wrong contact → invalid_input with fieldErrors", async () => {
    const env = await world();
    await openForm(env, "both");
    expect(await submit(env.t, {}, ["contactPhone"])).toEqual({
      ok: false,
      code: RESERVATION_ERROR.invalidInput,
      fieldErrors: { contactPhone: "required" },
    });
    expect(await submit(env.t, {}, ["contactEmail"])).toEqual({
      ok: false,
      code: RESERVATION_ERROR.invalidInput,
      fieldErrors: { contactEmail: "required" },
    });
    expect(await submit(env.t, {}, ["contactEmail", "contactPhone"])).toEqual({
      ok: false,
      code: RESERVATION_ERROR.invalidInput,
      fieldErrors: { contactEmail: "required", contactPhone: "required" },
    });
    expect(await submit(env.t, { contactEmail: "nije-mejl" })).toMatchObject({
      ok: false,
      code: RESERVATION_ERROR.invalidInput,
      fieldErrors: { contactEmail: "invalid" },
    });
    expect(await submit(env.t, { contactPhone: "123" })).toMatchObject({
      ok: false,
      code: RESERVATION_ERROR.invalidInput,
      fieldErrors: { contactPhone: "invalid" },
    });

    // Only the asked-for contact is required.
    await openForm(env, "email");
    expect(await submit(env.t, {}, ["contactPhone"])).toMatchObject({ ok: true });
    expect(await submit(env.t, {}, ["contactEmail"])).toMatchObject({
      ok: false,
      fieldErrors: { contactEmail: "required" },
    });
    await openForm(env, "phone");
    expect(await submit(env.t, {}, ["contactEmail"])).toMatchObject({ ok: true });
    expect(await submit(env.t, {}, ["contactPhone"])).toMatchObject({
      ok: false,
      fieldErrors: { contactPhone: "required" },
    });
  });

  test("party size 0 or 51 → partySize \"range\"; 1 and 50 are fine; a half guest is invalid", async () => {
    const env = await world();
    await openForm(env);
    for (const partySize of [0, 51, -2, 1000]) {
      expect(await submit(env.t, { partySize }), String(partySize)).toEqual({
        ok: false,
        code: RESERVATION_ERROR.invalidInput,
        fieldErrors: { partySize: "range" },
      });
    }
    expect(await submit(env.t, { partySize: 2.5 })).toMatchObject({ ok: false, fieldErrors: { partySize: "invalid" } });
    expect(await reservationRows(env.t)).toEqual([]);
    expect(await submit(env.t, { partySize: 1 })).toMatchObject({ ok: true, partySize: 1 });
    expect(await submit(env.t, { partySize: 50 })).toMatchObject({ ok: true, partySize: 50 });
  });

  test("name and note: empty name → required, over 80 → too_long, note over 500 → too_long; every wrong field is listed", async () => {
    const env = await world();
    await openForm(env);
    expect(await submit(env.t, { guestName: "   " })).toEqual({
      ok: false,
      code: RESERVATION_ERROR.invalidInput,
      fieldErrors: { guestName: "required" },
    });
    expect(await submit(env.t, { guestName: "M".repeat(81) })).toMatchObject({ fieldErrors: { guestName: "too_long" } });
    expect(await submit(env.t, { note: "n".repeat(501) })).toMatchObject({ fieldErrors: { note: "too_long" } });
    // Several wrong fields: all listed, and the code is invalid_input even though one is the time.
    expect(await submit(env.t, { guestName: "", partySize: 0, requestedAt: T0 - HOUR })).toEqual({
      ok: false,
      code: RESERVATION_ERROR.invalidInput,
      fieldErrors: { guestName: "required", partySize: "range", requestedAt: "in_past" },
    });
    expect(await reservationRows(env.t)).toEqual([]);
  });

  test("a refused request spends no rate-limit token", async () => {
    const env = await world();
    await openForm(env);
    const ipHash = ipOf(7000);
    for (let i = 0; i < 12; i += 1) {
      expect(await submit(env.t, { ipHash, partySize: 0 })).toMatchObject({ ok: false, code: RESERVATION_ERROR.invalidInput });
    }
    // Five real requests from that address still go through.
    for (let i = 0; i < 5; i += 1) await mustSubmit(env.t, { ipHash });
    expect(await reservationRows(env.t)).toHaveLength(5);
  });
});

// =============================================================================
// 5. idempotency
// =============================================================================

describe("submit: a retry of one send attempt", () => {
  test("same device + clientRequestId → the same reservation, deduped, one row; the newest cancel token wins", async () => {
    const env = await world();
    await openForm(env);
    const first = submitArgs();
    const second: SubmitArgs = { ...first, cancelToken: newMenuToken() };

    const one = await env.t.mutation(api.menuReservations.submit, first);
    const two = await env.t.mutation(api.menuReservations.submit, second);
    if (!one.ok || !two.ok) throw new Error("both sends must be accepted");
    expect(one.deduped).toBe(false);
    expect(two.deduped).toBe(true);
    expect(two.reservationId).toBe(one.reservationId);
    expect(two).toMatchObject({ requestedAt: THU_19, partySize: 4 });
    expect(await reservationRows(env.t)).toHaveLength(1);

    // The guest never saw the first link: only the second token works now.
    expect(await view(env.t, first.cancelToken)).toBeNull();
    expect(await view(env.t, second.cancelToken)).toMatchObject({ status: "new", canCancel: true });
    expect(await cancelByLink(env.t, first.cancelToken)).toEqual({ ok: false, code: RESERVATION_ERROR.notFound });
    expect(await cancelByLink(env.t, second.cancelToken)).toEqual({ ok: true, status: "cancelled" });
    const [row] = await reservationRows(env.t);
    expect(row.status).toBe("cancelled");
    expect(row.cancelTokenHash).toBe(await reservationCancelTokenHash(second.cancelToken));
  });

  test("retrying does not spend rate-limit tokens, so a flaky network never locks the guest out", async () => {
    const env = await world();
    await openForm(env);
    const ipHash = ipOf(7100);
    const args = submitArgs({ ipHash });
    const first = await env.t.mutation(api.menuReservations.submit, args);
    if (!first.ok) throw new Error("first send refused");
    for (let i = 0; i < 12; i += 1) {
      const again = await env.t.mutation(api.menuReservations.submit, { ...args, cancelToken: newMenuToken() });
      expect(again).toMatchObject({ ok: true, deduped: true, reservationId: first.reservationId });
    }
    expect(await reservationRows(env.t)).toHaveLength(1);
  });

  test("another device with the same clientRequestId is a different request", async () => {
    const env = await world();
    await openForm(env);
    const first = submitArgs({ clientRequestId: "shared-request-1" });
    const second = submitArgs({ clientRequestId: "shared-request-1" });
    const one = await env.t.mutation(api.menuReservations.submit, first);
    const two = await env.t.mutation(api.menuReservations.submit, second);
    if (!one.ok || !two.ok) throw new Error("both sends must be accepted");
    expect(two.deduped).toBe(false);
    expect(two.reservationId).not.toBe(one.reservationId);
    expect(await reservationRows(env.t)).toHaveLength(2);
  });

  test("a retry after the reservation is closed answers with it but does not hand out a working link", async () => {
    const env = await world();
    await openForm(env);
    const first = submitArgs();
    const one = await env.t.mutation(api.menuReservations.submit, first);
    if (!one.ok) throw new Error("first send refused");
    expect(await cancelByLink(env.t, first.cancelToken)).toEqual({ ok: true, status: "cancelled" });

    const lateToken = newMenuToken();
    const again = await env.t.mutation(api.menuReservations.submit, { ...first, cancelToken: lateToken });
    expect(again).toMatchObject({ ok: true, deduped: true, reservationId: one.reservationId });
    // The reservation is no longer open: the new token is not stored.
    expect(await view(env.t, lateToken)).toBeNull();
    expect((await reservationRows(env.t))[0].status).toBe("cancelled");
  });

  test("a cancel token that already belongs to another reservation is refused (invalid_input)", async () => {
    const env = await world();
    await openForm(env);
    const first = await mustSubmit(env.t);
    const clash = await submit(env.t, { cancelToken: first.args.cancelToken });
    expect(clash).toEqual({ ok: false, code: RESERVATION_ERROR.invalidInput });
    expect(await reservationRows(env.t)).toHaveLength(1);
    expect(await view(env.t, first.args.cancelToken)).toMatchObject({ status: "new" });
  });
});

// =============================================================================
// 6. rate limits and the open-request cap
// =============================================================================

describe("submit: rate limits", () => {
  test("the 6th request from one IP hash inside 10 minutes → rate_limited; other addresses and later minutes still work", async () => {
    const env = await world();
    await openForm(env);
    const ipHash = ipOf(7200);
    for (let i = 0; i < 5; i += 1) await mustSubmit(env.t, { ipHash }); // five different devices
    expect(await submit(env.t, { ipHash })).toEqual({ ok: false, code: RESERVATION_ERROR.rateLimited });
    expect(await reservationRows(env.t)).toHaveLength(5);

    // Another address is not affected.
    expect(await submit(env.t, { ipHash: ipOf(7201) })).toMatchObject({ ok: true });
    // A bucket refills with time (5 per 10 minutes = one token every 2 minutes).
    vi.setSystemTime(T0 + 3 * MINUTE);
    expect(await submit(env.t, { ipHash })).toMatchObject({ ok: true });
    expect(await submit(env.t, { ipHash })).toEqual({ ok: false, code: RESERVATION_ERROR.rateLimited });
  });

  test("a missing or malformed ipHash falls into ONE shared bucket", async () => {
    const env = await world();
    await openForm(env);
    for (let i = 0; i < 5; i += 1) {
      await mustSubmit(env.t, i % 2 === 0 ? { ipHash: "not-hex!" } : {}, i % 2 === 0 ? [] : ["ipHash"]);
    }
    expect(await submit(env.t, { ipHash: "ZZZ" })).toEqual({ ok: false, code: RESERVATION_ERROR.rateLimited });
    expect(await submit(env.t, {}, ["ipHash"])).toEqual({ ok: false, code: RESERVATION_ERROR.rateLimited });
    // A real address has its own bucket.
    expect(await submit(env.t, { ipHash: ipOf(7300) })).toMatchObject({ ok: true });
  });

  test("one device: 3 an hour (the 4th is rate_limited FIRST), then the cap of 3 open requests (too_many_open)", async () => {
    const env = await world();
    await openForm(env);
    const deviceToken = newMenuToken();
    const slots = ["2026-10-22T19:00", "2026-10-22T20:00", "2026-10-22T21:00", "2026-10-22T22:00"].map(belgrade);
    const first = await mustSubmit(env.t, { deviceToken, requestedAt: slots[0] });
    for (let i = 1; i < 3; i += 1) await mustSubmit(env.t, { deviceToken, requestedAt: slots[i] });

    // Inside the hour the device bucket (3/h) is empty before the open-request cap is looked at.
    expect(await submit(env.t, { deviceToken, requestedAt: slots[3] })).toEqual({
      ok: false,
      code: RESERVATION_ERROR.rateLimited,
    });
    expect(await reservationRows(env.t)).toHaveLength(3);

    // More than an hour later the bucket is full again, but three requests are still open.
    vi.setSystemTime(T0 + HOUR + 5 * MINUTE);
    expect(await submit(env.t, { deviceToken, requestedAt: slots[3] })).toEqual({
      ok: false,
      code: RESERVATION_ERROR.tooManyOpen,
    });
    expect(await reservationRows(env.t)).toHaveLength(3);

    // Closing one frees a place. (The guest cancels from "Moji zahtevi".)
    expect(await cancelByDevice(env.t, deviceToken, first.reservationId)).toEqual({ ok: true, status: "cancelled" });
    expect(await submit(env.t, { deviceToken, requestedAt: slots[3] })).toMatchObject({ ok: true, deduped: false });
    expect(await reservationRows(env.t)).toHaveLength(4);
  });

  test("another device of the same venue has its own allowance", async () => {
    const env = await world();
    await openForm(env);
    const busy = newMenuToken();
    for (let i = 0; i < 3; i += 1) await mustSubmit(env.t, { deviceToken: busy });
    expect(await submit(env.t, { deviceToken: busy })).toMatchObject({ ok: false, code: RESERVATION_ERROR.rateLimited });
    expect(await submit(env.t)).toMatchObject({ ok: true });
  });

  test("the whole venue: 60 requests an hour, the 61st is rate_limited", async () => {
    const env = await world();
    await openForm(env);
    for (let i = 0; i < 60; i += 1) {
      const result = await submit(env.t);
      if (!result.ok) throw new Error(`request ${i + 1} refused: ${JSON.stringify(result)}`);
    }
    expect(await submit(env.t)).toEqual({ ok: false, code: RESERVATION_ERROR.rateLimited });
    expect(await reservationRows(env.t)).toHaveLength(60);

    // Venue b's bucket is its own.
    const other = as(env.t, env.w.otherOwnerId);
    await other.mutation(api.menuSettings.setWorkingHours, { menuServiceId: env.w.b.menuServiceId, workingHours: WEEK });
    await other.mutation(api.menuServices.setReservations, { menuServiceId: env.w.b.menuServiceId, mode: "form" });
    expect(await submit(env.t, { slug: SLUG_B })).toMatchObject({ ok: true });
  }, 60_000);

  test("K25 (main agent, security review): 200 unanswered requests stop the form until staff answer one", async () => {
    const env = await world();
    await openForm(env);
    const { a } = env.w;
    const ids = await env.t.run(async (ctx) => {
      const out = [];
      for (let i = 0; i < 200; i += 1) {
        out.push(
          await ctx.db.insert("menuReservations", {
            menuServiceId: a.menuServiceId,
            businessId: a.businessId,
            status: "new",
            guestName: `Gost ${i}`,
            partySize: 2,
            requestedAt: T0 + 86_400_000 + i * 60_000,
            cancelTokenHash: `seed-${i}`,
            createdAt: T0,
            updatedAt: T0,
          }),
        );
      }
      return out;
    });
    expect(await submit(env.t)).toEqual({ ok: false, code: RESERVATION_ERROR.rateLimited });
    expect(await reservationRows(env.t)).toHaveLength(200);
    // Staff answer one: the form takes requests again.
    await env.t.run(async (ctx) => ctx.db.patch(ids[0], { status: "declined" }));
    expect(await submit(env.t)).toMatchObject({ ok: true });
  }, 60_000);
});

// =============================================================================
// 7. byCancelToken
// =============================================================================

describe("byCancelToken", () => {
  test("a valid token shows the reservation in a few words, and nothing personal", async () => {
    const env = await world();
    await openForm(env);
    const { args } = await mustSubmit(env.t, { note: "Alergija na orašaste plodove" });
    const link = must(await view(env.t, args.cancelToken), "the link view");
    expect(link).toEqual({
      businessName: "Kafana kod Mike",
      status: "new",
      requestedAt: THU_19,
      partySize: 4,
      proposedAt: null,
      proposalNote: null,
      canCancel: true,
    });
    expect(Object.keys(link).sort()).toEqual([
      "businessName",
      "canCancel",
      "partySize",
      "proposalNote",
      "proposedAt",
      "requestedAt",
      "status",
    ]);
    const text = JSON.stringify(link);
    for (const secret of ["Marija", "gost@example.com", "+381", "Alergija", "positionId", "contact", args.cancelToken, args.deviceToken]) {
      expect(text, secret).not.toContain(secret);
    }
  });

  test("a wrong token, a well-formed bogus token, another venue's slug and an unknown slug all look the same: null", async () => {
    const env = await world();
    await openForm(env);
    const { args } = await mustSubmit(env.t);
    expect(await view(env.t, args.cancelToken)).not.toBeNull(); // baseline

    expect(await view(env.t, "kratak")).toBeNull(); // malformed
    expect(await view(env.t, "")).toBeNull();
    expect(await view(env.t, newMenuToken())).toBeNull(); // well-formed, nobody's
    expect(await view(env.t, args.deviceToken)).toBeNull(); // the device token is not a cancel token
    expect(await view(env.t, args.cancelToken, SLUG_B)).toBeNull(); // venue a's token at venue b
    expect(await view(env.t, args.cancelToken, "nema-takvog-lokala")).toBeNull();
  });

  test("the view follows the status: cancelled → canCancel false", async () => {
    const env = await world();
    await openForm(env);
    const { args } = await mustSubmit(env.t);
    expect(await cancelByLink(env.t, args.cancelToken)).toEqual({ ok: true, status: "cancelled" });
    expect(await view(env.t, args.cancelToken)).toMatchObject({ status: "cancelled", canCancel: false });
  });

  test("a token still works after the venue switched the form off (the guest can still look and cancel)", async () => {
    const env = await world();
    await openForm(env);
    const { args } = await mustSubmit(env.t);
    await env.owner.mutation(api.menuServices.setReservations, { menuServiceId: env.w.a.menuServiceId, mode: "off" });
    expect(await view(env.t, args.cancelToken)).toMatchObject({ status: "new", canCancel: true });
    expect(await cancelByLink(env.t, args.cancelToken)).toEqual({ ok: true, status: "cancelled" });
  });
});

// =============================================================================
// 8. cancelByToken
// =============================================================================

describe("cancelByToken", () => {
  test("valid → cancelled by the guest, audited; again → ok and idempotent", async () => {
    const env = await world();
    await openForm(env);
    const { args, reservationId } = await mustSubmit(env.t);
    vi.setSystemTime(T0 + 5 * MINUTE);

    expect(await cancelByLink(env.t, args.cancelToken, SLUG_A, ipOf(1))).toEqual({ ok: true, status: "cancelled" });
    const [row] = await reservationRows(env.t);
    expect(row).toMatchObject({ status: "cancelled", cancelledBy: "guest", cancelledAt: T0 + 5 * MINUTE });
    expect(row.cancelledByStaffId).toBeUndefined();
    expect(row.cancelledByUserId).toBeUndefined();

    const audit = await auditRows(env.t, "reservation.cancelled");
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      menuServiceId: env.w.a.menuServiceId,
      actorKind: "guest",
      entityType: "reservation",
      entityKey: reservationId,
      details: { from: "new", by: "guest" },
    });
    expect(audit[0].actorUserId).toBeUndefined();

    // Again: still ok, still cancelled, nothing rewritten, no second audit row.
    vi.setSystemTime(T0 + 10 * MINUTE);
    expect(await cancelByLink(env.t, args.cancelToken)).toEqual({ ok: true, status: "cancelled" });
    const [again] = await reservationRows(env.t);
    expect(again.cancelledAt).toBe(T0 + 5 * MINUTE);
    expect(again.updatedAt).toBe(row.updatedAt);
    expect(await auditRows(env.t, "reservation.cancelled")).toHaveLength(1);
  });

  test("a bogus, malformed or foreign token → reservation/not_found, and nothing changes", async () => {
    const env = await world();
    await openForm(env);
    const { args } = await mustSubmit(env.t);
    const notFound = { ok: false, code: RESERVATION_ERROR.notFound };
    expect(await cancelByLink(env.t, newMenuToken())).toEqual(notFound);
    expect(await cancelByLink(env.t, "kratak")).toEqual(notFound);
    expect(await cancelByLink(env.t, args.cancelToken, SLUG_B)).toEqual(notFound); // venue a's token at venue b
    expect(await cancelByLink(env.t, args.cancelToken, "nema-takvog-lokala")).toEqual(notFound);
    expect(await cancelByLink(env.t, args.deviceToken)).toEqual(notFound);
    expect((await reservationRows(env.t))[0].status).toBe("new");
    expect(await auditRows(env.t, "reservation.cancelled")).toEqual([]);
  });

  test("a guest cancels an ACCEPTED reservation too (until it is realized)", async () => {
    const env = await world();
    await openForm(env);
    const { staffId, sessionToken } = await signedInStaff(env, "Ana", "246");
    const { args, reservationId } = await mustSubmit(env.t);
    expect(
      await env.t.mutation(api.menuReservations.accept, { ...panelOf(env, sessionToken), reservationId }),
    ).toEqual({ ok: true, status: "accepted", changed: true });

    expect(await view(env.t, args.cancelToken)).toMatchObject({ status: "accepted", canCancel: true });
    expect(await cancelByLink(env.t, args.cancelToken)).toEqual({ ok: true, status: "cancelled" });
    const [row] = await reservationRows(env.t);
    expect(row).toMatchObject({ status: "cancelled", cancelledBy: "guest", decidedByStaffId: staffId });
  });

  test("after the guests arrived (staff markArrived) the reservation can no longer be cancelled", async () => {
    const env = await world();
    await openForm(env);
    const { sessionToken } = await signedInStaff(env, "Ana", "246");
    const { args, reservationId } = await mustSubmit(env.t);
    await env.t.mutation(api.menuReservations.accept, { ...panelOf(env, sessionToken), reservationId });
    expect(
      await env.t.mutation(api.menuReservations.markArrived, { ...panelOf(env, sessionToken), reservationId }),
    ).toEqual({ ok: true, status: "arrived", changed: true });

    expect(await view(env.t, args.cancelToken)).toMatchObject({ status: "arrived", canCancel: false });
    expect(await cancelByLink(env.t, args.cancelToken)).toEqual({ ok: false, code: RESERVATION_ERROR.notCancellable });
    const [row] = await reservationRows(env.t);
    expect(row.status).toBe("arrived");
    expect(row.cancelledAt).toBeUndefined();
    expect(await auditRows(env.t, "reservation.cancelled")).toEqual([]);
  });

  test("a declined reservation can no longer be cancelled", async () => {
    const env = await world();
    await openForm(env);
    const { sessionToken } = await signedInStaff(env, "Ana", "246");
    const { args, reservationId } = await mustSubmit(env.t);
    await env.t.mutation(api.menuReservations.decline, { ...panelOf(env, sessionToken), reservationId });

    expect(await view(env.t, args.cancelToken)).toMatchObject({ status: "declined", canCancel: false });
    expect(await cancelByLink(env.t, args.cancelToken)).toEqual({ ok: false, code: RESERVATION_ERROR.notCancellable });
    expect((await reservationRows(env.t))[0].status).toBe("declined");
  });

  test("the link is throttled per address: the 11th attempt within a minute → rate_limited", async () => {
    const env = await world();
    await openForm(env);
    const { args } = await mustSubmit(env.t);
    const ipHash = ipOf(7400);
    for (let i = 0; i < 10; i += 1) {
      expect(await cancelByLink(env.t, newMenuToken(), SLUG_A, ipHash), String(i)).toEqual({
        ok: false,
        code: RESERVATION_ERROR.notFound,
      });
    }
    // Even the right token is refused for that address now, and nothing is cancelled.
    expect(await cancelByLink(env.t, args.cancelToken, SLUG_A, ipHash)).toEqual({
      ok: false,
      code: RESERVATION_ERROR.rateLimited,
    });
    expect((await reservationRows(env.t))[0].status).toBe("new");
    // Another address, or a minute later, works.
    expect(await cancelByLink(env.t, args.cancelToken, SLUG_A, ipOf(7401))).toEqual({ ok: true, status: "cancelled" });
  });
});

// =============================================================================
// 9. "Moji zahtevi"
// =============================================================================

describe("mine and cancelByDevice", () => {
  test("mine returns this device's reservations, newest first, with no contact, name or table", async () => {
    const env = await world();
    await openForm(env);
    const deviceToken = newMenuToken();
    const first = await mustSubmit(env.t, { deviceToken, requestedAt: belgrade("2026-10-22T19:00"), note: "Alergija" });
    vi.setSystemTime(T0 + 5 * MINUTE);
    const second = await mustSubmit(env.t, { deviceToken, requestedAt: belgrade("2026-10-22T20:30"), partySize: 2 });

    const deviceKey = await deviceKeyHashFor(env.w.a.menuServiceId, deviceToken);
    const mine = must(await mineOf(env.t, deviceKey), "the device's reservations");
    expect(mine.map((item) => item.id)).toEqual([second.reservationId, first.reservationId]);
    expect(mine[0]).toEqual({
      id: second.reservationId,
      status: "new",
      requestedAt: belgrade("2026-10-22T20:30"),
      partySize: 2,
      createdAt: T0 + 5 * MINUTE,
      proposedAt: null,
      proposalNote: null,
      decidedAt: null,
      arrivedAt: null,
      cancelledAt: null,
      cancelledBy: null,
    });
    for (const item of mine) {
      expect(Object.keys(item).sort()).toEqual([
        "arrivedAt",
        "cancelledAt",
        "cancelledBy",
        "createdAt",
        "decidedAt",
        "id",
        "partySize",
        "proposalNote",
        "proposedAt",
        "requestedAt",
        "status",
      ]);
    }
    const text = JSON.stringify(mine);
    for (const secret of ["Marija", "gost@example.com", "+381", "Alergija", "positionId", "guestName", first.args.cancelToken, deviceKey, deviceToken]) {
      expect(text, secret).not.toContain(secret);
    }
  });

  test("mine: a malformed key → null, another device → [], another venue or unknown slug → no data", async () => {
    const env = await world();
    await openForm(env);
    const deviceToken = newMenuToken();
    await mustSubmit(env.t, { deviceToken });
    const deviceKey = await deviceKeyHashFor(env.w.a.menuServiceId, deviceToken);
    expect(await mineOf(env.t, deviceKey)).toHaveLength(1); // baseline

    // Malformed: not 64 lowercase hex characters.
    for (const bad of ["", "abc", deviceKey.slice(1), deviceKey.toUpperCase(), `${deviceKey}0`, deviceToken]) {
      expect(await mineOf(env.t, bad), bad).toBeNull();
    }
    // Another device's (well-formed) key sees nothing.
    expect(await mineOf(env.t, await deviceKeyHashFor(env.w.a.menuServiceId, newMenuToken()))).toEqual([]);
    // The same browser is a different pseudonym at another venue: its key from venue a lists nothing at venue b.
    expect(await mineOf(env.t, deviceKey, SLUG_B)).toEqual([]);
    expect(await mineOf(env.t, deviceKey, "nema-takvog-lokala")).toBeNull();
  });

  test("mine lists at most 10, the newest", async () => {
    const env = await world();
    await openForm(env);
    const deviceKey = await deviceKeyHashFor(env.w.a.menuServiceId, newMenuToken());
    await env.t.run(async (ctx) => {
      for (let i = 0; i < MENU_MAX_MY_RESERVATIONS + 2; i += 1) {
        await ctx.db.insert("menuReservations", {
          menuServiceId: env.w.a.menuServiceId,
          businessId: env.w.a.businessId,
          status: "new",
          guestName: `Gost ${i}`,
          partySize: 2,
          requestedAt: THU_19,
          cancelTokenHash: `seeded-hash-${i}`,
          deviceKeyHash: deviceKey,
          createdAt: T0 + i * MINUTE,
          updatedAt: T0 + i * MINUTE,
        });
      }
    });
    const mine = must(await mineOf(env.t, deviceKey));
    expect(mine).toHaveLength(MENU_MAX_MY_RESERVATIONS);
    expect(mine[0].createdAt).toBe(T0 + (MENU_MAX_MY_RESERVATIONS + 1) * MINUTE);
    expect(mine[mine.length - 1].createdAt).toBe(T0 + 2 * MINUTE);
  });

  test("cancelByDevice: own reservation → cancelled and audited; again → ok", async () => {
    const env = await world();
    await openForm(env);
    const deviceToken = newMenuToken();
    const { reservationId } = await mustSubmit(env.t, { deviceToken });
    expect(await cancelByDevice(env.t, deviceToken, reservationId)).toEqual({ ok: true, status: "cancelled" });
    const [row] = await reservationRows(env.t);
    expect(row).toMatchObject({ status: "cancelled", cancelledBy: "guest", cancelledAt: T0 });
    const audit = await auditRows(env.t, "reservation.cancelled");
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actorKind: "guest", entityKey: reservationId });
    expect(await cancelByDevice(env.t, deviceToken, reservationId)).toEqual({ ok: true, status: "cancelled" });
    expect(await auditRows(env.t, "reservation.cancelled")).toHaveLength(1);

    const deviceKey = await deviceKeyHashFor(env.w.a.menuServiceId, deviceToken);
    expect(await mineOf(env.t, deviceKey)).toMatchObject([{ status: "cancelled", cancelledBy: "guest", cancelledAt: T0 }]);
  });

  test("cancelByDevice: another device, another venue's slug, a malformed id or a foreign id → not_found", async () => {
    const env = await world();
    await openForm(env);
    const deviceToken = newMenuToken();
    const { reservationId, args } = await mustSubmit(env.t, { deviceToken });
    const stranger = newMenuToken();
    const notFound = { ok: false, code: RESERVATION_ERROR.notFound };

    expect(await cancelByDevice(env.t, stranger, reservationId)).toEqual(notFound);
    expect(await cancelByDevice(env.t, deviceToken, reservationId, SLUG_B)).toEqual(notFound);
    expect(await cancelByDevice(env.t, deviceToken, reservationId, "nema-takvog-lokala")).toEqual(notFound);
    expect(await cancelByDevice(env.t, "kratak", reservationId)).toEqual(notFound);
    expect(await cancelByDevice(env.t, deviceToken, "nije-id")).toEqual(notFound);
    expect(await cancelByDevice(env.t, deviceToken, env.w.a.menuServiceId)).toEqual(notFound); // an id of another table
    // The cancel token is not a device token.
    expect(await cancelByDevice(env.t, args.cancelToken, reservationId)).toEqual(notFound);
    expect((await reservationRows(env.t))[0].status).toBe("new");
    expect(await auditRows(env.t, "reservation.cancelled")).toEqual([]);
  });

  test("cancelByDevice: the same device at venue b cannot reach venue a's reservation, and a realized one is not cancellable", async () => {
    const env = await world();
    await openForm(env);
    const { sessionToken } = await signedInStaff(env, "Ana", "246");
    const deviceToken = newMenuToken();
    const { reservationId } = await mustSubmit(env.t, { deviceToken });
    // The same phone, venue b's slug: a different pseudonym there, and the row is venue a's.
    expect(await cancelByDevice(env.t, deviceToken, reservationId, SLUG_B)).toEqual({
      ok: false,
      code: RESERVATION_ERROR.notFound,
    });

    await env.t.mutation(api.menuReservations.accept, { ...panelOf(env, sessionToken), reservationId });
    await env.t.mutation(api.menuReservations.markArrived, { ...panelOf(env, sessionToken), reservationId });
    expect(await cancelByDevice(env.t, deviceToken, reservationId)).toEqual({
      ok: false,
      code: RESERVATION_ERROR.notCancellable,
    });
  });
});

// =============================================================================
// 10. the Venue product is untouched
// =============================================================================

describe("the Venue product's reservations are never touched", () => {
  test("after a full guest and staff flow venueReservations is empty", async () => {
    const env = await world();
    await openForm(env);
    const { sessionToken } = await signedInStaff(env, "Ana", "246");
    const deviceToken = newMenuToken();
    const kept = await mustSubmit(env.t, { deviceToken });
    const cancelled = await mustSubmit(env.t, { deviceToken });
    const declined = await mustSubmit(env.t);

    await env.t.query(api.menuReservations.publicEntry, { slug: SLUG_A });
    await view(env.t, kept.args.cancelToken);
    await mineOf(env.t, await deviceKeyHashFor(env.w.a.menuServiceId, deviceToken));
    await cancelByLink(env.t, cancelled.args.cancelToken);
    await env.t.mutation(api.menuReservations.accept, { ...panelOf(env, sessionToken), reservationId: kept.reservationId });
    await env.t.mutation(api.menuReservations.markArrived, { ...panelOf(env, sessionToken), reservationId: kept.reservationId });
    await env.t.mutation(api.menuReservations.decline, { ...panelOf(env, sessionToken), reservationId: declined.reservationId });
    expect((await reservationRows(env.t)).map((row) => row.status).sort()).toEqual(["arrived", "cancelled", "declined"]);

    expect(await env.t.run(async (ctx) => await ctx.db.query("venueReservations").take(10))).toEqual([]);
  });

  test("the source of convex/menuReservations.ts and of its writer never refers to venueReservations (comments aside)", () => {
    // Not vacuous: the glob really found the two modules.
    expect(Object.keys(sources).sort()).toEqual(["./lib/menuReservationWriter.ts", "./menuReservations.ts"]);
    for (const [file, text] of Object.entries(sources)) {
      expect(text.length, file).toBeGreaterThan(500);
      // A comment may NAME the Venue module to say the two are separate; code may not use it.
      const code = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
      expect(code, file).not.toContain("venueReservations");
    }
  });
});
