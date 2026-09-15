/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";
import { createDefaultProductSelection } from "../lib/scanme-pricing";
import { uniqueCode } from "./lib/accessOperations";

const modules = import.meta.glob("./**/*.ts");
const NOW = Date.parse("2026-09-14T10:00:00Z");
const page = (numItems = 20, cursor: string | null = null) => ({ numItems, cursor });
beforeEach(() => { process.env.SCANME_ADMIN_EMAILS = "admin12@scanme.test"; vi.useFakeTimers(); vi.setSystemTime(NOW); });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

async function setup(t = convexTest(schema, modules)) {
  rateLimiterTest.register(t);
  const ids = await t.run(async ctx => {
    const adminId = await ctx.db.insert("users", { email: "admin12@scanme.test", name: "Admin" });
    const otherId = await ctx.db.insert("users", { email: "client12@scanme.test" });
    const accountId = await ctx.db.insert("accounts", { name: "Most", smkCode: "SMK-12", ownerDisplayName: "Mina", normalizedOwnerDisplayName: "mina", clientStatus: "active", adminV1MigrationVersion: 1, plan: "basic", status: "active", createdAt: NOW, updatedAt: NOW });
    const foreignAccountId = await ctx.db.insert("accounts", { name: "Drugi", plan: "basic", status: "active", createdAt: NOW, updatedAt: NOW });
    const businessId = await ctx.db.insert("businesses", { accountId, name: "Most", slug: "most12", smlCode: "SML-12", adminV1MigrationVersion: 1, clientStatus: "active", kind: "business", status: "active", createdAt: NOW });
    const foreignBusinessId = await ctx.db.insert("businesses", { accountId: foreignAccountId, name: "Drugi", slug: "drugi12", kind: "business", status: "active", createdAt: NOW });
    const profiles = [];
    for (const type of ["scanme_links", "google_review", "scanme_menu"] as const) profiles.push(await ctx.db.insert("serviceProfiles", { businessId, type, slug: `most12-${type}`, status: "active", totalScans: 0, totalPageViews: 0, totalConvertedSessions: 0, createdAt: NOW, updatedAt: NOW }));
    const foreignProfileId = await ctx.db.insert("serviceProfiles", { businessId: foreignBusinessId, type: "scanme_links", slug: "drugi12-links", status: "active", totalScans: 0, totalPageViews: 0, totalConvertedSessions: 0, createdAt: NOW, updatedAt: NOW });
    return { adminId, otherId, accountId, businessId, foreignAccountId, foreignBusinessId, profiles, foreignProfileId };
  });
  const admin = t.withIdentity({ subject: ids.adminId, issuer: "https://admin12.test" });
  return { t, ...ids, admin, outsider: t.withIdentity({ subject: ids.otherId, issuer: "https://admin12.test" }), scope: { accountId: ids.accountId, businessId: ids.businessId } };
}
type Fixture = Awaited<ReturnType<typeof setup>>;
async function order(f: Fixture, quantity = 2, custom = false) {
  const selection = { ...createDefaultProductSelection("two-piece-stand"), quantity, ...(custom ? { design: { kind: "custom" as const, brief: "Logo" } } : {}) };
  const created = await f.admin.mutation(api.orders.createOrder, { accountId: f.accountId, serviceLines: [{ businessId: f.businessId, service: "scanme_links", period: "monthly" }], physicalLines: [{ businessId: f.businessId, boundService: "scanme_links", selection }] });
  const migrated = await f.admin.mutation(internal.adminOrderMigrations.migrateOne, { orderId: created.orderId, assigneeId: f.adminId, dryRun: false });
  const detail = (await f.admin.query(api.adminOrders.getDetail, { operationId: migrated.operationId! }))!;
  await f.admin.mutation(api.adminOrders.recordPayment, { operationId: detail.operation._id, amountMinor: detail.operation.requiredMinor, method: "cash", paidAt: NOW, key: `pay:${created.orderId}` });
  const latest = (await f.admin.query(api.adminOrders.getDetail, { operationId: detail.operation._id }))!;
  return { detail: latest, request: latest.provisioningRequests[0], line: latest.lines[0], operationId: detail.operation._id };
}
async function provision(f: Fixture, qty = 2, channels: ("qr" | "nfc")[] = ["qr", "nfc"]) {
  const o = await order(f, qty);
  const args = { ...f.scope, requestId: o.request._id, expectedOffset: 0, channels, destination: { kind: "services" as const, serviceProfileIds: [f.profiles[0]] }, key: `provision:${o.request._id}` };
  const { productIds, problemReason } = await f.admin.mutation(api.adminProducts.provision, args);
  expect(problemReason).toBeUndefined();
  return { ...o, args, productIds };
}
async function printAndReceive(f: Fixture, p: Awaited<ReturnType<typeof provision>>) {
  const printerId = await f.admin.mutation(api.adminOrders.savePrinter, { name: "Štamparija" });
  const printJobId = await f.admin.mutation(api.adminOrders.createPrintJob, { operationId: p.operationId, printerId, lines: [{ orderLineId: p.line._id, quantity: p.productIds.length }], commandId: `job:${p.operationId}` });
  await f.admin.mutation(api.adminOrders.dispatchPrintJob, { printJobId, commandId: `send:${printJobId}` });
  await f.admin.mutation(api.adminOrders.receivePrintJob, { printJobId, orderLineId: p.line._id, quantity: p.productIds.length, commandId: `receive:${printJobId}` });
  return printJobId;
}
async function qc(f: Fixture, p: Awaited<ReturnType<typeof provision>>) {
  const printJobId = await printAndReceive(f, p);
  return f.admin.mutation(api.adminOrders.recordQualityCheck, { printJobId, orderLineId: p.line._id, result: "pass", verifiedChannelKinds: ["qr", "nfc"], quantity: p.productIds.length, remakeRequested: false, commandId: `qc:${printJobId}` });
}
const detail = (f: Fixture, productId: Id<"physicalProducts">) => f.admin.query(api.adminProductReads.getProduct, { ...f.scope, productId });
async function digital(f: Fixture, key = "digital") {
  const id = await f.admin.mutation(api.adminProducts.createDigital, { ...f.scope, destination: { kind: "services", serviceProfileIds: [f.profiles[0]] }, key });
  return f.t.run(async ctx => { const code = (await ctx.db.get(id))!; return { code, channel: (await ctx.db.get(code.channelId))! }; });
}
const resolve = (f: Fixture, code: string, key: string) => f.t.mutation(api.cards.resolveAndRecord, { cardCode: code, requestId: key, deviceCategory: "mobile", ipHash: key });

