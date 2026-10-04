import {
  EMAIL_SYNC_LEASE_MS,
  EMAIL_SYNC_MAX_MESSAGES,
  EMAIL_SYNC_MAX_PAGES,
  EMAIL_SYNC_OVERLAP_MESSAGES,
  EMAIL_SYNC_OVERLAP_MS,
  EMAIL_SYNC_PAGE_SIZE,
  EmailProviderHttpError,
  EmailProviderPayloadError,
  retryDelayMs,
  type EmailProviderAttachment,
  type EmailProviderListMessage,
  type EmailProviderMessageHeaders,
  type EmailProviderTransport,
} from "./emailProvider";

export type EmailSyncCheckpoint = {
  checkpointReceivedAt: number | null;
  checkpointProviderMessageId: string | null;
  continuationStart: number | null;
  retryAttempt: number;
  nextAttemptAt: number | null;
};

export type StoredProviderMessage = {
  providerMessageRef: string;
  attachmentState: "none" | "pending" | "complete" | "failed";
};

export type PersistInboundInput = {
  provider: "zoho";
  providerAccountId: string;
  listMessage: EmailProviderListMessage;
  headers: EmailProviderMessageHeaders;
  plainTextContent: string;
  safePreview: string;
  now: number;
};

export interface EmailSyncStore {
  acquireLease(args: {
    leaseToken: string;
    acquiredAt: number;
    expiresAt: number;
  }): Promise<boolean>;
  releaseLease(leaseToken: string): Promise<void>;
  getCheckpoint(): Promise<EmailSyncCheckpoint>;
  findProviderMessage(providerMessageId: string): Promise<StoredProviderMessage | null>;
  persistInbound(input: PersistInboundInput): Promise<{
    providerMessageRef: string;
    duplicate: boolean;
  }>;
  persistAttachmentMetadata(args: {
    providerMessageRef: string;
    attachments: EmailProviderAttachment[];
    now: number;
  }): Promise<void>;
  recordAttachmentFailure(args: {
    providerMessageRef: string;
    safeCode: string;
    now: number;
  }): Promise<void>;
  recordPoison(args: {
    provider: "zoho";
    providerAccountId: string;
    listMessage: EmailProviderListMessage;
    safeCode: string;
    now: number;
  }): Promise<void>;
  commitCheckpoint(args: {
    checkpointReceivedAt: number | null;
    checkpointProviderMessageId: string | null;
    continuationStart: number | null;
    processedCount: number;
    now: number;
  }): Promise<void>;
  recordFailure(args: {
    leaseToken: string;
    state: "degraded" | "auth_required";
    safeCode: string;
    retryAttempt: number;
    nextAttemptAt: number | null;
    now: number;
  }): Promise<void>;
}

export type EmailSyncRunResult =
  | { status: "lease_busy" }
  | { status: "deferred"; nextAttemptAt: number }
  | {
      status: "completed";
      processedCount: number;
      duplicateCount: number;
      poisonedCount: number;
      continuationStart: number | null;
    }
  | {
      status: "degraded" | "auth_required";
      safeCode: string;
      nextAttemptAt: number | null;
    };

function messageOrder(a: EmailProviderListMessage, b: EmailProviderListMessage) {
  if (a.receivedAt !== b.receivedAt) return b.receivedAt - a.receivedAt;
  return b.providerMessageId.localeCompare(a.providerMessageId);
}

function isAfterCheckpoint(
  candidate: EmailProviderListMessage,
  checkpointReceivedAt: number | null,
  checkpointProviderMessageId: string | null,
) {
  if (checkpointReceivedAt === null || candidate.receivedAt > checkpointReceivedAt) return true;
  if (candidate.receivedAt < checkpointReceivedAt) return false;
  return checkpointProviderMessageId === null ||
    candidate.providerMessageId.localeCompare(checkpointProviderMessageId) > 0;
}

function safeCode(error: unknown) {
  if (error instanceof EmailProviderHttpError || error instanceof EmailProviderPayloadError) {
    return error.safeCode;
  }
  return "email_sync_internal_error";
}

function isRetryableHttp(error: unknown) {
  return error instanceof EmailProviderHttpError &&
    (error.status === 429 || error.status >= 500);
}

