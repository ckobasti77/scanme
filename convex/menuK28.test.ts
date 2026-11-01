/// <reference types="vite/client" />

// ScanMe Menu V1 — K28: the backend rules behind Tim i pristupi, Podešavanja and the admin mode switch that live outside
// convex/menuTeam.ts: an existing PIN is never shown again, who may reset or set a PIN, who may give a waiter a default zone
// (menuStaff.setZone), the Standard language ceiling, that only ScanMe changes the mode (menuServices.adminSetMode,
// menuAdmin.serviceForBusiness) and the waiter-panel timing read/write (menuSettings.panelTiming / setPanelTiming).
// Fictional people and venues only (the repo is public): "Ana", "Marko", "Kafana kod Mike", "Demo restoran".

import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { MENU_ERROR } from "../lib/menu/errors/core";
import { MENU_PLAN_ERROR } from "../lib/menu/errors/plan";
import { STAFF_ERROR } from "../lib/menu/errors/waiter";
import { DEFAULT_PANEL_TIMING } from "../lib/menu/thresholds";
import {
  SLUG_A,
  TEST_ADMIN_EMAIL,
  TEST_ISSUER,
  addVenueToAccount,
  grantAccountPremium,
  seedMenuWorld,
  type MenuWorldSeed,
} from "../lib/menu/testkit/seed";

const modules = import.meta.glob("./**/*.ts");
const PEPPER = "test-pepper-0123456789abcdef";
/** What requireAdmin (convex/lib/access.ts) throws at a signed-in non-admin, and at nobody. */
const NOT_ADMIN = "Nemate administratorski pristup.";
const NOT_SIGNED_IN = "Niste prijavljeni.";

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

function as(t: T, userId: Id<"users">) {
  return t.withIdentity({ subject: userId, issuer: TEST_ISSUER });
}

type Who = "owner" | "manager" | "admin" | "editor" | "finance" | "viewOnly" | "outsider" | "otherOwner" | "anonymous";
const PERMITTED = ["owner", "manager", "admin"] as const satisfies readonly Who[];

function callerOf(t: T, w: MenuWorldSeed, who: Who) {
  const ids: Record<Exclude<Who, "anonymous">, Id<"users">> = {
    owner: w.ownerId,
    manager: w.managerId,
    admin: w.adminId,
    editor: w.editorId,
    finance: w.financeId,
    viewOnly: w.viewOnlyId,
    outsider: w.outsiderId,
    otherOwner: w.otherOwnerId,
  };
  return who === "anonymous" ? t : as(t, ids[who]);
}

/**
 * A call addressed by a row id (a member, a zone): a caller with NO Menu role in the venue (finance and view-only account
 * members, a stranger, another venue's owner) gets menu/not_found (no existence oracle); only the Urednik, who has a role
 * without the permission, is told menu/forbidden; nobody signed in is menu/unauthenticated. A PIN staff identity has no
 * account (no ctx.auth user), so it reaches these functions exactly like the anonymous caller and is refused the same way.
 */
const REFUSED_ROW: Record<Exclude<Who, (typeof PERMITTED)[number]>, string> = {
  editor: MENU_ERROR.forbidden,
  finance: MENU_ERROR.notFound,
  viewOnly: MENU_ERROR.notFound,
  outsider: MENU_ERROR.notFound,
  otherOwner: MENU_ERROR.notFound,
  anonymous: MENU_ERROR.unauthenticated,
};
const REFUSED_WHO = Object.keys(REFUSED_ROW) as (keyof typeof REFUSED_ROW)[];

async function world() {
  const t = newTest();
  const w: MenuWorldSeed = await t.run((ctx) => seedMenuWorld(ctx));
  return { t, w, sid: w.a.menuServiceId, owner: as(t, w.ownerId), otherOwner: as(t, w.otherOwnerId) };
}
type Env = Awaited<ReturnType<typeof world>>;

/** The ConvexError data a call is refused with, or "ok" when it went through. */
async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "ok";
  } catch (error) {
    if (error instanceof ConvexError && typeof error.data === "string") return error.data;
    throw error;
  }
}

