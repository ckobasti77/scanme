/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const NOW = Date.parse("2026-09-11T12:00:00.000Z");
const ADMIN_A = "teodora@scanme.test";
const ADMIN_B = "jovan@scanme.test";
const ADMIN_C = "aleksa@scanme.test";
const page = (numItems = 20, cursor: string | null = null) => ({ numItems, cursor });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  process.env.SCANME_ADMIN_EMAILS = `${ADMIN_A},${ADMIN_B},${ADMIN_C}`;
});

afterEach(() => vi.useRealTimers());

function identity(userId: Id<"users">) {
  return { subject: userId, issuer: "https://admin-10.test" };
}

async function seed() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const adminA = await ctx.db.insert("users", { email: ADMIN_A, name: "Teodora" });
    const adminB = await ctx.db.insert("users", { email: ADMIN_B, name: "Jovan" });
    const adminC = await ctx.db.insert("users", { email: ADMIN_C, name: "Aleksa" });
    const outsider = await ctx.db.insert("users", { email: "outside@example.invalid", name: "Outside" });
    const accountId = await ctx.db.insert("accounts", {
      name: "Bistro Most",
      plan: "premium",
      status: "active",
      smkCode: "SMK-MOS-001",
      ownerDisplayName: "Mina Most",
      normalizedOwnerDisplayName: "mina most",
      clientStatus: "active",
      adminV1MigrationVersion: 1,
      createdAt: NOW - 10_000,
      updatedAt: NOW - 10_000,
    });
    const contactId = await ctx.db.insert("accountContacts", {
      accountId,
      firstName: "Mina",
      lastName: "Most",
      normalizedName: "mina most",
      normalizedEmail: "mina@example.invalid",
      positionTitle: "Vlasnica",
      isOwner: true,
      status: "active",
      createdAt: NOW - 9_000,
      updatedAt: NOW - 9_000,
    });
    const businessId = await ctx.db.insert("businesses", {
      accountId,
      name: "Bistro Most Dorćol",
      normalizedName: "bistro most dorcol",
      slug: "bistro-most-admin-10",
      kind: "business",
      smlCode: "SML-MOS-001",
      clientStatus: "active",
      adminV1MigrationVersion: 1,
      status: "active",
      createdAt: NOW - 8_000,
      updatedAt: NOW - 8_000,
    });
    const otherAccountId = await ctx.db.insert("accounts", {
      name: "Drugi klijent",
      plan: "basic",
      status: "active",
      smkCode: "SMK-DRU-001",
      ownerDisplayName: "Drugi",
      normalizedOwnerDisplayName: "drugi",
      clientStatus: "active",
      adminV1MigrationVersion: 1,
      createdAt: NOW,
      updatedAt: NOW,
    });
    const otherContactId = await ctx.db.insert("accountContacts", {
      accountId: otherAccountId,
      firstName: "Drugi",
      lastName: "Kontakt",
      normalizedName: "drugi kontakt",
      positionTitle: "Vlasnik",
      isOwner: true,
      status: "active",
      createdAt: NOW,
      updatedAt: NOW,
    });
    const otherBusinessId = await ctx.db.insert("businesses", {
      accountId: otherAccountId,
      name: "Drugi lokal",
      slug: "drugi-lokal-admin-10",
      kind: "business",
      smlCode: "SML-DRU-001",
      clientStatus: "active",
      adminV1MigrationVersion: 1,
      status: "active",
      createdAt: NOW,
      updatedAt: NOW,
    });
    return {
      adminA,
      adminB,
      adminC,
      outsider,
      accountId,
      contactId,
      businessId,
      otherAccountId,
      otherContactId,
      otherBusinessId,
    };
  });
  return {
    t,
    ...ids,
    a: t.withIdentity(identity(ids.adminA)),
    b: t.withIdentity(identity(ids.adminB)),
    outsiderClient: t.withIdentity(identity(ids.outsider)),
  };
}

