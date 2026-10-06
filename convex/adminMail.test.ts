/// <reference types="vite/client" />

// Admin UX Z1/Z2 — Pošta (ADMIN-UX-ZAHTEVI §10, A0 §10 "Z1/Z2"): encryption,
// the one-time OAuth state, owner isolation, Zoho response mapping,
// 401 → one refresh → auth_required, 429/5xx, the inert switch and the authz
// table of every adminMail function. `fetch` is a mock in every test: no
// request ever leaves the process, and the mock only answers the EU hosts.
// All ids, addresses and tokens below are TEST values.

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id, TableNames } from "./_generated/dataModel";
import schema from "./schema";
import * as adminMail from "./adminMail";
import {
  AdminMailCryptoError,
  adminMailTokenAad,
  bytesToBase64,
  decodeAdminMailKey,
  decryptAdminMailSecret,
  encryptAdminMailSecret,
  importAdminMailKey,
  sha256Hex,
} from "./lib/adminMailCrypto";
import {
  AdminMailError,
  buildZohoAuthorizeUrl,
  parseZohoAddressList,
  parseZohoJson,
  parseZohoMailAccounts,
  parseZohoMailDetails,
  parseZohoMailFolders,
  parseZohoMailList,
  parseZohoTokenResponse,
  zohoSearchKey,
} from "./lib/zohoMailClient";

const modules = import.meta.glob("./**/*.ts");
const NOW = Date.parse("2026-10-06T10:00:00+02:00");
const ISSUER = "https://admin-mail-z1.test";
const ADMIN_A = "posta-a@scanme.test";
const ADMIN_B = "posta-b@scanme.test";
const CLIENT_ID = "test-zoho-client-id";
const CLIENT_SECRET = "test-zoho-client-secret";
const REDIRECT = "http://localhost:3150/api/admin/posta/callback";
// TEST keys (32 bytes each), never a real value.
const TEST_KEY = bytesToBase64(Uint8Array.from({ length: 32 }, (_, index) => index + 1));
const OTHER_KEY = bytesToBase64(Uint8Array.from({ length: 32 }, (_, index) => 200 - index));

const ACC_A = "9000000000101";
const ACC_B = "9000000000202";
const INBOX = "9000000002014";
const SENT = "9000000002022";
const M_HTML = "1709887058769100001"; // > 2^53 on purpose
const M_TEXT = "1709887058769100002";
const M_THIRD = "1709887058769100003";
const ATT_PDF = "138907275303090130";
const ATT_EXE = "138907275303090131";
const ATT_BIG = "138907275303090132";
const HTML_BODY = '<div>TEST ponuda<script>alert(1)</script><img src="https://tracker.example.invalid/p.png"></div>';

const ENV_NAMES = ["ZOHO_MAIL_CLIENT_ENABLED", "ZOHO_TOKEN_ENCRYPTION_KEY", "ZOHO_MAIL_CLIENT_ID", "ZOHO_MAIL_CLIENT_SECRET", "ZOHO_MAIL_REDIRECT_URI"] as const;

function enableMail() {
  process.env.ZOHO_MAIL_CLIENT_ENABLED = "true";
  process.env.ZOHO_TOKEN_ENCRYPTION_KEY = TEST_KEY;
  process.env.ZOHO_MAIL_CLIENT_ID = CLIENT_ID;
  process.env.ZOHO_MAIL_CLIENT_SECRET = CLIENT_SECRET;
  process.env.ZOHO_MAIL_REDIRECT_URI = REDIRECT;
}

// -----------------------------------------------------------------------------
// Zoho mock (EU accounts + EU mail API only)
// -----------------------------------------------------------------------------

type Call = { method: string; url: URL; headers: Headers; body: string; bytes: Uint8Array | null };

function zohoMock() {
  const calls: Call[] = [];
  const state = {
    accessCounter: 0,
    validAccess: new Set<string>(),
    refreshRejected: false,
    mailAlways401: false,
    /** Forced HTTP statuses per mail API path, consumed in order. */
    failures: new Map<string, number[]>(),
    accounts: [{ accountId: ACC_A, email: ADMIN_A }],
    /** Z2: outcome of each send/reply POST, consumed in order ("ok" when empty). */
    sendBehavior: [] as ("ok" | "network" | "garbage" | number)[],
  };
  const raw = (text: string, status = 200, headers: Record<string, string> = {}) =>
    new Response(text, { status, headers: { "Content-Type": "application/json", ...headers } });
  const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => raw(JSON.stringify(body), status, headers);
  const ok = (data: unknown) => json({ status: { code: 200, description: "success" }, data });
  const issue = () => {
    const token = `test-access-${++state.accessCounter}`;
    state.validAccess.add(token);
    return token;
  };
  const listItem = (messageId: string, overrides: Record<string, unknown> = {}) => ({
    messageId, folderId: INBOX, threadId: "0", subject: `TEST poruka ${messageId.slice(-1)}`, sender: "TEST Pošiljalac",
    fromAddress: "posiljalac@example.invalid", toAddress: `&quot;TEST A&quot;&lt;${ADMIN_A}&gt;`, summary: "TEST isečak &amp; više",
    receivedTime: "1759737600000", status: "1", hasAttachment: "0", ...overrides,
  });

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = init.method ?? "GET";
    const headers = new Headers(init.headers);
    const body = typeof init.body === "string" ? init.body : "";
    const bytes = init.body instanceof ArrayBuffer ? new Uint8Array(init.body) : null;
    calls.push({ method, url, headers, body, bytes });

    if (url.origin === "https://accounts.zoho.eu") {
      if (url.pathname === "/oauth/v2/token/revoke" && method === "POST") return json({ status: "success" });
      if (url.pathname !== "/oauth/v2/token" || method !== "POST") return json({}, 404);
      const form = new URLSearchParams(body);
      if (form.get("client_id") !== CLIENT_ID || form.get("client_secret") !== CLIENT_SECRET) return json({ error: "invalid_client" });
      if (form.get("grant_type") === "authorization_code") {
        if (form.get("code") !== "test-code" || form.get("redirect_uri") !== REDIRECT) return json({ error: "invalid_code" });
        return json({ access_token: issue(), refresh_token: "test-refresh-1", expires_in: 3600, api_domain: "https://www.zohoapis.eu", token_type: "Bearer" });
      }
      if (form.get("grant_type") === "refresh_token") {
        if (state.refreshRejected || form.get("refresh_token") !== "test-refresh-1") return json({ error: "invalid_code" });
        return json({ access_token: issue(), expires_in: 3600, token_type: "Bearer" });
      }
      return json({ error: "unsupported_grant_type" });
    }

    if (url.origin !== "https://mail.zoho.eu" || !url.pathname.startsWith("/api/")) return json({}, 404);
    const forced = state.failures.get(url.pathname)?.shift();
    if (forced) return json({ status: { code: forced, description: "TEST" } }, forced, forced === 429 ? { "Retry-After": "30" } : {});
    const token = headers.get("Authorization")?.replace(/^Zoho-oauthtoken /, "") ?? "";
    if (state.mailAlways401 || !state.validAccess.has(token)) {
      return json({ status: { code: 401, description: "Invalid OAuthtoken" }, data: { errorCode: "INVALID_OAUTHTOKEN" } }, 401);
    }
    const path = url.pathname.slice("/api".length);
    if (path === "/accounts") {
      return ok([
        ...state.accounts.map((account) => ({
          accountId: account.accountId, accountName: "TEST", displayName: `TEST ${account.email}`, primaryEmailAddress: account.email,
          mailboxAddress: account.email, type: "ZOHO_ACCOUNT", enabled: true, mailboxStatus: "enabled",
        })),
        { accountId: "9000000000999", type: "IMAP_ACCOUNT", primaryEmailAddress: "spoljni@example.invalid", enabled: true },
      ]);
    }
    const account = path.match(/^\/accounts\/(\d+)(\/.*)$/);
    if (!account || ![ACC_A, ACC_B].includes(account[1])) return json({ status: { code: 404, description: "TEST" } }, 404);
    const rest = account[2];
    if (rest === "/folders") {
      return ok([
        { folderId: "9000000002016", folderName: "Drafts", folderType: "Drafts", path: "/Drafts" },
        { folderId: "9000000002099", folderName: "TEST projekti", folderType: "NONE", path: "/TEST projekti" },
        { folderId: SENT, folderName: "Sent", folderType: "Sent", path: "/Sent" },
        { folderId: INBOX, folderName: "Inbox", folderType: "Inbox", path: "/Inbox" },
      ]);
    }
    if (rest === "/messages/view") {
      const limit = Number(url.searchParams.get("limit"));
      const all = [
        listItem(M_HTML, { status: "0", subject: "TEST HTML ponuda" }),
        listItem(M_TEXT, { hasAttachment: "1" }),
        listItem(M_THIRD),
      ];
      const rows = url.searchParams.get("status") === "unread" ? all.filter((row) => row.status === "0") : all;
      return ok(rows.slice(0, limit));
    }
    if (rest === "/messages/search") {
      // Search sends ids as JSON numbers and `receivedtime` in lower case.
      return raw(`{"status":{"code":200,"description":"success"},"data":[{"messageId":${M_HTML},"folderId":${INBOX},"threadId":0,` +
        `"subject":"TEST HTML ponuda","sender":"TEST Pošiljalac","fromAddress":"posiljalac@example.invalid","summary":"TEST",` +
        `"receivedtime":1759737600000,"status":"unread","hasAttachment":0}]}`);
    }
    if (rest === "/updatemessage" && method === "PUT") return json({ status: { code: 200, description: "success" } });
    if (rest === "/messages/attachments" && method === "POST") {
      const name = url.searchParams.get("fileName") ?? "";
      return ok({ storeName: "TEST-NN2", attachmentPath: `/test-upload_${name}`, attachmentName: name });
    }
    if ((rest === "/messages" || /^\/messages\/\d+$/.test(rest)) && method === "POST") {
      const behavior = state.sendBehavior.shift() ?? "ok";
      if (behavior === "network") throw new TypeError("TEST connection lost after the request");
      if (behavior === "garbage") return raw("<html>TEST</html>");
      if (typeof behavior === "number") return json({ status: { code: behavior, description: "TEST" } }, behavior);
      return ok({ messageId: "1709887058769300001", mailId: "<TEST.message@zoho.eu>" });
    }
    const message = rest.match(/^\/folders\/(\d+)\/messages\/(\d+)\/(details|content|attachmentinfo|attachments\/(\d+))$/);
    if (!message || message[1] !== INBOX || ![M_HTML, M_TEXT].includes(message[2])) return json({ status: { code: 404, description: "TEST" } }, 404);
    const isHtml = message[2] === M_HTML;
    if (message[3] === "details") {
      return ok({
        messageId: message[2], folderId: INBOX, subject: isHtml ? "TEST HTML ponuda" : "TEST tekst", sender: "TEST Pošiljalac",
        fromAddress: "posiljalac@example.invalid", toAddress: `&quot;TEST A&quot;&lt;${ADMIN_A}&gt;`, ccAddress: "Not Provided",
        receivedTime: "1759737600000", status: isHtml ? "0" : "1", hasAttachment: isHtml ? "0" : "1",
      });
    }
    if (message[3] === "content") {
      return raw(`{"status":{"code":200,"description":"success"},"data":{"messageId":${message[2]},"content":${JSON.stringify(isHtml ? HTML_BODY : "TEST obican tekst\nDrugi red")}}}`);
    }
    if (message[3] === "attachmentinfo") {
      return ok({
        messageId: message[2],
        attachments: [
          { attachmentId: ATT_PDF, attachmentName: "TEST ponuda.pdf", attachmentSize: 12 },
          { attachmentId: ATT_EXE, attachmentName: "TEST alat.exe", attachmentSize: 12 },
          { attachmentId: ATT_BIG, attachmentName: "TEST veliki.pdf", attachmentSize: 8 * 1024 * 1024 },
        ],
      });
    }
    return new Response(new TextEncoder().encode("%PDF-TEST"), { status: 200, headers: { "Content-Type": "application/octet-stream", "Content-Length": "9" } });
  });
  return { fetchMock, calls, state };
}