describe("ADMIN-12 physical identities and QC", () => {
  test("delivery reserves actual units and rechecks all channel activation before dispatch", async () => {
    const f = await setup(); const p = await provision(f, 2); await qc(f, p);
    const d = await detail(f, p.productIds[0]);
    const channelId = d.channels[0]._id;
    const args = { operationId: p.operationId, method: "personal" as const, lines: [{ orderLineId: p.line._id, quantity: 1, physicalProductIds: [p.productIds[0]] }], address: "Glavna 1", commandId: "delivery-actual" };
    await f.admin.mutation(api.adminProducts.setChannelState, { ...f.scope, channelId, state: "inactive", reason: "Pauza", key: "pause-before-delivery" });
    await expect(f.admin.mutation(api.adminOrders.createDelivery, args)).rejects.toThrow("requires_activation");
    await f.admin.mutation(api.adminProducts.setChannelState, { ...f.scope, channelId, state: "active", reason: "Proveren", key: "resume-before-delivery" });
    const deliveryId = await f.admin.mutation(api.adminOrders.createDelivery, args);
    expect(await f.admin.mutation(api.adminOrders.createDelivery, args)).toBe(deliveryId);
    await expect(f.admin.mutation(api.adminOrders.createDelivery, { ...args, commandId: "duplicate-unit" })).rejects.toThrow("units_invalid");
    await f.t.run(ctx => ctx.db.patch(f.profiles[0], { status: "inactive" }));
    await expect(f.admin.mutation(api.adminOrders.startDelivery, { deliveryId, commandId: "start-actual" })).rejects.toThrow("requires_activation");
    expect((await f.t.run(ctx => ctx.db.get(deliveryId)))?.state).toBe("draft");
    await f.t.run(ctx => ctx.db.patch(f.profiles[0], { status: "active" }));
    await f.admin.mutation(api.adminOrders.startDelivery, { deliveryId, commandId: "start-actual" });
    expect((await f.t.run(ctx => ctx.db.get(deliveryId)))?.state).toBe("in_delivery");
    expect((await detail(f, p.productIds[0])).product.deliveryId).toBe(deliveryId);
  });
  test("failed provisioning rolls back partial units but preserves one actionable retry-safe failure", async () => {
    const f = await setup(); const o = await order(f, 2);
    const args = { ...f.scope, requestId: o.request._id, expectedOffset: 0, channels: ["qr" as const], key: "collision-retry" };
    const spy = vi.spyOn(crypto, "getRandomValues").mockImplementation(((array: Uint8Array) => { array.fill(0); return array; }) as typeof crypto.getRandomValues);
    expect(await f.admin.mutation(api.adminProducts.provision, args)).toEqual({ productIds: [], problemReason: "access_code_collision" });
    const historyBefore = await f.t.run(ctx => ctx.db.query("actionItemEvents").take(100));
    vi.setSystemTime(NOW + 60_000);
    expect((await f.admin.mutation(api.adminProducts.provision, args)).problemReason).toBe("access_code_collision");
    expect(await f.t.run(ctx => ctx.db.query("actionItemEvents").take(100))).toEqual(historyBefore);
    expect(await f.t.run(ctx => ctx.db.query("physicalProducts").take(5))).toHaveLength(0);
    expect(await f.t.run(ctx => ctx.db.query("cards").take(5))).toHaveLength(0);
    expect((await f.admin.query(api.adminOrders.getDetail, { operationId: o.operationId }))?.lines[0].smfAssignedCount).toBe(0);
    await expect(f.admin.mutation(api.adminProducts.provision, { ...args, channels: ["nfc"] })).rejects.toThrow("payload_mismatch");
    spy.mockRestore();
    const recovered = await f.admin.mutation(api.adminProducts.provision, args);
    expect(recovered.productIds).toHaveLength(2); expect(recovered.problemReason).toBeUndefined();
    expect(await f.admin.mutation(api.adminProducts.provision, args)).toEqual(recovered);
    const actions = await f.t.run(ctx => ctx.db.query("actionItems").take(100));
    expect(actions.filter(row => row.sourceRecordId === o.request._id)).toMatchObject([{ state: "resolved" }]);
  });
  test("50 units are unique, retry safe, immutable and distinct across order lines", async () => {
    const f = await setup(); const p = await provision(f, 50);
    expect(p.productIds).toHaveLength(50);
    for (let i = 0; i < 3; i++) expect(await f.admin.mutation(api.adminProducts.provision, p.args)).toEqual({ productIds: p.productIds });
    const rows = await f.t.run(ctx => ctx.db.query("physicalProducts").take(100));
    expect(rows).toHaveLength(50); expect(new Set(rows.map(r => r.smfCode)).size).toBe(50);
    expect(rows.every(r => r.localSuffix && r.qc === "pending" && r.designSnapshot.quantity === 50)).toBe(true);
    expect((await detail(f, p.productIds[0])).channels).toHaveLength(2);
    const next = await provision(f, 1); expect(rows.map(r => r.smfCode)).not.toContain((await detail(f, next.productIds[0])).product.smfCode);
    await expect(f.admin.mutation(api.adminProducts.provision, { ...p.args, channels: ["qr"] })).rejects.toThrow("payload_mismatch");
    const latest = await f.admin.query(api.adminOrders.getDetail, { operationId: p.operationId });
    expect(latest?.lines[0].smfAssignedCount).toBe(50);
  });
  test("chunk continuation supports N above the transaction bound without duplicates", async () => {
    const f = await setup(); const p = await provision(f, 51, ["nfc"]);
    expect(p.productIds).toHaveLength(50);
    const last = await f.admin.mutation(api.adminProducts.provision, { ...p.args, expectedOffset: 50, key: "chunk2" });
    expect(last.productIds).toHaveLength(1);
    expect(await f.admin.mutation(api.adminProducts.provision, { ...p.args, expectedOffset: 50, key: "chunk2" })).toEqual(last);
    expect(await f.t.run(ctx => ctx.db.query("physicalProducts").take(100))).toHaveLength(51);
  });
  test("missing channels are gray, QC activates both valid channels independently", async () => {
    const f = await setup(); const p = await provision(f, 1, ["nfc"]); await qc(f, p);
    const rows = await f.admin.query(api.adminProductReads.listInventory, { ...f.scope, paginationOpts: page(), sort: "smf", direction: "asc" });
    expect(rows.page[0]).toMatchObject({ qr: "gray", nfc: "green", state: "active", productLabel: "Dvodelni stalak" });
    const o = await order(f, 1);
    await expect(f.admin.mutation(api.adminProducts.provision, { ...f.scope, requestId: o.request._id, expectedOffset: 0, channels: [], key: "empty" })).rejects.toThrow("channel_required");
  });
  test("custom approval/payment gates and forged SMF assignments cannot mint units", async () => {
    const f = await setup(); const o = await order(f, 1, true);
    expect(o.detail.provisioningRequests).toHaveLength(0);
    await expect(f.admin.mutation(internal.adminOrders.recordSmfAssignments, { orderLineId: o.line._id, assignments: [{ reference: "SMF-FAKE", sourceRecordId: "fake" }], actorUserId: f.adminId, commandId: "fake" })).rejects.toThrow();
    expect(await f.t.run(ctx => ctx.db.query("physicalProducts").take(5))).toHaveLength(0);
  });
  test("partial QC requires exact units, failed health/destination opens canonical actions", async () => {
    const f = await setup(); const p = await provision(f); const printJobId = await printAndReceive(f, p);
    const args = { printJobId, orderLineId: p.line._id, quantity: 1, result: "problem" as const, reason: "Oštećen", remakeRequested: true, commandId: "partial-qc" };
    await expect(f.admin.mutation(api.adminOrders.recordQualityCheck, args)).rejects.toThrow("explicit_units_required");
    await f.admin.mutation(api.adminOrders.recordQualityCheck, { ...args, physicalProductIds: [p.productIds[1]] });
    expect((await detail(f, p.productIds[1])).product.qc).toBe("failed");
    expect((await detail(f, p.productIds[0])).product.qc).toBe("pending");
    await f.t.run(ctx => ctx.db.delete(f.profiles[0]));
    await f.admin.mutation(api.adminOrders.recordQualityCheck, { ...args, commandId: "pass-no-target", result: "pass", reason: undefined, remakeRequested: false, physicalProductIds: [p.productIds[0]] });
    expect((await detail(f, p.productIds[0])).channels.every(c => c.state === "problem" && c.problemReason)).toBe(true);
    const actions = await f.t.run(ctx => ctx.db.query("actionItems").take(30));
    expect(actions.some(a => a.sourceDomain === "qr_nfc" && a.state === "open")).toBe(true);
  });
});

