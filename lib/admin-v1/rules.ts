/** Pure contract checks/projections. No writes, scheduler, provider or authorization endpoint. */
import { BILLING_WINDOWS, type ChannelStatus, type SubscriptionStatus } from "./catalog";
import type {
  AccountTag, AuditAction, Channel, ClientAccount, ClientMember, Contact, Destination,
  DiscountRule, EntityId, Money, Order, Payment, PaymentAdjustment, PaymentAllocation,
  PhysicalProduct, Referral, ServiceInstance, Subscription, SubscriptionTarget, Venue,
} from "./contracts";

export const DAY_MS = 86_400_000;

export function subscriptionStatus(subscription: Subscription, now: number): SubscriptionStatus {
  const cycle = subscription.cycle;
  if (cycle.kind === "inactive") return "inactive";
  if (cycle.cancellation && cycle.cancellation.at <= now) return "inactive";
  if (cycle.suspension && cycle.suspension.at <= now) return "suspended";
  if (now < cycle.currentPeriodStart) return "inactive";
  if (now < cycle.paidThrough) return "active";
  if (cycle.cancelAtPeriodEnd) return "inactive";
  return now < cycle.graceEndsAt ? "grace" : "suspended";
}

export function renewalWarning(subscription: Subscription, now: number): boolean {
  const cycle = subscription.cycle;
  return cycle.kind === "running" && !cycle.cancelAtPeriodEnd
    && subscriptionStatus(subscription, now) === "active"
    && now >= cycle.paidThrough - BILLING_WINDOWS[subscription.period].warningDays * DAY_MS;
}

export function premiumBadge(subscription: Subscription | null, now: number): "active" | "grace" | null {
  if (!subscription || subscription.target.kind !== "account_premium") return null;
  const status = subscriptionStatus(subscription, now);
  return status === "active" || status === "grace" ? status : null;
}

export function assertMoney(money: Money): void {
  if (!Number.isSafeInteger(money.amountMinor) || money.amountMinor < 0 || !/^[A-Z]{3}$/.test(money.currency)) {
    throw new Error("invalid_money");
  }
}

export function paymentBalance(payment: Payment, allocations: readonly PaymentAllocation[]): number {
  assertMoney(payment.amount);
  assertMoney(payment.unallocated);
  if (payment.unallocated.currency !== payment.amount.currency) throw new Error("currency_mismatch");
  const seen = new Set<EntityId<"allocation">>();
  let allocated = 0;
  for (const allocation of allocations) {
    if (allocation.paymentId !== payment.id) throw new Error("wrong_payment");
    if (seen.has(allocation.id)) throw new Error("duplicate_allocation");
    seen.add(allocation.id);
    assertMoney(allocation.amount);
    if (allocation.amount.currency !== payment.amount.currency) throw new Error("currency_mismatch");
    if (allocation.target.kind === "subscription" && allocation.target.period.start >= allocation.target.period.end) {
      throw new Error("invalid_period");
    }
    allocated += allocation.amount.amountMinor;
  }
  if (!Number.isSafeInteger(allocated)) throw new Error("invalid_money");
  return payment.amount.amountMinor - allocated - payment.unallocated.amountMinor;
}

/** Cash coverage is per target AND period. A partial amount never buys a whole cycle. */
export function periodCoverage(subscription: Subscription, period: { start: number; end: number }, allocations: readonly PaymentAllocation[]): "unpaid" | "partial" | "funded" {
  const matches = allocations.filter((allocation) => allocation.target.kind === "subscription"
    && allocation.target.subscriptionId === subscription.id
    && allocation.target.period.start === period.start && allocation.target.period.end === period.end);
  const amount = matches.reduce((sum, allocation) => {
    assertMoney(allocation.amount);
    if (allocation.amount.currency !== subscription.price.effective.currency) throw new Error("currency_mismatch");
    return sum + allocation.amount.amountMinor;
  }, 0);
  if (amount === 0) return "unpaid"; // Waivers are separate facts, never fake cash payments.
  return amount < subscription.price.effective.amountMinor ? "partial" : "funded";
}

export function sameSubscriptionTarget(a: SubscriptionTarget, b: SubscriptionTarget): boolean {
  return a.kind === "account_premium" && b.kind === "account_premium" ? a.accountId === b.accountId
    : a.kind === "service_instance" && b.kind === "service_instance" && a.serviceInstanceId === b.serviceInstanceId;
}

