/// <reference types="vite/client" />

// ScanMe Menu V1 — K25: the reservation SETTINGS (master §11.1, §11.2, §11.5,
// §11.6, §13.7, §13.9; plan docs/meni/planovi/K24.md K24-7…K24-9, K24-16):
// `menuSettings.setWorkingHours` / `workingHours` (always in Podešavanja),
// `menuSettings.setReservationHold` (how long the venue holds a reservation after
// its time) and `menuServices.setReservations` (Funkcionalnosti: no reservations,
// the ScanMe form, or the venue's own system by an https link), plus the
// `reservation` config the panel shell reads from `menuServices.context`.
// Proven here: who may change what (Owner, Manager, ScanMe admin; not an Urednik,
// finance, view-only, outsiders, another venue's owner), the hours rules, the
// validation of the link, that switching away from the form keeps the contact and
// the link and never deletes the requests already sent, and the audit trail.
//
// Time is frozen (fake timers, T0 = Wednesday 2026-10-21 10:00 Belgrade).
// Fictional tenants only (the repo is public): "Kafana kod Mike" (a), "Demo restoran" (b).

import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { belgradeLocalToEpoch } from "../lib/belgrade-time";
import { MENU_ERROR } from "../lib/menu/errors/core";
import { RESERVATION_ERROR } from "../lib/menu/errors/reservations";
import { STAFF_ERROR } from "../lib/menu/errors/waiter";
import { newMenuToken } from "../lib/menu/tokens";
import {
  SLUG_A,
  SLUG_B,
  TEST_ADMIN_EMAIL,
  TEST_ISSUER,
  seedMenuWorld,
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
const THU_19 = must(belgradeLocalToEpoch("2026-10-22T19:00"));

/** The code a refused call carries: a ConvexError's data, else the first code-looking text of the message. */
async function codeOf(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    if (error instanceof ConvexError && typeof error.data === "string") return error.data;
    const text = error instanceof Error ? error.message : String(error);
    return text.match(/\b(?:menu|reservation|staff)\/[a-z_]+/)?.[0] ?? text;
  }
}

type Hours = { days: { start: number; end: number }[][] };
const DAILY = [{ start: 12 * 60, end: 23 * 60 }];
const LATE = [{ start: 12 * 60, end: 25 * 60 }]; // until 01:00 the next morning
/** Every day 12:00–23:00, Friday and Saturday until 01:00. Monday first. Seven open days. */
const WEEK: Hours = { days: [DAILY, DAILY, DAILY, DAILY, LATE, LATE, DAILY] };
/** Five open days. */
const WEEK_SHORT: Hours = { days: [DAILY, DAILY, DAILY, DAILY, DAILY, [], []] };
/** Monday only, a lunch and a dinner interval. One open day. */
const WEEK_SPLIT: Hours = {
  days: [
    [
      { start: 10 * 60, end: 15 * 60 },
      { start: 17 * 60, end: 23 * 60 },
    ],
    [],
    [],
    [],
    [],
    [],
    [],
  ],
};
const CLOSED_WEEK: Hours = { days: [[], [], [], [], [], [], []] };

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

const setHours = (who: Caller, menuServiceId: Id<"menuServices">, workingHours: Hours) =>
  who.mutation(api.menuSettings.setWorkingHours, { menuServiceId, workingHours });
const hoursOf = (who: Caller, menuServiceId: Id<"menuServices">) =>
  who.query(api.menuSettings.workingHours, { menuServiceId });
const setHold = (who: Caller, menuServiceId: Id<"menuServices">, holdMinutes: number) =>
  who.mutation(api.menuSettings.setReservationHold, { menuServiceId, holdMinutes });
const setReservations = (
  who: Caller,
  menuServiceId: Id<"menuServices">,
  input: { mode: "off" | "form" | "external"; contact?: "email" | "phone" | "both"; externalUrl?: string },
) => who.mutation(api.menuServices.setReservations, { menuServiceId, ...input });
const contextOf = (who: Caller, slug = SLUG_A) => who.query(api.menuServices.context, { businessSlug: slug });

const serviceOf = (env: Env, menuServiceId = env.w.a.menuServiceId) =>
  env.t.run(async (ctx) => must(await ctx.db.get(menuServiceId), "the Menu service"));
const auditRows = async (env: Env, action: string) =>
  (await env.t.run(async (ctx) => await ctx.db.query("menuAuditLog").take(5000))).filter((row) => row.action === action);
const reservationRows = (env: Env) => env.t.run(async (ctx) => await ctx.db.query("menuReservations").take(500));

