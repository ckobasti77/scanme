import type { AdminDashboardFixture } from "./admin-dashboard-foundation";

const NOW = Date.UTC(2026, 8, 16, 8, 30);

const baseItems = [
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

const [firstUrgent, firstToday, calmItem] = baseItems;

type NamedItemSpec = {
  n: number;
  domain: string;
  kind: string;
  description: string;
  priority: "blocking_or_overdue" | "due_today" | "needs_reply" | "grace_or_warning" | "waiting_client";
  severity: "blocking" | "warning" | "information";
  /** How long the item has been waiting (ms before NOW). */
  waitingMs: number;
  label: string;
  manual?: boolean;
  /** Overrides the generated `causeId`. */
  causeId?: string;
};

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

const HREF_BY_DOMAIN: Record<string, string> = {
  order: "/admin/operativa/porudzbine",
  qr_nfc: "/admin/operativa/qr",
  physical_product: "/admin/operativa/proizvodi",
  inbox: "/admin/inbox",
  task: "/admin/zadaci",
};

/** A named item of „Za reakciju“ in the shape of the real data; `n` makes every id unique. */
function namedItem(spec: NamedItemSpec) {
  const { n, domain, kind } = spec;
  const due = spec.priority === "blocking_or_overdue" ? NOW - HOUR : spec.priority === "due_today" ? NOW : null;
  return {
    action: {
      actionItemId: `action-fixture-${n}`,
      causeId: spec.causeId ?? `${domain}:fixture:${kind}-${n}`,
      source: { domain, recordId: `${domain}-fixture-${n}`, causeKind: kind },
      accountId: `account-fixture-${n}`,
      businessId: `business-fixture-${n}`,
      serviceProfileId: null,
      productRef: null,
      severity: spec.severity,
      state: "open",
      assigneeId: n % 2 === 0 ? "user-fixture-admin" : null,
      dueAt: due,
      duePrecision: due === null ? null : spec.priority === "due_today" ? "date" : "instant",
      snooze: null,
      context: { kind: "source_record", href: null },
      resolutionRule: spec.manual ? "manual_problem_resolution" : "source_fact_changed",
      description: spec.description,
      priorityClass: spec.priority,
      relevantAt: NOW - spec.waitingMs,
      audit: { createdAt: NOW - spec.waitingMs - 86_400_000, updatedAt: NOW - spec.waitingMs, resolvedAt: null, resolvedByKind: null, resolvedByUserId: null, resolutionNote: null },
    },
    contextLabel: spec.label,
    contextCode: `SMK-00${60 + n}`,
    href: HREF_BY_DOMAIN[domain] ?? `/admin/klijenti/account-fixture-${n}`,
  };
}

// The waits are spread on purpose: on the two inner orbits there is a star younger than an hour, one between an
// hour and a day and one older than a day, so the three sizes of the Constellation can be seen.
const secondUrgent = namedItem({ n: 4, domain: "order", kind: "payment-pending", description: "Porudžbina čeka potvrdu uplate", priority: "blocking_or_overdue", severity: "blocking", waitingMs: 30 * MINUTE, label: "Demo Pekara" });
const thirdUrgent = namedItem({ n: 5, domain: "qr_nfc", kind: "qr-broken", description: "QR kod na stolu 4 ne otvara meni", priority: "blocking_or_overdue", severity: "blocking", waitingMs: 36 * HOUR, label: "Demo Pivnica" });
const fourthUrgent = namedItem({ n: 6, domain: "manual_problem", kind: "card-scan", description: "Klijent javlja da kartica ne skenira", priority: "blocking_or_overdue", severity: "blocking", waitingMs: 3 * HOUR, label: "Demo Hotel", manual: true });

const todayItems = [
  firstToday,
  namedItem({ n: 7, domain: "physical_product", kind: "print-due", description: "Kartica čeka štampu, rok je danas", priority: "due_today", severity: "warning", waitingMs: 50 * MINUTE, label: "Demo Picerija" }),
  namedItem({ n: 8, domain: "service_activation_request", kind: "approval", description: "Zahtev za aktivaciju čeka odobrenje", priority: "due_today", severity: "warning", waitingMs: 30 * HOUR, label: "Demo Salon" }),
  namedItem({ n: 9, domain: "manual_problem", kind: "stand-visit", description: "Dogovoriti termin postavljanja štanda", priority: "due_today", severity: "warning", waitingMs: 12 * HOUR, label: "Demo Klub", manual: true }),
];

const waitingItems = [
  namedItem({ n: 10, domain: "inbox", kind: "needs-reply", description: "Klijent čeka odgovor na poruku", priority: "needs_reply", severity: "warning", waitingMs: 3 * HOUR, label: "Demo Menza" }),
  namedItem({ n: 11, domain: "subscription", kind: "grace", description: "Pretplata je u periodu odloženog plaćanja", priority: "grace_or_warning", severity: "warning", waitingMs: 20 * HOUR, label: "Demo Hotel" }),
  namedItem({ n: 12, domain: "task", kind: "client-logo", description: "Čeka se da klijent pošalje logo", priority: "waiting_client", severity: "information", waitingMs: 26 * HOUR, label: "Demo Kafe" }),
  namedItem({ n: 13, domain: "order", kind: "client-address", description: "Čeka se da klijent potvrdi adresu dostave", priority: "waiting_client", severity: "information", waitingMs: 50 * HOUR, label: "Demo Bistro" }),
];

const newUrgent = namedItem({ n: 14, domain: "order", kind: "new-urgent", causeId: "order:fixture:new-urgent", description: "Porudžbina ne može da se isporuči bez uplate", priority: "blocking_or_overdue", severity: "blocking", waitingMs: 5 * MINUTE, label: "Demo Poslastičarnica" });

const ALL_COUNTS = { total: 74, urgent: 4, today: 6, needsReply: 1, graceOrWarning: 1, waitingScanme: 0, waitingClient: 2, calm: 60 };
const MAX_LISTED = 12;

/** The steps of the dev preview: 0 the base state, 1 a resolved item, 2 a new item. */
export const DASHBOARD_FIXTURE_STEPS = [0, 1, 2] as const;

/** The items and counts of the „Sve“ scope at a step. */
function allScope(step: 0 | 1 | 2) {
  const base = [firstUrgent, secondUrgent, thirdUrgent, fourthUrgent, ...todayItems, ...waitingItems];
  if (step === 1) {
    // The second urgent item is resolved: out of the list, out of the totals.
    return { items: base.filter((item) => item !== secondUrgent), counts: { ...ALL_COUNTS, total: ALL_COUNTS.total - 1, urgent: ALL_COUNTS.urgent - 1 } };
  }
  if (step === 2) {
    // A new urgent item arrives at the head; the list holds 12, so the last one is pushed out of view.
    return { items: [newUrgent, ...base].slice(0, MAX_LISTED), counts: { ...ALL_COUNTS, total: ALL_COUNTS.total + 1, urgent: ALL_COUNTS.urgent + 1 } };
  }
  return { items: base, counts: ALL_COUNTS };
}

function taskFixture(timePhase: "today" | "overdue", index: number) {
  return {
    id: `task-fixture-${index}`,
    accountId: `account-fixture-${index}`,
    accountName: "Demo Bistro",
    smkCode: "SMK-0012",
    contactId: null,
    contactName: null,
    businessId: null,
    businessName: null,
    smlCode: null,
    conversationId: null,
    subject: null,
    subjectKind: "none",
    subjectLabel: null,
    subjectHref: null,
    title: timePhase === "overdue" ? "Pozvati klijenta zbog obnove" : `Proveriti štampu kartice ${index}`,
    description: "",
    assigneeId: "user-fixture-admin",
    assigneeName: "Demo Admin",
    participantCount: 1,
    priority: "normal",
    due: { kind: "instant", at: NOW },
    timePhase,
    status: "open",
    deferredUntil: null,
    deferredReason: null,
    createdAt: NOW - 86_400_000,
    updatedAt: NOW - 3_600_000,
  };
}

export function dashboardFixture(state: "ready" | "empty" | "unavailable" | "error" | "loading" = "ready", step: 0 | 1 | 2 = 0) {
  const unavailable = state === "unavailable";
  const empty = state === "empty";
  const all = allScope(step);
  const reaction = (mine: boolean) => ({
    scope: mine ? "mine" : "all",
    projection: unavailable ? "unavailable" : "complete",
    counts: unavailable ? null : empty
      ? { total: 0, urgent: 0, today: 0, needsReply: 0, graceOrWarning: 0, waitingScanme: 0, waitingClient: 0, calm: 0 }
      : mine
        ? { total: 2, urgent: 1, today: 0, needsReply: 0, graceOrWarning: 0, waitingScanme: 0, waitingClient: 0, calm: 1 }
        : all.counts,
    items: unavailable || empty ? [] : mine ? [firstUrgent, calmItem] : all.items,
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
    tasks: empty || unavailable
      ? { today: { items: [], capped: false }, overdue: { items: [], capped: false }, mine: { items: [], capped: false } }
      : { today: { items: [taskFixture("today", 1), taskFixture("today", 2)], capped: false }, overdue: { items: [taskFixture("overdue", 3)], capped: false }, mine: { items: [taskFixture("overdue", 3)], capped: false } },
    inbox: {
      items: empty ? [] : [{ id: "conversation-fixture-1", accountName: "Demo Bistro", contactName: "Mila Petrović", channel: "panel_chat", status: "needs_reply", preview: "Možete li potvrditi da je dizajn spreman?", latestMessageAt: NOW - 42 * 60 * 1000, unreadCount: 2, href: "/admin/inbox?conversation=conversation-fixture-1" }],
      capped: false,
      provider: null,
    },
    ...(state === "error" ? { errorWidget: "subscriptions" } : {}),
    ...(state === "loading" ? { loadingWidget: "subscriptions" } : {}),
  } as unknown as AdminDashboardFixture;
}
