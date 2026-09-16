/// <reference types="vite/client" />

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import { syncAutomaticAction } from "./lib/adminActionEngine";
import {
  markDashboardProjectionState,
  syncDashboardProduct,
  syncDashboardSubscription,
} from "./lib/adminDashboardProjection";

const modules = import.meta.glob("./**/*.ts");
const NOW = Date.parse("2026-09-16T10:00:00Z");
const ADMIN_A = "dashboard-a@scanme.test";
const ADMIN_B = "dashboard-b@scanme.test";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  process.env.SCANME_ADMIN_EMAILS = `${ADMIN_A},${ADMIN_B}`;
});
afterEach(() => vi.useRealTimers());

function identity(userId: Id<"users">) {
  return { subject: userId, issuer: "https://admin-17.test" };
}

async function seed() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const adminA = await ctx.db.insert("users", { email: ADMIN_A, name: "Admin A" });
    const adminB = await ctx.db.insert("users", { email: ADMIN_B, name: "Admin B" });
    const outsider = await ctx.db.insert("users", { email: "outside@example.invalid" });
    const accountId = await ctx.db.insert("accounts", {
      name: "Dashboard nalog", plan: "premium", status: "active",
      billingModel: "subscriptions_v1", adminV1MigrationVersion: 1,
      createdAt: 1, updatedAt: 1,
    });
    return { adminA, adminB, outsider, accountId };
  });
  return {
    t,
    ...ids,
    adminAClient: t.withIdentity(identity(ids.adminA)),
    adminBClient: t.withIdentity(identity(ids.adminB)),
    outsiderClient: t.withIdentity(identity(ids.outsider)),
  };
}

async function insertAction(
  seeded: Awaited<ReturnType<typeof seed>>,
  input: {
    key: string;
    assigneeId?: Id<"users">;
    priorityClass?: Doc<"actionItems">["priorityClass"];
    priorityRank?: number;
    resolutionRule?: Doc<"actionItems">["resolutionRule"];
    severity?: Doc<"actionItems">["severity"];
  },
) {
  return seeded.t.run((ctx) => ctx.db.insert("actionItems", {
    causeId: `task:${input.key}:client_task`,
    sourceDomain: input.resolutionRule === "manual_problem_resolution" ? "manual_problem" : "task",
    sourceRecordId: input.key,
    causeKind: "client_task",
    sourceVersion: "v1",
    sourceFingerprint: `fingerprint:${input.key}`,
    accountId: seeded.accountId,
    severity: input.severity ?? "warning",
    severityRank: input.severity === "blocking" ? 0 : 1,
    state: "open",
    assigneeId: input.assigneeId,
    priorityClass: input.priorityClass ?? "due_today",
    priorityRank: input.priorityRank ?? 1,
    priorityAt: NOW,
    relevantAt: NOW,
    contextHref: "/admin/zadaci",
    description: `Stavka ${input.key}`,
    resolutionRule: input.resolutionRule ?? "source_fact_changed",
    createdAt: NOW,
    updatedAt: NOW,
  }));
}

async function backfillActions(seeded: Awaited<ReturnType<typeof seed>>, dryRun = false) {
  return seeded.adminAClient.mutation(internal.adminDashboardBackfill.runPage, {
    sourceKind: "action", cursor: null, limit: 50, dryRun, now: NOW,
  });
}

