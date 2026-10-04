/**
 * ADMIN-01 logical contracts, not Convex documents or client API arguments.
 * Relations use opaque IDs. Future persistence adapters must validate ownership
 * and map real database IDs; fixture IDs must never be sent to a deployment.
 * Arrays below describe bounded aggregates, not unbounded history fields in a table.
 */
import type {
  AccountStatus, BillingPeriod, ClientRole, ConversationChannel, ConversationStatus,
  HumanCode, ORDER_DESIGN_STATUSES, ORDER_FULFILLMENT_STATUSES,
  ORDER_PAYMENT_STATUSES, PaymentMethod, ProductType, ServiceType, TaskStatus,
} from "./catalog";
import type {
  Orientation, ProductBackground, ProductDimension, ProductFinish, ProductMaterial,
  ProductShape, WoodType,
} from "../scanme-pricing";
import type {
  ActionPriorityClass,
  ActionSeverity,
  ActionSourceDomain,
  ActionState,
} from "./operational";

export type EntityKind =
  | "account" | "venue" | "contact" | "member" | "user" | "legalEntity" | "brand" | "venueGroup" | "tag"
  | "service" | "subscription" | "payment" | "allocation" | "adjustment" | "priceAgreement" | "discount" | "referral"
  | "order" | "orderLine" | "printer" | "printJob" | "delivery" | "physicalProduct" | "channel" | "digitalQr"
  | "destination" | "placement" | "placementPeriod" | "conversation" | "message" | "task" | "actionItem" | "audit";
declare const entityBrand: unique symbol;
export type EntityId<K extends EntityKind> = string & { readonly [entityBrand]: K };
export type EntityRef = { [K in EntityKind]: { readonly kind: K; readonly id: EntityId<K> } }[EntityKind];
export type NonEmpty<T> = readonly [T, ...T[]];
export type Timestamp = number; // UTC epoch milliseconds; intervals are [start, end).
export type Actor =
  | { readonly kind: "admin" | "client"; readonly userId: EntityId<"user"> }
  | { readonly kind: "system"; readonly source: string }
  | { readonly kind: "shared_mailbox" }; // No invented attribution for externally sent mail.
export type Change = { readonly actor: Actor; readonly at: Timestamp; readonly reason: string };
export type RecordBase<K extends EntityKind> = { readonly id: EntityId<K>; readonly createdAt: Timestamp; readonly updatedAt: Timestamp };

export interface ClientAccount extends RecordBase<"account"> {
  readonly code: HumanCode<"account">;
  readonly ownerDisplayName: string;
  readonly status: AccountStatus;
  readonly primaryOwnerMemberId: EntityId<"member">;
  readonly defaultContactId: EntityId<"contact">;
}
export interface Contact extends RecordBase<"contact"> {
  readonly accountId: EntityId<"account">;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly position: string;
  readonly isOwner: boolean;
  readonly status: "active" | "inactive";
}
export interface ClientMember extends RecordBase<"member"> {
  readonly accountId: EntityId<"account">;
  readonly userId: EntityId<"user">;
  readonly contactId: EntityId<"contact"> | null;
  readonly role: ClientRole;
  readonly active: boolean;
  readonly venueScope: { readonly kind: "all" } | { readonly kind: "selected"; readonly venueIds: readonly EntityId<"venue">[] };
  readonly canBuyServices: boolean;
  readonly canBuyPremium: boolean;
}
export interface LegalEntity extends RecordBase<"legalEntity"> {
  readonly accountId: EntityId<"account">;
  readonly name: string;
  readonly taxId: string | null;
  readonly registrationNumber: string | null;
  readonly address: string | null;
}
export interface Brand extends RecordBase<"brand"> {
  readonly accountId: EntityId<"account">;
  readonly name: string;
  readonly revision: string;
  readonly logoAssetId: string | null;
  readonly colors: readonly string[];
}
export interface VenueGroup extends RecordBase<"venueGroup"> {
  readonly accountId: EntityId<"account">;
  readonly name: string;
}
export interface AccountTag extends RecordBase<"tag"> {
  readonly accountId: EntityId<"account">;
  readonly tag: { readonly kind: "friend" } | { readonly kind: "custom"; readonly label: string };
}
export interface Venue extends RecordBase<"venue"> {
  readonly accountId: EntityId<"account">;
  readonly code: HumanCode<"venue">;
  readonly name: string;
  readonly city: string;
  readonly address: string;
  readonly status: AccountStatus;
  readonly legalEntityId: EntityId<"legalEntity"> | null;
  readonly brandId: EntityId<"brand"> | null;
  readonly groupId: EntityId<"venueGroup"> | null;
  readonly defaultContactOverrideId: EntityId<"contact"> | null;
}
export type TechnicalHealth =
  | { readonly status: "healthy" | "unchecked"; readonly checkedAt: Timestamp | null }
  | { readonly status: "problem"; readonly checkedAt: Timestamp | null; readonly reason: string };
