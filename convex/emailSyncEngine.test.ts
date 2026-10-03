import { describe, expect, test, vi } from "vitest";
import {
  EmailProviderHttpError,
  EmailProviderPayloadError,
  type EmailProviderAttachment,
  type EmailProviderListMessage,
  type EmailProviderTransport,
} from "./lib/emailProvider";
import {
  runIncrementalEmailSync,
  type EmailSyncCheckpoint,
  type EmailSyncStore,
  type PersistInboundInput,
  type StoredProviderMessage,
} from "./lib/emailSyncEngine";

const NOW = Date.parse("2026-09-12T12:00:00Z");

function message(id: number, receivedAt = NOW - id) : EmailProviderListMessage {
  return {
    providerMessageId: String(id),
    folderId: "2001",
    providerThreadId: null,
    subject: `Poruka ${id}`,
    senderAddress: "ana@example.invalid",
    recipientAddress: "office@scanme.invalid",
    receivedAt,
    providerReadState: "0",
    safePreview: `Tekst ${id}`,
    hasAttachment: false,
  };
}

class MemoryStore implements EmailSyncStore {
  leaseAvailable = true;
  checkpoint: EmailSyncCheckpoint = {
    checkpointReceivedAt: null,
    checkpointProviderMessageId: null,
    continuationStart: null,
    retryAttempt: 0,
    nextAttemptAt: null,
  };
  readonly messages = new Map<string, StoredProviderMessage>();
  readonly persisted: PersistInboundInput[] = [];
  readonly poison: string[] = [];
  readonly attachmentFailures: string[] = [];
  readonly attachments = new Map<string, EmailProviderAttachment[]>();
  failures: Parameters<EmailSyncStore["recordFailure"]>[0][] = [];
  checkpointCommits: Parameters<EmailSyncStore["commitCheckpoint"]>[0][] = [];
  throwOnPersist = false;

  async acquireLease() { return this.leaseAvailable; }
  async releaseLease() {}
  async getCheckpoint() { return { ...this.checkpoint }; }
  async findProviderMessage(providerMessageId: string) {
    return this.messages.get(providerMessageId) ?? null;
  }
  async persistInbound(input: PersistInboundInput) {
    if (this.throwOnPersist) throw new Error("database interrupted");
    const existing = this.messages.get(input.listMessage.providerMessageId);
    if (existing) return { providerMessageRef: existing.providerMessageRef, duplicate: true };
    const providerMessageRef = `stored-${input.listMessage.providerMessageId}`;
    this.messages.set(input.listMessage.providerMessageId, {
      providerMessageRef,
      attachmentState: input.listMessage.hasAttachment ? "pending" : "none",
    });
    this.persisted.push(input);
    return { providerMessageRef, duplicate: false };
  }
  async persistAttachmentMetadata(args: Parameters<EmailSyncStore["persistAttachmentMetadata"]>[0]) {
    this.attachments.set(args.providerMessageRef, args.attachments);
    for (const [id, row] of this.messages) {
      if (row.providerMessageRef === args.providerMessageRef) {
        this.messages.set(id, { ...row, attachmentState: "complete" });
      }
    }
  }
  async recordAttachmentFailure(args: Parameters<EmailSyncStore["recordAttachmentFailure"]>[0]) {
    this.attachmentFailures.push(args.safeCode);
    for (const [id, row] of this.messages) {
      if (row.providerMessageRef === args.providerMessageRef) {
        this.messages.set(id, { ...row, attachmentState: "failed" });
      }
    }
  }
  async recordPoison(args: Parameters<EmailSyncStore["recordPoison"]>[0]) {
    this.poison.push(args.safeCode);
    this.messages.set(args.listMessage.providerMessageId, {
      providerMessageRef: `poison-${args.listMessage.providerMessageId}`,
      attachmentState: "none",
    });
  }
  async commitCheckpoint(args: Parameters<EmailSyncStore["commitCheckpoint"]>[0]) {
    this.checkpointCommits.push(args);
    this.checkpoint = {
      checkpointReceivedAt: args.checkpointReceivedAt,
      checkpointProviderMessageId: args.checkpointProviderMessageId,
      continuationStart: args.continuationStart,
      retryAttempt: 0,
      nextAttemptAt: null,
    };
  }
  async recordFailure(args: Parameters<EmailSyncStore["recordFailure"]>[0]) {
    this.failures.push(args);
    this.checkpoint.retryAttempt = args.retryAttempt;
    this.checkpoint.nextAttemptAt = args.nextAttemptAt;
  }
}