const staffRow = (t: T, id: Id<"menuStaff">) => t.run((ctx) => ctx.db.get(id));
const serviceRow = (t: T, id: Id<"menuServices">) => t.run((ctx) => ctx.db.get(id));
const auditRows = (t: T, menuServiceId: Id<"menuServices">, action?: string) =>
  t.run(async (ctx) => {
    const rows = await ctx.db
      .query("menuAuditLog")
      .withIndex("by_menuServiceId_and_createdAt", (q) => q.eq("menuServiceId", menuServiceId))
      .collect();
    return action === undefined ? rows : rows.filter((row) => row.action === action);
  });

async function staffWithPin(env: Env, displayName: string, pin?: string) {
  const { staffId } = await env.owner.mutation(api.menuStaff.create, { menuServiceId: env.sid, displayName });
  const { pin: stored } = await env.owner.mutation(api.menuStaff.setPin, { staffId, ...(pin ? { pin } : {}) });
  return { staffId, pin: stored };
}

let zoneCounter = 0;
function addZone(t: T, menuServiceId: Id<"menuServices">, name: string, active = true) {
  zoneCounter += 1;
  return t.run((ctx) =>
    ctx.db.insert("menuZones", {
      menuServiceId,
      key: `zn_k28_${zoneCounter}`,
      name,
      nameNormalized: name.toLowerCase(),
      order: zoneCounter,
      active,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );
}

// ===== 1. Postojeći PIN se nigde ne prikazuje =====

describe("Postojeći PIN se nigde ne prikazuje", () => {
  test("setPin answers with the PIN exactly once; no read of the panel carries the PIN, its hash or its lookup", async () => {
    const env = await world();
    const explicit = await staffWithPin(env, "Ana Konobar", "482");
    const generated = await staffWithPin(env, "Marko Konobar");
    expect(explicit.pin).toBe("482");
    expect(generated.pin).toMatch(/^\d{3}$/);

    // The answer that shows the PIN: exactly once.
    const fresh = await env.owner.mutation(api.menuStaff.setPin, { staffId: explicit.staffId, pin: "917" });
    expect(JSON.stringify(fresh).split(`"917"`).length - 1).toBe(1);

    await env.owner.mutation(api.menuStaff.ensurePanelCode, { menuServiceId: env.sid });
    const pins = ["917", generated.pin];
    const stored = await Promise.all([explicit.staffId, generated.staffId].map((id) => staffRow(env.t, id)));
    const secrets = stored.flatMap((row) => [row?.pinHash, row?.pinLookup]);
    expect(secrets.every((value) => typeof value === "string" && value.length > 20)).toBe(true);

    const fromMs = Date.now();
    const answers: Record<string, unknown> = {
      "menuStaff.list": await env.owner.query(api.menuStaff.list, { menuServiceId: env.sid }),
      "menuStaff.panelLink": await env.owner.query(api.menuStaff.panelLink, { menuServiceId: env.sid }),
      "menuTeam.list": await env.owner.query(api.menuTeam.list, { menuServiceId: env.sid }),
      "menuTeam.activity": await env.owner.query(api.menuTeam.activity, { menuServiceId: env.sid }),
      "menuSettings.panelTiming": await env.owner.query(api.menuSettings.panelTiming, { menuServiceId: env.sid }),
      "menuServices.context": await env.owner.query(api.menuServices.context, { businessSlug: SLUG_A }),
      "menuPanel.home": await env.owner.query(api.menuPanel.home, { menuServiceId: env.sid, fromMs }),
      "menuPanel.operations": await env.owner.query(api.menuPanel.operations, { menuServiceId: env.sid, fromMs }),
    };
    for (const [name, answer] of Object.entries(answers)) {
      expect(answer, `${name} was refused`).not.toBeNull();
      const dump = JSON.stringify(answer);
      for (const secret of secrets) expect(dump, name).not.toContain(secret as string);
      for (const pin of pins) expect(dump, name).not.toContain(`"${pin}"`);
      expect(dump, name).not.toMatch(/pinHash|pinLookup/);
    }

    // The list tells that a PIN exists, never which one.
    const list = answers["menuStaff.list"] as { displayName: string; hasPin: boolean; pinSetAt: number | null }[];
    expect(list.map((row) => [row.displayName, row.hasPin])).toEqual(
      expect.arrayContaining([
        ["Ana Konobar", true],
        ["Marko Konobar", true],
      ]),
    );
  });

  test("the audit trail never holds the PIN, its hash or its lookup", async () => {
    const env = await world();
    const { staffId, pin } = await staffWithPin(env, "Ana Konobar", "482");
    await env.owner.mutation(api.menuStaff.setPin, { staffId, pin: "917" });
    await env.owner.mutation(api.menuStaff.resetPin, { staffId });
    const row = await staffRow(env.t, staffId);
    expect(row?.pinHash).toBeUndefined();
    const rows = await auditRows(env.t, env.sid);
    expect(rows.filter((entry) => entry.action === "staff.pin_set")).toHaveLength(2);
    const dump = JSON.stringify(rows);
    for (const secret of [pin, "917"]) expect(dump).not.toContain(`"${secret}"`);
    expect(dump).not.toMatch(/pinHash|pinLookup/);
  });

  test("a reset or a deactivation answer carries no PIN either", async () => {
    const env = await world();
    const { staffId } = await staffWithPin(env, "Ana Konobar", "482");
    const reset = await env.owner.mutation(api.menuStaff.resetPin, { staffId });
    expect(JSON.stringify(reset)).not.toContain("482");
    const { staffId: other } = await staffWithPin(env, "Marko Konobar", "731");
    const gone = await env.owner.mutation(api.menuStaff.deactivate, { staffId: other });
    expect(JSON.stringify(gone)).not.toContain("731");
  });
});

// ===== 2. Reset PIN-a samo Vlasnik ili Menadžer =====

describe("Reset PIN-a samo Vlasnik ili Menadžer", () => {
  for (const who of PERMITTED) {
    test(`resetPin: ${who} may — the PIN is cleared and audited`, async () => {
      const env = await world();
      const { staffId } = await staffWithPin(env, "Ana Konobar", "482");
      const answer = await callerOf(env.t, env.w, who).mutation(api.menuStaff.resetPin, { staffId });
      expect(answer).toEqual({ ok: true, endedSessions: 0 });
      const row = await staffRow(env.t, staffId);
      expect(row?.pinHash).toBeUndefined();
      expect(row?.pinLookup).toBeUndefined();
      const audit = await auditRows(env.t, env.sid, "staff.pin_reset");
      expect(audit).toHaveLength(1);
      expect(audit[0].actorKind).toBe(who === "admin" ? "admin" : "user");
    });
  }

  for (const who of REFUSED_WHO) {
    test(`resetPin: ${who} is ${REFUSED_ROW[who]} and the PIN stays`, async () => {
      const env = await world();
      const { staffId } = await staffWithPin(env, "Ana Konobar", "482");
      const before = await staffRow(env.t, staffId);
      const auditBefore = (await auditRows(env.t, env.sid)).length;
      expect(await codeOf(callerOf(env.t, env.w, who).mutation(api.menuStaff.resetPin, { staffId }))).toBe(REFUSED_ROW[who]);
      expect(await staffRow(env.t, staffId)).toEqual(before);
      expect((await auditRows(env.t, env.sid)).length).toBe(auditBefore);
    });
  }

  for (const who of PERMITTED) {
    test(`setPin: ${who} may — the new PIN is returned once and replaces the old one`, async () => {
      const env = await world();
      const { staffId } = await staffWithPin(env, "Ana Konobar", "482");
      const before = await staffRow(env.t, staffId);
      const answer = await callerOf(env.t, env.w, who).mutation(api.menuStaff.setPin, { staffId, pin: "731" });
      expect(answer.pin).toBe("731");
      const after = await staffRow(env.t, staffId);
      expect(after?.pinHash).toBeTruthy();
      expect(after?.pinHash).not.toBe(before?.pinHash);
      expect(after?.pinLookup).not.toBe(before?.pinLookup);
    });
  }

  for (const who of REFUSED_WHO) {
    test(`setPin: ${who} is ${REFUSED_ROW[who]} and the PIN stays`, async () => {
      const env = await world();
      const { staffId } = await staffWithPin(env, "Ana Konobar", "482");
      const before = await staffRow(env.t, staffId);
      expect(await codeOf(callerOf(env.t, env.w, who).mutation(api.menuStaff.setPin, { staffId, pin: "731" }))).toBe(REFUSED_ROW[who]);
      expect(await staffRow(env.t, staffId)).toEqual(before);
    });
  }

  test("the Urednik cannot read the staff list or the panel link either (null)", async () => {
    const env = await world();
    await env.owner.mutation(api.menuStaff.ensurePanelCode, { menuServiceId: env.sid });
    const editor = callerOf(env.t, env.w, "editor");
    expect(await editor.query(api.menuStaff.list, { menuServiceId: env.sid })).toBeNull();
    expect(await editor.query(api.menuStaff.panelLink, { menuServiceId: env.sid })).toBeNull();
  });
});

// ===== 3. setZone =====

describe("menuStaff.setZone", () => {
  for (const who of PERMITTED) {
    test(`${who} may give a waiter a default zone; audited as staff.zone_assigned`, async () => {
      const env = await world();
      const { staffId } = await staffWithPin(env, "Ana Konobar", "482");
      const zoneId = await addZone(env.t, env.sid, "Bašta");
      const answer = await callerOf(env.t, env.w, who).mutation(api.menuStaff.setZone, { staffId, zoneId });
      expect(answer).toEqual({ ok: true, changed: true });
      expect((await staffRow(env.t, staffId))?.activeZoneId).toBe(zoneId);
      const audit = await auditRows(env.t, env.sid, "staff.zone_assigned");
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({
        actorKind: who === "admin" ? "admin" : "user",
        entityType: "staff",
        entityKey: staffId,
        details: { zoneId },
      });
    });
  }

  for (const who of REFUSED_WHO) {
    test(`${who} is ${REFUSED_ROW[who]} and nothing changes`, async () => {
      const env = await world();
      const { staffId } = await staffWithPin(env, "Ana Konobar", "482");
      const zoneId = await addZone(env.t, env.sid, "Bašta");
      expect(await codeOf(callerOf(env.t, env.w, who).mutation(api.menuStaff.setZone, { staffId, zoneId }))).toBe(REFUSED_ROW[who]);
      expect((await staffRow(env.t, staffId))?.activeZoneId).toBeUndefined();
      expect(await auditRows(env.t, env.sid, "staff.zone_assigned")).toHaveLength(0);
    });
  }

  test("null clears the zone (audited), the same zone again is a no-op without an audit row", async () => {
    const env = await world();
    const { staffId } = await staffWithPin(env, "Ana Konobar", "482");
    const zoneId = await addZone(env.t, env.sid, "Bašta");
    await env.owner.mutation(api.menuStaff.setZone, { staffId, zoneId });
    expect(await env.owner.mutation(api.menuStaff.setZone, { staffId, zoneId })).toEqual({ ok: true, changed: false });
    expect(await auditRows(env.t, env.sid, "staff.zone_assigned")).toHaveLength(1);

    expect(await env.owner.mutation(api.menuStaff.setZone, { staffId, zoneId: null })).toEqual({ ok: true, changed: true });
    expect((await staffRow(env.t, staffId))?.activeZoneId).toBeUndefined();
    const audit = await auditRows(env.t, env.sid, "staff.zone_assigned");
    expect(audit).toHaveLength(2);
    expect(audit.map((row) => row.details)).toEqual(expect.arrayContaining([{ zoneId: null }]));
    expect(await env.owner.mutation(api.menuStaff.setZone, { staffId, zoneId: null })).toEqual({ ok: true, changed: false });
  });

  test("the zone shows in the staff list", async () => {
    const env = await world();
    const { staffId } = await staffWithPin(env, "Ana Konobar", "482");
    const zoneId = await addZone(env.t, env.sid, "Bašta");
    await env.owner.mutation(api.menuStaff.setZone, { staffId, zoneId });
    const list = await env.owner.query(api.menuStaff.list, { menuServiceId: env.sid });
    expect(list?.find((row) => row.id === staffId)?.activeZoneId).toBe(zoneId);
  });

  test("a zone of another venue is menu/not_found", async () => {
    const env = await world();
    const { staffId } = await staffWithPin(env, "Ana Konobar", "482");
    const foreignZone = await addZone(env.t, env.w.b.menuServiceId, "Terasa");
    expect(await codeOf(env.owner.mutation(api.menuStaff.setZone, { staffId, zoneId: foreignZone }))).toBe(MENU_ERROR.notFound);
    expect((await staffRow(env.t, staffId))?.activeZoneId).toBeUndefined();
  });

  test("a staff member of another venue is menu/not_found, even with that venue's zone", async () => {
    const env = await world();
    const { staffId: foreignStaff } = await env.otherOwner.mutation(api.menuStaff.create, {
      menuServiceId: env.w.b.menuServiceId,
      displayName: "Marko Konobar",
    });
    const own = await addZone(env.t, env.sid, "Bašta");
    const theirs = await addZone(env.t, env.w.b.menuServiceId, "Terasa");
    expect(await codeOf(env.owner.mutation(api.menuStaff.setZone, { staffId: foreignStaff, zoneId: own }))).toBe(MENU_ERROR.notFound);
    expect(await codeOf(env.owner.mutation(api.menuStaff.setZone, { staffId: foreignStaff, zoneId: theirs }))).toBe(MENU_ERROR.notFound);
    expect(await codeOf(env.owner.mutation(api.menuStaff.setZone, { staffId: foreignStaff, zoneId: null }))).toBe(MENU_ERROR.notFound);
    expect((await staffRow(env.t, foreignStaff))?.activeZoneId).toBeUndefined();
  });

  test("an inactive zone is menu/not_found", async () => {
    const env = await world();
    const { staffId } = await staffWithPin(env, "Ana Konobar", "482");
    const archived = await addZone(env.t, env.sid, "Stara bašta", false);
    expect(await codeOf(env.owner.mutation(api.menuStaff.setZone, { staffId, zoneId: archived }))).toBe(MENU_ERROR.notFound);
  });

  test("a deactivated member is staff/inactive", async () => {
    const env = await world();
    const { staffId } = await staffWithPin(env, "Ana Konobar", "482");
    const zoneId = await addZone(env.t, env.sid, "Bašta");
    await env.owner.mutation(api.menuStaff.deactivate, { staffId });
    expect(await codeOf(env.owner.mutation(api.menuStaff.setZone, { staffId, zoneId }))).toBe(STAFF_ERROR.inactive);
  });
});

// ===== 4. Standard ne može da doda treći jezik =====

describe("Standard ne može da doda treći jezik", () => {
  test("on Standard one translation is fine, a second is plan/language_limit and nothing changes", async () => {
    const env = await world();
    expect(await codeOf(env.owner.mutation(api.menuSettings.setLanguages, { menuServiceId: env.sid, translations: ["en"] }))).toBe("ok");
    expect(await codeOf(env.owner.mutation(api.menuSettings.setLanguages, { menuServiceId: env.sid, translations: ["en", "de"] }))).toBe(
      MENU_PLAN_ERROR.languageLimit,
    );
    expect((await serviceRow(env.t, env.sid))?.settings?.languages).toEqual({ source: "sr", translations: ["en"] });
    const read = await env.owner.query(api.menuSettings.languages, { menuServiceId: env.sid });
    expect(read).toMatchObject({ translations: ["en"], tier: "standard" });
  });

  test("a Manager meets the same ceiling", async () => {
    const env = await world();
    const manager = as(env.t, env.w.managerId);
    expect(await codeOf(manager.mutation(api.menuSettings.setLanguages, { menuServiceId: env.sid, translations: ["en", "de"] }))).toBe(
      MENU_PLAN_ERROR.languageLimit,
    );
    expect((await serviceRow(env.t, env.sid))?.settings?.languages).toBeUndefined();
  });

  test("on Premium the second translation is fine", async () => {
    const env = await world();
    await env.t.run((ctx) => grantAccountPremium(ctx, { accountId: env.w.a.accountId, via: "plan" }));
    expect(await codeOf(env.owner.mutation(api.menuSettings.setLanguages, { menuServiceId: env.sid, translations: ["en", "de"] }))).toBe("ok");
    expect((await serviceRow(env.t, env.sid))?.settings?.languages).toEqual({ source: "sr", translations: ["en", "de"] });
  });

  test("the Premium of account A does not lift the ceiling of account B", async () => {
    const env = await world();
    await env.t.run((ctx) => grantAccountPremium(ctx, { accountId: env.w.a.accountId, via: "plan" }));
    expect(
      await codeOf(env.otherOwner.mutation(api.menuSettings.setLanguages, { menuServiceId: env.w.b.menuServiceId, translations: ["en", "de"] })),
    ).toBe(MENU_PLAN_ERROR.languageLimit);
  });
});

// ===== 5. Režim menja samo ScanMe admin =====

describe("Režim menja samo ScanMe admin", () => {
  test("Owner, Manager and an anonymous caller cannot switch the mode; it stays as it was", async () => {
    const env = await world();
    for (const who of ["owner", "manager", "editor", "otherOwner"] as const) {
      expect(await codeOf(callerOf(env.t, env.w, who).mutation(api.menuServices.adminSetMode, { menuServiceId: env.sid, mode: "services" })), who).toBe(
        NOT_ADMIN,
      );
    }
    expect(await codeOf(env.t.mutation(api.menuServices.adminSetMode, { menuServiceId: env.sid, mode: "services" }))).toBe(NOT_SIGNED_IN);
    expect((await serviceRow(env.t, env.sid))?.mode).toBe("hospitality");
    expect(await auditRows(env.t, env.sid, "service.mode_changed")).toHaveLength(0);
  });

  test("the admin cannot pick a mode that is not built yet: menu/mode_not_available", async () => {
    const env = await world();
    const admin = callerOf(env.t, env.w, "admin");
    expect(await codeOf(admin.mutation(api.menuServices.adminSetMode, { menuServiceId: env.sid, mode: "services" }))).toBe(MENU_ERROR.modeNotAvailable);
    expect(await codeOf(admin.mutation(api.menuServices.adminSetMode, { menuServiceId: env.sid, mode: "retail" }))).toBe(MENU_ERROR.modeNotAvailable);
    expect((await serviceRow(env.t, env.sid))?.mode).toBe("hospitality");
  });

  test("the admin switching to the mode the service already has changes nothing", async () => {
    const env = await world();
    const before = await serviceRow(env.t, env.sid);
    const answer = await callerOf(env.t, env.w, "admin").mutation(api.menuServices.adminSetMode, {
      menuServiceId: env.sid,
      mode: "hospitality",
    });
    expect(answer).toEqual({ changed: false, droppedFeatures: [] });
    expect(await serviceRow(env.t, env.sid)).toEqual(before);
    expect(await auditRows(env.t, env.sid, "service.mode_changed")).toHaveLength(0);
  });

  test("a service that does not exist is menu/not_found for the admin", async () => {
    const env = await world();
    const gone = await env.t.run(async (ctx) => {
      const extra = await addVenueToAccount(ctx, {
        accountId: env.w.a.accountId,
        name: "Demo bašta",
        slug: "demo-basta",
        actorUserId: env.w.adminId,
      });
      await ctx.db.delete(extra.menuServiceId);
      return extra.menuServiceId;
    });
    expect(await codeOf(callerOf(env.t, env.w, "admin").mutation(api.menuServices.adminSetMode, { menuServiceId: gone, mode: "hospitality" }))).toBe(
      MENU_ERROR.notFound,
    );
  });
});

describe("menuAdmin.serviceForBusiness", () => {
  test("the admin gets the service, its mode and its features", async () => {
    const env = await world();
    const service = await serviceRow(env.t, env.sid);
    const answer = await callerOf(env.t, env.w, "admin").query(api.menuAdmin.serviceForBusiness, { businessId: env.w.a.businessId });
    expect(answer).toEqual({
      menuServiceId: env.sid,
      mode: "hospitality",
      modeSetAt: service?.modeSetAt ?? null,
      features: service?.features,
    });
  });

  test("a business without a Menu service is null for the admin", async () => {
    const env = await world();
    const bare = await env.t.run((ctx) =>
      ctx.db.insert("businesses", { name: "Demo bez menija", slug: "demo-bez-menija", status: "active", accountId: env.w.a.accountId, createdAt: Date.now() }),
    );
    expect(await callerOf(env.t, env.w, "admin").query(api.menuAdmin.serviceForBusiness, { businessId: bare })).toBeNull();
  });

  test("the Owner, the Manager, an Urednik and another venue's owner get an error; anonymous too", async () => {
    const env = await world();
    for (const who of ["owner", "manager", "editor", "otherOwner"] as const) {
      expect(await codeOf(callerOf(env.t, env.w, who).query(api.menuAdmin.serviceForBusiness, { businessId: env.w.a.businessId })), who).toBe(NOT_ADMIN);
    }
    expect(await codeOf(env.t.query(api.menuAdmin.serviceForBusiness, { businessId: env.w.a.businessId }))).toBe(NOT_SIGNED_IN);
  });
});

// ===== 6. Vreme panela =====

describe("menuSettings.panelTiming", () => {
  test("the defaults while nothing is set, the venue's values after setPanelTiming", async () => {
    const env = await world();
    expect(await env.owner.query(api.menuSettings.panelTiming, { menuServiceId: env.sid })).toEqual(DEFAULT_PANEL_TIMING);
    await env.owner.mutation(api.menuSettings.setPanelTiming, { menuServiceId: env.sid, lateThresholdMin: 15, reminderMin: 0 });
    expect(await env.owner.query(api.menuSettings.panelTiming, { menuServiceId: env.sid })).toEqual({ lateThresholdMin: 15, reminderMin: 0 });
    expect(await as(env.t, env.w.managerId).query(api.menuSettings.panelTiming, { menuServiceId: env.sid })).toEqual({
      lateThresholdMin: 15,
      reminderMin: 0,
    });
    expect(await callerOf(env.t, env.w, "admin").query(api.menuSettings.panelTiming, { menuServiceId: env.sid })).toEqual({
      lateThresholdMin: 15,
      reminderMin: 0,
    });
  });

  test("an Urednik, other account roles, a stranger, another venue's owner and anonymous get null", async () => {
    const env = await world();
    for (const who of REFUSED_WHO) {
      expect(await callerOf(env.t, env.w, who).query(api.menuSettings.panelTiming, { menuServiceId: env.sid }), who).toBeNull();
    }
  });
});

describe("menuSettings.setPanelTiming", () => {
  test("late threshold 1–120 and reminder 0–60 whole minutes are accepted", async () => {
    const env = await world();
    for (const [lateThresholdMin, reminderMin] of [
      [1, 60],
      [120, 0],
      [30, 1],
    ] as const) {
      expect(await codeOf(env.owner.mutation(api.menuSettings.setPanelTiming, { menuServiceId: env.sid, lateThresholdMin, reminderMin }))).toBe("ok");
      expect(await env.owner.query(api.menuSettings.panelTiming, { menuServiceId: env.sid })).toEqual({ lateThresholdMin, reminderMin });
    }
  });

  test("0 and 121 minutes of late threshold, a reminder of 61, negative and fractional values are menu/invalid_input; the stored values stay", async () => {
    const env = await world();
    await env.owner.mutation(api.menuSettings.setPanelTiming, { menuServiceId: env.sid, lateThresholdMin: 20, reminderMin: 3 });
    for (const [lateThresholdMin, reminderMin] of [
      [0, 5],
      [121, 5],
      [-1, 5],
      [10.5, 5],
      [10, 61],
      [10, -1],
      [10, 2.5],
    ] as const) {
      expect(
        await codeOf(env.owner.mutation(api.menuSettings.setPanelTiming, { menuServiceId: env.sid, lateThresholdMin, reminderMin })),
        `${lateThresholdMin}/${reminderMin}`,
      ).toBe(MENU_ERROR.invalidInput);
    }
    expect(await env.owner.query(api.menuSettings.panelTiming, { menuServiceId: env.sid })).toEqual({ lateThresholdMin: 20, reminderMin: 3 });
  });

  test("Owner, Manager and ScanMe admin may; the Urednik is menu/forbidden", async () => {
    const env = await world();
    for (const who of PERMITTED) {
      expect(
        await codeOf(callerOf(env.t, env.w, who).mutation(api.menuSettings.setPanelTiming, { menuServiceId: env.sid, lateThresholdMin: 10, reminderMin: 5 })),
        who,
      ).toBe("ok");
    }
    await env.owner.mutation(api.menuSettings.setPanelTiming, { menuServiceId: env.sid, lateThresholdMin: 25, reminderMin: 5 });
    expect(
      await codeOf(callerOf(env.t, env.w, "editor").mutation(api.menuSettings.setPanelTiming, { menuServiceId: env.sid, lateThresholdMin: 10, reminderMin: 5 })),
    ).toBe(MENU_ERROR.forbidden);
    expect((await env.owner.query(api.menuSettings.panelTiming, { menuServiceId: env.sid }))?.lateThresholdMin).toBe(25);
  });

  test("the other refusals: a stranger and another venue's owner menu/not_found, anonymous menu/unauthenticated", async () => {
    const env = await world();
    const args = { menuServiceId: env.sid, lateThresholdMin: 10, reminderMin: 5 };
    for (const who of ["finance", "viewOnly", "outsider", "otherOwner"] as const) {
      expect(await codeOf(callerOf(env.t, env.w, who).mutation(api.menuSettings.setPanelTiming, args)), who).toBe(MENU_ERROR.notFound);
    }
    expect(await codeOf(env.t.mutation(api.menuSettings.setPanelTiming, args))).toBe(MENU_ERROR.unauthenticated);
    expect((await serviceRow(env.t, env.sid))?.settings?.panel).toBeUndefined();
  });
});