export interface ServiceInstance extends RecordBase<"service"> {
  readonly venueId: EntityId<"venue">;
  readonly type: ServiceType;
  readonly activation: "owned" | "inactive";
  readonly configuration: "not_configured" | "draft" | "published";
  readonly health: TechnicalHealth;
  readonly clientEditingEnabled: boolean;
  readonly appliedBrand: { readonly brandId: EntityId<"brand">; readonly revision: string } | null;
}
export type BrandPropagation = { readonly kind: "all" } | { readonly kind: "selected"; readonly serviceIds: NonEmpty<EntityId<"service">> } | { readonly kind: "none" };

/** Integer minor units (RSD para). Legacy whole-RSD adapters must multiply by 100 explicitly. */
export interface Money { readonly amountMinor: number; readonly currency: string }
export interface Period { readonly start: Timestamp; readonly end: Timestamp }
export type SubscriptionTarget =
  | { readonly kind: "account_premium"; readonly accountId: EntityId<"account"> }
  | { readonly kind: "service_instance"; readonly serviceInstanceId: EntityId<"service"> };
export type PriceBasis =
  | { readonly kind: "standard" }
  | { readonly kind: "founders"; readonly validity: { readonly kind: "lifetime" } | { readonly kind: "until"; readonly endsAt: Timestamp } }
  | { readonly kind: "enterprise" | "individual"; readonly agreementId: EntityId<"priceAgreement"> };
export interface PriceSnapshot {
  readonly reference: Money;
  readonly effective: Money;
  readonly basis: PriceBasis;
  readonly capturedAt: Timestamp;
  readonly discountIds: readonly EntityId<"discount">[];
}
export type SubscriptionCycle =
  | { readonly kind: "inactive" }
  | {
      readonly kind: "running";
      readonly currentPeriodStart: Timestamp;
      readonly paidThrough: Timestamp;
      readonly graceEndsAt: Timestamp;
      readonly cancelAtPeriodEnd: boolean;
      readonly cancellation: Change | null;
      readonly suspension: Change | null;
    };
export interface Subscription extends RecordBase<"subscription"> {
  readonly accountId: EntityId<"account">;
  readonly target: SubscriptionTarget;
  readonly period: BillingPeriod;
  readonly cycle: SubscriptionCycle;
  readonly price: PriceSnapshot;
  readonly renewal: { readonly kind: "manual" } | { readonly kind: "automatic"; readonly setupReference: string };
  readonly lastOverride: Change | null;
}
export interface PriceAgreement extends RecordBase<"priceAgreement"> {
  readonly accountId: EntityId<"account">;
  readonly target: SubscriptionTarget;
  readonly period: BillingPeriod;
  readonly basis: PriceBasis;
  readonly price: Money;
  readonly change: Change;
}
export type DiscountRule = {
  readonly id: EntityId<"discount">;
  readonly accountId: EntityId<"account">;
  readonly targets: NonEmpty<SubscriptionTarget>;
  readonly change: Change;
} & (
  | { readonly kind: "friend_waiver"; readonly tagId: EntityId<"tag"> }
  | { readonly kind: "referral_discount"; readonly referralId: EntityId<"referral">; readonly terms: ReferralTerms }
);
// No default rate, amount or duration. They must be supplied by an explicit agreement.
export type ReferralTerms =
  | { readonly kind: "unconfigured" }
  | { readonly kind: "configured"; readonly discount: { readonly kind: "fixed"; readonly amount: Money } | { readonly kind: "percentage"; readonly basisPoints: number }; readonly validFrom: Timestamp; readonly validUntil: Timestamp | null };