function createArgs(
  ids: Awaited<ReturnType<typeof seed>>,
  commandId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    commandId,
    accountId: ids.accountId,
    contactId: ids.contactId,
    businessId: ids.businessId,
    subject: { kind: "venue" as const, id: ids.businessId },
    title: `Zadatak ${commandId}`,
    description: "Proveri dogovor sa klijentom.",
    assigneeId: ids.adminA,
    participantIds: [ids.adminB],
    priority: "high" as const,
    due: { kind: "date" as const, date: "2026-09-11" },
    ...overrides,
  };
}

describe("ADMIN-10 task integrity and authorization", () => {
  test("requires a client account, same-account links and a real single admin assignee", async () => {
    const ids = await seed();
    const withoutAccount = { ...createArgs(ids, "missing-account") } as Record<string, unknown>;
    delete withoutAccount.accountId;
    await expect(ids.a.mutation(api.adminTasks.create, withoutAccount as never))
      .rejects.toThrow();
    await expect(ids.outsiderClient.mutation(api.adminTasks.create, createArgs(ids, "unauthorized")))
      .rejects.toThrow("Nemate administratorski pristup");
    await expect(ids.a.mutation(api.adminTasks.create, createArgs(ids, "cross-contact", {
      contactId: ids.otherContactId,
    }))).rejects.toThrow("admin_task_contact_cross_account");
    await expect(ids.a.mutation(api.adminTasks.create, createArgs(ids, "cross-venue", {
      businessId: ids.otherBusinessId,
    }))).rejects.toThrow("admin_task_venue_cross_account");
    await expect(ids.a.mutation(api.adminTasks.create, createArgs(ids, "bad-assignee", {
      assigneeId: ids.outsider,
    }))).rejects.toThrow("admin_task_assignee_invalid");
    await expect(ids.a.mutation(api.adminTasks.create, createArgs(ids, "duplicate-participants", {
      participantIds: [ids.adminB, ids.adminB],
    }))).rejects.toThrow("admin_task_participants_invalid");
    await expect(ids.a.mutation(api.adminTasks.create, createArgs(ids, "assignee-participant", {
      participantIds: [ids.adminA],
    }))).rejects.toThrow("admin_task_participant_is_assignee");
    await expect(ids.a.mutation(api.adminTasks.create, createArgs(ids, "cross-subject", {
      subject: { kind: "venue", id: ids.otherBusinessId },
    }))).rejects.toThrow("admin_task_subject_cross_account");
  });

  test("participant writes preserve uniqueness and never create a second primary assignee", async () => {
    const ids = await seed();
    const { taskId } = await ids.a.mutation(api.adminTasks.create, createArgs(ids, "participants", {
      participantIds: [],
    }));
    await ids.a.mutation(api.adminTasks.addParticipant, {
      taskId,
      commandId: "participant-add",
      participantId: ids.adminB,
    });
    await expect(ids.a.mutation(api.adminTasks.addParticipant, {
      taskId,
      commandId: "participant-duplicate",
      participantId: ids.adminB,
    })).rejects.toThrow("admin_task_participant_duplicate");
    await expect(ids.a.mutation(api.adminTasks.addParticipant, {
      taskId,
      commandId: "participant-primary",
      participantId: ids.adminA,
    })).rejects.toThrow("admin_task_participant_is_assignee");
    await expect(ids.a.mutation(api.adminTasks.setAssignee, {
      taskId,
      commandId: "assign-participant",
      assigneeId: ids.adminB,
    })).rejects.toThrow("admin_task_assignee_is_participant");
    await ids.a.mutation(api.adminTasks.removeParticipant, {
      taskId,
      commandId: "participant-remove",
      participantId: ids.adminB,
    });
    const detail = await ids.a.query(api.adminTasks.getTask, { taskId });
    expect(detail).toMatchObject({ task: { participantCount: 0 }, participants: [] });
  });

  test("create retry does not duplicate a task, task event or action cause", async () => {
    const ids = await seed();
    const first = await ids.a.mutation(api.adminTasks.create, createArgs(ids, "create-once"));
    const retry = await ids.a.mutation(api.adminTasks.create, createArgs(ids, "create-once"));
    expect(retry.taskId).toBe(first.taskId);
    const counts = await ids.t.run(async (ctx) => ({
      tasks: (await ctx.db.query("clientTasks").collect()).length,
      events: (await ctx.db.query("clientTaskEvents").collect()).length,
      actions: (await ctx.db.query("actionItems").collect()).length,
      actionEvents: (await ctx.db.query("actionItemEvents").collect()).length,
    }));
    expect(counts).toEqual({ tasks: 1, events: 1, actions: 1, actionEvents: 1 });
  });
});