describe("ADMIN-12 resolution, transitions, history and SMQ", () => {
  test("bounded source refresh changes projections without a scan and is idempotent", async () => {
    const f = await setup(); const p = await provision(f, 1); await qc(f, p);
    const d = await detail(f, p.productIds[0]);
    const args = { ...f.scope, channelIds: d.channels.map(row => row._id) };
    await f.t.run(ctx => ctx.db.patch(f.profiles[0], { status: "inactive" }));
    expect(await f.admin.mutation(api.adminProducts.refreshChannels, args)).toBe(2);
    const events = await f.t.run(ctx => ctx.db.query("accessChannelEvents").take(50));
    vi.setSystemTime(NOW + 60_000);
    expect(await f.admin.mutation(api.adminProducts.refreshChannels, args)).toBe(0);
    expect(await f.t.run(ctx => ctx.db.query("accessChannelEvents").take(50))).toEqual(events);
    const rows = await f.admin.query(api.adminProductReads.listInventory, { ...f.scope, sort: "smf", direction: "asc", paginationOpts: page() });
    expect(rows.page[0]).toMatchObject({ qr: "red", nfc: "red", state: "problem" });
    await f.t.run(ctx => ctx.db.patch(f.profiles[0], { status: "active" }));
    expect(await f.admin.mutation(api.adminProducts.refreshChannels, args)).toBe(2);
    expect((await detail(f, p.productIds[0])).channels.every(row => row.state === "active")).toBe(true);
  });
  test("QR/NFC share destination but state and scan counts remain independent", async () => {
    const f = await setup(); const p = await provision(f, 1); await qc(f, p);
    const d = await detail(f, p.productIds[0]); const qr = d.channels.find(c => c.kind === "qr")!; const nfc = d.channels.find(c => c.kind === "nfc")!;
    expect(await resolve(f, qr.resolverCode, "qr1")).toMatchObject({ kind: "service_page" });
    await resolve(f, qr.resolverCode, "qr1"); await resolve(f, qr.resolverCode, "qr2"); await resolve(f, nfc.resolverCode, "nfc1");
    await f.admin.mutation(api.adminProducts.setChannelState, { ...f.scope, channelId: qr._id, state: "inactive", reason: "Pauza", key: "pause" });
    expect(await resolve(f, qr.resolverCode, "disabled")).toEqual({ kind: "invalid" });
    expect(await resolve(f, nfc.resolverCode, "nfc2")).toMatchObject({ kind: "service_page" });
    const after = await detail(f, p.productIds[0]);
    expect(after.channels.find(c => c.kind === "qr")?.totalScans).toBe(2); expect(after.channels.find(c => c.kind === "nfc")?.totalScans).toBe(2);
    await f.admin.mutation(api.adminProducts.setChannelState, { ...f.scope, channelId: qr._id, state: "active", reason: "Nastavak", key: "resume" });
    await f.admin.mutation(api.adminProducts.setChannelState, { ...f.scope, channelId: qr._id, state: "problem", health: "broken", reason: "Ogrebotina", key: "broken" });
    await expect(f.admin.mutation(api.adminProducts.setChannelState, { ...f.scope, channelId: qr._id, state: "active", reason: "Popravka", key: "no-note" })).rejects.toThrow("resolution_note");
    await expect(f.admin.mutation(api.adminProducts.setChannelState, { ...f.scope, channelId: qr._id, state: "active", reason: "Popravka", resolutionNote: "Pokušaj", key: "bad-health" })).rejects.toThrow("health_broken");
    await f.admin.mutation(api.adminProducts.setChannelState, { ...f.scope, channelId: qr._id, state: "active", health: "healthy", reason: "Popravka", resolutionNote: "Proveren otisak", key: "fixed" });
    const events = await f.admin.query(api.adminProductReads.channelHistory, { ...f.scope, channelId: qr._id, paginationOpts: page() }); expect(events.page.some(e => e.reason === "Proveren otisak")).toBe(true);
  });
  test("Links wins multi-service; Review + Menu uses existing splitter; retarget and bulk are atomic/retry safe", async () => {
    const f = await setup(); const p = await provision(f, 2); await qc(f, p);
    const first = await detail(f, p.productIds[0]);
    const args = { ...f.scope, productIds: p.productIds, channelIds: [], destination: { kind: "services" as const, serviceProfileIds: f.profiles }, reason: "Sve usluge", key: "retarget-links" };
    await f.admin.mutation(api.adminProducts.bulkRetarget, args); await f.admin.mutation(api.adminProducts.bulkRetarget, args);
    expect((await detail(f, p.productIds[0])).subject.destinationKind).toBe("links_splitter");
    await f.admin.mutation(api.adminProducts.bulkRetarget, { ...args, key: "retarget-split", destination: { kind: "services", serviceProfileIds: f.profiles.slice(1) } });
    const current = await detail(f, p.productIds[0]); expect(current.subject.destinationKind).toBe("generic_splitter");
    expect(await resolve(f, current.channels[0].resolverCode, "split-scan")).toMatchObject({ kind: "splitter" });
    const view = await f.t.query(api.cards.getSplitterView, { cardCode: current.channels[0].resolverCode });
    expect(view.status).toBe("ok"); if (view.status === "ok") expect(view.buttons.map(b => b.href)).toContain("/most12/meni");
    const history = await f.admin.query(api.adminProductReads.destinationHistory, { ...f.scope, subjectId: current.subject._id, paginationOpts: page() });
    expect(history.page).toHaveLength(3); expect(history.page.some(h => h.previousTargetId === first.subject.currentTargetId)).toBe(true);
    await expect(f.admin.mutation(api.adminProducts.bulkRetarget, { ...args, key: "foreign-target", destination: { kind: "services", serviceProfileIds: [f.foreignProfileId] } })).rejects.toThrow("ownership");
    expect((await detail(f, p.productIds[0])).subject.currentTargetId).toBe(current.subject.currentTargetId);
    await expect(f.admin.mutation(api.adminProducts.bulkRetarget, { ...args, productIds: Array(51).fill(p.productIds[0]), key: "too-big" })).rejects.toThrow("bulk_size");
    await expect(f.admin.mutation(api.adminProducts.bulkRetarget, { ...args, reason: "Jaki razlog" })).rejects.toThrow("payload_mismatch");
  });
  test("placement defaults exclude historical scans and preserve destination attribution", async () => {
    const f = await setup(); const p = await provision(f, 1); await qc(f, p);
    const productId = p.productIds[0]; const d = await detail(f, productId);
    const move = { ...f.scope, productId, name: "Sto 4", reason: "Postavljeno", key: "table4" };
    await f.admin.mutation(api.adminProducts.changePlacement, move); const placed = await detail(f, productId);
    await resolve(f, d.channels[0].resolverCode, "old-place"); vi.setSystemTime(NOW + 1000);
    await f.admin.mutation(api.adminProducts.changePlacement, { ...move, name: "Terasa", key: "terrace" });
    await resolve(f, d.channels[1].resolverCode, "new-place");
    expect((await f.admin.query(api.adminProductReads.placementMetrics, { businessId: f.businessId, productId })).channels.map(c => c.scans).reduce((a,b) => a+b)).toBe(1);
    expect((await f.admin.query(api.adminProductReads.placementMetrics, { businessId: f.businessId, productId, placementId: placed.subject.currentPlacementId })).channels.map(c => c.scans).reduce((a,b) => a+b)).toBe(1);
    const events = await f.t.run(ctx => ctx.db.query("cardScanEvents").take(10));
    expect(events.find(e => e.requestId === "old-place")).toMatchObject({ placementId: placed.subject.currentPlacementId, destinationId: d.subject.currentTargetId, physicalProductId: productId });
    await f.admin.mutation(api.adminProducts.changePlacement, move);
    expect((await f.admin.query(api.adminProductReads.placementHistory, { ...f.scope, productId, paginationOpts: page() })).page).toHaveLength(2);
    const clientArgs = { businessId: f.businessId, productId, paginationOpts: page() };
    await expect(f.outsider.query(api.adminProductReads.clientPlacementHistory, clientArgs)).rejects.toThrow();
    const membershipId = await f.t.run(ctx => ctx.db.insert("accountMemberships", { accountId: f.accountId, userId: f.otherId, role: "venue_management", venueAccess: "selected", active: true, canBuyServices: false, canBuyPremium: false, createdAt: NOW, updatedAt: NOW }));
    await expect(f.outsider.query(api.adminProductReads.clientPlacementHistory, clientArgs)).rejects.toThrow();
    await f.t.run(ctx => ctx.db.insert("accountMembershipVenueScopes", { accountId: f.accountId, membershipId, businessId: f.businessId, createdAt: NOW }));
    const clientHistory = await f.outsider.query(api.adminProductReads.clientPlacementHistory, clientArgs);
    expect(clientHistory.page).toHaveLength(2);
    expect(clientHistory.page[0]).not.toHaveProperty("actor");
    const oldPlacement = clientHistory.page.find(row => row.name === "Sto 4")!;
    expect((await f.outsider.query(api.adminProductReads.placementMetrics, { businessId: f.businessId, productId, placementId: oldPlacement.placementId })).channels.reduce((sum, channel) => sum + channel.scans, 0)).toBe(1);
  });
  test("digital SMQ works alone then links without changing token, events or previous history", async () => {
    const f = await setup(); const digitalQr = await digital(f);
    expect(await resolve(f, digitalQr.channel.resolverCode, "digital-before")).toMatchObject({ kind: "service_page" });
    const p = await provision(f, 1); await qc(f, p);
    const args = { ...f.scope, digitalQrId: digitalQr.code._id, productId: p.productIds[0], reason: "Odštampan postojeći QR", key: "link" };
    await f.admin.mutation(api.adminProducts.linkDigital, args); await f.admin.mutation(api.adminProducts.linkDigital, { ...args, key: "link-again" });
    expect(await resolve(f, digitalQr.channel.resolverCode, "digital-after")).toMatchObject({ kind: "service_page" });
    const events = await f.admin.query(api.adminProductReads.scanHistory, { ...f.scope, channelId: digitalQr.channel._id, paginationOpts: page() });
    expect(events.page).toHaveLength(2); expect(events.page.find(e => e.requestId === "digital-before")?.physicalProductId).toBeUndefined(); expect(events.page.find(e => e.requestId === "digital-after")?.physicalProductId).toBe(p.productIds[0]);
    expect((await detail(f, p.productIds[0])).channels).toHaveLength(3);
    const codes = await f.admin.query(api.adminProductReads.listChannels, { search: digitalQr.code.smqCode, binding: "physical", direction: "desc", paginationOpts: page() }); expect(codes.page.map(c => c._id)).toContain(digitalQr.channel._id);
  });
  test("missing destinations cannot activate and URL arguments cannot create an open redirect", async () => {
    const f = await setup(); const id = await f.admin.mutation(api.adminProducts.createDigital, { ...f.scope, key: "missing" });
    const code = (await f.t.run(ctx => ctx.db.get(id)))!;
    await expect(f.admin.mutation(api.adminProducts.setChannelState, { ...f.scope, channelId: code.channelId, state: "active", reason: "Test", resolutionNote: "Test", key: "activate-missing" })).rejects.toThrow("destination_missing");
    await expect(f.admin.mutation(api.adminProducts.createDigital, { ...f.scope, destination: { kind: "url", url: "https://attacker.invalid" }, key: "open" } as never)).rejects.toThrow();
    const dynamicLinkId = await f.t.run(ctx => ctx.db.insert("dynamicLinks", { businessId: f.businessId, slug: "bad", type: "google_review", destinationUrl: "javascript:alert(1)", active: true, scanCount: 0, createdAt: NOW, updatedAt: NOW }));
    await expect(f.admin.mutation(api.adminProducts.createDigital, { ...f.scope, destination: { kind: "dynamic_link", dynamicLinkId }, key: "js" })).rejects.toThrow();
  });
  test("unauthenticated/non-admin and cross-account/venue access is refused", async () => {
    const f = await setup(); const d = await digital(f); const p = await provision(f, 1);
    for (const client of [f.t, f.outsider]) {
      await expect(client.mutation(api.adminProducts.createDigital, { ...f.scope, key: "unauthorized" })).rejects.toThrow();
      await expect(client.query(api.adminProductReads.getProduct, { ...f.scope, productId: p.productIds[0] })).rejects.toThrow();
      await expect(client.query(api.adminProductReads.listChannels, { direction: "asc", paginationOpts: page() })).rejects.toThrow();
      await expect(client.query(api.adminProductReads.placementMetrics, { businessId: f.businessId, productId: p.productIds[0] })).rejects.toThrow();
    }
    await expect(f.admin.mutation(api.adminProducts.linkDigital, { accountId: f.foreignAccountId, businessId: f.foreignBusinessId, digitalQrId: d.code._id, productId: p.productIds[0], reason: "Test", key: "foreign-link" })).rejects.toThrow("cross_account_venue");
    await expect(f.admin.mutation(api.adminProducts.bulkRetarget, { accountId: f.foreignAccountId, businessId: f.foreignBusinessId, productIds: p.productIds, channelIds: [], destination: { kind: "services", serviceProfileIds: [f.foreignProfileId] }, reason: "Test", key: "foreign-product" })).rejects.toThrow("cross_account_venue");
  });
  test("code generation rejects persistent SMF, SMQ and public token collisions", async () => {
    const f = await setup(); const p = await provision(f, 1); const d = await digital(f);
    for (const kind of ["SMF", "SMQ", "resolver"] as const) {
      const code = kind === "SMF" ? (await detail(f, p.productIds[0])).product.smfCode.slice(4) : kind === "SMQ" ? d.code.smqCode.slice(4) : d.channel.resolverCode;
      const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
      const spy = vi.spyOn(crypto, "getRandomValues").mockImplementation(((array: Uint8Array) => { array.set([...code].map(c => alphabet.indexOf(c))); return array; }) as typeof crypto.getRandomValues);
      await expect(f.t.run(ctx => uniqueCode(ctx, kind))).rejects.toThrow("code_collision"); spy.mockRestore();
    }
  });
});

