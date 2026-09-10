/** Synthetic, deterministic ADMIN-01 data. Never seed a deployment with this module.
 * Every amount is test arithmetic, NOT a proposed price, tariff or referral policy.
 */
import { BILLING_WINDOWS, formatHumanCode, type BillingPeriod, type ServiceType } from "./catalog";
import type {
  AccountTag, ActionItem, Actor, AuditEvent, Brand, Change, Channel, ChannelMetric, ClientAccount,
  ClientMember, ClientTask, Contact, Conversation, Delivery, Destination, DestinationHistory,
  DigitalQr, DiscountRule, EntityId, EntityKind, LegalEntity, Message, Money, Order, OrderLine,
  Payment, PaymentAdjustment, PaymentAllocation, PhysicalProduct, Placement, PlacementPeriod,
  PriceAgreement, PriceSnapshot, PrintJob, Referral, ServiceInstance, Subscription, Venue, VenueGroup,
} from "./contracts";
import { DAY_MS } from "./rules";

// The only unchecked conversion is the explicit fixture-ID boundary, not business data.
export const fixtureId = <K extends EntityKind>(kind: K, suffix: string): EntityId<K> => `fixture:${kind}:${suffix}` as EntityId<K>;
export const at = (isoDate: string): number => Date.parse(`${isoDate}T10:00:00Z`);
export const AS_OF = at("2026-09-10");
const createdAt = at("2025-01-01");
const base = <K extends EntityKind>(kind: K, suffix: string) => ({ id: fixtureId(kind, suffix), createdAt, updatedAt: AS_OF });
export const testMoney = (amountMinor: number): Money => ({ amountMinor, currency: "RSD" });
export const adminActor: Actor = { kind: "admin", userId: fixtureId("user", "admin") };
const change = (reason: string, time = AS_OF): Change => ({ actor: adminActor, at: time, reason });
const snapshot = (amountMinor: number): PriceSnapshot => ({ reference: testMoney(amountMinor), effective: testMoney(amountMinor), basis: { kind: "standard" }, capturedAt: createdAt, discountIds: [] });
const accountId = fixtureId("account", "main");

