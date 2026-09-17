/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import type { AutomaticActionAdapterInput } from "./lib/adminActionAdapters";
import { syncAutomaticAction } from "./lib/adminActionEngine";
import { reconcileSubscription } from "./lib/subscriptions";

const modules = import.meta.glob("./**/*.ts");
const NOW = Date.parse("2026-09-11T10:00:00Z");
const HOUR = 60 * 60 * 1_000;
const DAY = 24 * HOUR;
const ADMIN_A_EMAIL = "admin-a@scanme.test";
const ADMIN_B_EMAIL = "admin-b@scanme.test";
type Backend = ReturnType<typeof convexTest>;
const emptyServiceSummaries = {
  scanme_links: { total: 0, active: 0, warning: 0, grace: 0, suspended: 0, inactive: 0, problem: 0, worst: null },
  google_review: { total: 0, active: 0, warning: 0, grace: 0, suspended: 0, inactive: 0, problem: 0, worst: null },
  scanme_menu: { total: 0, active: 0, warning: 0, grace: 0, suspended: 0, inactive: 0, problem: 0, worst: null },
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  process.env.SCANME_ADMIN_EMAILS = `${ADMIN_A_EMAIL},${ADMIN_B_EMAIL}`;
});

afterEach(() => vi.useRealTimers());

function identity(userId: Id<"users">) {
  return { subject: userId, issuer: "https://admin-04.test" };
}

async function seedOperationalAccount(t: Backend) {
  const ids = await t.run(async (ctx) => {
    const adminA = await ctx.db.insert("users", { email: ADMIN_A_EMAIL });
    const adminB = await ctx.db.insert("users", { email: ADMIN_B_EMAIL });
    const outsider = await ctx.db.insert("users", { email: "outside@example.invalid" });
    const accountId = await ctx.db.insert("accounts", {
      name: "Željko Ilić Studio",
      plan: "premium",
      status: "active",
      billingModel: "subscriptions_v1",
      smkCode: "SMK-ZIS-001",
      ownerDisplayName: "Željko Ilić",
      normalizedOwnerDisplayName: "zeljko ilic",
      clientStatus: "active",
      adminV1MigrationVersion: 1,
      adminV1MigratedAt: NOW - HOUR,
      createdAt: NOW - HOUR,
      updatedAt: NOW - HOUR,
    });
    const contactId = await ctx.db.insert("accountContacts", {
      accountId,
      firstName: "Željko",
      lastName: "Ilić",
      normalizedName: "zeljko ilic",
      normalizedEmail: "client@example.invalid",
      normalizedPhone: "381641234567",
      positionTitle: "Vlasnik",
      isOwner: true,
      status: "active",
      createdAt: NOW - HOUR,
      updatedAt: NOW - HOUR,
    });
    await ctx.db.patch(accountId, { defaultContactId: contactId });
    const businessId = await ctx.db.insert("businesses", {
      accountId,
      name: "Kafe Žubor",
      normalizedName: "kafe zubor",
      slug: "kafe-zubor-admin-04",
      kind: "business",
      smlCode: "SML-ZIS-001",
      clientStatus: "active",
      city: "Beograd",
      normalizedCity: "beograd",
      adminV1MigrationVersion: 1,
      status: "active",
      createdAt: NOW - HOUR,
      updatedAt: NOW - HOUR,
    });
    const profiles: Id<"serviceProfiles">[] = [];
    for (let index = 0; index < 3; index += 1) {
      profiles.push(await ctx.db.insert("serviceProfiles", {
        businessId,
        type: "scanme_links",
        slug: `admin-04-links-${index}`,
        status: "active",
        totalScans: 0,
        totalPageViews: 0,
        totalConvertedSessions: 0,
        createdAt: NOW - HOUR,
        updatedAt: NOW - HOUR,
      }));
    }
    const otherAccountId = await ctx.db.insert("accounts", {
      name: "Drugi nalog",
      plan: "basic",
      status: "active",
      createdAt: NOW - HOUR,
      updatedAt: NOW - HOUR,
    });
    const otherBusinessId = await ctx.db.insert("businesses", {
      accountId: otherAccountId,
      name: "Drugi lokal",
      slug: "drugi-lokal-admin-04",
      kind: "business",
      status: "active",
      createdAt: NOW - HOUR,
    });
    return {
      adminA,
      adminB,
      outsider,
      accountId,
      businessId,
      profiles,
      otherAccountId,
      otherBusinessId,
    };
  });
  return {
    ...ids,
    adminAClient: t.withIdentity(identity(ids.adminA)),
    adminBClient: t.withIdentity(identity(ids.adminB)),
    outsiderClient: t.withIdentity(identity(ids.outsider)),
  };
}

function automaticInput(
  ids: Awaited<ReturnType<typeof seedOperationalAccount>>,
  key: string,
  overrides: Partial<AutomaticActionAdapterInput> = {},
): AutomaticActionAdapterInput {
  return {
    domain: "task",
    sourceRecordId: key,
    causeKind: "due",
    sourceVersion: "v1",
    isOpen: true,
    accountId: ids.accountId,
    businessId: ids.businessId,
    severity: "warning",
    assigneeId: ids.adminA,
    relevantAt: NOW,
    priority: {
      blocking: false,
      overdue: false,
      dueToday: true,
      needsReply: false,
      graceOrWarning: false,
      waitingOn: "none",
    },
    contextHref: "/admin/tasks/test",
    description: "Test action source",
    ...overrides,
  };
}