export type Referral = {
  readonly id: EntityId<"referral">;
  readonly referrerAccountId: EntityId<"account">;
  readonly referredAccountId: EntityId<"account">;
  readonly terms: ReferralTerms;
} & (
  | { readonly status: "pending" }
  | { readonly status: "qualified"; readonly qualifyingPaymentId: EntityId<"payment"> }
  | { readonly status: "rewarded"; readonly qualifyingPaymentId: EntityId<"payment">; readonly discountId: EntityId<"discount">; readonly terms: Extract<ReferralTerms, { kind: "configured" }> }
  | { readonly status: "cancelled"; readonly change: Change }
);
export interface Payment {
  readonly id: EntityId<"payment">;
  readonly accountId: EntityId<"account">;
  readonly amount: Money;
  readonly paidAt: Timestamp;
  readonly method: PaymentMethod;
  readonly provider: string | null;
  readonly reference: string | null;
  readonly recordedBy: Actor;
  readonly recordedAt: Timestamp;
  readonly unallocated: Money;
}
export type AllocationTarget =
  | { readonly kind: "subscription"; readonly subscriptionId: EntityId<"subscription">; readonly period: Period }
  | { readonly kind: "order"; readonly orderId: EntityId<"order">; readonly orderLineId: EntityId<"orderLine"> | null };
export interface PaymentAllocation {
  readonly id: EntityId<"allocation">;
  readonly paymentId: EntityId<"payment">;
  readonly target: AllocationTarget;
  readonly amount: Money;
  readonly price: PriceSnapshot;
}
/** Separate append-only compensation; never rewrite the original payment or allocation. */
export type PaymentAdjustment = {
  readonly id: EntityId<"adjustment">;
  readonly paymentId: EntityId<"payment">;
  readonly change: Change;
} & (
  | { readonly kind: "void" }
  | { readonly kind: "refund"; readonly amount: Money; readonly allocationIds: NonEmpty<EntityId<"allocation">> }
);

export interface Order extends RecordBase<"order"> {
  readonly accountId: EntityId<"account">;
  readonly code: HumanCode<"order">;
  readonly venueIds: NonEmpty<EntityId<"venue">>;
  readonly paymentStatus: (typeof ORDER_PAYMENT_STATUSES)[number];
  readonly designStatus: (typeof ORDER_DESIGN_STATUSES)[number];
  readonly fulfillmentStatus: (typeof ORDER_FULFILLMENT_STATUSES)[number];
  readonly assigneeId: EntityId<"user">;
  readonly priority: Priority;
  readonly note: string;
  readonly archived: boolean;
}
export interface PhysicalConfiguration {
  readonly orientation?: Orientation;
  readonly shape?: ProductShape;
  readonly background?: ProductBackground;
  readonly finish?: ProductFinish;
  readonly material: ProductMaterial | "paper" | "pvc" | "wood" | "glass";
  readonly woodType?: WoodType;
  readonly dimension: ProductDimension;
}
export type DesignSnapshot = {
  readonly assetId: string;
  readonly capturedAt: Timestamp;
} & ({ readonly kind: "template"; readonly templateId: string; readonly templateName: string } | { readonly kind: "custom" });
export interface OrderLine {
  readonly id: EntityId<"orderLine">;
  readonly orderId: EntityId<"order">;
  readonly venueId: EntityId<"venue">;
  readonly product: ProductType;
  readonly quantity: number;
  readonly configuration: PhysicalConfiguration;
  readonly serviceIds: NonEmpty<EntityId<"service">>;
  readonly design: DesignSnapshot;
  readonly unitPrice: PriceSnapshot;
  readonly total: Money;
}
export interface PrintJob {
  readonly id: EntityId<"printJob">;
  readonly orderId: EntityId<"order">;
  readonly printerId: EntityId<"printer">;
  readonly productIds: NonEmpty<EntityId<"physicalProduct">>;
  readonly shipTo: "scanme_team";
  readonly sent: Change | null;
  readonly expectedReturnAt: Timestamp | null;
  readonly received: Change | null;
}
export type Delivery = {
  readonly id: EntityId<"delivery">;
  readonly orderId: EntityId<"order">;
  readonly productIds: NonEmpty<EntityId<"physicalProduct">>;
  readonly status: "preparing" | "in_delivery" | "delivered";
  readonly prepared: Change;
  readonly handedOver: Change | null;
  readonly delivered: Change | null;
  readonly proof: string | null;
} & ({ readonly method: "courier"; readonly shippingPayer: "client_to_courier" } | { readonly method: "personal"; readonly shippingPayer: "none" });

export type Channel<K extends "qr" | "nfc"> = {
  readonly id: EntityId<"channel">;
  readonly kind: K;
  readonly resolverToken: string;
  readonly redirectEnabled: boolean;
  readonly health: TechnicalHealth;
  readonly lastChange: Change;
};
export type PhysicalChannels =
  | { readonly qr: Channel<"qr">; readonly nfc: Channel<"nfc"> | null }
  | { readonly qr: null; readonly nfc: Channel<"nfc"> };