let zoho: ReturnType<typeof zohoMock>;

beforeEach(() => {
  process.env.SCANME_ADMIN_EMAILS = `${ADMIN_A},${ADMIN_B}`;
  for (const name of ENV_NAMES) delete process.env[name];
  zoho = zohoMock();
  vi.stubGlobal("fetch", zoho.fetchMock);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  for (const name of ENV_NAMES) delete process.env[name];
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => ({
    adminA: await ctx.db.insert("users", { email: ADMIN_A }),
    adminB: await ctx.db.insert("users", { email: ADMIN_B }),
    outsider: await ctx.db.insert("users", { email: "klijent@example.invalid" }),
  }));
  return {
    t,
    ...ids,
    a: t.withIdentity({ subject: ids.adminA, issuer: ISSUER }),
    b: t.withIdentity({ subject: ids.adminB, issuer: ISSUER }),
    outsider: t.withIdentity({ subject: ids.outsider, issuer: ISSUER }),
  };
}

type Fixture = Awaited<ReturnType<typeof setup>>;
type Caller = Fixture["a"];

async function codeOf(promise: Promise<unknown>) {
  try {
    await promise;
    return "OK";
  } catch (error) {
    const data = (error as { data?: unknown }).data;
    if (data && typeof data === "object" && typeof (data as { code?: unknown }).code === "string") return (data as { code: string }).code;
    return `ERR:${typeof data === "string" ? data : error instanceof Error ? error.message : String(error)}`;
  }
}

async function startState(caller: Caller) {
  const { authorizeUrl } = await caller.mutation(api.adminMail.startZohoConnect, {});
  return new URL(authorizeUrl).searchParams.get("state")!;
}

async function connect(caller: Caller) {
  const state = await startState(caller);
  await caller.action(api.adminMail.completeZohoConnect, { code: "test-code", state });
  const status = await caller.query(api.adminMail.getMailStatus, {});
  return status.connections[0];
}

const mailTables: TableNames[] = ["adminMailConnections", "adminMailAccounts", "adminMailOAuthStates"];
const dumpMail = (f: Fixture) => f.t.run(async (ctx) => {
  const all: Record<string, unknown> = {};
  for (const table of mailTables) all[table] = await ctx.db.query(table).collect();
  return JSON.stringify(all);
});

const tokenUrlCalls = () => zoho.calls.filter((call) => call.url.href === "https://accounts.zoho.eu/oauth/v2/token");
const mailCalls = () => zoho.calls.filter((call) => call.url.origin === "https://mail.zoho.eu");
const message = (connectionId: Id<"adminMailConnections">, messageId = M_HTML) => ({ connectionId, accountId: ACC_A, folderId: INBOX, messageId });

// -----------------------------------------------------------------------------
// Encryption
// -----------------------------------------------------------------------------

describe("token encryption (AES-GCM, key from the Convex env)", () => {
  const aad = adminMailTokenAad({ ownerUserId: "user-a", primaryEmail: ADMIN_A, purpose: "refresh" });

  test("round trip with a fresh IV per record; ciphertext never contains the token", async () => {
    const key = await importAdminMailKey(decodeAdminMailKey(TEST_KEY)!);
    const first = await encryptAdminMailSecret(key, "test-refresh-secret", aad);
    const second = await encryptAdminMailSecret(key, "test-refresh-secret", aad);
    expect(first.iv).not.toBe(second.iv);
    expect(first.ciphertext).not.toBe(second.ciphertext);
    expect(first.ciphertext).not.toContain("test-refresh-secret");
    expect(await decryptAdminMailSecret(key, first, aad)).toBe("test-refresh-secret");
  });

  test("a wrong key, another owner, another mailbox or the other token slot fails", async () => {
    const key = await importAdminMailKey(decodeAdminMailKey(TEST_KEY)!);
    const otherKey = await importAdminMailKey(decodeAdminMailKey(OTHER_KEY)!);
    const sealed = await encryptAdminMailSecret(key, "test-refresh-secret", aad);
    await expect(decryptAdminMailSecret(otherKey, sealed, aad)).rejects.toBeInstanceOf(AdminMailCryptoError);
    for (const wrong of [
      adminMailTokenAad({ ownerUserId: "user-b", primaryEmail: ADMIN_A, purpose: "refresh" }),
      adminMailTokenAad({ ownerUserId: "user-a", primaryEmail: ADMIN_B, purpose: "refresh" }),
      adminMailTokenAad({ ownerUserId: "user-a", primaryEmail: ADMIN_A, purpose: "access" }),
    ]) {
      await expect(decryptAdminMailSecret(key, sealed, wrong)).rejects.toBeInstanceOf(AdminMailCryptoError);
    }
    const tampered = { ...sealed, ciphertext: `A${sealed.ciphertext.slice(1)}` };
    await expect(decryptAdminMailSecret(key, tampered, aad)).rejects.toBeInstanceOf(AdminMailCryptoError);
  });

  test("the key must be exactly 32 bytes of base64", () => {
    expect(decodeAdminMailKey(undefined)).toBeNull();
    expect(decodeAdminMailKey("")).toBeNull();
    expect(decodeAdminMailKey(bytesToBase64(new Uint8Array(16)))).toBeNull();
    expect(decodeAdminMailKey("nije-base64!")).toBeNull();
    expect(decodeAdminMailKey(TEST_KEY)?.length).toBe(32);
  });
});

// -----------------------------------------------------------------------------
// Inert without the switch
// -----------------------------------------------------------------------------