describe("ADMIN-12 legacy adapter", () => {
  test("SMQ allocation conflict produces a stable migration issue without adopting the card", async () => {
    const f = await setup(); const existing = await digital(f);
    const legacy = await f.admin.mutation(api.cards.createCard, { businessId: f.businessId, label: "Legacy", target: { kind: "venue" } });
    const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
    const suffix = existing.code.smqCode.slice(4);
    const spy = vi.spyOn(crypto, "getRandomValues").mockImplementation(((array: Uint8Array) => { array.set([...suffix].map(c => alphabet.indexOf(c))); return array; }) as typeof crypto.getRandomValues);
    const args = { paginationOpts: page(25), dryRun: false };
    const result = await f.admin.mutation(internal.adminAccessMigrations.migrateLegacyCards, args);
    expect(result.page.find(row => row.sourceCardId === legacy.cardId)).toMatchObject({ status: "blocked", reason: "legacy_smq_collision" });
    expect((await f.t.run(ctx => ctx.db.get(legacy.cardId)))?.accessChannelId).toBeUndefined();
    expect((await resolve(f, legacy.cardCode, "collision-legacy")).kind).toBe("venue");
    spy.mockRestore();
    expect((await f.admin.mutation(internal.adminAccessMigrations.migrateLegacyCards, args)).page.find(row => row.sourceCardId === legacy.cardId)?.status).toBe("mapped");
    expect(await f.t.run(ctx => ctx.db.query("accessMigrationIssues").take(5))).toMatchObject([{ reason: "legacy_smq_collision", resolvedAt: NOW }]);
  });
  test("migration conflicts are audited once across time and heal only after source correction", async () => {
    const f = await setup();
    const card = await f.admin.mutation(api.cards.createCard, { businessId: f.businessId, label: "Missing ownership", target: { kind: "venue" } });
    await f.t.run(ctx => ctx.db.patch(f.businessId, { accountId: undefined }));
    const first = await f.admin.mutation(internal.adminAccessMigrations.migrateLegacyCards, { paginationOpts: page(1), dryRun: false });
    expect(first.page[0]).toMatchObject({ status: "blocked", reason: "legacy_ownership_missing" });
    const before = await f.t.run(async ctx => ({ events: await ctx.db.query("actionItemEvents").take(20), audits: await ctx.db.query("adminAuditLog").take(20) }));
    vi.setSystemTime(NOW + 1000);
    await f.admin.mutation(internal.adminAccessMigrations.migrateLegacyCards, { paginationOpts: page(1), dryRun: false });
    expect(await f.t.run(ctx => ctx.db.query("actionItemEvents").take(20))).toEqual(before.events);
    expect(await f.t.run(ctx => ctx.db.query("adminAuditLog").take(20))).toEqual(before.audits);
    await f.t.run(ctx => ctx.db.patch(f.businessId, { accountId: f.accountId }));
    await f.admin.mutation(internal.adminAccessMigrations.migrateLegacyCards, { paginationOpts: page(1), dryRun: false });
    const issues = await f.t.run(ctx => ctx.db.query("accessMigrationIssues").take(10));
    expect(issues[0].resolvedAt).toBe(NOW + 1000);
    expect(await resolve(f, card.cardCode, "repaired-legacy")).toMatchObject({ kind: "venue" });
  });
  test("disabled legacy code reactivates through canonical state; malformed duplicate codes block mapping", async () => {
    const f = await setup();
    const card = await f.admin.mutation(api.cards.createCard, { businessId: f.businessId, label: "Disabled", target: { kind: "venue" } });
    await f.admin.mutation(api.cards.disableCard, { cardId: card.cardId });
    const mapped = await f.admin.mutation(internal.adminAccessMigrations.migrateLegacyCards, { paginationOpts: page(), dryRun: false });
    const channelId = mapped.page[0].channelId!;
    expect(await resolve(f, card.cardCode, "disabled-before")).toEqual({ kind: "invalid" });
    await f.admin.mutation(api.adminProducts.setChannelState, { ...f.scope, channelId, state: "active", reason: "Ponovo uključeno", key: "legacy-active" });
    expect(await resolve(f, card.cardCode, "disabled-after")).toMatchObject({ kind: "venue" });
    await f.t.run(ctx => ctx.db.insert("cards", { businessId: f.businessId, cardCode: card.cardCode, label: "Collision", status: "active", totalScans: 0, createdAt: NOW, updatedAt: NOW }));
    const conflict = await f.admin.mutation(internal.adminAccessMigrations.migrateLegacyCards, { paginationOpts: page(), dryRun: true });
    expect(conflict.page.every(row => row.reason === "legacy_code_collision")).toBe(true);
  });
  test("dry-run is read-only; migration preserves legacy codes, targets, events and daily metrics", async () => {
    const f = await setup();
    const card = await f.admin.mutation(api.cards.createCard, { businessId: f.businessId, label: "Legacy unknown", target: { kind: "service_page", serviceProfileId: f.profiles[0] } });
    await resolve(f, card.cardCode, "legacy-before");
    const source = await f.t.run(async ctx => ({ targets: await ctx.db.query("cardTargets").take(10), events: await ctx.db.query("cardScanEvents").take(10), daily: await ctx.db.query("dailyCardMetrics").take(10), audits: await ctx.db.query("adminAuditLog").take(20) }));
    const dry = await f.admin.mutation(internal.adminAccessMigrations.migrateLegacyCards, { paginationOpts: page(), dryRun: true }); expect(dry.page[0].status).toBe("ready");
    expect(await f.t.run(ctx => ctx.db.query("digitalQrCodes").take(10))).toHaveLength(0);
    expect(await f.t.run(ctx => ctx.db.query("adminAuditLog").take(20))).toEqual(source.audits);
    const migrated = await f.admin.mutation(internal.adminAccessMigrations.migrateLegacyCards, { paginationOpts: page(), dryRun: false }); expect(migrated.page[0].status).toBe("mapped");
    await f.admin.mutation(internal.adminAccessMigrations.migrateLegacyCards, { paginationOpts: page(), dryRun: false });
    expect(await f.t.run(ctx => ctx.db.query("physicalProducts").take(10))).toHaveLength(0);
    expect(await f.t.run(ctx => ctx.db.query("digitalQrCodes").take(10))).toHaveLength(1);
    expect(await f.t.run(ctx => ctx.db.query("cardTargets").take(10))).toEqual(source.targets);
    expect(await f.t.run(ctx => ctx.db.query("cardScanEvents").take(10))).toEqual(source.events);
    expect(await f.t.run(ctx => ctx.db.query("dailyCardMetrics").take(10))).toEqual(source.daily);
    expect(await resolve(f, card.cardCode, "legacy-after")).toMatchObject({ kind: "service_page" });
    await expect(f.admin.mutation(api.cardsAdmin.retargetCard, { cardId: card.cardId, target: { kind: "venue" } })).rejects.toThrow("canonical_writer");
  });
});