/** The people who may NOT change the settings of venue a, with the code they get. */
function refusedCallers(env: Env): [string, Caller, string][] {
  const { t, w } = env;
  return [
    ["editor", as(t, w.editorId), MENU_ERROR.forbidden],
    ["finance", as(t, w.financeId), MENU_ERROR.notFound],
    ["viewOnly", as(t, w.viewOnlyId), MENU_ERROR.notFound],
    ["outsider", as(t, w.outsiderId), MENU_ERROR.notFound],
    ["otherOwner", as(t, w.otherOwnerId), MENU_ERROR.notFound],
    ["anonymous", t, MENU_ERROR.unauthenticated],
  ];
}

// =============================================================================
// 1. setWorkingHours and the workingHours query
// =============================================================================

describe("setWorkingHours", () => {
  test("the Owner, a Manager and a ScanMe admin save the week; it reads back; each save is audited with the actor", async () => {
    const env = await world();
    const id = env.w.a.menuServiceId;
    expect(await hoursOf(env.owner, id)).toEqual({ workingHours: null, holdMinutes: 15 });

    expect(await setHours(env.owner, id, WEEK)).toEqual({ ok: true });
    expect(await hoursOf(env.owner, id)).toEqual({ workingHours: WEEK, holdMinutes: 15 });
    expect((await serviceOf(env)).settings?.workingHours).toEqual(WEEK);

    vi.setSystemTime(T0 + MINUTE);
    expect(await setHours(as(env.t, env.w.managerId), id, WEEK_SHORT)).toEqual({ ok: true });
    expect(await hoursOf(env.owner, id)).toEqual({ workingHours: WEEK_SHORT, holdMinutes: 15 });

    vi.setSystemTime(T0 + 2 * MINUTE);
    expect(await setHours(as(env.t, env.w.adminId), id, WEEK_SPLIT)).toEqual({ ok: true });
    expect(await hoursOf(env.owner, id)).toEqual({ workingHours: WEEK_SPLIT, holdMinutes: 15 });

    const audit = (await auditRows(env, "settings.working_hours_changed")).sort((a, b) => a.createdAt - b.createdAt);
    expect(audit).toHaveLength(3);
    expect(audit.map((row) => row.actorKind)).toEqual(["user", "user", "admin"]);
    expect(audit.map((row) => row.actorUserId)).toEqual([env.w.ownerId, env.w.managerId, env.w.adminId]);
    expect(audit.map((row) => row.details)).toEqual([{ openDays: 7 }, { openDays: 5 }, { openDays: 1 }]);
    for (const row of audit) {
      expect(row).toMatchObject({ menuServiceId: id, entityType: "menuServices" });
    }
  });

  // Asserts the CORRECT behaviour (the same week again is a no-op, like setReservationHold and
  // setReservations). Currently RED: convex/menuSettings.ts compares JSON.stringify(stored) with
  // JSON.stringify(next), but a stored interval comes back with sorted keys ({"end":…,"start":…})
  // while `next` is built as {start, end}, so the strings never match (see the final report).
  test("saving the same week again writes nothing and is not audited again", async () => {
    const env = await world();
    const id = env.w.a.menuServiceId;
    await setHours(env.owner, id, WEEK);
    const stamp = (await serviceOf(env)).updatedAt;
    vi.setSystemTime(T0 + 5 * MINUTE);
    expect(await setHours(env.owner, id, WEEK)).toEqual({ ok: true });
    expect((await serviceOf(env)).updatedAt).toBe(stamp);
    expect(await auditRows(env, "settings.working_hours_changed")).toHaveLength(1);
  });

  test("a closed week (seven empty days) is a valid week and is audited as a change", async () => {
    const env = await world();
    const id = env.w.a.menuServiceId;
    await setHours(env.owner, id, WEEK);
    expect(await setHours(env.owner, id, CLOSED_WEEK)).toEqual({ ok: true });
    expect(await hoursOf(env.owner, id)).toEqual({ workingHours: CLOSED_WEEK, holdMinutes: 15 });
    const audit = await auditRows(env, "settings.working_hours_changed");
    expect(audit.map((row) => row.details)).toContainEqual({ openDays: 0 });
  });

  test("an Urednik, finance, view-only, an outsider, another venue's owner and anonymous callers are refused; nothing is saved", async () => {
    const env = await world();
    const id = env.w.a.menuServiceId;
    for (const [name, who, code] of refusedCallers(env)) {
      expect(await codeOf(setHours(who, id, WEEK)), name).toBe(code);
    }
    await expect(setHours(as(env.t, env.w.editorId), id, WEEK)).rejects.toThrow(MENU_ERROR.forbidden);
    expect((await serviceOf(env)).settings?.workingHours).toBeUndefined();
    expect(await auditRows(env, "settings.working_hours_changed")).toEqual([]);
  });

  test("the Owner of venue a cannot change venue b's hours, and venue b's owner changes only b's", async () => {
    const env = await world();
    expect(await codeOf(setHours(env.owner, env.w.b.menuServiceId, WEEK))).toBe(MENU_ERROR.notFound);
    const other = as(env.t, env.w.otherOwnerId);
    expect(await setHours(other, env.w.b.menuServiceId, WEEK_SHORT)).toEqual({ ok: true });
    expect(await hoursOf(other, env.w.b.menuServiceId)).toEqual({ workingHours: WEEK_SHORT, holdMinutes: 15 });
    expect(await hoursOf(env.owner, env.w.a.menuServiceId)).toEqual({ workingHours: null, holdMinutes: 15 });
    expect(await hoursOf(env.owner, env.w.b.menuServiceId)).toBeNull(); // not a's to read
  });

  test("invalid hours throw reservation/hours_invalid and save nothing", async () => {
    const env = await world();
    const id = env.w.a.menuServiceId;
    const day = (...intervals: [number, number][]) => intervals.map(([start, end]) => ({ start, end }));
    const week = (monday: { start: number; end: number }[], tuesday: { start: number; end: number }[] = []): Hours => ({
      days: [monday, tuesday, [], [], [], [], []],
    });
    const invalid: [string, Hours][] = [
      ["two overlapping intervals", week(day([720, 900], [800, 1000]))],
      ["intervals out of order", week(day([900, 1000], [720, 800]))],
      ["four intervals in a day", week(day([60, 120], [180, 240], [300, 360], [420, 480]))],
      ["an end beyond 30:00", week(day([720, 1805]))],
      ["an end at 30:05", week(day([1500, 1805]))],
      ["6 days", { days: [DAILY, DAILY, DAILY, DAILY, DAILY, DAILY] }],
      ["8 days", { days: [DAILY, DAILY, DAILY, DAILY, DAILY, DAILY, DAILY, DAILY] }],
      ["no days", { days: [] }],
      ["a start that is not a multiple of 5 minutes", week(day([723, 900]))],
      ["an end that is not a multiple of 5 minutes", week(day([720, 903]))],
      ["an end before the start", week(day([900, 720]))],
      ["an empty interval", week(day([900, 900]))],
      ["a start at midnight of the next day", week(day([1440, 1500]))],
      ["a negative start", week(day([-60, 120]))],
      ["a fractional start", week(day([720.5, 900]))],
      ["an interval past midnight running into Tuesday's first interval", week(day([1200, 1500]), day([30, 300]))],
      ["Sunday past midnight running into Monday's first interval", { days: [day([30, 300]), [], [], [], [], [], day([1200, 1500])] }],
    ];
    for (const [name, hours] of invalid) {
      expect(await codeOf(setHours(env.owner, id, hours)), name).toBe(RESERVATION_ERROR.hoursInvalid);
    }
    await expect(setHours(env.owner, id, week(day([720, 900], [800, 1000])))).rejects.toThrow(RESERVATION_ERROR.hoursInvalid);
    expect((await serviceOf(env)).settings?.workingHours).toBeUndefined();
    expect(await auditRows(env, "settings.working_hours_changed")).toEqual([]);
    expect(await hoursOf(env.owner, id)).toEqual({ workingHours: null, holdMinutes: 15 });
  });

  test("the edges of a valid week are accepted", async () => {
    const env = await world();
    const id = env.w.a.menuServiceId;
    const day = (...intervals: [number, number][]) => intervals.map(([start, end]) => ({ start, end }));
    const valid: [string, Hours][] = [
      ["touching intervals", { days: [day([720, 900], [900, 1000]), [], [], [], [], [], []] }],
      ["three intervals", { days: [day([60, 120], [180, 240], [300, 360]), [], [], [], [], [], []] }],
      ["an end at exactly 30:00", { days: [day([1380, 1800]), [], [], [], [], [], []] }],
      ["an interval past midnight just before the next day's first interval", { days: [day([1200, 1500]), day([60, 120]), [], [], [], [], []] }],
      ["Sunday past midnight into Monday", { days: [day([60, 120]), [], [], [], [], [], day([1200, 1500])] }],
      ["the last start of the day", { days: [day([1435, 1440]), [], [], [], [], [], []] }],
    ];
    for (const [name, hours] of valid) {
      expect(await codeOf(setHours(env.owner, id, hours)), name).toBeNull();
      expect((await hoursOf(env.owner, id))?.workingHours, name).toEqual(hours);
    }
  });

  test("the workingHours query: the Urednik may read (menu.read); finance, outsiders and anonymous callers get null", async () => {
    const env = await world();
    const id = env.w.a.menuServiceId;
    await setHours(env.owner, id, WEEK);
    await setHold(env.owner, id, 30);
    const expected = { workingHours: WEEK, holdMinutes: 30 };
    for (const userId of [env.w.ownerId, env.w.managerId, env.w.editorId, env.w.adminId]) {
      expect(await hoursOf(as(env.t, userId), id)).toEqual(expected);
    }
    for (const userId of [env.w.financeId, env.w.viewOnlyId, env.w.outsiderId, env.w.otherOwnerId]) {
      expect(await hoursOf(as(env.t, userId), id)).toBeNull();
    }
    expect(await hoursOf(env.t, id)).toBeNull();
  });
});

