/// <reference types="vite/client" />

// TASK-14 STEP 6 — the card layer, provable with convex-test: creation,
// immutable retargeting, per-kind resolution, requestId replay idempotency
// (the server-generated token records ONE cardScanEvents row), stat rollups,
// and guest minting on the memories branch.

import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { beforeEach, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const ADMIN_EMAIL = "admin@scanme.test";
const ISSUER = "https://test.local";
const SPACE_CODE = "QRST7890";

beforeEach(() => {
  process.env.SCANME_ADMIN_EMAILS = ADMIN_EMAIL;
});

function newT() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  return t;
}

type T = ReturnType<typeof convexTest>;

async function seed(t: T) {
  return t.run(async (ctx) => {
    const now = Date.now();
    const adminId = await ctx.db.insert("users", {
      email: ADMIN_EMAIL,
      emailVerificationTime: now,
    });
    const businessId = await ctx.db.insert("businesses", {
      name: "Kafana Kod Šarana",
      slug: "kod-sarana",
      status: "active",
      createdAt: now,
    });
    const memoriesProfileId = await ctx.db.insert("serviceProfiles", {
      businessId,
      type: "scanme_memories",
      slug: "kod-sarana-memories",
      status: "active",
      totalScans: 0,
      totalPageViews: 0,
      totalConvertedSessions: 0,
      createdAt: now,
      updatedAt: now,
    });
    const spaceId = await ctx.db.insert("memoriesSpaces", {
      businessId,
      memoriesProfileId,
      code: SPACE_CODE,
      name: "Uspomene",
      mode: "recurring",
      status: "active",
      defaultVisibility: "everyone",
      guestVisibilityChoice: true,
      publicGalleryEnabled: false,
      wallEnabled: false,
      totalPhotos: 0,
      totalGuests: 0,
      createdAt: now,
      updatedAt: now,
    });
    const otherBusinessId = await ctx.db.insert("businesses", {
      name: "Tuđi Lokal",
      slug: "tudji-lokal",
      status: "active",
      createdAt: now,
    });
    return { adminId, businessId, spaceId, otherBusinessId };
  });
}

function asAdmin(t: T, adminId: Id<"users">) {
  return t.withIdentity({ subject: adminId, issuer: ISSUER });
}

function resolve(t: T, cardCode: string, requestId: string) {
  return t.mutation(api.cards.resolveAndRecord, {
    cardCode,
    requestId,
    deviceCategory: "mobile" as const,
    ipHash: "test-ip-hash",
  });
}

test("createCard mints a code and the memories target resolves to a fresh guest", async () => {
  const t = newT();
  const { adminId, businessId, spaceId } = await seed(t);
  const { cardCode, cardId } = await asAdmin(t, adminId).mutation(
    api.cards.createCard,
    {
      businessId,
      label: "Sto 4",
      target: { kind: "memories_space", spaceId },
    },
  );
  expect(cardCode).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);

  const outcome = await resolve(t, cardCode, "req-1");
  expect(outcome.kind).toBe("memories_space");
  if (outcome.kind !== "memories_space") throw new Error("unreachable");
  expect(outcome.code).toBe(SPACE_CODE);
  expect(outcome.guestKey).toMatch(/^[A-Za-z0-9_-]{43}$/);

  // The guest row exists, keyed by the minted capability, attributed to the
  // TABLE (cardId) — quota per person, statistics per card.
  const guest = await t.run((ctx) =>
    ctx.db
      .query("memoriesGuests")
      .withIndex("by_spaceId_and_guestKey", (q) =>
        q.eq("spaceId", spaceId).eq("guestKey", outcome.guestKey!),
      )
      .unique(),
  );
  expect(guest?.cardId).toBe(cardId);
});