export const account: ClientAccount = {
  ...base("account", "main"), code: formatHumanCode("account", ["TEST1"]), ownerDisplayName: "Test Vlasnik",
  status: "active", primaryOwnerMemberId: fixtureId("member", "owner"), defaultContactId: fixtureId("contact", "owner"),
};
export const contacts: readonly Contact[] = [
  { ...base("contact", "owner"), accountId, firstName: "Test", lastName: "Vlasnik", email: "owner@example.invalid", phone: null, position: "Vlasnik", isOwner: true, status: "active" },
  { ...base("contact", "finance"), accountId, firstName: "Test", lastName: "Finansije", email: "finance@example.invalid", phone: null, position: "Finansije", isOwner: false, status: "active" },
  { ...base("contact", "venue"), accountId, firstName: "Test", lastName: "Lokal", email: null, phone: "TEST-PHONE", position: "Menadžer", isOwner: false, status: "inactive" },
];
export const legalEntities: readonly LegalEntity[] = ["one", "two"].map((suffix) => ({
  ...base("legalEntity", suffix), accountId, name: `Test firma ${suffix}`, taxId: null, registrationNumber: null, address: "Test adresa",
}));
export const brands: readonly Brand[] = ["one", "two"].map((suffix) => ({
  ...base("brand", suffix), accountId, name: `Test brend ${suffix}`, revision: "fixture-r1", logoAssetId: null, colors: ["#172A20"],
}));
export const groups: readonly VenueGroup[] = ["one", "two"].map((suffix) => ({ ...base("venueGroup", suffix), accountId, name: `Test grupa ${suffix}` }));
export const venues: readonly Venue[] = [1, 2, 3, 4].map((number) => ({
  ...base("venue", String(number)), accountId, code: formatHumanCode("venue", ["TEST", String(number)]),
  name: number <= 2 ? "Isti test naziv" : `Test lokal ${number}`, city: "Test grad", address: "Test adresa",
  status: "active", legalEntityId: legalEntities[number % 2].id, brandId: brands[number % 2].id,
  groupId: groups[number % 2].id, defaultContactOverrideId: number === 4 ? contacts[1].id : null,
}));
export const members: readonly ClientMember[] = [
  { ...base("member", "owner"), accountId, userId: fixtureId("user", "owner"), contactId: contacts[0].id, role: "full_access", active: true, venueScope: { kind: "all" }, canBuyServices: true, canBuyPremium: true },
  { ...base("member", "co-owner"), accountId, userId: fixtureId("user", "co-owner"), contactId: null, role: "full_access", active: true, venueScope: { kind: "all" }, canBuyServices: true, canBuyPremium: true },
  { ...base("member", "manager"), accountId, userId: fixtureId("user", "manager"), contactId: null, role: "venue_management", active: true, venueScope: { kind: "selected", venueIds: [venues[3].id] }, canBuyServices: true, canBuyPremium: false },
  { ...base("member", "finance"), accountId, userId: fixtureId("user", "finance"), contactId: contacts[1].id, role: "finance", active: true, venueScope: { kind: "all" }, canBuyServices: true, canBuyPremium: true },
  { ...base("member", "viewer"), accountId, userId: fixtureId("user", "viewer"), contactId: null, role: "view_only", active: true, venueScope: { kind: "all" }, canBuyServices: false, canBuyPremium: false },
];
const service = (suffix: string, venue: Venue, type: ServiceType): ServiceInstance => ({
  ...base("service", suffix), venueId: venue.id, type, activation: "owned", configuration: "published",
  health: { status: "healthy", checkedAt: AS_OF }, clientEditingEnabled: true,
  appliedBrand: { brandId: venue.brandId ?? brands[0].id, revision: "fixture-r1" },
});
export const services: readonly ServiceInstance[] = [
  service("monthly-1", venues[0], "scanme_links"), service("monthly-2", venues[1], "scanme_links"),
  service("monthly-3", venues[2], "scanme_links"), service("annual-links", venues[3], "scanme_links"),
  service("annual-review", venues[3], "scanme_review"), service("annual-menu", venues[3], "scanme_menu"),
];
const subscription = (suffix: string, period: BillingPeriod, start: string, end: string, serviceInstance?: ServiceInstance): Subscription => ({
  ...base("subscription", suffix), accountId,
  target: serviceInstance ? { kind: "service_instance", serviceInstanceId: serviceInstance.id } : { kind: "account_premium", accountId },
  period, cycle: { kind: "running", currentPeriodStart: at(start), paidThrough: at(end), graceEndsAt: at(end) + BILLING_WINDOWS[period].graceDays * DAY_MS, cancelAtPeriodEnd: false, cancellation: null, suspension: null },
  price: snapshot(serviceInstance ? (period === "monthly" ? 12_000 : 24_000) : 15_000),
  renewal: { kind: "manual" }, lastOverride: null,
});
export const subscriptions: readonly Subscription[] = [
  subscription("monthly-1", "monthly", "2026-08-20", "2026-09-20", services[0]),
  subscription("monthly-2", "monthly", "2026-08-07", "2026-09-07", services[1]),
  subscription("monthly-3", "monthly", "2026-07-31", "2026-08-31", services[2]),
  subscription("annual-links", "annual", "2026-02-02", "2027-02-02", services[3]),
  subscription("annual-review", "annual", "2025-09-03", "2026-09-03", services[4]),
  subscription("annual-menu", "annual", "2025-08-10", "2026-08-10", services[5]),
  subscription("premium", "monthly", "2026-08-12", "2026-09-12"),
];
export const partialPayment: Payment = {
  id: fixtureId("payment", "partial"), accountId, amount: testMoney(38_000), paidAt: AS_OF,
  method: "bank_transfer", provider: null, reference: "TEST-PARTIAL", recordedBy: adminActor, recordedAt: AS_OF, unallocated: testMoney(5_000),
};
export const partialAllocations: readonly PaymentAllocation[] = [
  { id: fixtureId("allocation", "monthly"), paymentId: partialPayment.id, target: { kind: "subscription", subscriptionId: subscriptions[1].id, period: { start: at("2026-09-07"), end: at("2026-10-07") } }, amount: testMoney(12_000), price: subscriptions[1].price },
  { id: fixtureId("allocation", "annual-partial"), paymentId: partialPayment.id, target: { kind: "subscription", subscriptionId: subscriptions[4].id, period: { start: at("2026-09-03"), end: at("2027-09-03") } }, amount: testMoney(6_000), price: subscriptions[4].price },
  { id: fixtureId("allocation", "premium"), paymentId: partialPayment.id, target: { kind: "subscription", subscriptionId: subscriptions[6].id, period: { start: at("2026-09-12"), end: at("2026-10-12") } }, amount: testMoney(15_000), price: subscriptions[6].price },
];
export const adjustments: readonly PaymentAdjustment[] = [
  { id: fixtureId("adjustment", "void"), paymentId: partialPayment.id, kind: "void", change: change("Test: pogrešan unos") },
  { id: fixtureId("adjustment", "refund"), paymentId: fixtureId("payment", "order"), kind: "refund", amount: testMoney(4_000), allocationIds: [fixtureId("allocation", "order-1")], change: change("Test: refundacija jednog komada") },
];