async function syncAutomatic(
  t: Backend,
  input: AutomaticActionAdapterInput,
  now = NOW,
) {
  return t.run((ctx) => syncAutomaticAction(ctx, input, now));
}

function page(numItems = 100, cursor: string | null = null) {
  return { numItems, cursor };
}

describe("ADMIN-04 canonical causes and resolution", () => {
  test("the same source cause is deduplicated across Dashboard, client and source reads", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedOperationalAccount(t);
    const input = automaticInput(ids, "task-1");
    const firstId = await syncAutomatic(t, input);
    const retryId = await syncAutomatic(t, input);
    expect(retryId).toBe(firstId);
    await ids.adminAClient.mutation(internal.adminReadModels.syncClient, {
      accountId: ids.accountId,
      venueCount: 1,
      firstVenueName: "Kafe Žubor",
      updatedAt: NOW,
    });
    const dashboard = await ids.adminAClient.query(internal.adminActions.list, {
      scope: "all",
      now: NOW,
      limit: 10,
    });
    const source = await ids.adminAClient.query(internal.adminActions.listForSource, {
      domain: "task",
      sourceRecordId: "task-1",
      now: NOW,
      limit: 10,
    });
    const clients = await ids.adminAClient.query(internal.adminReadModels.clients, {
      paginationOpts: page(),
      status: "all",
      sort: "urgency",
    });
    expect(dashboard).toHaveLength(1);
    expect(source).toHaveLength(1);
    expect(new Set([
      dashboard[0].causeId,
      source[0].causeId,
      clients.page[0].signal.causeId,
    ]).size).toBe(1);
    expect(await t.run((ctx) => ctx.db.query("actionItems").collect())).toHaveLength(1);
    expect(await t.run((ctx) => ctx.db.query("actionItemEvents").collect())).toHaveLength(1);
  });

  test("the worst open cause drives the client signal", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedOperationalAccount(t);
    await syncAutomatic(t, automaticInput(ids, "info", {
      causeKind: "information",
      severity: "information",
      priority: {
        blocking: false,
        overdue: false,
        dueToday: false,
        needsReply: false,
        graceOrWarning: false,
        waitingOn: "none",
      },
    }));
    const blockingId = await syncAutomatic(t, automaticInput(ids, "blocking", {
      causeKind: "blocked",
      severity: "blocking",
      priority: {
        blocking: true,
        overdue: false,
        dueToday: false,
        needsReply: false,
        graceOrWarning: false,
        waitingOn: "none",
      },
    }));
    const blocking = await t.run((ctx) => ctx.db.get(blockingId!));
    const signal = await ids.adminAClient.query(internal.adminActions.clientSignal, {
      accountId: ids.accountId,
    });
    expect(signal).toEqual({ severity: "blocking", causeId: blocking!.causeId });
  });

  test("opening Resolve is read-only; only a changed source fact resolves an automatic cause, idempotently", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedOperationalAccount(t);
    const input = automaticInput(ids, "auto-resolution");
    const actionItemId = (await syncAutomatic(t, input))!;
    await ids.adminAClient.query(internal.adminActions.resolutionContext, {
      actionItemId,
      now: NOW,
    });
    expect((await t.run((ctx) => ctx.db.get(actionItemId)))!.state).toBe("open");
    await expect(ids.adminAClient.mutation(internal.adminActions.resolveManual, {
      actionItemId,
      note: "Ne sme ručno",
    })).rejects.toThrow("action_source_fact_must_change");
    await syncAutomatic(t, { ...input, sourceVersion: "v2", isOpen: false }, NOW + 1);
    await syncAutomatic(t, { ...input, sourceVersion: "v2", isOpen: false }, NOW + 2);
    expect((await t.run((ctx) => ctx.db.get(actionItemId)))!.state).toBe("resolved");
    const events = await t.run((ctx) => ctx.db
      .query("actionItemEvents")
      .withIndex("by_actionItemId_and_createdAt", (q) => q.eq("actionItemId", actionItemId))
      .collect());
    expect(events.map((event) => event.event)).toEqual(["opened", "automatic_resolved"]);
    expect(await ids.adminAClient.query(internal.adminActions.list, {
      scope: "all",
      now: NOW + 2,
      limit: 10,
    })).toHaveLength(0);
  });

  test("subscription reconciliation is the source adapter for causes and service state", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedOperationalAccount(t);
    const subscriptionId = await t.run(async (ctx) => {
      const agreementId = await ctx.db.insert("priceAgreements", {
        accountId: ids.accountId,
        target: { kind: "service_instance", serviceProfileId: ids.profiles[0] },
        targetKey: `service:${ids.profiles[0]}`,
        period: "monthly",
        kind: "standard",
        reference: { amountMinor: 12_000, currency: "RSD" },
        price: { amountMinor: 12_000, currency: "RSD" },
        validFrom: NOW - 40 * DAY,
        validUntil: null,
        change: {
          actor: { kind: "admin", userId: ids.adminA },
          at: NOW - 40 * DAY,
          reason: "Test agreement",
        },
        key: "admin-04-agreement",
        fingerprint: "admin-04-agreement",
      });
      const price = {
        reference: { amountMinor: 12_000, currency: "RSD" },
        effective: { amountMinor: 12_000, currency: "RSD" },
        agreementId,
        basis: "standard" as const,
        capturedAt: NOW - 30 * DAY,
      };
      const id = await ctx.db.insert("subscriptions", {
        accountId: ids.accountId,
        businessId: ids.businessId,
        target: { kind: "service_instance", serviceProfileId: ids.profiles[0] },
        targetKey: `service:${ids.profiles[0]}`,
        period: "monthly",
        startsAt: NOW - 30 * DAY,
        anchorAt: NOW - 30 * DAY,
        renewal: { kind: "manual" },
        cancelAtPeriodEnd: false,
        facts: {
          status: "inactive",
          warning: false,
          currentPeriodStart: null,
          paidThrough: null,
          graceEndsAt: null,
          nextTransitionAt: null,
        },
        key: "admin-04-subscription",
        fingerprint: "admin-04-subscription",
        createdAt: NOW - 30 * DAY,
        updatedAt: NOW - 30 * DAY,
      });
      await ctx.db.insert("subscriptionPeriods", {
        accountId: ids.accountId,
        subscriptionId: id,
        start: NOW - 30 * DAY,
        end: NOW - HOUR,
        price,
        paidMinor: 12_000,
        funded: true,
        createdAt: NOW - 30 * DAY,
      });
      return id;
    });
    await t.run((ctx) => reconcileSubscription(
      ctx,
      subscriptionId,
      NOW,
      { kind: "system", source: "admin-04-test" },
    ));
    expect(await ids.adminAClient.query(internal.adminActions.list, {
      scope: "all", now: NOW, limit: 10,
    })).toMatchObject([{ source: { domain: "subscription", causeKind: "grace" } }]);
    expect(await t.run((ctx) => ctx.db
      .query("adminServiceAggregates")
      .withIndex("by_accountId_and_serviceType", (q) =>
        q.eq("accountId", ids.accountId).eq("serviceType", "scanme_links"),
      )
      .unique())).toMatchObject({ summary: { total: 1, grace: 1, worst: "grace" } });

    const suspendedAt = NOW + 8 * DAY;
    await t.run((ctx) => reconcileSubscription(
      ctx,
      subscriptionId,
      suspendedAt,
      { kind: "system", source: "admin-04-test" },
    ));
    await t.run((ctx) => reconcileSubscription(
      ctx,
      subscriptionId,
      suspendedAt,
      { kind: "system", source: "admin-04-test" },
    ));
    expect(await ids.adminAClient.query(internal.adminActions.list, {
      scope: "all", now: suspendedAt, limit: 10,
    })).toMatchObject([{ source: { domain: "subscription", causeKind: "suspended" } }]);
    const causes = await t.run((ctx) => ctx.db
      .query("actionItems")
      .withIndex("by_source_record_state_priority", (q) =>
        q.eq("sourceDomain", "subscription").eq("sourceRecordId", subscriptionId),
      )
      .collect());
    expect(causes.map((cause) => [cause.causeKind, cause.state]).sort()).toEqual([
      ["grace", "resolved"],
      ["suspended", "open"],
    ]);
  });

  test("manual resolution requires a note and preserves resolution audit", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedOperationalAccount(t);
    const actionItemId = await ids.adminAClient.mutation(internal.adminActions.reportManualProblem, {
      accountId: ids.accountId,
      businessId: ids.businessId,
      causeKey: "manual-1",
      causeKind: "quality_problem",
      description: "Test manual problem",
      severity: "warning",
      assigneeId: ids.adminA,
      relevantAt: NOW,
      priority: {
        blocking: false,
        overdue: false,
        dueToday: false,
        needsReply: false,
        graceOrWarning: false,
        waitingOn: "scanme",
      },
    });
    await expect(ids.adminAClient.mutation(internal.adminActions.resolveManual, {
      actionItemId,
      note: "   ",
    })).rejects.toThrow("action_resolution_note_required");
    await ids.adminAClient.mutation(internal.adminActions.resolveManual, {
      actionItemId,
      note: "Proveren i otklonjen problem",
    });
    const item = await t.run((ctx) => ctx.db.get(actionItemId));
    expect(item).toMatchObject({
      state: "resolved",
      resolvedByKind: "admin",
      resolvedByUserId: ids.adminA,
      resolutionNote: "Proveren i otklonjen problem",
    });
  });

  test("snooze requires a reason, records history and reopens at expiry", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedOperationalAccount(t);
    const actionItemId = (await syncAutomatic(t, automaticInput(ids, "snooze")))!;
    await expect(ids.adminAClient.mutation(internal.adminActions.snooze, {
      actionItemId,
      reason: "",
      until: NOW + HOUR,
    })).rejects.toThrow("action_snooze_reason_required");
    await ids.adminAClient.mutation(internal.adminActions.snooze, {
      actionItemId,
      reason: "Čekamo dogovoreni termin",
      until: NOW + HOUR,
    });
    expect(await ids.adminAClient.query(internal.adminActions.list, {
      scope: "all",
      now: NOW,
      limit: 10,
    })).toHaveLength(0);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const restored = await ids.adminAClient.query(internal.adminActions.list, {
      scope: "all",
      now: NOW + HOUR,
      limit: 10,
    });
    expect(restored).toHaveLength(1);
    expect(restored[0].state).toBe("open");
    const history = await ids.adminAClient.query(internal.adminActions.history, {
      actionItemId,
      paginationOpts: page(),
    });
    expect(history.page.map((event) => event.event)).toEqual([
      "snooze_expired",
      "snoozed",
      "opened",
    ]);
    expect(history.page.find((event) => event.event === "snoozed")).toMatchObject({
      reason: "Čekamo dogovoreni termin",
      until: NOW + HOUR,
    });
  });
});

