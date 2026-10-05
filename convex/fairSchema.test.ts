/// <reference types="vite/client" />

// Sajam 2026 B0 — proves the fair tables and indexes exist exactly as the
// contract says (BACKEND-HANDOFF §5 + JOVAN-DELTA, B0 additions marked),
// round-trip through the real schema, and that the additive changes to
// existing tables (fair_model card target, clientSegment) stay inert and
// backward compatible. Precedent: convex/orderingSchema.test.ts (TASK-62).

import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import type { Infer } from "convex/values";
import { beforeEach, describe, expect, expectTypeOf, test } from "vitest";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import {
  fairCardTargetProblem,
  fairClientSegment,
  fairContactRequirement,
  fairEventStatus,
  fairLeadKind,
  fairModelStatus,
  fairPackageTier,
  fairReportStatus,
  fairSponsoredActionKind,
  fairSponsoredActionSurface,
  fairSurveyQuestionKind,
} from "./lib/fairValidators";
import {
  FAIR_PII_PURGE_AT_MS,
  fairClientSegmentOf,
  type FairClientSegment,
  type FairContactRequirement,
  type FairEventStatus,
  type FairLeadKind,
  type FairModelStatus,
  type FairPackageTier,
  type FairReportStatus,
  type FairSponsoredActionKind,
  type FairSponsoredActionSurface,
  type FairSurveyQuestionKind,
} from "../lib/fair-contract";

const modules = import.meta.glob("./**/*.ts");

const ADMIN_EMAIL = "admin@scanme.test";
const ISSUER = "https://test.local";
const VISITOR_HASH = "a".repeat(64);

beforeEach(() => {
  process.env.SCANME_ADMIN_EMAILS = ADMIN_EMAIL;
});

function newT() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  return t;
}

type T = ReturnType<typeof convexTest>;

// Every fair table and its index names. Fields are derived from the name
// (Convex guideline: an index name lists all its fields in order).
const FAIR_INDEXES: Record<string, string[]> = {
  fairEvents: ["by_code", "by_slug", "by_status_and_startsAt"],
  fairEventDays: ["by_eventId_and_dateKey"],
  fairParticipations: [
    "by_eventId_and_externalKey",
    "by_eventId_and_businessId",
    "by_accountId_and_eventId",
  ],
  fairStands: [
    "by_eventId_and_externalKey",
    "by_eventId_and_participationId",
    "by_eventId_and_mapLocationId",
  ],
  fairEventModels: [
    "by_eventId_and_slug",
    "by_eventId_and_externalKey",
    "by_eventId_and_standId",
    "by_eventId_and_brandId",
    "by_eventId_and_packageTier",
  ],
  fairQrAssignments: [
    "by_eventModelId_and_status",
    "by_accessChannelId_and_status",
    "by_eventId_and_status",
  ],
  fairPackageActivations: ["by_eventModelId_and_activatedAt"],
  fairVisitors: ["by_visitorHash"],
  fairScanEvents: [
    "by_requestId",
    "by_eventModelId_and_occurredAt",
    "by_standId_and_occurredAt",
    "by_eventId_and_occurredAt",
  ],
  fairUniqueScans: ["by_visitorId_and_eventModelId", "by_eventModelId_and_firstScannedAt"],
  fairMetricCountShards: ["by_key_and_shard"],
  fairRatings: ["by_visitorId_and_eventModelId", "by_eventModelId_and_updatedAt"],
  fairAudienceQuestions: [
    "by_eventModelId_and_eventDayId",
    "by_eventDayId_and_status",
    "by_eventId_and_externalKey", // B0 addition (import idempotency)
  ],
  fairAudienceVotes: ["by_visitorId_and_questionId", "by_questionId_and_updatedAt"],
  fairSurveys: ["by_eventModelId_and_status"],
  fairSurveyResponses: [
    "by_submissionId",
    "by_surveyId_and_submittedAt",
    "by_visitorId_and_surveyId",
  ],
  fairConsentConfigs: [
    "by_eventId_and_leadKind_and_status",
    "by_eventId_and_leadKind_and_version",
  ],
  fairLeadConfigs: ["by_eventModelId_and_leadKind"],
  fairLeads: [
    "by_submissionId",
    "by_eventModelId_and_createdAt",
    "by_participationId_and_createdAt",
    "by_status_and_purgeAt",
  ],
  fairMessageTemplates: ["by_eventModelId_and_kind_and_status"],
  fairEmailDeliveries: [
    "by_dedupeKey",
    "by_status_and_scheduledFor",
    "by_leadId_and_kind",
    "by_recipient_and_kind_and_createdAt", // B7 per-address confirmation cap
  ],
  fairPassportConfigs: ["by_eventId_and_brandId", "by_eventId_and_status"], // B0 design
  fairPassportEligibleModels: ["by_passportConfigId_and_status", "by_eventModelId"], // B0 design
  fairPassportStamps: ["by_visitorId_and_eventId_and_brandId", "by_visitorId_and_eventModelId"],
  fairBrandFavoriteVotes: ["by_visitorId_and_eventId_and_brandId", "by_eventId_and_brandId"],
  fairReportRuns: ["by_eventDayId_and_participationId", "by_status_and_createdAt"],
  fairSponsoredSnapshots: ["by_eventId_and_status", "by_eventId_and_version"],
  fairSponsoredSnapshotItems: ["by_snapshotId_and_order"],
  fairSponsoredEvents: [
    "by_requestId",
    "by_eventModelId_and_occurredAt",
    "by_eventId_and_occurredAt",
  ],
  fairPurgeRuns: ["by_mode_and_status"], // B7 purge audit (HANDOFF §5.6)
  // 5 Oct traffic/share delta (JOVAN-DELTA-2026-10-05.md, Aleksa 8e72c10),
  // added to the contract list at the 2026-10-05 sync.
  fairShareCollections: ["by_requestId", "by_codeHash", "by_eventId_and_createdAt"],
  fairTrafficEvents: [
    "by_requestId",
    "by_eventId_and_occurredAt",
    "by_eventModelId_and_occurredAt",
    "by_shareCollectionId_and_occurredAt",
  ],
};

