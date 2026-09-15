/** Pure ADMIN-04 action ordering and stable-cause helpers. */

export const ACTION_SOURCE_DOMAINS = [
  "subscription",
  "inbox",
  "task",
  "order",
  "physical_product",
  "qr_nfc",
  "manual_problem",
  "service_activation_request",
] as const;
export type ActionSourceDomain = (typeof ACTION_SOURCE_DOMAINS)[number];

export const ACTION_SEVERITIES = ["blocking", "warning", "information"] as const;
export type ActionSeverity = (typeof ACTION_SEVERITIES)[number];

export const ACTION_STATES = ["open", "snoozed", "resolved"] as const;
export type ActionState = (typeof ACTION_STATES)[number];

export const ACTION_PRIORITY_CLASSES = [
  "blocking_or_overdue",
  "due_today",
  "needs_reply",
  "grace_or_warning",
  "waiting_scanme",
  "waiting_client",
  "other",
] as const;
export type ActionPriorityClass = (typeof ACTION_PRIORITY_CLASSES)[number];

export const ACTION_PRIORITY_RANK = {
  blocking_or_overdue: 1,
  due_today: 2,
  needs_reply: 3,
  grace_or_warning: 4,
  waiting_scanme: 5,
  waiting_client: 6,
  other: 7,
} as const satisfies Record<ActionPriorityClass, number>;

export type ActionPrioritySignals = {
  readonly blocking: boolean;
  readonly overdue: boolean;
  readonly dueToday: boolean;
  readonly needsReply: boolean;
  readonly graceOrWarning: boolean;
  readonly waitingOn: "scanme" | "client" | "none";
};

export function actionPriorityClass(
  signals: ActionPrioritySignals,
): ActionPriorityClass {
  if (signals.blocking || signals.overdue) return "blocking_or_overdue";
  if (signals.dueToday) return "due_today";
  if (signals.needsReply) return "needs_reply";
  if (signals.graceOrWarning) return "grace_or_warning";
  if (signals.waitingOn === "scanme") return "waiting_scanme";
  if (signals.waitingOn === "client") return "waiting_client";
  return "other";
}

function encodedPart(value: string): string {
  return `${value.length}:${value}`;
}

/** Length-prefixed parts prevent delimiter collisions without hashing opaque IDs. */
export function stableActionCauseId(
  domain: ActionSourceDomain,
  sourceRecordId: string,
  causeKind: string,
): string {
  if (!sourceRecordId || !causeKind) throw new Error("action_cause_required");
  return `cause:v1:${encodedPart(domain)}:${encodedPart(sourceRecordId)}:${encodedPart(causeKind)}`;
}

export type ActionPriorityComparable = {
  readonly causeId: string;
  readonly priorityClass: ActionPriorityClass;
  readonly dueAt?: number | null;
  readonly relevantAt: number;
};

export function actionPriorityAt(item: ActionPriorityComparable): number {
  switch (item.priorityClass) {
    case "blocking_or_overdue":
    case "due_today":
    case "grace_or_warning":
      return item.dueAt ?? item.relevantAt;
    case "needs_reply":
      return item.relevantAt;
    case "waiting_scanme":
    case "waiting_client":
    case "other":
      return -item.relevantAt;
  }
}

export function compareActionPriority(
  left: ActionPriorityComparable,
  right: ActionPriorityComparable,
): number {
  const rank =
    ACTION_PRIORITY_RANK[left.priorityClass] -
    ACTION_PRIORITY_RANK[right.priorityClass];
  if (rank !== 0) return rank;
  const time = actionPriorityAt(left) - actionPriorityAt(right);
  return time !== 0 ? time : left.causeId.localeCompare(right.causeId);
}
