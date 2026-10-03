/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import type { FunctionReturnType } from "convex/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const NOW = Date.parse("2026-09-11T12:00:00Z");
const ADMIN_EMAIL = "admin@scanme.test";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  process.env.SCANME_ADMIN_EMAILS = ADMIN_EMAIL;
});

afterEach(() => vi.useRealTimers());

function identity(userId: Id<"users">) {
  return { subject: userId, issuer: "https://admin-08.test" };
}

async function seed() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const adminId = await ctx.db.insert("users", {
      email: ADMIN_EMAIL,
      name: "Mina Admin",
    });
    const clientId = await ctx.db.insert("users", { email: "ana@example.invalid" });
    const outsiderId = await ctx.db.insert("users", { email: "outsider@example.invalid" });
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
      normalizedPhone: "381641234567",
      positionTitle: "Vlasnica",
      isOwner: true,
      status: "active",
      authUserId: clientId,
      createdAt: NOW - 9_000,
      updatedAt: NOW - 9_000,
    });
    const secondContactId = await ctx.db.insert("accountContacts", {
      accountId,
      firstName: "Marko",
      lastName: "Ilić",
      normalizedName: "marko ilic",
      positionTitle: "Operativa",
      isOwner: false,
      status: "active",
      createdAt: NOW - 8_000,
      updatedAt: NOW - 8_000,
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
      createdAt: NOW - 7_000,
      updatedAt: NOW - 7_000,
    });
    await ctx.db.patch(accountId, {
      defaultContactId: contactId,
      primaryOwnerMembershipId: membershipId,
    });
    const businessId = await ctx.db.insert("businesses", {
      accountId,
      name: "Bistro Zelen Dorćol",
      normalizedName: "bistro zelen dorcol",
      slug: "bistro-zelen-admin-08",
      kind: "business",
      smlCode: "SML-BZE-001",
      clientStatus: "active",
      adminV1MigrationVersion: 1,
      status: "active",
      createdAt: NOW - 6_000,
      updatedAt: NOW - 6_000,
    });

    const otherAccountId = await ctx.db.insert("accounts", {
      name: "Drugi nalog",
      plan: "basic",
      status: "active",
      smkCode: "SMK-DRU-001",
      ownerDisplayName: "Drugi Vlasnik",
      normalizedOwnerDisplayName: "drugi vlasnik",
      clientStatus: "active",
      adminV1MigrationVersion: 1,
      createdAt: NOW - 5_000,
      updatedAt: NOW - 5_000,
    });
    const otherContactId = await ctx.db.insert("accountContacts", {
      accountId: otherAccountId,
      firstName: "Drugi",
      lastName: "Kontakt",
      normalizedName: "drugi kontakt",
      positionTitle: "Vlasnik",
      isOwner: true,
      status: "active",
      authUserId: outsiderId,
      createdAt: NOW - 4_000,
      updatedAt: NOW - 4_000,
    });
    const otherMembershipId = await ctx.db.insert("accountMemberships", {
      accountId: otherAccountId,
      userId: outsiderId,
      contactId: otherContactId,
      role: "full_access",
      active: true,
      venueAccess: "all",
      canBuyServices: false,
      canBuyPremium: false,
      createdAt: NOW - 3_000,
      updatedAt: NOW - 3_000,
    });
    await ctx.db.patch(otherAccountId, {
      defaultContactId: otherContactId,
      primaryOwnerMembershipId: otherMembershipId,
    });
    const otherBusinessId = await ctx.db.insert("businesses", {
      accountId: otherAccountId,
      name: "Drugi lokal",
      slug: "drugi-lokal-admin-08",
      kind: "business",
      smlCode: "SML-DRU-001",
      clientStatus: "active",
      adminV1MigrationVersion: 1,
      status: "active",
      createdAt: NOW - 2_000,
      updatedAt: NOW - 2_000,
    });
    return {
      adminId,
      clientId,
      outsiderId,
      accountId,
      contactId,
      secondContactId,
      businessId,
      otherAccountId,
      otherBusinessId,
    };
  });
  return {
    t,
    ...ids,
    admin: t.withIdentity(identity(ids.adminId)),
    client: t.withIdentity(identity(ids.clientId)),
    outsider: t.withIdentity(identity(ids.outsiderId)),
  };
}

const page = { numItems: 20, cursor: null };

