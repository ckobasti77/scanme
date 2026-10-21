/// <reference types="vite/client" />

// ScanMe Menu V1 — K28: Tim i pristupi (convex/menuTeam.ts). Proven here: who may invite, change and remove (Owner, Manager,
// ScanMe admin; never an Urednik or a stranger), that a Manager never touches the Owner role, that nobody changes their own row,
// the invitation link (a 256-bit token, only its hash stored, a seven-day term, the same e-mail on acceptance), that accepting
// never creates account or legacy access, the public face of a link, the team list (account members "iz naloga" next to the
// invited ones) and the activity list (no e-mail, no PIN, no hash).
// Fictional people and venues only (the repo is public): "Ana", "Marko", "Kafana kod Mike", "Demo restoran".

import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { MENU_ERROR } from "../lib/menu/errors/core";
import { TEAM_ERROR } from "../lib/menu/errors/team";
import { MENU_INVITE_TTL_MS, inviteTokenHash } from "../lib/menu/invite";
import { MENU_MAX_ACTIVITY, MENU_MAX_MEMBERS } from "../lib/menu/limits";
import {
  SLUG_A,
  TEST_ADMIN_EMAIL,
  TEST_ISSUER,
  addAccountMember,
  addMenuMember,
  seedMenuWorld,
  type MenuWorldSeed,
} from "../lib/menu/testkit/seed";

const modules = import.meta.glob("./**/*.ts");
const PEPPER = "test-pepper-0123456789abcdef";
const T0 = Date.UTC(2026, 9, 21, 8, 0, 0);
const DAY = 24 * 60 * 60 * 1000;