describe("ADMIN-17 dashboard contract", () => {
  test("auth, all/mine identity, exact counts, priority and idempotent dry-run backfill", async () => {
    const seeded = await seed();
    await insertAction(seeded, { key: "urgent-a", assigneeId: seeded.adminA, priorityClass: "blocking_or_overdue", priorityRank: 0, severity: "blocking" });
    await insertAction(seeded, { key: "today-b", assigneeId: seeded.adminB });
    await insertAction(seeded, { key: "calm-a", assigneeId: seeded.adminA, priorityClass: "other", priorityRank: 6, severity: "information" });

    await expect(seeded.outsiderClient.query(api.adminDashboard.reactions, { scope: "all", now: NOW, limit: 8 })).rejects.toThrow("administratorski");
    expect(await backfillActions(seeded, true)).toMatchObject({ dryRun: true, scanned: 3, projected: 0, isDone: true });
    expect(await seeded.adminAClient.query(api.adminDashboard.reactions, { scope: "all", now: NOW, limit: 8 })).toMatchObject({ projection: "unavailable", counts: null });

    await backfillActions(seeded);
    const all = await seeded.adminAClient.query(api.adminDashboard.reactions, { scope: "all", now: NOW, limit: 8 });
    const mineA = await seeded.adminAClient.query(api.adminDashboard.reactions, { scope: "mine", now: NOW, limit: 8 });
    const mineB = await seeded.adminBClient.query(api.adminDashboard.reactions, { scope: "mine", now: NOW, limit: 8 });
    expect(all.counts).toMatchObject({ total: 3, urgent: 1, today: 1, calm: 1 });
    expect(all.items.map((row) => row.action.source.recordId)).toEqual(["urgent-a", "today-b", "calm-a"]);
    expect(mineA.counts).toMatchObject({ total: 2, urgent: 1, calm: 1 });
    expect(mineA.items).toHaveLength(2);
    expect(mineB.counts?.total).toBe(1);

    await backfillActions(seeded);
    expect((await seeded.adminAClient.query(api.adminDashboard.reactions, { scope: "all", now: NOW, limit: 8 })).counts?.total).toBe(3);
  });

  test("snooze is audited and expires; only a manual problem accepts a resolution note", async () => {
    const seeded = await seed();
    const automaticId = await insertAction(seeded, { key: "automatic", assigneeId: seeded.adminA });
    const manualId = await insertAction(seeded, { key: "manual", assigneeId: seeded.adminA, resolutionRule: "manual_problem_resolution", priorityClass: "other", priorityRank: 6 });
    await backfillActions(seeded);

    await expect(seeded.adminAClient.mutation(api.adminActions.resolveManualFromDashboard, { actionItemId: automaticId, note: "Klik nije promena izvora" })).rejects.toThrow("source_fact_must_change");
    await expect(seeded.adminAClient.mutation(api.adminActions.resolveManualFromDashboard, { actionItemId: manualId, note: " " })).rejects.toThrow("resolution_note_required");

    const until = NOW + 60_000;
    await expect(seeded.adminAClient.mutation(api.adminActions.snoozeFromDashboard, { actionItemId: automaticId, reason: "Čeka se provera", until })).resolves.toMatchObject({ state: "snoozed", until });
    expect((await seeded.adminAClient.query(api.adminDashboard.reactions, { scope: "mine", now: NOW, limit: 8 })).counts?.total).toBe(1);
    const snoozeEvent = await seeded.t.run((ctx) => ctx.db.query("actionItemEvents").withIndex("by_actionItemId_and_createdAt", (q) => q.eq("actionItemId", automaticId)).order("desc").first());
    expect(snoozeEvent).toMatchObject({ event: "snoozed", reason: "Čeka se provera", until });

    vi.setSystemTime(until);
    await seeded.adminAClient.mutation(internal.adminActions.restoreSnoozed, { actionItemId: automaticId, expectedUntil: until });
    expect((await seeded.adminAClient.query(api.adminDashboard.reactions, { scope: "mine", now: until, limit: 8 })).counts?.total).toBe(2);

    await seeded.adminAClient.mutation(api.adminActions.resolveManualFromDashboard, { actionItemId: manualId, note: "Adresa je potvrđena sa klijentom" });
    expect((await seeded.adminAClient.query(api.adminDashboard.reactions, { scope: "mine", now: until, limit: 8 })).counts?.total).toBe(1);
    expect(await seeded.t.run((ctx) => ctx.db.get(manualId))).toMatchObject({ state: "resolved", resolutionNote: "Adresa je potvrđena sa klijentom" });
  });

  test("automatic source retries deduplicate and source closure alone resolves the item", async () => {
    const seeded = await seed();
    const input = {
      domain: "task" as const, sourceRecordId: "dedupe", causeKind: "client_task", sourceVersion: "v1",
      isOpen: true, accountId: seeded.accountId, severity: "warning" as const,
      assigneeId: seeded.adminA, relevantAt: NOW,
      priority: { blocking: false, overdue: false, dueToday: true, needsReply: false, graceOrWarning: false, waitingOn: "none" as const },
      contextHref: "/admin/zadaci",
    };
    const first = await seeded.t.run((ctx) => syncAutomaticAction(ctx, input, NOW));
    expect(await seeded.t.run((ctx) => syncAutomaticAction(ctx, input, NOW))).toBe(first);
    await markActionProjectionComplete(seeded);
    expect((await seeded.adminAClient.query(api.adminDashboard.reactions, { scope: "all", now: NOW, limit: 8 })).counts?.total).toBe(1);
    await seeded.t.run((ctx) => syncAutomaticAction(ctx, { ...input, sourceVersion: "v2", isOpen: false }, NOW + 1));
    expect((await seeded.adminAClient.query(api.adminDashboard.reactions, { scope: "all", now: NOW + 1, limit: 8 })).counts?.total).toBe(0);
  });

  test("global subscription and SMF/QR/NFC totals remain separate from personal scope", async () => {
    const seeded = await seed();
    await seeded.t.run(async (ctx) => {
      const activeId = await ctx.db.insert("subscriptions", {
        accountId: seeded.accountId, target: { kind: "account_premium" }, targetKey: "premium-a", period: "monthly",
        startsAt: 1, anchorAt: 1, renewal: { kind: "manual" }, cancelAtPeriodEnd: false,
        facts: { status: "active", warning: true, currentPeriodStart: 1, paidThrough: 2, graceEndsAt: 3, nextTransitionAt: null },
        key: "a", fingerprint: "a", createdAt: 1, updatedAt: 1,
      });
      const suspendedId = await ctx.db.insert("subscriptions", {
        accountId: seeded.accountId, target: { kind: "account_premium" }, targetKey: "premium-b", period: "annual",
        startsAt: 1, anchorAt: 1, renewal: { kind: "manual" }, cancelAtPeriodEnd: false,
        facts: { status: "suspended", warning: false, currentPeriodStart: null, paidThrough: null, graceEndsAt: null, nextTransitionAt: null },
        key: "b", fingerprint: "b", createdAt: 1, updatedAt: 1,
      });
      for (const id of [activeId, suspendedId]) {
        const row = (await ctx.db.get(id))!;
        await syncDashboardSubscription(ctx, row, row.facts, NOW);
      }
      await syncDashboardProduct(ctx, { _id: activeId as unknown as Id<"productInventory">, state: "active", qrCount: 1, nfcCount: 1, problemChannelCount: 0, updatedAt: NOW }, NOW);
      await syncDashboardProduct(ctx, { _id: suspendedId as unknown as Id<"productInventory">, state: "problem", qrCount: 2, nfcCount: 0, problemChannelCount: 1, updatedAt: NOW }, NOW);
      await markDashboardProjectionState(ctx, "subscription", "complete", NOW);
      await markDashboardProjectionState(ctx, "product", "complete", NOW);
    });
    expect((await seeded.adminBClient.query(api.adminDashboard.subscriptions, {})).counts).toMatchObject({ total: 2, active: 1, suspended: 1, warning: 1 });
    expect((await seeded.adminAClient.query(api.adminDashboard.products, {})).counts).toMatchObject({ total: 2, active: 1, problem: 1, qr: 3, nfc: 1, problemChannels: 1 });
  });

  test("Inbox adapter is bounded, provider-neutral and admin-only", async () => {
    const seeded = await seed();
    await seeded.t.run(async (ctx) => {
      const contactId = await ctx.db.insert("accountContacts", { accountId: seeded.accountId, firstName: "Ana", lastName: "Ilić", normalizedName: "ana ilic", positionTitle: "Vlasnica", isOwner: true, status: "active", createdAt: 1, updatedAt: 1 });
      for (let index = 0; index < 2; index += 1) await ctx.db.insert("conversations", {
        accountId: seeded.accountId, accountName: "Dashboard nalog", smkCode: "SMK-DASH", contactId, contactName: "Ana Ilić",
        channel: "panel_chat", status: "new", assigneeKey: "unassigned", latestMessagePreview: `Poruka ${index}`,
        latestMessageAt: NOW + index, latestMessageDirection: "client_to_admin", latestMessageAuthorName: "Ana Ilić",
        adminUnreadCount: 1, searchText: "dashboard ana", createdAt: 1, updatedAt: NOW + index,
      });
    });
    const result = await seeded.adminAClient.query(api.adminDashboard.inbox, { limit: 1 });
    expect(result).toMatchObject({ capped: true, provider: null });
    expect(result.items).toHaveLength(1);
    await expect(seeded.outsiderClient.query(api.adminDashboard.inbox, { limit: 1 })).rejects.toThrow("administratorski");
  });

  test("new Dashboard reads stay bounded and contain no unlimited collect", () => {
    const root = join(process.cwd(), "convex");
    for (const file of ["adminDashboard.ts", "adminDashboardBackfill.ts", join("lib", "adminDashboardProjection.ts")]) {
      const source = readFileSync(join(root, file), "utf8");
      expect(source).not.toContain(".collect(");
    }
    expect(readFileSync(join(root, "adminDashboardBackfill.ts"), "utf8")).toContain("args.limit > 50");
  });
});

async function markActionProjectionComplete(seeded: Awaited<ReturnType<typeof seed>>) {
  await seeded.t.run((ctx) => markDashboardProjectionState(ctx, "action", "complete", NOW));
}