export const friendTag: AccountTag = { ...base("tag", "friend"), accountId, tag: { kind: "friend" } };
export const friendWaiver: DiscountRule = { id: fixtureId("discount", "friend"), accountId, kind: "friend_waiver", tagId: friendTag.id, targets: [subscriptions[0].target, subscriptions[6].target], change: change("Test: izabrana usluga i Premium") };
export const individualPrice: PriceAgreement = {
  ...base("priceAgreement", "individual"), accountId, target: subscriptions[2].target, period: "monthly",
  basis: { kind: "individual", agreementId: fixtureId("priceAgreement", "individual") }, price: testMoney(10_000), change: change("Test: individualni dogovor"),
};
export const individualSubscription: Subscription = { ...subscriptions[2], price: { ...subscriptions[2].price, effective: individualPrice.price, basis: individualPrice.basis } };
// Separate related party, outside the one-client/four-venue scenario.
export const referrerContact: Contact = { ...contacts[0], ...base("contact", "referrer"), accountId: fixtureId("account", "referrer") };
export const referrerMember: ClientMember = { ...members[0], ...base("member", "referrer"), accountId: referrerContact.accountId, userId: fixtureId("user", "referrer"), contactId: referrerContact.id };
export const referrerAccount: ClientAccount = { ...account, ...base("account", "referrer"), code: formatHumanCode("account", ["REFERRER"]), defaultContactId: referrerContact.id, primaryOwnerMemberId: referrerMember.id };
export const referral: Referral = { id: fixtureId("referral", "one"), referrerAccountId: referrerAccount.id, referredAccountId: account.id, status: "pending", terms: { kind: "unconfigured" } };
export const qualifiedReferral: Referral = { ...referral, status: "qualified", qualifyingPaymentId: partialPayment.id };
export const referralDiscount: DiscountRule = { id: fixtureId("discount", "referral"), accountId: referrerAccount.id, kind: "referral_discount", referralId: referral.id, targets: [{ kind: "account_premium", accountId: referrerAccount.id }], terms: { kind: "unconfigured" }, change: change("Test: cilj buduće nagrade, uslovi još nisu određeni") };

