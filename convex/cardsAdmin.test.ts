/// <reference types="vite/client" />

// TASK-72 — the admin card console, provable with convex-test: requireAdmin
// gating, exactly-one-audit-row-per-mutation discipline, generic batch, and —
// the critical one — that a REFUSED combination (a Links page whose destinations
// reach Memories) reaches the caller as a READABLE Serbian sentence, not a code
// or a generic error, and writes NO audit row.

import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { ConvexError } from "convex/values";
import { beforeEach, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const ADMIN_EMAIL = "admin@scanme.test";
const ISSUER = "https://test.local";

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
    const outsiderId = await ctx.db.insert("users", {
      email: "outsider@scanme.test",
      emailVerificationTime: now,
    });
    const businessId = await ctx.db.insert("businesses", {
      name: "Kafana Kod Šarana",
      slug: "kod-sarana",
      status: "active",
      createdAt: now,
    });
    return { adminId, outsiderId, businessId };
  });
}

function asAdmin(t: T, adminId: Id<"users">) {
  return t.withIdentity({ subject: adminId, issuer: ISSUER });
}

async function auditRows(t: T, businessId: Id<"businesses">) {
  // Inside t.run, withIndex loses the schema's index types (convex-test gotcha),
  // so filter on the field instead — the audit set per test is tiny.
  return t.run(async (ctx) =>
    ctx.db
      .query("adminAuditLog")
      .filter((q) => q.eq(q.field("businessId"), businessId))
      .collect(),
  );
}

test("non-admin is refused", async () => {
  const t = newT();
  const { outsiderId, businessId } = await seed(t);
  const outsider = t.withIdentity({ subject: outsiderId, issuer: ISSUER });
  await expect(
    outsider.mutation(api.cardsAdmin.createCard, {
      businessId,
      label: "Ulaz",
      target: { kind: "venue" },
    }),
  ).rejects.toThrow("administratorski pristup");
});

test("createCard writes exactly one audit row", async () => {
  const t = newT();
  const { adminId, businessId } = await seed(t);
  const admin = asAdmin(t, adminId);

  const result = await admin.mutation(api.cardsAdmin.createCard, {
    businessId,
    label: "Ulaz",
    target: { kind: "venue" },
  });
  expect(result.cardCode).toHaveLength(8);

  const rows = await auditRows(t, businessId);
  expect(rows).toHaveLength(1);
  expect(rows[0].action).toBe("create_card");
  const detail = JSON.parse(rows[0].detail ?? "{}");
  expect(detail.kind).toBe("venue");
  expect(detail.cardCode).toBe(result.cardCode);
});

test("createCardBatch mints N labelled cards and one audit row", async () => {
  const t = newT();
  const { adminId, businessId } = await seed(t);
  const admin = asAdmin(t, adminId);

  const result = await admin.mutation(api.cardsAdmin.createCardBatch, {
    businessId,
    count: 20,
    startIndex: 1,
    labelPrefix: "Sto",
    target: { kind: "table_ordering" },
  });
  expect(result.created).toHaveLength(20);

  const listed = await admin.query(api.cardsAdmin.listBusinessCards, {
    businessId,
  });
  const labels = new Set((listed?.cards ?? []).map((c) => c.label));
  expect(labels.size).toBe(20);
  expect(labels.has("Sto 1")).toBe(true);
  expect(labels.has("Sto 20")).toBe(true);

  const rows = await auditRows(t, businessId);
  expect(rows).toHaveLength(1);
  expect(rows[0].action).toBe("create_card_batch");
  const detail = JSON.parse(rows[0].detail ?? "{}");
  expect(detail.count).toBe(20);
  expect(detail.kind).toBe("table_ordering");
});

test("a refused Links→Memories card surfaces the readable sentence and writes no audit row", async () => {
  const t = newT();
  const { adminId, businessId } = await seed(t);
  const admin = asAdmin(t, adminId);

  const linksWithMemoriesId = await t.run(async (ctx) => {
    const now = Date.now();
    const profileId = await ctx.db.insert("serviceProfiles", {
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
      serviceProfileId: profileId,
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
    return profileId;
  });

  let caught: unknown;
  try {
    await admin.mutation(api.cardsAdmin.createCard, {
      businessId,
      label: "Sto 7",
      target: { kind: "service_page", serviceProfileId: linksWithMemoriesId },
    });
  } catch (error) {
    caught = error;
  }

  // The caller gets the readable Serbian sentence verbatim (error.data), NOT a
  // code — this is exactly what the UI's errorMessage forwards into the toast.
  expect(caught).toBeInstanceOf(ConvexError);
  const message = (caught as ConvexError<string>).data;
  expect(typeof message).toBe("string");
  expect(message).toContain("Memories iza Links razdelnika nije podržan");
  expect(message).toContain("dva obrasca");

  // Refused = nothing minted, nothing audited.
  const rows = await auditRows(t, businessId);
  expect(rows).toHaveLength(0);
  const listed = await admin.query(api.cardsAdmin.listBusinessCards, {
    businessId,
  });
  expect(listed?.cards ?? []).toHaveLength(0);
});

test("retarget audits once; disable is idempotent (no-op writes no row)", async () => {
  const t = newT();
  const { adminId, businessId } = await seed(t);
  const admin = asAdmin(t, adminId);

  const card = await admin.mutation(api.cardsAdmin.createCard, {
    businessId,
    label: "Ulaz",
    target: { kind: "venue" },
  });

  await admin.mutation(api.cardsAdmin.retargetCard, {
    cardId: card.cardId,
    target: { kind: "url", url: "https://example.com" },
  });

  let rows = await auditRows(t, businessId);
  expect(rows.map((r) => r.action)).toEqual(["create_card", "retarget_card"]);
  const retargetDetail = JSON.parse(rows[1].detail ?? "{}");
  expect(retargetDetail.fromKind).toBe("venue");
  expect(retargetDetail.toKind).toBe("url");

  const first = await admin.mutation(api.cardsAdmin.disableCard, {
    cardId: card.cardId,
  });
  expect(first.changed).toBe(true);
  const second = await admin.mutation(api.cardsAdmin.disableCard, {
    cardId: card.cardId,
  });
  expect(second.changed).toBe(false);

  rows = await auditRows(t, businessId);
  // create + retarget + one disable = 3; the no-op second disable adds nothing.
  expect(rows).toHaveLength(3);
  expect(rows[2].action).toBe("disable_card");
});