class FakeTransport implements EmailProviderTransport {
  pages = new Map<number, EmailProviderListMessage[]>();
  listError: unknown = null;
  headerError: unknown = null;
  attachmentError: unknown = null;
  refreshResult = false;
  refreshCalls = 0;
  attachmentCalls = 0;

  async discoverAccount() { throw new Error("not used"); }
  async discoverFolders() { throw new Error("not used"); }
  async listMessages(args: { start: number }) {
    if (this.listError) throw this.listError;
    return this.pages.get(args.start) ?? [];
  }
  async getMessageHeaders(args: { providerMessageId: string }) {
    if (this.headerError) throw this.headerError;
    return {
      providerMessageId: args.providerMessageId,
      rfcMessageId: `<${args.providerMessageId}@example.invalid>`,
      inReplyTo: null,
      references: [],
    };
  }
  async getMessageContent(args: { providerMessageId: string }) {
    return {
      providerMessageId: args.providerMessageId,
      kind: "plain_text" as const,
      rawContent: `Tekst ${args.providerMessageId}`,
      safePlainText: `Tekst ${args.providerMessageId}`,
    };
  }
  async listAttachments() {
    this.attachmentCalls += 1;
    if (this.attachmentError) throw this.attachmentError;
    return [{ providerAttachmentId: "5001", fileName: "racun.pdf", size: 42, inline: false }];
  }
  async downloadAttachment() { throw new Error("not used"); }
  async send() { throw new Error("not used"); }
  async reply() { throw new Error("not used"); }
  async searchSentForReconciliation() { return []; }
  async refreshAccessToken() {
    this.refreshCalls += 1;
    if (this.refreshResult) this.listError = null;
    return this.refreshResult;
  }
}

function run(store: MemoryStore, transport: FakeTransport, now = NOW) {
  return runIncrementalEmailSync({
    store,
    transport,
    providerAccountId: "1001",
    inboxFolderId: "2001",
    leaseToken: `run-${now}`,
    now,
    random: () => 0.5,
  });
}

