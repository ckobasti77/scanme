import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { createDefaultProductSelection } from "../lib/scanme-pricing";
import { isAdminEmail } from "./lib/access";
import {
  syncServiceOperationalState,
  upsertClientReadModel,
  upsertProductReadModel,
  upsertVenueReadModel,
} from "./lib/adminReadModelEngine";
import { upsertContactReadModel } from "./lib/adminSearchProjection";
import {
  syncDashboardActionById,
  syncDashboardProduct,
  syncDashboardSubscription,
} from "./lib/adminDashboardProjection";
import { projectFinancePayment } from "./lib/financeProjection";

const PREFIX = "DEV100";
const DAY = 86_400_000;

const FIRST_NAMES = ["Ana", "Mina", "Jelena", "Milica", "Ivana", "Nikola", "Marko", "Stefan", "Luka", "Milan"];
const LAST_NAMES = ["Petrović", "Jovanović", "Ilić", "Nikolić", "Marković", "Pavlović", "Stojanović", "Đorđević", "Savić", "Milošević"];
const BRANDS = ["Bistro Most", "Zeleni Kutak", "Stari Grad", "Mala Fabrika", "Kod Hrasta", "Urban Zalogaj", "Dunavska Priča", "Trg 21", "Bašta", "Korner"];
const CITIES = ["Beograd", "Novi Sad", "Niš", "Kragujevac", "Subotica", "Pančevo", "Zrenjanin", "Čačak"];
const VENUE_SUFFIXES = ["Centar", "Dorćol", "Zemun"];
const PRODUCT_TYPES = ["two-piece-stand", "compact-stand", "stickers", "window-film", "premium-engraved-stand"] as const;
const PRODUCT_LABELS: Record<(typeof PRODUCT_TYPES)[number], string> = {
  "two-piece-stand": "Dvodelni stalak",
  "compact-stand": "Kompaktni stalak",
  stickers: "Nalepnica",
  "window-film": "Folija za izlog",
  "premium-engraved-stand": "Premium gravirani stalak",
};
const SERVICE_TYPES = ["scanme_links", "google_review", "scanme_menu"] as const;
const SERVICE_STATES = ["active", "warning", "grace", "suspended", "inactive", "problem"] as const;

const EMPTY_PRICE_SNAPSHOT = {
  engineVersion: 1,
  currency: "RSD" as const,
  lines: [],
  packages: [],
  groups: [],
  planLine: { plan: "basic" as const, period: null, amountRsd: 0, onRequest: false },
  servicesListRsd: 0,
  servicesChargedRsd: 0,
  savingsRsd: 0,
  recurringTotalRsd: 0,
  oneTimeTotalRsd: 0,
};

type ServiceType = (typeof SERVICE_TYPES)[number];
type ServiceState = (typeof SERVICE_STATES)[number];

function pad(value: number, size = 3) {
  return String(value).padStart(size, "0");
}

function plain(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "dj")
    .replace(/Đ/g, "Dj")
    .toLowerCase();
}

function factsFor(state: ServiceState, now: number) {
  const status = state === "warning" || state === "problem" ? "active" : state;
  const currentPeriodStart = status === "inactive" ? null : now - 20 * DAY;
  const paidThrough = status === "inactive" || status === "suspended" ? null : now + (state === "grace" ? -2 : 10) * DAY;
  const graceEndsAt = state === "grace" ? now + 5 * DAY : null;
  return {
    status: status as "inactive" | "active" | "grace" | "suspended",
    warning: state === "warning" || state === "problem",
    currentPeriodStart,
    paidThrough,
    graceEndsAt,
    nextTransitionAt: paidThrough,
  };
}

async function adminUser(ctx: MutationCtx) {
  const users = await ctx.db.query("users").take(100);
  const admin = users.find((user) => isAdminEmail(user.email));
  if (!admin) throw new Error("admin_dev_seed_admin_missing");
  return admin;
}