test("QC preserves unverified/broken channels; resolver issues persist and resolve with actual source facts", async () => {
  const f = await setup(); const p = await provision(f, 1); const printJobId = await printAndReceive(f, p);
  await f.admin.mutation(api.adminOrders.recordQualityCheck, { printJobId, orderLineId: p.line._id, result: "pass", quantity: 1, verifiedChannelKinds: ["qr"], remakeRequested: false, commandId: "only-qr-verified" });
  const d = await detail(f, p.productIds[0]);
  expect(d.channels.find(c => c.kind === "qr")?.state).toBe("active");
  expect(d.channels.find(c => c.kind === "nfc")).toMatchObject({ state: "problem", health: "unverified" });
  const qr = d.channels.find(c => c.kind === "qr")!;
  await f.t.run(ctx => ctx.db.patch(f.profiles[0], { status: "inactive" }));
  expect(await resolve(f, qr.resolverCode, "invalid-profile")).toEqual({ kind: "invalid" });
  const before = await f.t.run(ctx => ctx.db.query("actionItemEvents").take(40));
  vi.setSystemTime(NOW + 2000); await resolve(f, qr.resolverCode, "invalid-profile-again");
  expect(await f.t.run(ctx => ctx.db.query("actionItemEvents").take(40))).toEqual(before);
  await expect(f.admin.mutation(api.adminProducts.setChannelState, { ...f.scope, channelId: qr._id, state: "active", reason: "Pokušaj", resolutionNote: "Nije ispravljeno", key: "not-fixed" })).rejects.toThrow("destination_service_inactive");
  await f.t.run(ctx => ctx.db.patch(f.profiles[0], { status: "active" }));
  await f.admin.mutation(api.adminProducts.setChannelState, { ...f.scope, channelId: qr._id, state: "active", reason: "Usluga obnovljena", resolutionNote: "Izvor je aktivan", key: "profile-fixed" });
  expect(await resolve(f, qr.resolverCode, "profile-restored")).toMatchObject({ kind: "service_page" });
});

