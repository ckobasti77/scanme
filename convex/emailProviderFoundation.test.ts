/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const NOW = Date.parse("2026-09-12T12:00:00Z");
const ADMIN_EMAIL = "admin@scanme.test";

type InboundArgs = {
  connectionId: Id<"emailProviderConnections">;
  providerAccountId: string;
  providerMessageId: string;
  folderId: string;
  providerThreadId?: string;
  rfcMessageId?: string;
  inReplyTo?: string;
  references: string[];
  senderAddress: string;
  subject: string;
  safePreview: string;
  plainTextContent: string;
  receivedAt: number;
  providerReadState?: string;
  hasAttachment: boolean;
  now: number;
};

type PersistResult = {
  providerMessageRef: Id<"emailProviderMessages">;
  mappingState: "matched" | "unmatched" | "ambiguous" | "poisoned";
  conversationId: Id<"conversations"> | null;
  conversationMessageId: Id<"conversationMessages"> | null;
  duplicate: boolean;
};

const persistInbound = makeFunctionReference<"mutation", InboundArgs, PersistResult>(
  "emailProviderFoundation:persistInbound",
);
const persistAttachmentMetadata = makeFunctionReference<"mutation", {
  providerMessageRef: Id<"emailProviderMessages">;
  attachments: Array<{
    providerAttachmentId: string;
    fileName: string;
    size: number;
    inline: boolean;
  }>;
  now: number;
}, { count: number }>("emailProviderFoundation:persistAttachmentMetadata");
const getStatus = makeFunctionReference<"query", Record<string, never>, {
  provider: "zoho";
  operationalState: string;
  configured: boolean;
  syncEnabled: boolean;
  outboundEnabled: boolean;
}>("emailProviderFoundation:getStatus");
const queueOutbound = makeFunctionReference<"mutation", {
  conversationId: Id<"conversations">;
  sendCommandId: string;
  subject: string;
  plainTextContent: string;
  replyToProviderMessageId?: string;
}, { outboxId: Id<"emailProviderOutbox">; state: string; duplicate: boolean }>(
  "emailProviderFoundation:queueOutbound",
);
const transitionOutbox = makeFunctionReference<"mutation", {
  outboxId: Id<"emailProviderOutbox">;
  expectedState: "pending" | "sending" | "sent" | "failed" | "needs_reconciliation";
  nextState: "pending" | "sending" | "sent" | "failed" | "needs_reconciliation";
  providerMessageId?: string;
  providerMailId?: string;
  safeCode?: string;
  now: number;
}, { state: string; duplicate: boolean }>("emailProviderFoundation:transitionOutbox");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  process.env.SCANME_ADMIN_EMAILS = ADMIN_EMAIL;
});

afterEach(() => vi.useRealTimers());

function identity(userId: Id<"users">) {
  return { subject: userId, issuer: "https://admin-09b.test" };
}

async function seed() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const adminId = await ctx.db.insert("users", { email: ADMIN_EMAIL, name: "Mina Admin" });
    const clientId = await ctx.db.insert("users", { email: "ana@example.invalid" });
    const accountId = await ctx.db.insert("accounts", {
      name: "Bistro Zelen d.o.o.",
      plan: "premium",
      status: "active",
      billingModel: "subscriptions_v1",
      smkCode: "SMK-BZE-001",
      ownerDisplayName: "Ana Petrović",
      normalizedOwnerDisplayName: "ana petrovic",
      clientStatus: "active",
      adminV1MigrationVersion: 1,
      createdAt: NOW - 10_000,
      updatedAt: NOW - 10_000,
    });
    const contactId = await ctx.db.insert("accountContacts", {
      accountId,
      firstName: "Ana",
      lastName: "Petrović",
      normalizedName: "ana petrovic",
      normalizedEmail: "ana@example.invalid",
      positionTitle: "Vlasnica",
      isOwner: true,
      status: "active",
      authUserId: clientId,
      createdAt: NOW - 9_000,
      updatedAt: NOW - 9_000,
    });
    const membershipId = await ctx.db.insert("accountMemberships", {
      accountId,
      userId: clientId,
      contactId,
      role: "full_access",
      active: true,
      venueAccess: "all",
      canBuyServices: true,
      canBuyPremium: true,
      createdAt: NOW - 8_000,
      updatedAt: NOW - 8_000,
    });
    await ctx.db.patch(accountId, {
      defaultContactId: contactId,
      primaryOwnerMembershipId: membershipId,
    });
    const connectionId = await ctx.db.insert("emailProviderConnections", {
      provider: "zoho",
      operationalState: "disabled",
      providerAccountId: "1001",
      inboxFolderId: "2001",
      sentFolderId: "2002",
      fromAddress: "office@scanme.invalid",
      syncEnabled: false,
      outboundEnabled: false,
      groupSendAsVerified: false,
      createdAt: NOW - 7_000,
      updatedAt: NOW - 7_000,
    });
    return { adminId, clientId, accountId, contactId, connectionId };
  });
  return {
    t,
    ...ids,
    admin: t.withIdentity(identity(ids.adminId)),
    client: t.withIdentity(identity(ids.clientId)),
  };
}