describe("ADMIN-10 lifecycle, action cause and deferral", () => {
  test("complete resolves and reopen reactivates the same stable action cause", async () => {
    const ids = await seed();
    const { taskId } = await ids.a.mutation(api.adminTasks.create, createArgs(ids, "lifecycle", {
      due: { kind: "date", date: "2026-09-10" },
    }));
    const original = await ids.t.run((ctx) => ctx.db.query("actionItems").withIndex("by_source_record_state_priority", (q) =>
      q.eq("sourceDomain", "task").eq("sourceRecordId", String(taskId)),
    ).unique());
    await ids.a.mutation(api.adminTasks.changeStatus, {
      taskId,
      commandId: "complete-1",
      status: "completed",
    });
    await ids.a.mutation(api.adminTasks.changeStatus, {
      taskId,
      commandId: "complete-1",
      status: "completed",
    });
    let action = await ids.t.run((ctx) => ctx.db.get(original!._id));
    expect(action?.state).toBe("resolved");
    let task = await ids.t.run((ctx) => ctx.db.get(taskId));
    expect(task?.timePhase).toBe("none");
    await ids.a.mutation(api.adminTasks.changeStatus, {
      taskId,
      commandId: "reopen-1",
      status: "open",
      reason: "Klijent je poslao nove informacije.",
    });
    action = await ids.t.run((ctx) => ctx.db.get(original!._id));
    expect(action).toMatchObject({ _id: original!._id, state: "open" });
    task = await ids.t.run((ctx) => ctx.db.get(taskId));
    expect(task?.timePhase).toBe("overdue");
    const events = await ids.t.run((ctx) => ctx.db.query("clientTaskEvents").withIndex("by_taskId_and_createdAt", (q) => q.eq("taskId", taskId)).collect());
    expect(events.map((event) => event.event)).toEqual(["created", "completed", "reopened"]);

    const { taskId: cancelledTaskId } = await ids.a.mutation(
      api.adminTasks.create,
      createArgs(ids, "cancelled-lifecycle", {
        due: { kind: "date", date: "2026-09-10" },
      }),
    );
    await ids.a.mutation(api.adminTasks.changeStatus, {
      taskId: cancelledTaskId,
      commandId: "cancel-1",
      status: "cancelled",
      reason: "Obaveza više nije potrebna.",
    });
    const cancelledTask = await ids.t.run((ctx) => ctx.db.get(cancelledTaskId));
    expect(cancelledTask?.timePhase).toBe("none");
  });

  test("deferral requires a reason and future time, repeats append-only, then resumes its previous state", async () => {
    const ids = await seed();
    const { taskId } = await ids.a.mutation(api.adminTasks.create, createArgs(ids, "defer"));
    await ids.a.mutation(api.adminTasks.changeStatus, {
      taskId,
      commandId: "start",
      status: "in_progress",
    });
    await expect(ids.a.mutation(api.adminTasks.defer, {
      taskId,
      commandId: "bad-reason",
      until: NOW + 10_000,
      reason: " ",
    })).rejects.toThrow("admin_task_defer_reason_required");
    await expect(ids.a.mutation(api.adminTasks.defer, {
      taskId,
      commandId: "bad-time",
      until: NOW - 1,
      reason: "Čekamo potvrdu.",
    })).rejects.toThrow("admin_task_defer_must_be_future");
    await ids.a.mutation(api.adminTasks.defer, {
      taskId,
      commandId: "defer-1",
      until: NOW + 10_000,
      reason: "Čekamo potvrdu klijenta.",
    });
    const snoozed = await ids.t.run((ctx) => ctx.db.query("actionItems").withIndex("by_source_record_state_priority", (q) =>
      q.eq("sourceDomain", "task").eq("sourceRecordId", String(taskId)),
    ).unique());
    expect(snoozed).toMatchObject({ state: "snoozed", snoozeReason: "Čekamo potvrdu klijenta." });
    await ids.b.mutation(api.adminTasks.defer, {
      taskId,
      commandId: "defer-2",
      until: NOW + 20_000,
      reason: "Klijent je pomerio odgovor.",
    });
    vi.setSystemTime(NOW + 20_001);
    await ids.t.finishAllScheduledFunctions(vi.runAllTimers);
    const task = await ids.t.run((ctx) => ctx.db.get(taskId));
    expect(task).toMatchObject({ status: "in_progress", view: "active" });
    const reopenedAction = await ids.t.run((ctx) => ctx.db.get(snoozed!._id));
    expect(reopenedAction).toMatchObject({ _id: snoozed!._id, state: "open" });
    const events = await ids.t.run((ctx) => ctx.db.query("clientTaskEvents").withIndex("by_taskId_and_createdAt", (q) => q.eq("taskId", taskId)).collect());
    expect(events.filter((event) => event.event === "deferred")).toHaveLength(2);
    expect(events.at(-1)).toMatchObject({ event: "resumed", actorKind: "system" });
  });
});

