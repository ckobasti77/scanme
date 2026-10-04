import { v } from "convex/values";

export const actionSourceDomainValidator = v.union(
  v.literal("subscription"),
  v.literal("inbox"),
  v.literal("task"),
  v.literal("order"),
  v.literal("physical_product"),
  v.literal("qr_nfc"),
  v.literal("manual_problem"),
  v.literal("service_activation_request"),
);

export const actionSeverityValidator = v.union(
  v.literal("blocking"),
  v.literal("warning"),
  v.literal("information"),
);

export const actionStateValidator = v.union(
  v.literal("open"),
  v.literal("snoozed"),
  v.literal("resolved"),
);

export const actionPriorityClassValidator = v.union(
  v.literal("blocking_or_overdue"),
  v.literal("due_today"),
  v.literal("needs_reply"),
  v.literal("grace_or_warning"),
  v.literal("waiting_scanme"),
  v.literal("waiting_client"),
  v.literal("other"),
);

export const actionResolutionRuleValidator = v.union(
  v.literal("source_fact_changed"),
  v.literal("manual_problem_resolution"),
);

export const actionDuePrecisionValidator = v.union(
  v.literal("date"),
  v.literal("instant"),
);

export const actionActorValidator = v.union(
  v.object({ kind: v.literal("admin"), userId: v.id("users") }),
  v.object({ kind: v.literal("system"), source: v.string() }),
);

export const actionEventKindValidator = v.union(
  v.literal("opened"),
  v.literal("reopened"),
  v.literal("source_updated"),
  v.literal("snoozed"),
  v.literal("snooze_expired"),
  v.literal("assigned"),
  v.literal("automatic_resolved"),
  v.literal("manual_resolved"),
);

export const adminV1ServiceTypeValidator = v.union(
  v.literal("scanme_links"),
  v.literal("google_review"),
  v.literal("scanme_menu"),
);

export const serviceOperationalStateValidator = v.union(
  v.literal("problem"),
  v.literal("suspended"),
  v.literal("grace"),
  v.literal("warning"),
  v.literal("inactive"),
  v.literal("active"),
);

export const serviceAggregateValidator = v.object({
  total: v.number(),
  active: v.number(),
  warning: v.number(),
  grace: v.number(),
  suspended: v.number(),
  inactive: v.number(),
  problem: v.number(),
  worst: v.union(serviceOperationalStateValidator, v.null()),
});

export const serviceSummariesValidator = v.object({
  scanme_links: serviceAggregateValidator,
  google_review: serviceAggregateValidator,
  scanme_menu: serviceAggregateValidator,
});

export const actionSignalValidator = v.object({
  severity: v.union(actionSeverityValidator, v.null()),
  causeId: v.union(v.string(), v.null()),
});

export const productOperationalStatusValidator = v.union(
  v.literal("active"),
  v.literal("problem"),
  v.literal("inactive"),
);

export const productTypeValidator = v.union(
  v.literal("two-piece-stand"),
  v.literal("compact-stand"),
  v.literal("stickers"),
  v.literal("window-film"),
  v.literal("premium-engraved-stand"),
);
