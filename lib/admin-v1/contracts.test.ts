import { describe, expect, expectTypeOf, test } from "vitest";
import { getDict } from "../i18n";
import { offerSr } from "../i18n/sr/offer";
import { PHYSICAL_PRODUCTS } from "../scanme-pricing";
import {
  BILLING_WINDOWS, canonicalService, CLIENT_ROLES, formatHumanCode, parseHumanCode,
  PRODUCT_TYPES, SERVICE_TYPES, SUBSCRIPTION_STATUSES,
} from "./catalog";
import type {
  AuditEvent, BrandPropagation, ClientTask, EntityId, Message, PhysicalChannels, PriceBasis,
  ProfitFilter, Subscription, SubscriptionTarget,
} from "./contracts";
import * as f from "./fixtures";
import {
  assertAuditReason, assertMoney, AUDIT_POLICY, canAssignSmf, canCancelService, canDispatchProduct,
  channelStatus, DAY_MS, defaultContact, isFriendWaived, paymentBalance, periodCoverage,
  premiumBadge, referralCanQualify, renewalWarning, serviceDestination, subscriptionStatus,
} from "./rules";

describe("ADMIN-01 / C01 catalog and identifiers", () => {
  test("one canonical product name feeds the offer and future admin/order consumers", () => {
    const dict = getDict("admin-domain");
    expect(Object.keys(dict.products).sort()).toEqual([...PRODUCT_TYPES].sort());
    expect(PHYSICAL_PRODUCTS.map((product) => product.id).sort()).toEqual([...PRODUCT_TYPES].sort());
    expect(PRODUCT_TYPES.map((id) => dict.products[id])).toEqual([
      "Dvodelni stalak", "Jednodelni stalak", "Nalepnica", "PVC folija", "Premium gravirani stalak",
    ]);
    for (const id of PRODUCT_TYPES) expect(offerSr.products[id].name).toBe(dict.products[id]);
    expect(new Set(Object.values(dict.products)).size).toBe(PRODUCT_TYPES.length);
  });
  test("Review aliases normalize once; Venue and Memories are outside V1", () => {
    expect(canonicalService("google_review")).toBe("scanme_review");
    expect(canonicalService("review")).toBe("scanme_review");
    expect(canonicalService("scanme_review")).toBe("scanme_review");
    for (const type of SERVICE_TYPES) expect(canonicalService(type)).toBe(type);
    for (const value of ["scanme_venue", "scanme_memories", "__proto__", "toString"]) expect(canonicalService(value)).toBeNull();
    expect(offerSr.serviceNames.review).toBe(getDict("admin-domain").services.scanme_review);
    expect(offerSr.serviceNames.links).toBe(getDict("admin-domain").services.scanme_links);
  });
  test("display format accepts variable padding and never determines ownership", () => {
    expect(formatHumanCode("physicalProduct", ["TEST4", "009"])).toBe("SMF-TEST4-009");
    expect(parseHumanCode(" smf-test4-009 ")).toEqual({ kind: "physicalProduct", parts: ["TEST4", "009"] });
    expect(parseHumanCode("SML-X")).toEqual({ kind: "venue", parts: ["X"] });
    for (const code of ["SMK", "BAD-1", "SMF--1", "SMK-!"]) expect(parseHumanCode(code)).toBeNull();
    expect(() => formatHumanCode("account", ["bad value"])).toThrow("invalid_code_part");
    const relabeled = { ...f.venues[0], code: formatHumanCode("venue", ["UNRELATED", "987654"]) };
    expect(relabeled.accountId).toBe(f.account.id);
    expect(relabeled.id).toBe(f.venues[0].id);
    expectTypeOf<EntityId<"account">>().not.toEqualTypeOf<EntityId<"venue">>();
  });
});

