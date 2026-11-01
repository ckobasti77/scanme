/// <reference types="vite/client" />

// AMF 1 Nov 2026 — "Sačuvaj garažu" (convex/fairGarageEmail.ts + the outbox).
// NOTHING IS SENT: global `fetch` is a mock and the Resend key is a fake.

import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

vi.mock("server-only", () => ({}));
const { fairVisitorHash, generateFairVisitorToken } = await import("../lib/fair-server/visitor");
const { fairGarageEmailHash } = await import("../lib/fair-server/garage-email");

const modules = import.meta.glob("./**/*.ts");
const DAY1 = Date.parse("2026-10-30T12:00:00+01:00");
const PURGE_AT = Date.parse("2026-11-16T00:00:00+01:00");
const ADMIN_EMAIL = "fair-admin@scanme.test";
const ISSUER = "https://fair-garage.test";
const SECRET = "test-fair-visitor-secret-0123456789abcdef";
const GATEWAY_SECRET = "test-fair-gateway-secret-0123456789abcdef";
const EMAIL = "garaza.test@example.invalid";
const CODE_HASH = "a".repeat(64);

let calls: { key: string | null; body: { to: string[]; subject: string; html: string } }[] = [];

beforeEach(() => {
  process.env.SCANME_ADMIN_EMAILS = ADMIN_EMAIL;
  process.env.FAIR_GATEWAY_SECRET = GATEWAY_SECRET;
  process.env.RESEND_API_KEY = "re_test_not_a_real_key";
  process.env.RESEND_FROM_EMAIL = "ScanMe TEST <test-sender@example.invalid>";
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    calls.push({ key: new Headers(init?.headers).get("idempotency-key"), body: JSON.parse(String(init?.body)) });
    return Response.json({ id: `re_test_message_${calls.length}` });
  }));
  vi.useFakeTimers();
  vi.setSystemTime(DAY1 - 86_400_000);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete process.env.RESEND_API_KEY;
  delete process.env.RESEND_FROM_EMAIL;
});

const spec = (order: number) => ({ label: `TEST stavka ${order}`, value: `TEST ${order}`, order, isHighlight: order === 1 });

async function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  const ids = await t.run(async (ctx) => {
    const adminId = await ctx.db.insert("users", { email: ADMIN_EMAIL });
    const now = DAY1 - 86_400_000;
    const client = async (code: string, brandName: string | null) => {
      const accountId = await ctx.db.insert("accounts", {
        name: `TEST klijent ${code}`, plan: "basic", status: "active", smkCode: `SMK-${code}`, ownerDisplayName: `TEST vlasnik ${code}`,
        normalizedOwnerDisplayName: `test vlasnik ${code.toLowerCase()}`, clientStatus: "active", adminV1MigrationVersion: 1, createdAt: now, updatedAt: now,
      });
      const businessId = await ctx.db.insert("businesses", {
        accountId, name: `TEST izlagač ${code}`, slug: `test-izlagac-${code.toLowerCase()}`, smlCode: `SML-${code}`, kind: "business", clientStatus: "active",
        adminV1MigrationVersion: 1, status: "active", createdAt: now,
      });
      const brandId = brandName
        ? await ctx.db.insert("brands", { accountId, name: brandName, normalizedName: brandName.toLowerCase(), revision: "1", colors: [], createdAt: now, updatedAt: now })
        : null;
      return { accountId, businessId, brandId };
    };
    return { adminId, a: await client("TA", "TEST Volta"), inventory: await client("TQ", null), inventoryB: await client("TR", null) };
  });
  const admin = t.withIdentity({ subject: ids.adminId, issuer: ISSUER });
  const fair = async (slug: string, inventoryBusinessId: Id<"businesses">) => {
    const { eventId } = await admin.mutation(api.fairAdmin.upsertEvent, {
      code: slug, slug, title: `TEST ${slug}`, venueName: "TEST hala",
      startsAt: Date.parse("2026-10-30T00:00:00+01:00"), endsAt: Date.parse("2026-11-02T00:00:00+01:00"), status: "published", garagePriority: 1,
      qrInventoryBusinessId: inventoryBusinessId,
    });
    const { participationId } = await admin.mutation(api.fairAdmin.upsertParticipation, {
      eventId, externalKey: `${slug}-a`, accountId: ids.a.accountId, businessId: ids.a.businessId,
    });
    const { standId } = await admin.mutation(api.fairAdmin.upsertStand, {
      eventId, participationId, externalKey: `${slug}-stand-a`, code: "TEST-A", displayName: "TEST štand A", mapLocationId: "ispred-14",
    });
    const model = async (externalKey: string, publish = true) => {
      const { modelId } = await admin.mutation(api.fairAdmin.upsertModel, {
        eventId, participationId, standId, brandId: ids.a.brandId!, externalKey, displayName: `TEST ${externalKey}`, priceText: "TEST cena",
        specifications: [spec(1), spec(2)], packageTier: "included", passportEligible: true,
      });
      if (publish) await admin.mutation(api.fairAdmin.publishModel, { eventModelId: modelId });
      return modelId;
    };
    return { eventId, model };
  };
  const amf = await fair("test-elektromobilnost-2026", ids.inventory.businessId);
  const other = await fair("elektromobilnost-2026", ids.inventoryB.businessId);
  const m1 = await amf.model("test-garage-m1");
  const m2 = await amf.model("test-garage-m2");
  const draft = await amf.model("test-garage-draft", false);
  const foreign = await other.model("test-garage-foreign");
  vi.setSystemTime(DAY1);
  return { t, admin, eventId: amf.eventId, models: { m1, m2, draft, foreign } };
}
type Fixture = Awaited<ReturnType<typeof setup>>;

