/// <reference types="vite/client" />

// ScanMe Menu V1 — K33 hardening: five small security / performance fixes.
//   B5  menuInquiryEmails.sendItemInquiry (old public action, no identity) is
//       throttled per item (3/h) and per venue (20/h) BEFORE anything is sent.
//   B6  draftStatus, listVersions, restoreVersion (stale answer) and
//       menuPresence.listForService name OTHER people by name or the neutral
//       label, never by e-mail; a person's own e-mail may stand in for their
//       own missing name.
//   B8  menuStaff.setPin with a PIN chosen by hand is throttled per account
//       (its answer says whether a colleague holds the PIN); a PIN picked by
//       the system spends nothing.
//   B9  menuTranslations.suggest (a paid AI call) is throttled per Menu
//       service (30/h), after the access checks, before the provider is called.
//   C1  menuAdmin.overview reads no clock: it carries the deadline and the
//       stage, not an `overdue` verdict (the device works that out).
// `fetch` is a stub in EVERY test: nothing leaves the process. Fictional data only.

import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { menuKonobarSr } from "../lib/i18n/sr/menu-konobar";
import { MENU_ERROR } from "../lib/menu/errors/core";
import { TRANSLATION_ERROR } from "../lib/menu/errors/translation";
import { STAFF_ERROR } from "../lib/menu/errors/waiter";
import {
  TEST_ADMIN_EMAIL,
  TEST_ISSUER,
  grantAccountPremium,
  seedMenuWorld,
  type MenuWorldSeed,
} from "../lib/menu/testkit/seed";

const modules = import.meta.glob("./**/*.ts");

const PEPPER = "test-pepper-0123456789abcdef";
const AI_KEY = "test-key-not-a-secret";
const ENV_NAMES = [
  "SCANME_ADMIN_EMAILS",
  "MENU_PIN_PEPPER",
  "MENU_AI_TRANSLATE_KEY",
  "MENU_AI_TRANSLATE_MODEL",
  "RESEND_API_KEY",
  "RESEND_FROM_EMAIL",
  "SCANME_ACTIVATION_REQUEST_EMAIL",
] as const;

type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

let saved: Record<string, string | undefined>;
let fetchMock: ReturnType<typeof stubFetch>;

function stubFetch(handler: FetchFn) {
  const mock = vi.fn<FetchFn>(handler);
  vi.stubGlobal("fetch", mock);
  return mock;
}

const neverFetch = () =>
  stubFetch(async () => {
    throw new Error("the network must not be touched");
  });

beforeEach(() => {
  saved = Object.fromEntries(ENV_NAMES.map((name) => [name, process.env[name]]));
  for (const name of ENV_NAMES) delete process.env[name];
  process.env.SCANME_ADMIN_EMAILS = TEST_ADMIN_EMAIL;
  process.env.MENU_PIN_PEPPER = PEPPER;
  fetchMock = neverFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const name of ENV_NAMES) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
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

/** The ConvexError data a call is refused with, "ok" when it went through. */
async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "ok";
  } catch (error) {
    if (error instanceof ConvexError && typeof error.data === "string") return error.data;
    return error instanceof Error ? error.message : String(error);
  }
}

async function world() {
  const t = newTest();
  const w: MenuWorldSeed = await t.run(async (ctx) => await seedMenuWorld(ctx));
  return { t, w };
}

// =============================================================================
// B5 — the old public item inquiry
// =============================================================================