export interface PhysicalProduct extends RecordBase<"physicalProduct"> {
  readonly venueId: EntityId<"venue">;
  readonly orderId: EntityId<"order">;
  readonly orderLineId: EntityId<"orderLine">;
  readonly code: HumanCode<"physicalProduct">;
  readonly localSuffix: string;
  readonly product: ProductType;
  readonly configuration: PhysicalConfiguration;
  readonly design: DesignSnapshot;
  readonly serviceIds: NonEmpty<EntityId<"service">>;
  readonly lifecycle: "assigned" | "in_production" | "received" | "qc_failed" | "ready" | "delivered" | "retired";
  readonly channels: PhysicalChannels;
  // Exactly one source of the current destination, shared by QR and NFC.
  readonly destinationId: EntityId<"destination"> | null;
  readonly placementId: EntityId<"placement"> | null;
  readonly produced: Change | null;
  readonly received: Change | null;
  readonly qualityControl: ({ readonly result: "passed" | "failed" } & Change) | null;
  readonly activated: Change | null;
}
export type DigitalQr = {
  readonly id: EntityId<"digitalQr">;
  readonly accountId: EntityId<"account">;
  readonly venueId: EntityId<"venue"> | null;
  readonly code: HumanCode<"digitalQr">;
} & (
  | { readonly binding: "digital"; readonly channel: Channel<"qr">; readonly destinationId: EntityId<"destination"> | null }
  | { readonly binding: "physical"; readonly physicalProductId: EntityId<"physicalProduct">; readonly channelId: EntityId<"channel">; readonly linked: Change }
);
export type Destination = {
  readonly id: EntityId<"destination">;
  readonly venueId: EntityId<"venue">;
} & (
  | { readonly kind: "service" | "links_splitter"; readonly serviceId: EntityId<"service"> }
  | { readonly kind: "generic_splitter"; readonly serviceIds: NonEmpty<EntityId<"service">> }
  | { readonly kind: "dynamic_url"; readonly url: string }
);
export interface DestinationHistory {
  readonly subject: { readonly kind: "physicalProduct"; readonly id: EntityId<"physicalProduct"> } | { readonly kind: "digitalQr"; readonly id: EntityId<"digitalQr"> };
  readonly previousId: EntityId<"destination"> | null;
  readonly destinationId: EntityId<"destination">;
  readonly change: Change;
}
export interface Placement {
  readonly id: EntityId<"placement">;
  readonly venueId: EntityId<"venue">;
  readonly name: string;
}
export interface PlacementPeriod {
  readonly id: EntityId<"placementPeriod">;
  readonly productId: EntityId<"physicalProduct">;
  readonly placementId: EntityId<"placement">;
  readonly started: Change;
  readonly endedAt: Timestamp | null;
}
export interface ChannelMetric {
  readonly channelId: EntityId<"channel">;
  readonly placementPeriodId: EntityId<"placementPeriod"> | null;
  readonly occurredAt: Timestamp;
  readonly count: number;
}

export type Priority = "low" | "normal" | "high" | "urgent";
export interface Conversation extends RecordBase<"conversation"> {
  readonly accountId: EntityId<"account">;
  readonly contactId: EntityId<"contact">;
  readonly venueId: EntityId<"venue"> | null;
  readonly subject: EntityRef | null;
  readonly channel: ConversationChannel;
  readonly status: ConversationStatus;
  readonly assigneeId: EntityId<"user"> | null;
}
export interface Attachment { readonly assetId: string; readonly fileName: string; readonly mimeType: string; readonly sizeBytes: number }
export type Message = {
  readonly id: EntityId<"message">;
  readonly conversationId: EntityId<"conversation">;
  readonly channel: ConversationChannel;
  readonly author: Actor;
  readonly rawBody: string;
  readonly preview: string;
  readonly attachments: readonly Attachment[];
  readonly providerMessageId: string | null;
  readonly createdAt: Timestamp;
} & (
  | { readonly direction: "inbound"; readonly receipt: null }
  | { readonly direction: "outbound"; readonly receipt: { readonly visibility: "admin_only"; readonly status: "sent" | "delivered" | "read" } | null }
);
export type DueDate = { readonly kind: "date"; readonly date: string; readonly timeZone: "Europe/Belgrade" } | { readonly kind: "instant"; readonly at: Timestamp };
export interface Deferral { readonly change: Change; readonly until: Timestamp }
export interface ClientTask extends RecordBase<"task"> {
  readonly accountId: EntityId<"account">;
  readonly contactId: EntityId<"contact"> | null;
  readonly venueId: EntityId<"venue"> | null;
  readonly subject: EntityRef | null;
  readonly title: string;
  readonly description: string;
  readonly assigneeId: EntityId<"user">;
  readonly participantIds: readonly EntityId<"user">[];
  readonly priority: Priority;
  readonly due: DueDate | null;
  readonly status: TaskStatus;
  readonly deferral: Deferral | null;
}
export interface ActionItem extends RecordBase<"actionItem"> {
  readonly stableCauseId: string;
  readonly source: {
    readonly domain: ActionSourceDomain;
    readonly recordId: string;
    readonly causeKind: string;
  };
  readonly accountId: EntityId<"account">;
  readonly venueId: EntityId<"venue"> | null;
  readonly serviceId: EntityId<"service"> | null;
  readonly productRef: string | null;
  readonly severity: ActionSeverity;
  readonly state: ActionState;
  readonly assigneeId: EntityId<"user"> | null;
  readonly due: DueDate | null;
  readonly priority: {
    readonly class: ActionPriorityClass;
    readonly relevantAt: Timestamp;
  };
  readonly snooze: {
    readonly until: Timestamp;
    readonly reason: string;
    readonly changedBy: EntityId<"user">;
  } | null;
  readonly resolutionContext: {
    readonly kind: "source_record";
    readonly href: string | null;
  };
  readonly resolutionRule: "source_fact_changed" | "manual_problem_resolution";
  readonly resolution: {
    readonly at: Timestamp;
    readonly actor: Actor;
    readonly note: string | null;
  } | null;
}

