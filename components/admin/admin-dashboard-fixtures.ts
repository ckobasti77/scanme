import type { AdminDashboardFixture } from "./admin-dashboard-foundation";

const NOW = Date.UTC(2026, 8, 16, 8, 30);

const allItems = [
  {
    action: {
      actionItemId: "action-fixture-1",
      causeId: "subscription:fixture:suspended",
      source: { domain: "subscription", recordId: "subscription-fixture", causeKind: "suspended" },
      accountId: "account-fixture-1",
      businessId: "business-fixture-1",
      serviceProfileId: null,
      productRef: null,
      severity: "blocking",
      state: "open",
      assigneeId: "user-fixture-admin",
      dueAt: NOW - 60 * 60 * 1000,
      duePrecision: "instant",
      snooze: null,
      context: { kind: "source_record", href: null },
      resolutionRule: "source_fact_changed",
      description: "Obnova pretplate nije evidentirana",
      priorityClass: "blocking_or_overdue",
      relevantAt: NOW - 2 * 60 * 60 * 1000,
      audit: { createdAt: NOW - 86_400_000, updatedAt: NOW - 2 * 60 * 60 * 1000, resolvedAt: null, resolvedByKind: null, resolvedByUserId: null, resolutionNote: null },
    },
    contextLabel: "Demo Bistro",
    contextCode: "SMK-0012",
    href: "/admin/klijenti/account-fixture-1",
  },
  {
    action: {
      actionItemId: "action-fixture-2",
      causeId: "task:fixture:client_task",
      source: { domain: "task", recordId: "task-fixture", causeKind: "client_task" },
      accountId: "account-fixture-2",
      businessId: "business-fixture-2",
      serviceProfileId: null,
      productRef: null,
      severity: "warning",
      state: "open",
      assigneeId: null,
      dueAt: NOW,
      duePrecision: "date",
      snooze: null,
      context: { kind: "source_record", href: "/admin/zadaci" },
      resolutionRule: "source_fact_changed",
      description: "Potrebna je potvrda dizajna pre štampe",
      priorityClass: "due_today",
      relevantAt: NOW - 4 * 60 * 60 * 1000,
      audit: { createdAt: NOW - 86_400_000, updatedAt: NOW - 4 * 60 * 60 * 1000, resolvedAt: null, resolvedByKind: null, resolvedByUserId: null, resolutionNote: null },
    },
    contextLabel: "Demo Kafe",
    contextCode: "SMK-0041",
    href: "/admin/zadaci",
  },
  {
    action: {
      actionItemId: "action-fixture-3",
      causeId: "manual_problem:fixture:note",
      source: { domain: "manual_problem", recordId: "manual-fixture", causeKind: "note" },
      accountId: "account-fixture-3",
      businessId: null,
      serviceProfileId: null,
      productRef: null,
      severity: "information",
      state: "open",
      assigneeId: "user-fixture-admin",
      dueAt: null,
      duePrecision: null,
      snooze: null,
      context: { kind: "source_record", href: null },
      resolutionRule: "manual_problem_resolution",
      description: "Proveriti novu adresu za dostavu",
      priorityClass: "other",
      relevantAt: NOW - 7 * 60 * 60 * 1000,
      audit: { createdAt: NOW - 86_400_000, updatedAt: NOW - 7 * 60 * 60 * 1000, resolvedAt: null, resolvedByKind: null, resolvedByUserId: null, resolutionNote: null },
    },
    contextLabel: "Demo Restoran",
    contextCode: "SMK-0058",
    href: "/admin/klijenti/account-fixture-3",
  },
];

export function dashboardFixture(state: "ready" | "empty" | "unavailable" | "error" | "loading" = "ready") {
  const unavailable = state === "unavailable";
  const empty = state === "empty";
  const reaction = (mine: boolean) => ({
    scope: mine ? "mine" : "all",
    projection: unavailable ? "unavailable" : "complete",
    counts: unavailable ? null : empty
      ? { total: 0, urgent: 0, today: 0, needsReply: 0, graceOrWarning: 0, waitingScanme: 0, waitingClient: 0, calm: 0 }
      : mine
        ? { total: 2, urgent: 1, today: 0, needsReply: 0, graceOrWarning: 0, waitingScanme: 0, waitingClient: 0, calm: 1 }
        : { total: 8, urgent: 2, today: 2, needsReply: 1, graceOrWarning: 1, waitingScanme: 0, waitingClient: 1, calm: 1 },
    items: unavailable || empty ? [] : mine ? [allItems[0], allItems[2]] : allItems,
    capped: !unavailable && !empty && !mine,
  });
  return {
    now: NOW,
    reactions: { all: reaction(false), mine: reaction(true) },
    subscriptions: { projection: unavailable ? "unavailable" : "complete", counts: unavailable ? null : { total: empty ? 0 : 124, active: empty ? 0 : 103, grace: empty ? 0 : 9, suspended: empty ? 0 : 5, inactive: empty ? 0 : 7, warning: empty ? 0 : 11 } },
    products: { projection: unavailable ? "unavailable" : "complete", counts: unavailable ? null : { total: empty ? 0 : 386, active: empty ? 0 : 351, inactive: empty ? 0 : 21, problem: empty ? 0 : 14, qr: empty ? 0 : 386, nfc: empty ? 0 : 244, problemChannels: empty ? 0 : 16 } },
    finance: {
      scopeAccountId: null,
      collected: { amount: { amountMinor: empty ? 0 : 487_500_00, currency: "RSD" }, refunds: { amountMinor: 0, currency: "RSD" }, reversals: { amountMinor: 0, currency: "RSD" }, series: [] },
      expected: { amount: { amountMinor: empty ? 0 : 562_000_00, currency: "RSD" }, datedMinor: empty ? 0 : 562_000_00, undatedMinor: 0, overdueMinor: 0, unavailablePriceCount: 0, series: [], categories: [] },
      profit: { amount: empty ? { amountMinor: 0, currency: "RSD" } : null, complete: empty, missing: empty ? [] : ["production"], costs: { amountMinor: 0, currency: "RSD" } },
      categories: [], methods: [],
    },
    tasks: {
      today: { items: [], capped: false }, overdue: { items: [], capped: false }, mine: { items: [], capped: false },
    },
    inbox: {
      items: empty ? [] : [{ id: "conversation-fixture-1", accountName: "Demo Bistro", contactName: "Mila Petrović", channel: "panel_chat", status: "needs_reply", preview: "Možete li potvrditi da je dizajn spreman?", latestMessageAt: NOW - 42 * 60 * 1000, unreadCount: 2, href: "/admin/inbox?conversation=conversation-fixture-1" }],
      capped: false,
      provider: null,
    },
    ...(state === "error" ? { errorWidget: "subscriptions" } : {}),
    ...(state === "loading" ? { loadingWidget: "subscriptions" } : {}),
  } as unknown as AdminDashboardFixture;
}