async function markProjectionComplete(
  ctx: MutationCtx,
  sourceKind: "action" | "subscription" | "product",
  now: number,
) {
  const current = await ctx.db
    .query("adminDashboardProjectionStates")
    .withIndex("by_sourceKind", (q) => q.eq("sourceKind", sourceKind))
    .unique();
  if (current) await ctx.db.patch(current._id, { state: "complete", updatedAt: now });
  else await ctx.db.insert("adminDashboardProjectionStates", { sourceKind, state: "complete", updatedAt: now });
}

export const seedBatch = internalMutation({
  args: { start: v.number(), count: v.number() },
  handler: async (ctx, args) => {
    if (!Number.isInteger(args.start) || !Number.isInteger(args.count) || args.start < 0 || args.count < 1 || args.start + args.count > 100 || args.count > 5) {
      throw new Error("admin_dev_seed_invalid_batch");
    }
    const admin = await adminUser(ctx);
    const now = Date.now();
    let createdAccounts = 0;
    let createdVenues = 0;
    let createdProducts = 0;
    let createdChannels = 0;
    let createdConversations = 0;
    let createdTasks = 0;
    let createdPayments = 0;

    for (let offset = 0; offset < args.count; offset += 1) {
      const index = args.start + offset;
      const ordinal = index + 1;
      const smkCode = `SMK-${PREFIX}-${pad(ordinal)}`;
      const existing = await ctx.db.query("accounts").withIndex("by_smkCode", (q) => q.eq("smkCode", smkCode)).unique();
      if (existing) continue;

      const firstName = FIRST_NAMES[index % FIRST_NAMES.length];
      const lastName = LAST_NAMES[Math.floor(index / FIRST_NAMES.length) % LAST_NAMES.length];
      const ownerName = `${firstName} ${lastName}`;
      const accountName = `[DEV] ${BRANDS[index % BRANDS.length]} ${pad(ordinal)}`;
      const archived = index % 17 === 0;
      const plan = index % 10 === 0 ? "enterprise" as const : index % 3 === 0 ? "premium" as const : "basic" as const;
      const accountId = await ctx.db.insert("accounts", {
        name: accountName,
        plan,
        ...(plan === "premium" ? { planPeriod: index % 2 === 0 ? "monthly" as const : "annual" as const } : {}),
        status: index % 29 === 0 ? "suspended" : "active",
        billingModel: "subscriptions_v1",
        smkCode,
        ownerDisplayName: ownerName,
        normalizedOwnerDisplayName: plain(ownerName),
        clientStatus: archived ? "archived" : "active",
        adminV1MigrationVersion: 1,
        adminV1MigratedAt: now,
        createdAt: now - (100 - index) * DAY,
        updatedAt: now - index * 60_000,
      });
      createdAccounts += 1;

      const contactId = await ctx.db.insert("accountContacts", {
        accountId,
        firstName,
        lastName,
        normalizedName: plain(ownerName),
        normalizedEmail: `dev100-klijent-${pad(ordinal)}@example.test`,
        normalizedPhone: `38160${pad(ordinal, 7)}`,
        positionTitle: index % 4 === 0 ? "Direktor" : "Vlasnik",
        isOwner: true,
        status: "active",
        createdAt: now - (100 - index) * DAY,
        updatedAt: now,
      });
      await ctx.db.patch(accountId, { defaultContactId: contactId });

      const venueCount = 1 + (index % 3);
      const venueIds: Id<"businesses">[] = [];
      const venueNames: string[] = [];
      let accountProductCount = 0;

      for (let venueIndex = 0; venueIndex < venueCount; venueIndex += 1) {
        const venueOrdinal = index * 3 + venueIndex + 1;
        const city = CITIES[(index + venueIndex) % CITIES.length];
        const venueName = `${accountName.replace("[DEV] ", "")} ${VENUE_SUFFIXES[venueIndex]}`;
        const smlCode = `SML-${PREFIX}-${pad(venueOrdinal, 4)}`;
        const businessId = await ctx.db.insert("businesses", {
          accountId,
          name: venueName,
          normalizedName: plain(venueName),
          slug: `${PREFIX.toLowerCase()}-${pad(ordinal)}-${venueIndex + 1}`,
          kind: "business",
          smlCode,
          clientStatus: archived ? "archived" : "active",
          normalizedCity: plain(city),
          city,
          address: `Test ulica ${venueOrdinal}, ${city}`,
          adminV1MigrationVersion: 1,
          status: archived ? "inactive" : "active",
          createdAt: now - (100 - index) * DAY,
          updatedAt: now,
        });
        venueIds.push(businessId);
        venueNames.push(venueName);
        createdVenues += 1;

        const serviceCount = 1 + ((index + venueIndex) % 3);
        const profiles: Array<{ id: Id<"serviceProfiles">; type: ServiceType; state: ServiceState }> = [];
        for (let serviceIndex = 0; serviceIndex < serviceCount; serviceIndex += 1) {
          const type = SERVICE_TYPES[serviceIndex];
          const state = archived ? "inactive" : SERVICE_STATES[(index + venueIndex + serviceIndex) % SERVICE_STATES.length];
          const profileId = await ctx.db.insert("serviceProfiles", {
            businessId,
            type,
            slug: `${PREFIX.toLowerCase()}-${pad(ordinal)}-${venueIndex + 1}-${type}`,
            status: state === "inactive" || state === "suspended" ? "inactive" : "active",
            totalScans: (index + 1) * (serviceIndex + 1) * 7,
            totalPageViews: (index + 1) * (serviceIndex + 1) * 11,
            totalConvertedSessions: (index + serviceIndex) % 13,
            createdAt: now - 60 * DAY,
            updatedAt: now,
          });
          profiles.push({ id: profileId, type, state });

          if (type === "google_review") {
            await ctx.db.insert("dynamicLinks", {
              businessId,
              slug: `${PREFIX.toLowerCase()}-review-${pad(venueOrdinal, 4)}`,
              destinationUrl: `https://example.test/review/${pad(venueOrdinal, 4)}`,
              type: "google_review",
              active: state !== "inactive" && state !== "suspended",
              scanCount: (index + venueIndex) * 5,
              createdAt: now - 45 * DAY,
              updatedAt: now,
            });
          }

          const facts = factsFor(state, now);
          const subscription = await ctx.db.insert("subscriptions", {
            accountId,
            businessId,
            target: { kind: "service_instance", serviceProfileId: profileId },
            targetKey: `service:${profileId}`,
            period: (index + serviceIndex) % 4 === 0 ? "annual" : "monthly",
            startsAt: now - 120 * DAY,
            anchorAt: now - 120 * DAY,
            renewal: { kind: "manual" },
            cancelAtPeriodEnd: false,
            facts,
            nextTransitionAt: facts.nextTransitionAt ?? undefined,
            key: `${PREFIX}:subscription:${profileId}`,
            fingerprint: `${PREFIX}:${state}:${index}:${venueIndex}:${serviceIndex}`,
            createdAt: now - 120 * DAY,
            updatedAt: now,
          });
          await syncDashboardSubscription(ctx, (await ctx.db.get(subscription))!, facts, now);
        }

        const productCount = 2 + ((index + venueIndex) % 5);
        accountProductCount += productCount;
        const selection = { ...createDefaultProductSelection(PRODUCT_TYPES[index % PRODUCT_TYPES.length]), quantity: productCount };
        const orderId = await ctx.db.insert("orders", {
          accountId,
          createdByUserId: admin._id,
          smpCode: `SMP-${PREFIX}-${pad(venueOrdinal, 4)}`,
          status: index % 7 === 0 ? "pending" : index % 9 === 0 ? "provisioned" : "paid",
          plan,
          ...(plan === "premium" ? { planPeriod: "monthly" as const } : {}),
          priceSnapshot: EMPTY_PRICE_SNAPSHOT,
          billingSource: "manual",
          createdAt: now - 30 * DAY,
          updatedAt: now,
        });
        const orderItemId = await ctx.db.insert("orderItems", {
          orderId,
          businessId,
          kind: "physical",
          boundService: "scanme_links",
          boundServices: profiles.map((profile) => profile.type),
          physicalSelection: selection,
          lineTotalRsd: productCount * 1490,
          createdAt: now - 30 * DAY,
        });
        const operationId = await ctx.db.insert("orderOperations", {
          orderId,
          accountId,
          createdByUserId: admin._id,
          createdByName: admin.name ?? admin.email ?? "Admin",
          accountName,
          smkCode,
          smpCode: `SMP-${PREFIX}-${pad(venueOrdinal, 4)}`,
          primaryBusinessId: businessId,
          primaryBusinessName: venueName,
          primarySmlCode: smlCode,
          paymentState: index % 7 === 0 ? "awaiting_payment" : "paid",
          designState: index % 6 === 0 ? "in_progress" : "approved",
          fulfillmentState: index % 9 === 0 ? "delivered" : index % 5 === 0 ? "at_printer" : "smf_assigned",
          view: index % 9 === 0 ? "completed" : "active",
          priority: index % 11 === 0 ? "urgent" : index % 4 === 0 ? "high" : "normal",
          priorityRank: index % 11 === 0 ? 0 : index % 4 === 0 ? 1 : 2,
          assigneeId: admin._id,
          assigneeName: admin.name ?? admin.email ?? "Admin",
          requiredMinor: productCount * 149_000,
          settledMinor: index % 7 === 0 ? 0 : productCount * 149_000,
          reversedMinor: 0,
          currency: "RSD",
          lineCount: 1,
          unitCount: productCount,
          problemCount: index % 13 === 0 ? 1 : 0,
          migrationIssueCount: 0,
          provisioningReady: true,
          note: index % 5 === 0 ? "[DEV] Proveriti detalje štampe." : undefined,
          searchText: `${plain(accountName)} ${plain(venueName)} ${plain(smkCode)}`,
          migrationVersion: 1,
          createdAt: now - 30 * DAY,
          updatedAt: now,
        });
        const orderLineId = await ctx.db.insert("orderLines", {
          operationId,
          orderId,
          orderItemId,
          accountId,
          businessId,
          businessName: venueName,
          smlCode,
          productType: selection.productId,
          productLabel: PRODUCT_LABELS[selection.productId],
          quantity: productCount,
          lineTotalMinor: productCount * 149_000,
          currency: "RSD",
          configSnapshot: selection,
          boundServices: profiles.map((profile) => profile.type),
          designKind: "template",
          designState: index % 6 === 0 ? "in_progress" : "approved",
          designRevision: 1,
          smfAssignedCount: productCount,
          sentToPrinterCount: index % 5 === 0 ? productCount : 0,
          receivedCount: index % 9 === 0 ? productCount : 0,
          qcPendingCount: index % 9 === 0 ? 0 : productCount,
          qcPassedCount: index % 9 === 0 ? productCount : 0,
          qcProblemCount: index % 13 === 0 ? 1 : 0,
          deliveryReservedCount: index % 9 === 0 ? productCount : 0,
          inDeliveryCount: 0,
          deliveredCount: index % 9 === 0 ? productCount : 0,
          createdAt: now - 30 * DAY,
          updatedAt: now,
        });
        const requestId = await ctx.db.insert("orderProvisioningRequests", {
          operationId,
          orderLineId,
          requestKey: `${PREFIX}:provision:${venueOrdinal}`,
          quantity: productCount,
          state: "fulfilled",
          createdCount: productCount,
          completedAt: now,
          createdByUserId: admin._id,
          createdAt: now - 29 * DAY,
        });

        let venueChannelCount = 0;
        for (let productIndex = 0; productIndex < productCount; productIndex += 1) {
          const productType = PRODUCT_TYPES[(index + venueIndex + productIndex) % PRODUCT_TYPES.length];
          const config = { ...createDefaultProductSelection(productType), quantity: productCount };
          const localSuffix = `${pad(venueOrdinal, 4)}${pad(productIndex + 1, 2)}`;
          const smfCode = `SMF-${PREFIX}-${localSuffix}`;
          const state = productIndex === 0 && index % 13 === 0 ? "problem" as const : productIndex === 1 && index % 10 === 0 ? "inactive" as const : "active" as const;
          const subjectId = await ctx.db.insert("accessSubjects", {
            accountId,
            businessId,
            destinationKind: "service",
            destinationInput: { kind: "services", serviceProfileIds: profiles.map((profile) => profile.id) },
            createdAt: now - 28 * DAY,
            updatedAt: now,
          });
          const productId = await ctx.db.insert("physicalProducts", {
            accountId,
            businessId,
            subjectId,
            smfCode,
            localSuffix,
            orderId,
            orderLineId,
            provisioningRequestId: requestId,
            unitOrdinal: productIndex + 1,
            productType,
            designSnapshot: config,
            boundServices: profiles.map((profile) => profile.type),
            qc: state === "problem" ? "failed" : index % 9 === 0 ? "passed" : "pending",
            createdByUserId: admin._id,
            createdAt: now - 28 * DAY,
            updatedAt: now,
          });

          const kinds = productIndex % 2 === 0 ? ["qr", "nfc"] as const : ["qr"] as const;
          const qrChannelIds: Id<"accessChannels">[] = [];
          const nfcChannelIds: Id<"accessChannels">[] = [];
          let currentTargetId: Id<"cardTargets"> | undefined;
          let anchorCardId: Id<"cards"> | undefined;
          for (const kind of kinds) {
            const resolverCode = `${PREFIX.toLowerCase()}-${localSuffix}-${kind}`;
            const cardId = await ctx.db.insert("cards", {
              businessId,
              cardCode: resolverCode,
              label: `${PRODUCT_LABELS[productType]} ${productIndex + 1}`,
              status: state === "inactive" ? "disabled" : "active",
              totalScans: (index + productIndex) * 3,
              createdAt: now - 28 * DAY,
              updatedAt: now,
            });
            const targetId = await ctx.db.insert("cardTargets", {
              cardId,
              kind: "service_page",
              serviceProfileId: profiles[0].id,
              createdByUserId: admin._id,
              createdAt: now - 28 * DAY,
            });
            const channelId = await ctx.db.insert("accessChannels", {
              accountId,
              businessId,
              accountName,
              smkCode,
              smlCode,
              venueName,
              city,
              subjectId,
              cardId,
              resolverCode,
              kind,
              state,
              redirectEnabled: state === "active",
              health: state === "problem" ? "broken" : state === "inactive" ? "unverified" : "healthy",
              problemReason: state === "problem" ? "[DEV] QR/NFC kanal zahteva proveru" : undefined,
              physicalProductId: productId,
              smfCode,
              binding: "physical",
              searchText: `${plain(accountName)} ${plain(venueName)} ${plain(smfCode)} ${kind}`,
              totalScans: (index + productIndex) * 3,
              lastActor: { kind: "system", source: "admin_dev_seed" },
              lastReason: "[DEV] verodostojan test skup",
              createdAt: now - 28 * DAY,
              updatedAt: now,
            });
            await ctx.db.patch(cardId, { accessChannelId: channelId, currentTargetId: targetId });
            if (kind === "qr") qrChannelIds.push(channelId);
            else nfcChannelIds.push(channelId);
            currentTargetId = currentTargetId ?? targetId;
            anchorCardId = anchorCardId ?? cardId;
            venueChannelCount += 1;
            createdChannels += 1;
          }
          await ctx.db.patch(subjectId, { physicalProductId: productId, anchorCardId, currentTargetId });
          const inventoryId = await ctx.db.insert("productInventory", {
            productId,
            subjectId,
            accountId,
            businessId,
            smfCode,
            localSuffix,
            productType,
            productLabel: PRODUCT_LABELS[productType],
            position: `Sto ${(productIndex % 12) + 1}`,
            qr: state === "problem" ? "red" : state === "inactive" ? "orange" : "green",
            nfc: nfcChannelIds.length === 0 ? "gray" : state === "problem" ? "red" : state === "inactive" ? "orange" : "green",
            state,
            destinationKind: "service",
            currentTargetId,
            designSnapshot: config,
            boundServices: profiles.map((profile) => profile.type),
            destinationServiceTypes: profiles.map((profile) => profile.type),
            qrChannelIds,
            nfcChannelIds,
            qrCount: qrChannelIds.length,
            nfcCount: nfcChannelIds.length,
            activeChannelCount: state === "active" ? kinds.length : 0,
            problemChannelCount: state === "problem" ? kinds.length : 0,
            qrProblemReason: state === "problem" ? "[DEV] Potrebna provera" : null,
            nfcProblemReason: state === "problem" && nfcChannelIds.length ? "[DEV] Potrebna provera" : null,
            searchText: `${plain(accountName)} ${plain(venueName)} ${plain(smfCode)} ${plain(PRODUCT_LABELS[productType])}`,
            updatedAt: now,
          });
          await syncDashboardProduct(ctx, (await ctx.db.get(inventoryId))!, now);
          await upsertProductReadModel(ctx, {
            accountId,
            businessId,
            sourceRecordId: String(productId),
            smfCode,
            smqCodes: qrChannelIds.map((_, channelIndex) => `SMQ-${PREFIX}-${localSuffix}-${channelIndex + 1}`),
            productType,
            displayName: `${PRODUCT_LABELS[productType]} — ${venueName}`,
            operationalStatus: state,
            updatedAt: now,
          });
          createdProducts += 1;
        }

        await upsertVenueReadModel(ctx, { businessId, productCount, channelCount: venueChannelCount, updatedAt: now });
        const venueProjection = await ctx.db.query("adminVenueReadModels").withIndex("by_businessId", (q) => q.eq("businessId", businessId)).unique();
        if (venueProjection) {
          await ctx.db.patch(venueProjection._id, {
            productFactsComplete: true,
            canonicalProductCount: productCount,
            canonicalQrCount: productCount,
            canonicalNfcCount: Math.ceil(productCount / 2),
            canonicalActiveChannelCount: stateChannelCount(index, productCount),
            canonicalProblemCount: index % 13 === 0 ? 1 : 0,
          });
        }
        for (const profile of profiles) {
          await syncServiceOperationalState(ctx, {
            accountId,
            businessId,
            serviceProfileId: profile.id,
            serviceType: profile.type,
            state: profile.state,
            updatedAt: now,
          });
        }
      }

      if (plan !== "basic") {
        const premiumFacts = factsFor(index % 14 === 0 ? "grace" : "active", now);
        const premiumId = await ctx.db.insert("subscriptions", {
          accountId,
          target: { kind: "account_premium" },
          targetKey: "premium",
          period: index % 2 === 0 ? "monthly" : "annual",
          startsAt: now - 180 * DAY,
          anchorAt: now - 180 * DAY,
          renewal: { kind: "manual" },
          cancelAtPeriodEnd: false,
          facts: premiumFacts,
          nextTransitionAt: premiumFacts.nextTransitionAt ?? undefined,
          key: `${PREFIX}:premium:${ordinal}`,
          fingerprint: `${PREFIX}:premium:${ordinal}`,
          createdAt: now - 180 * DAY,
          updatedAt: now,
        });
        await syncDashboardSubscription(ctx, (await ctx.db.get(premiumId))!, premiumFacts, now);
      }

      if (index % 4 !== 3) {
        const paymentMinor = 149_000 + (index % 5) * 50_000;
        const paymentId = await ctx.db.insert("payments", {
          accountId,
          amountRsd: paymentMinor / 100,
          method: "manual",
          reference: `${PREFIX}-UPL-${pad(ordinal)}`,
          paidAt: now - (index % 60) * DAY,
          recordedByUserId: admin._id,
          ledger: {
            amount: { amountMinor: paymentMinor, currency: "RSD" },
            unallocatedMinor: paymentMinor,
            method: ["bank_transfer", "payment_card", "cash", "other"][index % 4] as "bank_transfer" | "payment_card" | "cash" | "other",
            recordedBy: { kind: "admin", userId: admin._id },
            key: `${PREFIX}:payment:${ordinal}`,
            fingerprint: `${PREFIX}:payment:${ordinal}:${paymentMinor}`,
          },
          createdAt: now - (index % 60) * DAY,
        });
        await ctx.db.insert("paymentStates", { accountId, paymentId, paidAt: now - (index % 60) * DAY, state: "settled" });
        await projectFinancePayment(ctx, paymentId);
        createdPayments += 1;
      }

      if (index % 3 !== 2) {
        const conversationStatus = ["needs_reply", "in_progress", "waiting_client", "completed"][index % 4] as Doc<"conversations">["status"];
        const latestAt = now - (index % 12) * 3_600_000;
        const conversationId = await ctx.db.insert("conversations", {
          accountId,
          accountName,
          smkCode,
          contactId,
          contactName: ownerName,
          contactEmail: `dev100-klijent-${pad(ordinal)}@example.test`,
          contactPhone: `38160${pad(ordinal, 7)}`,
          businessId: venueIds[0],
          businessName: venueNames[0],
          channel: index % 2 === 0 ? "email" : "panel_chat",
          status: conversationStatus,
          assigneeAdminId: conversationStatus === "completed" ? undefined : admin._id,
          assigneeName: conversationStatus === "completed" ? undefined : admin.name ?? admin.email ?? "Admin",
          assigneeKey: conversationStatus === "completed" ? "unassigned" : String(admin._id),
          latestMessagePreview: index % 2 === 0 ? "Molim proverite status porudžbine." : "Potrebna nam je izmena odredišta QR koda.",
          latestMessageAt: latestAt,
          latestMessageDirection: index % 4 === 1 ? "admin_to_client" : "client_to_admin",
          latestMessageAuthorName: index % 4 === 1 ? admin.name ?? "Admin" : ownerName,
          adminUnreadCount: conversationStatus === "needs_reply" ? 1 + (index % 3) : 0,
          searchText: `${plain(accountName)} ${plain(ownerName)} ${plain(venueNames[0])}`,
          createdAt: latestAt - DAY,
          updatedAt: latestAt,
        });
        await ctx.db.insert("conversationMessages", {
          conversationId,
          accountId,
          contactId,
          businessId: venueIds[0],
          channel: index % 2 === 0 ? "email" : "panel_chat",
          direction: "client_to_admin",
          authorKind: "client",
          authorContactId: contactId,
          authorDisplayName: ownerName,
          content: "[DEV] Molim proverite status porudžbine i aktivaciju kanala.",
          clientMessageId: `${PREFIX}:message:${ordinal}`,
          createdAt: latestAt,
        });
        createdConversations += 1;
      }

      const dueAt = now + ((index % 9) - 4) * DAY;
      await ctx.db.insert("clientTasks", {
        accountId,
        accountName,
        smkCode,
        contactId,
        contactName: ownerName,
        businessId: venueIds[0],
        businessName: venueNames[0],
        smlCode: `SML-${PREFIX}-${pad(index * 3 + 1, 4)}`,
        subject: { kind: "venue", id: venueIds[0] },
        subjectKind: "venue",
        subjectLabel: venueNames[0],
        subjectHref: `/admin/klijenti/${accountId}`,
        title: index % 3 === 0 ? "Proveri aktivaciju kanala" : index % 3 === 1 ? "Javi se klijentu" : "Potvrdi detalje porudžbine",
        description: "[DEV] Operativni zadatak za proveru filtriranja, rokova i statusa.",
        assigneeId: admin._id,
        assigneeName: admin.name ?? admin.email ?? "Admin",
        priority: index % 10 === 0 ? "urgent" : index % 3 === 0 ? "high" : "normal",
        priorityRank: index % 10 === 0 ? 0 : index % 3 === 0 ? 1 : 2,
        due: { kind: "instant", at: dueAt },
        dueAt,
        dueSortAt: dueAt,
        dueVersion: "v1",
        timePhase: dueAt < now ? "overdue" : dueAt < now + DAY ? "today" : "future",
        status: index % 12 === 0 ? "completed" : "open",
        view: index % 12 === 0 ? "closed" : "active",
        searchText: `${plain(accountName)} ${plain(ownerName)} ${plain(venueNames[0])}`,
        participantCount: 0,
        createCommandId: `${PREFIX}:task:${ordinal}`,
        createdByUserId: admin._id,
        updatedByUserId: admin._id,
        createdAt: now - 2 * DAY,
        updatedAt: now,
      });
      createdTasks += 1;

      if (index % 4 === 0) {
        const severity = index % 12 === 0 ? "blocking" as const : "warning" as const;
        const actionId = await ctx.db.insert("actionItems", {
          causeId: `${PREFIX}:manual:${ordinal}`,
          sourceDomain: "manual_problem",
          sourceRecordId: `${PREFIX}:account:${ordinal}`,
          causeKind: "dev_verification",
          sourceVersion: "v1",
          sourceFingerprint: `${PREFIX}:${ordinal}:manual`,
          accountId,
          businessId: venueIds[0],
          severity,
          severityRank: severity === "blocking" ? 0 : 1,
          state: "open",
          assigneeId: admin._id,
          dueAt: now + (index % 2 === 0 ? -DAY : DAY),
          duePrecision: "instant",
          priorityClass: severity === "blocking" ? "blocking_or_overdue" : "due_today",
          priorityRank: severity === "blocking" ? 0 : 1,
          priorityAt: now - index * 60_000,
          relevantAt: now - index * 60_000,
          contextHref: `/admin/klijenti/${accountId}`,
          description: "[DEV] Ručna stavka za proveru upozorenja i rešavanja.",
          resolutionRule: "manual_problem_resolution",
          createdAt: now,
          updatedAt: now,
        });
        await syncDashboardActionById(ctx, actionId, now);
      }

      await upsertClientReadModel(ctx, { accountId, venueCount, firstVenueName: venueNames[0], updatedAt: now });
      await upsertContactReadModel(ctx, contactId);
      void accountProductCount;
    }

    if (args.start + args.count === 100) {
      await markProjectionComplete(ctx, "action", now);
      await markProjectionComplete(ctx, "subscription", now);
      await markProjectionComplete(ctx, "product", now);
    }

    return {
      start: args.start,
      count: args.count,
      createdAccounts,
      createdVenues,
      createdProducts,
      createdChannels,
      createdConversations,
      createdTasks,
      createdPayments,
    };
  },
});

