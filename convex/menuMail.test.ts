/// <reference types="vite/client" />

// ScanMe Menu V1 — K26: the reply to a guest, the SETTINGS and PANEL side (master
// §11.4; plan docs/meni/planovi/K24.md §3): `status`, `startConnect`, `disconnect`,
// `templates`, `saveTemplate`, `resetTemplate`, `setSignature` (settings.edit:
// Owner, Manager, ScanMe admin) and `replyContext`, `logReply` (waiter.work: PIN
// staff, Owner, Manager). The live provider calls (completeConnect, sendReply,
// the fake Gmail/Microsoft) are in convex/menuMailActions.test.ts.
//
// Proven here: nothing is available without the switch, a 32-byte key and the
// callback URI; the authorize URLs and the one-time state (only its hash is
// stored, the PKCE verifier is ciphertext); the role and tenant matrix of every
// function; the templates and the signature and their limits; the logged
// replies; that no public answer carries a ciphertext, an IV or a token; and
// the exact list of public functions of the module.
//
// `fetch` is a stub that is never expected to be called (and answers 599 if it
// is). Time is frozen (fake timers, T0 = Wednesday 2026-10-21 10:00 Belgrade).
// Fictional data only (the repo is public). The helpers are copied from
// convex/menuReservationsPanel.test.ts on purpose (a test file is not a module
// to import from).

import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import * as menuMail from "./menuMail";
import { bytesToBase64, decodeAdminMailKey, sha256Hex } from "./lib/adminMailCrypto";
import { MENU_MAIL_KEY_VERSION, menuMailAad, openMenuMailSecret, sealMenuMailSecret } from "./lib/menuMailCrypto";
import { belgradeLocalToEpoch } from "../lib/belgrade-time";
import { menuKonobarSr } from "../lib/i18n/sr/menu-konobar";
import { MAIL_ERROR } from "../lib/menu/errors/mail";
import { MENU_ERROR } from "../lib/menu/errors/core";
import { RESERVATION_ERROR } from "../lib/menu/errors/reservations";
import { STAFF_ERROR } from "../lib/menu/errors/waiter";
import { codeChallengeS256, isCodeVerifier } from "../lib/menu/mail/pkce";
import { SLUG_A, SLUG_B, TEST_ADMIN_EMAIL, TEST_ISSUER, seedMenuWorld, type MenuTenantSeed, type MenuWorldSeed } from "../lib/menu/testkit/seed";

const modules = import.meta.glob("./**/*.ts");