describe("ADMIN-01 / C02 account hierarchy and access contracts", () => {
  test("one client, four venues, multiple firms/brands/groups and contacts have valid relationships", () => {
    expect(f.venues).toHaveLength(4);
    expect(f.legalEntities).toHaveLength(2);
    expect(f.brands).toHaveLength(2);
    expect(f.groups).toHaveLength(2);
    expect(f.contacts).toHaveLength(3);
    for (const venue of f.venues) {
      expect(venue.accountId).toBe(f.account.id);
      expect(f.legalEntities.some((entity) => entity.id === venue.legalEntityId && entity.accountId === venue.accountId)).toBe(true);
      expect(f.brands.some((brand) => brand.id === venue.brandId && brand.accountId === venue.accountId)).toBe(true);
      expect(f.groups.some((group) => group.id === venue.groupId && group.accountId === venue.accountId)).toBe(true);
    }
    expect(f.venues[0].name).toBe(f.venues[1].name);
    expect(f.venues[0].id).not.toBe(f.venues[1].id);
    expect(new Set(f.venues.map((venue) => venue.code)).size).toBe(4);
    const primary = f.members.filter((member) => member.id === f.account.primaryOwnerMemberId);
    expect(primary).toHaveLength(1);
    expect(primary[0].role).toBe("full_access");
    expect(f.members.filter((member) => member.role === "full_access")).toHaveLength(2);
    expect(new Set(f.members.map((member) => member.role))).toEqual(new Set(CLIENT_ROLES));
  });
  test("default contact is a live reference; venue override does not change the account default", () => {
    expect(defaultContact(f.account, f.venues[0], f.contacts).id).toBe(f.contacts[0].id);
    expect(defaultContact(f.account, f.venues[3], f.contacts).id).toBe(f.contacts[1].id);
    const changed = { ...f.account, defaultContactId: f.contacts[1].id };
    expect(defaultContact(changed, f.venues[0], f.contacts).id).toBe(f.contacts[1].id);
    const edited = f.contacts.map((contact) => ({ ...contact, phone: "UPDATED-TEST-PHONE" }));
    expect(defaultContact(changed, null, edited).phone).toBe("UPDATED-TEST-PHONE");
    expect(() => defaultContact(f.account, { ...f.venues[0], accountId: f.referrerAccount.id }, f.contacts)).toThrow("wrong_account");
    expect(() => defaultContact({ ...f.account, defaultContactId: f.referrerContact.id }, null, [f.referrerContact])).toThrow("contact_not_in_account");
  });
  test.each(CLIENT_ROLES)("only full_access can cancel, even when %s can buy", (role) => {
    const member = { ...f.members[0], role, canBuyServices: true, canBuyPremium: true };
    expect(canCancelService(member, f.venues[0])).toBe(role === "full_access");
    expect(canCancelService({ ...member, active: false }, f.venues[0])).toBe(false);
    expect(canCancelService({ ...member, accountId: f.referrerAccount.id }, f.venues[0])).toBe(false);
    expect(canCancelService({ ...member, venueScope: { kind: "selected", venueIds: [f.venues[3].id] } }, f.venues[0])).toBe(false);
  });
  test("archive preserves IDs/history; brand edits require an explicit propagation choice", () => {
    const archived = { ...f.account, status: "archived" as const };
    const restored = { ...archived, status: "active" as const };
    expect(restored).toEqual(f.account);
    const editedBrand = { ...f.brands[0], revision: "fixture-r2" };
    expect(editedBrand.revision).not.toBe(f.services[1].appliedBrand?.revision);
    const choices: readonly BrandPropagation[] = [{ kind: "none" }, { kind: "all" }, { kind: "selected", serviceIds: [f.services[0].id] }];
    expect(choices.map((choice) => choice.kind)).toEqual(["none", "all", "selected"]);
  });
});