async function persistAttachments(args: {
  transport: EmailProviderTransport;
  store: EmailSyncStore;
  accountId: string;
  message: EmailProviderListMessage;
  providerMessageRef: string;
  now: number;
  callProvider: <T>(operation: () => Promise<T>) => Promise<T>;
}) {
  if (!args.message.hasAttachment) return;
  try {
    const attachments = await args.callProvider(() => args.transport.listAttachments({
      accountId: args.accountId,
      folderId: args.message.folderId,
      providerMessageId: args.message.providerMessageId,
    }));
    await args.store.persistAttachmentMetadata({
      providerMessageRef: args.providerMessageRef,
      attachments,
      now: args.now,
    });
  } catch (error) {
    await args.store.recordAttachmentFailure({
      providerMessageRef: args.providerMessageRef,
      safeCode: safeCode(error),
      now: args.now,
    });
    if (
      error instanceof EmailProviderHttpError &&
      (error.status === 401 || error.status === 429 || error.status >= 500)
    ) throw error;
  }
}

export async function runIncrementalEmailSync(args: {
  transport: EmailProviderTransport;
  store: EmailSyncStore;
  providerAccountId: string;
  inboxFolderId: string;
  leaseToken: string;
  now: number;
  random?: () => number;
}): Promise<EmailSyncRunResult> {
  const acquired = await args.store.acquireLease({
    leaseToken: args.leaseToken,
    acquiredAt: args.now,
    expiresAt: args.now + EMAIL_SYNC_LEASE_MS,
  });
  if (!acquired) return { status: "lease_busy" };

  let refreshed = false;
  const callProvider = async <T>(operation: () => Promise<T>): Promise<T> => {
    try {
      return await operation();
    } catch (error) {
      if (
        error instanceof EmailProviderHttpError &&
        error.status === 401 &&
        !refreshed
      ) {
        refreshed = true;
        if (await args.transport.refreshAccessToken()) return operation();
      }
      throw error;
    }
  };

  try {
    const checkpoint = await args.store.getCheckpoint();
    if (checkpoint.nextAttemptAt !== null && checkpoint.nextAttemptAt > args.now) {
      return { status: "deferred", nextAttemptAt: checkpoint.nextAttemptAt };
    }

    let start = checkpoint.continuationStart ?? 1;
    let pageCount = 0;
    let processedCount = 0;
    let duplicateCount = 0;
    let poisonedCount = 0;
    let continuationStart: number | null = null;
    let newestSeen: EmailProviderListMessage | null = null;
    let stopForOverlap = false;

    while (pageCount < EMAIL_SYNC_MAX_PAGES && processedCount < EMAIL_SYNC_MAX_MESSAGES) {
      const page = await callProvider(() => args.transport.listMessages({
        accountId: args.providerAccountId,
        folderId: args.inboxFolderId,
        start,
        limit: EMAIL_SYNC_PAGE_SIZE,
      }));
      if (page.length > EMAIL_SYNC_PAGE_SIZE) {
        throw new EmailProviderPayloadError("email_sync_page_excessive");
      }
      const messages = [...page].sort(messageOrder);
      if (start === 1 && messages[0] && !newestSeen) newestSeen = messages[0];

      for (const message of messages) {
        processedCount += 1;
        const existing = await args.store.findProviderMessage(message.providerMessageId);
        if (existing) {
          duplicateCount += 1;
          if (
            message.hasAttachment &&
            (existing.attachmentState === "pending" || existing.attachmentState === "failed")
          ) {
            await persistAttachments({
              transport: args.transport,
              store: args.store,
              accountId: args.providerAccountId,
              message,
              providerMessageRef: existing.providerMessageRef,
              now: args.now,
              callProvider,
            });
          }
        } else {
          try {
            const [headers, content] = await Promise.all([
              callProvider(() => args.transport.getMessageHeaders({
                accountId: args.providerAccountId,
                folderId: message.folderId,
                providerMessageId: message.providerMessageId,
              })),
              callProvider(() => args.transport.getMessageContent({
                accountId: args.providerAccountId,
                folderId: message.folderId,
                providerMessageId: message.providerMessageId,
              })),
            ]);
            if (
              headers.providerMessageId !== message.providerMessageId ||
              content.providerMessageId !== message.providerMessageId
            ) throw new EmailProviderPayloadError("email_sync_message_identity_mismatch");
            if (content.kind !== "plain_text" || !content.safePlainText) {
              await args.store.recordPoison({
                provider: "zoho",
                providerAccountId: args.providerAccountId,
                listMessage: message,
                safeCode: "email_html_requires_sanitizer",
                now: args.now,
              });
              poisonedCount += 1;
            } else {
              const persisted = await args.store.persistInbound({
                provider: "zoho",
                providerAccountId: args.providerAccountId,
                listMessage: message,
                headers,
                plainTextContent: content.safePlainText,
                safePreview: message.safePreview || content.safePlainText.slice(0, 180),
                now: args.now,
              });
              if (persisted.duplicate) duplicateCount += 1;
              await persistAttachments({
                transport: args.transport,
                store: args.store,
                accountId: args.providerAccountId,
                message,
                providerMessageRef: persisted.providerMessageRef,
                now: args.now,
                callProvider,
              });
            }
          } catch (error) {
            if (error instanceof EmailProviderHttpError) throw error;
            if (!(error instanceof EmailProviderPayloadError)) throw error;
            await args.store.recordPoison({
              provider: "zoho",
              providerAccountId: args.providerAccountId,
              listMessage: message,
              safeCode: safeCode(error),
              now: args.now,
            });
            poisonedCount += 1;
          }
        }

        if (
          checkpoint.continuationStart === null &&
          checkpoint.checkpointReceivedAt !== null &&
          processedCount >= EMAIL_SYNC_OVERLAP_MESSAGES &&
          message.receivedAt <= checkpoint.checkpointReceivedAt - EMAIL_SYNC_OVERLAP_MS
        ) {
          stopForOverlap = true;
          break;
        }
      }

      pageCount += 1;
      const hasMore = page.length === EMAIL_SYNC_PAGE_SIZE;
      if (stopForOverlap || !hasMore) {
        continuationStart = null;
        break;
      }
      start += page.length;
      continuationStart = start;
    }

    const advanceCheckpoint = newestSeen
      ? isAfterCheckpoint(
          newestSeen,
          checkpoint.checkpointReceivedAt,
          checkpoint.checkpointProviderMessageId,
        )
      : false;
    const checkpointReceivedAt = advanceCheckpoint
      ? newestSeen!.receivedAt
      : checkpoint.checkpointReceivedAt;
    const checkpointProviderMessageId = advanceCheckpoint
      ? newestSeen!.providerMessageId
      : checkpoint.checkpointProviderMessageId;
    await args.store.commitCheckpoint({
      checkpointReceivedAt,
      checkpointProviderMessageId,
      continuationStart,
      processedCount,
      now: args.now,
    });
    return {
      status: "completed",
      processedCount,
      duplicateCount,
      poisonedCount,
      continuationStart,
    };
  } catch (error) {
    const checkpoint = await args.store.getCheckpoint();
    const attempt = checkpoint.retryAttempt + 1;
    if (error instanceof EmailProviderHttpError && error.status === 401) {
      await args.store.recordFailure({
        leaseToken: args.leaseToken,
        state: "auth_required",
        safeCode: error.safeCode,
        retryAttempt: attempt,
        nextAttemptAt: null,
        now: args.now,
      });
      return { status: "auth_required", safeCode: error.safeCode, nextAttemptAt: null };
    }
    const nextAttemptAt = isRetryableHttp(error)
      ? args.now + retryDelayMs({
          attempt,
          retryAfterMs: error instanceof EmailProviderHttpError ? error.retryAfterMs : null,
          random: args.random,
        })
      : null;
    const code = safeCode(error);
    await args.store.recordFailure({
      leaseToken: args.leaseToken,
      state: "degraded",
      safeCode: code,
      retryAttempt: attempt,
      nextAttemptAt,
      now: args.now,
    });
    return { status: "degraded", safeCode: code, nextAttemptAt };
  } finally {
    await args.store.releaseLease(args.leaseToken);
  }
}