// =============================================================================
// 2. setReservationHold
// =============================================================================

describe("setReservationHold", () => {
  test("5 to 180 minutes are accepted and read back everywhere; the default is 15", async () => {
    const env = await world();
    const id = env.w.a.menuServiceId;
    expect((await hoursOf(env.owner, id))?.holdMinutes).toBe(15);
    for (const minutes of [5, 20, 15, 180, 45]) {
      expect(await setHold(env.owner, id, minutes), String(minutes)).toEqual({ ok: true });
      expect((await hoursOf(env.owner, id))?.holdMinutes).toBe(minutes);
      expect(must(await contextOf(env.owner)).reservation.holdMinutes).toBe(minutes);
    }
    // The Manager and a ScanMe admin may too.
    expect(await setHold(as(env.t, env.w.managerId), id, 60)).toEqual({ ok: true });
    expect(await setHold(as(env.t, env.w.adminId), id, 90)).toEqual({ ok: true });
    expect((await hoursOf(env.owner, id))?.holdMinutes).toBe(90);
    // Operational: not audited.
    expect((await env.t.run(async (ctx) => await ctx.db.query("menuAuditLog").take(5000))).filter((row) => /hold|reservation/i.test(row.action))).toEqual([]);
  });

  test("4, 181, 1.5, 0 and negative values throw menu/invalid_input; nothing is saved", async () => {
    const env = await world();
    const id = env.w.a.menuServiceId;
    await setHold(env.owner, id, 25);
    for (const bad of [4, 181, 1.5, 0, -15, 1000, 5.5]) {
      expect(await codeOf(setHold(env.owner, id, bad)), String(bad)).toBe(MENU_ERROR.invalidInput);
    }
    await expect(setHold(env.owner, id, 181)).rejects.toThrow(MENU_ERROR.invalidInput);
    expect((await hoursOf(env.owner, id))?.holdMinutes).toBe(25);
  });

  test("an Urednik, finance, view-only, an outsider, another venue's owner and anonymous callers are refused", async () => {
    const env = await world();
    const id = env.w.a.menuServiceId;
    for (const [name, who, code] of refusedCallers(env)) {
      expect(await codeOf(setHold(who, id, 30)), name).toBe(code);
    }
    expect((await hoursOf(env.owner, id))?.holdMinutes).toBe(15);
    expect((await serviceOf(env)).settings?.reservation).toBeUndefined();
  });

  test("the hold and the contact/link live together: neither write drops the other", async () => {
    const env = await world();
    const id = env.w.a.menuServiceId;
    // Hold first, then the reservation switch.
    await setHold(env.owner, id, 25);
    expect((await serviceOf(env)).settings?.reservation).toEqual({ contact: "both", holdMinutes: 25 });
    await setReservations(env.owner, id, { mode: "external", contact: "email", externalUrl: "https://rezervacije.example.com/kafana" });
    expect((await serviceOf(env)).settings?.reservation).toEqual({
      contact: "email",
      externalUrl: "https://rezervacije.example.com/kafana",
      holdMinutes: 25,
    });
    // The switch first, then the hold.
    await setHold(env.owner, id, 40);
    expect((await serviceOf(env)).settings?.reservation).toEqual({
      contact: "email",
      externalUrl: "https://rezervacije.example.com/kafana",
      holdMinutes: 40,
    });
    // The working hours are a sibling key and survive both.
    await setHours(env.owner, id, WEEK);
    await setHold(env.owner, id, 50);
    await setReservations(env.owner, id, { mode: "form" });
    const settings = (await serviceOf(env)).settings;
    expect(settings?.workingHours).toEqual(WEEK);
    expect(settings?.reservation).toMatchObject({ holdMinutes: 50, contact: "email" });
  });

  test("setting the same hold again writes nothing", async () => {
    const env = await world();
    const id = env.w.a.menuServiceId;
    await setHold(env.owner, id, 30);
    const stamp = (await serviceOf(env)).updatedAt;
    vi.setSystemTime(T0 + 5 * MINUTE);
    expect(await setHold(env.owner, id, 30)).toEqual({ ok: true });
    expect((await serviceOf(env)).updatedAt).toBe(stamp);
  });
});