let sequence = 0;
const visitor = () => fairVisitorHash(generateFairVisitorToken(), SECRET);
function request(f: Fixture, overrides: Partial<{ visitorHash: string; submissionId: string; email: string; emailHash: string; consentAccepted: boolean; eventModelIds: string[]; ipHash: string }> = {}) {
  const email = overrides.email ?? EMAIL;
  return f.t.mutation(api.fairGarageEmail.requestGarageEmail, {
    gatewaySecret: GATEWAY_SECRET,
    visitorHash: overrides.visitorHash ?? visitor(),
    submissionId: overrides.submissionId ?? `test-garage-submission-${++sequence}`,
    email,
    emailHash: overrides.emailHash ?? fairGarageEmailHash(email, SECRET),
    consentAccepted: overrides.consentAccepted ?? true,
    eventId: f.eventId,
    eventModelIds: overrides.eventModelIds ?? [f.models.m1, f.models.m2],
    codeHash: CODE_HASH,
    subject: "TEST naslov",
    text: "TEST tekst",
    html: "<p>TEST</p>",
    ...(overrides.ipHash ? { ipHash: overrides.ipHash } : {}),
  });
}
async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({ data: expect.objectContaining({ code }) });
}
const deliveries = (f: Fixture) => f.t.run(async (ctx) => ctx.db.query("fairEmailDeliveries").collect());
async function runDue(f: Fixture) {
  for (const job of await f.t.run(async (ctx) => ctx.db.system.query("_scheduled_functions").collect())) {
    if (job.name === "fairEmailSender:sendDelivery" && job.state.kind === "pending") {
      await f.t.action(internal.fairEmailSender.sendDelivery, job.args[0] as { deliveryId: Id<"fairEmailDeliveries"> });
    }
  }
}

