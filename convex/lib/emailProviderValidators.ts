import { v } from "convex/values";

export const emailProviderValidator = v.literal("zoho");

export const emailProviderOperationalStateValidator = v.union(
  v.literal("disabled"),
  v.literal("healthy"),
  v.literal("syncing"),
  v.literal("degraded"),
  v.literal("auth_required"),
);

export const emailProviderMappingStateValidator = v.union(
  v.literal("matched"),
  v.literal("unmatched"),
  v.literal("ambiguous"),
  v.literal("poisoned"),
);

export const emailProviderAttachmentStateValidator = v.union(
  v.literal("none"),
  v.literal("pending"),
  v.literal("complete"),
  v.literal("failed"),
);

export const emailProviderAttachmentDownloadStateValidator = v.union(
  v.literal("metadata_only"),
  v.literal("ready"),
  v.literal("blocked"),
  v.literal("failed"),
);

export const emailProviderOutboxStateValidator = v.union(
  v.literal("pending"),
  v.literal("sending"),
  v.literal("sent"),
  v.literal("failed"),
  v.literal("needs_reconciliation"),
);

export const emailProviderAuditEventValidator = v.union(
  v.literal("connection_initialized"),
  v.literal("lease_acquired"),
  v.literal("sync_completed"),
  v.literal("sync_failed"),
  v.literal("message_staged"),
  v.literal("message_imported"),
  v.literal("attachment_failed"),
  v.literal("outbox_queued"),
  v.literal("outbox_state_changed"),
);

export const emailProviderAuditOutcomeValidator = v.union(
  v.literal("info"),
  v.literal("success"),
  v.literal("failure"),
);

export type EmailProviderOperationalState =
  | "disabled"
  | "healthy"
  | "syncing"
  | "degraded"
  | "auth_required";

export type EmailProviderMappingState =
  | "matched"
  | "unmatched"
  | "ambiguous"
  | "poisoned";

export type EmailProviderOutboxState =
  | "pending"
  | "sending"
  | "sent"
  | "failed"
  | "needs_reconciliation";