beforeEach(() => {
  process.env.SCANME_ADMIN_EMAILS = TEST_ADMIN_EMAIL;
  process.env.MENU_PIN_PEPPER = PEPPER;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
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

async function world() {
  const t = newTest();
  const w: MenuWorldSeed = await t.run((ctx) => seedMenuWorld(ctx));
  return {
    t,
    w,
    sid: w.a.menuServiceId,
    owner: as(t, w.ownerId),
    manager: as(t, w.managerId),
    editor: as(t, w.editorId),
    admin: as(t, w.adminId),
    otherOwner: as(t, w.otherOwnerId),
  };
}
type Env = Awaited<ReturnType<typeof world>>;

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

function newUser(t: T, email: string, name?: string) {
  return t.run((ctx) =>
    ctx.db.insert("users", { email, emailVerificationTime: Date.now(), ...(name ? { name } : {}) }),
  );
}

const memberRows = (t: T, menuServiceId: Id<"menuServices">) =>
  t.run((ctx) =>
    ctx.db
      .query("menuMembers")
      .withIndex("by_menuServiceId_and_email", (q) => q.eq("menuServiceId", menuServiceId))
      .collect(),
  );
const memberRow = (t: T, id: Id<"menuMembers">) => t.run((ctx) => ctx.db.get(id));
const auditRows = (t: T, menuServiceId: Id<"menuServices">) =>
  t.run((ctx) =>
    ctx.db
      .query("menuAuditLog")
      .withIndex("by_menuServiceId_and_createdAt", (q) => q.eq("menuServiceId", menuServiceId))
      .collect(),
  );

const ACCESS_TABLES = ["businessMemberships", "businessInvitations", "accountMemberships"] as const;
/** The legacy and the account access tables, counted: Menu invitations must never write them. */
const accessCounts = (t: T) =>
  t.run(async (ctx) => Promise.all(ACCESS_TABLES.map(async (table) => (await ctx.db.query(table).collect()).length)));

const SCANNED_TABLES = ["menuMembers", "menuAuditLog", "users", "menuServices", "businesses", "accounts"] as const;
/** Every row of the tables an invitation could leak into, as one string. */
const scannedDump = (t: T) =>
  t.run(async (ctx) =>
    JSON.stringify(await Promise.all(SCANNED_TABLES.map(async (table) => await ctx.db.query(table).collect()))),
  );

type Caller = Pick<T, "mutation" | "query">;

/** An invitation made by the Owner, accepted by nobody yet. */
async function invited(env: Env, email: string, role: "owner" | "manager" | "editor" = "editor", by: Caller = env.owner) {
  return await by.mutation(api.menuTeam.invite, { menuServiceId: env.sid, email, role });
}

/** An invitation made by the Owner and accepted by a new user with the same address. */
async function joined(env: Env, email: string, role: "owner" | "manager" | "editor", name?: string) {
  const result = await invited(env, email, role);
  const userId = await newUser(env.t, email, name);
  await as(env.t, userId).mutation(api.menuTeam.acceptInvite, { token: result.token });
  return { ...result, userId, caller: as(env.t, userId) };
}

async function listOf(caller: Caller, env: Env) {
  const result = await caller.query(api.menuTeam.list, { menuServiceId: env.sid });
  if (!result) throw new Error("list was refused");
  return result;
}

// ===== 1. invite =====

describe("invite: who may", () => {
  test("Owner, Manager and ScanMe admin may invite", async () => {
    const env = await world();
    for (const [name, caller] of [
      ["owner", env.owner],
      ["manager", env.manager],
      ["admin", env.admin],
    ] as const) {
      const result = await caller.mutation(api.menuTeam.invite, {
        menuServiceId: env.sid,
        email: `${name}-poziv@example.com`,
        role: "editor",
      });
      expect(result.token).toHaveLength(43);
    }
  });

  test("an Urednik, other account roles, a stranger and another venue's owner are all menu/forbidden", async () => {
    const env = await world();
    const callers = {
      editor: env.editor,
      finance: as(env.t, env.w.financeId),
      viewOnly: as(env.t, env.w.viewOnlyId),
      outsider: as(env.t, env.w.outsiderId),
      otherOwner: env.otherOwner,
    };
    for (const [name, caller] of Object.entries(callers)) {
      expect(
        await codeOf(caller.mutation(api.menuTeam.invite, { menuServiceId: env.sid, email: "ana@example.com", role: "editor" })),
        name,
      ).toBe(MENU_ERROR.forbidden);
    }
    expect(await memberRows(env.t, env.sid)).toHaveLength(1); // the seeded Urednik only
  });

  test("anonymous is menu/unauthenticated", async () => {
    const env = await world();
    expect(
      await codeOf(env.t.mutation(api.menuTeam.invite, { menuServiceId: env.sid, email: "ana@example.com", role: "editor" })),
    ).toBe(MENU_ERROR.unauthenticated);
  });

  test("a Manager cannot invite an Owner (team/role_forbidden); an Owner can; a Manager may invite Manager and Urednik", async () => {
    const env = await world();
    expect(await codeOf(invited(env, "ana@example.com", "owner", env.manager))).toBe(TEAM_ERROR.roleForbidden);
    expect(await codeOf(invited(env, "ana@example.com", "manager", env.manager))).toBe("ok");
    expect(await codeOf(invited(env, "marko@example.com", "editor", env.manager))).toBe("ok");
    expect(await codeOf(invited(env, "vlasnica@example.com", "owner", env.owner))).toBe("ok");
    const owners = (await memberRows(env.t, env.sid)).filter((row) => row.role === "owner");
    expect(owners.map((row) => row.email)).toEqual(["vlasnica@example.com"]);
  });
});

describe("invite: the address", () => {
  test("a value that is not an e-mail address is team/email_invalid and writes nothing", async () => {
    const env = await world();
    for (const email of ["nije-email", "   ", "", "ana@", "a b@example.com"]) {
      expect(await codeOf(invited(env, email)), email).toBe(TEAM_ERROR.emailInvalid);
    }
    expect(await memberRows(env.t, env.sid)).toHaveLength(1);
    expect((await auditRows(env.t, env.sid)).filter((row) => row.action === "team.invited")).toHaveLength(0);
  });

  test("the same address twice while the first invitation is valid is team/invite_exists (case and spaces do not matter)", async () => {
    const env = await world();
    await invited(env, "ana@example.com");
    expect(await codeOf(invited(env, "ana@example.com"))).toBe(TEAM_ERROR.inviteExists);
    expect(await codeOf(invited(env, "  ANA@Example.com "))).toBe(TEAM_ERROR.inviteExists);
    expect((await memberRows(env.t, env.sid)).filter((row) => row.email === "ana@example.com")).toHaveLength(1);
  });

  test("an address that is already an active member is team/invite_exists", async () => {
    const env = await world();
    expect(await codeOf(invited(env, "urednik@example.com"))).toBe(TEAM_ERROR.inviteExists);
  });

  test("the address is stored trimmed and lowercase", async () => {
    const env = await world();
    const result = await invited(env, "  Ana@Example.COM ");
    expect((await memberRow(env.t, result.memberId))?.email).toBe("ana@example.com");
  });

  test("the team has a ceiling: team/full once 50 people are in it", async () => {
    const env = await world();
    await env.t.run(async (ctx) => {
      for (let index = 0; index < MENU_MAX_MEMBERS - 1; index += 1) {
        await ctx.db.insert("menuMembers", {
          menuServiceId: env.sid,
          businessId: env.w.a.businessId,
          email: `gost${index}@example.com`,
          role: "editor",
          status: "invited",
          inviteTokenHash: `hash-${index}`,
          inviteExpiresAt: T0 + DAY,
          invitedByUserId: env.w.ownerId,
          createdAt: T0,
          updatedAt: T0,
        });
      }
    });
    expect(await codeOf(invited(env, "ana@example.com"))).toBe(TEAM_ERROR.teamFull);
  });
});

describe("invite: the link and what is stored", () => {
  test("the answer carries a 43-character token and the panel path; the term is seven days", async () => {
    const env = await world();
    const result = await invited(env, "ana@example.com", "manager");
    expect(result.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(result.path).toBe(`/${SLUG_A}/client-panel/meni/poziv/${result.token}`);
    expect(result.expiresAt).toBe(T0 + 7 * DAY);
    expect(result.expiresAt).toBe(T0 + MENU_INVITE_TTL_MS);
  });

  test("only the hash of the token is stored; no field of any row holds the raw token", async () => {
    const env = await world();
    const result = await invited(env, "ana@example.com");
    const row = await memberRow(env.t, result.memberId);
    expect(row).toMatchObject({
      email: "ana@example.com",
      role: "editor",
      status: "invited",
      inviteTokenHash: await inviteTokenHash(result.token),
      inviteExpiresAt: T0 + 7 * DAY,
      invitedByUserId: env.w.ownerId,
    });
    expect(row?.userId).toBeUndefined();
    expect(row?.inviteTokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(await scannedDump(env.t)).not.toContain(result.token);
  });

  test("each invitation gets its own token", async () => {
    const env = await world();
    const first = await invited(env, "ana@example.com");
    const second = await invited(env, "marko@example.com");
    expect(first.token).not.toBe(second.token);
  });

  test("an invitation is audited as team.invited with the role only: no e-mail, no token", async () => {
    const env = await world();
    const result = await invited(env, "ana@example.com", "manager");
    const rows = (await auditRows(env.t, env.sid)).filter((row) => row.action === "team.invited");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actorKind: "user",
      actorUserId: env.w.ownerId,
      entityType: "member",
      entityKey: result.memberId,
      details: { role: "manager" },
    });
    const dump = JSON.stringify(rows);
    expect(dump).not.toContain("@");
    expect(dump).not.toContain(result.token);
  });

  test("a ScanMe admin's invitation is audited as admin", async () => {
    const env = await world();
    await invited(env, "ana@example.com", "editor", env.admin);
    const row = (await auditRows(env.t, env.sid)).find((entry) => entry.action === "team.invited");
    expect(row?.actorKind).toBe("admin");
  });

  test("an expired invitation of the same address is reused (one row per address): the new link works, the old one does not", async () => {
    const env = await world();
    const first = await invited(env, "ana@example.com", "editor");
    vi.setSystemTime(T0 + 8 * DAY);
    const second = await invited(env, "ana@example.com", "manager");
    expect(second.memberId).toBe(first.memberId);
    expect(second.token).not.toBe(first.token);
    expect(second.expiresAt).toBe(T0 + 15 * DAY);
    expect((await memberRows(env.t, env.sid)).filter((row) => row.email === "ana@example.com")).toHaveLength(1);
    expect((await memberRow(env.t, second.memberId))?.role).toBe("manager");

    const userId = await newUser(env.t, "ana@example.com");
    expect(await codeOf(as(env.t, userId).mutation(api.menuTeam.acceptInvite, { token: first.token }))).toBe(TEAM_ERROR.inviteInvalid);
    expect(await codeOf(as(env.t, userId).mutation(api.menuTeam.acceptInvite, { token: second.token }))).toBe("ok");
  });

  test("a revoked invitation can be sent again to the same address (the row is reused)", async () => {
    const env = await world();
    const first = await invited(env, "ana@example.com");
    await env.owner.mutation(api.menuTeam.revokeInvite, { memberId: first.memberId });
    const second = await invited(env, "ana@example.com", "manager");
    expect(second.memberId).toBe(first.memberId);
    expect((await memberRow(env.t, second.memberId))?.status).toBe("invited");
  });
});

// ===== 2. acceptInvite =====

describe("acceptInvite", () => {
  test("needs a sign-in: anonymous is menu/unauthenticated", async () => {
    const env = await world();
    const result = await invited(env, "ana@example.com");
    expect(await codeOf(env.t.mutation(api.menuTeam.acceptInvite, { token: result.token }))).toBe(MENU_ERROR.unauthenticated);
    expect((await memberRow(env.t, result.memberId))?.status).toBe("invited");
  });

  test("another address is team/email_mismatch and the invitation stays pending", async () => {
    const env = await world();
    const result = await invited(env, "ana@example.com");
    const marko = await newUser(env.t, "marko@example.com");
    expect(await codeOf(as(env.t, marko).mutation(api.menuTeam.acceptInvite, { token: result.token }))).toBe(TEAM_ERROR.emailMismatch);
    const row = await memberRow(env.t, result.memberId);
    expect(row?.status).toBe("invited");
    expect(row?.userId).toBeUndefined();
    expect(row?.inviteTokenHash).toBe(await inviteTokenHash(result.token));
  });

  test("a user without an e-mail address cannot accept (mismatch)", async () => {
    const env = await world();
    const result = await invited(env, "ana@example.com");
    const nameless = await env.t.run((ctx) => ctx.db.insert("users", {}));
    expect(await codeOf(as(env.t, nameless).mutation(api.menuTeam.acceptInvite, { token: result.token }))).toBe(TEAM_ERROR.emailMismatch);
  });

  test("the same address (case and spaces do not matter) makes the row active with the user; the link stops working", async () => {
    const env = await world();
    const result = await invited(env, "ana@example.com", "editor");
    const ana = await newUser(env.t, "  Ana@Example.COM ");
    const answer = await as(env.t, ana).mutation(api.menuTeam.acceptInvite, { token: result.token });
    expect(answer).toEqual({ slug: SLUG_A });

    const row = await memberRow(env.t, result.memberId);
    expect(row).toMatchObject({ status: "active", userId: ana, role: "editor", acceptedAt: T0 });
    expect(row?.inviteTokenHash).toBeUndefined();
    expect(row?.inviteExpiresAt).toBeUndefined();

    expect(await codeOf(as(env.t, ana).mutation(api.menuTeam.acceptInvite, { token: result.token }))).toBe(TEAM_ERROR.inviteInvalid);
    expect(await env.t.query(api.menuTeam.inviteStatus, { token: result.token })).toEqual({ status: "invalid" });
  });

  test("acceptance is audited as team.joined with the role only", async () => {
    const env = await world();
    const { memberId, userId } = await joined(env, "ana@example.com", "manager");
    const row = (await auditRows(env.t, env.sid)).find((entry) => entry.action === "team.joined");
    expect(row).toMatchObject({ actorKind: "user", actorUserId: userId, entityKey: memberId, details: { role: "manager" } });
    expect(JSON.stringify(row)).not.toContain("@");
  });

  test("afterwards the user has Menu access with the invited role", async () => {
    const env = await world();
    const editor = await joined(env, "ana@example.com", "editor");
    const manager = await joined(env, "marko@example.com", "manager");
    const asEditor = await editor.caller.query(api.menuServices.context, { businessSlug: SLUG_A });
    const asManager = await manager.caller.query(api.menuServices.context, { businessSlug: SLUG_A });
    expect(asEditor?.actor).toBe("editor");
    expect(asEditor?.permissions).not.toContain("team.manage");
    expect(asManager?.actor).toBe("manager");
    expect(asManager?.permissions).toContain("team.manage");
    // The new Manager can use Tim i pristupi; the new Urednik cannot.
    expect(await editor.caller.query(api.menuTeam.list, { menuServiceId: env.sid })).toBeNull();
    expect(await manager.caller.query(api.menuTeam.list, { menuServiceId: env.sid })).not.toBeNull();
    // And has nothing in the other venue.
    expect(await manager.caller.query(api.menuTeam.list, { menuServiceId: env.w.b.menuServiceId })).toBeNull();
  });

  test("an expired invitation is team/invite_invalid, at the exact boundary too; one millisecond earlier it still works", async () => {
    const env = await world();
    const late = await invited(env, "ana@example.com");
    const early = await invited(env, "marko@example.com");
    const ana = await newUser(env.t, "ana@example.com");
    const marko = await newUser(env.t, "marko@example.com");

    vi.setSystemTime(T0 + 7 * DAY - 1);
    expect(await codeOf(as(env.t, marko).mutation(api.menuTeam.acceptInvite, { token: early.token }))).toBe("ok");
    vi.setSystemTime(T0 + 7 * DAY);
    expect(await codeOf(as(env.t, ana).mutation(api.menuTeam.acceptInvite, { token: late.token }))).toBe(TEAM_ERROR.inviteInvalid);
    expect((await memberRow(env.t, late.memberId))?.status).toBe("invited");
  });

  test("a revoked invitation is team/invite_invalid", async () => {
    const env = await world();
    const result = await invited(env, "ana@example.com");
    await env.owner.mutation(api.menuTeam.revokeInvite, { memberId: result.memberId });
    const ana = await newUser(env.t, "ana@example.com");
    expect(await codeOf(as(env.t, ana).mutation(api.menuTeam.acceptInvite, { token: result.token }))).toBe(TEAM_ERROR.inviteInvalid);
  });

  test("malformed and unknown tokens are team/invite_invalid", async () => {
    const env = await world();
    const ana = await newUser(env.t, "ana@example.com");
    for (const token of ["", "kratak", "!".repeat(43), "A".repeat(43), "A".repeat(44)]) {
      expect(await codeOf(as(env.t, ana).mutation(api.menuTeam.acceptInvite, { token })), token).toBe(TEAM_ERROR.inviteInvalid);
    }
  });

  test("an invitation of an inactive venue cannot be accepted", async () => {
    const env = await world();
    const result = await invited(env, "ana@example.com");
    await env.t.run((ctx) => ctx.db.patch(env.w.a.businessId, { status: "inactive" }));
    const ana = await newUser(env.t, "ana@example.com");
    expect(await codeOf(as(env.t, ana).mutation(api.menuTeam.acceptInvite, { token: result.token }))).toBe(TEAM_ERROR.inviteInvalid);
  });

  test("never creates businessMemberships, businessInvitations or accountMemberships", async () => {
    const env = await world();
    const before = await accessCounts(env.t);
    const marko = await joined(env, "marko@example.com", "manager");
    const ana = await joined(env, "ana@example.com", "editor");
    await env.owner.mutation(api.menuTeam.changeRole, { memberId: ana.memberId, role: "manager" });
    await env.owner.mutation(api.menuTeam.remove, { memberId: marko.memberId });
    const pending = await invited(env, "iva@example.com");
    await env.owner.mutation(api.menuTeam.revokeInvite, { memberId: pending.memberId });
    expect(await accessCounts(env.t)).toEqual(before);
  });

  test("an older active grant of the same user gives way to the new one (one active row per person)", async () => {
    const env = await world();
    // The user already holds an explicit Urednik row under another address.
    const userId = await newUser(env.t, "novi@example.com");
    const oldId = await env.t.run((ctx) =>
      addMenuMember(ctx, {
        menuServiceId: env.sid,
        businessId: env.w.a.businessId,
        userId,
        email: "stari@example.com",
        role: "editor",
        invitedByUserId: env.w.ownerId,
      }),
    );
    const result = await invited(env, "novi@example.com", "manager");
    await as(env.t, userId).mutation(api.menuTeam.acceptInvite, { token: result.token });
    expect((await memberRow(env.t, oldId))?.status).toBe("removed");
    expect((await memberRow(env.t, result.memberId))?.status).toBe("active");
    expect((await as(env.t, userId).query(api.menuServices.context, { businessSlug: SLUG_A }))?.actor).toBe("manager");
  });
});

// ===== 3. inviteStatus =====

describe("inviteStatus", () => {
  test("malformed formats and unknown tokens are { status: invalid }", async () => {
    const env = await world();
    for (const token of ["", "x", "kratak-token", "!".repeat(43), "A".repeat(42), "A".repeat(44), "A".repeat(43), "a b".repeat(15)]) {
      expect(await env.t.query(api.menuTeam.inviteStatus, { token }), token).toEqual({ status: "invalid" });
    }
  });

  test("a pending link shows the venue, the role and the term; the viewer is anonymous, match or mismatch", async () => {
    const env = await world();
    const result = await invited(env, "ana@example.com", "manager");
    const ana = await newUser(env.t, " Ana@Example.com");
    const marko = await newUser(env.t, "marko@example.com");

    const expected = { status: "pending", venue: "Kafana kod Mike", slug: SLUG_A, role: "manager", expiresAt: T0 + 7 * DAY };
    expect(await env.t.query(api.menuTeam.inviteStatus, { token: result.token })).toEqual({ ...expected, viewer: "anonymous" });
    expect(await as(env.t, ana).query(api.menuTeam.inviteStatus, { token: result.token })).toEqual({ ...expected, viewer: "match" });
    expect(await as(env.t, marko).query(api.menuTeam.inviteStatus, { token: result.token })).toEqual({ ...expected, viewer: "mismatch" });
  });

  test("never returns the e-mail address, to anyone", async () => {
    const env = await world();
    const result = await invited(env, "ana@example.com");
    const ana = await newUser(env.t, "ana@example.com");
    const marko = await newUser(env.t, "marko@example.com");
    for (const caller of [env.t, as(env.t, ana), as(env.t, marko), env.owner]) {
      const answer = await caller.query(api.menuTeam.inviteStatus, { token: result.token });
      expect(JSON.stringify(answer)).not.toContain("@");
      expect(JSON.stringify(answer)).not.toContain("example.com");
    }
  });

  test("a revoked, used or removed link is invalid", async () => {
    const env = await world();
    const revoked = await invited(env, "ana@example.com");
    await env.owner.mutation(api.menuTeam.revokeInvite, { memberId: revoked.memberId });
    expect(await env.t.query(api.menuTeam.inviteStatus, { token: revoked.token })).toEqual({ status: "invalid" });

    const used = await joined(env, "marko@example.com", "editor");
    expect(await env.t.query(api.menuTeam.inviteStatus, { token: used.token })).toEqual({ status: "invalid" });

    const removed = await invited(env, "iva@example.com");
    await env.owner.mutation(api.menuTeam.remove, { memberId: removed.memberId });
    expect(await env.t.query(api.menuTeam.inviteStatus, { token: removed.token })).toEqual({ status: "invalid" });
  });

  test("a link of an inactive venue is invalid", async () => {
    const env = await world();
    const result = await invited(env, "ana@example.com");
    await env.t.run((ctx) => ctx.db.patch(env.w.a.businessId, { status: "inactive" }));
    expect(await env.t.query(api.menuTeam.inviteStatus, { token: result.token })).toEqual({ status: "invalid" });
  });

  test("an expired link still reports its past term (the page says it expired); accepting it is refused", async () => {
    const env = await world();
    const result = await invited(env, "ana@example.com");
    vi.setSystemTime(T0 + 8 * DAY);
    const answer = await env.t.query(api.menuTeam.inviteStatus, { token: result.token });
    expect(answer).toMatchObject({ status: "pending", expiresAt: T0 + 7 * DAY });
    if (answer.status !== "pending") throw new Error("expected pending");
    expect(answer.expiresAt).toBeLessThan(Date.now());
  });
});

// ===== 4. changeRole / remove / revokeInvite =====

/** Active Owner and Manager rows and a pending Owner invitation, next to the seeded Urednik. */
async function team(env: Env) {
  const ownerUser = await newUser(env.t, "suvlasnik@example.com");
  const managerUser = await newUser(env.t, "sef-smene@example.com");
  const ids = await env.t.run(async (ctx) => {
    const common = { menuServiceId: env.sid, businessId: env.w.a.businessId, invitedByUserId: env.w.ownerId };
    return {
      ownerMember: await addMenuMember(ctx, { ...common, userId: ownerUser, email: "suvlasnik@example.com", role: "owner" }),
      managerMember: await addMenuMember(ctx, { ...common, userId: managerUser, email: "sef-smene@example.com", role: "manager" }),
    };
  });
  const rows = await memberRows(env.t, env.sid);
  const editorMember = rows.find((row) => row.userId === env.w.editorId)?._id as Id<"menuMembers">;
  const pendingOwner = await invited(env, "buduci-vlasnik@example.com", "owner");
  const pendingEditor = await invited(env, "buduci-urednik@example.com", "editor");
  return { ...ids, editorMember, pendingOwner: pendingOwner.memberId, pendingEditor: pendingEditor.memberId, managerUser, ownerUser };
}

describe("changeRole", () => {
  test("a Manager cannot change an Owner member nor promote anyone to Owner; the rows stay as they were", async () => {
    const env = await world();
    const ids = await team(env);
    expect(await codeOf(env.manager.mutation(api.menuTeam.changeRole, { memberId: ids.ownerMember, role: "editor" }))).toBe(TEAM_ERROR.roleForbidden);
    expect(await codeOf(env.manager.mutation(api.menuTeam.changeRole, { memberId: ids.ownerMember, role: "owner" }))).toBe(TEAM_ERROR.roleForbidden);
    expect(await codeOf(env.manager.mutation(api.menuTeam.changeRole, { memberId: ids.editorMember, role: "owner" }))).toBe(TEAM_ERROR.roleForbidden);
    expect((await memberRow(env.t, ids.ownerMember))?.role).toBe("owner");
    expect((await memberRow(env.t, ids.editorMember))?.role).toBe("editor");
  });

  test("a Manager changes Manager and Urednik rows, and an audit row team.role_changed says from and to", async () => {
    const env = await world();
    const ids = await team(env);
    expect(await codeOf(env.manager.mutation(api.menuTeam.changeRole, { memberId: ids.editorMember, role: "manager" }))).toBe("ok");
    expect(await codeOf(env.manager.mutation(api.menuTeam.changeRole, { memberId: ids.managerMember, role: "editor" }))).toBe("ok");
    expect((await memberRow(env.t, ids.editorMember))?.role).toBe("manager");
    expect((await memberRow(env.t, ids.managerMember))?.role).toBe("editor");
    const rows = (await auditRows(env.t, env.sid)).filter((row) => row.action === "team.role_changed");
    expect(rows.map((row) => row.details)).toEqual(
      expect.arrayContaining([
        { from: "editor", to: "manager" },
        { from: "manager", to: "editor" },
      ]),
    );
    expect(JSON.stringify(rows)).not.toContain("@");
  });

  test("an Owner and a ScanMe admin may promote to Owner and demote an Owner", async () => {
    const env = await world();
    const ids = await team(env);
    expect(await codeOf(env.owner.mutation(api.menuTeam.changeRole, { memberId: ids.editorMember, role: "owner" }))).toBe("ok");
    expect(await codeOf(env.owner.mutation(api.menuTeam.changeRole, { memberId: ids.ownerMember, role: "manager" }))).toBe("ok");
    expect(await codeOf(env.admin.mutation(api.menuTeam.changeRole, { memberId: ids.managerMember, role: "owner" }))).toBe("ok");
    expect((await memberRow(env.t, ids.editorMember))?.role).toBe("owner");
    expect((await memberRow(env.t, ids.ownerMember))?.role).toBe("manager");
    expect((await memberRow(env.t, ids.managerMember))?.role).toBe("owner");
  });

  test("the same role again is a no-op without an audit row", async () => {
    const env = await world();
    const ids = await team(env);
    const before = (await auditRows(env.t, env.sid)).length;
    expect(await codeOf(env.owner.mutation(api.menuTeam.changeRole, { memberId: ids.managerMember, role: "manager" }))).toBe("ok");
    expect((await auditRows(env.t, env.sid)).length).toBe(before);
  });

  test("the new role takes effect at once, and a pending invitation keeps its link with the new role", async () => {
    const env = await world();
    const ana = await joined(env, "ana@example.com", "editor");
    await env.owner.mutation(api.menuTeam.changeRole, { memberId: ana.memberId, role: "manager" });
    expect((await ana.caller.query(api.menuServices.context, { businessSlug: SLUG_A }))?.actor).toBe("manager");

    const pending = await invited(env, "marko@example.com", "editor");
    await env.owner.mutation(api.menuTeam.changeRole, { memberId: pending.memberId, role: "manager" });
    const marko = await newUser(env.t, "marko@example.com");
    await as(env.t, marko).mutation(api.menuTeam.acceptInvite, { token: pending.token });
    expect((await as(env.t, marko).query(api.menuServices.context, { businessSlug: SLUG_A }))?.actor).toBe("manager");
  });

  test("nobody changes their own row: team/self_change, for an Owner and for a Manager", async () => {
    const env = await world();
    const rows = await env.t.run(async (ctx) => {
      const common = { menuServiceId: env.sid, businessId: env.w.a.businessId, invitedByUserId: env.w.ownerId };
      return {
        owner: await addMenuMember(ctx, { ...common, userId: env.w.ownerId, email: "vlasnik@example.com", role: "manager" }),
        manager: await addMenuMember(ctx, { ...common, userId: env.w.managerId, email: "menadzer@example.com", role: "editor" }),
      };
    });
    expect(await codeOf(env.owner.mutation(api.menuTeam.changeRole, { memberId: rows.owner, role: "owner" }))).toBe(TEAM_ERROR.selfChange);
    expect(await codeOf(env.owner.mutation(api.menuTeam.changeRole, { memberId: rows.owner, role: "editor" }))).toBe(TEAM_ERROR.selfChange);
    expect(await codeOf(env.owner.mutation(api.menuTeam.remove, { memberId: rows.owner }))).toBe(TEAM_ERROR.selfChange);
    expect(await codeOf(env.manager.mutation(api.menuTeam.changeRole, { memberId: rows.manager, role: "manager" }))).toBe(TEAM_ERROR.selfChange);
    expect(await codeOf(env.manager.mutation(api.menuTeam.remove, { memberId: rows.manager }))).toBe(TEAM_ERROR.selfChange);
    expect((await memberRow(env.t, rows.owner))?.status).toBe("active");
    expect((await memberRow(env.t, rows.manager))?.role).toBe("editor");
  });

  test("an Urednik is menu/forbidden; an account member without a Menu role and a stranger are menu/not_found", async () => {
    const env = await world();
    const ids = await team(env);
    const args = { memberId: ids.managerMember, role: "editor" as const };
    expect(await codeOf(env.editor.mutation(api.menuTeam.changeRole, args))).toBe(MENU_ERROR.forbidden);
    expect(await codeOf(env.editor.mutation(api.menuTeam.remove, { memberId: ids.managerMember }))).toBe(MENU_ERROR.forbidden);
    expect(await codeOf(as(env.t, env.w.financeId).mutation(api.menuTeam.changeRole, args))).toBe(MENU_ERROR.notFound);
    expect(await codeOf(as(env.t, env.w.outsiderId).mutation(api.menuTeam.changeRole, args))).toBe(MENU_ERROR.notFound);
    expect(await codeOf(env.t.mutation(api.menuTeam.changeRole, args))).toBe(MENU_ERROR.unauthenticated);
    expect((await memberRow(env.t, ids.managerMember))?.role).toBe("manager");
  });

  test("tenant: another venue's owner gets menu/not_found for every row of this team", async () => {
    const env = await world();
    const ids = await team(env);
    expect(await codeOf(env.otherOwner.mutation(api.menuTeam.changeRole, { memberId: ids.editorMember, role: "manager" }))).toBe(MENU_ERROR.notFound);
    expect(await codeOf(env.otherOwner.mutation(api.menuTeam.remove, { memberId: ids.editorMember }))).toBe(MENU_ERROR.notFound);
    expect(await codeOf(env.otherOwner.mutation(api.menuTeam.revokeInvite, { memberId: ids.pendingEditor }))).toBe(MENU_ERROR.notFound);
    expect((await memberRow(env.t, ids.editorMember))?.status).toBe("active");
    expect((await memberRow(env.t, ids.pendingEditor))?.status).toBe("invited");
  });

  test("a removed row cannot be changed (menu/not_found)", async () => {
    const env = await world();
    const ana = await joined(env, "ana@example.com", "editor");
    await env.owner.mutation(api.menuTeam.remove, { memberId: ana.memberId });
    expect(await codeOf(env.owner.mutation(api.menuTeam.changeRole, { memberId: ana.memberId, role: "manager" }))).toBe(MENU_ERROR.notFound);
  });
});

describe("remove", () => {
  test("a Manager cannot remove an Owner; the Owner can; a Manager removes Manager and Urednik rows", async () => {
    const env = await world();
    const ids = await team(env);
    expect(await codeOf(env.manager.mutation(api.menuTeam.remove, { memberId: ids.ownerMember }))).toBe(TEAM_ERROR.roleForbidden);
    expect((await memberRow(env.t, ids.ownerMember))?.status).toBe("active");
    expect(await codeOf(env.manager.mutation(api.menuTeam.remove, { memberId: ids.managerMember }))).toBe("ok");
    expect(await codeOf(env.manager.mutation(api.menuTeam.remove, { memberId: ids.editorMember }))).toBe("ok");
    expect(await codeOf(env.owner.mutation(api.menuTeam.remove, { memberId: ids.ownerMember }))).toBe("ok");
    expect(await codeOf(env.admin.mutation(api.menuTeam.remove, { memberId: ids.pendingOwner }))).toBe("ok");
  });

  test("a removed row disappears from the list, the person loses access, and removing again is menu/not_found", async () => {
    const env = await world();
    const ana = await joined(env, "ana@example.com", "manager");
    expect((await listOf(env.owner, env)).members.map((member) => member.email)).toContain("ana@example.com");
    expect((await ana.caller.query(api.menuServices.context, { businessSlug: SLUG_A }))?.actor).toBe("manager");

    await env.owner.mutation(api.menuTeam.remove, { memberId: ana.memberId });
    expect((await listOf(env.owner, env)).members.map((member) => member.email)).not.toContain("ana@example.com");
    expect(await ana.caller.query(api.menuServices.context, { businessSlug: SLUG_A })).toBeNull();
    expect(await codeOf(env.owner.mutation(api.menuTeam.remove, { memberId: ana.memberId }))).toBe(MENU_ERROR.notFound);
  });

  test("removing a pending invitation kills its link", async () => {
    const env = await world();
    const pending = await invited(env, "ana@example.com");
    await env.owner.mutation(api.menuTeam.remove, { memberId: pending.memberId });
    const row = await memberRow(env.t, pending.memberId);
    expect(row?.status).toBe("removed");
    expect(row?.inviteTokenHash).toBeUndefined();
    expect(await env.t.query(api.menuTeam.inviteStatus, { token: pending.token })).toEqual({ status: "invalid" });
  });

  test("removing a member touches no account access", async () => {
    const env = await world();
    const ana = await joined(env, "ana@example.com", "editor");
    const before = await accessCounts(env.t);
    await env.owner.mutation(api.menuTeam.remove, { memberId: ana.memberId });
    expect(await accessCounts(env.t)).toEqual(before);
    // The Owner and the Manager of the account are untouched.
    expect((await env.manager.query(api.menuServices.context, { businessSlug: SLUG_A }))?.actor).toBe("manager");
    expect((await env.owner.query(api.menuServices.context, { businessSlug: SLUG_A }))?.actor).toBe("owner");
  });

  test("audit: team.removed carries the role only", async () => {
    const env = await world();
    const ana = await joined(env, "ana@example.com", "manager");
    await env.owner.mutation(api.menuTeam.remove, { memberId: ana.memberId });
    const rows = (await auditRows(env.t, env.sid)).filter((row) => row.action === "team.removed");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actorUserId: env.w.ownerId, entityType: "member", entityKey: ana.memberId, details: { role: "manager" } });
    expect(JSON.stringify(rows)).not.toContain("@");
  });
});

