/** ADMIN-01 vocabulary. No prices, providers, schema or UI dependencies. */
export const SERVICE_TYPES = ["scanme_links", "scanme_review", "scanme_menu"] as const;
export type ServiceType = (typeof SERVICE_TYPES)[number];

// Preserve the configurator's product IDs; only the shared display vocabulary changes.
export const PRODUCT_TYPES = [
  "two-piece-stand", "compact-stand", "stickers", "window-film", "premium-engraved-stand",
] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

export const SERVICE_ALIASES = {
  scanme_links: "scanme_links", links: "scanme_links",
  scanme_review: "scanme_review", google_review: "scanme_review", review: "scanme_review",
  scanme_menu: "scanme_menu", menu: "scanme_menu",
} as const satisfies Record<string, ServiceType>;

export function canonicalService(value: string): ServiceType | null {
  return Object.hasOwn(SERVICE_ALIASES, value)
    ? SERVICE_ALIASES[value as keyof typeof SERVICE_ALIASES]
    : null;
}

export const BILLING_PERIODS = ["monthly", "annual"] as const;
export type BillingPeriod = (typeof BILLING_PERIODS)[number];
export const SUBSCRIPTION_STATUSES = ["active", "grace", "suspended", "inactive"] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];
export const ACCOUNT_STATUSES = ["active", "archived"] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];
export const CLIENT_ROLES = ["full_access", "venue_management", "finance", "view_only"] as const;
export type ClientRole = (typeof CLIENT_ROLES)[number];
export const CHANNEL_STATUSES = ["active", "inactive", "problem", "absent"] as const;
export type ChannelStatus = (typeof CHANNEL_STATUSES)[number];
export const CONVERSATION_STATUSES = ["new", "needs_reply", "in_progress", "waiting_client", "completed"] as const;
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];
export const TASK_STATUSES = ["open", "in_progress", "deferred", "completed", "cancelled"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const PAYMENT_METHODS = ["payment_card", "bank_transfer", "cash", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const REFERRAL_STATUSES = ["pending", "qualified", "rewarded", "cancelled"] as const;
export type ReferralStatus = (typeof REFERRAL_STATUSES)[number];
export const CONVERSATION_CHANNELS = ["email", "panel_chat", "phone_note", "message_copy", "in_person_note"] as const;
export type ConversationChannel = (typeof CONVERSATION_CHANNELS)[number];

// §8.5: the three axes are locked; their phase names remain provisional.
export const ORDER_PAYMENT_STATUSES = ["awaiting_payment", "paid", "reversed"] as const;
export const ORDER_DESIGN_STATUSES = ["template_selected", "in_progress", "awaiting_approval", "approved"] as const;
export const ORDER_FULFILLMENT_STATUSES = [
  "awaiting_conditions", "smf_assigned", "ready_for_printer", "at_printer", "received",
  "quality_control", "ready_for_delivery", "in_delivery", "delivered", "cancelled",
] as const;

export const BILLING_WINDOWS = {
  monthly: { warningDays: 7, graceDays: 7 },
  annual: { warningDays: 15, graceDays: 15 },
} as const satisfies Record<BillingPeriod, { warningDays: number; graceDays: number }>;

export const CODE_PREFIXES = { account: "SMK", venue: "SML", physicalProduct: "SMF", digitalQr: "SMQ", order: "SMP" } as const;
export type CodeKind = keyof typeof CODE_PREFIXES;
export type HumanCode<K extends CodeKind> = `${(typeof CODE_PREFIXES)[K]}-${string}`;

/** Provisional display format. The caller allocates uniqueness; this never derives relationships. */
export function formatHumanCode<K extends CodeKind>(kind: K, parts: readonly [string, ...string[]]): HumanCode<K> {
  if (parts.some((part) => !/^[A-Z0-9]+$/.test(part))) throw new Error("invalid_code_part");
  return `${CODE_PREFIXES[kind]}-${parts.join("-")}` as HumanCode<K>;
}

export function parseHumanCode(value: string): { kind: CodeKind; parts: string[] } | null {
  const [prefix, ...parts] = value.trim().toUpperCase().split("-");
  const kind = (Object.keys(CODE_PREFIXES) as CodeKind[]).find((key) => CODE_PREFIXES[key] === prefix);
  return kind && parts.length && parts.every((part) => /^[A-Z0-9]+$/.test(part)) ? { kind, parts } : null;
}