describe("ADMIN-01 / C03 independent subscription cycles", () => {
  test("three monthly A services, fourth venue with three annual services, account Premium", () => {
    expect(f.subscriptions).toHaveLength(7);
    for (let index = 0; index < 3; index++) {
      expect(f.services[index]).toMatchObject({ venueId: f.venues[index].id, type: "scanme_links" });
      expect(f.subscriptions[index]).toMatchObject({ period: "monthly", target: { kind: "service_instance", serviceInstanceId: f.services[index].id } });
    }
    expect(f.services.slice(3).map((service) => service.type)).toEqual(SERVICE_TYPES);
    for (const service of f.services.slice(3)) expect(service.venueId).toBe(f.venues[3].id);
    expect(f.subscriptions.slice(3, 6).map((subscription) => subscription.period)).toEqual(["annual", "annual", "annual"]);
    expect(f.subscriptions[6].target).toEqual({ kind: "account_premium", accountId: f.account.id });
    expect(new Set(f.subscriptions.map((subscription) => subscription.cycle.kind === "running" ? subscription.cycle.paidThrough : null)).size).toBe(7);
    expect(f.subscriptions.map((subscription) => subscriptionStatus(subscription, f.AS_OF))).toEqual(["active", "grace", "suspended", "active", "grace", "suspended", "active"]);
  });
  test.each([0, 3, 6])("warning/grace boundaries are exact for fixture subscription %s", (index) => {
    const subscription = f.subscriptions[index];
    const cycle = subscription.cycle;
    if (cycle.kind !== "running") throw new Error("running_fixture_required");
    const window = BILLING_WINDOWS[subscription.period];
    expect(window).toEqual(subscription.period === "monthly" ? { warningDays: 7, graceDays: 7 } : { warningDays: 15, graceDays: 15 });
    const warningAt = cycle.paidThrough - window.warningDays * DAY_MS;
    expect(renewalWarning(subscription, warningAt - 1)).toBe(false);
    expect(renewalWarning(subscription, warningAt)).toBe(true);
    expect(subscriptionStatus(subscription, warningAt)).toBe("active");
    expect(subscriptionStatus(subscription, cycle.paidThrough - 1)).toBe("active");
    expect(subscriptionStatus(subscription, cycle.paidThrough)).toBe("grace");
    expect(renewalWarning(subscription, cycle.paidThrough)).toBe(false);
    expect(subscriptionStatus(subscription, cycle.graceEndsAt - 1)).toBe("grace");
    expect(subscriptionStatus(subscription, cycle.graceEndsAt)).toBe("suspended");
    expect(subscriptionStatus(subscription, cycle.currentPeriodStart - 1)).toBe("inactive");
    expect(SUBSCRIPTION_STATUSES).not.toContain("warning");
  });
  test("manual grace change and cancel-at-end affect only the chosen subscription", () => {
    const source = f.subscriptions[2];
    if (source.cycle.kind !== "running") throw new Error("running_fixture_required");
    const extended: Subscription = { ...source, cycle: { ...source.cycle, graceEndsAt: f.at("2026-09-20") }, lastOverride: { actor: f.adminActor, at: f.AS_OF, reason: "Test: produžen grace" } };
    expect(subscriptionStatus(extended, f.AS_OF)).toBe("grace");
    expect(subscriptionStatus(source, f.AS_OF)).toBe("suspended");
    const cancelled = { ...source, cycle: { ...source.cycle, cancelAtPeriodEnd: true } };
    expect(subscriptionStatus(cancelled, source.cycle.paidThrough - 1)).toBe("active");
    expect(subscriptionStatus(cancelled, source.cycle.paidThrough)).toBe("inactive");
    expect(subscriptionStatus({ ...source, cycle: { kind: "inactive" } }, f.AS_OF)).toBe("inactive");
    expect(f.subscriptions[6].cycle).not.toEqual(extended.cycle);
  });
  test("Premium is account-wide; its badge and service configuration are independent", () => {
    const premium = f.subscriptions[6];
    expect(premiumBadge(premium, f.AS_OF)).toBe("active");
    expect(premiumBadge(premium, f.at("2026-09-13"))).toBe("grace");
    expect(premiumBadge(premium, f.at("2026-09-20"))).toBeNull();
    expect(premiumBadge(null, f.AS_OF)).toBeNull();
    expect(premiumBadge(f.subscriptions[0], f.AS_OF)).toBeNull();
    const paidUnconfigured = { ...f.services[0], configuration: "not_configured", clientEditingEnabled: false, health: { status: "problem", checkedAt: f.AS_OF, reason: "Test: konfiguracija" } };
    expect(paidUnconfigured.activation).toBe("owned");
    expect(subscriptionStatus(f.subscriptions[0], f.AS_OF)).toBe("active");
  });
});