function inbound(
  connectionId: Id<"emailProviderConnections">,
  providerMessageId: string,
  overrides: Partial<InboundArgs> = {},
): InboundArgs {
  return {
    connectionId,
    providerAccountId: "1001",
    providerMessageId,
    folderId: "2001",
    providerThreadId: "4001",
    rfcMessageId: `<${providerMessageId}@example.invalid>`,
    references: [],
    senderAddress: "ana@example.invalid",
    subject: "Pitanje o meniju",
    safePreview: "Potrebna mi je pomoć.",
    plainTextContent: "Potrebna mi je pomoć oko menija.",
    receivedAt: NOW,
    providerReadState: "0",
    hasAttachment: false,
    now: NOW,
    ...overrides,
  };
}

describe("ADMIN-09B provider foundation", () => {
  test("known sender maps exact-once into ADMIN-08 and increments unread once", async () => {
    const fixture = await seed();
    const first = await fixture.t.mutation(persistInbound, inbound(fixture.connectionId, "3001"));
    const duplicate = await fixture.t.mutation(persistInbound, inbound(fixture.connectionId, "3001"));
    expect(first).toMatchObject({ mappingState: "matched", duplicate: false });
    expect(duplicate).toMatchObject({
      providerMessageRef: first.providerMessageRef,
      conversationId: first.conversationId,
      conversationMessageId: first.conversationMessageId,
      duplicate: true,
    });
    const snapshot = await fixture.t.run(async (ctx) => ({
      conversation: first.conversationId ? await ctx.db.get(first.conversationId) : null,
      messages: await ctx.db.query("conversationMessages").collect(),
      events: await ctx.db.query("conversationEvents").collect(),
    }));
    expect(snapshot.conversation).toMatchObject({
      channel: "email",
      adminUnreadCount: 1,
      status: "new",
    });
    expect(snapshot.messages).toHaveLength(1);
    expect(snapshot.events.filter((event) => event.event === "client_message_received")).toHaveLength(1);
  });

  test("unknown and ambiguous senders remain staged without invented client links", async () => {
    const fixture = await seed();
    const unknown = await fixture.t.mutation(persistInbound, inbound(fixture.connectionId, "3002", {
      senderAddress: "unknown@example.invalid",
    }));
    expect(unknown).toMatchObject({ mappingState: "unmatched", conversationId: null });

    await fixture.t.run(async (ctx) => {
      const secondAccountId = await ctx.db.insert("accounts", {
        name: "Drugi nalog",
        plan: "basic",
        status: "active",
        smkCode: "SMK-DRU-001",
        ownerDisplayName: "Drugi Vlasnik",
        normalizedOwnerDisplayName: "drugi vlasnik",
        clientStatus: "active",
        adminV1MigrationVersion: 1,
        createdAt: NOW,
        updatedAt: NOW,
      });
      await ctx.db.insert("accountContacts", {
        accountId: secondAccountId,
        firstName: "Druga",
        lastName: "Ana",
        normalizedName: "druga ana",
        normalizedEmail: "ana@example.invalid",
        positionTitle: "Vlasnica",
        isOwner: true,
        status: "active",
        createdAt: NOW,
        updatedAt: NOW,
      });
    });
    const ambiguous = await fixture.t.mutation(persistInbound, inbound(fixture.connectionId, "3003"));
    expect(ambiguous).toMatchObject({ mappingState: "ambiguous", conversationId: null });
    expect(await fixture.t.run((ctx) => ctx.db.query("conversations").collect())).toHaveLength(0);
  });

  test("provider thread and RFC reply signals attach later messages to the same conversation", async () => {
    const fixture = await seed();
    const first = await fixture.t.mutation(persistInbound, inbound(fixture.connectionId, "3010"));
    const byThread = await fixture.t.mutation(persistInbound, inbound(fixture.connectionId, "3011", {
      rfcMessageId: "<thread-reply@example.invalid>",
      receivedAt: NOW + 1,
    }));
    const byRfc = await fixture.t.mutation(persistInbound, inbound(fixture.connectionId, "3012", {
      providerThreadId: undefined,
      rfcMessageId: "<rfc-reply@example.invalid>",
      inReplyTo: "<3010@example.invalid>",
      receivedAt: NOW + 2,
    }));
    expect(byThread.conversationId).toBe(first.conversationId);
    expect(byRfc.conversationId).toBe(first.conversationId);
    expect(await fixture.t.run((ctx) => ctx.db.query("conversations").collect())).toHaveLength(1);
  });

  test("public status and outbox commands require admin, and command ids are idempotent", async () => {
    const fixture = await seed();
    await expect(fixture.t.query(getStatus, {})).rejects.toThrow();
    await expect(fixture.client.query(getStatus, {})).rejects.toThrow();
    expect(await fixture.admin.query(getStatus, {})).toMatchObject({
      provider: "zoho",
      configured: true,
      syncEnabled: false,
      outboundEnabled: false,
      operationalState: "disabled",
    });

    const mapped = await fixture.t.mutation(persistInbound, inbound(fixture.connectionId, "3020"));
    if (!mapped.conversationId) throw new Error("expected mapped conversation");
    const command = {
      conversationId: mapped.conversationId,
      sendCommandId: "send-3020",
      subject: "Odgovor",
      plainTextContent: "Hvala na poruci.",
      replyToProviderMessageId: "3020",
    };
    await expect(fixture.client.mutation(queueOutbound, command)).rejects.toThrow();
    const first = await fixture.admin.mutation(queueOutbound, command);
    const duplicate = await fixture.admin.mutation(queueOutbound, command);
    expect(first).toMatchObject({ state: "pending", duplicate: false });
    expect(duplicate).toMatchObject({ outboxId: first.outboxId, state: "pending", duplicate: true });
    await expect(fixture.admin.mutation(queueOutbound, {
      ...command,
      subject: "Drugačiji odgovor",
    })).rejects.toThrow("email_provider_command_conflict");
  });

  test("uncertain send is reconciliation-only, attachment metadata is idempotent, and audit is secret-free", async () => {
    const fixture = await seed();
    const mapped = await fixture.t.mutation(persistInbound, inbound(fixture.connectionId, "3030", {
      hasAttachment: true,
    }));
    if (!mapped.conversationId) throw new Error("expected mapped conversation");
    const queued = await fixture.admin.mutation(queueOutbound, {
      conversationId: mapped.conversationId,
      sendCommandId: "send-3030",
      subject: "Odgovor",
      plainTextContent: "TAJNI SADRŽAJ PORUKE",
      replyToProviderMessageId: "3030",
    });
    await fixture.t.mutation(transitionOutbox, {
      outboxId: queued.outboxId,
      expectedState: "pending",
      nextState: "sending",
      now: NOW + 1,
    });
    const uncertain = await fixture.t.mutation(transitionOutbox, {
      outboxId: queued.outboxId,
      expectedState: "sending",
      nextState: "needs_reconciliation",
      safeCode: "zoho_send_outcome_unknown",
      now: NOW + 2,
    });
    expect(uncertain.state).toBe("needs_reconciliation");
    await expect(fixture.t.mutation(transitionOutbox, {
      outboxId: queued.outboxId,
      expectedState: "pending",
      nextState: "sending",
      now: NOW + 3,
    })).rejects.toThrow("email_provider_outbox_transition_invalid");

    const attachment = {
      providerMessageRef: mapped.providerMessageRef,
      attachments: [{ providerAttachmentId: "5001", fileName: "racun.pdf", size: 42, inline: false }],
      now: NOW + 4,
    };
    await fixture.t.mutation(persistAttachmentMetadata, attachment);
    await fixture.t.mutation(persistAttachmentMetadata, attachment);
    const snapshot = await fixture.t.run(async (ctx) => ({
      attachments: await ctx.db.query("emailProviderAttachments").collect(),
      outbox: await ctx.db.get(queued.outboxId),
      audits: await ctx.db.query("emailProviderAudit").collect(),
    }));
    expect(snapshot.attachments).toHaveLength(1);
    expect(snapshot.outbox).toMatchObject({
      state: "needs_reconciliation",
      reconciliationAttempt: 1,
    });
    expect(snapshot.outbox).not.toHaveProperty("providerMessageId");
    const auditJson = JSON.stringify(snapshot.audits);
    expect(auditJson).not.toContain("TAJNI SADRŽAJ PORUKE");
    expect(auditJson).not.toMatch(/access[_-]?token|refresh[_-]?token|client[_-]?secret/i);
  });

  test("a provider message from another account is rejected", async () => {
    const fixture = await seed();
    await expect(fixture.t.mutation(persistInbound, inbound(fixture.connectionId, "3040", {
      providerAccountId: "9999",
    }))).rejects.toThrow("email_provider_account_not_allowed");
  });
});