describe("ADMIN-04 ownership and exact priority", () => {
  test("Sve and Moje are enforced by the server-side assignee index", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedOperationalAccount(t);
    await syncAutomatic(t, automaticInput(ids, "mine-a", { assigneeId: ids.adminA }));
    await syncAutomatic(t, automaticInput(ids, "mine-b", { assigneeId: ids.adminB }));
    await syncAutomatic(t, automaticInput(ids, "unassigned", { assigneeId: undefined }));
    const all = await ids.adminAClient.query(internal.adminActions.list, {
      scope: "all",
      now: NOW,
      limit: 10,
    });
    const mineA = await ids.adminAClient.query(internal.adminActions.list, {
      scope: "mine",
      now: NOW,
      limit: 10,
    });
    const mineB = await ids.adminBClient.query(internal.adminActions.list, {
      scope: "mine",
      now: NOW,
      limit: 10,
    });
    expect(all).toHaveLength(3);
    expect(mineA.map((item) => item.source.recordId)).toEqual(["mine-a"]);
    expect(mineB.map((item) => item.source.recordId)).toEqual(["mine-b"]);
  });

  test("the complete §10.2 order is materialized and deterministic", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedOperationalAccount(t);
    const add = async (
      key: string,
      relevantAt: number,
      priority: AutomaticActionAdapterInput["priority"],
      dueAt?: number,
    ) => syncAutomatic(t, automaticInput(ids, key, {
      causeKind: key,
      relevantAt,
      ...(dueAt === undefined ? {} : { dueAt, duePrecision: "instant" as const }),
      priority,
    }));
    await add("blocking", NOW, { blocking: true, overdue: false, dueToday: false, needsReply: false, graceOrWarning: false, waitingOn: "none" }, NOW - 2 * HOUR);
    await add("overdue", NOW, { blocking: false, overdue: true, dueToday: false, needsReply: false, graceOrWarning: false, waitingOn: "none" }, NOW - HOUR);
    await add("today-early", NOW, { blocking: false, overdue: false, dueToday: true, needsReply: false, graceOrWarning: false, waitingOn: "none" }, NOW + HOUR);
    await add("today-late", NOW, { blocking: false, overdue: false, dueToday: true, needsReply: false, graceOrWarning: false, waitingOn: "none" }, NOW + 2 * HOUR);
    await add("needs-reply", NOW + HOUR, { blocking: false, overdue: false, dueToday: false, needsReply: true, graceOrWarning: false, waitingOn: "none" });
    await add("grace", NOW, { blocking: false, overdue: false, dueToday: false, needsReply: false, graceOrWarning: true, waitingOn: "none" }, NOW + 3 * HOUR);
    await add("waiting-scanme", NOW, { blocking: false, overdue: false, dueToday: false, needsReply: false, graceOrWarning: false, waitingOn: "scanme" });
    await add("waiting-client", NOW, { blocking: false, overdue: false, dueToday: false, needsReply: false, graceOrWarning: false, waitingOn: "client" });
    await add("other-old", NOW - HOUR, { blocking: false, overdue: false, dueToday: false, needsReply: false, graceOrWarning: false, waitingOn: "none" });
    await add("other-new", NOW + HOUR, { blocking: false, overdue: false, dueToday: false, needsReply: false, graceOrWarning: false, waitingOn: "none" });
    const rows = await ids.adminAClient.query(internal.adminActions.list, {
      scope: "all",
      now: NOW,
      limit: 20,
    });
    expect(rows.map((row) => row.source.causeKind)).toEqual([
      "blocking",
      "overdue",
      "today-early",
      "today-late",
      "needs-reply",
      "grace",
      "waiting-scanme",
      "waiting-client",
      "other-new",
      "other-old",
    ]);
  });
});