describe("ADMIN-10 bounded reads", () => {
  test("dashboard, Team counts and cursor pagination use the canonical tasks and conversations", async () => {
    const ids = await seed();
    for (let index = 0; index < 5; index += 1) {
      await ids.a.mutation(api.adminTasks.create, createArgs(ids, `page-${index}`, {
        title: `Zadatak ${index}`,
        due: index === 0
          ? { kind: "date", date: "2026-09-10" }
          : { kind: "date", date: "2026-09-11" },
      }));
    }
    await ids.t.run(async (ctx) => {
      await ctx.db.insert("conversations", {
        accountId: ids.accountId,
        accountName: "Bistro Most",
        smkCode: "SMK-MOS-001",
        contactId: ids.contactId,
        contactName: "Mina Most",
        businessId: ids.businessId,
        businessName: "Bistro Most Dorćol",
        channel: "panel_chat",
        status: "needs_reply",
        assigneeAdminId: ids.adminA,
        assigneeName: "Teodora",
        assigneeKey: String(ids.adminA),
        latestMessagePreview: "Da li stiže danas?",
        latestMessageAt: NOW,
        latestMessageDirection: "client_to_admin",
        latestMessageAuthorName: "Mina Most",
        adminUnreadCount: 1,
        searchText: "bistro most mina",
        createdAt: NOW,
        updatedAt: NOW,
      });
    });
    const first = await ids.a.query(api.adminTasks.list, {
      paginationOpts: page(2),
      tab: "all",
    });
    const second = await ids.a.query(api.adminTasks.list, {
      paginationOpts: page(2, first.continueCursor),
      tab: "all",
    });
    expect(new Set([...first.page, ...second.page].map((task) => task.id)).size).toBe(4);
    const dashboard = await ids.a.query(api.adminTasks.dashboardAdapter, { now: NOW, limit: 10 });
    expect(dashboard.today.items).toHaveLength(4);
    expect(dashboard.overdue.items).toHaveLength(1);
    expect(dashboard.mine.items).toHaveLength(5);
    const team = await ids.a.query(api.adminTasks.teamOverview, {});
    expect(team.find((member) => member.id === ids.adminA)).toMatchObject({
      openTasks: 5,
      overdueTasks: 1,
      assignedConversations: 1,
      awaitingReaction: 2,
      countsCapped: false,
    });
    expect(team.map((member) => member.name).sort()).toEqual(["Aleksa", "Jovan", "Teodora"]);
  });
});