// =============================================================================
// 3. setReservations
// =============================================================================

describe("setReservations", () => {
  test("the form needs the working hours first: reservation/hours_missing (also over a closed week)", async () => {
    const env = await world();
    const id = env.w.a.menuServiceId;
    expect(await setReservations(env.owner, id, { mode: "form", contact: "both" })).toEqual({
      ok: false,
      code: RESERVATION_ERROR.hoursMissing,
    });
    await setHours(env.owner, id, CLOSED_WEEK);
    expect(await setReservations(env.owner, id, { mode: "form" })).toEqual({ ok: false, code: RESERVATION_ERROR.hoursMissing });
    expect((await serviceOf(env)).features.reservations).toBe("off");
    expect(await auditRows(env, "reservation.mode_changed")).toEqual([]);

    await setHours(env.owner, id, WEEK);
    expect(await setReservations(env.owner, id, { mode: "form" })).toEqual({ ok: true, changed: true });
    expect((await serviceOf(env)).features.reservations).toBe("form");
  });

  test("external needs a link: none, blank → reservation/url_invalid", async () => {
    const env = await world();
    const id = env.w.a.menuServiceId;
    const urlInvalid = { ok: false, code: RESERVATION_ERROR.urlInvalid };
    expect(await setReservations(env.owner, id, { mode: "external" })).toEqual(urlInvalid);
    expect(await setReservations(env.owner, id, { mode: "external", externalUrl: "" })).toEqual(urlInvalid);
    expect(await setReservations(env.owner, id, { mode: "external", externalUrl: "   " })).toEqual(urlInvalid);
    expect((await serviceOf(env)).features.reservations).toBe("off");
    expect((await serviceOf(env)).settings?.reservation).toBeUndefined();
  });

  test("a link that is not a plain https address is refused: http, localhost, credentials, other schemes, bare words, spaces, too long", async () => {
    const env = await world();
    const id = env.w.a.menuServiceId;
    const bad = [
      "http://rezervacije.example.com/kafana",
      "HTTP://rezervacije.example.com",
      "https://localhost/rezervacije",
      "https://rezervacije/kafana",
      "ftp://rezervacije.example.com/kafana",
      "javascript:alert(1)",
      "//rezervacije.example.com/kafana",
      "rezervacije.example.com/kafana",
      "https://user:lozinka@rezervacije.example.com/kafana",
      "https://rezervacije .example.com/kafana",
      "https://rezervacije.example.com/ kafana",
      `https://rezervacije.example.com/${"a".repeat(500)}`,
    ];
    for (const externalUrl of bad) {
      expect(await setReservations(env.owner, id, { mode: "external", externalUrl }), externalUrl).toEqual({
        ok: false,
        code: RESERVATION_ERROR.urlInvalid,
      });
    }
    // A bad link is refused whatever the mode is, and the earlier good link survives it.
    expect(await setReservations(env.owner, id, { mode: "external", externalUrl: "https://rezervacije.example.com/kafana" })).toEqual({
      ok: true,
      changed: true,
    });
    expect(await setReservations(env.owner, id, { mode: "off", externalUrl: "http://rezervacije.example.com" })).toEqual({
      ok: false,
      code: RESERVATION_ERROR.urlInvalid,
    });
    const service = await serviceOf(env);
    expect(service.features.reservations).toBe("external");
    expect(service.settings?.reservation?.externalUrl).toBe("https://rezervacije.example.com/kafana");
    expect(await auditRows(env, "reservation.mode_changed")).toHaveLength(1);
  });

  test("an https link is accepted and stored normalized; the public entry offers it", async () => {
    const env = await world();
    const id = env.w.a.menuServiceId;
    expect(await setReservations(env.owner, id, { mode: "external", externalUrl: "  https://Rezervacije.Example.com  " })).toEqual({
      ok: true,
      changed: true,
    });
    const service = await serviceOf(env);
    expect(service.features.reservations).toBe("external");
    expect(service.settings?.reservation?.externalUrl).toBe("https://rezervacije.example.com/");
    expect(await env.t.query(api.menuReservations.publicEntry, { slug: SLUG_A })).toEqual({
      mode: "external",
      url: "https://rezervacije.example.com/",
    });
    // A path and a query stay as they are.
    await setReservations(env.owner, id, { mode: "external", externalUrl: "https://rezervacije.example.com/sto?lokal=kafana-kod-mike" });
    expect((await serviceOf(env)).settings?.reservation?.externalUrl).toBe("https://rezervacije.example.com/sto?lokal=kafana-kod-mike");
  });

  test("switching to off keeps the contact and the link; switching on again restores them", async () => {
    const env = await world();
    const id = env.w.a.menuServiceId;
    await setHours(env.owner, id, WEEK);
    await setReservations(env.owner, id, { mode: "external", contact: "phone", externalUrl: "https://rezervacije.example.com/kafana" });

    expect(await setReservations(env.owner, id, { mode: "off" })).toEqual({ ok: true, changed: true });
    let service = await serviceOf(env);
    expect(service.features.reservations).toBe("off");
    expect(service.settings?.reservation).toEqual({ contact: "phone", externalUrl: "https://rezervacije.example.com/kafana" });
    expect(await env.t.query(api.menuReservations.publicEntry, { slug: SLUG_A })).toEqual({ mode: "off" });

    // Back to the link without sending it again; then to the form with the same contact.
    expect(await setReservations(env.owner, id, { mode: "external" })).toEqual({ ok: true, changed: true });
    expect(await env.t.query(api.menuReservations.publicEntry, { slug: SLUG_A })).toEqual({
      mode: "external",
      url: "https://rezervacije.example.com/kafana",
    });
    expect(await setReservations(env.owner, id, { mode: "form" })).toEqual({ ok: true, changed: true });
    expect(await env.t.query(api.menuReservations.publicEntry, { slug: SLUG_A })).toEqual({
      mode: "form",
      contact: "phone",
      workingHours: WEEK,
    });
    service = await serviceOf(env);
    expect(service.settings?.reservation?.externalUrl).toBe("https://rezervacije.example.com/kafana");

    // A blank link clears the stored one.
    expect(await setReservations(env.owner, id, { mode: "form", externalUrl: "" })).toEqual({ ok: true, changed: true });
    expect((await serviceOf(env)).settings?.reservation).toEqual({ contact: "phone" });
  });

  test("the contact defaults to both; changing only the contact is a change", async () => {
    const env = await world();
    const id = env.w.a.menuServiceId;
    await setHours(env.owner, id, WEEK);
    await setReservations(env.owner, id, { mode: "form" });
    expect((await serviceOf(env)).settings?.reservation?.contact).toBe("both");
    expect(await setReservations(env.owner, id, { mode: "form", contact: "email" })).toEqual({ ok: true, changed: true });
    expect((await serviceOf(env)).settings?.reservation?.contact).toBe("email");
    // The mode argument alone keeps the stored contact.
    await setReservations(env.owner, id, { mode: "off" });
    expect((await serviceOf(env)).settings?.reservation?.contact).toBe("email");
  });

  test("audited as reservation.mode_changed with from, to and the contact; the same call again changes and audits nothing", async () => {
    const env = await world();
    const id = env.w.a.menuServiceId;
    await setHours(env.owner, id, WEEK);
    vi.setSystemTime(T0 + MINUTE);
    await setReservations(env.owner, id, { mode: "form", contact: "email" });
    vi.setSystemTime(T0 + 2 * MINUTE);
    expect(await setReservations(env.owner, id, { mode: "form", contact: "email" })).toEqual({ ok: true, changed: false });
    expect(await setReservations(env.owner, id, { mode: "form" })).toEqual({ ok: true, changed: false });
    expect((await serviceOf(env)).updatedAt).toBe(T0 + MINUTE);

    vi.setSystemTime(T0 + 3 * MINUTE);
    await setReservations(env.owner, id, { mode: "external", externalUrl: "https://rezervacije.example.com/kafana" });
    await setReservations(env.owner, id, { mode: "off" });

    const audit = (await auditRows(env, "reservation.mode_changed")).sort((a, b) => a.createdAt - b.createdAt);
    expect(audit.map((row) => row.details)).toEqual([
      { from: "off", to: "form", contact: "email" },
      { from: "form", to: "external", contact: "email" },
      { from: "external", to: "off", contact: "email" },
    ]);
    for (const row of audit) {
      expect(row).toMatchObject({ menuServiceId: id, actorKind: "user", actorUserId: env.w.ownerId, entityType: "menuServices" });
    }
    // No link in the audit trail.
    expect(JSON.stringify(audit)).not.toContain("rezervacije.example.com");
  });

  test("the Owner, a Manager and a ScanMe admin may switch; the audit names the actor", async () => {
    const env = await world();
    const id = env.w.a.menuServiceId;
    await setHours(env.owner, id, WEEK);
    expect(await setReservations(as(env.t, env.w.managerId), id, { mode: "form" })).toEqual({ ok: true, changed: true });
    expect(await setReservations(as(env.t, env.w.adminId), id, { mode: "off" })).toEqual({ ok: true, changed: true });
    expect(await setReservations(env.owner, id, { mode: "form" })).toEqual({ ok: true, changed: true });
    const audit = (await auditRows(env, "reservation.mode_changed")).sort((a, b) => a.createdAt - b.createdAt);
    expect(audit.map((row) => row.actorKind).sort()).toEqual(["admin", "user", "user"]);
    expect(audit.find((row) => row.actorKind === "admin")?.actorUserId).toBe(env.w.adminId);
  });

  test("an Urednik, finance, view-only, an outsider, another venue's owner and anonymous callers are refused; nothing changes", async () => {
    const env = await world();
    const id = env.w.a.menuServiceId;
    await setHours(env.owner, id, WEEK);
    for (const [name, who, code] of refusedCallers(env)) {
      expect(await codeOf(setReservations(who, id, { mode: "form" })), name).toBe(code);
    }
    await expect(setReservations(as(env.t, env.w.editorId), id, { mode: "form" })).rejects.toThrow(MENU_ERROR.forbidden);
    await expect(setReservations(as(env.t, env.w.financeId), id, { mode: "form" })).rejects.toThrow(MENU_ERROR.notFound);
    expect((await serviceOf(env)).features.reservations).toBe("off");
    expect(await auditRows(env, "reservation.mode_changed")).toEqual([]);
  });

  test("an unknown mode or contact is refused by the validator", async () => {
    const env = await world();
    const id = env.w.a.menuServiceId;
    await setHours(env.owner, id, WEEK);
    await expect(
      env.owner.mutation(api.menuServices.setReservations, { menuServiceId: id, mode: "automatic" as never }),
    ).rejects.toThrow();
    await expect(
      env.owner.mutation(api.menuServices.setReservations, { menuServiceId: id, mode: "form", contact: "sms" as never }),
    ).rejects.toThrow();
    expect((await serviceOf(env)).features.reservations).toBe("off");
  });

  test("another venue's switch is not touched", async () => {
    const env = await world();
    await setHours(env.owner, env.w.a.menuServiceId, WEEK);
    await setReservations(env.owner, env.w.a.menuServiceId, { mode: "form", contact: "phone" });
    expect(await codeOf(setReservations(env.owner, env.w.b.menuServiceId, { mode: "off" }))).toBe(MENU_ERROR.notFound);
    expect((await serviceOf(env, env.w.b.menuServiceId)).features.reservations).toBe("off");
    expect(await env.t.query(api.menuReservations.publicEntry, { slug: SLUG_B })).toEqual({ mode: "off" });
  });
});