test("the same server requestId records one cardScanEvents row, not two", async () => {
  const t = newT();
  const { adminId, businessId, spaceId } = await seed(t);
  const { cardCode, cardId } = await asAdmin(t, adminId).mutation(
    api.cards.createCard,
    {
      businessId,
      label: "Sto 1",
      target: { kind: "memories_space", spaceId },
    },
  );

  await resolve(t, cardCode, "req-same");
  await resolve(t, cardCode, "req-same");

  const state = await t.run(async (ctx) => {
    const events = await ctx.db
      .query("cardScanEvents")
      .withIndex("by_cardId_and_occurredAt", (q) => q.eq("cardId", cardId))
      .collect();
    const card = await ctx.db.get(cardId);
    const dailies = await ctx.db
      .query("dailyCardMetrics")
      .withIndex("by_cardId_and_dateKey", (q) => q.eq("cardId", cardId))
      .collect();
    return { events, card, dailies };
  });
  expect(state.events).toHaveLength(1);
  expect(state.card?.totalScans).toBe(1);
  expect(state.dailies).toHaveLength(1);
  expect(state.dailies[0].scans).toBe(1);

  // A fresh requestId counts again.
  await resolve(t, cardCode, "req-other");
  const after = await t.run((ctx) => ctx.db.get(cardId));
  expect(after?.totalScans).toBe(2);
});

test("unknown, disabled and target-less cards resolve to invalid", async () => {
  const t = newT();
  const { adminId, businessId } = await seed(t);

  expect((await resolve(t, "ZZZZZZZ2", "req-a")).kind).toBe("invalid");
  expect((await resolve(t, "not-a-code", "req-b")).kind).toBe("invalid");

  const bare = await asAdmin(t, adminId).mutation(api.cards.createCard, {
    businessId,
    label: "Bez odredišta",
  });
  expect((await resolve(t, bare.cardCode, "req-c")).kind).toBe("invalid");

  await t.run((ctx) => ctx.db.patch(bare.cardId, { status: "disabled" }));
  expect((await resolve(t, bare.cardCode, "req-d")).kind).toBe("invalid");
});

test("retargeting appends an immutable target row and re-points resolution", async () => {
  const t = newT();
  const { adminId, businessId, spaceId } = await seed(t);
  const admin = asAdmin(t, adminId);
  const { cardId, cardCode } = await admin.mutation(api.cards.createCard, {
    businessId,
    label: "Sto 2",
    target: { kind: "memories_space", spaceId },
  });
  expect((await resolve(t, cardCode, "req-1")).kind).toBe("memories_space");

  await admin.mutation(api.cards.retargetCard, {
    cardId,
    target: { kind: "url", url: "https://scanme.rs/" },
  });
  const outcome = await resolve(t, cardCode, "req-2");
  expect(outcome).toMatchObject({ kind: "url", url: "https://scanme.rs/" });

  // The old target row survives as the audit trail; currentTargetId moved.
  const state = await t.run(async (ctx) => {
    const targets = await ctx.db
      .query("cardTargets")
      .withIndex("by_cardId", (q) => q.eq("cardId", cardId))
      .collect();
    const card = await ctx.db.get(cardId);
    return { targets, card };
  });
  expect(state.targets).toHaveLength(2);
  expect(state.card?.currentTargetId).toBe(
    state.targets.find((target) => target.kind === "url")?._id,
  );
});

test("venue and event targets resolve to clean business URLs", async () => {
  const t = newT();
  const { adminId, businessId } = await seed(t);
  const eventId = await t.run(async (ctx) => {
    const now = Date.now();
    return ctx.db.insert("events", {
      businessId,
      slug: "otvaranje",
      title: "Otvaranje",
      status: "live",
      lifecycleRevision: 0,
      createdAt: now,
      updatedAt: now,
    });
  });
  const admin = asAdmin(t, adminId);
  const venueCard = await admin.mutation(api.cards.createCard, {
    businessId,
    label: "Ulaz",
    target: { kind: "venue" },
  });
  expect(await resolve(t, venueCard.cardCode, "req-v")).toEqual({
    kind: "venue",
    businessSlug: "kod-sarana",
  });
  const eventCard = await admin.mutation(api.cards.createCard, {
    businessId,
    label: "Plakat",
    target: { kind: "event", eventId },
  });
  expect(await resolve(t, eventCard.cardCode, "req-e")).toEqual({
    kind: "event",
    businessSlug: "kod-sarana",
    eventSlug: "otvaranje",
  });
});