describe("ADMIN-08 provider-neutral communication core", () => {
  test("client send is exact-once and a new message reopens a completed conversation", async () => {
    const fixture = await seed();
    const first = await fixture.client.mutation(api.clientCommunications.sendPanelMessage, {
      slug: "bistro-zelen-admin-08",
      clientMessageId: "client-msg-1",
      content: "Potrebna mi je pomoć oko menija.",
    });
    const retry = await fixture.client.mutation(api.clientCommunications.sendPanelMessage, {
      slug: "bistro-zelen-admin-08",
      clientMessageId: "client-msg-1",
      content: "Potrebna mi je pomoć oko menija.",
    });
    expect(retry).toMatchObject({
      conversationId: first.conversationId,
      messageId: first.messageId,
      duplicate: true,
    });
    expect(await fixture.t.run((ctx) => ctx.db.query("conversationMessages").collect())).toHaveLength(1);

    await fixture.admin.mutation(api.adminCommunications.setStatus, {
      conversationId: first.conversationId,
      status: "completed",
    });
    vi.setSystemTime(NOW + 1_000);
    await fixture.client.mutation(api.clientCommunications.sendPanelMessage, {
      slug: "bistro-zelen-admin-08",
      clientMessageId: "client-msg-2",
      content: "Imam još jedno pitanje.",
    });
    const conversation = await fixture.t.run((ctx) => ctx.db.get(first.conversationId));
    expect(conversation).toMatchObject({ status: "needs_reply", adminUnreadCount: 2 });
    const events = await fixture.t.run((ctx) =>
      ctx.db
        .query("conversationEvents")
        .withIndex("by_conversationId_and_createdAt", (q) => q.eq("conversationId", first.conversationId))
        .collect(),
    );
    expect(events.some((event) =>
      event.event === "status_changed" &&
      event.fromStatus === "completed" &&
      event.toStatus === "needs_reply" &&
      event.actorContactId === fixture.contactId
    )).toBe(true);
  });

  test("sent, delivered and read receipts follow only real client open events", async () => {
    const fixture = await seed();
    const inbound = await fixture.client.mutation(api.clientCommunications.sendPanelMessage, {
      slug: "bistro-zelen-admin-08",
      clientMessageId: "receipt-inbound",
      content: "Da li je poruka stigla?",
    });
    vi.setSystemTime(NOW + 1_000);
    await fixture.admin.mutation(api.adminCommunications.reply, {
      conversationId: inbound.conversationId,
      content: "Stigla je, proveravamo.",
    });
    const latestDelivery = async () => (await fixture.admin.query(
      api.adminCommunications.listMessages,
      { conversationId: inbound.conversationId, paginationOpts: { numItems: 1, cursor: null } },
    )).page[0]?.deliveryState;
    expect(await latestDelivery()).toBe("sent");

    vi.setSystemTime(NOW + 2_000);
    await fixture.client.mutation(api.clientCommunications.markPanelAvailable, {
      slug: "bistro-zelen-admin-08",
    });
    expect(await latestDelivery()).toBe("delivered");

    vi.setSystemTime(NOW + 3_000);
    await fixture.client.mutation(api.clientCommunications.markConversationRead, {
      slug: "bistro-zelen-admin-08",
    });
    expect(await latestDelivery()).toBe("read");

    const clientView = await fixture.client.query(api.clientCommunications.getPanelConversation, {
      slug: "bistro-zelen-admin-08",
    });
    expect(clientView.status).toBe("available");
    const serialized = JSON.stringify(clientView);
    expect(serialized).not.toContain("deliveryState");
    expect(serialized).not.toContain("adminUnreadCount");
    expect(serialized).not.toContain("assignee");
    expect(serialized).not.toContain("waiting_client");
  });

  test("account authorization isolates clients while an admin can read the Inbox", async () => {
    const fixture = await seed();
    await expect(fixture.outsider.mutation(api.clientCommunications.sendPanelMessage, {
      slug: "bistro-zelen-admin-08",
      clientMessageId: "wrong-account",
      content: "Ne pripadam ovom nalogu.",
    })).rejects.toThrow("client_chat_unavailable");
    const sent = await fixture.client.mutation(api.clientCommunications.sendPanelMessage, {
      slug: "bistro-zelen-admin-08",
      clientMessageId: "right-account",
      content: "Pripadajuća poruka.",
    });
    const inbox = await fixture.admin.query(api.adminCommunications.listInbox, {
      paginationOpts: page,
    });
    expect(inbox.page[0]).toMatchObject({
      id: sent.conversationId,
      accountId: fixture.accountId,
      contactId: fixture.contactId,
      channel: "panel_chat",
      adminUnreadCount: 1,
    });
    await expect(fixture.outsider.query(api.adminCommunications.listInbox, {
      paginationOpts: page,
    })).rejects.toThrow("Nemate administratorski pristup");
    await expect(fixture.admin.mutation(api.adminCommunications.logManualEntry, {
      accountId: fixture.accountId,
      contactId: fixture.contactId,
      businessId: fixture.otherBusinessId,
      channel: "phone",
      content: "Nevažeća kombinacija naloga i lokala.",
    })).rejects.toThrow("admin_communications_context_invalid");
  });

  test("status, assignee and manual entry keep real admin audit evidence", async () => {
    const fixture = await seed();
    const manual = await fixture.admin.mutation(api.adminCommunications.logManualEntry, {
      accountId: fixture.accountId,
      contactId: fixture.contactId,
      businessId: fixture.businessId,
      channel: "phone",
      content: "Poziv sa Anom: dogovorena provera jelovnika.",
    });
    await fixture.admin.mutation(api.adminCommunications.setAssignee, {
      conversationId: manual.conversationId,
      assigneeAdminId: null,
    });
    await fixture.admin.mutation(api.adminCommunications.setAssignee, {
      conversationId: manual.conversationId,
      assigneeAdminId: fixture.adminId,
    });
    await fixture.admin.mutation(api.adminCommunications.setStatus, {
      conversationId: manual.conversationId,
      status: "waiting_client",
    });
    await fixture.admin.mutation(api.adminCommunications.setStatus, {
      conversationId: manual.conversationId,
      status: "completed",
    });
    const evidence = await fixture.t.run(async (ctx) => ({
      message: await ctx.db.get(manual.messageId),
      events: await ctx.db
        .query("conversationEvents")
        .withIndex("by_conversationId_and_createdAt", (q) => q.eq("conversationId", manual.conversationId))
        .collect(),
      audit: await ctx.db
        .query("adminAuditLog")
        .withIndex("by_accountId_and_createdAt", (q) => q.eq("accountId", fixture.accountId))
        .collect(),
    }));
    expect(evidence.message).toMatchObject({
      authorUserId: fixture.adminId,
      authorDisplayName: "Mina Admin",
      contactId: fixture.contactId,
      businessId: fixture.businessId,
      channel: "phone",
      createdAt: NOW,
    });
    expect(evidence.events.some((event) => event.event === "manual_entry_logged" && event.actorUserId === fixture.adminId)).toBe(true);
    expect(evidence.events.some((event) => event.event === "assignee_changed" && event.nextAssigneeAdminId === fixture.adminId)).toBe(true);
    expect(evidence.events.some((event) => event.event === "status_changed" && event.toStatus === "completed")).toBe(true);
    expect(evidence.audit.map((entry) => entry.action)).toEqual(expect.arrayContaining([
      "admin_v1_manual_communication_logged",
      "admin_v1_conversation_assignee_changed",
      "admin_v1_conversation_status_changed",
    ]));
    expect(evidence.audit.some((entry) => entry.detail?.includes("dogovorena"))).toBe(false);
  });

  test("profile contact filtering is exact and uses the same Inbox source", async () => {
    const fixture = await seed();
    await fixture.admin.mutation(api.adminCommunications.logManualEntry, {
      accountId: fixture.accountId,
      contactId: fixture.contactId,
      channel: "in_person",
      content: "Sastanak sa Anom.",
    });
    await fixture.admin.mutation(api.adminCommunications.logManualEntry, {
      accountId: fixture.accountId,
      contactId: fixture.secondContactId,
      channel: "copied_message",
      content: "Kopirana Viber poruka od Marka.",
    });
    const contactView = await fixture.admin.query(api.adminCommunications.listInbox, {
      paginationOpts: page,
      accountId: fixture.accountId,
      contactId: fixture.contactId,
    });
    expect(contactView.page).toHaveLength(1);
    expect(contactView.page[0].contactId).toBe(fixture.contactId);
    const accountView = await fixture.admin.query(api.adminCommunications.listInbox, {
      paginationOpts: page,
      accountId: fixture.accountId,
    });
    expect(new Set(accountView.page.map((row) => row.contactId))).toEqual(
      new Set([fixture.contactId, fixture.secondContactId]),
    );
  });

  test("Inbox filters and cursor pagination stay server-side and stable", async () => {
    const fixture = await seed();
    await fixture.admin.mutation(api.adminCommunications.logManualEntry, {
      accountId: fixture.accountId,
      contactId: fixture.contactId,
      channel: "phone",
      content: "Telefonska provera za Anu.",
    });
    vi.setSystemTime(NOW + 1_000);
    await fixture.admin.mutation(api.adminCommunications.logManualEntry, {
      accountId: fixture.accountId,
      contactId: fixture.secondContactId,
      channel: "in_person",
      content: "Sastanak sa Markom u lokalu.",
    });
    const first = await fixture.admin.query(api.adminCommunications.listInbox, {
      paginationOpts: { numItems: 1, cursor: null },
      accountId: fixture.accountId,
      status: "in_progress",
    });
    const second = await fixture.admin.query(api.adminCommunications.listInbox, {
      paginationOpts: { numItems: 1, cursor: first.continueCursor },
      accountId: fixture.accountId,
      status: "in_progress",
    });
    expect(first.page).toHaveLength(1);
    expect(second.page).toHaveLength(1);
    expect(first.page[0].id).not.toBe(second.page[0].id);
    const searched = await fixture.admin.query(api.adminCommunications.listInbox, {
      paginationOpts: page,
      search: "Marko",
      channel: "in_person",
    });
    expect(searched.page).toHaveLength(1);
    expect(searched.page[0]).toMatchObject({
      contactId: fixture.secondContactId,
      channel: "in_person",
    });
  });

  test("large message history is admin-only, stable and cursor-paginated within read limits", async () => {
    const t = convexTest({
      schema,
      modules,
      transactionLimits: { databaseQueries: 4, documentsRead: 250 },
    });
    const ids = await t.run(async (ctx) => {
      const adminId = await ctx.db.insert("users", { email: ADMIN_EMAIL, name: "Mina Admin" });
      const outsiderId = await ctx.db.insert("users", { email: "history-outsider@example.invalid" });
      const accountId = await ctx.db.insert("accounts", {
        name: "Velika istorija", plan: "basic", status: "active",
        createdAt: 1, updatedAt: 1,
      });
      const contactId = await ctx.db.insert("accountContacts", {
        accountId, firstName: "Ana", lastName: "Istorija",
        normalizedName: "ana istorija", positionTitle: "Vlasnica",
        isOwner: true, status: "active", createdAt: 1, updatedAt: 1,
      });
      const conversationId = await ctx.db.insert("conversations", {
        accountId, accountName: "Velika istorija", smkCode: "SMK-HIS-001",
        contactId, contactName: "Ana Istorija", channel: "panel_chat",
        status: "in_progress", assigneeKey: "unassigned",
        latestMessagePreview: "Poruka 136", latestMessageAt: NOW + 136,
        latestMessageDirection: "client_to_admin", latestMessageAuthorName: "Ana Istorija",
        adminUnreadCount: 137, searchText: "velika istorija ana",
        createdAt: NOW, updatedAt: NOW + 136,
      });
      for (let index = 0; index < 137; index += 1) {
        await ctx.db.insert("conversationMessages", {
          conversationId, accountId, contactId, channel: "panel_chat",
          direction: "client_to_admin", authorKind: "client",
          authorContactId: contactId, authorDisplayName: "Ana Istorija",
          content: `Poruka ${index}`, createdAt: NOW + index,
        });
      }
      return { adminId, outsiderId, conversationId };
    });
    const admin = t.withIdentity(identity(ids.adminId));
    const outsider = t.withIdentity(identity(ids.outsiderId));
    await expect(t.query(api.adminCommunications.listMessages, {
      conversationId: ids.conversationId,
      paginationOpts: { numItems: 37, cursor: null },
    })).rejects.toThrow();
    await expect(outsider.query(api.adminCommunications.listMessages, {
      conversationId: ids.conversationId,
      paginationOpts: { numItems: 37, cursor: null },
    })).rejects.toThrow("administratorski");

    const seen: string[] = [];
    let cursor: string | null = null;
    let firstPageIds: string[] | null = null;
    do {
      const result: FunctionReturnType<typeof api.adminCommunications.listMessages> = await admin.query(api.adminCommunications.listMessages, {
        conversationId: ids.conversationId,
        paginationOpts: { numItems: 37, cursor },
      });
      if (cursor === null) {
        firstPageIds = result.page.map((row) => row.id);
        const repeat = await admin.query(api.adminCommunications.listMessages, {
          conversationId: ids.conversationId,
          paginationOpts: { numItems: 37, cursor: null },
        });
        expect(repeat.page.map((row) => row.id)).toEqual(firstPageIds);
      }
      seen.push(...result.page.map((row) => row.id));
      cursor = result.isDone ? null : result.continueCursor;
      if (result.isDone) break;
    } while (cursor);
    expect(seen).toHaveLength(137);
    expect(new Set(seen)).toHaveLength(137);
    expect(firstPageIds).toHaveLength(37);

    await expect(admin.query(api.adminCommunications.listMessages, {
      conversationId: ids.conversationId,
      paginationOpts: { numItems: 37, cursor: "invalid-cursor" },
    })).rejects.toThrow();
    const retry = await admin.query(api.adminCommunications.listMessages, {
      conversationId: ids.conversationId,
      paginationOpts: { numItems: 37, cursor: null },
    });
    expect(retry.page.map((row) => row.id)).toEqual(firstPageIds);

    await t.run((ctx) => ctx.db.delete(ids.conversationId));
    await expect(admin.query(api.adminCommunications.listMessages, {
      conversationId: ids.conversationId,
      paginationOpts: { numItems: 37, cursor: null },
    })).rejects.toThrow("admin_communications_not_found");
    expect(await admin.query(api.adminCommunications.getConversation, {
      conversationId: ids.conversationId,
    })).toBeNull();
  });
});