describe("ADMIN-04 service aggregates and searchable directories", () => {
  test("a service icon aggregates counts and exposes the worst relevant state", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedOperationalAccount(t);
    for (const [index, state] of ["active", "warning", "problem"].entries()) {
      await ids.adminAClient.mutation(internal.adminReadModels.syncServiceState, {
        accountId: ids.accountId,
        businessId: ids.businessId,
        serviceProfileId: ids.profiles[index],
        serviceType: "scanme_links",
        state: state as "active" | "warning" | "problem",
        updatedAt: NOW + index,
      });
    }
    await ids.adminAClient.mutation(internal.adminReadModels.syncClient, {
      accountId: ids.accountId,
      venueCount: 1,
      firstVenueName: "Kafe Žubor",
      updatedAt: NOW,
    });
    let clients = await ids.adminAClient.query(internal.adminReadModels.clients, {
      paginationOpts: page(),
      status: "all",
      sort: "name",
    });
    expect(clients.page[0].serviceSummaries.scanme_links).toMatchObject({
      total: 3,
      active: 1,
      warning: 1,
      problem: 1,
      worst: "problem",
    });
    await ids.adminAClient.mutation(internal.adminReadModels.syncServiceState, {
      accountId: ids.accountId,
      businessId: ids.businessId,
      serviceProfileId: ids.profiles[2],
      serviceType: "scanme_links",
      state: "active",
      updatedAt: NOW + 4,
    });
    clients = await ids.adminAClient.query(internal.adminReadModels.clients, {
      paginationOpts: page(),
      status: "all",
      sort: "name",
    });
    expect(clients.page[0].serviceSummaries.scanme_links).toMatchObject({
      total: 3,
      active: 2,
      warning: 1,
      problem: 0,
      worst: "warning",
    });
  });

  test("owner, venue, email, phone and SMK/SML/SMF/SMQ searches are normalized", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedOperationalAccount(t);
    await ids.adminAClient.mutation(internal.adminReadModels.syncClient, {
      accountId: ids.accountId,
      venueCount: 1,
      firstVenueName: "Kafe Žubor",
      updatedAt: NOW,
    });
    await ids.adminAClient.mutation(internal.adminReadModels.syncVenue, {
      businessId: ids.businessId,
      productCount: 1,
      channelCount: 2,
      updatedAt: NOW,
    });
    await ids.adminAClient.mutation(internal.adminReadModels.syncProduct, {
      accountId: ids.accountId,
      businessId: ids.businessId,
      sourceRecordId: "physical-product-1",
      smfCode: "SMF-ZIS-001",
      smqCodes: ["SMQ-ZIS-001-01", "SMQ-ZIS-001-02"],
      productType: "two-piece-stand",
      displayName: "Dvodelni stalak Žubor",
      operationalStatus: "active",
      updatedAt: NOW,
    });
    const clientSearches = [
      "zeljko ilic",
      "CLIENT@EXAMPLE.INVALID",
      "+381 (64) 123-45-67",
      "smk zis 001",
    ];
    for (const search of clientSearches) {
      const result = await ids.adminAClient.query(internal.adminReadModels.clients, {
        paginationOpts: page(), search, status: "all", sort: "name",
      });
      expect(result.page.map((row) => row.accountId)).toContain(ids.accountId);
    }
    for (const search of ["KAFE ZUBOR", "sml-zis-001"]) {
      const result = await ids.adminAClient.query(internal.adminReadModels.venues, {
        paginationOpts: page(), search, status: "all", sort: "name",
      });
      expect(result.page.map((row) => row.businessId)).toContain(ids.businessId);
    }
    for (const search of ["dvodelni stalak zubor", "SMF ZIS 001", "smq-zis-001-02"]) {
      const result = await ids.adminAClient.query(internal.adminReadModels.products, {
        paginationOpts: page(), search, status: "all", sort: "name",
      });
      expect(result.page.map((row) => row.sourceRecordId)).toContain("physical-product-1");
    }
  });

  test("the test-only 500 venue / 10,000 product fixture keeps cursor reads stable", async () => {
    // A list transaction gets four database queries / 250 documents. A
    // per-row join would exhaust this budget on the first 137/200-row page.
    const t = convexTest({
      schema,
      modules,
      transactionLimits: { databaseQueries: 4, documentsRead: 250 },
    });
    const ids = await seedOperationalAccount(t);
    const scaleAccounts = await t.run(async (ctx) => {
      const created: { accountId: Id<"accounts">; smkCode: string; ownerDisplayName: string }[] = [];
      for (let index = 0; index < 50; index += 1) {
        const suffix = String(index).padStart(3, "0");
        const smkCode = `SMK-SCALE-${suffix}`;
        const ownerDisplayName = `Scale vlasnik ${suffix}`;
        const accountId = await ctx.db.insert("accounts", {
          name: `Scale nalog ${suffix}`,
          plan: index % 2 === 0 ? "premium" : "basic",
          status: "active",
          smkCode,
          ownerDisplayName,
          normalizedOwnerDisplayName: `scale vlasnik ${suffix}`,
          clientStatus: "active",
          adminV1MigrationVersion: 1,
          createdAt: NOW,
          updatedAt: NOW,
        });
        await ctx.db.insert("adminClientReadModels", {
          accountId,
          smkCode,
          accountName: `Scale nalog ${suffix}`,
          ownerDisplayName,
          normalizedOwnerDisplayName: `scale vlasnik ${suffix}`,
          defaultContactEmail: null,
          defaultContactPhone: null,
          firstVenueName: `Scale lokal ${suffix}0`,
          venueCount: 10,
          clientStatus: "active",
          signal: { severity: null, causeId: null },
          urgencyRank: 3,
          serviceSummaries: emptyServiceSummaries,
          premiumStatus: index % 2 === 0 ? "active" : null,
          searchText: `scale nalog ${suffix} scale vlasnik ${suffix} ${smkCode.toLowerCase().replaceAll("-", "")}`,
          updatedAt: NOW + index,
        });
        created.push({ accountId, smkCode, ownerDisplayName });
      }
      return created;
    });
    const businesses: { businessId: Id<"businesses">; accountId: Id<"accounts">; smkCode: string; ownerDisplayName: string }[] = [];
    for (let batch = 0; batch < 10; batch += 1) {
      businesses.push(...await t.run(async (ctx) => {
        const created: typeof businesses = [];
        for (let offset = 0; offset < 50; offset += 1) {
          const index = batch * 50 + offset;
          const suffix = String(index).padStart(4, "0");
          const account = scaleAccounts[index % scaleAccounts.length];
          const businessId = await ctx.db.insert("businesses", {
            accountId: account.accountId,
            name: `Scale lokal ${suffix}`,
            normalizedName: `scale lokal ${suffix}`,
            slug: `admin-04-scale-${suffix}`,
            kind: "business",
            smlCode: `SML-SCALE-${suffix}`,
            clientStatus: "active",
            adminV1MigrationVersion: 1,
            status: "active",
            createdAt: NOW,
            updatedAt: NOW,
          });
          created.push({ businessId, ...account });
          await ctx.db.insert("adminVenueReadModels", {
            accountId: account.accountId,
            businessId,
            smkCode: account.smkCode,
            smlCode: `SML-SCALE-${suffix}`,
            ownerDisplayName: account.ownerDisplayName,
            venueName: `Scale lokal ${suffix}`,
            normalizedVenueName: `scale lokal ${suffix}`,
            city: "Beograd",
            effectiveContactEmail: "client@example.invalid",
            effectiveContactPhone: "381641234567",
            productCount: 20,
            channelCount: 20,
            serviceTypes: [],
            clientStatus: "active",
            signal: { severity: null, causeId: null },
            urgencyRank: 3,
            searchText: `scale lokal ${suffix} smlscale${suffix}`,
            updatedAt: NOW + index,
          });
        }
        return created;
      }));
    }
    for (let batch = 0; batch < 20; batch += 1) {
      await t.run(async (ctx) => {
        for (let offset = 0; offset < 500; offset += 1) {
          const index = batch * 500 + offset;
          const suffix = String(index).padStart(5, "0");
          const venueIndex = index % businesses.length;
          const venue = businesses[venueIndex];
          await ctx.db.insert("adminProductReadModels", {
            accountId: venue.accountId,
            businessId: venue.businessId,
            sourceRecordId: `scale-product-${suffix}`,
            smkCode: venue.smkCode,
            smlCode: `SML-SCALE-${String(venueIndex).padStart(4, "0")}`,
            smfCode: `SMF-SCALE-${suffix}`,
            smqCodes: [`SMQ-SCALE-${suffix}`],
            ownerDisplayName: venue.ownerDisplayName,
            venueName: `Scale lokal ${String(venueIndex).padStart(4, "0")}`,
            productType: "two-piece-stand",
            displayName: `Scale proizvod ${suffix}`,
            normalizedDisplayName: `scale proizvod ${suffix}`,
            operationalStatus: index % 10 === 0 ? "problem" : "active",
            signal: { severity: null, causeId: null },
            urgencyRank: 3,
            searchText: `scale proizvod ${suffix} smfscale${suffix} smqscale${suffix}`,
            updatedAt: NOW + index,
          });
        }
      });
    }
    let clientCount = 0;
    let clientCursor: string | null = null;
    let clientsDone = false;
    while (!clientsDone) {
      const result = await ids.adminAClient.query(api.adminReadModels.listClients, {
        paginationOpts: page(17, clientCursor), status: "active", sort: "name",
      });
      clientCount += result.page.length;
      clientCursor = result.continueCursor;
      clientsDone = result.isDone;
    }
    expect(clientCount).toBe(50);
    let venueCount = 0;
    let venueCursor: string | null = null;
    let venuesDone = false;
    while (!venuesDone) {
      const result = await ids.adminAClient.query(internal.adminReadModels.venues, {
        paginationOpts: page(200, venueCursor), status: "all", sort: "name",
      });
      venueCount += result.page.length;
      venueCursor = result.continueCursor;
      venuesDone = result.isDone;
    }
    expect(venueCount).toBe(500);

    let productCount = 0;
    let productCursor: string | null = null;
    let productsDone = false;
    while (!productsDone) {
      const result = await ids.adminAClient.query(internal.adminReadModels.products, {
        paginationOpts: page(200, productCursor), status: "all", sort: "name",
      });
      productCount += result.page.length;
      productCursor = result.continueCursor;
      productsDone = result.isDone;
    }
    expect(productCount).toBe(10_000);
    const first = await ids.adminAClient.query(internal.adminReadModels.products, {
      paginationOpts: page(137), status: "all", sort: "name",
    });
    const repeated = await ids.adminAClient.query(internal.adminReadModels.products, {
      paginationOpts: page(137), status: "all", sort: "name",
    });
    const second = await ids.adminAClient.query(internal.adminReadModels.products, {
      paginationOpts: page(137, first.continueCursor), status: "all", sort: "name",
    });
    expect(repeated.page.map((row) => row.sourceRecordId)).toEqual(
      first.page.map((row) => row.sourceRecordId),
    );
    expect(repeated.continueCursor).toBe(first.continueCursor);
    expect(new Set([
      ...first.page.map((row) => row.sourceRecordId),
      ...second.page.map((row) => row.sourceRecordId),
    ]).size).toBe(first.page.length + second.page.length);
    const filtered = await ids.adminAClient.query(internal.adminReadModels.products, {
      paginationOpts: page(100), status: "problem", sort: "name",
    });
    expect(filtered.page).toHaveLength(100);
    expect(filtered.page.every((row) => row.operationalStatus === "problem")).toBe(true);
    const tail = await ids.adminAClient.query(internal.adminReadModels.products, {
      paginationOpts: page(10), search: "SMQ-SCALE-09999", status: "all", sort: "name",
    });
    expect(tail.page.map((row) => row.sourceRecordId)).toEqual(["scale-product-09999"]);
  }, 60_000);
});