// =============================================================================
// 4. the config the panel reads: menuServices.context
// =============================================================================

describe("menuServices.context: reservation", () => {
  test("the defaults: off, both, no link, 15 minutes, no hours", async () => {
    const env = await world();
    expect(must(await contextOf(env.owner)).reservation).toEqual({
      mode: "off",
      contact: "both",
      externalUrl: null,
      holdMinutes: 15,
      workingHours: null,
    });
  });

  test("it follows the settings: mode, contact, link, hold and hours", async () => {
    const env = await world();
    const id = env.w.a.menuServiceId;
    await setHours(env.owner, id, WEEK);
    await setHold(env.owner, id, 30);
    await setReservations(env.owner, id, { mode: "form", contact: "email", externalUrl: "https://rezervacije.example.com/kafana" });
    const reservation = must(await contextOf(env.owner)).reservation;
    expect(reservation).toEqual({
      mode: "form",
      contact: "email",
      externalUrl: "https://rezervacije.example.com/kafana",
      holdMinutes: 30,
      workingHours: WEEK,
    });
    // The features block carries the same switch.
    expect(must(await contextOf(env.owner)).features.reservations).toBe("form");
    // Venue b has its own.
    expect(must(await contextOf(as(env.t, env.w.otherOwnerId), SLUG_B)).reservation.mode).toBe("off");
  });

  test("the Urednik reads it (menu.read); finance, outsiders and anonymous callers get null", async () => {
    const env = await world();
    expect(must(await contextOf(as(env.t, env.w.editorId))).reservation.mode).toBe("off");
    expect(must(await contextOf(as(env.t, env.w.managerId))).reservation.mode).toBe("off");
    for (const userId of [env.w.financeId, env.w.viewOnlyId, env.w.outsiderId, env.w.otherOwnerId]) {
      expect(await contextOf(as(env.t, userId))).toBeNull();
    }
    expect(await contextOf(env.t)).toBeNull();
  });
});