describe("ADMIN-01 / C04 payments, prices, waivers and referral", () => {
  test("one transfer covers selected monthly/annual/Premium periods with explicit remainder", () => {
    expect(paymentBalance(f.partialPayment, f.partialAllocations)).toBe(0);
    expect(f.partialPayment.unallocated.amountMinor).toBe(5_000);
    const coverage = (index: number, start: string, end: string) => periodCoverage(f.subscriptions[index], { start: f.at(start), end: f.at(end) }, f.partialAllocations);
    expect(coverage(1, "2026-09-07", "2026-10-07")).toBe("funded");
    expect(coverage(4, "2026-09-03", "2027-09-03")).toBe("partial");
    expect(coverage(6, "2026-09-12", "2026-10-12")).toBe("funded");
    expect(coverage(2, "2026-08-31", "2026-09-30")).toBe("unpaid");
    expect(coverage(1, "2026-10-07", "2026-11-07")).toBe("unpaid");
    expect(subscriptionStatus(f.subscriptions[4], f.AS_OF)).toBe("grace");
    // The input model is unchanged. ADMIN-03 implements applying fully settled periods.
    expect(subscriptionStatus(f.subscriptions[2], f.AS_OF)).toBe("suspended");
  });
  test("over-allocation, missing remainder, duplicate rows and currency mixing cannot reconcile silently", () => {
    expect(paymentBalance({ ...f.partialPayment, amount: f.testMoney(1) }, f.partialAllocations)).toBeLessThan(0);
    expect(paymentBalance({ ...f.partialPayment, unallocated: f.testMoney(0) }, f.partialAllocations)).toBe(5_000);
    expect(() => paymentBalance(f.partialPayment, [...f.partialAllocations, f.partialAllocations[0]])).toThrow("duplicate_allocation");
    expect(() => paymentBalance(f.orderPayment, f.partialAllocations)).toThrow("wrong_payment");
    expect(() => paymentBalance(f.partialPayment, [{ ...f.partialAllocations[0], amount: { amountMinor: 12_000, currency: "EUR" } }])).toThrow("currency_mismatch");
    for (const amountMinor of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) expect(() => assertMoney(f.testMoney(amountMinor))).toThrow("invalid_money");
  });
  test("order lines reconcile separately; void/refund preserve original cash and snapshots", () => {
    expect(paymentBalance(f.orderPayment, f.orderAllocations)).toBe(0);
    expect(f.adjustments[0]).toMatchObject({ kind: "void", paymentId: f.partialPayment.id });
    expect(f.adjustments[1]).toMatchObject({ kind: "refund", paymentId: f.orderPayment.id, amount: f.testMoney(4_000) });
    expect(f.partialPayment.amount.amountMinor).toBe(38_000);
    expect(f.partialAllocations).toHaveLength(3);
    expect(f.orderLines[0].total.amountMinor).toBe(200_000);
    expect(f.individualSubscription.price.effective.amountMinor).toBe(10_000);
    expect(f.subscriptions[2].price.effective.amountMinor).toBe(12_000);
    const laterAgreement = { ...f.individualPrice, price: f.testMoney(9_000) };
    expect(laterAgreement.price).not.toEqual(f.individualSubscription.price.effective);
    const bases: readonly PriceBasis[] = [{ kind: "standard" }, { kind: "founders", validity: { kind: "lifetime" } }, { kind: "founders", validity: { kind: "until", endsAt: f.AS_OF } }, { kind: "enterprise", agreementId: f.individualPrice.id }, f.individualPrice.basis];
    expect(bases).toHaveLength(5);
  });
  test("friend tag waives only explicitly selected targets; it never makes products/free cash", () => {
    for (let index = 0; index < 7; index++) expect(isFriendWaived(f.account.id, f.subscriptions[index].target, [f.friendTag], [f.friendWaiver])).toBe(index === 0 || index === 6);
    expect(isFriendWaived(f.account.id, f.subscriptions[0].target, [], [f.friendWaiver])).toBe(false);
    expect(isFriendWaived(f.account.id, f.subscriptions[0].target, [f.friendTag], [])).toBe(false);
    expect(isFriendWaived(f.referrerAccount.id, f.subscriptions[0].target, [f.friendTag], [f.friendWaiver])).toBe(false);
    expect(f.orderPayment.amount.amountMinor).toBe(230_000);
  });
  test("referral qualifies only after the referred client's positive, non-voided payment", () => {
    expect(referralCanQualify(f.referral, [], [])).toBe(false);
    expect(referralCanQualify(f.referral, [{ ...f.partialPayment, amount: f.testMoney(0) }], [])).toBe(false);
    expect(referralCanQualify(f.referral, [{ ...f.partialPayment, accountId: f.referrerAccount.id }], [])).toBe(false);
    expect(referralCanQualify(f.referral, [f.partialPayment], [])).toBe(true);
    expect(referralCanQualify(f.referral, [f.partialPayment], [f.adjustments[0]])).toBe(false);
    expect(referralCanQualify(f.qualifiedReferral, [f.partialPayment], [])).toBe(false);
    expect(f.referral.terms).toEqual({ kind: "unconfigured" });
    expect(f.referralDiscount).toMatchObject({ kind: "referral_discount", targets: [{ kind: "account_premium", accountId: f.referrerAccount.id }] });
  });
});

