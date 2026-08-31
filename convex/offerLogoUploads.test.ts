/// <reference types="vite/client" />

import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const SESSION = "offer-session-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const OTHER_SESSION = "offer-session-bbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  return t;
}

async function reserve(t: ReturnType<typeof setup>, sessionToken = SESSION) {
  return await t.mutation(api.offerLogoUploads.reserve, {
    sessionToken,
    fileName: "logo.png",
  });
}

async function store(t: ReturnType<typeof setup>, type: string, body = "logo") {
  return await t.run(async (ctx) => {
    const storageId = await ctx.storage.store(new Blob([body], { type }));
    // convex-test intentionally omits contentType when it simulates storage/storeBlob.
    // Real direct uploads populate this system-table field, so mirror that metadata here.
    const dbWithSystemWrites = ctx.db as unknown as {
      patch(
        tableName: "_storage",
        id: typeof storageId,
        value: { contentType: string },
      ): Promise<void>;
    };
    await dbWithSystemWrites.patch("_storage", storageId, { contentType: type });
    return storageId;
  });
}

describe("javni logo upload", () => {
  test.each(["image/png", "image/svg+xml"])("prihvata %s do 5 MB", async (type) => {
    const t = setup();
    const reservation = await reserve(t);
    const storageId = await store(t, type, type === "image/svg+xml" ? "<svg/>" : "png");
    const result = await t.mutation(api.offerLogoUploads.commit, {
      uploadId: reservation.uploadId,
      sessionToken: SESSION,
      storageId,
    });
    expect(result.status).toBe("ready");
    const row = await t.run(async (ctx) => ctx.db.get("offerLogoUploads", reservation.uploadId));
    expect(row?.storageId).toBe(storageId);
    expect(row?.contentType).toBe(type);
  });

  test("odbija drugi format i briše blob", async () => {
    const t = setup();
    const reservation = await reserve(t);
    const storageId = await store(t, "image/jpeg");
    await expect(
      t.mutation(api.offerLogoUploads.commit, {
        uploadId: reservation.uploadId,
        sessionToken: SESSION,
        storageId,
      }),
    ).resolves.toEqual({ status: "rejected", reason: "type" });
    expect(await t.run(async (ctx) => ctx.storage.get(storageId))).toBeNull();
  });

  test("odbija fajl preko 5 MB", async () => {
    const t = setup();
    const reservation = await reserve(t);
    const storageId = await store(t, "image/png", "x".repeat(5 * 1024 * 1024 + 1));
    await expect(
      t.mutation(api.offerLogoUploads.commit, {
        uploadId: reservation.uploadId,
        sessionToken: SESSION,
        storageId,
      }),
    ).resolves.toEqual({ status: "rejected", reason: "size" });
  });

  test("pogrešan session token ne može da commit-uje", async () => {
    const t = setup();
    const reservation = await reserve(t);
    const storageId = await store(t, "image/png");
    await expect(
      t.mutation(api.offerLogoUploads.commit, {
        uploadId: reservation.uploadId,
        sessionToken: OTHER_SESSION,
        storageId,
      }),
    ).rejects.toThrow("Logo upload nije pronađen");
  });

  test("rate limit zaustavlja četvrtu trenutnu rezervaciju", async () => {
    const t = setup();
    await reserve(t);
    await reserve(t);
    await reserve(t);
    await expect(reserve(t)).rejects.toThrow("Previše pokušaja");
  });

  test("spreman logo se vezuje za lead", async () => {
    const t = setup();
    const reservation = await reserve(t);
    const storageId = await store(t, "image/png");
    await t.mutation(api.offerLogoUploads.commit, {
      uploadId: reservation.uploadId,
      sessionToken: SESSION,
      storageId,
    });
    await t.mutation(api.leads.create, {
      contactName: "Mina Marković",
      businessName: "Mera Cafe",
      businessType: "Kafić ili restoran",
      email: "mina@example.com",
      interest: "review",
      message: "Ponuda",
      offerSelection: "v=2&items=%5B%5D",
      logoUploadId: reservation.uploadId,
      logoSessionToken: SESSION,
      submissionId: "submission-aaaaaaaaaaaaaaaa",
      formStartedAt: Date.now() - 1_000,
      website: "",
    });
    const state = await t.run(async (ctx) => ({
      lead: await ctx.db
        .query("leads")
        .withIndex("by_submissionId", (q) => q.eq("submissionId", "submission-aaaaaaaaaaaaaaaa"))
        .unique(),
      upload: await ctx.db.get("offerLogoUploads", reservation.uploadId),
    }));
    expect(state.lead?.logoStorageId).toBe(storageId);
    expect(state.lead?.offerSelection).toContain("v=2");
    expect(state.upload?.status).toBe("attached");
    expect(state.upload?.leadId).toBe(state.lead?._id);
  });

  test("čišćenje briše napušten upload i njegov blob", async () => {
    const t = setup();
    const reservation = await reserve(t);
    const storageId = await store(t, "image/png");
    await t.mutation(api.offerLogoUploads.commit, {
      uploadId: reservation.uploadId,
      sessionToken: SESSION,
      storageId,
    });
    await t.run(async (ctx) => {
      await ctx.db.patch("offerLogoUploads", reservation.uploadId, { expiresAt: Date.now() - 1 });
    });
    await t.mutation(internal.offerLogoUploads.cleanupAbandoned, {
      uploadId: reservation.uploadId,
    });
    expect(
      await t.run(async (ctx) => ctx.db.get("offerLogoUploads", reservation.uploadId)),
    ).toBeNull();
    expect(await t.run(async (ctx) => ctx.storage.get(storageId))).toBeNull();
  });
});
