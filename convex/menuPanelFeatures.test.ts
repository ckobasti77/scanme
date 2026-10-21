/// <reference types="vite/client" />

// ScanMe Menu V1 — K27: Funkcionalnosti of the client panel, the BACKEND half
// (master §13.7; plan docs/meni/planovi/K24.md §4.5). The section adds no new
// function: its switches are the existing `menuServices.setFeature`, and the
// panel and the Editor read the result from `menuServices.context`. Proven here:
//   - Room service: on Standard it cannot be switched on (`plan/premium_required`,
//     with a Serbian reason in the dictionary) and `context` says so; on Premium
//     it can, and then `context.capabilities.roomService && context.features.roomService`
//     — exactly the condition the Editor uses for the group "Posebne usluge"
//     (components/menu/studio/veza/use-studio-veza.ts) — is true; switching it
//     off hides the group again; losing Premium hides it and switching OFF
//     still works;
//   - occupancy, callWaiter, billRequest and ordering are plain switches that
//     are audited as `feature.changed`;
//   - who may switch (Owner, Manager, ScanMe admin) and who is refused.
//
// Fictional tenants only (the repo is public): "Kafana kod Mike" (a),
// "Demo restoran" (b).

import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { beforeEach, describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { menuDomenSr } from "../lib/i18n/sr/menu-domen";
import {
  SLUG_A,
  SLUG_B,
  TEST_ADMIN_EMAIL,
  TEST_ISSUER,
  grantAccountPremium,
  seedMenuWorld,
} from "../lib/menu/testkit/seed";

const modules = import.meta.glob("./**/*.ts");

beforeEach(() => {
  process.env.SCANME_ADMIN_EMAILS = TEST_ADMIN_EMAIL;
});

const newTest = () => convexTest(schema, modules);
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

async function world() {
  const t = newTest();
  const w = await t.run(async (ctx) => await seedMenuWorld(ctx));
  return { t, w, owner: as(t, w.ownerId), manager: as(t, w.managerId), editor: as(t, w.editorId), admin: as(t, w.adminId) };
}

const contextOf = (who: Caller, slug: string = SLUG_A) => who.query(api.menuServices.context, { businessSlug: slug });
type Context = NonNullable<Awaited<ReturnType<typeof contextOf>>>;

/** The exact condition the Editor uses to show the group "Posebne usluge" (use-studio-veza.ts, `roomService`). */
const editorShowsRoomService = (context: Context) => context.capabilities.roomService && context.features.roomService;

type Feature = "callWaiter" | "billRequest" | "ordering" | "roomService" | "occupancy";

const setFeature = (who: Caller, menuServiceId: Id<"menuServices">, feature: Feature, enabled: boolean) =>
  who.mutation(api.menuServices.setFeature, { menuServiceId, feature, enabled });

async function featuresOf(t: T, menuServiceId: Id<"menuServices">) {
  const service = await t.run(async (ctx) => await ctx.db.get(menuServiceId));
  return must(service, "the Menu service").features;
}

async function featureAudits(t: T, menuServiceId: Id<"menuServices">) {
  const rows = await t.run(async (ctx) => await ctx.db.query("menuAuditLog").take(1000));
  return rows.filter((row) => row.menuServiceId === menuServiceId && row.action === "feature.changed");
}

// =============================================================================
// 1. Room service: locked on Standard, shown in the Editor on Premium
// =============================================================================

describe("Room service", () => {
  test("Uključivanje Room service-a ga pokazuje u Editoru, a na Standardu je zaključano uz razlog", async () => {
    const { t, w, owner, manager, editor, admin } = await world();
    const A = w.a.menuServiceId;

    // Standard: the switch is locked. Everybody who may switch gets the plan refusal, and nothing changes.
    const standard = must(await contextOf(owner));
    expect(standard.capabilities).toMatchObject({ tier: "standard", roomService: false });
    expect(standard.features.roomService).toBe(false);
    expect(editorShowsRoomService(standard)).toBe(false);
    for (const who of [owner, manager, admin]) {
      expect(await codeOf(setFeature(who, A, "roomService", true))).toBe("plan/premium_required");
    }
    expect((await featuresOf(t, A)).roomService).toBe(false);
    expect(await featureAudits(t, A)).toHaveLength(0);
    const refused = must(await contextOf(owner));
    expect(refused.features.roomService).toBe(false);
    expect(refused.capabilities.roomService).toBe(false);
    expect(editorShowsRoomService(refused)).toBe(false);
    // ...and the refusal has its reason in Serbian for the line under the switch.
    expect(menuDomenSr.errors["plan/premium_required"]).toBe("Ova mogućnost je deo Premium naloga.");

    // Premium on the account: the capability opens, the group stays hidden until it is switched on.
    await t.run(async (ctx) => {
      await grantAccountPremium(ctx, { accountId: w.a.accountId, via: "plan" });
    });
    const premium = must(await contextOf(owner));
    expect(premium.capabilities).toMatchObject({ tier: "premium", roomService: true });
    expect(premium.features.roomService).toBe(false);
    expect(editorShowsRoomService(premium)).toBe(false);

    // Switching it on shows "Posebne usluge" to everybody who opens the Editor, the Urednik included.
    expect(await setFeature(owner, A, "roomService", true)).toEqual({ ok: true });
    expect((await featuresOf(t, A)).roomService).toBe(true);
    for (const who of [owner, manager, editor, admin]) {
      expect(editorShowsRoomService(must(await contextOf(who))), "after switching on").toBe(true);
    }

    // Switching it off hides it again; the capability itself stays.
    expect(await setFeature(manager, A, "roomService", false)).toEqual({ ok: true });
    const off = must(await contextOf(owner));
    expect(off.features.roomService).toBe(false);
    expect(off.capabilities.roomService).toBe(true);
    expect(editorShowsRoomService(off)).toBe(false);

    const audits = await featureAudits(t, A);
    expect(audits.map((row) => row.details)).toEqual([
      { feature: "roomService", enabled: true },
      { feature: "roomService", enabled: false },
    ]);
  });

  test.each(["plan", "subscription"] as const)(
    "after Premium is lost (%s) the group is hidden at once, switching OFF still works and ON is refused again",
    async (via) => {
      const { t, w, owner, editor } = await world();
      const A = w.a.menuServiceId;
      await t.run(async (ctx) => {
        await grantAccountPremium(ctx, { accountId: w.a.accountId, via });
      });
      await setFeature(owner, A, "roomService", true);
      expect(editorShowsRoomService(must(await contextOf(editor)))).toBe(true);

      // The plan goes back to Standard: the switch is still stored as on, but the Editor does not show it.
      await t.run(async (ctx) => {
        if (via === "plan") {
          await ctx.db.patch(w.a.accountId, { plan: "basic" });
          return;
        }
        const rows = await ctx.db.query("subscriptions").take(10);
        for (const row of rows) await ctx.db.patch(row._id, { facts: { ...row.facts, status: "inactive" } });
      });
      const lost = must(await contextOf(editor));
      expect(lost.capabilities).toMatchObject({ tier: "standard", roomService: false });
      expect(lost.features.roomService).toBe(true);
      expect(editorShowsRoomService(lost)).toBe(false);

      // Turning OFF never needs Premium; turning back ON does.
      expect(await setFeature(owner, A, "roomService", false)).toEqual({ ok: true });
      expect((await featuresOf(t, A)).roomService).toBe(false);
      expect(await codeOf(setFeature(owner, A, "roomService", true))).toBe("plan/premium_required");
      expect((await featuresOf(t, A)).roomService).toBe(false);
      expect(await featureAudits(t, A)).toHaveLength(2);
    },
  );

  test("Premium is a fact of the account: the other venue's Owner still meets the lock", async () => {
    const { t, w, owner } = await world();
    const other = as(t, w.otherOwnerId);
    await t.run(async (ctx) => {
      await grantAccountPremium(ctx, { accountId: w.a.accountId, via: "plan" });
    });
    expect(await setFeature(owner, w.a.menuServiceId, "roomService", true)).toEqual({ ok: true });

    const theirs = must(await contextOf(other, SLUG_B));
    expect(theirs.capabilities.roomService).toBe(false);
    expect(theirs.features.roomService).toBe(false);
    expect(await codeOf(setFeature(other, w.b.menuServiceId, "roomService", true))).toBe("plan/premium_required");
    expect((await featuresOf(t, w.b.menuServiceId)).roomService).toBe(false);
    expect(await featureAudits(t, w.b.menuServiceId)).toHaveLength(0);
  });
});

// =============================================================================
// 2. The plain switches
// =============================================================================

describe("the other switches", () => {
  const DEFAULTS = {
    callWaiter: false,
    billRequest: false,
    ordering: false,
    roomService: false,
    occupancy: false,
  };

  test.each(["occupancy", "callWaiter", "billRequest", "ordering"] as const)(
    "%s switches on and off through setFeature, each real change audited as feature.changed",
    async (feature) => {
      const { t, w, owner } = await world();
      const A = w.a.menuServiceId;
      const before = await featuresOf(t, A);
      expect(before).toMatchObject(DEFAULTS);

      expect(await setFeature(owner, A, feature, true)).toEqual({ ok: true });
      expect(await featuresOf(t, A)).toEqual({ ...before, [feature]: true });
      // The panel reads it back from the context.
      expect(must(await contextOf(owner)).features[feature]).toBe(true);

      // Same value again: success, no audit row.
      expect(await setFeature(owner, A, feature, true)).toEqual({ ok: true });
      expect(await featureAudits(t, A)).toHaveLength(1);

      expect(await setFeature(owner, A, feature, false)).toEqual({ ok: true });
      expect(await featuresOf(t, A)).toEqual(before);
      expect(must(await contextOf(owner)).features[feature]).toBe(false);

      const audits = await featureAudits(t, A);
      expect(audits).toHaveLength(2);
      expect(audits[0]).toMatchObject({
        menuServiceId: A,
        actorKind: "user",
        actorUserId: w.ownerId,
        entityType: "menuServices",
        details: { feature, enabled: true },
      });
      expect(audits[1]).toMatchObject({ details: { feature, enabled: false } });
      // Nothing happened at the other venue.
      expect(await featuresOf(t, w.b.menuServiceId)).toMatchObject(DEFAULTS);
      expect(await featureAudits(t, w.b.menuServiceId)).toHaveLength(0);
    },
  );

  test("Zauzetost stolova: the waiter panel's occupancy module follows the switch", async () => {
    const { t, w, owner } = await world();
    const A = w.a.menuServiceId;
    const { code } = await owner.mutation(api.menuStaff.ensurePanelCode, { menuServiceId: A });
    const occupancy = () => owner.query(api.menuWaiter.occupancy, { slug: SLUG_A, panelCode: code });
    const floor = async () => must(await owner.query(api.menuWaiter.floor, { slug: SLUG_A, panelCode: code })).occupancyEnabled;

    expect(await occupancy()).toEqual({ off: true });
    expect(await floor()).toBe(false);
    await setFeature(owner, A, "occupancy", true);
    expect(await occupancy()).toEqual({ off: false, states: [] });
    expect(await floor()).toBe(true);
    await setFeature(owner, A, "occupancy", false);
    expect(await occupancy()).toEqual({ off: true });
    expect(await floor()).toBe(false);
    expect(await featureAudits(t, A)).toHaveLength(2);
  });

  test("the switches are independent of each other and of the reservations mode", async () => {
    const { t, w, owner } = await world();
    const A = w.a.menuServiceId;
    await setFeature(owner, A, "callWaiter", true);
    await setFeature(owner, A, "ordering", true);
    await setFeature(owner, A, "occupancy", true);
    expect(await featuresOf(t, A)).toEqual({ ...DEFAULTS, callWaiter: true, ordering: true, occupancy: true, reservations: "off" });
    await setFeature(owner, A, "ordering", false);
    expect(await featuresOf(t, A)).toEqual({ ...DEFAULTS, callWaiter: true, occupancy: true, reservations: "off" });
  });
});

// =============================================================================
// 3. Who may switch
// =============================================================================

describe("who may switch", () => {
  test("the Owner, a Manager and a ScanMe admin switch; the admin's change is audited as admin", async () => {
    const { t, w, owner, manager, admin } = await world();
    const A = w.a.menuServiceId;
    expect(await setFeature(owner, A, "callWaiter", true)).toEqual({ ok: true });
    expect(await setFeature(manager, A, "billRequest", true)).toEqual({ ok: true });
    expect(await setFeature(admin, A, "ordering", true)).toEqual({ ok: true });
    expect(await featuresOf(t, A)).toMatchObject({ callWaiter: true, billRequest: true, ordering: true });
    const audits = await featureAudits(t, A);
    expect(audits.map((row) => [row.actorKind, row.actorUserId])).toEqual([
      ["user", w.ownerId],
      ["user", w.managerId],
      ["admin", w.adminId],
    ]);
  });

  test("an Urednik is forbidden; finance, view-only, an outsider and another venue's Owner get not_found; a signed-out caller is unauthenticated", async () => {
    const { t, w } = await world();
    const A = w.a.menuServiceId;
    const refusals: [string, Caller, string][] = [
      ["editor", as(t, w.editorId), "menu/forbidden"],
      ["finance", as(t, w.financeId), "menu/not_found"],
      ["viewOnly", as(t, w.viewOnlyId), "menu/not_found"],
      ["outsider", as(t, w.outsiderId), "menu/not_found"],
      ["otherOwner", as(t, w.otherOwnerId), "menu/not_found"],
      ["anonymous", t, "menu/unauthenticated"],
    ];
    for (const [name, who, code] of refusals) {
      expect(await codeOf(setFeature(who, A, "callWaiter", true)), name).toBe(code);
      expect(await codeOf(setFeature(who, A, "occupancy", true)), name).toBe(code);
    }
    expect(await featuresOf(t, A)).toMatchObject({ callWaiter: false, occupancy: false });
    expect(await featureAudits(t, A)).toHaveLength(0);
    // The Owner of a has no business with venue b either.
    expect(await codeOf(setFeature(as(t, w.ownerId), w.b.menuServiceId, "callWaiter", true))).toBe("menu/not_found");
  });

  test("the context tells the panel who may switch: features.edit for the Owner, a Manager and an admin, not for an Urednik", async () => {
    const { t, w, owner, manager, editor, admin } = await world();
    for (const who of [owner, manager, admin]) {
      expect(must(await contextOf(who)).permissions).toContain("features.edit");
    }
    const urednik = must(await contextOf(editor));
    expect(urednik.actor).toBe("editor");
    expect(urednik.permissions).not.toContain("features.edit");
    for (const who of [as(t, w.financeId), as(t, w.viewOnlyId), as(t, w.outsiderId), as(t, w.otherOwnerId), t]) {
      expect(await contextOf(who)).toBeNull();
    }
  });
});