// TEST key: bytes 1..32. Never a real value.
const TEST_KEY = bytesToBase64(Uint8Array.from({ length: 32 }, (_, index) => index + 1));
const REDIRECT = "http://localhost:3170/api/meni/mail/callback";
const ADDRESS = "rezervacije@demo.example";

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
    MENU_MAIL_GOOGLE_CLIENT_ID: "test-google-client-id",
    MENU_MAIL_GOOGLE_CLIENT_SECRET: "test-google-client-secret",
    MENU_MAIL_MICROSOFT_CLIENT_ID: "test-microsoft-client-id",
    MENU_MAIL_MICROSOFT_CLIENT_SECRET: "test-microsoft-client-secret",
    ...overrides,
  };
  for (const name of ENV_NAMES) {
    const value = values[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

/** Nothing in this file may reach a provider; if something does, it gets a 599. */
const fetchMock = vi.fn(async () => new Response(null, { status: 599 }));

beforeEach(() => {
  process.env.SCANME_ADMIN_EMAILS = TEST_ADMIN_EMAIL;
  process.env.MENU_PIN_PEPPER = "test-pepper-0123456789abcdef";
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  mailEnv();
});

afterEach(() => {
  for (const name of ENV_NAMES) delete process.env[name];
  delete process.env.MENU_PIN_PEPPER;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const newTest = () => {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  return t;
};
type T = ReturnType<typeof newTest>;
type Caller = Pick<T, "query" | "mutation">;

function as(t: T, userId: Id<"users">) {
  return t.withIdentity({ subject: userId, issuer: TEST_ISSUER });
}

function must<V>(value: V | null | undefined, what = "value"): V {
  if (value === null || value === undefined) throw new Error(`expected ${what}, got ${String(value)}`);
  return value;
}

/** The code string of a ConvexError, "ok" when the call did not throw. */
async function errorCodeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "ok";
  } catch (error) {
    if (error instanceof ConvexError && typeof error.data === "string") return error.data;
    throw error;
  }
}

const T0 = Date.UTC(2026, 9, 21, 8, 0, 0); // Wednesday 10:00 in Belgrade (CEST)
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const THU_19 = must(belgradeLocalToEpoch("2026-10-22T19:00"), "a Belgrade time");

/** Well-formed (43 url-safe characters), but nobody's session token. */
const BOGUS_TOKEN = "A".repeat(43);
const SIGNED_OUT = { ok: false, code: STAFF_ERROR.signedOut };
const KEY = must(decodeAdminMailKey(TEST_KEY), "the test key");

// -----------------------------------------------------------------------------
// World, staff, sign-in
// -----------------------------------------------------------------------------

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

async function addStaff(env: Env, displayName: string, pin: string, venue: Venue = "a") {
  const b = venue === "b";
  const who = b ? as(env.t, env.w.otherOwnerId) : env.owner;
  const { staffId } = await who.mutation(api.menuStaff.create, {
    menuServiceId: b ? env.w.b.menuServiceId : env.w.a.menuServiceId,
    displayName,
  });
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

type RowInput = { tenant?: MenuTenantSeed; contactEmail?: string | null; contactPhone?: string | null };
let hashCounter = 0;

/** A reservation written straight into the table, with or without each contact. */
async function putReservation(env: Env, input: RowInput = {}) {
  hashCounter += 1;
  const tenant = input.tenant ?? env.w.a;
  const contactEmail = input.contactEmail === undefined ? "gost@example.com" : input.contactEmail;
  const contactPhone = input.contactPhone === undefined ? "+381 60 000 0000" : input.contactPhone;
  return await env.t.run(
    async (ctx) =>
      await ctx.db.insert("menuReservations", {
        menuServiceId: tenant.menuServiceId,
        businessId: tenant.businessId,
        status: "new",
        guestName: "Marija Gost",
        partySize: 4,
        requestedAt: THU_19,
        ...(contactEmail ? { contactEmail } : {}),
        ...(contactPhone ? { contactPhone } : {}),
        cancelTokenHash: `seeded-hash-${hashCounter}`,
        deviceKeyHash: `seeded-device-${hashCounter}`,
        createdAt: T0,
        updatedAt: T0,
      }),
  );
}

const stateRows = (env: Env) => env.t.run(async (ctx) => await ctx.db.query("menuMailOAuthStates").take(100));
const connectionRows = (env: Env) => env.t.run(async (ctx) => await ctx.db.query("menuMailConnections").take(100));
const replyRows = (env: Env) => env.t.run(async (ctx) => await ctx.db.query("menuReservationReplies").take(100));
const templateRows = (env: Env) => env.t.run(async (ctx) => await ctx.db.query("menuMessageTemplates").take(100));
const auditRows = async (env: Env, action: string) =>
  (await env.t.run(async (ctx) => await ctx.db.query("menuAuditLog").take(5000))).filter((row) => row.action === action);

const SEED_REFRESH = "seeded-refresh-token-AAAA1111";
const SEED_ACCESS = "seeded-access-token-BBBB2222";

/** A connection row as the actions write it (real AES-GCM under the test key). */
async function seedConnection(env: Env, o: { status?: "active" | "error" | "revoked"; provider?: "gmail" | "microsoft" } = {}) {
  const provider = o.provider ?? "gmail";
  const status = o.status ?? "active";
  const binding = { menuServiceId: env.w.a.menuServiceId, provider, binding: ADDRESS };
  const refresh = await sealMenuMailSecret(KEY, SEED_REFRESH, menuMailAad({ purpose: "refresh", ...binding }));
  const access = await sealMenuMailSecret(KEY, SEED_ACCESS, menuMailAad({ purpose: "access", ...binding }));
  await env.t.run(async (ctx) => {
    await ctx.db.insert("menuMailConnections", {
      menuServiceId: env.w.a.menuServiceId,
      provider,
      emailAddress: ADDRESS,
      status,
      ...(status === "revoked"
        ? { revokedAt: T0 }
        : {
            refreshTokenCiphertext: refresh.ciphertext,
            refreshTokenIv: refresh.iv,
            accessTokenCiphertext: access.ciphertext,
            accessTokenIv: access.iv,
            accessTokenExpiresAt: T0 + HOUR,
          }),
      ...(status === "error" ? { lastErrorCode: MAIL_ERROR.reconnectRequired } : {}),
      keyVersion: MENU_MAIL_KEY_VERSION,
      scopes: ["openid", "email"],
      connectedByUserId: env.w.ownerId,
      connectedAt: T0,
      updatedAt: T0,
    });
  });
  return { refresh, access };
}

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
// 1. Without the keys nothing is available
// -----------------------------------------------------------------------------

describe("without the configuration", () => {
  const OFF: Record<string, Partial<Record<EnvName, string | undefined>>> = {
    "no variable at all": Object.fromEntries(ENV_NAMES.map((name) => [name, undefined])),
    "the switch is missing": { MENU_MAIL_ENABLED: undefined },
    "the switch is not exactly true": { MENU_MAIL_ENABLED: "TRUE" },
    "the key is 31 bytes, not 32": { MENU_MAIL_TOKEN_KEY: bytesToBase64(Uint8Array.from({ length: 31 }, (_, index) => index + 1)) },
    "the key is not base64": { MENU_MAIL_TOKEN_KEY: "this is not base64!" },
    "the key is missing": { MENU_MAIL_TOKEN_KEY: undefined },
    "the redirect URI has another path": { MENU_MAIL_REDIRECT_URI: "http://localhost:3170/api/other/callback" },
    "the redirect URI is http on a public host": { MENU_MAIL_REDIRECT_URI: "http://example.com/api/meni/mail/callback" },
    "the redirect URI has a query": { MENU_MAIL_REDIRECT_URI: `${REDIRECT}?x=1` },
    "the redirect URI is missing": { MENU_MAIL_REDIRECT_URI: undefined },
    "no provider has both of its client values": { MENU_MAIL_GOOGLE_CLIENT_SECRET: undefined, MENU_MAIL_MICROSOFT_CLIENT_ID: undefined },
  };

  test.each(Object.entries(OFF))("%s: status says not configured, startConnect refuses, no state row, no network", async (_name, overrides) => {
    const env = await world();
    mailEnv(overrides);
    expect(await env.owner.query(api.menuMail.status, { menuServiceId: env.w.a.menuServiceId })).toEqual({
      available: false,
      providers: [],
      reason: "not_configured",
      connection: null,
    });
    for (const provider of ["gmail", "microsoft"] as const) {
      expect(await env.owner.mutation(api.menuMail.startConnect, { menuServiceId: env.w.a.menuServiceId, provider })).toEqual({
        ok: false,
        code: MAIL_ERROR.notConfigured,
      });
    }
    expect(await stateRows(env)).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("the waiter sheet is told the mailbox is not available", async () => {
    const env = await world();
    mailEnv({ MENU_MAIL_ENABLED: undefined });
    const { token } = await signedIn(env, "Ana", "246");
    const reservationId = await putReservation(env);
    const context = must(await env.t.query(api.menuMail.replyContext, { ...panel(env, token), reservationId }), "the context");
    expect(context.mailbox).toEqual({ available: false, connection: null });
  });
});

describe("which providers are offered", () => {
  test.each([
    ["only the Google pair", { MENU_MAIL_MICROSOFT_CLIENT_ID: undefined }, ["gmail"], "microsoft"],
    ["only the Microsoft pair", { MENU_MAIL_GOOGLE_CLIENT_SECRET: undefined }, ["microsoft"], "gmail"],
  ] as const)("%s: one provider, the other one is unavailable and leaves no state row", async (_name, overrides, providers, missing) => {
    const env = await world();
    mailEnv(overrides);
    expect(await env.owner.query(api.menuMail.status, { menuServiceId: env.w.a.menuServiceId })).toEqual({
      available: true,
      providers,
      reason: null,
      connection: null,
    });
    expect(await env.owner.mutation(api.menuMail.startConnect, { menuServiceId: env.w.a.menuServiceId, provider: missing })).toEqual({
      ok: false,
      code: MAIL_ERROR.providerUnavailable,
    });
    expect(await stateRows(env)).toEqual([]);
  });

  test("both pairs: both providers", async () => {
    const env = await world();
    const status = must(await env.owner.query(api.menuMail.status, { menuServiceId: env.w.a.menuServiceId }));
    expect(status).toEqual({ available: true, providers: ["gmail", "microsoft"], reason: null, connection: null });
  });
});

// -----------------------------------------------------------------------------
// 2. startConnect: the authorize URL and the one-time state
// -----------------------------------------------------------------------------

describe("startConnect", () => {
  async function start(env: Env, provider: "gmail" | "microsoft", who: Caller = env.owner) {
    const started = await who.mutation(api.menuMail.startConnect, { menuServiceId: env.w.a.menuServiceId, provider });
    if (!started.ok) throw new Error(`startConnect refused: ${started.code}`);
    return new URL(started.authorizeUrl);
  }

  test("Gmail: Google's host, the send-only scopes, offline access, consent, S256 and a state", async () => {
    const env = await world();
    const url = await start(env, "gmail");
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    const p = url.searchParams;
    expect(p.get("client_id")).toBe("test-google-client-id");
    expect(p.get("redirect_uri")).toBe(REDIRECT);
    expect(p.get("response_type")).toBe("code");
    expect(p.get("scope")).toBe("openid email https://www.googleapis.com/auth/gmail.send");
    expect(p.get("access_type")).toBe("offline");
    expect(p.get("prompt")).toBe("consent");
    expect(p.get("code_challenge_method")).toBe("S256");
    expect(p.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(p.get("state")).toMatch(/^[A-Za-z0-9_-]{16,128}$/);
    expect(p.has("client_secret")).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("Microsoft: the common tenant, offline_access and Mail.Send, S256 and a state", async () => {
    const env = await world();
    const url = await start(env, "microsoft");
    expect(url.origin + url.pathname).toBe("https://login.microsoftonline.com/common/oauth2/v2.0/authorize");
    const p = url.searchParams;
    expect(p.get("client_id")).toBe("test-microsoft-client-id");
    expect(p.get("redirect_uri")).toBe(REDIRECT);
    expect(p.get("response_type")).toBe("code");
    expect(p.get("scope")).toBe("openid email offline_access https://graph.microsoft.com/Mail.Send");
    expect(p.get("code_challenge_method")).toBe("S256");
    expect(p.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(p.get("state")).toMatch(/^[A-Za-z0-9_-]{16,128}$/);
    expect(p.has("client_secret")).toBe(false);
  });

  test("only the SHA-256 of the state is stored; the PKCE verifier is ciphertext that matches the challenge", async () => {
    const env = await world();
    const url = await start(env, "gmail");
    const state = must(url.searchParams.get("state"));
    const challenge = must(url.searchParams.get("code_challenge"));
    const rows = await stateRows(env);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.stateHash).toBe(await sha256Hex(state));
    expect(row).toMatchObject({ menuServiceId: env.w.a.menuServiceId, provider: "gmail", userId: env.w.ownerId, expiresAt: T0 + 10 * MINUTE, createdAt: T0 });
    expect(row.usedAt).toBeUndefined();

    const verifier = await openMenuMailSecret(
      KEY,
      { ciphertext: row.codeVerifierCiphertext, iv: row.codeVerifierIv },
      menuMailAad({ purpose: "verifier", menuServiceId: env.w.a.menuServiceId, provider: "gmail", binding: row.stateHash }),
    );
    expect(isCodeVerifier(verifier)).toBe(true);
    expect(await codeChallengeS256(verifier)).toBe(challenge);
    // The raw state and the raw verifier are in no stored row, and the verifier is not in the URL.
    const dump = JSON.stringify(rows);
    expect(dump).not.toContain(state);
    expect(dump).not.toContain(verifier);
    expect(url.href).not.toContain(verifier);
    // The verifier is bound to its own state: another binding does not open it.
    await expect(
      openMenuMailSecret(
        KEY,
        { ciphertext: row.codeVerifierCiphertext, iv: row.codeVerifierIv },
        menuMailAad({ purpose: "verifier", menuServiceId: env.w.a.menuServiceId, provider: "gmail", binding: "0".repeat(64) }),
      ),
    ).rejects.toThrow();
  });

  test("every call gets its own state and verifier", async () => {
    const env = await world();
    const first = await start(env, "gmail");
    const second = await start(env, "gmail");
    expect(first.searchParams.get("state")).not.toBe(second.searchParams.get("state"));
    expect(first.searchParams.get("code_challenge")).not.toBe(second.searchParams.get("code_challenge"));
    expect(await stateRows(env)).toHaveLength(2);
  });

  test("expired and used states of the person are cleaned up by the next start", async () => {
    const env = await world();
    await start(env, "gmail");
    vi.setSystemTime(T0 + 11 * MINUTE);
    const fresh = await start(env, "gmail");
    const rows = await stateRows(env);
    expect(rows).toHaveLength(1);
    expect(rows[0].stateHash).toBe(await sha256Hex(must(fresh.searchParams.get("state"))));
  });

  test("the 11th start of a person within the hour is rate limited and stores nothing", async () => {
    const env = await world();
    for (let index = 0; index < 10; index += 1) await start(env, "gmail");
    expect(await env.owner.mutation(api.menuMail.startConnect, { menuServiceId: env.w.a.menuServiceId, provider: "gmail" })).toEqual({
      ok: false,
      code: MAIL_ERROR.rateLimited,
    });
    expect(await stateRows(env)).toHaveLength(10);
    // The bucket is per person: the Manager still can.
    await start(env, "microsoft", as(env.t, env.w.managerId));
    expect(await stateRows(env)).toHaveLength(11);
  });
});

// -----------------------------------------------------------------------------
// 3. Roles and tenants of the settings functions
// -----------------------------------------------------------------------------

describe("settings functions: roles and tenants", () => {
  const QUERIES = {
    status: (who: Caller, id: Id<"menuServices">) => who.query(api.menuMail.status, { menuServiceId: id }),
    templates: (who: Caller, id: Id<"menuServices">) => who.query(api.menuMail.templates, { menuServiceId: id }),
  };
  const MUTATIONS = {
    startConnect: (who: Caller, id: Id<"menuServices">) => who.mutation(api.menuMail.startConnect, { menuServiceId: id, provider: "gmail" }),
    disconnect: (who: Caller, id: Id<"menuServices">) => who.mutation(api.menuMail.disconnect, { menuServiceId: id }),
    saveTemplate: (who: Caller, id: Id<"menuServices">) =>
      who.mutation(api.menuMail.saveTemplate, { menuServiceId: id, kind: "accept", subject: "Potvrda", body: "Dobar dan." }),
    resetTemplate: (who: Caller, id: Id<"menuServices">) => who.mutation(api.menuMail.resetTemplate, { menuServiceId: id, kind: "accept" }),
    setSignature: (who: Caller, id: Id<"menuServices">) => who.mutation(api.menuMail.setSignature, { menuServiceId: id, signature: "Srdačno, Tim" }),
  };

  test.each(["ownerId", "managerId", "adminId"] as const)("%s may use every settings function", async (who) => {
    const env = await world();
    const caller = as(env.t, env.w[who]);
    for (const [name, call] of Object.entries(QUERIES)) {
      expect(await call(caller, env.w.a.menuServiceId), name).not.toBeNull();
    }
    for (const [name, call] of Object.entries(MUTATIONS)) {
      const outcome = await call(caller, env.w.a.menuServiceId);
      expect(outcome, name).toMatchObject({ ok: true });
    }
  });

  test("an Urednik (editor) is refused: queries null, mutations menu/forbidden, nothing written", async () => {
    const env = await world();
    const editor = as(env.t, env.w.editorId);
    for (const [name, call] of Object.entries(QUERIES)) expect(await call(editor, env.w.a.menuServiceId), name).toBeNull();
    for (const [name, call] of Object.entries(MUTATIONS)) {
      expect(await errorCodeOf(call(editor, env.w.a.menuServiceId)), name).toBe(MENU_ERROR.forbidden);
    }
    expect(await stateRows(env)).toEqual([]);
    expect(await templateRows(env)).toEqual([]);
    expect(await env.owner.query(api.menuMail.templates, { menuServiceId: env.w.a.menuServiceId })).toMatchObject({ signature: null });
  });

  test.each(["financeId", "viewOnlyId", "outsiderId", "otherOwnerId"] as const)(
    "%s has no Menu role here: queries null, mutations menu/not_found, nothing written",
    async (who) => {
      const env = await world();
      const caller = as(env.t, env.w[who]);
      for (const [name, call] of Object.entries(QUERIES)) expect(await call(caller, env.w.a.menuServiceId), name).toBeNull();
      for (const [name, call] of Object.entries(MUTATIONS)) {
        expect(await errorCodeOf(call(caller, env.w.a.menuServiceId)), name).toBe(MENU_ERROR.notFound);
      }
      expect(await stateRows(env)).toEqual([]);
      expect(await templateRows(env)).toEqual([]);
    },
  );

  test("an anonymous caller gets null and menu/unauthenticated", async () => {
    const env = await world();
    for (const [name, call] of Object.entries(QUERIES)) expect(await call(env.t, env.w.a.menuServiceId), name).toBeNull();
    for (const [name, call] of Object.entries(MUTATIONS)) {
      expect(await errorCodeOf(call(env.t, env.w.a.menuServiceId)), name).toBe(MENU_ERROR.unauthenticated);
    }
  });

  test("the other venue's Owner works on venue b only, and venue a's owner is a stranger there", async () => {
    const env = await world();
    const other = as(env.t, env.w.otherOwnerId);
    expect(await other.mutation(api.menuMail.saveTemplate, { menuServiceId: env.w.b.menuServiceId, kind: "decline", subject: "Odbijeno", body: "Žao nam je." })).toEqual({ ok: true });
    expect(await errorCodeOf(env.owner.mutation(api.menuMail.resetTemplate, { menuServiceId: env.w.b.menuServiceId, kind: "decline" }))).toBe(MENU_ERROR.notFound);
    expect(await env.owner.query(api.menuMail.templates, { menuServiceId: env.w.b.menuServiceId })).toBeNull();
    // Venue a's own view is untouched by b's template.
    expect(await env.owner.query(api.menuMail.templates, { menuServiceId: env.w.a.menuServiceId })).toEqual({
      venueName: "Kafana kod Mike",
      signature: null,
      templates: {},
    });
    expect((await templateRows(env)).map((row) => row.menuServiceId)).toEqual([env.w.b.menuServiceId]);
  });
});

// -----------------------------------------------------------------------------
// 4. Templates and the signature
// -----------------------------------------------------------------------------

describe("templates and the signature", () => {
  const save = (env: Env, args: { kind?: "accept" | "decline" | "propose"; subject: string; body: string }) =>
    env.owner.mutation(api.menuMail.saveTemplate, { menuServiceId: env.w.a.menuServiceId, kind: args.kind ?? "accept", subject: args.subject, body: args.body });
  const templatesOf = (env: Env) => env.owner.query(api.menuMail.templates, { menuServiceId: env.w.a.menuServiceId });

  test("by default: no templates and no signature (the dictionary defaults apply on the device)", async () => {
    const env = await world();
    expect(await templatesOf(env)).toEqual({ venueName: "Kafana kod Mike", signature: null, templates: {} });
  });

  test("a saved template has its subject on one line and its body with LF breaks; the other kinds stay default", async () => {
    const env = await world();
    expect(await save(env, { subject: "  Potvrda\r\nrezervacije \t stola  ", body: "  Dobar dan,\r\nvidimo se.\r\n\r\n{potpis}  " })).toEqual({ ok: true });
    expect(await templatesOf(env)).toEqual({
      venueName: "Kafana kod Mike",
      signature: null,
      templates: { accept: { subject: "Potvrda rezervacije stola", body: "Dobar dan,\nvidimo se.\n\n{potpis}" } },
    });
  });

  test.each([
    ["an empty subject", { subject: "", body: "Tekst" }],
    ["a blank subject", { subject: "  \r\n ", body: "Tekst" }],
    ["a subject of 151 characters", { subject: "a".repeat(151), body: "Tekst" }],
    ["an empty body", { subject: "Naslov", body: "" }],
    ["a blank body", { subject: "Naslov", body: " \n " }],
    ["a body of 4001 characters", { subject: "Naslov", body: "b".repeat(4001) }],
  ])("%s is refused with mail/invalid_input and nothing is stored", async (_name, args) => {
    const env = await world();
    expect(await save(env, args)).toEqual({ ok: false, code: MAIL_ERROR.invalidInput });
    expect(await templateRows(env)).toEqual([]);
  });

  test("the limits are inclusive: 150 characters of subject and 4000 of body are stored", async () => {
    const env = await world();
    expect(await save(env, { kind: "propose", subject: "s".repeat(150), body: "b".repeat(4000) })).toEqual({ ok: true });
    expect(must((await templatesOf(env))?.templates.propose).body).toHaveLength(4000);
  });

  test("the kind 'other' has no template: the validator rejects it", async () => {
    const env = await world();
    await expect(
      env.owner.mutation(api.menuMail.saveTemplate, { menuServiceId: env.w.a.menuServiceId, kind: "other" as never, subject: "S", body: "B" }),
    ).rejects.toThrow();
    expect(await templateRows(env)).toEqual([]);
  });

  test("saving a kind again updates its one row; each kind has its own", async () => {
    const env = await world();
    await save(env, { subject: "Prvi", body: "Prvo telo" });
    await save(env, { subject: "Drugi", body: "Drugo telo" });
    await save(env, { kind: "decline", subject: "Odbijeno", body: "Žao nam je." });
    expect(await templateRows(env)).toHaveLength(2);
    expect((await templatesOf(env))?.templates).toEqual({
      accept: { subject: "Drugi", body: "Drugo telo" },
      decline: { subject: "Odbijeno", body: "Žao nam je." },
    });
  });

  test("resetTemplate deletes the row (and is fine when there is none)", async () => {
    const env = await world();
    await save(env, { subject: "Prvi", body: "Prvo telo" });
    await save(env, { kind: "decline", subject: "Odbijeno", body: "Žao nam je." });
    expect(await env.owner.mutation(api.menuMail.resetTemplate, { menuServiceId: env.w.a.menuServiceId, kind: "accept" })).toEqual({ ok: true });
    expect((await templatesOf(env))?.templates).toEqual({ decline: { subject: "Odbijeno", body: "Žao nam je." } });
    expect(await env.owner.mutation(api.menuMail.resetTemplate, { menuServiceId: env.w.a.menuServiceId, kind: "propose" })).toEqual({ ok: true });
  });

  test("the signature: set (LF breaks), read back, cleared by an empty or blank text", async () => {
    const env = await world();
    const set = (signature: string) => env.owner.mutation(api.menuMail.setSignature, { menuServiceId: env.w.a.menuServiceId, signature });
    expect(await set("  Srdačno,\r\nTim kafane  ")).toEqual({ ok: true });
    expect((await templatesOf(env))?.signature).toBe("Srdačno,\nTim kafane");
    expect(await set("")).toEqual({ ok: true });
    expect((await templatesOf(env))?.signature).toBeNull();
    await set("Pozdrav");
    expect(await set("   ")).toEqual({ ok: true });
    expect((await templatesOf(env))?.signature).toBeNull();
  });

  test("the signature is limited to 500 characters and keeps the other settings", async () => {
    const env = await world();
    const set = (signature: string) => env.owner.mutation(api.menuMail.setSignature, { menuServiceId: env.w.a.menuServiceId, signature });
    expect(await set("x".repeat(501))).toEqual({ ok: false, code: MAIL_ERROR.invalidInput });
    expect((await templatesOf(env))?.signature).toBeNull();
    const before = must(await env.t.run(async (ctx) => await ctx.db.get(env.w.a.menuServiceId)));
    expect(await set("x".repeat(500))).toEqual({ ok: true });
    const after = must(await env.t.run(async (ctx) => await ctx.db.get(env.w.a.menuServiceId)));
    expect(after.settings?.replySignature).toHaveLength(500);
    expect({ ...after.settings, replySignature: undefined }).toEqual({ ...before.settings, replySignature: undefined });
  });

  test("the waiter's replyContext carries the same venue name, signature and templates", async () => {
    const env = await world();
    await save(env, { subject: "Potvrda", body: "Dobar dan." });
    await env.owner.mutation(api.menuMail.setSignature, { menuServiceId: env.w.a.menuServiceId, signature: "Do viđenja" });
    const { token } = await signedIn(env, "Ana", "246");
    const reservationId = await putReservation(env);
    const context = must(await env.t.query(api.menuMail.replyContext, { ...panel(env, token), reservationId }), "the context");
    expect(context).toMatchObject({
      venueName: "Kafana kod Mike",
      signature: "Do viđenja",
      templates: { accept: { subject: "Potvrda", body: "Dobar dan." } },
      replies: [],
    });
  });
});

// -----------------------------------------------------------------------------
// 5. The panel: replyContext and logReply
// -----------------------------------------------------------------------------

describe("replyContext and logReply: who and which reservation", () => {
  const context = (env: Env, reservationId: Id<"menuReservations">, who: Caller, token?: string, venue?: Venue) =>
    who.query(api.menuMail.replyContext, { ...panel(env, token, venue), reservationId });
  const log = (env: Env, reservationId: Id<"menuReservations">, who: Caller, token?: string, venue?: Venue) =>
    who.mutation(api.menuMail.logReply, { ...panel(env, token, venue), reservationId, channel: "phone", phoneOutcome: "reached" });

  test("PIN staff, the Owner and the Manager (by account) are in; the answer is a context", async () => {
    const env = await world();
    const { token } = await signedIn(env, "Ana", "246");
    const reservationId = await putReservation(env);
    const callers: [Caller, string | undefined][] = [
      [env.t, token],
      [as(env.t, env.w.ownerId), undefined],
      [as(env.t, env.w.managerId), undefined],
    ];
    for (const [index, [who, sessionToken]] of callers.entries()) {
      const seen = must(await context(env, reservationId, who, sessionToken), "the context");
      expect(seen.venueName).toBe("Kafana kod Mike");
      expect(seen.replies).toHaveLength(index);
      expect(await log(env, reservationId, who, sessionToken)).toEqual({ ok: true });
    }
    expect(await replyRows(env)).toHaveLength(3);
  });

  test("a wrong code, a dead token, an editor, finance, view-only, outsiders and anonymous callers are out", async () => {
    const env = await world();
    const { token } = await signedIn(env, "Ana", "246");
    const reservationId = await putReservation(env);
    const wrongCode = { ...panel(env, token), panelCode: "ZZZZZZZZZZ" };
    expect(await env.t.query(api.menuMail.replyContext, { ...wrongCode, reservationId })).toBeNull();
    expect(await env.t.mutation(api.menuMail.logReply, { ...wrongCode, reservationId, channel: "phone" })).toEqual(SIGNED_OUT);

    expect(await context(env, reservationId, env.t, BOGUS_TOKEN)).toBeNull();
    expect(await log(env, reservationId, env.t, BOGUS_TOKEN)).toEqual(SIGNED_OUT);
    // An invented token never falls back to the account.
    expect(await context(env, reservationId, as(env.t, env.w.ownerId), BOGUS_TOKEN)).toBeNull();

    for (const userId of [env.w.editorId, env.w.financeId, env.w.viewOnlyId, env.w.outsiderId, env.w.otherOwnerId]) {
      expect(await context(env, reservationId, as(env.t, userId))).toBeNull();
      expect(await log(env, reservationId, as(env.t, userId))).toEqual(SIGNED_OUT);
    }
    expect(await context(env, reservationId, env.t)).toBeNull();
    expect(await log(env, reservationId, env.t)).toEqual(SIGNED_OUT);
    expect(await replyRows(env)).toEqual([]);
  });

  test("venue b's staff with venue a's slug and code is nobody; a's staff with b's reservation id gets nothing", async () => {
    const env = await world();
    const { token: ana } = await signedIn(env, "Ana", "246");
    const { token: petar } = await signedIn(env, "Petar", "246", "b");
    const aReservation = await putReservation(env);
    const bReservation = await putReservation(env, { tenant: env.w.b });

    expect(await context(env, aReservation, env.t, petar, "a")).toBeNull();
    expect(await log(env, aReservation, env.t, petar, "a")).toEqual(SIGNED_OUT);

    expect(await context(env, bReservation, env.t, ana, "a")).toBeNull();
    expect(await log(env, bReservation, env.t, ana, "a")).toEqual({ ok: false, code: RESERVATION_ERROR.notFound });
    // Each venue sees its own reservation.
    expect(await context(env, bReservation, env.t, petar, "b")).not.toBeNull();
    expect(await replyRows(env)).toEqual([]);
  });
});

describe("logReply", () => {
  test("a phone call with the outcome 'no_answer' is a logged row of the waiter", async () => {
    const env = await world();
    const { staffId, token } = await signedIn(env, "Ana", "246");
    const reservationId = await putReservation(env);
    expect(await env.t.mutation(api.menuMail.logReply, { ...panel(env, token), reservationId, channel: "phone", phoneOutcome: "no_answer" })).toEqual({ ok: true });
    const rows = await replyRows(env);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      reservationId,
      menuServiceId: env.w.a.menuServiceId,
      channel: "phone",
      status: "logged",
      phoneOutcome: "no_answer",
      byStaffId: staffId,
      createdAt: T0,
    });
    expect(rows[0].kind).toBeUndefined();
    expect(rows[0].providerMessageId).toBeUndefined();
    expect(rows[0].clientSendId).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();

    const context = must(await env.t.query(api.menuMail.replyContext, { ...panel(env, token), reservationId }));
    expect(context.replies).toEqual([
      { id: rows[0]._id, channel: "phone", kind: null, status: "logged", phoneOutcome: "no_answer", errorCode: null, createdAt: T0, byName: "Ana" },
    ]);
  });

  test("a call without an outcome, and an opened mailto: with its kind, are logged too", async () => {
    const env = await world();
    const reservationId = await putReservation(env);
    expect(await env.owner.mutation(api.menuMail.logReply, { ...panel(env), reservationId, channel: "phone" })).toEqual({ ok: true });
    expect(await env.owner.mutation(api.menuMail.logReply, { ...panel(env), reservationId, channel: "mailto", kind: "accept" })).toEqual({ ok: true });
    const rows = await replyRows(env);
    expect(rows.map((row) => [row.channel, row.kind ?? null, row.phoneOutcome ?? null, row.status])).toEqual([
      ["phone", null, null, "logged"],
      ["mailto", "accept", null, "logged"],
    ]);
    // An account (not a PIN waiter) is recorded by user id.
    expect(rows.every((row) => row.byUserId === env.w.ownerId && row.byStaffId === undefined)).toBe(true);
  });

  test("mailto: without the guest's e-mail address is mail/no_recipient; a phone log without a phone number too", async () => {
    const env = await world();
    const noEmail = await putReservation(env, { contactEmail: null });
    const noPhone = await putReservation(env, { contactPhone: null });
    expect(await env.owner.mutation(api.menuMail.logReply, { ...panel(env), reservationId: noEmail, channel: "mailto" })).toEqual({ ok: false, code: MAIL_ERROR.noRecipient });
    expect(await env.owner.mutation(api.menuMail.logReply, { ...panel(env), reservationId: noPhone, channel: "phone" })).toEqual({ ok: false, code: MAIL_ERROR.noRecipient });
    // The other channel of each is fine.
    expect(await env.owner.mutation(api.menuMail.logReply, { ...panel(env), reservationId: noEmail, channel: "phone" })).toEqual({ ok: true });
    expect(await env.owner.mutation(api.menuMail.logReply, { ...panel(env), reservationId: noPhone, channel: "mailto" })).toEqual({ ok: true });
    expect(await replyRows(env)).toHaveLength(2);
  });

  test("a phone outcome on a mailto: log is mail/invalid_input; the channel 'mailbox' is not loggable", async () => {
    const env = await world();
    const reservationId = await putReservation(env);
    expect(await env.owner.mutation(api.menuMail.logReply, { ...panel(env), reservationId, channel: "mailto", phoneOutcome: "reached" })).toEqual({
      ok: false,
      code: MAIL_ERROR.invalidInput,
    });
    await expect(env.owner.mutation(api.menuMail.logReply, { ...panel(env), reservationId, channel: "mailbox" as never })).rejects.toThrow();
    expect(await replyRows(env)).toEqual([]);
  });

  test("replyContext lists the newest first with the name of who did it, at most 10", async () => {
    const env = await world();
    const { token: ana } = await signedIn(env, "Ana", "246");
    const { token: petar } = await signedIn(env, "Petar", "135");
    const reservationId = await putReservation(env);
    const logAs = (token: string | undefined, who: Caller, outcome: "reached" | "no_answer" | "left_message") =>
      who.mutation(api.menuMail.logReply, { ...panel(env, token), reservationId, channel: "phone", phoneOutcome: outcome });

    expect(await logAs(ana, env.t, "no_answer")).toEqual({ ok: true });
    vi.setSystemTime(T0 + MINUTE);
    expect(await logAs(petar, env.t, "left_message")).toEqual({ ok: true });
    vi.setSystemTime(T0 + 2 * MINUTE);
    expect(await logAs(undefined, env.owner, "reached")).toEqual({ ok: true });

    const context = must(await env.t.query(api.menuMail.replyContext, { ...panel(env, ana), reservationId }));
    expect(context.replies.map((row) => [row.phoneOutcome, row.byName])).toEqual([
      ["reached", menuKonobarSr.zaglavlje.nalogBezImena],
      ["left_message", "Petar"],
      ["no_answer", "Ana"],
    ]);

    for (let index = 3; index < 13; index += 1) {
      vi.setSystemTime(T0 + index * MINUTE);
      await logAs(ana, env.t, "no_answer");
    }
    const crowded = must(await env.t.query(api.menuMail.replyContext, { ...panel(env, ana), reservationId }));
    expect(crowded.replies).toHaveLength(10);
    expect(crowded.replies.map((row) => row.createdAt)).toEqual(Array.from({ length: 10 }, (_, index) => T0 + (12 - index) * MINUTE));
  });

  test("replies of one reservation are not shown on another", async () => {
    const env = await world();
    const first = await putReservation(env);
    const second = await putReservation(env);
    await env.owner.mutation(api.menuMail.logReply, { ...panel(env), reservationId: first, channel: "phone" });
    const context = must(await env.owner.query(api.menuMail.replyContext, { ...panel(env), reservationId: second }));
    expect(context.replies).toEqual([]);
  });
});

// -----------------------------------------------------------------------------
// 6. The connection as the settings see it, and disconnect
// -----------------------------------------------------------------------------

describe("status and disconnect (a connection seeded as the actions write it)", () => {
  test("an active connection shows provider, address, state, time and no error; nothing else", async () => {
    const env = await world();
    await seedConnection(env);
    const status = must(await env.owner.query(api.menuMail.status, { menuServiceId: env.w.a.menuServiceId }));
    expect(status.connection).toEqual({ provider: "gmail", emailAddress: ADDRESS, status: "active", connectedAt: T0, lastErrorCode: null });
    expect(Object.keys(status.connection ?? {}).sort()).toEqual(["connectedAt", "emailAddress", "lastErrorCode", "provider", "status"]);
  });

  test("a connection in error shows the error code to the settings and the state only to the waiter", async () => {
    const env = await world();
    await seedConnection(env, { status: "error", provider: "microsoft" });
    const status = must(await env.owner.query(api.menuMail.status, { menuServiceId: env.w.a.menuServiceId }));
    expect(status.connection).toMatchObject({ provider: "microsoft", status: "error", lastErrorCode: MAIL_ERROR.reconnectRequired });
    const reservationId = await putReservation(env);
    const context = must(await env.owner.query(api.menuMail.replyContext, { ...panel(env), reservationId }));
    expect(context.mailbox).toEqual({ available: true, connection: { provider: "microsoft", emailAddress: ADDRESS, status: "error" } });
  });

  test("disconnect removes every token from the row, marks it revoked and the status shows no connection", async () => {
    const env = await world();
    await seedConnection(env);
    expect(await env.owner.mutation(api.menuMail.disconnect, { menuServiceId: env.w.a.menuServiceId })).toEqual({ ok: true });
    const rows = await connectionRows(env);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "revoked", revokedAt: T0, emailAddress: ADDRESS });
    for (const field of ["refreshTokenCiphertext", "refreshTokenIv", "accessTokenCiphertext", "accessTokenIv", "accessTokenExpiresAt", "lastErrorCode"] as const) {
      expect(rows[0][field], field).toBeUndefined();
    }
    const status = must(await env.owner.query(api.menuMail.status, { menuServiceId: env.w.a.menuServiceId }));
    expect(status.connection).toBeNull();
    const reservationId = await putReservation(env);
    const context = must(await env.owner.query(api.menuMail.replyContext, { ...panel(env), reservationId }));
    expect(context.mailbox.connection).toBeNull();
  });

  test("disconnect is audited once, without a token, and a second disconnect changes nothing", async () => {
    const env = await world();
    await seedConnection(env);
    await env.owner.mutation(api.menuMail.disconnect, { menuServiceId: env.w.a.menuServiceId });
    expect(await env.owner.mutation(api.menuMail.disconnect, { menuServiceId: env.w.a.menuServiceId })).toEqual({ ok: true });
    const audit = await auditRows(env, "mail.disconnected");
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ menuServiceId: env.w.a.menuServiceId, actorUserId: env.w.ownerId, entityType: "menuMailConnections", details: { provider: "gmail" } });
    expect(JSON.stringify(audit)).not.toContain(SEED_REFRESH);
    expect(JSON.stringify(audit)).not.toContain(SEED_ACCESS);
  });

  test("disconnect without any connection is a harmless ok and writes no audit row", async () => {
    const env = await world();
    expect(await env.owner.mutation(api.menuMail.disconnect, { menuServiceId: env.w.a.menuServiceId })).toEqual({ ok: true });
    expect(await auditRows(env, "mail.disconnected")).toEqual([]);
    expect(await connectionRows(env)).toEqual([]);
  });
});

// -----------------------------------------------------------------------------
// 7. No public function returns a ciphertext, an IV or a token
// -----------------------------------------------------------------------------

describe("what the public functions return", () => {
  test("no answer has a ciphertext/iv/token key or contains a stored secret", async () => {
    const env = await world();
    const stored = await seedConnection(env);
    const secrets = [SEED_REFRESH, SEED_ACCESS, stored.refresh.ciphertext, stored.refresh.iv, stored.access.ciphertext, stored.access.iv];
    const { token } = await signedIn(env, "Ana", "246");
    const reservationId = await putReservation(env);
    const id = env.w.a.menuServiceId;

    const started = await env.owner.mutation(api.menuMail.startConnect, { menuServiceId: id, provider: "gmail" });
    const verifierRow = (await stateRows(env))[0];
    const verifier = await openMenuMailSecret(
      KEY,
      { ciphertext: verifierRow.codeVerifierCiphertext, iv: verifierRow.codeVerifierIv },
      menuMailAad({ purpose: "verifier", menuServiceId: id, provider: "gmail", binding: verifierRow.stateHash }),
    );
    secrets.push(verifier, verifierRow.codeVerifierCiphertext, verifierRow.codeVerifierIv);

    const answers: Record<string, unknown> = {
      status: await env.owner.query(api.menuMail.status, { menuServiceId: id }),
      startConnect: started,
      templates: await env.owner.query(api.menuMail.templates, { menuServiceId: id }),
      saveTemplate: await env.owner.mutation(api.menuMail.saveTemplate, { menuServiceId: id, kind: "accept", subject: "Potvrda", body: "Dobar dan." }),
      setSignature: await env.owner.mutation(api.menuMail.setSignature, { menuServiceId: id, signature: "Srdačno" }),
      resetTemplate: await env.owner.mutation(api.menuMail.resetTemplate, { menuServiceId: id, kind: "accept" }),
      logReply: await env.t.mutation(api.menuMail.logReply, { ...panel(env, token), reservationId, channel: "phone", phoneOutcome: "reached" }),
      replyContext: await env.t.query(api.menuMail.replyContext, { ...panel(env, token), reservationId }),
      replyContextOwner: await env.owner.query(api.menuMail.replyContext, { ...panel(env), reservationId }),
      disconnect: await env.owner.mutation(api.menuMail.disconnect, { menuServiceId: id }),
    };
    for (const [name, answer] of Object.entries(answers)) {
      expect(leaksIn(answer, secrets), name).toEqual([]);
    }
    expect(answers.status).toMatchObject({ connection: { emailAddress: ADDRESS } });
    expect(answers.replyContext).not.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("exactly these functions of convex/menuMail.ts are public; the rest are internal", () => {
    type Registered = { isPublic?: boolean; isInternal?: boolean };
    const registered = Object.fromEntries(
      Object.entries(menuMail)
        .filter(([, value]) => typeof value === "function" && ((value as Registered).isPublic || (value as Registered).isInternal))
        .map(([name, value]) => [name, (value as Registered).isPublic ? "public" : "internal"]),
    );
    expect(registered).toEqual({
      status: "public",
      startConnect: "public",
      disconnect: "public",
      templates: "public",
      saveTemplate: "public",
      resetTemplate: "public",
      setSignature: "public",
      replyContext: "public",
      logReply: "public",
      consumeState: "internal",
      saveConnection: "internal",
      claimSend: "internal",
      tokensFor: "internal",
      cacheAccessToken: "internal",
      markReconnect: "internal",
      finishSend: "internal",
    });
  });
});