function stateChannelCount(index: number, productCount: number) {
  if (index % 13 === 0) return Math.max(0, productCount + Math.ceil(productCount / 2) - 2);
  if (index % 10 === 0) return Math.max(0, productCount + Math.ceil(productCount / 2) - 1);
  return productCount + Math.ceil(productCount / 2);
}

export const status = internalQuery({
  args: {},
  handler: async (ctx) => {
    const [accounts, venues, products, channels, conversations, tasks, payments] = await Promise.all([
      ctx.db.query("accounts").take(250),
      ctx.db.query("businesses").take(500),
      ctx.db.query("physicalProducts").take(1_500),
      ctx.db.query("accessChannels").take(2_500),
      ctx.db.query("conversations").take(500),
      ctx.db.query("clientTasks").take(500),
      ctx.db.query("payments").take(500),
    ]);
    const seededAccountIds = new Set(accounts.filter((row) => row.smkCode?.startsWith(`SMK-${PREFIX}-`)).map((row) => String(row._id)));
    const belongs = (accountId: Id<"accounts">) => seededAccountIds.has(String(accountId));
    return {
      prefix: PREFIX,
      accounts: seededAccountIds.size,
      venues: venues.filter((row) => row.accountId && belongs(row.accountId)).length,
      products: products.filter((row) => belongs(row.accountId)).length,
      channels: channels.filter((row) => belongs(row.accountId)).length,
      conversations: conversations.filter((row) => belongs(row.accountId)).length,
      tasks: tasks.filter((row) => belongs(row.accountId)).length,
      payments: payments.filter((row) => belongs(row.accountId)).length,
    };
  },
});