describe("revokeInvite", () => {
  test("revokes at once: the row is removed, the hash is gone, the link is dead", async () => {
    const env = await world();
    const pending = await invited(env, "ana@example.com");
    expect(await codeOf(env.manager.mutation(api.menuTeam.revokeInvite, { memberId: pending.memberId }))).toBe("ok");
    const row = await memberRow(env.t, pending.memberId);
    expect(row?.status).toBe("removed");
    expect(row?.inviteTokenHash).toBeUndefined();
    expect(row?.inviteExpiresAt).toBeUndefined();
    expect(await env.t.query(api.menuTeam.inviteStatus, { token: pending.token })).toEqual({ status: "invalid" });
    const ana = await newUser(env.t, "ana@example.com");
    expect(await codeOf(as(env.t, ana).mutation(api.menuTeam.acceptInvite, { token: pending.token }))).toBe(TEAM_ERROR.inviteInvalid);
  });

  test("a Manager cannot revoke an Owner invitation; an Owner can", async () => {
    const env = await world();
    const ids = await team(env);
    expect(await codeOf(env.manager.mutation(api.menuTeam.revokeInvite, { memberId: ids.pendingOwner }))).toBe(TEAM_ERROR.roleForbidden);
    expect((await memberRow(env.t, ids.pendingOwner))?.status).toBe("invited");
    expect(await codeOf(env.owner.mutation(api.menuTeam.revokeInvite, { memberId: ids.pendingOwner }))).toBe("ok");
  });

  test("only a pending invitation can be revoked: an active member is team/invite_invalid, a revoked one menu/not_found", async () => {
    const env = await world();
    const ana = await joined(env, "ana@example.com", "editor");
    expect(await codeOf(env.owner.mutation(api.menuTeam.revokeInvite, { memberId: ana.memberId }))).toBe(TEAM_ERROR.inviteInvalid);
    const pending = await invited(env, "marko@example.com");
    await env.owner.mutation(api.menuTeam.revokeInvite, { memberId: pending.memberId });
    expect(await codeOf(env.owner.mutation(api.menuTeam.revokeInvite, { memberId: pending.memberId }))).toBe(MENU_ERROR.notFound);
  });

  test("an Urednik is menu/forbidden, anonymous menu/unauthenticated, a stranger menu/not_found", async () => {
    const env = await world();
    const pending = await invited(env, "ana@example.com");
    expect(await codeOf(env.editor.mutation(api.menuTeam.revokeInvite, { memberId: pending.memberId }))).toBe(MENU_ERROR.forbidden);
    expect(await codeOf(env.t.mutation(api.menuTeam.revokeInvite, { memberId: pending.memberId }))).toBe(MENU_ERROR.unauthenticated);
    expect(await codeOf(as(env.t, env.w.outsiderId).mutation(api.menuTeam.revokeInvite, { memberId: pending.memberId }))).toBe(MENU_ERROR.notFound);
    expect((await memberRow(env.t, pending.memberId))?.status).toBe("invited");
  });

  test("audit: team.invite_revoked carries the role only", async () => {
    const env = await world();
    const pending = await invited(env, "ana@example.com", "manager");
    await env.owner.mutation(api.menuTeam.revokeInvite, { memberId: pending.memberId });
    const rows = (await auditRows(env.t, env.sid)).filter((row) => row.action === "team.invite_revoked");
    expect(rows).toHaveLength(1);
    expect(rows[0].details).toEqual({ role: "manager" });
    expect(JSON.stringify(rows)).not.toContain("@");
  });
});