test("menu target resolves to business clean menu URL and records scan once per requestId", async () => {
  const t = newT();
  const { adminId, businessId } = await seed(t);
  const admin = asAdmin(t, adminId);

  // Card with target kind "menu" can now be created (TASK-56)
  const menuCard = await admin.mutation(api.cards.createCard, {
    businessId,
    label: "Meni Sto 1",
    target: { kind: "menu" },
  });
  expect(menuCard.cardCode).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
  expect(menuCard.targetId).not.toBeNull();

  // Resolves to { kind: "menu", businessSlug: "kod-sarana" }
  const outcome = await resolve(t, menuCard.cardCode, "req-menu-1");
  expect(outcome).toEqual({
    kind: "menu",
    businessSlug: "kod-sarana",
  });

  // Idempotency: replay with the same requestId records exactly ONE scan event
  await resolve(t, menuCard.cardCode, "req-menu-1");
  const state = await t.run(async (ctx) => {
    const events = await ctx.db
      .query("cardScanEvents")
      .withIndex("by_cardId_and_occurredAt", (q) => q.eq("cardId", menuCard.cardId))
      .collect();
    const card = await ctx.db.get(menuCard.cardId);
    return { events, card };
  });
  expect(state.events).toHaveLength(1);
  expect(state.events[0].targetKind).toBe("menu");
  expect(state.card?.totalScans).toBe(1);

  // A different requestId records a second scan
  await resolve(t, menuCard.cardCode, "req-menu-2");
  const after = await t.run((ctx) => ctx.db.get(menuCard.cardId));
  expect(after?.totalScans).toBe(2);

  // Disabled card resolves to invalid
  await t.run((ctx) => ctx.db.patch(menuCard.cardId, { status: "disabled" }));
  expect((await resolve(t, menuCard.cardCode, "req-menu-3")).kind).toBe("invalid");

  // ADMIN-12 extends the existing splitter to include Menu.
  await expect(
    admin.mutation(api.cards.createCard, {
      businessId,
      label: "Sto Splitter Meni",
      target: {
        kind: "splitter",
        splitterItems: [
          { kind: "menu", label: "Meni" },
          { kind: "venue", label: "Ponuda" },
        ],
      },
    }),
  ).resolves.toMatchObject({ cardId: expect.any(String) });
});

test("cross-business targets and unsafe URLs are rejected at write time", async () => {
  const t = newT();
  const { adminId, otherBusinessId, spaceId } = await seed(t);
  const admin = asAdmin(t, adminId);
  await expect(
    admin.mutation(api.cards.createCard, {
      businessId: otherBusinessId,
      label: "Pogrešan lokal",
      target: { kind: "memories_space", spaceId },
    }),
  ).rejects.toThrow("ne pripada");
  await expect(
    admin.mutation(api.cards.createCard, {
      businessId: otherBusinessId,
      label: "Nesiguran link",
      target: { kind: "url", url: "http://insecure.example.com/" },
    }),
  ).rejects.toThrow("https");
});

test("bot scans are recorded as events but never counted", async () => {
  const t = newT();
  const { adminId, businessId, spaceId } = await seed(t);
  const { cardCode, cardId } = await asAdmin(t, adminId).mutation(
    api.cards.createCard,
    {
      businessId,
      label: "Sto 9",
      target: { kind: "memories_space", spaceId },
    },
  );
  await t.mutation(api.cards.resolveAndRecord, {
    cardCode,
    requestId: "req-bot",
    deviceCategory: "bot",
    ipHash: "bot-hash",
  });
  const state = await t.run(async (ctx) => {
    const events = await ctx.db
      .query("cardScanEvents")
      .withIndex("by_cardId_and_occurredAt", (q) => q.eq("cardId", cardId))
      .collect();
    const card = await ctx.db.get(cardId);
    return { events, card };
  });
  expect(state.events).toHaveLength(1);
  expect(state.events[0].deviceCategory).toBe("bot");
  expect(state.card?.totalScans).toBe(0);
});