function fieldsFromIndexName(name: string) {
  return name.slice("by_".length).split("_and_");
}

type IndexedTable = { " indexes"(): Array<{ indexDescriptor: string; fields: string[] }> };

// Existing client/QR records the fair rows link to (never copies of them).
async function seedCatalog(t: T) {
  return t.run(async (ctx) => {
    const now = Date.now();
    const adminId = await ctx.db.insert("users", { email: ADMIN_EMAIL, emailVerificationTime: now });
    const accountId = await ctx.db.insert("accounts", {
      name: "TEST izlagač d.o.o.",
      plan: "basic",
      status: "active",
      clientSegment: "event_only",
      createdAt: now,
      updatedAt: now,
    });
    const businessId = await ctx.db.insert("businesses", {
      name: "TEST salon",
      slug: "test-salon",
      accountId,
      status: "active",
      createdAt: now,
    });
    const contactId = await ctx.db.insert("accountContacts", {
      accountId,
      firstName: "TEST",
      lastName: "Kontakt",
      normalizedName: "test kontakt",
      positionTitle: "Prodaja",
      isOwner: true,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    const brandId = await ctx.db.insert("brands", {
      accountId,
      name: "TEST Brend",
      normalizedName: "test brend",
      revision: "1",
      colors: [],
      createdAt: now,
      updatedAt: now,
    });
    const cardId = await ctx.db.insert("cards", {
      businessId,
      cardCode: "SAJAM234",
      label: "TEST QR inventar 1",
      status: "active",
      totalScans: 0,
      createdAt: now,
      updatedAt: now,
    });
    const subjectId = await ctx.db.insert("accessSubjects", {
      accountId,
      businessId,
      destinationKind: "legacy",
      createdAt: now,
      updatedAt: now,
    });
    const channelId = await ctx.db.insert("accessChannels", {
      accountId,
      businessId,
      subjectId,
      cardId,
      resolverCode: "SAJAM234",
      kind: "qr",
      state: "active",
      redirectEnabled: true,
      health: "healthy",
      binding: "digital",
      searchText: "sajam234",
      totalScans: 0,
      lastActor: { kind: "system", source: "fairSchema.test" },
      lastReason: "test",
      createdAt: now,
      updatedAt: now,
    });
    return { now, adminId, accountId, businessId, contactId, brandId, cardId, subjectId, channelId };
  });
}

async function seedFairModel(t: T) {
  const base = await seedCatalog(t);
  const ids = await t.run(async (ctx) => {
    const { now } = base;
    const eventId = await ctx.db.insert("fairEvents", {
      code: "test-auto-moto-fest-2026",
      slug: "test-auto-moto-fest-2026",
      title: "TEST Auto Moto Fest",
      venueName: "TEST Hala",
      timezone: "Europe/Belgrade",
      startsAt: now,
      endsAt: now + 3 * 86_400_000,
      status: "draft",
      garagePriority: 1,
      piiPurgeAt: FAIR_PII_PURGE_AT_MS,
      minimumPublicVoteCount: 5,
      robotsIndexable: false,
      createdAt: now,
      updatedAt: now,
    });
    const eventDayId = await ctx.db.insert("fairEventDays", {
      eventId,
      dateKey: "2026-10-30",
      label: "TEST dan 1",
      startsAt: now,
      endsAt: now + 86_400_000,
      sortOrder: 1,
    });
    const participationId = await ctx.db.insert("fairParticipations", {
      externalKey: "test-participation-1",
      eventId,
      accountId: base.accountId,
      businessId: base.businessId,
      primaryContactId: base.contactId,
      status: "draft",
      createdAt: now,
      updatedAt: now,
    });
    const standId = await ctx.db.insert("fairStands", {
      eventId,
      participationId,
      externalKey: "test-stand-1",
      code: "T1",
      displayName: "TEST štand 1",
      mapLocationId: "test-hala-1",
      status: "draft",
      createdAt: now,
      updatedAt: now,
    });
    const eventModelId = await ctx.db.insert("fairEventModels", {
      externalKey: "test-model-1",
      eventId,
      participationId,
      brandId: base.brandId,
      standId,
      slug: "test-model-1",
      displayName: "TEST Model",
      priceText: "Cena na upit",
      specifications: [
        {
          id: "s1",
          groupId: "g1",
          groupLabel: "TEST grupa",
          groupOrder: 1,
          label: "TEST oznaka",
          value: "TEST vrednost",
          order: 1,
          isHighlight: true,
        },
      ],
      packageTier: "included",
      packageActivatedAt: now,
      passportEligible: false,
      status: "draft",
      sortOrder: 1,
      createdAt: now,
      updatedAt: now,
    });
    const visitorId = await ctx.db.insert("fairVisitors", {
      visitorHash: VISITOR_HASH,
      firstSeenAt: now,
      lastSeenAt: now,
    });
    return { eventId, eventDayId, participationId, standId, eventModelId, visitorId };
  });
  return { ...base, ...ids };
}

describe("fair schema contract (B0)", () => {
  test("exactly the contracted fair tables exist; no fairExhibitors or sajam* tables", () => {
    const names = Object.keys(schema.tables);
    expect(names.filter((name) => name.startsWith("fair")).sort()).toEqual(
      Object.keys(FAIR_INDEXES).sort(),
    );
    expect(names).not.toContain("fairExhibitors");
    expect(names.filter((name) => name.toLowerCase().startsWith("sajam"))).toEqual([]);
  });

  test("every fair table has exactly its contracted indexes, fields in name order", () => {
    const tables = schema.tables as unknown as Record<string, IndexedTable>;
    for (const [table, expected] of Object.entries(FAIR_INDEXES)) {
      const actual = tables[table][" indexes"]().map((index) => ({
        name: index.indexDescriptor,
        fields: index.fields,
      }));
      expect({ table, indexes: actual }).toEqual({
        table,
        indexes: expected.map((name) => ({ name, fields: fieldsFromIndexName(name) })),
      });
    }
  });

  test("every fair table round-trips a row and is reachable through its key index", async () => {
    const t = newT();
    const s = await seedFairModel(t);
    const found = await t.run(async (ctx) => {
      const { now } = s;
      await ctx.db.insert("fairQrAssignments", {
        eventId: s.eventId,
        eventModelId: s.eventModelId,
        accessChannelId: s.channelId,
        accessSubjectId: s.subjectId,
        cardId: s.cardId,
        resolverCode: "SAJAM234",
        status: "assigned",
        assignedAt: now,
        assignedByUserId: s.adminId,
      });
      await ctx.db.insert("fairPackageActivations", {
        eventModelId: s.eventModelId,
        eventId: s.eventId,
        fromTier: "included",
        toTier: "starter",
        activatedAt: now,
        actorUserId: s.adminId,
      });
      await ctx.db.insert("fairScanEvents", {
        requestId: "test-req-1",
        visitorId: s.visitorId,
        eventId: s.eventId,
        eventModelId: s.eventModelId,
        standId: s.standId,
        brandId: s.brandId,
        occurredAt: now,
        dateKey: "2026-10-30",
        hourKey: "2026-10-30T10",
        isAdminExcluded: false,
      });
      await ctx.db.insert("fairUniqueScans", {
        visitorId: s.visitorId,
        eventId: s.eventId,
        eventModelId: s.eventModelId,
        firstScannedAt: now,
        lastScannedAt: now,
        totalScanCount: 1,
      });
      await ctx.db.insert("fairMetricCountShards", { key: "test:scan_total", shard: 0, value: 1 });
      await ctx.db.insert("fairRatings", {
        visitorId: s.visitorId,
        eventId: s.eventId,
        eventModelId: s.eventModelId,
        appearance: 5,
        createdAt: now,
        updatedAt: now,
      });
      const questionId = await ctx.db.insert("fairAudienceQuestions", {
        eventId: s.eventId,
        eventDayId: s.eventDayId,
        eventModelId: s.eventModelId,
        externalKey: "test-q1",
        prompt: "TEST pitanje",
        options: [
          { id: "a", label: "TEST A", order: 1 },
          { id: "b", label: "TEST B", order: 2 },
        ],
        status: "draft",
        sortOrder: 1,
        startsAt: now,
        showOnSponsoredRotation: false,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("fairAudienceVotes", {
        visitorId: s.visitorId,
        eventId: s.eventId,
        eventModelId: s.eventModelId,
        questionId,
        optionId: "a",
        createdAt: now,
        updatedAt: now,
      });
      const surveyId = await ctx.db.insert("fairSurveys", {
        eventId: s.eventId,
        eventModelId: s.eventModelId,
        status: "draft",
        questions: [
          { id: "q1", prompt: "TEST da/ne", kind: "yes_no", options: [], required: false, order: 1 },
        ],
        version: 1,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("fairSurveyResponses", {
        submissionId: "test-sub-1",
        visitorId: s.visitorId,
        eventId: s.eventId,
        eventModelId: s.eventModelId,
        surveyId,
        answers: [{ questionId: "q1", value: "yes" }],
        submittedAt: now,
      });
      await ctx.db.insert("fairConsentConfigs", {
        eventId: s.eventId,
        leadKind: "interest",
        version: 1,
        text: "TEST nacrt saglasnosti",
        status: "draft",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("fairLeadConfigs", {
        eventModelId: s.eventModelId,
        leadKind: "test_drive",
        contactRequirement: "one_of",
        preferredContact: "phone",
        enabled: false,
        updatedByUserId: s.adminId,
        createdAt: now,
        updatedAt: now,
      });
      const leadId = await ctx.db.insert("fairLeads", {
        submissionId: "test-lead-1",
        kind: "interest",
        visitorId: s.visitorId,
        eventId: s.eventId,
        eventModelId: s.eventModelId,
        participationId: s.participationId,
        contactName: "TEST Posetilac",
        email: "test@example.test",
        consentAccepted: true,
        consentVersion: 1,
        consentTextSnapshot: "TEST nacrt saglasnosti",
        consentedAt: now,
        status: "received",
        followUpSuppressed: false,
        createdAt: now,
        purgeAt: FAIR_PII_PURGE_AT_MS,
      });
      await ctx.db.insert("fairMessageTemplates", {
        eventModelId: s.eventModelId,
        kind: "post_event_follow_up",
        subject: "TEST naslov",
        plainText: "TEST tekst",
        status: "draft",
        version: 1,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("fairEmailDeliveries", {
        dedupeKey: "test-dedupe-1",
        leadId,
        kind: "immediate_confirmation",
        recipient: "test@example.test",
        status: "queued",
        scheduledFor: now,
        attemptCount: 0,
        createdAt: now,
        updatedAt: now,
      });
      // daily_report has no lead (B0: leadId optional).
      await ctx.db.insert("fairEmailDeliveries", {
        dedupeKey: "test-dedupe-2",
        kind: "daily_report",
        recipient: "izvestaj@example.test",
        status: "queued",
        scheduledFor: now,
        attemptCount: 0,
        createdAt: now,
        updatedAt: now,
      });
      const passportConfigId = await ctx.db.insert("fairPassportConfigs", {
        eventId: s.eventId,
        brandId: s.brandId,
        participationId: s.participationId,
        status: "draft",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("fairPassportEligibleModels", {
        passportConfigId,
        eventId: s.eventId,
        brandId: s.brandId,
        eventModelId: s.eventModelId,
        status: "required",
        createdAt: now,
      });
      await ctx.db.insert("fairPassportStamps", {
        visitorId: s.visitorId,
        eventId: s.eventId,
        brandId: s.brandId,
        eventModelId: s.eventModelId,
        scannedAt: now,
      });
      await ctx.db.insert("fairBrandFavoriteVotes", {
        visitorId: s.visitorId,
        eventId: s.eventId,
        brandId: s.brandId,
        eventModelId: s.eventModelId,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("fairReportRuns", {
        eventId: s.eventId,
        eventDayId: s.eventDayId,
        participationId: s.participationId,
        status: "pending_review",
        dataThrough: now,
        format: "pdf",
        createdAt: now,
        updatedAt: now,
      });
      const snapshotId = await ctx.db.insert("fairSponsoredSnapshots", {
        eventId: s.eventId,
        version: 1,
        dayKey: "2026-10-30",
        seed: "test-seed",
        status: "published",
        publishedAt: now,
        publishedByUserId: s.adminId,
      });
      await ctx.db.insert("fairSponsoredSnapshotItems", {
        snapshotId,
        eventModelId: s.eventModelId,
        order: 0,
        audienceQuestionId: questionId,
      });
      await ctx.db.insert("fairSponsoredEvents", {
        requestId: "test-sponsored-1",
        eventId: s.eventId,
        eventModelId: s.eventModelId,
        surface: "garage",
        kind: "garage_add",
        occurredAt: now,
        dateKey: "2026-10-30",
        hourKey: "2026-10-30T10",
        visitorId: s.visitorId,
      });
      await ctx.db.insert("fairPurgeRuns", {
        mode: "dry_run",
        trigger: "cli",
        status: "running",
        startedAt: now,
        updatedAt: now,
        position: 0,
        batches: 0,
        categories: [{ category: "email_deliveries", rows: 0, status: "pending" }],
      });
      // 5 Oct traffic/share delta (Aleksa 8e72c10), round-trip added at the 2026-10-05 sync.
      const shareCollectionId = await ctx.db.insert("fairShareCollections", {
        requestId: "test-share-1",
        codeHash: "c".repeat(64),
        eventId: s.eventId,
        eventModelIds: [s.eventModelId],
        status: "active",
        createdAt: now,
        expiresAt: now + 60_000,
      });
      await ctx.db.insert("fairTrafficEvents", {
        requestId: "test-traffic-1",
        eventId: s.eventId,
        shareCollectionId,
        kind: "share_action",
        channel: "copy",
        modelCount: 1,
        occurredAt: now,
        dateKey: "2026-10-30",
        hourKey: "2026-10-30T10",
      });

      const q = ctx.db;
      return {
        fairEvents: await q.query("fairEvents").withIndex("by_code", (x) => x.eq("code", "test-auto-moto-fest-2026")).unique(),
        fairEventDays: await q.query("fairEventDays").withIndex("by_eventId_and_dateKey", (x) => x.eq("eventId", s.eventId).eq("dateKey", "2026-10-30")).unique(),
        fairParticipations: await q.query("fairParticipations").withIndex("by_eventId_and_externalKey", (x) => x.eq("eventId", s.eventId).eq("externalKey", "test-participation-1")).unique(),
        fairStands: await q.query("fairStands").withIndex("by_eventId_and_mapLocationId", (x) => x.eq("eventId", s.eventId).eq("mapLocationId", "test-hala-1")).unique(),
        fairEventModels: await q.query("fairEventModels").withIndex("by_eventId_and_slug", (x) => x.eq("eventId", s.eventId).eq("slug", "test-model-1")).unique(),
        fairQrAssignments: await q.query("fairQrAssignments").withIndex("by_accessChannelId_and_status", (x) => x.eq("accessChannelId", s.channelId).eq("status", "assigned")).unique(),
        fairPackageActivations: await q.query("fairPackageActivations").withIndex("by_eventModelId_and_activatedAt", (x) => x.eq("eventModelId", s.eventModelId)).unique(),
        fairVisitors: await q.query("fairVisitors").withIndex("by_visitorHash", (x) => x.eq("visitorHash", VISITOR_HASH)).unique(),
        fairScanEvents: await q.query("fairScanEvents").withIndex("by_requestId", (x) => x.eq("requestId", "test-req-1")).unique(),
        fairUniqueScans: await q.query("fairUniqueScans").withIndex("by_visitorId_and_eventModelId", (x) => x.eq("visitorId", s.visitorId).eq("eventModelId", s.eventModelId)).unique(),
        fairMetricCountShards: await q.query("fairMetricCountShards").withIndex("by_key_and_shard", (x) => x.eq("key", "test:scan_total").eq("shard", 0)).unique(),
        fairRatings: await q.query("fairRatings").withIndex("by_visitorId_and_eventModelId", (x) => x.eq("visitorId", s.visitorId).eq("eventModelId", s.eventModelId)).unique(),
        fairAudienceQuestions: await q.query("fairAudienceQuestions").withIndex("by_eventId_and_externalKey", (x) => x.eq("eventId", s.eventId).eq("externalKey", "test-q1")).unique(),
        fairAudienceVotes: await q.query("fairAudienceVotes").withIndex("by_visitorId_and_questionId", (x) => x.eq("visitorId", s.visitorId).eq("questionId", questionId)).unique(),
        fairSurveys: await q.query("fairSurveys").withIndex("by_eventModelId_and_status", (x) => x.eq("eventModelId", s.eventModelId).eq("status", "draft")).unique(),
        fairSurveyResponses: await q.query("fairSurveyResponses").withIndex("by_submissionId", (x) => x.eq("submissionId", "test-sub-1")).unique(),
        fairConsentConfigs: await q.query("fairConsentConfigs").withIndex("by_eventId_and_leadKind_and_version", (x) => x.eq("eventId", s.eventId).eq("leadKind", "interest").eq("version", 1)).unique(),
        fairLeadConfigs: await q.query("fairLeadConfigs").withIndex("by_eventModelId_and_leadKind", (x) => x.eq("eventModelId", s.eventModelId).eq("leadKind", "test_drive")).unique(),
        fairLeads: await q.query("fairLeads").withIndex("by_submissionId", (x) => x.eq("submissionId", "test-lead-1")).unique(),
        fairMessageTemplates: await q.query("fairMessageTemplates").withIndex("by_eventModelId_and_kind_and_status", (x) => x.eq("eventModelId", s.eventModelId).eq("kind", "post_event_follow_up").eq("status", "draft")).unique(),
        fairEmailDeliveries: await q.query("fairEmailDeliveries").withIndex("by_dedupeKey", (x) => x.eq("dedupeKey", "test-dedupe-2")).unique(),
        fairPassportConfigs: await q.query("fairPassportConfigs").withIndex("by_eventId_and_brandId", (x) => x.eq("eventId", s.eventId).eq("brandId", s.brandId)).unique(),
        fairPassportEligibleModels: await q.query("fairPassportEligibleModels").withIndex("by_passportConfigId_and_status", (x) => x.eq("passportConfigId", passportConfigId).eq("status", "required")).unique(),
        fairPassportStamps: await q.query("fairPassportStamps").withIndex("by_visitorId_and_eventModelId", (x) => x.eq("visitorId", s.visitorId).eq("eventModelId", s.eventModelId)).unique(),
        fairBrandFavoriteVotes: await q.query("fairBrandFavoriteVotes").withIndex("by_visitorId_and_eventId_and_brandId", (x) => x.eq("visitorId", s.visitorId).eq("eventId", s.eventId).eq("brandId", s.brandId)).unique(),
        fairReportRuns: await q.query("fairReportRuns").withIndex("by_eventDayId_and_participationId", (x) => x.eq("eventDayId", s.eventDayId).eq("participationId", s.participationId)).unique(),
        fairSponsoredSnapshots: await q.query("fairSponsoredSnapshots").withIndex("by_eventId_and_status", (x) => x.eq("eventId", s.eventId).eq("status", "published")).unique(),
        fairSponsoredSnapshotItems: await q.query("fairSponsoredSnapshotItems").withIndex("by_snapshotId_and_order", (x) => x.eq("snapshotId", snapshotId)).unique(),
        fairSponsoredEvents: await q.query("fairSponsoredEvents").withIndex("by_requestId", (x) => x.eq("requestId", "test-sponsored-1")).unique(),
        fairPurgeRuns: await q.query("fairPurgeRuns").withIndex("by_mode_and_status", (x) => x.eq("mode", "dry_run").eq("status", "running")).unique(),
        fairShareCollections: await q.query("fairShareCollections").withIndex("by_codeHash", (x) => x.eq("codeHash", "c".repeat(64))).unique(),
        fairTrafficEvents: await q.query("fairTrafficEvents").withIndex("by_requestId", (x) => x.eq("requestId", "test-traffic-1")).unique(),
      };
    });

    expect(Object.keys(found).sort()).toEqual(Object.keys(FAIR_INDEXES).sort());
    for (const [table, row] of Object.entries(found)) {
      expect({ table, found: row !== null }).toEqual({ table, found: true });
    }
    expect(found.fairEventModels?.specifications[0].isHighlight).toBe(true);
    expect(found.fairEmailDeliveries?.leadId).toBeUndefined();
    expect(found.fairSponsoredEvents?.surface).toBe("garage");
    expect(found.fairLeads?.consentAccepted).toBe(true);
    expect(found.fairTrafficEvents && "visitorId" in found.fairTrafficEvents).toBe(false);
  });
});

describe("additive changes to existing tables", () => {
  test("fair_model target guard: model id required for fair_model, forbidden elsewhere", () => {
    expect(fairCardTargetProblem({ kind: "fair_model" })).toBe("fair_model_missing_event_model");
    expect(fairCardTargetProblem({ kind: "fair_model", fairEventModelId: undefined })).toBe(
      "fair_model_missing_event_model",
    );
    expect(fairCardTargetProblem({ kind: "fair_model", fairEventModelId: "x" })).toBeUndefined();
    expect(fairCardTargetProblem({ kind: "url", fairEventModelId: "x" })).toBe(
      "fair_event_model_on_other_kind",
    );
    expect(fairCardTargetProblem({ kind: "url" })).toBeUndefined();
  });

  test("a fair_model card target stores its event model; existing targets validate unchanged", async () => {
    const t = newT();
    const s = await seedFairModel(t);
    const rows = await t.run(async (ctx) => {
      const fairTargetId = await ctx.db.insert("cardTargets", {
        cardId: s.cardId,
        kind: "fair_model",
        fairEventModelId: s.eventModelId,
        createdByUserId: s.adminId,
        createdAt: s.now,
      });
      const urlTargetId = await ctx.db.insert("cardTargets", {
        cardId: s.cardId,
        kind: "url",
        url: "https://example.com",
        createdByUserId: s.adminId,
        createdAt: s.now,
      });
      return [await ctx.db.get(fairTargetId), await ctx.db.get(urlTargetId)];
    });
    expect(rows[0]?.fairEventModelId).toBe(s.eventModelId);
    expect(fairCardTargetProblem(rows[0]!)).toBeUndefined();
    expect(rows[1]?.fairEventModelId).toBeUndefined();
    expect(fairCardTargetProblem(rows[1]!)).toBeUndefined();
  });

  test("an account without clientSegment is standard; event_only is stored", async () => {
    const t = newT();
    const s = await seedCatalog(t);
    const accounts = await t.run(async (ctx) => {
      const legacyId = await ctx.db.insert("accounts", {
        name: "TEST postojeći klijent",
        plan: "premium",
        status: "active",
        createdAt: s.now,
        updatedAt: s.now,
      });
      return [await ctx.db.get(legacyId), await ctx.db.get(s.accountId)];
    });
    expect(accounts[0]?.clientSegment).toBeUndefined();
    expect(fairClientSegmentOf(accounts[0]?.clientSegment)).toBe("standard");
    expect(fairClientSegmentOf(accounts[1]?.clientSegment)).toBe("event_only");
  });

  test("inert: the generic card APIs refuse to create a fair_model target", async () => {
    const t = newT();
    const s = await seedCatalog(t);
    const admin = t.withIdentity({ subject: s.adminId, issuer: ISSUER });
    await expect(
      admin.mutation(api.cards.createCard, {
        businessId: s.businessId,
        label: "TEST",
        target: { kind: "fair_model" },
      }),
    ).rejects.toThrow("Odredište kartice nije ispravno podešeno.");
    await expect(
      admin.mutation(api.cardsAdmin.createCard, {
        businessId: s.businessId,
        label: "TEST",
        target: { kind: "fair_model" },
      }),
    ).rejects.toThrow("Odredište kartice nije ispravno podešeno.");
    const fairTargets = await t.run(async (ctx) =>
      (await ctx.db.query("cardTargets").take(10)).filter((row) => row.kind === "fair_model"),
    );
    expect(fairTargets).toEqual([]);
  });

  test("inert: resolveAndRecord answers invalid for a fair_model target and writes no fair scan", async () => {
    const t = newT();
    const s = await seedFairModel(t);
    await t.run(async (ctx) => {
      const targetId = await ctx.db.insert("cardTargets", {
        cardId: s.cardId,
        kind: "fair_model",
        fairEventModelId: s.eventModelId,
        createdByUserId: s.adminId,
        createdAt: s.now,
      });
      await ctx.db.patch(s.cardId, { currentTargetId: targetId });
    });
    const outcome = await t.mutation(api.cards.resolveAndRecord, {
      cardCode: "SAJAM234",
      requestId: "test-fair-inert-1",
      deviceCategory: "mobile",
      ipHash: "test-ip",
    });
    expect(outcome).toEqual({ kind: "invalid" });
    // The resolver reached the fair_model branch: the generic scan row exists
    // (unchanged behavior), and no fair scan is written before B2.
    const genericScans = await t.run(async (ctx) =>
      ctx.db
        .query("cardScanEvents")
        .withIndex("by_requestId", (q) => q.eq("requestId", "test-fair-inert-1"))
        .take(10),
    );
    expect(genericScans.map((row) => row.targetKind)).toEqual(["fair_model"]);
    const fairScans = await t.run(async (ctx) => ctx.db.query("fairScanEvents").take(10));
    expect(fairScans).toEqual([]);
  });
});

describe("contract types and Convex validators never drift", () => {
  test("validator unions equal the lib/fair-contract.ts types", () => {
    expectTypeOf<Infer<typeof fairPackageTier>>().toEqualTypeOf<FairPackageTier>();
    expectTypeOf<Infer<typeof fairEventStatus>>().toEqualTypeOf<FairEventStatus>();
    expectTypeOf<Infer<typeof fairModelStatus>>().toEqualTypeOf<FairModelStatus>();
    expectTypeOf<Infer<typeof fairLeadKind>>().toEqualTypeOf<FairLeadKind>();
    expectTypeOf<Infer<typeof fairContactRequirement>>().toEqualTypeOf<FairContactRequirement>();
    expectTypeOf<Infer<typeof fairReportStatus>>().toEqualTypeOf<FairReportStatus>();
    expectTypeOf<Infer<typeof fairSurveyQuestionKind>>().toEqualTypeOf<FairSurveyQuestionKind>();
    expectTypeOf<Infer<typeof fairSponsoredActionKind>>().toEqualTypeOf<FairSponsoredActionKind>();
    expectTypeOf<Infer<typeof fairSponsoredActionSurface>>().toEqualTypeOf<FairSponsoredActionSurface>();
    expectTypeOf<Infer<typeof fairClientSegment>>().toEqualTypeOf<FairClientSegment>();
  });

  test("stored documents expose the contract types", () => {
    expectTypeOf<Doc<"accounts">["clientSegment"]>().toEqualTypeOf<FairClientSegment | undefined>();
    expectTypeOf<Doc<"adminClientReadModels">["clientSegment"]>().toEqualTypeOf<
      FairClientSegment | undefined
    >();
    expectTypeOf<Doc<"adminVenueReadModels">["clientSegment"]>().toEqualTypeOf<
      FairClientSegment | undefined
    >();
    expectTypeOf<Doc<"cardTargets">["fairEventModelId"]>().toEqualTypeOf<
      Id<"fairEventModels"> | undefined
    >();
    expectTypeOf<Doc<"fairEventModels">["packageTier"]>().toEqualTypeOf<FairPackageTier>();
    expectTypeOf<Doc<"fairLeads">["consentAccepted"]>().toEqualTypeOf<true>();
    expectTypeOf<Doc<"fairSponsoredEvents">["surface"]>().toEqualTypeOf<"garage">();
  });

  test("the PII purge instant is 16 Nov 2026 00:00 in Europe/Belgrade", () => {
    expect(new Date(FAIR_PII_PURGE_AT_MS).toISOString()).toBe("2026-11-15T23:00:00.000Z");
  });
});