describe("the audit trail of the team", () => {
  test("every team.* row is written without an e-mail address, a token or a hash", async () => {
    const env = await world();
    const ids = await team(env);
    const ana = await joined(env, "ana@example.com", "editor");
    await env.owner.mutation(api.menuTeam.changeRole, { memberId: ana.memberId, role: "manager" });
    await env.owner.mutation(api.menuTeam.remove, { memberId: ana.memberId });
    await env.owner.mutation(api.menuTeam.revokeInvite, { memberId: ids.pendingEditor });
    const rows = (await auditRows(env.t, env.sid)).filter((row) => row.action.startsWith("team."));
    expect(new Set(rows.map((row) => row.action))).toEqual(
      new Set(["team.invited", "team.joined", "team.role_changed", "team.removed", "team.invite_revoked"]),
    );
    const dump = JSON.stringify(rows);
    expect(dump).not.toContain("@");
    expect(dump).not.toContain(ana.token);
    expect(dump).not.toContain(await inviteTokenHash(ana.token));
  });
});

// ===== 5. list =====

describe("list", () => {
  test("an Urednik gets null; so does anonymous, a stranger, an account member without a Menu role", async () => {
    const env = await world();
    expect(await env.editor.query(api.menuTeam.list, { menuServiceId: env.sid })).toBeNull();
    expect(await env.t.query(api.menuTeam.list, { menuServiceId: env.sid })).toBeNull();
    expect(await as(env.t, env.w.outsiderId).query(api.menuTeam.list, { menuServiceId: env.sid })).toBeNull();
    expect(await as(env.t, env.w.financeId).query(api.menuTeam.list, { menuServiceId: env.sid })).toBeNull();
    expect(await as(env.t, env.w.viewOnlyId).query(api.menuTeam.list, { menuServiceId: env.sid })).toBeNull();
  });

  test("Owner, Manager and ScanMe admin see the team", async () => {
    const env = await world();
    for (const caller of [env.owner, env.manager, env.admin]) {
      expect(await caller.query(api.menuTeam.list, { menuServiceId: env.sid })).not.toBeNull();
    }
  });

  test("tenant: the owner of venue B gets null for venue A and sees only their own team for B", async () => {
    const env = await world();
    expect(await env.otherOwner.query(api.menuTeam.list, { menuServiceId: env.sid })).toBeNull();
    const ownB = await env.otherOwner.query(api.menuTeam.list, { menuServiceId: env.w.b.menuServiceId });
    expect(ownB?.account.map((row) => row.email)).toEqual(["drugi-vlasnik@example.com"]);
    expect(ownB?.members).toEqual([]);
  });

  test("the account part (migrated account): Owner and Manager \"iz naloga\", Owner first, finance and view-only left out", async () => {
    const env = await world();
    await env.t.run(async (ctx) => {
      await ctx.db.patch(env.w.ownerId, { name: "Vlasnik Test" });
    });
    const result = await listOf(env.manager, env);
    expect(result.account).toEqual([
      { key: env.w.ownerId, name: "Vlasnik Test", email: "vlasnik@example.com", role: "owner", isSelf: false },
      { key: env.w.managerId, name: null, email: "menadzer@example.com", role: "manager", isSelf: true },
    ]);
  });

  test("an account member limited to selected venues is shown only where a scope row exists", async () => {
    const env = await world();
    const scoped = await newUser(env.t, "ogranicen@example.com");
    const notScoped = await newUser(env.t, "bez-lokala@example.com");
    await env.t.run(async (ctx) => {
      const withScope = await addAccountMember(ctx, {
        accountId: env.w.a.accountId,
        userId: scoped,
        role: "venue_management",
        venueAccess: "selected",
      });
      await ctx.db.insert("accountMembershipVenueScopes", {
        membershipId: withScope,
        accountId: env.w.a.accountId,
        businessId: env.w.a.businessId,
        createdAt: T0,
      });
      await addAccountMember(ctx, {
        accountId: env.w.a.accountId,
        userId: notScoped,
        role: "venue_management",
        venueAccess: "selected",
      });
    });
    const emails = (await listOf(env.owner, env)).account.map((row) => row.email);
    expect(emails).toContain("ogranicen@example.com");
    expect(emails).not.toContain("bez-lokala@example.com");
  });

  test("the account part (legacy account): every active businessMemberships row is a Manager; accountMemberships are not used", async () => {
    const env = await world();
    const legacy = await newUser(env.t, "stari-clan@example.com");
    const inactive = await newUser(env.t, "bivsi-clan@example.com");
    await env.t.run(async (ctx) => {
      await ctx.db.patch(env.w.a.accountId, { adminV1MigrationVersion: undefined });
      for (const [userId, active] of [
        [legacy, true],
        [inactive, false],
      ] as const) {
        await ctx.db.insert("businessMemberships", {
          userId,
          businessId: env.w.a.businessId,
          accessRole: "viewer",
          active,
          createdAt: T0,
          updatedAt: T0,
        });
      }
    });
    const result = await listOf(as(env.t, legacy), env);
    expect(result.account).toEqual([{ key: legacy, name: null, email: "stari-clan@example.com", role: "manager", isSelf: true }]);
  });

  test("the members: active before invited, invited by age; removed rows are left out; self is marked", async () => {
    const env = await world();
    vi.setSystemTime(T0 + 1000);
    const first = await invited(env, "prvi@example.com", "editor");
    vi.setSystemTime(T0 + 2000);
    const ana = await joined(env, "ana@example.com", "manager", "Ana Test");
    vi.setSystemTime(T0 + 3000);
    const second = await invited(env, "drugi@example.com", "manager");
    const gone = await invited(env, "otisao@example.com", "editor");
    await env.owner.mutation(api.menuTeam.remove, { memberId: gone.memberId });

    const result = await listOf(env.owner, env);
    expect(result.members.map((member) => member.email)).toEqual([
      "urednik@example.com", // seeded, active, oldest
      "ana@example.com", // active
      "prvi@example.com", // invited
      "drugi@example.com", // invited
    ]);
    expect(result.members[0]).toMatchObject({ role: "editor", status: "active", inviteExpiresAt: null, isSelf: false });
    expect(result.members[1]).toMatchObject({ id: ana.memberId, name: "Ana Test", role: "manager", status: "active", inviteExpiresAt: null });
    expect(result.members[2]).toMatchObject({ id: first.memberId, status: "invited", inviteExpiresAt: T0 + 1000 + 7 * DAY, name: null });
    expect(result.members[3]).toMatchObject({ id: second.memberId, status: "invited", role: "manager" });

    const asAna = await listOf(ana.caller, env);
    expect(asAna.members.find((member) => member.email === "ana@example.com")?.isSelf).toBe(true);
    expect(asAna.members.filter((member) => member.isSelf)).toHaveLength(1);
  });

  test("never returns a token, a hash or the stored term of an accepted member", async () => {
    const env = await world();
    const pending = await invited(env, "ana@example.com");
    const dump = JSON.stringify(await listOf(env.owner, env));
    expect(dump).not.toContain(pending.token);
    expect(dump).not.toContain(await inviteTokenHash(pending.token));
    expect(dump).not.toContain("inviteTokenHash");
  });
});

