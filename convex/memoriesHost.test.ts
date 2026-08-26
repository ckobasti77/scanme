/// <reference types="vite/client" />

// TASK-18 STEP 3 & 4 — the host's table cards (mint/list/disable) and space
// controls (visibility switches, pause/resume, one_off window extend/close),
// provable with convex-test. Access is requireBusinessAccess (admin passes),
// and every write leaves content intact.

import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { beforeEach, describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const ADMIN_EMAIL = "admin@scanme.test";
const ISSUER = "https://test.local";

beforeEach(() => {
  process.env.SCANME_ADMIN_EMAILS = ADMIN_EMAIL;
});

// resolveAndRecord (used to prove card targeting) touches the rate limiter.
function newT() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  return t;
}

async function seedGranted(t: ReturnType<typeof convexTest>) {
  const adminId = await t.run((ctx) =>
    ctx.db.insert("users", {
      email: ADMIN_EMAIL,
      emailVerificationTime: Date.now(),
    }),
  );
  const businessId = await t.run((ctx) =>
    ctx.db.insert("businesses", {
      name: "Kafana Kod Šarana",
      slug: "kod-sarana",
      status: "active",
      createdAt: Date.now(),
    }),
  );
  const as = t.withIdentity({ subject: adminId, issuer: ISSUER });
  const grant = await as.mutation(api.memoriesAdmin.grantMemories, {
    businessId,
    planKey: "basic",
  });
  return { as, businessId, spaceId: grant.spaceId, code: grant.code };
}

describe("table cards", () => {
  test("mints a labelled batch targeting the space, lists them, and disables one", async () => {
    const t = newT();
    const { as, spaceId } = await seedGranted(t);

    const minted = await as.mutation(api.cards.mintCardsForSpace, {
      spaceId,
      count: 3,
      startIndex: 1,
      labelPrefix: "Sto",
    });
    expect(minted.created).toHaveLength(3);
    expect(minted.created.map((c) => c.label)).toEqual([
      "Sto 1",
      "Sto 2",
      "Sto 3",
    ]);

    let rows = await as.query(api.cards.listSpaceCards, { spaceId });
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.status === "active")).toBe(true);

    // A card resolves to the space (target set correctly).
    const firstCode = minted.created[0].cardCode;
    const outcome = await t.mutation(api.cards.resolveAndRecord, {
      cardCode: firstCode,
      requestId: "req-1",
    });
    expect(outcome.kind).toBe("memories_space");

    await as.mutation(api.cards.disableCard, { cardId: minted.created[0].cardId });
    rows = await as.query(api.cards.listSpaceCards, { spaceId });
    const disabled = rows.find((r) => r.cardId === minted.created[0].cardId);
    expect(disabled?.status).toBe("disabled");

    // A disabled card no longer resolves.
    const blocked = await t.mutation(api.cards.resolveAndRecord, {
      cardCode: firstCode,
      requestId: "req-2",
    });
    expect(blocked.kind).toBe("invalid");
  });

  test("rejects an out-of-range batch count", async () => {
    const t = newT();
    const { as, spaceId } = await seedGranted(t);
    await expect(
      as.mutation(api.cards.mintCardsForSpace, { spaceId, count: 0 }),
    ).rejects.toThrow(/kartica/i);
  });
});

describe("space controls", () => {
  test("toggles the two visibility switches", async () => {
    const t = newT();
    const { as, spaceId } = await seedGranted(t);
    await as.mutation(api.memoriesHost.setSpaceVisibility, {
      spaceId,
      publicGalleryEnabled: true,
    });
    let space = await t.run((ctx) => ctx.db.get(spaceId));
    expect(space?.publicGalleryEnabled).toBe(true);
    expect(space?.wallEnabled).toBe(false);

    await as.mutation(api.memoriesHost.setSpaceVisibility, {
      spaceId,
      wallEnabled: true,
    });
    space = await t.run((ctx) => ctx.db.get(spaceId));
    expect(space?.publicGalleryEnabled).toBe(true);
    expect(space?.wallEnabled).toBe(true);
  });

  test("pauses and resumes the space", async () => {
    const t = newT();
    const { as, spaceId } = await seedGranted(t);
    await as.mutation(api.memoriesHost.setSpacePaused, { spaceId, paused: true });
    expect((await t.run((ctx) => ctx.db.get(spaceId)))?.status).toBe("paused");
    await as.mutation(api.memoriesHost.setSpacePaused, { spaceId, paused: false });
    expect((await t.run((ctx) => ctx.db.get(spaceId)))?.status).toBe("active");
  });

  test("window controls are refused for a recurring space", async () => {
    const t = newT();
    const { as, spaceId } = await seedGranted(t);
    await expect(
      as.mutation(api.memoriesHost.closeSpaceWindow, { spaceId }),
    ).rejects.toThrow(/jednokratni/i);
  });

  test("extend then close a one_off window, leaving the session row intact", async () => {
    const t = newT();
    const adminId = await t.run((ctx) =>
      ctx.db.insert("users", {
        email: ADMIN_EMAIL,
        emailVerificationTime: Date.now(),
      }),
    );
    const as = t.withIdentity({ subject: adminId, issuer: ISSUER });
    const created = await as.mutation(api.memoriesAdmin.createCelebration, {
      kind: "svadba",
      title: "Ana i Nikola",
      eventDate: Date.parse("2026-09-12T18:00:00Z"),
      acquisitionChannel: "direct",
      contactName: "Ana",
      planKey: "basic",
    });

    const later = Date.parse("2026-09-20T18:00:00Z");
    await as.mutation(api.memoriesHost.extendSpaceWindow, {
      spaceId: created.spaceId,
      windowEndAt: later,
    });
    let space = await t.run((ctx) => ctx.db.get(created.spaceId));
    expect(space?.windowEndAt).toBe(later);
    expect(space?.status).toBe("active");

    await as.mutation(api.memoriesHost.closeSpaceWindow, {
      spaceId: created.spaceId,
    });
    space = await t.run((ctx) => ctx.db.get(created.spaceId));
    expect(space?.status).toBe("closed");
    const session = await t.run((ctx) => ctx.db.get(created.sessionId));
    expect(session?.status).toBe("closed");
  });
});