// =============================================================================
// 5. switching away from the form never deletes the requests already sent
// =============================================================================

describe("form → external: the requests already sent survive", () => {
  test("rows stay, the panel still lists and works them, the guest can still cancel; a new request is refused", async () => {
    const env = await world();
    const id = env.w.a.menuServiceId;
    await setHours(env.owner, id, WEEK);
    await setReservations(env.owner, id, { mode: "form" });

    let sent = 0;
    const send = async (overrides: { slug?: string } = {}) => {
      sent += 1;
      const cancelToken = newMenuToken();
      const result = await env.t.mutation(api.menuReservations.submit, {
        slug: overrides.slug ?? SLUG_A,
        deviceToken: newMenuToken(),
        clientRequestId: `req-${String(sent).padStart(8, "0")}`,
        cancelToken,
        guestName: "Marija Gost",
        partySize: 4,
        requestedAt: THU_19,
        contactEmail: "gost@example.com",
        contactPhone: "+381 60 000 0000",
        ipHash: sent.toString(16).padStart(32, "0"),
      });
      return { cancelToken, result };
    };
    const first = await send();
    const second = await send();
    if (!first.result.ok || !second.result.ok) throw new Error("both requests must be accepted");
    const owner = env.owner;
    const panel = { slug: SLUG_A, panelCode: env.code };
    const fromMs = T0 - 12 * HOUR;
    await owner.mutation(api.menuReservations.accept, { ...panel, reservationId: second.result.reservationId });

    // The venue switches to its own system.
    expect(
      await setReservations(env.owner, id, { mode: "external", externalUrl: "https://rezervacije.example.com/kafana" }),
    ).toEqual({ ok: true, changed: true });

    // The rows are still there, untouched.
    const rows = await reservationRows(env);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.status).sort()).toEqual(["accepted", "new"]);

    // The panel still lists both, and says how the venue takes reservations now.
    const listing = must(await owner.query(api.menuReservations.forPanel, { ...panel, fromMs }));
    expect(listing.mode).toBe("external");
    expect(listing.rows.map((row) => row.id).sort()).toEqual([first.result.reservationId, second.result.reservationId].sort());

    // Staff finish them.
    expect(await owner.mutation(api.menuReservations.accept, { ...panel, reservationId: first.result.reservationId })).toEqual({
      ok: true,
      status: "accepted",
      changed: true,
    });
    expect(
      await owner.mutation(api.menuReservations.markArrived, { ...panel, reservationId: first.result.reservationId }),
    ).toEqual({ ok: true, status: "arrived", changed: true });
    // The guest can still look and cancel through the link.
    expect(await env.t.query(api.menuReservations.byCancelToken, { slug: SLUG_A, token: second.cancelToken })).toMatchObject({
      status: "accepted",
      canCancel: true,
    });
    expect(await env.t.mutation(api.menuReservations.cancelByToken, { slug: SLUG_A, token: second.cancelToken })).toEqual({
      ok: true,
      status: "cancelled",
    });

    // A new request is refused: the venue's own system takes them now. Nothing is stored.
    const refused = await send();
    expect(refused.result).toEqual({ ok: false, code: RESERVATION_ERROR.off });
    expect(await reservationRows(env)).toHaveLength(2);
    expect(await env.t.query(api.menuReservations.publicEntry, { slug: SLUG_A })).toMatchObject({ mode: "external" });

    // Back to the form: the hours and the contact were kept, new requests are taken again.
    expect(await setReservations(env.owner, id, { mode: "form" })).toEqual({ ok: true, changed: true });
    expect((await send()).result).toMatchObject({ ok: true, deduped: false });
    expect(await reservationRows(env)).toHaveLength(3);
  });

  test("switching the form off also keeps every request", async () => {
    const env = await world();
    const id = env.w.a.menuServiceId;
    await setHours(env.owner, id, WEEK);
    await setReservations(env.owner, id, { mode: "form" });
    const result = await env.t.mutation(api.menuReservations.submit, {
      slug: SLUG_A,
      deviceToken: newMenuToken(),
      clientRequestId: "req-keep-0001",
      cancelToken: newMenuToken(),
      guestName: "Marija Gost",
      partySize: 2,
      requestedAt: THU_19,
      contactEmail: "gost@example.com",
      contactPhone: "+381 60 000 0000",
    });
    expect(result.ok).toBe(true);
    await setReservations(env.owner, id, { mode: "off" });
    expect(await reservationRows(env)).toHaveLength(1);
    expect(
      must(await env.owner.query(api.menuReservations.forPanel, { slug: SLUG_A, panelCode: env.code, fromMs: T0 - 12 * HOUR })).rows,
    ).toHaveLength(1);
    // Signed-out staff are still signed out (a sanity check that the panel answer above came from the account).
    expect(
      await env.t.mutation(api.menuReservations.decline, {
        slug: SLUG_A,
        panelCode: env.code,
        reservationId: (await reservationRows(env))[0]._id,
      }),
    ).toEqual({ ok: false, code: STAFF_ERROR.signedOut });
  });
});