describe("ADMIN-06 clients public directory", () => {
  test("public list is admin-only and keeps search, sort and cursor pagination server-side", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedOperationalAccount(t);
    await ids.adminAClient.mutation(internal.adminReadModels.syncClient, {
      accountId: ids.accountId,
      venueCount: 1,
      firstVenueName: "Kafe Žubor",
      updatedAt: NOW,
    });
    const secondAccountId = await t.run(async (ctx) => {
      const accountId = await ctx.db.insert("accounts", {
        name: "Željko Ilić Drugi",
        plan: "basic",
        status: "active",
        smkCode: "SMK-ZIS-002",
        ownerDisplayName: "Željko Ilić",
        normalizedOwnerDisplayName: "zeljko ilic",
        clientStatus: "active",
        adminV1MigrationVersion: 1,
        createdAt: NOW,
        updatedAt: NOW + 1,
      });
      const contactId = await ctx.db.insert("accountContacts", {
        accountId,
        firstName: "Željko",
        lastName: "Ilić",
        normalizedName: "zeljko ilic",
        normalizedEmail: "drugi@example.invalid",
        normalizedPhone: "38160111222",
        positionTitle: "Vlasnik",
        isOwner: true,
        status: "active",
        createdAt: NOW,
        updatedAt: NOW,
      });
      await ctx.db.patch(accountId, { defaultContactId: contactId });
      const businessId = await ctx.db.insert("businesses", {
        accountId,
        name: "Drugi Žubor",
        normalizedName: "drugi zubor",
        slug: "drugi-zubor-admin-06",
        kind: "business",
        smlCode: "SML-ZIS-002",
        clientStatus: "active",
        adminV1MigrationVersion: 1,
        status: "active",
        createdAt: NOW,
        updatedAt: NOW,
      });
      await ctx.db.insert("businesses", {
        accountId,
        name: "Skriveni lokal",
        normalizedName: "skriveni lokal",
        slug: "skriveni-lokal-admin-06",
        kind: "business",
        smlCode: "SML-ZIS-003",
        clientStatus: "active",
        adminV1MigrationVersion: 1,
        status: "active",
        createdAt: NOW,
        updatedAt: NOW,
      });
      return { accountId, businessId };
    });
    await ids.adminAClient.mutation(internal.adminReadModels.syncClient, {
      accountId: secondAccountId.accountId,
      venueCount: 2,
      firstVenueName: "Drugi Žubor",
      updatedAt: NOW + 1,
    });

    const args = { paginationOpts: page(1), status: "all" as const, sort: "name" as const };
    await expect(t.query(api.adminReadModels.listClients, args)).rejects.toThrow("Niste prijavljeni");
    await expect(ids.outsiderClient.query(api.adminReadModels.listClients, args)).rejects.toThrow("Nemate administratorski pristup");
    const first = await ids.adminAClient.query(api.adminReadModels.listClients, args);
    const second = await ids.adminAClient.query(api.adminReadModels.listClients, {
      ...args,
      paginationOpts: page(1, first.continueCursor),
    });
    expect(first.page).toHaveLength(1);
    expect(second.page).toHaveLength(1);
    expect(first.page[0].accountId).not.toBe(second.page[0].accountId);
    const search = await ids.adminAClient.query(api.adminReadModels.listClients, {
      paginationOpts: page(),
      search: "drugi zubor",
      status: "active",
      sort: "recent",
    });
    expect(search.page.map((row) => row.accountId)).toContain(secondAccountId.accountId);
    expect(search.page.find((row) => row.accountId === secondAccountId.accountId)).toMatchObject({
      ownerDisplayName: "Željko Ilić",
      smkCode: "SMK-ZIS-002",
      firstVenueName: "Drugi Žubor",
      firstVenueSlug: "drugi-zubor-admin-06",
    });
    const additionalVenueSearch = await ids.adminAClient.query(
      api.adminReadModels.listClients,
      {
        paginationOpts: page(),
        search: "skriveni lokal",
        status: "all",
        sort: "urgency",
      },
    );
    expect(additionalVenueSearch.page.map((row) => row.accountId)).toContain(
      secondAccountId.accountId,
    );
  });

  test("default contact, Premium and on-demand venue service facts stay materialized", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedOperationalAccount(t);
    const fixture = await t.run(async (ctx) => {
      const secondContactId = await ctx.db.insert("accountContacts", {
        accountId: ids.accountId,
        firstName: "Mila",
        lastName: "Ilić",
        normalizedName: "mila ilic",
        normalizedEmail: "mila@example.invalid",
        normalizedPhone: "381651111111",
        positionTitle: "Menadžer",
        isOwner: false,
        status: "active",
        createdAt: NOW,
        updatedAt: NOW,
      });
      const ownerMembershipId = await ctx.db.insert("accountMemberships", {
        accountId: ids.accountId,
        userId: ids.adminA,
        contactId: secondContactId,
        role: "full_access",
        active: true,
        venueAccess: "all",
        canBuyServices: true,
        canBuyPremium: true,
        createdAt: NOW,
        updatedAt: NOW,
      });
      await ctx.db.patch(ids.accountId, { primaryOwnerMembershipId: ownerMembershipId });
      const premiumId = await ctx.db.insert("subscriptions", {
        accountId: ids.accountId,
        target: { kind: "account_premium" },
        targetKey: "premium",
        period: "monthly",
        startsAt: NOW - DAY,
        anchorAt: NOW - DAY,
        renewal: { kind: "manual" },
        cancelAtPeriodEnd: false,
        facts: { status: "grace", warning: false, currentPeriodStart: NOW - DAY, paidThrough: NOW - HOUR, graceEndsAt: NOW + DAY, nextTransitionAt: NOW + DAY },
        key: "admin-06-premium",
        fingerprint: "admin-06-premium",
        createdAt: NOW - DAY,
        updatedAt: NOW,
      });
      return { secondContactId, premiumId };
    });
    await ids.adminAClient.mutation(internal.adminReadModels.syncVenue, {
      businessId: ids.businessId,
      productCount: 0,
      channelCount: 0,
      updatedAt: NOW,
    });
    for (const [index, state] of ["active", "active", "grace"].entries()) {
      await ids.adminAClient.mutation(internal.adminReadModels.syncServiceState, {
        accountId: ids.accountId,
        businessId: ids.businessId,
        serviceProfileId: ids.profiles[index],
        serviceType: "scanme_links",
        state: state as "active" | "grace",
        updatedAt: NOW + index,
      });
    }
    await ids.adminAClient.mutation(internal.adminReadModels.syncClient, {
      accountId: ids.accountId,
      venueCount: 1,
      firstVenueName: "Kafe Žubor",
      updatedAt: NOW,
    });
    let clients = await ids.adminAClient.query(api.adminReadModels.listClients, {
      paginationOpts: page(), status: "all", sort: "name",
    });
    expect(clients.page[0]).toMatchObject({
      premiumStatus: "grace",
      defaultContactEmail: "client@example.invalid",
      serviceSummaries: { scanme_links: { active: 2, grace: 1, worst: "grace" } },
    });
    await ids.adminAClient.mutation(api.clientAccounts.setDefaultContact, {
      accountId: ids.accountId,
      contactId: fixture.secondContactId,
    });
    clients = await ids.adminAClient.query(api.adminReadModels.listClients, {
      paginationOpts: page(), status: "all", sort: "name",
    });
    expect(clients.page[0]).toMatchObject({
      defaultContactEmail: "mila@example.invalid",
      defaultContactPhone: "381651111111",
    });
    const details = await ids.adminAClient.query(api.adminReadModels.clientVenueServices, {
      accountId: ids.accountId,
      paginationOpts: page(),
    });
    expect(details.page[0]).toMatchObject({
      venueName: "Kafe Žubor",
      services: { scanme_links: "grace" },
    });
    await expect(t.query(api.adminReadModels.clientVenueServices, {
      accountId: ids.accountId,
      paginationOpts: page(),
    })).rejects.toThrow("Niste prijavljeni");
  });
});

describe("ADMIN-04 authorization", () => {
  test("unauthenticated/non-admin calls and cross-account product scopes are rejected", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedOperationalAccount(t);
    const args = { paginationOpts: page(), status: "all" as const, sort: "name" as const };
    await expect(t.query(internal.adminReadModels.clients, args)).rejects.toThrow("Niste prijavljeni");
    await expect(ids.outsiderClient.query(internal.adminReadModels.clients, args)).rejects.toThrow("Nemate administratorski pristup");
    await expect(ids.outsiderClient.query(internal.adminActions.list, {
      scope: "all",
      now: NOW,
      limit: 10,
    })).rejects.toThrow("Nemate administratorski pristup");
    await expect(ids.adminAClient.mutation(internal.adminReadModels.syncProduct, {
      accountId: ids.accountId,
      businessId: ids.otherBusinessId,
      sourceRecordId: "wrong-tenant",
      smfCode: "SMF-WRONG-001",
      smqCodes: [],
      productType: "stickers",
      displayName: "Wrong tenant",
      operationalStatus: "active",
      updatedAt: NOW,
    })).rejects.toThrow("admin_product_business_not_in_account");
  });
});