describe("inert without ZOHO_MAIL_CLIENT_ENABLED", () => {
  async function seedConnection(f: Fixture) {
    return f.t.run(async (ctx) => {
      const connectionId = await ctx.db.insert("adminMailConnections", {
        ownerUserId: f.adminA, provider: "zoho", region: "eu", primaryEmail: ADMIN_A, status: "active",
        refreshTokenCiphertext: "TEST", refreshTokenIv: "TEST", keyVersion: 1, scopes: [], connectedAt: NOW, updatedAt: NOW,
      });
      await ctx.db.insert("adminMailAccounts", { connectionId, ownerUserId: f.adminA, zohoAccountId: ACC_A, emailAddress: ADMIN_A, isDefault: true });
      return connectionId;
    });
  }

  function everyCall(caller: Caller, connectionId: Id<"adminMailConnections">): (() => Promise<unknown>)[] {
    return [
      () => caller.mutation(api.adminMail.startZohoConnect, {}),
      () => caller.action(api.adminMail.completeZohoConnect, { code: "test-code", state: "a".repeat(43) }),
      () => caller.action(api.adminMail.listFolders, { connectionId, accountId: ACC_A }),
      () => caller.action(api.adminMail.listMessages, { connectionId, accountId: ACC_A, folderId: INBOX, start: 1, limit: 25 }),
      () => caller.action(api.adminMail.getMessage, message(connectionId)),
      () => caller.action(api.adminMail.downloadAttachment, { ...message(connectionId, M_TEXT), attachmentId: ATT_PDF }),
      () => caller.action(api.adminMail.markRead, { connectionId, accountId: ACC_A, messageId: M_HTML }),
    ];
  }

  test("status says not configured and every Zoho function answers ZOHO_NOT_CONFIGURED without any network call", async () => {
    const f = await setup();
    const connectionId = await seedConnection(f);
    expect(await f.a.query(api.adminMail.getMailStatus, {})).toMatchObject({ enabled: false, configured: false });
    for (const call of everyCall(f.a, connectionId)) expect(await codeOf(call())).toBe("ZOHO_NOT_CONFIGURED");
    expect(zoho.fetchMock).not.toHaveBeenCalled();
    expect(await f.t.run((ctx) => ctx.db.query("adminMailOAuthStates").collect())).toEqual([]);
  });

  test("a switch that is not exactly \"true\", a missing/short key, a missing secret or a foreign redirect also stays inert", async () => {
    const f = await setup();
    const connectionId = await seedConnection(f);
    const variants: [string, () => void][] = [
      ["switch TRUE", () => { enableMail(); process.env.ZOHO_MAIL_CLIENT_ENABLED = "TRUE"; }],
      ["switch 1", () => { enableMail(); process.env.ZOHO_MAIL_CLIENT_ENABLED = "1"; }],
      ["no key", () => { enableMail(); delete process.env.ZOHO_TOKEN_ENCRYPTION_KEY; }],
      ["16-byte key", () => { enableMail(); process.env.ZOHO_TOKEN_ENCRYPTION_KEY = bytesToBase64(new Uint8Array(16)); }],
      ["no secret", () => { enableMail(); delete process.env.ZOHO_MAIL_CLIENT_SECRET; }],
      ["no redirect", () => { enableMail(); delete process.env.ZOHO_MAIL_REDIRECT_URI; }],
      ["redirect elsewhere", () => { enableMail(); process.env.ZOHO_MAIL_REDIRECT_URI = "https://scanme.rs/admin/posta"; }],
      ["plain http", () => { enableMail(); process.env.ZOHO_MAIL_REDIRECT_URI = "http://scanme.rs/api/admin/posta/callback"; }],
    ];
    for (const [label, apply] of variants) {
      apply();
      const status = await f.a.query(api.adminMail.getMailStatus, {});
      expect({ label, configured: status.configured }).toEqual({ label, configured: false });
      for (const call of everyCall(f.a, connectionId)) expect({ label, code: await codeOf(call()) }).toEqual({ label, code: "ZOHO_NOT_CONFIGURED" });
    }
    expect(zoho.fetchMock).not.toHaveBeenCalled();
  });

  test("disconnect still deletes the own connection locally, with no network call", async () => {
    const f = await setup();
    const connectionId = await seedConnection(f);
    await f.a.action(api.adminMail.disconnect, { connectionId });
    expect(await dumpMail(f)).toBe(JSON.stringify({ adminMailConnections: [], adminMailAccounts: [], adminMailOAuthStates: [] }));
    expect(zoho.fetchMock).not.toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------------
// OAuth state and connecting
// -----------------------------------------------------------------------------

describe("server-side OAuth with a one-time state", () => {
  test("the authorize URL is EU, offline, consent, the minimal scopes and the redirect; only the state hash is stored", async () => {
    enableMail();
    const f = await setup();
    const { authorizeUrl } = await f.a.mutation(api.adminMail.startZohoConnect, {});
    const url = new URL(authorizeUrl);
    expect(`${url.origin}${url.pathname}`).toBe("https://accounts.zoho.eu/oauth/v2/auth");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: CLIENT_ID,
      response_type: "code",
      redirect_uri: REDIRECT,
      access_type: "offline",
      prompt: "consent",
      scope: "ZohoMail.accounts.READ,ZohoMail.folders.READ,ZohoMail.messages.READ,ZohoMail.messages.UPDATE,ZohoMail.messages.CREATE",
    });
    expect(url.searchParams.has("client_secret")).toBe(false);
    const state = url.searchParams.get("state")!;
    expect(state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const rows = await f.t.run((ctx) => ctx.db.query("adminMailOAuthStates").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ ownerUserId: f.adminA, stateHash: await sha256Hex(state), expiresAt: NOW + 10 * 60 * 1_000 });
    expect(JSON.stringify(rows)).not.toContain(state);
    expect(zoho.fetchMock).not.toHaveBeenCalled();
  });

  test("a state is used once: the second callback with it is refused before any token request", async () => {
    enableMail();
    const f = await setup();
    const state = await startState(f.a);
    expect(await f.a.action(api.adminMail.completeZohoConnect, { code: "test-code", state })).toEqual({ primaryEmail: ADMIN_A, accounts: 1 });
    expect(tokenUrlCalls()).toHaveLength(1);
    expect(await codeOf(f.a.action(api.adminMail.completeZohoConnect, { code: "test-code", state }))).toBe("ZOHO_STATE_INVALID");
    expect(tokenUrlCalls()).toHaveLength(1);
  });

  test("a state expires after 10 minutes; an unknown state is refused", async () => {
    enableMail();
    const f = await setup();
    const state = await startState(f.a);
    vi.setSystemTime(NOW + 10 * 60 * 1_000);
    expect(await codeOf(f.a.action(api.adminMail.completeZohoConnect, { code: "test-code", state }))).toBe("ZOHO_STATE_INVALID");
    expect(await codeOf(f.a.action(api.adminMail.completeZohoConnect, { code: "test-code", state: "b".repeat(43) }))).toBe("ZOHO_STATE_INVALID");
    expect(zoho.fetchMock).not.toHaveBeenCalled();
  });

  test("another admin cannot use the state; it stays valid for the admin who started it", async () => {
    enableMail();
    const f = await setup();
    const state = await startState(f.a);
    expect(await codeOf(f.b.action(api.adminMail.completeZohoConnect, { code: "test-code", state }))).toBe("ZOHO_STATE_INVALID");
    expect(zoho.fetchMock).not.toHaveBeenCalled();
    expect(await codeOf(f.a.action(api.adminMail.completeZohoConnect, { code: "test-code", state }))).toBe("OK");
    expect((await f.b.query(api.adminMail.getMailStatus, {})).connections).toEqual([]);
  });

  test("a rejected code maps to ZOHO_AUTH_REQUIRED and stores nothing", async () => {
    enableMail();
    const f = await setup();
    const state = await startState(f.a);
    expect(await codeOf(f.a.action(api.adminMail.completeZohoConnect, { code: "pogresan-kod", state }))).toBe("ZOHO_AUTH_REQUIRED");
    expect((await f.a.query(api.adminMail.getMailStatus, {})).connections).toEqual([]);
  });

  test("connecting stores only ciphertext bound to the owner; status and URLs never carry a token", async () => {
    enableMail();
    const f = await setup();
    const connection = await connect(f.a);
    expect(connection).toMatchObject({
      primaryEmail: ADMIN_A,
      status: "active",
      lastErrorCode: null,
      accounts: [{ accountId: ACC_A, emailAddress: ADMIN_A, displayName: `TEST ${ADMIN_A}`, isDefault: true }],
    });
    const dump = await dumpMail(f);
    for (const secret of ["test-refresh-1", "test-access-1", CLIENT_SECRET]) expect(dump).not.toContain(secret);
    const status = JSON.stringify(await f.a.query(api.adminMail.getMailStatus, {}));
    for (const leak of ["Ciphertext", "Iv", "test-refresh", "test-access"]) expect(status).not.toContain(leak);
    const row = await f.t.run(async (ctx) => (await ctx.db.get(connection.connectionId))!);
    const key = await importAdminMailKey(decodeAdminMailKey(TEST_KEY)!);
    const aad = adminMailTokenAad({ ownerUserId: f.adminA, primaryEmail: ADMIN_A, purpose: "refresh" });
    expect(await decryptAdminMailSecret(key, { ciphertext: row.refreshTokenCiphertext, iv: row.refreshTokenIv }, aad)).toBe("test-refresh-1");
    for (const call of zoho.calls) {
      for (const secret of ["test-refresh", "test-access", CLIENT_SECRET]) expect(call.url.href).not.toContain(secret);
    }
    // the code exchange goes to the EU token endpoint in the form body
    expect(tokenUrlCalls()[0]).toMatchObject({ method: "POST" });
    expect(new URLSearchParams(tokenUrlCalls()[0].body).get("grant_type")).toBe("authorization_code");
  });

  test("reconnecting the same mailbox updates the one connection instead of adding a second", async () => {
    enableMail();
    const f = await setup();
    const first = await connect(f.a);
    const second = await connect(f.a);
    expect(second.connectionId).toBe(first.connectionId);
    const rows = await f.t.run(async (ctx) => ({
      connections: await ctx.db.query("adminMailConnections").collect(),
      accounts: await ctx.db.query("adminMailAccounts").collect(),
    }));
    expect(rows.connections).toHaveLength(1);
    expect(rows.accounts).toHaveLength(1);
  });

  test("a Zoho user without a mailbox is refused and the fresh grant is revoked", async () => {
    enableMail();
    const f = await setup();
    zoho.state.accounts = [];
    const state = await startState(f.a);
    expect(await codeOf(f.a.action(api.adminMail.completeZohoConnect, { code: "test-code", state }))).toBe("ZOHO_NO_MAILBOX");
    const revoke = zoho.calls.find((call) => call.url.pathname === "/oauth/v2/token/revoke");
    expect(revoke && new URLSearchParams(revoke.body).get("token")).toBe("test-refresh-1");
    expect((await f.a.query(api.adminMail.getMailStatus, {})).connections).toEqual([]);
  });
});

// -----------------------------------------------------------------------------
// Reading live, only from the own connection
// -----------------------------------------------------------------------------

describe("reading live from the own connection", () => {
  test("folders: Inbox, Sent, Drafts first, then the rest; the cached access token is reused", async () => {
    enableMail();
    const f = await setup();
    const { connectionId } = await connect(f.a);
    const folders = await f.a.action(api.adminMail.listFolders, { connectionId, accountId: ACC_A });
    expect(folders.map((folder) => folder.name)).toEqual(["Inbox", "Sent", "Drafts", "TEST projekti"]);
    expect(tokenUrlCalls()).toHaveLength(1); // only the code exchange
    expect(mailCalls().at(-1)?.headers.get("Authorization")).toBe("Zoho-oauthtoken test-access-1");
  });

  test("message list: paging with one extra row, unread filter, search across the mailbox", async () => {
    enableMail();
    const f = await setup();
    const { connectionId } = await connect(f.a);
    const page = await f.a.action(api.adminMail.listMessages, { connectionId, accountId: ACC_A, folderId: INBOX, start: 1, limit: 2 });
    expect(page.hasMore).toBe(true);
    expect(page.messages.map((row) => row.messageId)).toEqual([M_HTML, M_TEXT]);
    expect(page.messages[0]).toMatchObject({ unread: true, subject: "TEST HTML ponuda", fromName: "TEST Pošiljalac", summary: "TEST isečak & više" });
    expect(page.messages[1]).toMatchObject({ unread: false, hasAttachment: true });
    const view = mailCalls().at(-1)!.url;
    expect(Object.fromEntries(view.searchParams)).toMatchObject({ folderId: INBOX, start: "1", limit: "3", status: "all", sortBy: "date", sortorder: "false" });

    const unread = await f.a.action(api.adminMail.listMessages, { connectionId, accountId: ACC_A, folderId: INBOX, start: 1, limit: 25, unreadOnly: true });
    expect(mailCalls().at(-1)!.url.searchParams.get("status")).toBe("unread");
    expect(unread).toMatchObject({ hasMore: false, messages: [{ messageId: M_HTML }] });

    const found = await f.a.action(api.adminMail.listMessages, { connectionId, accountId: ACC_A, folderId: INBOX, start: 1, limit: 25, search: "  ponuda::sender:x " });
    const search = mailCalls().at(-1)!.url;
    expect(search.pathname).toBe(`/api/accounts/${ACC_A}/messages/search`);
    expect(search.searchParams.get("searchKey")).toBe("entire:ponuda sender:x");
    // the 64-bit id sent as a JSON number keeps every digit
    expect(found.messages).toEqual([expect.objectContaining({ messageId: M_HTML, folderId: INBOX, unread: true, receivedAt: 1759737600000, threadId: null })]);
  });

  test("message: headers, raw body and attachment metadata; nothing of it is stored", async () => {
    enableMail();
    const f = await setup();
    const { connectionId } = await connect(f.a);
    const html = await f.a.action(api.adminMail.getMessage, message(connectionId));
    expect(html).toMatchObject({
      messageId: M_HTML,
      subject: "TEST HTML ponuda",
      from: { name: "TEST Pošiljalac", address: "posiljalac@example.invalid" },
      to: [{ name: "TEST A", address: ADMIN_A }],
      cc: [],
      unread: true,
      body: { kind: "html", content: HTML_BODY },
      attachments: [],
    });
    const text = await f.a.action(api.adminMail.getMessage, message(connectionId, M_TEXT));
    expect(text.body).toEqual({ kind: "text", content: "TEST obican tekst\nDrugi red" });
    expect(text.attachments.map((item) => item.fileName)).toEqual(["TEST ponuda.pdf", "TEST alat.exe", "TEST veliki.pdf"]);
    const dump = await dumpMail(f);
    for (const content of ["TEST HTML ponuda", "TEST obican tekst", "TEST ponuda.pdf", "posiljalac@example.invalid"]) expect(dump).not.toContain(content);
  });

  test("attachments go through the action: allowed type in chunks, a blocked type or size is refused before download", async () => {
    enableMail();
    const f = await setup();
    const { connectionId } = await connect(f.a);
    const file = await f.a.action(api.adminMail.downloadAttachment, { ...message(connectionId, M_TEXT), attachmentId: ATT_PDF });
    expect(file.fileName).toBe("TEST ponuda.pdf");
    expect(file.mimeType).toBe("application/pdf");
    expect(new TextDecoder().decode(new Uint8Array(file.chunks[0]))).toBe("%PDF-TEST");
    const downloads = () => mailCalls().filter((call) => call.url.pathname.includes("/attachments/")).length;
    expect(downloads()).toBe(1);
    expect(await codeOf(f.a.action(api.adminMail.downloadAttachment, { ...message(connectionId, M_TEXT), attachmentId: ATT_EXE }))).toBe("ZOHO_ATTACHMENT_BLOCKED");
    expect(await codeOf(f.a.action(api.adminMail.downloadAttachment, { ...message(connectionId, M_TEXT), attachmentId: ATT_BIG }))).toBe("ZOHO_ATTACHMENT_BLOCKED");
    expect(downloads()).toBe(1);
  });

  test("mark as read is an explicit PUT with the 64-bit id unrounded", async () => {
    enableMail();
    const f = await setup();
    const { connectionId } = await connect(f.a);
    expect(await f.a.action(api.adminMail.markRead, { connectionId, accountId: ACC_A, messageId: M_HTML })).toBeNull();
    const put = mailCalls().at(-1)!;
    expect(put.method).toBe("PUT");
    expect(put.url.pathname).toBe(`/api/accounts/${ACC_A}/updatemessage`);
    expect(put.body).toBe(`{"mode":"markAsRead","messageId":[${M_HTML}]}`);
  });

  test("another admin cannot read, mark or disconnect the connection: same answer as a missing one, no network", async () => {
    enableMail();
    const f = await setup();
    const { connectionId } = await connect(f.a);
    const before = zoho.calls.length;
    const attempts: (() => Promise<unknown>)[] = [
      () => f.b.action(api.adminMail.listFolders, { connectionId, accountId: ACC_A }),
      () => f.b.action(api.adminMail.listMessages, { connectionId, accountId: ACC_A, folderId: INBOX, start: 1, limit: 25 }),
      () => f.b.action(api.adminMail.getMessage, message(connectionId)),
      () => f.b.action(api.adminMail.downloadAttachment, { ...message(connectionId, M_TEXT), attachmentId: ATT_PDF }),
      () => f.b.action(api.adminMail.markRead, { connectionId, accountId: ACC_A, messageId: M_HTML }),
      () => f.b.action(api.adminMail.disconnect, { connectionId }),
    ];
    for (const attempt of attempts) expect(await codeOf(attempt())).toBe("ZOHO_CONNECTION_NOT_FOUND");
    expect(zoho.calls.length).toBe(before);
    expect((await f.b.query(api.adminMail.getMailStatus, {})).connections).toEqual([]);
    // A deleted connection answers exactly the same.
    await f.a.action(api.adminMail.disconnect, { connectionId });
    expect(await codeOf(f.a.action(api.adminMail.listFolders, { connectionId, accountId: ACC_A }))).toBe("ZOHO_CONNECTION_NOT_FOUND");
  });

  test("an account id that is not under the own connection is refused without network", async () => {
    enableMail();
    const f = await setup();
    const { connectionId } = await connect(f.a);
    const before = zoho.calls.length;
    expect(await codeOf(f.a.action(api.adminMail.listFolders, { connectionId, accountId: ACC_B }))).toBe("ZOHO_CONNECTION_NOT_FOUND");
    expect(await codeOf(f.a.action(api.adminMail.listFolders, { connectionId, accountId: "../../accounts" }))).toBe("ZOHO_REQUEST_REJECTED");
    expect(zoho.calls.length).toBe(before);
  });

  test("ciphertext copied into another admin's row does not decrypt (owner-bound AAD)", async () => {
    enableMail();
    const f = await setup();
    const a = await connect(f.a);
    zoho.state.accounts = [{ accountId: ACC_B, email: ADMIN_B }];
    const b = await connect(f.b);
    await f.t.run(async (ctx) => {
      const source = (await ctx.db.get(a.connectionId))!;
      await ctx.db.patch(b.connectionId, {
        refreshTokenCiphertext: source.refreshTokenCiphertext,
        refreshTokenIv: source.refreshTokenIv,
        accessTokenCiphertext: source.accessTokenCiphertext,
        accessTokenIv: source.accessTokenIv,
      });
    });
    const before = zoho.calls.length;
    expect(await codeOf(f.b.action(api.adminMail.listFolders, { connectionId: b.connectionId, accountId: ACC_B }))).toBe("ZOHO_AUTH_REQUIRED");
    expect(zoho.calls.length).toBe(before);
    expect((await f.b.query(api.adminMail.getMailStatus, {})).connections[0].status).toBe("auth_required");
  });
});

// -----------------------------------------------------------------------------
// 401 → one refresh → auth_required; 429; 5xx; key rotation
// -----------------------------------------------------------------------------

describe("token refresh and provider errors", () => {
  test("401 → one refresh → the call is retried with the new token, which is cached encrypted", async () => {
    enableMail();
    const f = await setup();
    const { connectionId } = await connect(f.a);
    zoho.state.validAccess.delete("test-access-1");
    const folders = await f.a.action(api.adminMail.listFolders, { connectionId, accountId: ACC_A });
    expect(folders).toHaveLength(4);
    expect(tokenUrlCalls().map((call) => new URLSearchParams(call.body).get("grant_type"))).toEqual(["authorization_code", "refresh_token"]);
    expect(mailCalls().at(-1)?.headers.get("Authorization")).toBe("Zoho-oauthtoken test-access-2");
    expect(await dumpMail(f)).not.toContain("test-access-2");
    await f.a.action(api.adminMail.listFolders, { connectionId, accountId: ACC_A });
    expect(tokenUrlCalls()).toHaveLength(2); // the refreshed token is reused
  });

  test("401 again after the refresh → ZOHO_AUTH_REQUIRED, the connection needs reconnecting, later calls do not touch Zoho", async () => {
    enableMail();
    const f = await setup();
    const { connectionId } = await connect(f.a);
    zoho.state.mailAlways401 = true;
    expect(await codeOf(f.a.action(api.adminMail.listFolders, { connectionId, accountId: ACC_A }))).toBe("ZOHO_AUTH_REQUIRED");
    expect(tokenUrlCalls()).toHaveLength(2);
    const status = await f.a.query(api.adminMail.getMailStatus, {});
    expect(status.connections[0]).toMatchObject({ status: "auth_required", lastErrorCode: "ZOHO_AUTH_REQUIRED" });
    const before = zoho.calls.length;
    expect(await codeOf(f.a.action(api.adminMail.listMessages, { connectionId, accountId: ACC_A, folderId: INBOX, start: 1, limit: 25 }))).toBe("ZOHO_AUTH_REQUIRED");
    expect(zoho.calls.length).toBe(before);
    // Reconnecting brings it back.
    zoho.state.mailAlways401 = false;
    expect((await connect(f.a)).status).toBe("active");
  });

  test("an expired cache refreshes first; a refresh token Zoho rejects → ZOHO_AUTH_REQUIRED", async () => {
    enableMail();
    const f = await setup();
    const { connectionId } = await connect(f.a);
    vi.setSystemTime(NOW + 60 * 60 * 1_000);
    await f.a.action(api.adminMail.listFolders, { connectionId, accountId: ACC_A });
    expect(tokenUrlCalls()).toHaveLength(2);
    vi.setSystemTime(NOW + 2 * 60 * 60 * 1_000);
    zoho.state.refreshRejected = true;
    expect(await codeOf(f.a.action(api.adminMail.listFolders, { connectionId, accountId: ACC_A }))).toBe("ZOHO_AUTH_REQUIRED");
    expect((await f.a.query(api.adminMail.getMailStatus, {})).connections[0].status).toBe("auth_required");
  });

  test("a different encryption key (rotation) cannot decrypt: ZOHO_AUTH_REQUIRED without any Zoho call", async () => {
    enableMail();
    const f = await setup();
    const { connectionId } = await connect(f.a);
    process.env.ZOHO_TOKEN_ENCRYPTION_KEY = OTHER_KEY;
    const before = zoho.calls.length;
    expect(await codeOf(f.a.action(api.adminMail.listFolders, { connectionId, accountId: ACC_A }))).toBe("ZOHO_AUTH_REQUIRED");
    expect(zoho.calls.length).toBe(before);
  });

  test("429 → ZOHO_RATE_LIMITED with Retry-After and no retry; 5xx → one retry, then ZOHO_UNAVAILABLE", async () => {
    enableMail();
    const f = await setup();
    const { connectionId } = await connect(f.a);
    const folders = `/api/accounts/${ACC_A}/folders`;
    const count = () => mailCalls().filter((call) => call.url.pathname === folders).length;

    zoho.state.failures.set(folders, [429]);
    await expect(f.a.action(api.adminMail.listFolders, { connectionId, accountId: ACC_A })).rejects.toMatchObject({ data: { code: "ZOHO_RATE_LIMITED", retryAfterSeconds: 30 } });
    expect(count()).toBe(1);

    zoho.state.failures.set(folders, [503]);
    expect(await f.a.action(api.adminMail.listFolders, { connectionId, accountId: ACC_A })).toHaveLength(4);
    expect(count()).toBe(3);

    zoho.state.failures.set(folders, [502, 500]);
    expect(await codeOf(f.a.action(api.adminMail.listFolders, { connectionId, accountId: ACC_A }))).toBe("ZOHO_UNAVAILABLE");
    expect(count()).toBe(5);
    expect((await f.a.query(api.adminMail.getMailStatus, {})).connections[0].status).toBe("active");
  });

  test("disconnect revokes the grant at Zoho (token in the body, not the URL) and deletes connection, tokens and accounts", async () => {
    enableMail();
    const f = await setup();
    const { connectionId } = await connect(f.a);
    await f.a.action(api.adminMail.disconnect, { connectionId });
    const revoke = zoho.calls.find((call) => call.url.pathname === "/oauth/v2/token/revoke")!;
    expect(revoke.url.search).toBe("");
    expect(new URLSearchParams(revoke.body).get("token")).toBe("test-refresh-1");
    const rows = await f.t.run(async (ctx) => ({
      connections: await ctx.db.query("adminMailConnections").collect(),
      accounts: await ctx.db.query("adminMailAccounts").collect(),
    }));
    expect(rows).toEqual({ connections: [], accounts: [] });
  });
});

// -----------------------------------------------------------------------------
// Zoho response mapping (pure)
// -----------------------------------------------------------------------------

describe("Zoho response mapping", () => {
  test("long numeric ids keep every digit; quoted values and strings are untouched", () => {
    const payload = parseZohoJson('{"data":[{"messageId":1709887058769100001,"folderId":"9000000002014","summary":"\\"messageId\\": 1709887058769100009","size":540}]}') as { data: Record<string, unknown>[] };
    expect(payload.data[0]).toEqual({ messageId: "1709887058769100001", folderId: "9000000002014", summary: '"messageId": 1709887058769100009', size: 540 });
  });

  test("accounts: only enabled Zoho mailboxes, lower-cased address, display name", () => {
    const accounts = parseZohoMailAccounts({ status: { code: 200 }, data: [
      { accountId: "9000000000101", primaryEmailAddress: "Ana@Scanme.Test", displayName: "TEST Ana", type: "ZOHO_ACCOUNT", enabled: true },
      { accountId: "9000000000102", primaryEmailAddress: "pop@example.invalid", type: "POP_ACCOUNT", enabled: true },
      { accountId: "9000000000103", primaryEmailAddress: "off@scanme.test", type: "ZOHO_ACCOUNT", enabled: false },
      { accountId: "nije-id", primaryEmailAddress: "x@scanme.test", type: "ZOHO_ACCOUNT" },
    ] });
    expect(accounts).toEqual([{ accountId: "9000000000101", emailAddress: "ana@scanme.test", displayName: "TEST Ana" }]);
  });

  test("folders keep path and type; invalid rows are skipped", () => {
    expect(parseZohoMailFolders({ status: { code: 200 }, data: [
      { folderId: "1", folderName: "Spam", folderType: "Spam", path: "/Spam" },
      { folderId: "2", folderName: "Inbox", folderType: "Inbox", path: "/Inbox" },
      { folderId: "x", folderName: "Bad" },
    ] })).toEqual([
      { folderId: "2", name: "Inbox", type: "Inbox", path: "/Inbox" },
      { folderId: "1", name: "Spam", type: "Spam", path: "/Spam" },
    ]);
  });

  test("list and search rows: unread from \"0\"/\"unread\", receivedTime/receivedtime, entities decoded", () => {
    const rows = parseZohoMailList({ status: { code: 200 }, data: [
      { messageId: "11", folderId: "2", threadId: "77", subject: "A &amp; B", sender: "", fromAddress: "&quot;Ana&quot;&lt;ana@example.invalid&gt;", summary: "x\n  y", receivedTime: "1000", status: "0", hasAttachment: "1" },
      { messageId: 12, folderId: 2, subject: "C", fromAddress: "b@example.invalid", summary: "z", receivedtime: 2000, status: "read", hasAttachment: 0 },
      { messageId: "bad", folderId: "2" },
    ] });
    expect(rows).toEqual([
      { messageId: "11", folderId: "2", threadId: "77", subject: "A & B", fromName: "Ana", fromAddress: "ana@example.invalid", summary: "x y", receivedAt: 1000, unread: true, hasAttachment: true },
      { messageId: "12", folderId: "2", threadId: null, subject: "C", fromName: null, fromAddress: "b@example.invalid", summary: "z", receivedAt: 2000, unread: false, hasAttachment: false },
    ]);
  });

  test("details: escaped To list, \"Not Provided\" Cc, a non-success status is rejected", () => {
    const details = parseZohoMailDetails({ status: { code: 200 }, data: {
      folderId: "2", subject: "S", sender: "paula", fromAddress: "rebecca@example.invalid",
      toAddress: "&quot;Ana, B&quot;&lt;ana@example.invalid&gt;, c@example.invalid", ccAddress: "Not Provided", receivedTime: "5", status: "1", hasAttachment: "0",
    } });
    expect(details).toEqual({
      folderId: "2", subject: "S", from: { name: "paula", address: "rebecca@example.invalid" },
      to: [{ name: "Ana, B", address: "ana@example.invalid" }, { name: null, address: "c@example.invalid" }],
      cc: [], receivedAt: 5, unread: false, hasAttachment: false,
    });
    expect(() => parseZohoMailDetails({ status: { code: 404 }, data: {} })).toThrow(AdminMailError);
    expect(parseZohoAddressList("nije adresa")).toEqual([]);
  });

  test("token responses: seconds or milliseconds; Zoho's 200-with-error answers map to stable codes", () => {
    expect(parseZohoTokenResponse({ access_token: "a", refresh_token: "r", expires_in: 3600 })).toEqual({ accessToken: "a", refreshToken: "r", expiresInSeconds: 3600 });
    expect(parseZohoTokenResponse({ access_token: "a", expires_in: 3600000, expires_in_sec: 3600 }).expiresInSeconds).toBe(3600);
    expect(parseZohoTokenResponse({ access_token: "a", expires_in: 3600000 }).expiresInSeconds).toBe(3600);
    const code = (payload: unknown) => {
      try {
        parseZohoTokenResponse(payload);
        return "OK";
      } catch (error) {
        return (error as AdminMailError).code;
      }
    };
    expect(code({ error: "invalid_code" })).toBe("ZOHO_AUTH_REQUIRED");
    expect(code({ error: "invalid_client" })).toBe("ZOHO_NOT_CONFIGURED");
    expect(code({ error: "Access Denied", error_description: "You have made too many requests continuously." })).toBe("ZOHO_RATE_LIMITED");
    expect(code({ token_type: "Bearer" })).toBe("ZOHO_AUTH_REQUIRED");
  });

  test("authorize URL and search key", () => {
    const url = new URL(buildZohoAuthorizeUrl({ clientId: "c", redirectUri: REDIRECT, state: "s" }));
    expect(url.host).toBe("accounts.zoho.eu");
    expect(zohoSearchKey("   ")).toBeNull();
    expect(zohoSearchKey("a :or: b")).toBe("entire:a b");
    expect(zohoSearchKey("x".repeat(500))?.length).toBe("entire:".length + 100);
  });
});

// -----------------------------------------------------------------------------
// Authz table
// -----------------------------------------------------------------------------

// -----------------------------------------------------------------------------
// Z2 — sending, replying, forwarding, attachments and signature
// -----------------------------------------------------------------------------

const z2Tables: TableNames[] = [...mailTables, "adminMailUploads", "adminMailSendCommands"];
const dumpAll = (f: Fixture) => f.t.run(async (ctx) => {
  const all: Record<string, unknown> = {};
  for (const table of z2Tables) all[table] = await ctx.db.query(table).collect();
  return JSON.stringify(all);
});
const sendCalls = () => mailCalls().filter((call) => call.method === "POST" && /\/messages(\/\d+)?$/.test(call.url.pathname));
const uploadCalls = () => mailCalls().filter((call) => call.method === "POST" && call.url.pathname.endsWith("/messages/attachments"));
let commandCounter = 0;
const commandId = () => `test-send-command-${String(++commandCounter).padStart(4, "0")}`;
const commands = (f: Fixture) => f.t.run((ctx) => ctx.db.query("adminMailSendCommands").collect());

function newMail(connectionId: Id<"adminMailConnections">, overrides: Partial<{
  sendCommandId: string; accountId: string; mode: "new" | "reply" | "reply_all" | "forward"; to: string[]; cc: string[]; bcc: string[];
  subject: string; bodyText: string; source: { folderId: string; messageId: string }; uploadIds: Id<"adminMailUploads">[]; forwardAttachmentIds: string[];
}> = {}) {
  return {
    sendCommandId: commandId(),
    connectionId,
    accountId: ACC_A,
    mode: "new" as const,
    to: ["Kupac <Kupac@Example.invalid>"],
    cc: [] as string[],
    bcc: [] as string[],
    subject: "TEST ponuda",
    bodyText: "Zdravo,\n\n**TEST** ponuda <script>alert(1)</script>: https://example.invalid/ponuda",
    uploadIds: [] as Id<"adminMailUploads">[],
    ...overrides,
  };
}

async function storeUpload(f: Fixture, caller: Caller, fileName: string, content: string | Uint8Array = "%PDF-TEST-PRILOG") {
  const storageId = await f.t.run((ctx) => ctx.storage.store(new Blob([content as BlobPart])));
  const result = await caller.mutation(api.adminMail.registerMailUpload, { storageId, fileName });
  return { storageId, result, uploadId: result.status === "ready" ? result.uploadId : (null as unknown as Id<"adminMailUploads">) };
}

describe("Z2 — sending, attachments and signature", () => {
  test("a new message: own mailbox as fromAddress, validated recipients, the ScanMe template; nothing of it is stored", async () => {
    enableMail();
    const f = await setup();
    const { connectionId } = await connect(f.a);
    const result = await f.a.action(api.adminMail.sendMail, newMail(connectionId, {
      cc: ["kopija@example.invalid", "KUPAC@example.invalid"],
      bcc: ["tajno@example.invalid"],
    }));
    expect(result).toMatchObject({ status: "sent", errorCode: null, duplicate: false });
    expect(sendCalls()).toHaveLength(1);
    const call = sendCalls()[0];
    expect(call.url.pathname).toBe(`/api/accounts/${ACC_A}/messages`);
    expect(call.url.search).toBe("");
    expect(call.headers.get("Authorization")).toMatch(/^Zoho-oauthtoken test-access-\d+$/);
    const payload = JSON.parse(call.body);
    expect(payload).toMatchObject({
      fromAddress: ADMIN_A,
      toAddress: "kupac@example.invalid",
      ccAddress: "kopija@example.invalid",
      bccAddress: "tajno@example.invalid",
      subject: "TEST ponuda",
      mailFormat: "html",
      encoding: "UTF-8",
      askReceipt: "no",
    });
    expect(payload).not.toHaveProperty("action");
    expect(payload).not.toHaveProperty("attachments");
    expect(payload.content).toContain('<span style="color:#273331;">Scan</span><span style="color:#668f00;">Me</span>');
    expect(payload.content).toContain("<strong>TEST</strong> ponuda &lt;script&gt;alert(1)&lt;/script&gt;");
    expect(payload.content).toContain('<a href="https://example.invalid/ponuda"');
    expect(payload.content).not.toContain("<script");
    const dump = await dumpAll(f);
    for (const content of ["TEST ponuda", "kupac@example.invalid", "kopija@example.invalid", "tajno@example.invalid", "script"]) expect(dump).not.toContain(content);
    expect(await commands(f)).toEqual([expect.objectContaining({ status: "sent", mode: "new", zohoAccountId: ACC_A, providerMessageId: "1709887058769300001" })]);
  });

  test("recipients: an invalid address, no To or more than 50 addresses are refused before any network call or record", async () => {
    enableMail();
    const f = await setup();
    const { connectionId } = await connect(f.a);
    const before = zoho.calls.length;
    const cases: { to: string[]; cc: string[] }[] = [
      { to: ["nije-adresa"], cc: [] },
      { to: ["a@b"], cc: [] },
      { to: ["ok@example.invalid"], cc: ["dva@@example.invalid"] },
      { to: [], cc: ["kopija@example.invalid"] },
      { to: Array.from({ length: 51 }, (_, index) => `primalac${index}@example.invalid`), cc: [] },
    ];
    for (const recipients of cases) {
      expect(await codeOf(f.a.action(api.adminMail.sendMail, newMail(connectionId, recipients)))).toBe("ZOHO_RECIPIENT_INVALID");
    }
    expect(zoho.calls.length).toBe(before);
    expect(await commands(f)).toEqual([]);
  });

  test("a reply goes to the Reply endpoint with Re: and the original quoted as escaped plain text", async () => {
    enableMail();
    const f = await setup();
    const { connectionId } = await connect(f.a);
    const result = await f.a.action(api.adminMail.sendMail, newMail(connectionId, {
      mode: "reply",
      subject: "",
      to: ["posiljalac@example.invalid"],
      bodyText: "Hvala na poruci.",
      source: { folderId: INBOX, messageId: M_HTML },
    }));
    expect(result.status).toBe("sent");
    const call = sendCalls()[0];
    expect(call.url.pathname).toBe(`/api/accounts/${ACC_A}/messages/${M_HTML}`);
    const payload = JSON.parse(call.body);
    expect(payload).toMatchObject({ action: "Reply", subject: "Re: TEST HTML ponuda", fromAddress: ADMIN_A, toAddress: "posiljalac@example.invalid" });
    expect(payload.content).toContain("TEST Pošiljalac &lt;posiljalac@example.invalid&gt; piše:");
    expect(payload.content).toMatch(/<blockquote[^>]*>TEST ponuda<\/blockquote>/);
    for (const unsafe of ["<script", "alert(1)", "tracker.example.invalid"]) expect(payload.content).not.toContain(unsafe);
    // reply-all keeps its own explicit recipients; an already prefixed subject is not doubled
    await f.a.action(api.adminMail.sendMail, newMail(connectionId, {
      mode: "reply_all",
      subject: "Re: TEST HTML ponuda",
      to: ["posiljalac@example.invalid", "drugi@example.invalid"],
      cc: ["kopija@example.invalid"],
      source: { folderId: INBOX, messageId: M_HTML },
    }));
    expect(JSON.parse(sendCalls()[1].body)).toMatchObject({ action: "Reply", subject: "Re: TEST HTML ponuda", toAddress: "posiljalac@example.invalid,drugi@example.invalid", ccAddress: "kopija@example.invalid" });
  });

  test("forward: a new message with Fwd:, the forwarded block and an original attachment re-uploaded; a blocked type stops the send", async () => {
    enableMail();
    const f = await setup();
    const { connectionId } = await connect(f.a);
    const result = await f.a.action(api.adminMail.sendMail, newMail(connectionId, {
      mode: "forward",
      subject: "",
      bodyText: "Prosleđujem.",
      source: { folderId: INBOX, messageId: M_TEXT },
      forwardAttachmentIds: [ATT_PDF],
    }));
    expect(result.status).toBe("sent");
    const call = sendCalls()[0];
    expect(call.url.pathname).toBe(`/api/accounts/${ACC_A}/messages`);
    const payload = JSON.parse(call.body);
    expect(payload.subject).toBe("Fwd: TEST tekst");
    expect(payload).not.toHaveProperty("action");
    expect(payload.content).toContain("---------- Prosleđena poruka ----------");
    expect(payload.content).toContain("<strong>Od:</strong> TEST Pošiljalac &lt;posiljalac@example.invalid&gt;");
    expect(payload.content).toContain("TEST obican tekst<br>Drugi red");
    const download = mailCalls().find((item) => item.url.pathname.endsWith(`/attachments/${ATT_PDF}`));
    expect(download?.method).toBe("GET");
    expect(uploadCalls()).toHaveLength(1);
    expect(uploadCalls()[0].url.searchParams.get("fileName")).toBe("TEST ponuda.pdf");
    expect(new TextDecoder().decode(uploadCalls()[0].bytes!)).toBe("%PDF-TEST");
    expect(payload.attachments).toEqual([{ storeName: "TEST-NN2", attachmentPath: "/test-upload_TEST ponuda.pdf", attachmentName: "TEST ponuda.pdf" }]);

    const blocked = await f.a.action(api.adminMail.sendMail, newMail(connectionId, {
      mode: "forward",
      source: { folderId: INBOX, messageId: M_TEXT },
      forwardAttachmentIds: [ATT_EXE],
    }));
    expect(blocked).toMatchObject({ status: "failed", errorCode: "ZOHO_ATTACHMENT_BLOCKED" });
    expect(sendCalls()).toHaveLength(1);
  });

  test("an attachment goes browser → Convex storage → Zoho upload → send, and the temporary file is deleted", async () => {
    enableMail();
    const f = await setup();
    const { connectionId } = await connect(f.a);
    expect(await f.a.mutation(api.adminMail.generateMailUploadUrl, {})).toEqual(expect.any(String));
    const { storageId, result: upload, uploadId } = await storeUpload(f, f.a, "C:\\fakepath\\TEST ponuda.pdf");
    expect(upload).toMatchObject({ status: "ready", fileName: "TEST ponuda.pdf", mimeType: "application/pdf", size: 16 });
    const result = await f.a.action(api.adminMail.sendMail, newMail(connectionId, { uploadIds: [uploadId] }));
    expect(result.status).toBe("sent");
    expect(uploadCalls()).toHaveLength(1);
    const uploaded = uploadCalls()[0];
    expect(uploaded.url.searchParams.get("fileName")).toBe("TEST ponuda.pdf");
    expect(uploaded.headers.get("Content-Type")).toBe("application/octet-stream");
    expect(new TextDecoder().decode(uploaded.bytes!)).toBe("%PDF-TEST-PRILOG");
    expect(zoho.calls.indexOf(uploaded)).toBeLessThan(zoho.calls.indexOf(sendCalls()[0]));
    expect(JSON.parse(sendCalls()[0].body).attachments).toEqual([{ storeName: "TEST-NN2", attachmentPath: "/test-upload_TEST ponuda.pdf", attachmentName: "TEST ponuda.pdf" }]);
    expect(await f.t.run(async (ctx) => ({
      rows: await ctx.db.query("adminMailUploads").collect(),
      file: await ctx.db.system.get("_storage", storageId),
    }))).toEqual({ rows: [], file: null });
  });

  test("uploads: a blocked type or a file over 10 MB is deleted at once; an accepted one expires after 2 h", async () => {
    enableMail();
    const f = await setup();
    await connect(f.a);
    const exe = await storeUpload(f, f.a, "TEST alat.exe");
    const html = await storeUpload(f, f.a, "TEST stranica.html");
    const big = await storeUpload(f, f.a, "TEST veliki.pdf", new Uint8Array(10 * 1024 * 1024 + 1));
    for (const rejected of [exe, html, big]) {
      expect(rejected.result).toEqual({ status: "rejected", code: "ZOHO_ATTACHMENT_BLOCKED" });
      expect(await f.t.run((ctx) => ctx.db.system.get("_storage", rejected.storageId))).toBeNull();
    }
    const kept = await storeUpload(f, f.a, "TEST tabela.xlsx");
    expect(kept.result).toMatchObject({ status: "ready", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const scheduled = await f.t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
    expect(scheduled).toEqual([expect.objectContaining({ name: expect.stringContaining("expireMailUpload"), scheduledTime: NOW + 2 * 60 * 60 * 1_000, args: [{ uploadId: kept.uploadId }] })]);
    await f.t.mutation(internal.adminMail.expireMailUpload, { uploadId: kept.uploadId });
    expect(await f.t.run(async (ctx) => ({
      rows: await ctx.db.query("adminMailUploads").collect(),
      file: await ctx.db.system.get("_storage", kept.storageId),
    }))).toEqual({ rows: [], file: null });
    // the owner can remove a waiting file (chip removed)
    const removed = await storeUpload(f, f.a, "TEST slika.png");
    await f.a.mutation(api.adminMail.removeMailUpload, { uploadId: removed.uploadId });
    expect(await f.t.run((ctx) => ctx.db.system.get("_storage", removed.storageId))).toBeNull();
  });

  test("a send that may have reached Zoho is never repeated: needs_reconciliation, and the same id only reads the outcome", async () => {
    enableMail();
    const f = await setup();
    const { connectionId } = await connect(f.a);
    for (const behavior of ["network", 500, 503, "garbage"] as const) {
      const upload = await storeUpload(f, f.a, "TEST ponuda.pdf");
      zoho.state.sendBehavior.push(behavior);
      const args = newMail(connectionId, { uploadIds: [upload.uploadId] });
      const before = sendCalls().length;
      const first = await f.a.action(api.adminMail.sendMail, args);
      expect({ behavior, first }).toEqual({ behavior, first: { sendCommandId: args.sendCommandId, status: "needs_reconciliation", errorCode: "ZOHO_SEND_UNCERTAIN", duplicate: false } });
      const second = await f.a.action(api.adminMail.sendMail, args);
      expect({ behavior, second }).toEqual({ behavior, second: { sendCommandId: args.sendCommandId, status: "needs_reconciliation", errorCode: "ZOHO_SEND_UNCERTAIN", duplicate: true } });
      expect({ behavior, posts: sendCalls().length - before }).toEqual({ behavior, posts: 1 });
      expect(await f.a.query(api.adminMail.getSendCommand, { sendCommandId: args.sendCommandId })).toEqual({ status: "needs_reconciliation", errorCode: "ZOHO_SEND_UNCERTAIN" });
      expect(await f.t.run((ctx) => ctx.db.system.get("_storage", upload.storageId))).toBeNull();
    }
  });

  test("a definite rejection is failed and keeps the files for a new attempt; a sent id never sends twice", async () => {
    enableMail();
    const f = await setup();
    const { connectionId } = await connect(f.a);
    const upload = await storeUpload(f, f.a, "TEST ponuda.pdf");
    zoho.state.sendBehavior.push(400);
    const failed = await f.a.action(api.adminMail.sendMail, newMail(connectionId, { uploadIds: [upload.uploadId] }));
    expect(failed).toMatchObject({ status: "failed", errorCode: "ZOHO_REQUEST_REJECTED", duplicate: false });
    expect(await f.t.run((ctx) => ctx.db.get(upload.uploadId))).not.toBeNull();
    const retry = newMail(connectionId, { uploadIds: [upload.uploadId] });
    expect(await f.a.action(api.adminMail.sendMail, retry)).toMatchObject({ status: "sent", duplicate: false });
    const posts = sendCalls().length;
    expect(await f.a.action(api.adminMail.sendMail, retry)).toMatchObject({ status: "sent", errorCode: null, duplicate: true });
    expect(sendCalls().length).toBe(posts);
  });

  test("before the POST: a rate-limited upload or a missing send scope fails with no send request", async () => {
    enableMail();
    const f = await setup();
    const { connectionId } = await connect(f.a);
    const upload = await storeUpload(f, f.a, "TEST ponuda.pdf");
    zoho.state.failures.set(`/api/accounts/${ACC_A}/messages/attachments`, [429]);
    expect(await f.a.action(api.adminMail.sendMail, newMail(connectionId, { uploadIds: [upload.uploadId] }))).toMatchObject({ status: "failed", errorCode: "ZOHO_RATE_LIMITED" });
    await f.t.run((ctx) => ctx.db.patch(connectionId, { scopes: ["ZohoMail.accounts.READ", "ZohoMail.folders.READ", "ZohoMail.messages.READ"] }));
    expect(await f.a.action(api.adminMail.sendMail, newMail(connectionId))).toMatchObject({ status: "failed", errorCode: "ZOHO_AUTH_REQUIRED" });
    expect(sendCalls()).toEqual([]);
  });

  test("another admin's connection, mailbox, attachment or send record is refused; nothing is sent", async () => {
    enableMail();
    const f = await setup();
    const a = await connect(f.a);
    const upload = await storeUpload(f, f.a, "TEST ponuda.pdf");
    const own = newMail(a.connectionId);
    await f.a.action(api.adminMail.sendMail, own);
    zoho.state.accounts = [{ accountId: ACC_B, email: ADMIN_B }];
    const b = await connect(f.b);
    const posts = sendCalls().length;
    const before = zoho.calls.length;
    expect(await codeOf(f.b.action(api.adminMail.sendMail, newMail(a.connectionId)))).toBe("ZOHO_CONNECTION_NOT_FOUND");
    expect(await codeOf(f.b.action(api.adminMail.sendMail, newMail(b.connectionId, { accountId: ACC_A })))).toBe("ZOHO_CONNECTION_NOT_FOUND");
    expect(zoho.calls.length).toBe(before);
    expect(await f.b.action(api.adminMail.sendMail, newMail(b.connectionId, { accountId: ACC_B, uploadIds: [upload.uploadId] }))).toMatchObject({ status: "failed", errorCode: "ZOHO_ATTACHMENT_BLOCKED" });
    expect(sendCalls().length).toBe(posts);
    expect(await f.t.run((ctx) => ctx.db.get(upload.uploadId))).not.toBeNull();
    await f.b.mutation(api.adminMail.removeMailUpload, { uploadId: upload.uploadId });
    expect(await f.t.run((ctx) => ctx.db.get(upload.uploadId))).not.toBeNull();
    expect(await codeOf(f.b.mutation(api.adminMail.updateSignature, { connectionId: a.connectionId, accountId: ACC_A, signatureText: "TEST" }))).toBe("ZOHO_CONNECTION_NOT_FOUND");
    expect(await f.b.query(api.adminMail.getSendCommand, { sendCommandId: own.sendCommandId })).toBeNull();
    // A foreign storage file cannot be claimed either.
    expect(await f.b.mutation(api.adminMail.registerMailUpload, { storageId: upload.storageId, fileName: "TEST ponuda.pdf" })).toEqual({ status: "rejected", code: "ZOHO_ATTACHMENT_BLOCKED" });
    expect(await f.t.run((ctx) => ctx.db.system.get("_storage", upload.storageId))).not.toBeNull();
  });

  test("signature: saved per mailbox, shown in status, added to every message (links kept), kept on reconnect", async () => {
    enableMail();
    const f = await setup();
    const { connectionId } = await connect(f.a);
    await f.a.mutation(api.adminMail.updateSignature, { connectionId, accountId: ACC_A, signatureText: "  TEST Admin\r\n[www.scanme.rs](https://www.scanme.rs) <b>  " });
    expect((await f.a.query(api.adminMail.getMailStatus, {})).connections[0].accounts[0].signatureText).toBe("TEST Admin\n[www.scanme.rs](https://www.scanme.rs) <b>");
    await f.a.action(api.adminMail.sendMail, newMail(connectionId));
    const content = JSON.parse(sendCalls()[0].body).content as string;
    expect(content).toMatch(/border-top:1px solid #e3e6dc;[^>]*>TEST Admin<br><a href="https:\/\/www\.scanme\.rs"[^>]*>www\.scanme\.rs<\/a> &lt;b&gt;<\/div>/);
    await connect(f.a);
    expect((await f.a.query(api.adminMail.getMailStatus, {})).connections[0].accounts[0].signatureText).toBe("TEST Admin\n[www.scanme.rs](https://www.scanme.rs) <b>");
    expect(await codeOf(f.a.mutation(api.adminMail.updateSignature, { connectionId, accountId: ACC_A, signatureText: "x".repeat(2_001) }))).toBe("ZOHO_COMPOSE_INVALID");
    await f.a.mutation(api.adminMail.updateSignature, { connectionId, accountId: ACC_A, signatureText: "   " });
    expect((await f.a.query(api.adminMail.getMailStatus, {})).connections[0].accounts[0].signatureText).toBeNull();
  });

  test("compose validation: reply without its source, new without subject, bad command id, too many attachments", async () => {
    enableMail();
    const f = await setup();
    const { connectionId } = await connect(f.a);
    const before = zoho.calls.length;
    const invalid = [
      newMail(connectionId, { mode: "reply" }),
      newMail(connectionId, { source: { folderId: INBOX, messageId: M_HTML } }),
      newMail(connectionId, { subject: "   " }),
      newMail(connectionId, { sendCommandId: "kratak" }),
      newMail(connectionId, { bodyText: "x".repeat(50_001) }),
      newMail(connectionId, { mode: "forward", source: { folderId: INBOX, messageId: M_TEXT }, forwardAttachmentIds: Array.from({ length: 11 }, (_, index) => String(1000 + index)) }),
    ];
    for (const args of invalid) expect(await codeOf(f.a.action(api.adminMail.sendMail, args))).toBe("ZOHO_COMPOSE_INVALID");
    expect(zoho.calls.length).toBe(before);
    expect(await commands(f)).toEqual([]);
  });

  test("inert without the switch: sending and uploads answer ZOHO_NOT_CONFIGURED with no network call", async () => {
    enableMail();
    const f = await setup();
    const { connectionId } = await connect(f.a);
    const storageId = await f.t.run((ctx) => ctx.storage.store(new Blob(["TEST"])));
    delete process.env.ZOHO_MAIL_CLIENT_ENABLED;
    const before = zoho.calls.length;
    expect(await codeOf(f.a.action(api.adminMail.sendMail, newMail(connectionId)))).toBe("ZOHO_NOT_CONFIGURED");
    expect(await codeOf(f.a.mutation(api.adminMail.generateMailUploadUrl, {}))).toBe("ZOHO_NOT_CONFIGURED");
    expect(await codeOf(f.a.mutation(api.adminMail.registerMailUpload, { storageId, fileName: "TEST.pdf" }))).toBe("ZOHO_NOT_CONFIGURED");
    expect(zoho.calls.length).toBe(before);
    expect(await commands(f)).toEqual([]);
  });

  test("recipient suggestions: only active client contacts by email prefix, only for admins", async () => {
    const f = await setup();
    await f.t.run(async (ctx) => {
      const accountId = await ctx.db.insert("accounts", {
        name: "TEST Klijent", plan: "basic", status: "active", smkCode: "SMK-TEST-POSTA", ownerDisplayName: "TEST Vlasnik",
        normalizedOwnerDisplayName: "test vlasnik", clientStatus: "active", adminV1MigrationVersion: 1, createdAt: NOW, updatedAt: NOW,
      });
      const contact = (firstName: string, email: string, status: "active" | "inactive") => ctx.db.insert("accountContacts", {
        accountId, firstName, lastName: "Kupac", normalizedName: `${firstName.toLowerCase()} kupac`, normalizedEmail: email,
        positionTitle: "TEST", isOwner: false, status, createdAt: NOW, updatedAt: NOW,
      });
      await contact("TEST", "kupac@example.invalid", "active");
      await contact("TEST Bivši", "kupac.stari@example.invalid", "inactive");
      await contact("TEST Drugi", "drugi@example.invalid", "active");
    });
    expect(await f.a.query(api.adminMail.suggestRecipients, { prefix: "  KUP" })).toEqual([{ email: "kupac@example.invalid", name: "TEST Kupac" }]);
    expect(await f.a.query(api.adminMail.suggestRecipients, { prefix: "k" })).toEqual([]);
    expect(await codeOf(f.outsider.query(api.adminMail.suggestRecipients, { prefix: "kup" }))).toMatch(/^ERR:Nemate administratorski pristup/);
  });
});

type Registered = { isPublic?: boolean; isInternal?: boolean };

describe("authz of every adminMail function", () => {
  test("exactly these functions exist: admin-only public API + internal helpers", () => {
    const registered = Object.fromEntries(
      Object.entries(adminMail)
        .filter(([, value]) => typeof value === "function" && ((value as Registered).isPublic || (value as Registered).isInternal))
        .map(([name, value]) => [name, (value as Registered).isPublic ? "public" : "internal"]),
    );
    expect(registered).toEqual({
      getMailStatus: "public",
      startZohoConnect: "public",
      completeZohoConnect: "public",
      listFolders: "public",
      listMessages: "public",
      getMessage: "public",
      downloadAttachment: "public",
      markRead: "public",
      disconnect: "public",
      // Z2
      updateSignature: "public",
      generateMailUploadUrl: "public",
      registerMailUpload: "public",
      removeMailUpload: "public",
      suggestRecipients: "public",
      getSendCommand: "public",
      sendMail: "public",
      consumeOAuthState: "internal",
      saveConnection: "internal",
      connectionForAction: "internal",
      cacheAccessToken: "internal",
      markAuthRequired: "internal",
      deleteConnection: "internal",
      // Z2
      expireMailUpload: "internal",
      claimSendCommand: "internal",
      updateSendCommand: "internal",
      uploadsForSend: "internal",
      discardUploads: "internal",
    });
  });

  test("anonymous and non-admin callers are refused by every public function before any network call or write", async () => {
    enableMail();
    const f = await setup();
    const { connectionId } = await connect(f.a);
    const state = await startState(f.a);
    const upload = await storeUpload(f, f.a, "TEST ponuda.pdf");
    const before = { calls: zoho.calls.length, dump: await dumpAll(f) };
    for (const caller of [f.t, f.outsider] as const) {
      const attempts: [string, () => Promise<unknown>][] = [
        ["getMailStatus", () => caller.query(api.adminMail.getMailStatus, {})],
        ["startZohoConnect", () => caller.mutation(api.adminMail.startZohoConnect, {})],
        ["completeZohoConnect", () => caller.action(api.adminMail.completeZohoConnect, { code: "test-code", state })],
        ["listFolders", () => caller.action(api.adminMail.listFolders, { connectionId, accountId: ACC_A })],
        ["listMessages", () => caller.action(api.adminMail.listMessages, { connectionId, accountId: ACC_A, folderId: INBOX, start: 1, limit: 25 })],
        ["getMessage", () => caller.action(api.adminMail.getMessage, message(connectionId))],
        ["downloadAttachment", () => caller.action(api.adminMail.downloadAttachment, { ...message(connectionId, M_TEXT), attachmentId: ATT_PDF })],
        ["markRead", () => caller.action(api.adminMail.markRead, { connectionId, accountId: ACC_A, messageId: M_HTML })],
        ["disconnect", () => caller.action(api.adminMail.disconnect, { connectionId })],
        ["updateSignature", () => caller.mutation(api.adminMail.updateSignature, { connectionId, accountId: ACC_A, signatureText: "TEST" })],
        ["generateMailUploadUrl", () => caller.mutation(api.adminMail.generateMailUploadUrl, {})],
        ["registerMailUpload", () => caller.mutation(api.adminMail.registerMailUpload, { storageId: upload.storageId, fileName: "TEST.pdf" })],
        ["removeMailUpload", () => caller.mutation(api.adminMail.removeMailUpload, { uploadId: upload.uploadId })],
        ["suggestRecipients", () => caller.query(api.adminMail.suggestRecipients, { prefix: "kup" })],
        ["getSendCommand", () => caller.query(api.adminMail.getSendCommand, { sendCommandId: "test-send-command-x" })],
        ["sendMail", () => caller.action(api.adminMail.sendMail, newMail(connectionId, { uploadIds: [upload.uploadId] }))],
      ];
      for (const [name, attempt] of attempts) {
        const code = await codeOf(attempt());
        expect({ name, refused: code.startsWith("ERR:Niste prijavljeni") || code.startsWith("ERR:Nemate administratorski pristup") }).toEqual({ name, refused: true });
      }
    }
    expect(zoho.calls.length).toBe(before.calls);
    expect(await dumpAll(f)).toBe(before.dump);
  });

  test("internal helpers also require the admin and the owner", async () => {
    enableMail();
    const f = await setup();
    const { connectionId } = await connect(f.a);
    expect(await codeOf(f.outsider.query(internal.adminMail.connectionForAction, { connectionId }))).toMatch(/^ERR:Nemate administratorski pristup/);
    expect(await codeOf(f.b.query(internal.adminMail.connectionForAction, { connectionId }))).toBe("ZOHO_CONNECTION_NOT_FOUND");
    for (const run of [
      () => f.b.mutation(internal.adminMail.cacheAccessToken, { connectionId, ciphertext: "x", iv: "y", expiresAt: NOW }),
      () => f.b.mutation(internal.adminMail.markAuthRequired, { connectionId }),
      () => f.b.mutation(internal.adminMail.deleteConnection, { connectionId }),
    ]) expect(await codeOf(run())).toBe("ZOHO_CONNECTION_NOT_FOUND");
    // Z2 internals
    const upload = await storeUpload(f, f.a, "TEST ponuda.pdf");
    expect(await codeOf(f.b.mutation(internal.adminMail.claimSendCommand, { sendCommandId: "test-send-command-b", connectionId, zohoAccountId: ACC_A, mode: "new" }))).toBe("ZOHO_CONNECTION_NOT_FOUND");
    expect(await codeOf(f.b.query(internal.adminMail.uploadsForSend, { uploadIds: [upload.uploadId] }))).toBe("ZOHO_ATTACHMENT_BLOCKED");
    await f.b.mutation(internal.adminMail.discardUploads, { uploadIds: [upload.uploadId] });
    expect(await f.t.run((ctx) => ctx.db.get(upload.uploadId))).not.toBeNull();
    expect(await codeOf(f.outsider.mutation(internal.adminMail.updateSendCommand, { sendCommandId: "test-send-command-b", status: "sent" }))).toMatch(/^ERR:Nemate administratorski pristup/);
    expect(await codeOf(f.b.mutation(internal.adminMail.updateSendCommand, { sendCommandId: "test-send-command-b", status: "sent" }))).toBe("ZOHO_REQUEST_REJECTED");
    expect(await codeOf(f.b.mutation(internal.adminMail.saveConnection, {
      ownerUserId: f.adminA, primaryEmail: ADMIN_A, refreshTokenCiphertext: "x", refreshTokenIv: "y", accessTokenCiphertext: "x", accessTokenIv: "y",
      accessTokenExpiresAt: NOW, scopes: [], accounts: [{ accountId: ACC_A, emailAddress: ADMIN_A, displayName: null }],
    }))).toBe("ZOHO_STATE_INVALID");
    expect((await f.a.query(api.adminMail.getMailStatus, {})).connections[0].status).toBe("active");
  });
});