test("bulk validation checks every selected subject before writes and preserves printed design snapshots", async () => {
  const f = await setup(); const p = await provision(f, 1); const d = await detail(f, p.productIds[0]);
  const foreignId = await f.admin.mutation(api.adminProducts.createDigital, { accountId: f.foreignAccountId, businessId: f.foreignBusinessId, key: "foreign-digital" });
  const foreign = (await f.t.run(ctx => ctx.db.get(foreignId)))!;
  await expect(f.admin.mutation(api.adminProducts.bulkRetarget, { ...f.scope, productIds: p.productIds, channelIds: [foreign.channelId], destination: { kind: "services", serviceProfileIds: [f.profiles[2]] }, reason: "Promena", key: "mixed-subjects" })).rejects.toThrow("cross_account_venue");
  expect((await detail(f, p.productIds[0])).subject.currentTargetId).toBe(d.subject.currentTargetId);
  await f.t.run(ctx => ctx.db.patch(p.line._id, { configSnapshot: { ...p.line.configSnapshot, design: { kind: "template", templateId: "template-2" } } }));
  const printerId = await f.admin.mutation(api.adminOrders.savePrinter, { name: "Štampa" });
  await expect(f.admin.mutation(api.adminOrders.createPrintJob, { operationId: p.operationId, printerId, lines: [{ orderLineId: p.line._id, quantity: 1 }], commandId: "changed-snapshot" })).rejects.toThrow("immutable_print_snapshot");
  expect((await detail(f, p.productIds[0])).product.designSnapshot).toEqual(d.product.designSnapshot);
});