/** Operation-specific details, never opaque JSON, full messages or auth/session data. */
export interface AuditDetails {
  "account.created": { readonly accountId: EntityId<"account"> };
  "entity.archived": { readonly before: AccountStatus; readonly after: AccountStatus };
  "contact.default_changed": { readonly before: EntityId<"contact">; readonly after: EntityId<"contact"> };
  "member.role_changed": { readonly before: ClientRole; readonly after: ClientRole };
  "brand.propagated": { readonly brandId: EntityId<"brand">; readonly selection: BrandPropagation };
  "subscription.period_changed": { readonly before: SubscriptionCycle; readonly after: SubscriptionCycle };
  "subscription.grace_changed": { readonly before: Timestamp; readonly after: Timestamp };
  "subscription.cancelled": { readonly atPeriodEnd: boolean };
  "subscription.suspended": { readonly suspended: boolean };
  "price.changed": { readonly before: PriceSnapshot; readonly after: PriceSnapshot };
  "payment.recorded": { readonly amount: Money };
  "payment.voided": { readonly paymentId: EntityId<"payment"> };
  "payment.refunded": { readonly paymentId: EntityId<"payment">; readonly amount: Money };
  "channel.changed": { readonly channelId: EntityId<"channel">; readonly enabled: boolean; readonly health: TechnicalHealth };
  "destination.retargeted": { readonly productIds: NonEmpty<EntityId<"physicalProduct">>; readonly before: readonly EntityId<"destination">[]; readonly after: EntityId<"destination"> };
  "placement.changed": { readonly before: EntityId<"placement"> | null; readonly after: EntityId<"placement"> };
  "order.phase_changed": { readonly payment: Order["paymentStatus"]; readonly design: Order["designStatus"]; readonly fulfillment: Order["fulfillmentStatus"] };
  "product.qc_recorded": { readonly result: "passed" | "failed" };
  "delivery.recorded": { readonly deliveryId: EntityId<"delivery">; readonly status: Delivery["status"] };
  "conversation.changed": { readonly before: ConversationStatus; readonly after: ConversationStatus };
  "message.sent": { readonly messageId: EntityId<"message"> };
  "task.changed": { readonly before: TaskStatus; readonly after: TaskStatus };
  "item.deferred": { readonly until: Timestamp };
  "problem.resolved": { readonly source: EntityRef };
}
export type AuditAction = keyof AuditDetails;
export type AuditEvent = { [A in AuditAction]: {
  readonly id: EntityId<"audit">;
  readonly accountId: EntityId<"account">;
  readonly venueId: EntityId<"venue"> | null;
  readonly subject: EntityRef;
  readonly action: A;
  readonly detail: AuditDetails[A];
  readonly change: Change;
} }[AuditAction];

export type RevenueFilter = "total" | "physical" | "saas" | "premium" | ServiceType;
export type ProfitFilter = "total" | "physical" | "saas" | "premium";
export type KnownCost = { readonly kind: "known"; readonly amount: Money } | { readonly kind: "not_entered" };
export interface DirectCosts { readonly production: KnownCost; readonly hosting: KnownCost; readonly backend: KnownCost }