// -----------------------------------------------------------------------------
// TASK-37 — the bare splitter (RFC-002 §2.4): one card, several services, and
// the table's survival through the card-aware Memories hop.
// -----------------------------------------------------------------------------

test("splitter scan + Memories choice mints the guest WITH cardId — the table survives", async () => {
  const t = newT();
  const { adminId, businessId, spaceId } = await seed(t);
  const { cardCode, cardId } = await asAdmin(t, adminId).mutation(
    api.cards.createCard,
    {
      businessId,
      label: "Sto 7",
      target: {
        kind: "splitter",
        splitterItems: [
          { kind: "memories_space", label: "Uspomene", spaceId },
          { kind: "venue", label: "Ponuda" },
        ],
      },
    },
  );

  // The physical scan resolves to the splitter and is recorded ONCE.
  const scanned = await resolve(t, cardCode, "req-split-1");
  expect(scanned).toEqual({ kind: "splitter", cardCode });

  // The Memories button goes through the card-aware hop — the same minting
  // path as a direct memories_space card.
  const hop = await t.mutation(api.cards.resolveSplitterMemories, {
    cardCode,
    spaceCode: SPACE_CODE,
    ipHash: "test-ip-hash",
  });
  expect(hop.kind).toBe("memories_space");
  if (hop.kind !== "memories_space") throw new Error("unreachable");
  expect(hop.code).toBe(SPACE_CODE);
  expect(hop.guestKey).toMatch(/^[A-Za-z0-9_-]{43}$/);

  // THE assertion this task exists for: the guest carries the card's id, so
  // per-table quota and statistics survive the splitter.
  const state = await t.run(async (ctx) => {
    const guest = await ctx.db
      .query("memoriesGuests")
      .withIndex("by_spaceId_and_guestKey", (q) =>
        q.eq("spaceId", spaceId).eq("guestKey", hop.guestKey!),
      )
      .unique();
    const card = await ctx.db.get(cardId);
    const events = await ctx.db
      .query("cardScanEvents")
      .withIndex("by_cardId_and_occurredAt", (q) => q.eq("cardId", cardId))
      .collect();
    return { guest, card, events };
  });
  expect(state.guest?.cardId).toBe(cardId);
  // The button tap is not a second scan: one event (targetKind "splitter"),
  // one counted scan.
  expect(state.events).toHaveLength(1);
  expect(state.events[0].targetKind).toBe("splitter");
  expect(state.card?.totalScans).toBe(1);
});