export const order: Order = {
  ...base("order", "one"), accountId, code: formatHumanCode("order", ["TEST1"]), venueIds: [venues[3].id],
  paymentStatus: "paid", designStatus: "approved", fulfillmentStatus: "ready_for_delivery", assigneeId: fixtureId("user", "admin"), priority: "normal", note: "Sintetička porudžbina", archived: false,
};
export const orderLines: readonly OrderLine[] = [
  { id: fixtureId("orderLine", "1"), orderId: order.id, venueId: venues[3].id, product: "stickers", quantity: 50,
    configuration: { material: "paper", dimension: "small", shape: "square" }, serviceIds: [services[3].id, services[4].id, services[5].id],
    design: { kind: "template", templateId: "test-template", templateName: "Test šablon", assetId: "fixture:asset:template", capturedAt: createdAt }, unitPrice: snapshot(4_000), total: testMoney(200_000) },
  { id: fixtureId("orderLine", "2"), orderId: order.id, venueId: venues[3].id, product: "compact-stand", quantity: 2,
    configuration: { material: "acrylic", dimension: "a5", orientation: "portrait" }, serviceIds: [services[4].id, services[5].id],
    design: { kind: "custom", assetId: "fixture:asset:custom", capturedAt: createdAt }, unitPrice: snapshot(15_000), total: testMoney(30_000) },
];
export const orderPayment: Payment = { ...partialPayment, id: fixtureId("payment", "order"), amount: testMoney(230_000), unallocated: testMoney(0), reference: "TEST-ORDER" };
export const orderAllocations: readonly PaymentAllocation[] = orderLines.map((line, index) => ({
  id: fixtureId("allocation", `order-${index + 1}`), paymentId: orderPayment.id, target: { kind: "order", orderId: order.id, orderLineId: line.id }, amount: line.total, price: line.unitPrice,
}));
const channel = <K extends "qr" | "nfc">(kind: K, suffix: string): Channel<K> => ({
  id: fixtureId("channel", `${kind}-${suffix}`), kind, resolverToken: `test-${kind}-${suffix}`,
  redirectEnabled: true, health: { status: "healthy", checkedAt: AS_OF }, lastChange: change("Test: QC aktivacija"),
});
export const destinations: readonly Destination[] = [
  { id: fixtureId("destination", "links"), venueId: venues[3].id, kind: "links_splitter", serviceId: services[3].id },
  { id: fixtureId("destination", "generic"), venueId: venues[3].id, kind: "generic_splitter", serviceIds: [services[4].id, services[5].id] },
  { id: fixtureId("destination", "direct"), venueId: venues[3].id, kind: "service", serviceId: services[4].id },
];
export const placements: readonly Placement[] = [
  { id: fixtureId("placement", "old"), venueId: venues[3].id, name: "Sto 4" },
  { id: fixtureId("placement", "current"), venueId: venues[3].id, name: "Terasa" },
];
export const physicalProducts: readonly PhysicalProduct[] = orderLines.flatMap((line, lineIndex) => Array.from({ length: line.quantity }, (_, index): PhysicalProduct => {
  const suffix = String(lineIndex * 50 + index + 1).padStart(3, "0");
  const qr = channel("qr", suffix);
  const nfc = channel("nfc", suffix);
  return {
    ...base("physicalProduct", suffix), venueId: line.venueId, orderId: order.id, orderLineId: line.id,
    code: formatHumanCode("physicalProduct", ["TEST4", suffix]), localSuffix: suffix,
    product: line.product, configuration: line.configuration, design: line.design, serviceIds: line.serviceIds,
    lifecycle: "ready", channels: { qr, nfc }, destinationId: destinations[lineIndex].id, placementId: placements[1].id,
    produced: change("Test: izrađeno"), received: change("Test: primljeno kod ScanMe tima"), qualityControl: { ...change("Test: QC uspešan"), result: "passed" }, activated: change("Test: aktivirano posle QC"),
  };
}));
const first = physicalProducts[0];
export const channelScenarios: Readonly<Record<"active" | "inactive" | "problem" | "qr_only" | "nfc_only" | "missing_destination", PhysicalProduct>> = {
  active: first,
  inactive: { ...first, channels: { qr: { ...channel("qr", "inactive"), redirectEnabled: false }, nfc: channel("nfc", "inactive") } },
  problem: { ...first, channels: { qr: channel("qr", "problem"), nfc: { ...channel("nfc", "problem"), health: { status: "problem", checkedAt: AS_OF, reason: "Test: NFC kvar" } } } },
  qr_only: { ...first, channels: { qr: channel("qr", "only"), nfc: null } },
  nfc_only: { ...first, channels: { qr: null, nfc: channel("nfc", "only") } },
  missing_destination: { ...first, destinationId: null },
};
export const digitalQr: DigitalQr = { id: fixtureId("digitalQr", "one"), accountId, venueId: venues[3].id, code: formatHumanCode("digitalQr", ["TEST1"]), binding: "digital", channel: channel("qr", "digital"), destinationId: destinations[2].id };
export const linkedDigitalQr: DigitalQr = { id: digitalQr.id, accountId, venueId: digitalQr.venueId, code: digitalQr.code, binding: "physical", physicalProductId: first.id, channelId: channel("qr", "digital").id, linked: change("Test: digitalni QR vezan za komad") };
export const productWithFormerDigitalQr: PhysicalProduct = { ...first, channels: { qr: digitalQr.channel, nfc: first.channels.nfc } };
export const destinationHistory: readonly DestinationHistory[] = [
  { subject: { kind: "physicalProduct", id: first.id }, previousId: null, destinationId: destinations[2].id, change: change("Test: prva destinacija", at("2026-09-01")) },
  { subject: { kind: "physicalProduct", id: first.id }, previousId: destinations[2].id, destinationId: first.destinationId ?? destinations[0].id, change: change("Test: dodate usluge") },
];
export const placementHistory: readonly PlacementPeriod[] = [
  { id: fixtureId("placementPeriod", "old"), productId: first.id, placementId: placements[0].id, started: change("Test: prvobitna pozicija", at("2026-09-01")), endedAt: AS_OF },
  { id: fixtureId("placementPeriod", "current"), productId: first.id, placementId: placements[1].id, started: change("Test: premeštanje"), endedAt: null },
];
export const channelMetrics: readonly ChannelMetric[] = [
  { channelId: channel("qr", "001").id, placementPeriodId: placementHistory[0].id, occurredAt: at("2026-09-02"), count: 12 },
  { channelId: channel("qr", "001").id, placementPeriodId: placementHistory[1].id, occurredAt: AS_OF, count: 3 },
  { channelId: channel("nfc", "001").id, placementPeriodId: placementHistory[1].id, occurredAt: AS_OF, count: 2 },
];
export const printJob: PrintJob = { id: fixtureId("printJob", "one"), orderId: order.id, printerId: fixtureId("printer", "one"), productIds: [first.id, ...physicalProducts.slice(1).map((product) => product.id)], shipTo: "scanme_team", sent: change("Test: poslato"), expectedReturnAt: AS_OF, received: change("Test: ScanMe prijem") };
export const deliveries: readonly Delivery[] = [
  { id: fixtureId("delivery", "one"), orderId: order.id, productIds: [first.id, ...physicalProducts.slice(1, 50).map((product) => product.id)], method: "courier", shippingPayer: "client_to_courier", status: "preparing", prepared: change("Test: paket 1"), handedOver: null, delivered: null, proof: null },
  { id: fixtureId("delivery", "two"), orderId: order.id, productIds: [physicalProducts[50].id, physicalProducts[51].id], method: "personal", shippingPayer: "none", status: "preparing", prepared: change("Test: paket 2"), handedOver: null, delivered: null, proof: null },
];