test("500 venues and 10,000 physical products paginate under 4 queries/250 documents without N+1", async () => {
  const source = await setup(); const produced = await provision(source, 1, ["qr"]);
  const template = (await detail(source, produced.productIds[0])).product;
  const t = convexTest({ schema, modules, transactionLimits: { databaseQueries: 4, documentsRead: 250 } });
  const f = await setup(t);
  const venues: Id<"businesses">[] = [];
  for (let batch = 0; batch < 10; batch++) {
    venues.push(...await t.run(async ctx => {
      const ids: Id<"businesses">[] = [];
      for (let n = 0; n < 50; n++) {
        const suffix = String(batch * 50 + n).padStart(4, "0");
        const id = await ctx.db.insert("businesses", { accountId: f.accountId, name: `Lokal ${suffix}`, slug: `scale12-${suffix}`, status: "active", kind: "business", createdAt: NOW });
        ids.push(id);
        await ctx.db.insert("adminVenueReadModels", { accountId: f.accountId, businessId: id, smkCode: "SMK-12", smlCode: `SML-${suffix}`, ownerDisplayName: "Mina", venueName: `Lokal ${suffix}`, normalizedVenueName: `lokal ${suffix}`, city: null, effectiveContactEmail: null, effectiveContactPhone: null, productCount: 20, channelCount: 20, serviceTypes: [], clientStatus: "active", signal: { causeId: null, severity: null }, urgencyRank: 3, searchText: `lokal ${suffix}`, updatedAt: NOW });
      }
      return ids;
    }));
  }
  for (let batch = 0; batch < 100; batch++) await t.run(async ctx => {
    for (let n = 0; n < 100; n++) {
      const ordinal = batch * 100 + n;
      const businessId = venues[ordinal % 500]; const suffix = String(ordinal).padStart(8, "0");
      const subjectId = await ctx.db.insert("accessSubjects", { accountId: f.accountId, businessId, destinationKind: "service", createdAt: NOW, updatedAt: NOW });
      const productId = await ctx.db.insert("physicalProducts", { accountId: f.accountId, businessId, subjectId, smfCode: `SMF-${suffix}`, localSuffix: suffix, orderId: template.orderId, orderLineId: template.orderLineId, provisioningRequestId: template.provisioningRequestId, unitOrdinal: ordinal, productType: template.productType, designSnapshot: template.designSnapshot, boundServices: template.boundServices, qc: "passed", createdByUserId: f.adminId, createdAt: NOW, updatedAt: NOW });
      const state = ordinal % 2 ? "active" as const : "inactive" as const;
      const cardId = await ctx.db.insert("cards", { businessId, cardCode: suffix, label: suffix, status: "active", totalScans: 0, createdAt: NOW, updatedAt: NOW });
      const targetId = await ctx.db.insert("cardTargets", { cardId, kind: "venue", createdByUserId: f.adminId, createdAt: NOW });
      const channelId = await ctx.db.insert("accessChannels", { accountId: f.accountId, businessId, subjectId, cardId, resolverCode: suffix, kind: "qr", state, redirectEnabled: state === "active", health: "healthy", physicalProductId: productId, smfCode: `SMF-${suffix}`, binding: "physical", searchText: suffix, totalScans: 0, lastActor: { kind: "admin", userId: f.adminId }, lastReason: "scale_fixture", createdAt: NOW, updatedAt: NOW });
      await ctx.db.patch(cardId, { accessChannelId: channelId });
      await ctx.db.patch(subjectId, { physicalProductId: productId, anchorCardId: cardId, currentTargetId: targetId });
      await ctx.db.insert("productInventory", { productId, subjectId, accountId: f.accountId, businessId, smfCode: `SMF-${suffix}`, localSuffix: suffix, productType: "two-piece-stand", productLabel: "Dvodelni stalak", position: `Sto ${ordinal % 20}`, qr: state === "active" ? "green" : "orange", nfc: "gray", state, destinationKind: "service", currentTargetId: targetId, searchText: `smf ${suffix} dvodelni stalak sto ${ordinal % 20}`, updatedAt: NOW });
    }
  });
  let venueCursor: string | null = null; let venueCount = 0;
  do {
    const result = await f.admin.query(api.adminProductReads.listVenues, { paginationOpts: page(37, venueCursor) });
    venueCount += result.page.length; venueCursor = result.isDone ? null : result.continueCursor;
  } while (venueCursor);
  expect(venueCount).toBe(500);
  let productCount = 0;
  for (const businessId of venues) {
    let cursor: string | null = null; const seen = new Set<string>();
    do {
      const result = await f.admin.query(api.adminProductReads.listInventory, { accountId: f.accountId, businessId, paginationOpts: page(7, cursor), sort: "smf", direction: "asc" });
      for (const row of result.page) { expect(seen.has(row.smfCode)).toBe(false); seen.add(row.smfCode); expect(row.businessId).toBe(businessId); }
      productCount += result.page.length; cursor = result.isDone ? null : result.continueCursor;
    } while (cursor);
    expect(seen.size).toBe(20);
  }
  expect(productCount).toBe(10_000);
  const filtered = await f.admin.query(api.adminProductReads.listInventory, { accountId: f.accountId, businessId: venues[0], state: "inactive", productType: "two-piece-stand", search: "dvodelni", paginationOpts: page(), sort: "smf", direction: "asc" });
  expect(filtered.page).toHaveLength(20);
}, 60_000);

test("ADMIN-13 reads expose canonical compact inventory facts and bounded technical channel context", async () => {
  const f = await setup();
  const p = await provision(f, 2);
  await qc(f, p);
  await f.admin.mutation(api.adminProducts.changePlacement, { ...f.scope, productId: p.productIds[0], name: "Terasa 4", reason: "Postavljeno", key: "admin13-position" });

  const inventory = await f.admin.query(api.adminProductReads.listInventory, {
    ...f.scope,
    search: "terasa",
    design: "template",
    service: "scanme_links",
    paginationOpts: page(),
    sort: "position",
    direction: "asc",
  });
  const terrace = inventory.page.find((row) => row.productId === p.productIds[0]);
  expect(terrace).toMatchObject({
    productId: p.productIds[0],
    productLabel: "Dvodelni stalak",
    position: "Terasa 4",
    qr: "green",
    nfc: "green",
    qrCount: 1,
    nfcCount: 1,
    activeChannelCount: 2,
    problemChannelCount: 0,
    boundServices: ["scanme_links"],
    destinationServiceTypes: ["scanme_links"],
  });
  expect(terrace?.designSnapshot).toMatchObject({ design: { kind: "template" } });
  expect(terrace?.qrChannelIds).toHaveLength(1);
  expect(terrace?.nfcChannelIds).toHaveLength(1);

  const inactiveProfile = await f.t.run((ctx) => ctx.db.insert("serviceProfiles", {
    businessId: f.businessId,
    type: "scanme_links",
    slug: "most12-links-inactive",
    status: "inactive",
    totalScans: 0,
    totalPageViews: 0,
    totalConvertedSessions: 0,
    createdAt: NOW,
    updatedAt: NOW,
  }));
  const destinations = await f.admin.query(api.adminProductReads.listDestinationProfiles, f.scope);
  expect(destinations.isComplete).toBe(true);
  expect(destinations.profiles).toEqual(expect.arrayContaining([
    { profileId: f.profiles[0], type: "scanme_links" },
    { profileId: f.profiles[1], type: "google_review" },
    { profileId: f.profiles[2], type: "scanme_menu" },
  ]));
  expect(destinations.profiles.map((profile) => profile.profileId)).not.toContain(inactiveProfile);

  const summary = await f.admin.query(api.adminProductReads.getVenueProductSummary, f.scope);
  expect(summary).toMatchObject({ productCount: 2, qrCount: 2, nfcCount: 2, activeChannelCount: 4, problemChannelCount: 0, smfPrefix: "SMF-", isComplete: true });

  const product = await f.admin.query(api.adminProductReads.getProductDetail, { ...f.scope, productId: p.productIds[0] });
  expect(product.context).toMatchObject({ accountName: "Most", smkCode: "SMK-12", venueName: "Most", smlCode: "SML-12" });
  const channel = product.channels.find((row) => row.kind === "qr")!;
  const channels = await f.admin.query(api.adminProductReads.listChannels, { search: channel.resolverCode, kind: "qr", direction: "desc", paginationOpts: page() });
  expect(channels.page).toMatchObject([{ _id: channel._id, accountName: "Most", smkCode: "SMK-12", venueName: "Most", smlCode: "SML-12", binding: "physical" }]);
  const channelDetail = await f.admin.query(api.adminProductReads.getChannelDetail, { channelId: channel._id });
  expect(channelDetail).toMatchObject({ channel: { _id: channel._id }, product: { _id: p.productIds[0] }, digitalQr: null, context: { accountName: "Most", venueName: "Most" } });
});