// ===== 6. activity =====

describe("activity", () => {
  test("only team.manage roles: an Urednik, a stranger, another venue's owner and anonymous get null", async () => {
    const env = await world();
    expect(await env.editor.query(api.menuTeam.activity, { menuServiceId: env.sid })).toBeNull();
    expect(await as(env.t, env.w.outsiderId).query(api.menuTeam.activity, { menuServiceId: env.sid })).toBeNull();
    expect(await env.otherOwner.query(api.menuTeam.activity, { menuServiceId: env.sid })).toBeNull();
    expect(await env.t.query(api.menuTeam.activity, { menuServiceId: env.sid })).toBeNull();
    for (const caller of [env.owner, env.manager, env.admin]) {
      expect(await caller.query(api.menuTeam.activity, { menuServiceId: env.sid })).toEqual(expect.any(Array));
    }
  });

  test("newest first, with the actor by name and the staff subject by name", async () => {
    const env = await world();
    await env.t.run((ctx) => ctx.db.patch(env.w.ownerId, { name: "Vlasnik Test" }));
    const { staffId } = await env.owner.mutation(api.menuStaff.create, { menuServiceId: env.sid, displayName: "Ana Konobar" });
    vi.setSystemTime(T0 + 1000);
    await env.owner.mutation(api.menuStaff.setPin, { staffId });
    vi.setSystemTime(T0 + 2000);
    await invited(env, "ana@example.com");
    vi.setSystemTime(T0 + 3000);
    await env.admin.mutation(api.menuStaff.resetPin, { staffId });

    const rows = (await env.owner.query(api.menuTeam.activity, { menuServiceId: env.sid })) ?? [];
    const times = rows.map((row) => row.createdAt);
    expect(times).toEqual([...times].sort((a, b) => b - a));
    expect(rows.slice(0, 3).map((row) => row.action)).toEqual(["staff.pin_reset", "team.invited", "staff.pin_set"]);
    expect(rows[0]).toMatchObject({ actor: { kind: "scanme" }, subject: "Ana Konobar" });
    expect(rows[1]).toMatchObject({ actor: { kind: "user", name: "Vlasnik Test" }, subject: null });
    expect(rows[2]).toMatchObject({ actor: { kind: "user", name: "Vlasnik Test" }, subject: "Ana Konobar" });
  });

  test("at most 50 rows, the newest ones", async () => {
    const env = await world();
    await env.t.run(async (ctx) => {
      for (let index = 0; index < MENU_MAX_ACTIVITY + 10; index += 1) {
        await ctx.db.insert("menuAuditLog", {
          menuServiceId: env.sid,
          actorKind: "user",
          actorUserId: env.w.ownerId,
          action: "settings.working_hours_changed",
          createdAt: T0 + 1000 + index,
        });
      }
    });
    const rows = (await env.owner.query(api.menuTeam.activity, { menuServiceId: env.sid })) ?? [];
    expect(rows).toHaveLength(MENU_MAX_ACTIVITY);
    expect(rows[0].createdAt).toBe(T0 + 1000 + MENU_MAX_ACTIVITY + 9);
    expect(rows[rows.length - 1].createdAt).toBe(T0 + 1000 + 10);
  });

  test("another venue's rows never appear", async () => {
    const env = await world();
    await env.otherOwner.mutation(api.menuStaff.create, { menuServiceId: env.w.b.menuServiceId, displayName: "Marko Konobar" });
    const rows = (await env.owner.query(api.menuTeam.activity, { menuServiceId: env.sid })) ?? [];
    expect(JSON.stringify(rows)).not.toContain("Marko Konobar");
    const own = (await env.otherOwner.query(api.menuTeam.activity, { menuServiceId: env.w.b.menuServiceId })) ?? [];
    expect(own.some((row) => row.action === "staff.created" && row.subject === "Marko Konobar")).toBe(true);
  });

  test("the other kinds of actor: guest, system, a staff member of this venue by name, one of another venue without a name", async () => {
    const env = await world();
    const { staffId } = await env.owner.mutation(api.menuStaff.create, { menuServiceId: env.sid, displayName: "Ana Konobar" });
    const { staffId: foreign } = await env.otherOwner.mutation(api.menuStaff.create, {
      menuServiceId: env.w.b.menuServiceId,
      displayName: "Marko Konobar",
    });
    await env.t.run(async (ctx) => {
      const base = { menuServiceId: env.sid, action: "request.accepted" as const };
      await ctx.db.insert("menuAuditLog", { ...base, actorKind: "guest", createdAt: T0 + 5000 });
      await ctx.db.insert("menuAuditLog", { ...base, actorKind: "system", createdAt: T0 + 5001 });
      await ctx.db.insert("menuAuditLog", { ...base, actorKind: "staff", actorRef: staffId, createdAt: T0 + 5002 });
      await ctx.db.insert("menuAuditLog", { ...base, actorKind: "staff", actorRef: foreign, createdAt: T0 + 5003 });
    });
    const rows = (await env.owner.query(api.menuTeam.activity, { menuServiceId: env.sid })) ?? [];
    expect(rows.slice(0, 4).map((row) => row.actor)).toEqual([
      { kind: "staff", name: null },
      { kind: "staff", name: "Ana Konobar" },
      { kind: "system" },
      { kind: "guest" },
    ]);
  });

  test("contains no e-mail address, no PIN and no hash, even after staff.pin_set", async () => {
    const env = await world();
    const { staffId } = await env.owner.mutation(api.menuStaff.create, { menuServiceId: env.sid, displayName: "Ana Konobar" });
    const { pin } = await env.owner.mutation(api.menuStaff.setPin, { staffId, pin: "482" });
    await invited(env, "ana@example.com");
    await env.owner.mutation(api.menuStaff.setZone, { staffId, zoneId: null });
    const staff = await env.t.run((ctx) => ctx.db.get(staffId));
    expect(staff?.pinHash).toBeTruthy();

    const rows = (await env.owner.query(api.menuTeam.activity, { menuServiceId: env.sid })) ?? [];
    expect(rows.some((row) => row.action === "staff.pin_set")).toBe(true);
    const dump = JSON.stringify(rows);
    expect(dump).not.toContain("@");
    expect(dump).not.toContain(`"${pin}"`);
    expect(dump).not.toContain(staff?.pinHash as string);
    expect(dump).not.toContain(staff?.pinLookup as string);
    expect(dump).not.toMatch(/pinHash|pinLookup|inviteTokenHash|token/i);
  });
});