describe("B5 — menuInquiryEmails.sendItemInquiry", () => {
  /** A business of the OLD model with a published menu and `count` items. */
  async function oldMenu(t: T, name: string, slug: string, count: number) {
    return await t.run(async (ctx) => {
      const now = Date.now();
      const businessId = await ctx.db.insert("businesses", { name, slug, status: "active", createdAt: now });
      const menuId = await ctx.db.insert("menus", { businessId, status: "published", design: null, createdAt: now, updatedAt: now });
      const groupId = await ctx.db.insert("menuGroups", {
        menuId,
        title: "Glavna jela",
        shape: "lista",
        order: 0,
        createdAt: now,
        updatedAt: now,
      });
      const itemIds: Id<"menuItems">[] = [];
      for (let order = 0; order < count; order += 1) {
        itemIds.push(
          await ctx.db.insert("menuItems", {
            menuId,
            groupId,
            name: `Jelo ${order + 1}`,
            productType: "jelo",
            available: true,
            order,
            createdAt: now,
            updatedAt: now,
          }),
        );
      }
      return { businessId, itemIds };
    });
  }

  /** Resend is configured and answers; `fetchMock` counts what would have been sent. */
  function configureResend() {
    process.env.RESEND_API_KEY = "re_test_not_a_real_key";
    process.env.RESEND_FROM_EMAIL = "ScanMe TEST <test-sender@example.invalid>";
    fetchMock = stubFetch(async () => Response.json({ id: "re_test_message" }));
  }

  const inquire = (t: T, itemId: Id<"menuItems">) => t.action(api.menuInquiryEmails.sendItemInquiry, { itemId });

  test("the 4th inquiry for one item within the hour is refused and never reaches Resend; another item still goes", async () => {
    const t = newTest();
    const { itemIds } = await oldMenu(t, "Kafana kod Mike", "kafana-kod-mike", 2);
    configureResend();

    for (let call = 1; call <= 3; call += 1) {
      expect(await inquire(t, itemIds[0])).toEqual({ sent: true });
      expect(fetchMock).toHaveBeenCalledTimes(call);
    }
    expect(await codeOf(inquire(t, itemIds[0]))).toContain("rate_limited");
    expect(await codeOf(inquire(t, itemIds[0]))).toContain("rate_limited");
    expect(fetchMock).toHaveBeenCalledTimes(3);

    expect(await inquire(t, itemIds[1])).toEqual({ sent: true });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  test("the venue is capped at 20 inquiries an hour across its items; another venue is not affected", async () => {
    const t = newTest();
    const { itemIds } = await oldMenu(t, "Kafana kod Mike", "kafana-kod-mike", 7);
    const other = await oldMenu(t, "Demo restoran", "demo-restoran", 1);
    configureResend();

    // Six items x 3 = 18, then two of the seventh = 20.
    for (const itemId of itemIds.slice(0, 6)) {
      for (let call = 0; call < 3; call += 1) expect(await inquire(t, itemId)).toEqual({ sent: true });
    }
    expect(await inquire(t, itemIds[6])).toEqual({ sent: true });
    expect(await inquire(t, itemIds[6])).toEqual({ sent: true });
    expect(fetchMock).toHaveBeenCalledTimes(20);

    // The 21st is inside the item's own limit (its 3rd) but over the venue's.
    expect(await codeOf(inquire(t, itemIds[6]))).toContain("rate_limited");
    expect(fetchMock).toHaveBeenCalledTimes(20);

    expect(await inquire(t, other.itemIds[0])).toEqual({ sent: true });
    expect(fetchMock).toHaveBeenCalledTimes(21);
  });

  test("a deployment without Resend refuses as before and spends no token", async () => {
    const t = newTest();
    const { itemIds } = await oldMenu(t, "Kafana kod Mike", "kafana-kod-mike", 1);

    for (let call = 0; call < 5; call += 1) {
      expect(await codeOf(inquire(t, itemIds[0]))).toBe("Slanje upita nije podešeno.");
    }
    expect(fetchMock).not.toHaveBeenCalled();

    configureResend();
    for (let call = 0; call < 3; call += 1) expect(await inquire(t, itemIds[0])).toEqual({ sent: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

// =============================================================================
// B6 — no colleague's e-mail in what an Editor reads
// =============================================================================

describe("B6 — names of other people", () => {
  const LABEL = menuKonobarSr.zaglavlje.nalogBezImena;
  const OWNER_EMAIL = "vlasnik@example.com";
  const EDITOR_EMAIL = "urednik@example.com";

  /** The owner drafted, ScanMe's admin published version 1, then the owner edited the price. */
  async function editedAfterPublish() {
    const { t, w } = await world();
    const id = w.a.menuServiceId;
    const owner = as(t, w.ownerId);
    const section = await owner.mutation(api.menuCatalog.addSection, { pageId: w.a.defaultPageId, name: "Roštilj" });
    const created = await owner.mutation(api.menuCatalog.quickAddArticle, {
      sectionId: section.sectionId,
      name: "Pljeskavica",
      priceRsd: 450,
    });
    if (created.status !== "created") throw new Error(`expected created, got ${created.status}`);

    const admin = as(t, w.adminId);
    const preview = await admin.query(api.menuPublishing.publishPreview, { menuServiceId: id });
    if (!preview) throw new Error("expected a preview");
    const published = await admin.mutation(api.menuPublishing.publish, {
      menuServiceId: id,
      expectedRevision: preview.revision,
      acknowledgedWarnings: preview.fingerprint,
    });
    expect(published.ok).toBe(true);

    expect(await owner.mutation(api.menuCatalog.setBasePrice, { articleId: created.articleId, expectedPriceRsd: 450, priceRsd: 520 })).toEqual({
      ok: true,
    });
    return { t, w, id };
  }

  /** What `viewer` reads through the four functions that name a person. */
  async function readAs(t: T, viewerId: Id<"users">, id: Id<"menuServices">) {
    const viewer = as(t, viewerId);
    const status = await viewer.query(api.menuPublishing.draftStatus, { menuServiceId: id });
    const listing = await viewer.query(api.menuPublishing.listVersions, { menuServiceId: id });
    if (!status || !listing) throw new Error("expected the editor to read the status and the versions");
    const stale = await viewer.mutation(api.menuPublishing.restoreVersion, {
      menuServiceId: id,
      versionNumber: 1,
      expectedRevision: status.revision - 1,
    });
    if (stale.ok) throw new Error("expected a stale refusal");
    const presence = await viewer.query(api.menuPresence.listForService, { menuServiceId: id, nowBucket: Date.now() });
    if (!presence) throw new Error("expected the presence list");
    return { status, listing, stale, presence };
  }

  async function beat(t: T, userId: Id<"users">, id: Id<"menuServices">, sessionId: string) {
    await as(t, userId).mutation(api.menuPresence.heartbeat, { menuServiceId: id, sessionId });
  }

  test("an Editor never sees the e-mail of the owner or the ScanMe admin, in any of the four functions", async () => {
    const { t, w, id } = await editedAfterPublish();
    await beat(t, w.ownerId, id, "tab-owner-0001");
    await beat(t, w.adminId, id, "tab-admin-0001");

    const seen = await readAs(t, w.editorId, id);

    // The owner edited last, the admin published version 1: both without a display name.
    expect(seen.status.lastEditBy).toEqual({ userId: w.ownerId, name: LABEL, isMe: false });
    expect(seen.listing.versions[0].publishedBy).toEqual({ userId: w.adminId, name: LABEL });
    expect(seen.stale.lastEditBy).toEqual({ userId: w.ownerId, name: LABEL });
    expect(seen.presence.entries.map((entry) => [entry.userId, entry.name, entry.isMe]).sort()).toEqual(
      [
        [w.ownerId, LABEL, false],
        [w.adminId, LABEL, false],
      ].sort(),
    );

    const everything = JSON.stringify(seen);
    for (const email of [OWNER_EMAIL, TEST_ADMIN_EMAIL]) expect(everything).not.toContain(email);
  });

  test("a colleague with a display name is shown by that name", async () => {
    const { t, w, id } = await editedAfterPublish();
    await t.run(async (ctx) => {
      await ctx.db.patch(w.ownerId, { name: "Mika Vlasnik" });
      await ctx.db.patch(w.adminId, { name: "Ana Podrška" });
    });
    await beat(t, w.ownerId, id, "tab-owner-0001");

    const seen = await readAs(t, w.editorId, id);

    expect(seen.status.lastEditBy).toMatchObject({ userId: w.ownerId, name: "Mika Vlasnik" });
    expect(seen.listing.versions[0].publishedBy).toEqual({ userId: w.adminId, name: "Ana Podrška" });
    expect(seen.stale.lastEditBy).toMatchObject({ name: "Mika Vlasnik" });
    expect(seen.presence.entries).toHaveLength(1);
    expect(seen.presence.entries[0]).toMatchObject({ userId: w.ownerId, name: "Mika Vlasnik", isMe: false });
  });

  test("a person's own e-mail still stands in for their own missing name", async () => {
    const { t, w, id } = await editedAfterPublish();
    await beat(t, w.ownerId, id, "tab-owner-0001");

    const seen = await readAs(t, w.ownerId, id);

    expect(seen.status.lastEditBy).toEqual({ userId: w.ownerId, name: OWNER_EMAIL, isMe: true });
    expect(seen.stale.lastEditBy).toEqual({ userId: w.ownerId, name: OWNER_EMAIL });
    expect(seen.presence.entries[0]).toMatchObject({ userId: w.ownerId, name: OWNER_EMAIL, isMe: true });
    // The admin published version 1: the owner reads them as a colleague.
    expect(seen.listing.versions[0].publishedBy).toEqual({ userId: w.adminId, name: LABEL });

    // And the editor's own entry in the presence list is theirs to read.
    await beat(t, w.editorId, id, "tab-editor-0001");
    const own = (await readAs(t, w.editorId, id)).presence.entries.find((entry) => entry.userId === w.editorId);
    expect(own).toMatchObject({ name: EDITOR_EMAIL, isMe: true });
  });
});

// =============================================================================
// B8 — choosing a staff PIN by hand
// =============================================================================

describe("B8 — menuStaff.setPin", () => {
  async function staffWorld() {
    const { t, w } = await world();
    const owner = as(t, w.ownerId);
    const manager = as(t, w.managerId);
    const create = async (displayName: string) =>
      (await owner.mutation(api.menuStaff.create, { menuServiceId: w.a.menuServiceId, displayName })).staffId;
    return { t, w, owner, manager, create };
  }

  const staffRow = (t: T, staffId: Id<"menuStaff">) => t.run((ctx) => ctx.db.get(staffId));
  const pinAudits = (t: T, menuServiceId: Id<"menuServices">) =>
    t.run(async (ctx) => {
      const rows = await ctx.db
        .query("menuAuditLog")
        .withIndex("by_menuServiceId_and_createdAt", (q) => q.eq("menuServiceId", menuServiceId))
        .collect();
      return rows.filter((row) => row.action === "staff.pin_set").length;
    });

  test("the 11th PIN chosen by hand in 15 minutes is staff/rate_limited, also for a PIN a colleague holds; nothing is written", async () => {
    const { t, w, owner, manager, create } = await staffWorld();
    const ana = await create("Ana");
    const marko = await create("Marko");
    // The system picks Marko's PIN: that spends nothing.
    const { pin: held } = await owner.mutation(api.menuStaff.setPin, { staffId: marko });
    const free = Array.from({ length: 30 }, (_, index) => String(100 + index)).filter((pin) => pin !== held);

    for (const pin of free.slice(0, 10)) {
      expect(await owner.mutation(api.menuStaff.setPin, { staffId: ana, pin })).toMatchObject({ pin });
    }
    const anaBefore = await staffRow(t, ana);
    const markoBefore = await staffRow(t, marko);
    const auditsBefore = await pinAudits(t, w.a.menuServiceId);

    // Over the limit: a free PIN and the PIN a colleague holds get the SAME answer, so the oracle is closed.
    expect(await codeOf(owner.mutation(api.menuStaff.setPin, { staffId: ana, pin: free[10] }))).toBe(STAFF_ERROR.rateLimited);
    expect(await codeOf(owner.mutation(api.menuStaff.setPin, { staffId: ana, pin: held }))).toBe(STAFF_ERROR.rateLimited);
    expect(await staffRow(t, ana)).toEqual(anaBefore);
    expect(await staffRow(t, marko)).toEqual(markoBefore);
    expect(await pinAudits(t, w.a.menuServiceId)).toBe(auditsBefore);

    // The bucket is per account: the manager has their own, and inside it the answer is the old one.
    expect(await codeOf(manager.mutation(api.menuStaff.setPin, { staffId: ana, pin: held }))).toBe(STAFF_ERROR.pinTaken);
    expect(await manager.mutation(api.menuStaff.setPin, { staffId: ana, pin: free[10] })).toMatchObject({ pin: free[10] });
  });

  test("PINs picked by the system spend nothing, and an invalid format is refused before the limiter", async () => {
    const { owner, create } = await staffWorld();
    const ana = await create("Ana");

    for (let call = 0; call < 14; call += 1) {
      expect(await owner.mutation(api.menuStaff.setPin, { staffId: ana })).toMatchObject({ pin: expect.stringMatching(/^\d{3}$/) });
    }
    for (let call = 0; call < 14; call += 1) {
      expect(await codeOf(owner.mutation(api.menuStaff.setPin, { staffId: ana, pin: "12" }))).toBe(STAFF_ERROR.pinFormat);
    }
    // The bucket is still full: ten PINs by hand go through.
    for (let pin = 200; pin < 210; pin += 1) {
      expect(await owner.mutation(api.menuStaff.setPin, { staffId: ana, pin: String(pin) })).toMatchObject({ pin: String(pin) });
    }
    expect(await codeOf(owner.mutation(api.menuStaff.setPin, { staffId: ana, pin: "210" }))).toBe(STAFF_ERROR.rateLimited);
    // A system pick still works after the manual bucket is empty.
    expect(await codeOf(owner.mutation(api.menuStaff.setPin, { staffId: ana }))).toBe("ok");
  });
});

// =============================================================================
// B9 — the paid AI suggestion
// =============================================================================

describe("B9 — menuTranslations.suggest", () => {
  const answer = (text: string) => ({ stop_reason: "end_turn", content: [{ type: "text", text }] });

  /** Two Premium venues, each with one article and "en" as its translation language. */
  async function aiWorld() {
    const { t, w } = await world();
    await t.run(async (ctx) => {
      await grantAccountPremium(ctx, { accountId: w.a.accountId, via: "plan" });
      await grantAccountPremium(ctx, { accountId: w.b.accountId, via: "plan" });
    });
    async function article(ownerId: Id<"users">, tenant: MenuWorldSeed["a"], name: string) {
      const owner = as(t, ownerId);
      await owner.mutation(api.menuSettings.setLanguages, { menuServiceId: tenant.menuServiceId, translations: ["en"] });
      const section = await owner.mutation(api.menuCatalog.addSection, { pageId: tenant.defaultPageId, name: "Roštilj" });
      const created = await owner.mutation(api.menuCatalog.quickAddArticle, { sectionId: section.sectionId, name, priceRsd: 650 });
      if (created.status !== "created") throw new Error(`expected created, got ${created.status}`);
      return created.articleId;
    }
    const articleA = await article(w.ownerId, w.a, "Ćevapi");
    const articleB = await article(w.otherOwnerId, w.b, "Špageti");
    process.env.MENU_AI_TRANSLATE_KEY = AI_KEY;
    fetchMock = stubFetch(async () => new Response(JSON.stringify(answer('{"name":"Grilled meat"}')), { status: 200 }));
    return { t, w, articleA, articleB };
  }

  const suggest = (t: T, userId: Id<"users">, id: Id<"menuArticles">) =>
    as(t, userId).action(api.menuTranslations.suggest, { kind: "article", id, lang: "en" });

  test("30 suggestions an hour for one Menu service; the 31st is refused with no provider call and nothing stored", async () => {
    const { t, w, articleA, articleB } = await aiWorld();

    for (let call = 1; call <= 30; call += 1) {
      expect(await suggest(t, w.ownerId, articleA)).toEqual({ fields: 1 });
    }
    expect(fetchMock).toHaveBeenCalledTimes(30);

    // Over the limit: the answer of a suggestion that did not arrive, and the provider is not called.
    const manager = await codeOf(suggest(t, w.managerId, articleA));
    expect(manager).toBe(TRANSLATION_ERROR.aiFailed);
    expect(fetchMock).toHaveBeenCalledTimes(30);

    // The bucket belongs to the service: the other venue is not affected.
    expect(await suggest(t, w.otherOwnerId, articleB)).toEqual({ fields: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(31);
  });

  test("access is checked before the bucket: an outsider with the bucket empty still gets menu/not_found", async () => {
    const { t, w, articleA } = await aiWorld();
    for (let call = 0; call < 30; call += 1) await suggest(t, w.ownerId, articleA);
    expect(fetchMock).toHaveBeenCalledTimes(30);

    expect(await codeOf(suggest(t, w.outsiderId, articleA))).toBe(MENU_ERROR.notFound);
    expect(await codeOf(suggest(t, w.financeId, articleA))).toBe(MENU_ERROR.notFound);
    expect(await codeOf(suggest(t, w.ownerId, articleA))).toBe(TRANSLATION_ERROR.aiFailed);
    expect(fetchMock).toHaveBeenCalledTimes(30);
  });

  test("a refusal that never reaches the provider spends no token", async () => {
    const { t, w, articleA } = await aiWorld();
    // A language outside Settings is refused before the provider (and before the bucket).
    for (let call = 0; call < 40; call += 1) {
      expect(
        await codeOf(as(t, w.ownerId).action(api.menuTranslations.suggest, { kind: "article", id: articleA, lang: "de" })),
      ).toBe(TRANSLATION_ERROR.languageOff);
    }
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await suggest(t, w.ownerId, articleA)).toEqual({ fields: 1 });
  });
});

// =============================================================================
// C1 — no clock in menuAdmin.overview
// =============================================================================

describe("C1 — menuAdmin.overview", () => {
  test("carries the deadline and the stage but no 'overdue' verdict (the device works that out)", async () => {
    const { t, w } = await world();
    const admin = as(t, w.adminId);
    await admin.mutation(api.menuAdmin.grantMenu, { businessId: w.a.businessId });

    const view = await admin.query(api.menuAdmin.overview, { businessId: w.a.businessId });
    if (!view?.menu) throw new Error("expected a menu in the overview");
    expect(Object.keys(view.menu)).not.toContain("overdue");
    expect(view.menu.migrationStage).toBe("received");
    expect(view.menu.deadlineAt).toBeGreaterThan(view.menu.migrationReceivedAt ?? Infinity);
  });
});