export function isFriendWaived(accountId: EntityId<"account">, target: SubscriptionTarget, tags: readonly AccountTag[], rules: readonly DiscountRule[]): boolean {
  return rules.some((rule) => rule.kind === "friend_waiver" && rule.accountId === accountId
    && tags.some((tag) => tag.id === rule.tagId && tag.accountId === accountId && tag.tag.kind === "friend")
    && rule.targets.some((candidate) => sameSubscriptionTarget(candidate, target)));
}

export function referralCanQualify(referral: Referral, payments: readonly Payment[], adjustments: readonly PaymentAdjustment[]): boolean {
  return referral.status === "pending" && referral.referrerAccountId !== referral.referredAccountId
    && payments.some((payment) => payment.accountId === referral.referredAccountId && payment.amount.amountMinor > 0
      && !adjustments.some((adjustment) => adjustment.paymentId === payment.id && adjustment.kind === "void"));
}

export function defaultContact(account: ClientAccount, venue: Venue | null, contacts: readonly Contact[]): Contact {
  if (venue && venue.accountId !== account.id) throw new Error("wrong_account");
  const id = venue?.defaultContactOverrideId ?? account.defaultContactId;
  const contact = contacts.find((candidate) => candidate.id === id && candidate.accountId === account.id);
  if (!contact) throw new Error("contact_not_in_account");
  return contact;
}

/** Only the cancellation rule is specified here; this is NOT the future server auth gate. */
export function canCancelService(member: ClientMember, venue: Venue): boolean {
  return member.active && member.accountId === venue.accountId && member.role === "full_access"
    && (member.venueScope.kind === "all" || member.venueScope.venueIds.includes(venue.id));
}

export function channelStatus(channel: Channel<"qr" | "nfc"> | null, destinationExists: boolean): ChannelStatus {
  if (!channel) return "absent";
  if (!destinationExists || channel.health.status !== "healthy") return "problem";
  return channel.redirectEnabled ? "active" : "inactive";
}

export function serviceDestination(services: readonly ServiceInstance[]): Omit<Extract<Destination, { kind: "generic_splitter" }>, "id" | "venueId"> | { kind: "service" | "links_splitter"; serviceId: EntityId<"service"> } {
  const first = services[0];
  if (!first) throw new Error("services_required");
  if (services.some((service) => service.venueId !== first.venueId)) throw new Error("mixed_venues");
  if (new Set(services.map((service) => service.type)).size !== services.length) throw new Error("duplicate_service");
  if (services.length === 1) return { kind: "service", serviceId: first.id };
  const links = services.find((service) => service.type === "scanme_links");
  return links ? { kind: "links_splitter", serviceId: links.id }
    : { kind: "generic_splitter", serviceIds: [first.id, ...services.slice(1).map((service) => service.id)] };
}

export function canAssignSmf(order: Order): boolean {
  return order.paymentStatus === "paid" && order.designStatus === "approved" && order.fulfillmentStatus !== "cancelled";
}

export function canDispatchProduct(product: PhysicalProduct): boolean {
  return product.received !== null && product.qualityControl?.result === "passed" && product.activated !== null
    && product.lifecycle === "ready"
    && [product.channels.qr, product.channels.nfc].every((channel) => !channel || channelStatus(channel, product.destinationId !== null) === "active");
}

// Runtime catalog is exhaustive against the operation-specific AuditDetails union.
export const AUDIT_POLICY = {
  "account.created": { reasonRequired: false },
  "entity.archived": { reasonRequired: true },
  "contact.default_changed": { reasonRequired: false },
  "member.role_changed": { reasonRequired: true },
  "brand.propagated": { reasonRequired: false },
  "subscription.period_changed": { reasonRequired: true },
  "subscription.grace_changed": { reasonRequired: true },
  "subscription.cancelled": { reasonRequired: true },
  "subscription.suspended": { reasonRequired: true },
  "price.changed": { reasonRequired: true },
  "payment.recorded": { reasonRequired: false },
  "payment.voided": { reasonRequired: true },
  "payment.refunded": { reasonRequired: true },
  "channel.changed": { reasonRequired: true },
  "destination.retargeted": { reasonRequired: true },
  "placement.changed": { reasonRequired: false },
  "order.phase_changed": { reasonRequired: false },
  "product.qc_recorded": { reasonRequired: false },
  "delivery.recorded": { reasonRequired: false },
  "conversation.changed": { reasonRequired: false },
  "message.sent": { reasonRequired: false },
  "task.changed": { reasonRequired: false },
  "item.deferred": { reasonRequired: true },
  "problem.resolved": { reasonRequired: true },
} as const satisfies Record<AuditAction, { reasonRequired: boolean }>;

export function assertAuditReason(action: AuditAction, reason: string): void {
  if (AUDIT_POLICY[action].reasonRequired && !reason.trim()) throw new Error("reason_required");
}