export const conversation: Conversation = { ...base("conversation", "one"), accountId, contactId: contacts[0].id, venueId: venues[3].id, subject: { kind: "order", id: order.id }, channel: "panel_chat", status: "needs_reply", assigneeId: fixtureId("user", "admin") };
export const messages: readonly Message[] = [
  { id: fixtureId("message", "in"), conversationId: conversation.id, channel: "panel_chat", author: { kind: "client", userId: members[0].userId }, rawBody: "Test: upit o porudžbini", preview: "Test: upit o porudžbini", attachments: [], providerMessageId: null, createdAt: AS_OF, direction: "inbound", receipt: null },
  { id: fixtureId("message", "out"), conversationId: conversation.id, channel: "panel_chat", author: adminActor, rawBody: "Test: odgovor", preview: "Test: odgovor", attachments: [], providerMessageId: null, createdAt: AS_OF, direction: "outbound", receipt: { visibility: "admin_only", status: "delivered" } },
];
export const task: ClientTask = { ...base("task", "one"), accountId, contactId: contacts[0].id, venueId: venues[3].id, subject: { kind: "delivery", id: deliveries[0].id }, title: "Test: proveri isporuku", description: "Sintetički klijentski zadatak", assigneeId: fixtureId("user", "admin"), participantIds: [], priority: "high", due: { kind: "date", date: "2026-09-12", timeZone: "Europe/Belgrade" }, status: "deferred", deferral: { change: change("Test: dogovoreno sa klijentom"), until: at("2026-09-12") } };
export const actionItem: ActionItem = { id: fixtureId("actionItem", "subscription"), accountId, cause: { kind: "subscription", subscriptionId: subscriptions[1].id, condition: "grace" }, severity: "warning", assigneeId: fixtureId("user", "admin"), resolutionTarget: { kind: "subscription", id: subscriptions[1].id }, resolutionRule: "source_fact_changed", state: "open", deferral: null };
export const auditEvents: readonly AuditEvent[] = [
  { id: fixtureId("audit", "void"), accountId, venueId: null, subject: { kind: "payment", id: partialPayment.id }, action: "payment.voided", detail: { paymentId: partialPayment.id }, change: adjustments[0].change },
  { id: fixtureId("audit", "defer"), accountId, venueId: venues[3].id, subject: { kind: "task", id: task.id }, action: "item.deferred", detail: { until: at("2026-09-12") }, change: change("Test: dogovoreno sa klijentom") },
];
