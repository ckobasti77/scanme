import { describe, expect, test, vi } from "vitest";
import { EmailProviderHttpError, EmailProviderPayloadError } from "./lib/emailProvider";
import {
  parseZohoAccounts,
  parseZohoAttachments,
  parseZohoContent,
  parseZohoFolders,
  parseZohoHeaders,
  parseZohoHttpError,
  parseZohoMessageList,
  parseZohoSendResult,
  ZohoMailTransport,
} from "./lib/zohoMailProvider";

const success = (data: unknown) => ({ status: { code: 200 }, data });
const NOW = Date.parse("2026-09-12T12:00:00Z");

function transport(fetchImpl: typeof fetch, overrides: Partial<ConstructorParameters<typeof ZohoMailTransport>[0]> = {}) {
  return new ZohoMailTransport({
    accessToken: "test-access-token",
    allowedAccountId: "1001",
    fromAddress: "office@scanme.invalid",
    syncEnabled: true,
    outboundEnabled: false,
    accountIdConfirmed: true,
    foldersConfirmed: true,
    groupSendAsVerified: false,
    fetchImpl,
    ...overrides,
  });
}

describe("Zoho Mail EU transport", () => {
  test("strict parsers normalize documented account, folder, message and header payloads", () => {
    expect(parseZohoAccounts(success([
      { type: "OTHER", accountId: "999" },
      {
        type: "ZOHO_ACCOUNT",
        accountId: 1001,
        primaryEmailAddress: "ScanMe <OFFICE@scanme.invalid>",
        enabled: true,
      },
    ]))).toEqual([{
      providerAccountId: "1001",
      primaryEmailAddress: "office@scanme.invalid",
      enabled: true,
    }]);
    expect(parseZohoFolders(success([
      { folderId: "2001", folderName: "Inbox", folderType: "Inbox" },
    ]))).toEqual([{ folderId: "2001", name: "Inbox", type: "Inbox" }]);
    expect(parseZohoMessageList(success([{
      messageId: "3001",
      threadId: "4001",
      folderId: "2001",
      subject: "Pitanje",
      summary: "  Kratak   pregled ",
      fromAddress: "Ana <ana@example.invalid>",
      toAddress: "ScanMe <office@scanme.invalid>",
      receivedTime: "1720000000000",
      status: "0",
      hasAttachment: "1",
    }]))[0]).toMatchObject({
      providerMessageId: "3001",
      providerThreadId: "4001",
      safePreview: "Kratak pregled",
      senderAddress: "ana@example.invalid",
      recipientAddress: "office@scanme.invalid",
      hasAttachment: true,
    });
    expect(parseZohoHeaders(success({
      messageId: "3001",
      headerContent: {
        "Message-Id": ["<msg-1@example.invalid>"],
        "In-Reply-To": ["<msg-0@example.invalid>"],
        References: ["<root@example.invalid> <msg-0@example.invalid>"],
      },
    }))).toEqual({
      providerMessageId: "3001",
      rfcMessageId: "<msg-1@example.invalid>",
      inReplyTo: "<msg-0@example.invalid>",
      references: ["<root@example.invalid>", "<msg-0@example.invalid>"],
    });
  });

  test("content, attachments and send result reject unsafe ambiguity", () => {
    expect(parseZohoContent(success({ messageId: "3001", content: "Čist tekst" }))).toMatchObject({
      kind: "plain_text",
      safePlainText: "Čist tekst",
    });
    expect(parseZohoContent(success({ messageId: "3002", content: "<p>HTML</p>" }))).toMatchObject({
      kind: "html",
      safePlainText: null,
    });
    expect(parseZohoAttachments(success({
      attachments: [{ attachmentId: "5001", attachmentName: "racun.pdf", attachmentSize: 12 }],
      inline: [{ attachmentId: "5002", attachmentName: "logo.png", attachmentSize: "7" }],
    }))).toEqual([
      { providerAttachmentId: "5001", fileName: "racun.pdf", size: 12, inline: false },
      { providerAttachmentId: "5002", fileName: "logo.png", size: 7, inline: true },
    ]);
    expect(parseZohoSendResult(success({ messageId: "6001", mailId: "<sent@example.invalid>" })))
      .toEqual({ providerMessageId: "6001", providerMailId: "<sent@example.invalid>" });
    expect(() => parseZohoMessageList(success([{ messageId: "not-numeric" }]))).toThrow(
      EmailProviderPayloadError,
    );
    expect(() => parseZohoContent({ status: { code: 500 }, data: {} })).toThrow(
      "zoho_status_not_success",
    );
  });

  test("sync uses only bounded GET requests against the exact EU API base", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(success([])), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    await transport(fetchImpl).listMessages({
      accountId: "1001",
      folderId: "2001",
      start: 1,
      limit: 50,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toMatch(/^https:\/\/mail\.zoho\.eu\/api\/accounts\/1001\/messages\/view\?/);
    expect(String(url)).toContain("limit=50");
    expect(init?.method ?? "GET").toBe("GET");
    expect(String(url)).not.toMatch(/mark|flag|move|delete|update/i);
    expect(() => transport(fetchImpl, { apiBaseUrl: "https://mail.zoho.com/api" })).toThrow(
      "zoho_eu_api_base_required",
    );
  });

  test("transport enforces one allowed account and disabled outbound before network", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const client = transport(fetchImpl);
    await expect(client.listMessages({
      accountId: "9999",
      folderId: "2001",
      start: 1,
      limit: 50,
    })).rejects.toThrow("zoho_account_not_allowed");
    await expect(client.send({
      accountId: "1001",
      fromAddress: "office@scanme.invalid",
      toAddress: "ana@example.invalid",
      subject: "Odgovor",
      plainTextContent: "Tekst",
    })).rejects.toThrow("zoho_outbound_disabled");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("Sent reconciliation is bounded and returns only exact sender, recipient and subject candidates", async () => {
    const payload = success([{
      messageId: "7001",
      folderId: "2002",
      subject: "Odgovor",
      summary: "Poslato",
      fromAddress: "office@scanme.invalid",
      toAddress: "ana@example.invalid",
      receivedTime: NOW,
      status: "1",
      hasAttachment: false,
    }]);
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => new Response(
      JSON.stringify(payload),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ));
    const client = transport(fetchImpl);
    expect(await client.searchSentForReconciliation({
      accountId: "1001",
      sentFolderId: "2002",
      fromAddress: "office@scanme.invalid",
      toAddress: "ana@example.invalid",
      subject: "Odgovor",
      limit: 10,
    })).toHaveLength(1);
    expect(await client.searchSentForReconciliation({
      accountId: "1001",
      sentFolderId: "2002",
      fromAddress: "office@scanme.invalid",
      toAddress: "drugi@example.invalid",
      subject: "Odgovor",
      limit: 10,
    })).toHaveLength(0);
    await expect(client.searchSentForReconciliation({
      accountId: "1001",
      sentFolderId: "2002",
      fromAddress: "office@scanme.invalid",
      toAddress: "ana@example.invalid",
      subject: "Odgovor",
      limit: 51,
    })).rejects.toThrow("zoho_reconciliation_bounds_invalid");
  });

  test("429 and 5xx errors expose safe retry semantics", () => {
    const rateLimit = parseZohoHttpError({ status: 429, retryAfter: "17" });
    expect(rateLimit).toBeInstanceOf(EmailProviderHttpError);
    expect(rateLimit).toMatchObject({
      status: 429,
      safeCode: "zoho_rate_limited",
      retryAfterMs: 17_000,
    });
    expect(parseZohoHttpError({ status: 503, retryAfter: null })).toMatchObject({
      status: 503,
      safeCode: "zoho_unavailable",
      retryAfterMs: null,
    });
  });

  test("attachment download enforces MIME and byte limits", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { "Content-Type": "application/pdf", "Content-Length": "3" },
    }));
    const result = await transport(fetchImpl).downloadAttachment({
      accountId: "1001",
      folderId: "2001",
      providerMessageId: "3001",
      providerAttachmentId: "5001",
      policy: { maxBytes: 3, allowedMimeTypes: new Set(["application/pdf"]) },
    });
    expect(result.mimeType).toBe("application/pdf");
    await expect(transport(fetchImpl).downloadAttachment({
      accountId: "1001",
      folderId: "2001",
      providerMessageId: "3001",
      providerAttachmentId: "5001",
      policy: { maxBytes: 2, allowedMimeTypes: new Set(["application/pdf"]) },
    })).rejects.toThrow("attachment_policy_blocked");
  });
});