describe("Sačuvaj garažu — Convex", () => {
  test("validation: bad email, missing consent, bad hash refuse; unpublished and foreign models are dropped", async () => {
    const f = await setup();
    await expectCode(request(f, { email: "nije-email" }), "INVALID_INPUT");
    await expectCode(request(f, { email: "Garaza.Test@Example.invalid" }), "INVALID_INPUT");
    await expectCode(request(f, { consentAccepted: false }), "INVALID_INPUT");
    await expectCode(request(f, { emailHash: "abc" }), "INVALID_INPUT");
    await expectCode(request(f, { eventModelIds: [f.models.draft, f.models.foreign, "nepostojeci"] }), "INVALID_INPUT");
    expect(await deliveries(f)).toHaveLength(0);

    const result = await request(f, { eventModelIds: [f.models.m1, f.models.draft, f.models.foreign, f.models.m1, f.models.m2] });
    expect(result).toEqual({ modelCount: 2, duplicate: false });
    const collections = await f.t.run(async (ctx) => ctx.db.query("fairShareCollections").collect());
    expect(collections).toHaveLength(1);
    expect(collections[0].eventModelIds).toEqual([f.models.m1, f.models.m2]);
    expect(collections[0].codeHash).toBe(CODE_HASH);
  });

  test("the same submissionId queues one email; the send keeps only the hashed send log", async () => {
    const f = await setup();
    const visitorHash = visitor();
    const first = await request(f, { visitorHash, submissionId: "test-garage-double-tap" });
    const second = await request(f, { visitorHash, submissionId: "test-garage-double-tap" });
    expect(first.duplicate).toBe(false);
    expect(second).toEqual({ modelCount: 2, duplicate: true });
    const [row] = await deliveries(f);
    expect(row.kind).toBe("garage_email");
    expect(row.recipient).toBe(fairGarageEmailHash(EMAIL, SECRET));
    expect(row.recipient).not.toContain("@");
    expect(row.garageEmail?.to).toBe(EMAIL);

    await runDue(f);
    expect(calls).toHaveLength(1);
    expect(calls[0].key).toBe("fair-garage/test-garage-double-tap");
    expect(calls[0].body.to).toEqual([EMAIL]);
    const [sent] = await deliveries(f);
    expect(sent.status).toBe("sent");
    expect(sent.garageEmail).toBeUndefined();
    expect(JSON.stringify(sent)).not.toContain(EMAIL);
    expect(sent.modelCount).toBe(2);
    expect(await f.admin.query(api.fairGarageEmail.countGarageEmails, { eventId: f.eventId })).toEqual({ count: 1, capped: false });
  });

  test("a final failure removes the address too", async () => {
    const f = await setup();
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ message: "rejected" }, { status: 422 })));
    await request(f);
    await runDue(f);
    const [row] = await deliveries(f);
    expect(row.status).toBe("failed");
    expect(row.garageEmail).toBeUndefined();
    expect(JSON.stringify(row)).not.toContain(EMAIL);
  });

  test("rate limits: 3 per visitor per hour, 3 per address per day", async () => {
    const f = await setup();
    const visitorHash = visitor();
    for (let index = 0; index < 3; index += 1) await request(f, { visitorHash, email: `posetilac${index}@example.invalid` });
    await expectCode(request(f, { visitorHash, email: "posetilac9@example.invalid" }), "RATE_LIMITED");
    vi.setSystemTime(DAY1 + 61 * 60_000);
    await request(f, { visitorHash, email: "posetilac9@example.invalid" });

    // Per address, whatever visitor asks.
    for (let index = 0; index < 3; index += 1) await request(f, { email: "isti@example.invalid" });
    await expectCode(request(f, { email: "isti@example.invalid" }), "RATE_LIMITED");
    vi.setSystemTime(DAY1 + 61 * 60_000 + 24 * 60 * 60_000 + 1);
    await request(f, { email: "isti@example.invalid" });
  });

  test("no address and no send log left after the 16 Nov purge", async () => {
    const f = await setup();
    await request(f);
    vi.setSystemTime(PURGE_AT + 1);
    let batch;
    do {
      batch = await f.t.mutation(internal.fairEmails.purgeLeadPiiBatch, { limit: 200, dryRun: false });
    } while (batch.hasMore);
    expect(await deliveries(f)).toHaveLength(0);
    await expectCode(request(f, { submissionId: "test-garage-after-purge" }), "EVENT_NOT_ACTIVE");
  });
});