describe("ADMIN-01 / C05 production, QR/NFC and history", () => {
  test.each([
    ["awaiting_payment", "in_progress", false], ["awaiting_payment", "approved", false],
    ["paid", "in_progress", false], ["paid", "awaiting_approval", false],
    ["paid", "template_selected", false], ["paid", "approved", true], ["reversed", "approved", false],
  ] as const)("SMF gate: payment=%s design=%s => %s", (paymentStatus, designStatus, allowed) => {
    expect(canAssignSmf({ ...f.order, paymentStatus, designStatus })).toBe(allowed);
    expect(canAssignSmf({ ...f.order, fulfillmentStatus: "cancelled" })).toBe(false);
  });
  test("50 + 2 pieces have 52 unique SMFs, frozen physical/design snapshots and line relationships", () => {
    expect(f.physicalProducts).toHaveLength(52);
    expect(new Set(f.physicalProducts.map((product) => product.code)).size).toBe(52);
    expect(new Set(f.physicalProducts.map((product) => product.id)).size).toBe(52);
    for (const line of f.orderLines) {
      const products = f.physicalProducts.filter((product) => product.orderLineId === line.id);
      expect(products).toHaveLength(line.quantity);
      expect(line.unitPrice.effective.amountMinor * line.quantity).toBe(line.total.amountMinor);
      for (const product of products) {
        expect(product.orderId).toBe(f.order.id);
        expect(product.venueId).toBe(line.venueId);
        expect(product.design).toEqual(line.design);
        expect(product.configuration).toEqual(line.configuration);
      }
    }
    expect(f.printJob.shipTo).toBe("scanme_team");
    expect(f.deliveries.map((delivery) => delivery.shippingPayer)).toEqual(["client_to_courier", "none"]);
    expect(new Set(f.deliveries.flatMap((delivery) => delivery.productIds)).size).toBe(52);
  });
  test("channel states are independent; absent differs from broken and disabled", () => {
    const state = (product: typeof f.physicalProducts[number]) => [channelStatus(product.channels.qr, product.destinationId !== null), channelStatus(product.channels.nfc, product.destinationId !== null)];
    expect(state(f.channelScenarios.active)).toEqual(["active", "active"]);
    expect(state(f.channelScenarios.inactive)).toEqual(["inactive", "active"]);
    expect(state(f.channelScenarios.problem)).toEqual(["active", "problem"]);
    expect(state(f.channelScenarios.qr_only)).toEqual(["active", "absent"]);
    expect(state(f.channelScenarios.nfc_only)).toEqual(["absent", "active"]);
    expect(state(f.channelScenarios.missing_destination)).toEqual(["problem", "problem"]);
    expect(canDispatchProduct(f.physicalProducts[0])).toBe(true);
    expect(canDispatchProduct({ ...f.physicalProducts[0], received: null })).toBe(false);
    expect(canDispatchProduct({ ...f.physicalProducts[0], qualityControl: null })).toBe(false);
    expect(canDispatchProduct({ ...f.physicalProducts[0], activated: null })).toBe(false);
    expect(canDispatchProduct(f.channelScenarios.problem)).toBe(false);
  });
  test("all three services use Links; Review+Meni use the generic splitter", () => {
    expect(serviceDestination(f.services.slice(3))).toEqual({ kind: "links_splitter", serviceId: f.services[3].id });
    expect(serviceDestination(f.services.slice(4))).toEqual({ kind: "generic_splitter", serviceIds: [f.services[4].id, f.services[5].id] });
    expect(serviceDestination([f.services[4]])).toEqual({ kind: "service", serviceId: f.services[4].id });
    expect(() => serviceDestination([])).toThrow("services_required");
    expect(() => serviceDestination([f.services[0], f.services[4]])).toThrow("mixed_venues");
    expect(() => serviceDestination([f.services[4], f.services[4]])).toThrow("duplicate_service");
  });
  test("digital QR keeps SMQ history when SMF becomes the support identity", () => {
    expect(f.linkedDigitalQr.id).toBe(f.digitalQr.id);
    expect(f.linkedDigitalQr.code).toBe(f.digitalQr.code);
    if (f.linkedDigitalQr.binding !== "physical") throw new Error("linked_fixture_required");
    expect(f.linkedDigitalQr.physicalProductId).toBe(f.productWithFormerDigitalQr.id);
    expect(f.linkedDigitalQr.channelId).toBe(f.productWithFormerDigitalQr.channels.qr?.id);
    expect(f.productWithFormerDigitalQr.code).toMatch(/^SMF-/);
    expect(f.destinationHistory.map((entry) => entry.destinationId)).toEqual([f.destinations[2].id, f.destinations[0].id]);
  });
  test("moving a product preserves old attribution; QR and NFC analytics remain separate", () => {
    const current = f.placementHistory.find((period) => period.endedAt === null);
    const currentMetrics = f.channelMetrics.filter((metric) => metric.placementPeriodId === current?.id);
    expect(currentMetrics.map((metric) => metric.count)).toEqual([3, 2]);
    expect(new Set(currentMetrics.map((metric) => metric.channelId)).size).toBe(2);
    expect(f.channelMetrics.reduce((total, metric) => total + metric.count, 0)).toBe(17);
    expect(f.placementHistory[0].endedAt).toBe(current?.started.at);
    expect(current?.placementId).toBe(f.physicalProducts[0].placementId);
  });
});