test("the memories hop refuses spaces the splitter does not offer and non-splitter cards", async () => {
  const t = newT();
  const { adminId, businessId, spaceId } = await seed(t);
  const admin = asAdmin(t, adminId);

  // A second space in the same business that is NOT on the splitter.
  const foreignCode = "ABCD2345";
  await t.run(async (ctx) => {
    const now = Date.now();
    const memoriesProfileId = await ctx.db.insert("serviceProfiles", {
      businessId,
      type: "scanme_memories",
      slug: "kod-sarana-memories-2",
      status: "active",
      totalScans: 0,
      totalPageViews: 0,
      totalConvertedSessions: 0,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("memoriesSpaces", {
      businessId,
      memoriesProfileId,
      code: foreignCode,
      name: "Druga sala",
      mode: "recurring",
      status: "active",
      defaultVisibility: "everyone",
      guestVisibilityChoice: true,
      publicGalleryEnabled: false,
      wallEnabled: false,
      totalPhotos: 0,
      totalGuests: 0,
      createdAt: now,
      updatedAt: now,
    });
  });

  const splitter = await admin.mutation(api.cards.createCard, {
    businessId,
    label: "Sto 8",
    target: {
      kind: "splitter",
      splitterItems: [
        { kind: "memories_space", label: "Uspomene", spaceId },
        { kind: "venue", label: "Ponuda" },
      ],
    },
  });
  const offSplitter = await t.mutation(api.cards.resolveSplitterMemories, {
    cardCode: splitter.cardCode,
    spaceCode: foreignCode,
    ipHash: "test-ip-hash",
  });
  expect(offSplitter.kind).toBe("invalid");

  // A direct memories card is not a splitter: the hop refuses it too.
  const direct = await admin.mutation(api.cards.createCard, {
    businessId,
    label: "Sto 9",
    target: { kind: "memories_space", spaceId },
  });
  const notSplitter = await t.mutation(api.cards.resolveSplitterMemories, {
    cardCode: direct.cardCode,
    spaceCode: SPACE_CODE,
    ipHash: "test-ip-hash",
  });
  expect(notSplitter.kind).toBe("invalid");

  // No guest rows leaked from the refusals.
  const guests = await t.run((ctx) => ctx.db.query("memoriesGuests").collect());
  expect(guests).toHaveLength(0);
});

test("Memories behind a Links-page splitter is refused at card creation with the two-pattern message", async () => {
  const t = newT();
  const { adminId, businessId, spaceId } = await seed(t);
  const admin = asAdmin(t, adminId);

  const { linksWithMemoriesId, cleanLinksId } = await t.run(async (ctx) => {
    const now = Date.now();
    const linksWithMemoriesId = await ctx.db.insert("serviceProfiles", {
      businessId,
      type: "scanme_links",
      slug: "kod-sarana-links",
      status: "active",
      totalScans: 0,
      totalPageViews: 0,
      totalConvertedSessions: 0,
      createdAt: now,
      updatedAt: now,
    });
    // A draft-only /m/ link counts: a draft is one click from published.
    await ctx.db.insert("serviceDestinations", {
      serviceProfileId: linksWithMemoriesId,
      kind: "custom",
      totalClicks: 0,
      totalDirectVisits: 0,
      draftLabel: "Uspomene",
      draftUrl: "https://scanme.rs/m/QRST7890",
      draftIconKey: "link",
      draftOrder: 0,
      draftState: "active",
      createdAt: now,
      updatedAt: now,
    });
    const cleanLinksId = await ctx.db.insert("serviceProfiles", {
      businessId,
      type: "scanme_links",
      slug: "kod-sarana-links-cist",
      status: "active",
      totalScans: 0,
      totalPageViews: 0,
      totalConvertedSessions: 0,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("serviceDestinations", {
      serviceProfileId: cleanLinksId,
      kind: "instagram",
      totalClicks: 0,
      totalDirectVisits: 0,
      draftLabel: "Instagram",
      draftUrl: "https://instagram.com/kodsarana",
      draftIconKey: "instagram",
      draftOrder: 0,
      draftState: "active",
      createdAt: now,
      updatedAt: now,
    });
    return { linksWithMemoriesId, cleanLinksId };
  });

  // Direct card → Links page that reaches Memories: refused, loudly, at mint.
  await expect(
    admin.mutation(api.cards.createCard, {
      businessId,
      label: "Sto 10",
      target: { kind: "service_page", serviceProfileId: linksWithMemoriesId },
    }),
  ).rejects.toThrow("Memories iza Links razdelnika nije podržan");

  // The same page as a bare-splitter button: refused for the same reason.
  await expect(
    admin.mutation(api.cards.createCard, {
      businessId,
      label: "Sto 11",
      target: {
        kind: "splitter",
        splitterItems: [
          { kind: "memories_space", label: "Uspomene", spaceId },
          {
            kind: "service_page",
            label: "Linkovi",
            serviceProfileId: linksWithMemoriesId,
          },
        ],
      },
    }),
  ).rejects.toThrow("dva obrasca");

  // A Links page with no Memories link stays a perfectly valid destination.
  const ok = await admin.mutation(api.cards.createCard, {
    businessId,
    label: "Sto 12",
    target: { kind: "service_page", serviceProfileId: cleanLinksId },
  });
  expect(ok.targetId).not.toBeNull();
});

test("splitter button count is bounded 2–8", async () => {
  const t = newT();
  const { adminId, businessId, spaceId } = await seed(t);
  const admin = asAdmin(t, adminId);

  await expect(
    admin.mutation(api.cards.createCard, {
      businessId,
      label: "Jedno dugme",
      target: {
        kind: "splitter",
        splitterItems: [{ kind: "memories_space", label: "Uspomene", spaceId }],
      },
    }),
  ).rejects.toThrow("između 2 i 8");

  await expect(
    admin.mutation(api.cards.createCard, {
      businessId,
      label: "Devet dugmadi",
      target: {
        kind: "splitter",
        splitterItems: Array.from({ length: 9 }, (_, i) => ({
          kind: "url" as const,
          label: `Link ${i + 1}`,
          url: "https://scanme.rs/",
        })),
      },
    }),
  ).rejects.toThrow("između 2 i 8");
});

// -----------------------------------------------------------------------------
// TASK-63 (RFC-004 §2.2, §2.14) — the card-aware ordering hop: table identity.
// The twin of the TASK-37 Memories block above. Ordering codes are 8-char
// Crockford (normalizeCode, the memoriesSpaces.code family) — a literal like
// "jeleni-order" would not survive normalization, so the tests use valid codes.
// -----------------------------------------------------------------------------

const VENUE_CODE_A = "KAFANA12";
const VENUE_CODE_B = "MENZA123";

async function seedOrderingConfig(
  t: T,
  businessId: Id<"businesses">,
  code: string,
) {
  await t.run(async (ctx) => {
    const now = Date.now();
    await ctx.db.insert("orderingConfig", {
      businessId,
      code,
      enabled: true,
      callWaiterEnabled: true,
      overdueMinutes: 7,
      reasons: [],
      createdAt: now,
      updatedAt: now,
    });
  });
}

test("scanning a table_ordering card mints an ordering guest WITH cardId — the table survives", async () => {
  const t = newT();
  const { adminId, businessId } = await seed(t);
  await seedOrderingConfig(t, businessId, VENUE_CODE_A);

  const { cardCode, cardId } = await asAdmin(t, adminId).mutation(
    api.cards.createCard,
    {
      businessId,
      label: "Sto 20",
      target: { kind: "table_ordering" },
    },
  );

  // The physical scan records ONE scan and 302s to the hop with the venue code
  // — it does NOT mint here (the single mint site is the hop).
  const scanned = await resolve(t, cardCode, "req-order-1");
  expect(scanned).toEqual({
    kind: "table_ordering",
    cardCode,
    venueCode: VENUE_CODE_A,
  });

  // The hop mints the ordering guest WITH the card's cardId.
  const hop = await t.mutation(api.cards.resolveTableOrdering, {
    cardCode,
    venueCode: VENUE_CODE_A,
    ipHash: "test-ip-hash",
  });
  expect(hop.kind).toBe("table_ordering");
  if (hop.kind !== "table_ordering") throw new Error("unreachable");
  expect(hop.code).toBe(VENUE_CODE_A);
  expect(hop.guestKey).toMatch(/^[A-Za-z0-9_-]{43}$/);

  // THE assertion this task exists for: the ordering guest carries the card's
  // id, so the waiter knows the table.
  const state = await t.run(async (ctx) => {
    const guest = await ctx.db
      .query("orderingGuests")
      .withIndex("by_code_and_guestKey", (q) =>
        q.eq("code", VENUE_CODE_A).eq("guestKey", hop.guestKey!),
      )
      .unique();
    const card = await ctx.db.get(cardId);
    const events = await ctx.db
      .query("cardScanEvents")
      .withIndex("by_cardId_and_occurredAt", (q) => q.eq("cardId", cardId))
      .collect();
    return { guest, card, events };
  });
  expect(state.guest?.cardId).toBe(cardId);
  // The hop is not a second scan: one event (targetKind "table_ordering"),
  // one counted scan.
  expect(state.events).toHaveLength(1);
  expect(state.events[0].targetKind).toBe("table_ordering");
  expect(state.card?.totalScans).toBe(1);
});

test("a bare /o link mints no identity: the hop refuses a card that does not route ordering", async () => {
  const t = newT();
  const { adminId, businessId } = await seed(t);
  await seedOrderingConfig(t, businessId, VENUE_CODE_A);

  // A venue card does NOT route ordering. resolveTableOrdering is the ONLY
  // ordering-mint path, and it refuses any card that does not offer ordering —
  // so a client arriving at /o/[code] outside the hop reaches no mint at all.
  const venueCard = await asAdmin(t, adminId).mutation(api.cards.createCard, {
    businessId,
    label: "Sto 21",
    target: { kind: "venue" },
  });
  const outcome = await t.mutation(api.cards.resolveTableOrdering, {
    cardCode: venueCard.cardCode,
    venueCode: VENUE_CODE_A,
    ipHash: "test-ip-hash",
  });
  expect(outcome.kind).toBe("invalid");

  const guests = await t.run((ctx) =>
    ctx.db.query("orderingGuests").collect(),
  );
  expect(guests).toHaveLength(0);
});

test("ordering behind a Links-page splitter is refused at card creation with the two-pattern message", async () => {
  const t = newT();
  const { adminId, businessId } = await seed(t);
  const admin = asAdmin(t, adminId);

  const { linksWithOrderingId, cleanLinksId } = await t.run(async (ctx) => {
    const now = Date.now();
    const linksWithOrderingId = await ctx.db.insert("serviceProfiles", {
      businessId,
      type: "scanme_links",
      slug: "kod-sarana-links-order",
      status: "active",
      totalScans: 0,
      totalPageViews: 0,
      totalConvertedSessions: 0,
      createdAt: now,
      updatedAt: now,
    });
    // A draft-only /o/ link counts: a draft is one click from published.
    await ctx.db.insert("serviceDestinations", {
      serviceProfileId: linksWithOrderingId,
      kind: "custom",
      totalClicks: 0,
      totalDirectVisits: 0,
      draftLabel: "Poručivanje",
      draftUrl: "https://scanme.rs/o/KAFANA12",
      draftIconKey: "link",
      draftOrder: 0,
      draftState: "active",
      createdAt: now,
      updatedAt: now,
    });
    const cleanLinksId = await ctx.db.insert("serviceProfiles", {
      businessId,
      type: "scanme_links",
      slug: "kod-sarana-links-cist-2",
      status: "active",
      totalScans: 0,
      totalPageViews: 0,
      totalConvertedSessions: 0,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("serviceDestinations", {
      serviceProfileId: cleanLinksId,
      kind: "instagram",
      totalClicks: 0,
      totalDirectVisits: 0,
      draftLabel: "Instagram",
      draftUrl: "https://instagram.com/kodsarana2",
      draftIconKey: "instagram",
      draftOrder: 0,
      draftState: "active",
      createdAt: now,
      updatedAt: now,
    });
    return { linksWithOrderingId, cleanLinksId };
  });

  // Direct card → Links page that reaches ordering: refused, loudly, at mint.
  await expect(
    admin.mutation(api.cards.createCard, {
      businessId,
      label: "Sto 22",
      target: { kind: "service_page", serviceProfileId: linksWithOrderingId },
    }),
  ).rejects.toThrow("Poručivanje iza Links razdelnika nije podržano");

  // The same page as a bare-splitter button: refused for the same reason.
  await expect(
    admin.mutation(api.cards.createCard, {
      businessId,
      label: "Sto 23",
      target: {
        kind: "splitter",
        splitterItems: [
          { kind: "venue", label: "Ponuda" },
          {
            kind: "service_page",
            label: "Linkovi",
            serviceProfileId: linksWithOrderingId,
          },
        ],
      },
    }),
  ).rejects.toThrow("dva obrasca");

  // A Links page with no ordering link stays a perfectly valid destination.
  const ok = await admin.mutation(api.cards.createCard, {
    businessId,
    label: "Sto 24",
    target: { kind: "service_page", serviceProfileId: cleanLinksId },
  });
  expect(ok.targetId).not.toBeNull();
});

test("anti-oracle: the ordering hop refuses a venue code that does not match the card's business", async () => {
  const t = newT();
  const { adminId, businessId, otherBusinessId } = await seed(t);
  await seedOrderingConfig(t, businessId, VENUE_CODE_A);
  await seedOrderingConfig(t, otherBusinessId, VENUE_CODE_B);

  const cardA = await asAdmin(t, adminId).mutation(api.cards.createCard, {
    businessId,
    label: "Sto 25",
    target: { kind: "table_ordering" },
  });

  // Business B's venue code passed to A's card: refused, no guest minted.
  const foreign = await t.mutation(api.cards.resolveTableOrdering, {
    cardCode: cardA.cardCode,
    venueCode: VENUE_CODE_B,
    ipHash: "test-ip-hash",
  });
  expect(foreign.kind).toBe("invalid");
  const afterForeign = await t.run((ctx) =>
    ctx.db.query("orderingGuests").collect(),
  );
  expect(afterForeign).toHaveLength(0);

  // A's own code mints normally.
  const own = await t.mutation(api.cards.resolveTableOrdering, {
    cardCode: cardA.cardCode,
    venueCode: VENUE_CODE_A,
    ipHash: "test-ip-hash",
  });
  expect(own.kind).toBe("table_ordering");
});

test("the same server requestId records one scan row for a table_ordering card, not two", async () => {
  const t = newT();
  const { adminId, businessId } = await seed(t);
  await seedOrderingConfig(t, businessId, VENUE_CODE_A);

  const { cardCode, cardId } = await asAdmin(t, adminId).mutation(
    api.cards.createCard,
    {
      businessId,
      label: "Sto 26",
      target: { kind: "table_ordering" },
    },
  );

  await resolve(t, cardCode, "req-order-same");
  await resolve(t, cardCode, "req-order-same");

  const state = await t.run(async (ctx) => {
    const events = await ctx.db
      .query("cardScanEvents")
      .withIndex("by_cardId_and_occurredAt", (q) => q.eq("cardId", cardId))
      .collect();
    const card = await ctx.db.get(cardId);
    return { events, card };
  });
  expect(state.events).toHaveLength(1);
  expect(state.events[0].targetKind).toBe("table_ordering");
  expect(state.card?.totalScans).toBe(1);

  // A fresh requestId counts again.
  await resolve(t, cardCode, "req-order-other");
  const after = await t.run((ctx) => ctx.db.get(cardId));
  expect(after?.totalScans).toBe(2);
});

test("getSplitterView serves the buttons with the card-aware memories href", async () => {
  const t = newT();
  const { adminId, businessId, spaceId } = await seed(t);
  const { cardCode, cardId } = await asAdmin(t, adminId).mutation(
    api.cards.createCard,
    {
      businessId,
      label: "Sto 13",
      target: {
        kind: "splitter",
        splitterItems: [
          { kind: "memories_space", label: "Uspomene", spaceId },
          { kind: "venue", label: "Ponuda" },
          { kind: "url", label: "Sajt", url: "https://scanme.rs/" },
        ],
      },
    },
  );

  const view = await t.query(api.cards.getSplitterView, { cardCode });
  expect(view.status).toBe("ok");
  if (view.status !== "ok") throw new Error("unreachable");
  expect(view.businessName).toBe("Kafana Kod Šarana");
  expect(view.buttons).toEqual([
    {
      label: "Uspomene",
      href: `/r/${cardCode}/m?space=${SPACE_CODE}`,
      external: false,
    },
    { label: "Ponuda", href: "/kod-sarana/venue", external: false },
    { label: "Sajt", href: "https://scanme.rs/", external: true },
  ]);

  // A disabled card stops serving the splitter.
  await t.run((ctx) => ctx.db.patch(cardId, { status: "disabled" }));
  expect((await t.query(api.cards.getSplitterView, { cardCode })).status).toBe(
    "invalid",
  );
});