test("ADMIN-13 venue rows expose reconciled canonical QR, NFC, and problem counters", async () => {
  const f = await setup();
  await f.t.run((ctx) => ctx.db.insert("adminVenueReadModels", {
    accountId: f.accountId,
    businessId: f.businessId,
    smkCode: "SMK-12",
    smlCode: "SML-12",
    ownerDisplayName: "Mina",
    venueName: "Most",
    normalizedVenueName: "most",
    city: null,
    effectiveContactEmail: null,
    effectiveContactPhone: null,
    productCount: 0,
    channelCount: 0,
    serviceTypes: ["scanme_links"],
    clientStatus: "active",
    signal: { severity: null, causeId: null },
    urgencyRank: 3,
    searchText: "most smk 12 sml 12",
    updatedAt: NOW,
  }));
  const p = await provision(f, 2);
  await qc(f, p);
  let venues = await f.admin.query(api.adminProductReads.listVenues, { paginationOpts: page(), filter: "all", sort: "urgency" });
  expect(venues.page).toMatchObject([{ businessId: f.businessId, productCount: 2, qrCount: 2, nfcCount: 2, channelCount: 4, activeChannelCount: 4, problemCount: 0, isProductProjectionComplete: true }]);

  const physical = await detail(f, p.productIds[0]);
  venues = await f.admin.query(api.adminProductReads.listVenues, { paginationOpts: page(), search: physical.product.smfCode, filter: "all", sort: "urgency" });
  expect(venues.page).toMatchObject([{ businessId: f.businessId, productCount: 2, qrCount: 2, nfcCount: 2 }]);
  const digitalQr = await digital(f, "admin13-venue-smq");
  venues = await f.admin.query(api.adminProductReads.listVenues, { paginationOpts: page(), search: digitalQr.code.smqCode, filter: "active", sort: "urgency" });
  expect(venues.page).toMatchObject([{ businessId: f.businessId, productCount: 2, qrCount: 2, nfcCount: 2 }]);

  const qr = (await detail(f, p.productIds[0])).channels.find((channel) => channel.kind === "qr")!;
  await f.admin.mutation(api.adminProducts.setChannelState, { ...f.scope, channelId: qr._id, state: "problem", health: "broken", reason: "Oštećen kod", key: "admin13-venue-problem" });
  venues = await f.admin.query(api.adminProductReads.listVenues, { paginationOpts: page(), filter: "problem", sort: "urgency" });
  expect(venues.page).toMatchObject([{ businessId: f.businessId, problemCount: 1, isProductProjectionComplete: true, hasOpenAction: true }]);
});

test("ADMIN-13 bulk channel state and placement affect only selected existing physical records", async () => {
  const f = await setup();
  const p = await provision(f, 2);
  await qc(f, p);
  const first = p.productIds[0];
  const second = p.productIds[1];

  await f.admin.mutation(api.adminProducts.bulkSetChannelState, {
    ...f.scope,
    productIds: [first],
    kinds: ["qr"],
    state: "inactive",
    reason: "Privremena pauza",
    key: "admin13-bulk-qr",
  });
  const firstAfterState = await detail(f, first);
  const secondAfterState = await detail(f, second);
  expect(firstAfterState.channels.find((row) => row.kind === "qr")?.state).toBe("inactive");
  expect(firstAfterState.channels.find((row) => row.kind === "nfc")?.state).toBe("active");
  expect(secondAfterState.channels.every((row) => row.state === "active")).toBe(true);
  await expect(f.admin.mutation(api.adminProducts.bulkSetChannelState, {
    ...f.scope,
    productIds: [first],
    kinds: ["qr"],
    state: "active",
    reason: "Pogrešan ponovni pokušaj",
    key: "admin13-bulk-qr",
  })).rejects.toThrow("payload_mismatch");

  const move = { ...f.scope, productIds: [first], name: "Sto 7", reason: "Premešteno", key: "admin13-bulk-placement" };
  await f.admin.mutation(api.adminProducts.bulkChangePlacement, move);
  await f.admin.mutation(api.adminProducts.bulkChangePlacement, move);
  expect((await detail(f, first)).subject.currentPlacementId).toBeTruthy();
  expect((await detail(f, second)).subject.currentPlacementId).toBeUndefined();
  expect((await f.admin.query(api.adminProductReads.placementHistory, { ...f.scope, productId: first, paginationOpts: page() })).page).toHaveLength(1);

  const qrOnly = await provision(f, 1, ["qr"]);
  await expect(f.admin.mutation(api.adminProducts.bulkSetChannelState, {
    ...f.scope,
    productIds: qrOnly.productIds,
    kinds: ["nfc"],
    state: "inactive",
    reason: "Nema NFC kanala",
    key: "admin13-no-nfc",
  })).rejects.toThrow("access_bulk_channel_absent");
  await expect(f.outsider.mutation(api.adminProducts.bulkChangePlacement, { ...f.scope, productIds: [first], name: "Sto 8", reason: "Nedozvoljeno", key: "admin13-outsider" })).rejects.toThrow();
});