describe("ADMIN-01 / C06 communication, tasks, audit and type exclusions", () => {
  test("task and conversation link the same client/contact/operational objects", () => {
    expect(f.conversation.accountId).toBe(f.task.accountId);
    expect(f.conversation.contactId).toBe(f.contacts[0].id);
    expect(f.task.subject).toEqual({ kind: "delivery", id: f.deliveries[0].id });
    expect(f.task.due).toEqual({ kind: "date", date: "2026-09-12", timeZone: "Europe/Belgrade" });
    const timed: ClientTask = { ...f.task, due: { kind: "instant", at: f.AS_OF } };
    expect(timed.due).toEqual({ kind: "instant", at: f.AS_OF });
    expect(f.task.deferral?.change.reason.length).toBeGreaterThan(0);
    expect(f.actionItem.source).toEqual({ domain: "subscription", recordId: f.subscriptions[1].id, causeKind: "grace" });
    expect(f.actionItem.stableCauseId).toContain("cause:v1:");
    expect(f.actionItem.priority.class).toBe("grace_or_warning");
    expect(f.actionItem.resolutionContext.kind).toBe("source_record");
    expect(f.actionItem.resolutionRule).toBe("source_fact_changed");
  });
  test("inbound chat exposes no receipts; outbound receipt is explicitly admin-only", () => {
    expect(f.messages[0].receipt).toBeNull();
    expect(f.messages[1].receipt).toEqual({ visibility: "admin_only", status: "delivered" });
    const externalEmail: Message = { ...f.messages[1], channel: "email", direction: "outbound", author: { kind: "shared_mailbox" }, receipt: null, rawBody: "Test body\nSignature\nDisclaimer", preview: "Test body", attachments: [{ assetId: "fixture:asset:attachment", fileName: "test.txt", mimeType: "text/plain", sizeBytes: 9 }], providerMessageId: "fixture-external-id" };
    expect(externalEmail.rawBody).toContain("Disclaimer");
    expect(externalEmail.preview).not.toContain("Disclaimer");
    expect(externalEmail.author).toEqual({ kind: "shared_mailbox" });
  });
  test("risky audit operations require a reason and preserve actor/object/time", () => {
    for (const action of Object.keys(AUDIT_POLICY) as (keyof typeof AUDIT_POLICY)[]) {
      if (AUDIT_POLICY[action].reasonRequired) expect(() => assertAuditReason(action, "  ")).toThrow("reason_required");
      expect(() => assertAuditReason(action, "Test: razlog")).not.toThrow();
    }
    for (const event of f.auditEvents) {
      expect(event.change.actor).toEqual(f.adminActor);
      expect(event.change.at).toBe(f.AS_OF);
      expect(() => assertAuditReason(event.action, event.change.reason)).not.toThrow();
    }
    expect(Object.keys(AUDIT_POLICY).join(" ")).not.toMatch(/login|logout|device|session/);
  });
  test("TypeScript rejects forbidden cross-domain shortcuts", () => {
    // These deliberate errors must stay errors in the targeted TypeScript check.
    // @ts-expect-error a venue ID cannot be used as an account ID
    const wrongId: EntityId<"account"> = f.venues[0].id;
    // @ts-expect-error a physical piece must have QR or NFC
    const noChannels: PhysicalChannels = { qr: null, nfc: null };
    // @ts-expect-error Premium cannot target a venue/service
    const premiumAtVenue: SubscriptionTarget = { kind: "account_premium", serviceInstanceId: f.services[0].id };
    // @ts-expect-error profit cannot be filtered per service
    const serviceProfit: ProfitFilter = "scanme_menu";
    // @ts-expect-error payment audit details cannot be an opaque string
    const unstructuredAudit: AuditEvent["detail"] = "{}";
    expect([wrongId, noChannels, premiumAtVenue, serviceProfit, unstructuredAudit]).toHaveLength(5);
    expectTypeOf<Extract<Message, { direction: "inbound" }>["receipt"]>().toEqualTypeOf<null>();
  });
});