describe("bounded incremental email sync", () => {
  test("repeated poll is exact-once and a same-timestamp checkpoint never moves backward", async () => {
    const store = new MemoryStore();
    const transport = new FakeTransport();
    transport.pages.set(1, [message(10, NOW), message(11, NOW)]);
    expect(await run(store, transport)).toMatchObject({ status: "completed", processedCount: 2 });
    expect(store.persisted).toHaveLength(2);
    expect(store.checkpoint).toMatchObject({
      checkpointReceivedAt: NOW,
      checkpointProviderMessageId: "11",
    });

    expect(await run(store, transport, NOW + 1)).toMatchObject({
      status: "completed",
      duplicateCount: 2,
    });
    expect(store.persisted).toHaveLength(2);
    expect(store.checkpoint.checkpointProviderMessageId).toBe("11");
  });

  test("overlap scans at least 100 rows and imports a late message inside the time window", async () => {
    const store = new MemoryStore();
    store.checkpoint.checkpointReceivedAt = NOW;
    store.checkpoint.checkpointProviderMessageId = "999";
    const transport = new FakeTransport();
    const rows = Array.from({ length: 100 }, (_, index) => {
      const row = message(index + 1, index === 99 ? NOW - 600_001 : NOW - index - 1);
      if (index === 75) return message(500, NOW - 30_000);
      store.messages.set(row.providerMessageId, {
        providerMessageRef: `stored-${row.providerMessageId}`,
        attachmentState: "none",
      });
      return row;
    });
    transport.pages.set(1, rows.slice(0, 50));
    transport.pages.set(51, rows.slice(50));
    const result = await run(store, transport);
    expect(result).toMatchObject({ status: "completed", processedCount: 100 });
    expect(store.persisted.map((item) => item.listMessage.providerMessageId)).toEqual(["500"]);
  });

  test("a database interruption degrades the run and does not advance the checkpoint", async () => {
    const store = new MemoryStore();
    store.throwOnPersist = true;
    const transport = new FakeTransport();
    transport.pages.set(1, [message(1)]);
    expect(await run(store, transport)).toEqual({
      status: "degraded",
      safeCode: "email_sync_internal_error",
      nextAttemptAt: null,
    });
    expect(store.checkpointCommits).toHaveLength(0);
  });

  test("lease contention returns without calling the provider", async () => {
    const store = new MemoryStore();
    store.leaseAvailable = false;
    const transport = new FakeTransport();
    const listSpy = vi.spyOn(transport, "listMessages");
    expect(await run(store, transport)).toEqual({ status: "lease_busy" });
    expect(listSpy).not.toHaveBeenCalled();
  });

  test("three full pages stop at 150 and persist a continuation cursor", async () => {
    const store = new MemoryStore();
    const transport = new FakeTransport();
    transport.pages.set(1, Array.from({ length: 50 }, (_, index) => message(index + 1)));
    transport.pages.set(51, Array.from({ length: 50 }, (_, index) => message(index + 51)));
    transport.pages.set(101, Array.from({ length: 50 }, (_, index) => message(index + 101)));
    expect(await run(store, transport)).toMatchObject({
      status: "completed",
      processedCount: 150,
      continuationStart: 151,
    });
    expect(store.persisted).toHaveLength(150);
  });

  test("429 Retry-After and transient 5xx use bounded backoff", async () => {
    const rateStore = new MemoryStore();
    const rateTransport = new FakeTransport();
    rateTransport.listError = new EmailProviderHttpError({
      status: 429,
      safeCode: "zoho_rate_limited",
      retryAfterMs: 17_000,
    });
    expect(await run(rateStore, rateTransport)).toEqual({
      status: "degraded",
      safeCode: "zoho_rate_limited",
      nextAttemptAt: NOW + 17_000,
    });

    const serverStore = new MemoryStore();
    const serverTransport = new FakeTransport();
    serverTransport.listError = new EmailProviderHttpError({
      status: 503,
      safeCode: "zoho_unavailable",
    });
    expect(await run(serverStore, serverTransport)).toEqual({
      status: "degraded",
      safeCode: "zoho_unavailable",
      nextAttemptAt: NOW + 2_000,
    });
  });

  test("401 refreshes once, then requires operator auth without a retry time", async () => {
    const recoveredStore = new MemoryStore();
    const recoveredTransport = new FakeTransport();
    recoveredTransport.listError = new EmailProviderHttpError({ status: 401, safeCode: "zoho_auth_required" });
    recoveredTransport.refreshResult = true;
    expect(await run(recoveredStore, recoveredTransport)).toMatchObject({ status: "completed" });
    expect(recoveredTransport.refreshCalls).toBe(1);

    const failedStore = new MemoryStore();
    const failedTransport = new FakeTransport();
    failedTransport.listError = new EmailProviderHttpError({ status: 401, safeCode: "zoho_auth_required" });
    expect(await run(failedStore, failedTransport)).toEqual({
      status: "auth_required",
      safeCode: "zoho_auth_required",
      nextAttemptAt: null,
    });
    expect(failedTransport.refreshCalls).toBe(1);
  });

  test("unknown payload is poisoned while attachment metadata retries without duplication", async () => {
    const poisonStore = new MemoryStore();
    const poisonTransport = new FakeTransport();
    poisonTransport.pages.set(1, [message(1)]);
    poisonTransport.headerError = new EmailProviderPayloadError("zoho_header_unknown_shape");
    expect(await run(poisonStore, poisonTransport)).toMatchObject({
      status: "completed",
      poisonedCount: 1,
    });
    expect(poisonStore.poison).toEqual(["zoho_header_unknown_shape"]);

    const attachmentStore = new MemoryStore();
    const attachmentTransport = new FakeTransport();
    const withAttachment = { ...message(2), hasAttachment: true };
    attachmentTransport.pages.set(1, [withAttachment]);
    attachmentTransport.attachmentError = new EmailProviderPayloadError("zoho_attachment_unknown_shape");
    expect(await run(attachmentStore, attachmentTransport)).toMatchObject({ status: "completed" });
    expect(attachmentStore.messages.get("2")?.attachmentState).toBe("failed");
    attachmentTransport.attachmentError = null;
    expect(await run(attachmentStore, attachmentTransport, NOW + 1)).toMatchObject({
      status: "completed",
      duplicateCount: 1,
    });
    expect(attachmentStore.persisted).toHaveLength(1);
    expect(attachmentStore.attachments.get("stored-2")).toHaveLength(1);
    expect(attachmentTransport.attachmentCalls).toBe(2);
  });
});
