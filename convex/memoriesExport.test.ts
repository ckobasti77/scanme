/// <reference types="vite/client" />

// TASK-21 — the ZIP export orchestration, proven with convex-test at the
// TRANSACTION layer (the sharp+zip bytes are proven separately in
// lib/memories-export/*.test.ts and the bench). Everything the task's DoD #5
// asks for lives here: a photo tombstoned mid-job is absent from the archive,
// two concurrent exports do not both run, a failed job retries without a
// duplicate, and a non-host can neither trigger nor download.

import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { beforeEach, describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
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
  const sessionId = await t.run((ctx) =>
    ctx.db.insert("memoriesSessions", {
      spaceId: grant.spaceId,
      dateKey: "2026-08-27",
      status: "open",
      openedAt: Date.now(),
      photoCount: 0,
      guestCount: 0,
      updatedAt: Date.now(),
    }),
  );
  const guestId = await t.run((ctx) =>
    ctx.db.insert("memoriesGuests", {
      spaceId: grant.spaceId,
      guestKey: "guest-1",
      photoCount: 0,
      firstSeenAt: Date.now(),
      lastSeenAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );
  return { as, adminId, businessId, spaceId: grant.spaceId, sessionId, guestId };
}

async function insertReadyPhoto(
  t: ReturnType<typeof convexTest>,
  args: {
    businessId: Id<"businesses">;
    spaceId: Id<"memoriesSpaces">;
    sessionId: Id<"memoriesSessions">;
    guestId: Id<"memoriesGuests">;
    createdAt: number;
    visibility?: "everyone" | "host_only";
  },
): Promise<Id<"memoriesPhotos">> {
  return t.run(async (ctx) => {
    const assetId = await ctx.db.insert("mediaAssets", {
      businessId: args.businessId,
      kind: "image",
      provider: "convex",
      variants: {
        avif: { ref: "ref-avif", width: 2048, height: 1365, bytes: 100 },
        webp: { ref: "ref-webp", width: 2048, height: 1365, bytes: 120 },
        thumb: { ref: "ref-thumb", width: 512, height: 341, bytes: 20 },
      },
      status: "ready",
      createdAt: args.createdAt,
    });
    return ctx.db.insert("memoriesPhotos", {
      spaceId: args.spaceId,
      sessionId: args.sessionId,
      guestId: args.guestId,
      mediaAssetId: assetId,
      visibility: args.visibility ?? "everyone",
      status: "ready",
      createdAt: args.createdAt,
      updatedAt: args.createdAt,
    });
  });
}

describe("dedupe (STEP 1)", () => {
  test("two concurrent exports of a space do not both run", async () => {
    const t = newT();
    const s = await seedGranted(t);
    await insertReadyPhoto(t, { ...s, createdAt: 1 });

    await s.as.mutation(api.memoriesExport.startExport, { spaceId: s.spaceId });
    await expect(
      s.as.mutation(api.memoriesExport.startExport, { spaceId: s.spaceId }),
    ).rejects.toThrow();

    const jobs = await t.run((ctx) =>
      ctx.db
        .query("memoriesExports")
        .withIndex("by_spaceId_and_createdAt", (q) =>
          q.eq("spaceId", s.spaceId),
        )
        .collect(),
    );
    expect(jobs).toHaveLength(1);
    expect(jobs[0].status).toBe("queued");
  });
});

describe("deletions win (STEP 2)", () => {
  test("selectExportBatch returns only ready photos, never tombstones", async () => {
    const t = newT();
    const s = await seedGranted(t);
    const keep = await insertReadyPhoto(t, { ...s, createdAt: 1 });
    const gone = await insertReadyPhoto(t, { ...s, createdAt: 2 });
    await t.run((ctx) =>
      ctx.db.patch(gone, { status: "deleted", deletedReason: "guest" }),
    );

    const batch = await t.query(internal.memoriesExport.selectExportBatch, {
      spaceId: s.spaceId,
      cursor: null,
      numItems: 50,
    });
    expect(batch.photos.map((p) => p.photoId)).toEqual([keep]);
  });

  test("a photo tombstoned mid-job is absent from the finalized survivors", async () => {
    const t = newT();
    const s = await seedGranted(t);
    const a = await insertReadyPhoto(t, { ...s, createdAt: 1 });
    const b = await insertReadyPhoto(t, { ...s, createdAt: 2 });
    const c = await insertReadyPhoto(t, { ...s, createdAt: 3 });

    const { jobId } = await s.as.mutation(api.memoriesExport.startExport, {
      spaceId: s.spaceId,
    });
    await t.mutation(internal.memoriesExport.beginBuilding, { jobId });
    // Record all three as if a batch had encoded them.
    await t.mutation(internal.memoriesExport.recordExportBatch, {
      jobId,
      entries: [a, b, c].map((photoId, i) => ({
        photoId,
        seq: i,
        name: `Sto 1/2026-08-27_2149_sto-01_0${i + 1}.jpg`,
        tableLabel: "Sto 1",
        crc: 123 + i,
        size: 1000,
        offset: i * 1000,
        dosDate: 1,
        dosTime: 1,
        takenAt: i + 1,
        visibility: "everyone" as const,
        width: 2048,
        height: 1365,
      })),
      cursor: null,
      runningOffset: 3000,
      folderCounts: { "sto-01": 3 },
    });

    // The guest deletes photo B AFTER it was encoded but BEFORE finalize.
    await t.run((ctx) =>
      ctx.db.patch(b, { status: "deleted", deletedReason: "guest" }),
    );

    const data = await t.query(internal.memoriesExport.survivingEntries, {
      jobId,
    });
    expect(data).not.toBeNull();
    const names = data!.survivors.map((e) => e.name);
    expect(names).toHaveLength(2);
    expect(names.some((n) => n.includes("_02"))).toBe(false); // B is gone
  });
});

describe("retry (STEP 1)", () => {
  test("a failed job retries in place without creating a duplicate", async () => {
    const t = newT();
    const s = await seedGranted(t);
    await insertReadyPhoto(t, { ...s, createdAt: 1 });

    const { jobId } = await s.as.mutation(api.memoriesExport.startExport, {
      spaceId: s.spaceId,
    });
    await t.run((ctx) =>
      ctx.db.patch(jobId, { status: "failed", error: "build_failed" }),
    );

    const retried = await s.as.mutation(api.memoriesExport.retryExport, {
      jobId,
    });
    expect(retried.jobId).toBe(jobId);

    const jobs = await t.run((ctx) =>
      ctx.db
        .query("memoriesExports")
        .withIndex("by_spaceId_and_createdAt", (q) =>
          q.eq("spaceId", s.spaceId),
        )
        .collect(),
    );
    expect(jobs).toHaveLength(1);
    expect(jobs[0].status).toBe("queued");
    expect(jobs[0].error).toBeUndefined();
  });

  test("retry is refused on a job that has not failed", async () => {
    const t = newT();
    const s = await seedGranted(t);
    const { jobId } = await s.as.mutation(api.memoriesExport.startExport, {
      spaceId: s.spaceId,
    });
    await expect(
      s.as.mutation(api.memoriesExport.retryExport, { jobId }),
    ).rejects.toThrow();
  });
});

describe("gating (STEP 1 / standing constraint)", () => {
  test("a non-host can neither trigger nor download", async () => {
    const t = newT();
    const s = await seedGranted(t);
    await insertReadyPhoto(t, { ...s, createdAt: 1 });

    const outsiderId = await t.run((ctx) =>
      ctx.db.insert("users", {
        email: "outsider@example.com",
        emailVerificationTime: Date.now(),
      }),
    );
    const outsider = t.withIdentity({ subject: outsiderId, issuer: ISSUER });

    await expect(
      outsider.mutation(api.memoriesExport.startExport, { spaceId: s.spaceId }),
    ).rejects.toThrow();

    // Download surface: forbidden, not a leak.
    const view = await outsider.query(api.memoriesExport.exportsForSpace, {
      spaceId: s.spaceId,
    });
    expect(view.status).toBe("forbidden");

    // Anonymous (no identity) is refused too.
    const anon = await t.query(api.memoriesExport.exportsForSpace, {
      spaceId: s.spaceId,
    });
    expect(anon.status).toBe("forbidden");
  });

  test("the host sees the active job and, later, ready downloads", async () => {
    const t = newT();
    const s = await seedGranted(t);
    await insertReadyPhoto(t, { ...s, createdAt: 1 });

    const before = await s.as.query(api.memoriesExport.exportsForSpace, {
      spaceId: s.spaceId,
    });
    expect(before.status).toBe("ok");
    if (before.status !== "ok") throw new Error("unreachable");
    expect(before.hasReadyPhotos).toBe(true);
    expect(before.active).toBeNull();

    await s.as.mutation(api.memoriesExport.startExport, { spaceId: s.spaceId });
    const during = await s.as.query(api.memoriesExport.exportsForSpace, {
      spaceId: s.spaceId,
    });
    if (during.status !== "ok") throw new Error("unreachable");
    expect(during.active?.status).toBe("queued");
  });
});

describe("retention & guest-wipe interaction (STEP 4)", () => {
  test("invalidateSpaceExports expires a ready export and drops its link", async () => {
    const t = newT();
    const s = await seedGranted(t);
    const jobId = await t.run((ctx) =>
      ctx.db.insert("memoriesExports", {
        spaceId: s.spaceId,
        businessId: s.businessId,
        status: "ready",
        runningOffset: 0,
        chunkRefs: [],
        encodedCount: 3,
        photoCount: 3,
        expiresAt: Date.now() + 1_000_000,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );
    await t.mutation(internal.memoriesExport.invalidateSpaceExports, {
      spaceId: s.spaceId,
    });
    const job = await t.run((ctx) => ctx.db.get(jobId));
    expect(job?.status).toBe("expired");
    expect(job?.archiveStorageId).toBeUndefined();
  });

  test("purgeExpiredExports expires a ready export past its link lifetime", async () => {
    const t = newT();
    const s = await seedGranted(t);
    const past = Date.now() - 1000;
    const jobId = await t.run((ctx) =>
      ctx.db.insert("memoriesExports", {
        spaceId: s.spaceId,
        businessId: s.businessId,
        status: "ready",
        runningOffset: 0,
        chunkRefs: [],
        encodedCount: 1,
        photoCount: 1,
        expiresAt: past,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );
    await t.mutation(internal.memoriesExport.purgeExpiredExports, {
      now: Date.now(),
    });
    const job = await t.run((ctx) => ctx.db.get(jobId));
    expect(job?.status).toBe("expired");
  });
});
