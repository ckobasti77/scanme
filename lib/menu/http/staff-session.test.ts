import { describe, expect, test, vi } from "vitest";
import {
  STAFF_DEVICE_COOKIE,
  STAFF_DEVICE_MAX_AGE_S,
  STAFF_SESSION_COOKIE,
  STAFF_SESSION_MAX_AGE_S,
  handleStaffLogin,
  handleStaffLogout,
  readStaffSessionToken,
  staffDeviceCookieContext,
  staffSessionCookieContext,
  type StaffLoginOutcome,
  type StaffSessionDeps,
} from "./staff-session";
import { signCookieValue, verifyCookieValue } from "../signed-cookie";
import { newMenuToken } from "../tokens";

const SLUG = "demo-restoran";
const OTHER_SLUG = "kafana-kod-mike";
const PANEL = "K7M2Q9XR4T";
const SECRET = "test-secret-0123456789abcdef";
const IP_HASH = "a1b2c3d4e5f60718";
const URL = `https://scanme.test/${SLUG}/konobar/${PANEL}/sesija`;
const PARAMS = { slug: SLUG, panelCode: PANEL };

const SESSION = newMenuToken();
const DEVICE = newMenuToken();
const NEW_DEVICE = newMenuToken();

type LoginInput = Parameters<StaffSessionDeps["login"]>[0];
type LogoutInput = Parameters<StaffSessionDeps["logout"]>[0];

const SUCCESS: StaffLoginOutcome = {
  ok: true,
  sessionToken: SESSION,
  deviceToken: NEW_DEVICE,
  expiresAt: 1_800_000_000_000,
  displayName: "Marko",
};

function makeDeps(outcome: StaffLoginOutcome | Error, extra: Partial<StaffSessionDeps> = {}) {
  const login = vi.fn<(input: LoginInput) => Promise<StaffLoginOutcome>>(async () => {
    if (outcome instanceof Error) throw outcome;
    return outcome;
  });
  const logout = vi.fn<(input: LogoutInput) => Promise<unknown>>(async () => undefined);
  const deps: StaffSessionDeps = { login, logout, secret: SECRET, ipHash: IP_HASH, ...extra };
  return { login, logout, deps };
}

const post = (body: string, headers: Record<string, string> = {}) =>
  new Request(URL, { method: "POST", body, headers: { "content-type": "application/json", ...headers } });
const postPin = (pin: unknown, headers: Record<string, string> = {}) => post(JSON.stringify({ pin }), headers);
const del = (headers: Record<string, string> = {}) => new Request(URL, { method: "DELETE", headers });

const signedDevice = (token = DEVICE, slug = SLUG) => signCookieValue(token, SECRET, staffDeviceCookieContext(slug));
const signedSession = (token = SESSION, slug = SLUG) => signCookieValue(token, SECRET, staffSessionCookieContext(slug));

async function read(response: Response) {
  const text = await response.text();
  return { text, body: JSON.parse(text) as Record<string, unknown> };
}

function cookieNamed(response: Response, name: string): string | undefined {
  return response.headers.getSetCookie().find((cookie) => cookie.startsWith(`${name}=`));
}

function cookieValue(cookie: string, name: string): string {
  return cookie.split(";")[0].slice(name.length + 1);
}

function expectNoStore(response: Response) {
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(response.headers.get("X-Robots-Tag")).toBe("noindex");
  expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
  expect(response.headers.get("Content-Type")).toBe("application/json; charset=utf-8");
}

/** The device cookie of an answer, checked to carry exactly `token`, signed for this venue. */
async function expectDeviceCookie(response: Response, token: string) {
  const cookie = cookieNamed(response, "smk_d");
  expect(cookie).toBeDefined();
  expect(cookie).toContain("; Path=/demo-restoran/konobar; Max-Age=15552000; HttpOnly; Secure; SameSite=Lax");
  expect(await verifyCookieValue(cookieValue(cookie!, "smk_d"), SECRET, "smk_d:demo-restoran")).toBe(token);
}

describe("constants", () => {
  test("cookie names, lifetimes and signing contexts", () => {
    expect(STAFF_SESSION_COOKIE).toBe("smk_s");
    expect(STAFF_DEVICE_COOKIE).toBe("smk_d");
    expect(STAFF_SESSION_MAX_AGE_S).toBe(43200);
    expect(STAFF_DEVICE_MAX_AGE_S).toBe(15552000);
    expect(staffSessionCookieContext(SLUG)).toBe("smk_s:demo-restoran");
    expect(staffDeviceCookieContext(SLUG)).toBe("smk_d:demo-restoran");
  });
});

describe("handleStaffLogin: success", () => {
  test("200 with the session in the body, two signed cookies at the venue's panel path, no-store", async () => {
    const { deps, login } = makeDeps(SUCCESS);
    const response = await handleStaffLogin(postPin("1234"), PARAMS, deps);

    expect(response.status).toBe(200);
    expectNoStore(response);
    const { body } = await read(response);
    expect(body).toEqual({ ok: true, sessionToken: SESSION, expiresAt: 1_800_000_000_000, displayName: "Marko" });

    const cookies = response.headers.getSetCookie();
    expect(cookies).toHaveLength(2);

    const session = cookieNamed(response, "smk_s")!;
    expect(session).toBe(
      `smk_s=${await signedSession()}; Path=/demo-restoran/konobar; Max-Age=43200; HttpOnly; Secure; SameSite=Lax`,
    );
    expect(await verifyCookieValue(cookieValue(session, "smk_s"), SECRET, "smk_s:demo-restoran")).toBe(SESSION);
    // A value copied to another venue does not verify there.
    expect(await verifyCookieValue(cookieValue(session, "smk_s"), SECRET, "smk_s:kafana-kod-mike")).toBeNull();

    const device = cookieNamed(response, "smk_d")!;
    expect(device).toBe(
      `smk_d=${await signedDevice(NEW_DEVICE)}; Path=/demo-restoran/konobar; Max-Age=15552000; HttpOnly; Secure; SameSite=Lax`,
    );
    await expectDeviceCookie(response, NEW_DEVICE);

    expect(login).toHaveBeenCalledTimes(1);
  });

  test("without a device cookie the login gets slug, panel code, pin and ip hash, and no deviceToken", async () => {
    const { deps, login } = makeDeps(SUCCESS);
    await handleStaffLogin(postPin("1234"), PARAMS, deps);
    const input = login.mock.calls[0][0];
    expect(input).toEqual({ slug: SLUG, panelCode: PANEL, pin: "1234", ipHash: IP_HASH });
    expect("deviceToken" in input).toBe(false);
  });

  test("a valid signed smk_d for this venue is passed on as deviceToken, among other cookies", async () => {
    const { deps, login } = makeDeps(SUCCESS);
    const cookie = `theme=dark; smk_d=${await signedDevice()}; smk_s=${await signedSession()}`;
    await handleStaffLogin(postPin("1234", { cookie }), PARAMS, deps);
    expect(login).toHaveBeenCalledWith({
      slug: SLUG,
      panelCode: PANEL,
      pin: "1234",
      ipHash: IP_HASH,
      deviceToken: DEVICE,
    });
  });

  test("a forged, wrong-venue, wrong-secret or wrong-cookie smk_d is ignored", async () => {
    const forged = `smk_d=${DEVICE}.forgedforgedforged`;
    const otherSlug = `smk_d=${await signedDevice(DEVICE, OTHER_SLUG)}`;
    const otherSecret = `smk_d=${await signCookieValue(DEVICE, "another-secret-0123456789", staffDeviceCookieContext(SLUG))}`;
    const sessionContext = `smk_d=${await signCookieValue(DEVICE, SECRET, staffSessionCookieContext(SLUG))}`;
    const unsigned = `smk_d=${DEVICE}`;
    for (const cookie of [forged, otherSlug, otherSecret, sessionContext, unsigned]) {
      const { deps, login } = makeDeps(SUCCESS);
      const response = await handleStaffLogin(postPin("1234", { cookie }), PARAMS, deps);
      expect(response.status).toBe(200);
      expect(login).toHaveBeenCalledTimes(1);
      const input = login.mock.calls[0][0];
      expect("deviceToken" in input).toBe(false);
      expect(input).toEqual({ slug: SLUG, panelCode: PANEL, pin: "1234", ipHash: IP_HASH });
    }
  });

  test("the longest accepted pin (8 characters) goes through untouched", async () => {
    const { deps, login } = makeDeps(SUCCESS);
    const response = await handleStaffLogin(postPin("12345678"), PARAMS, deps);
    expect(response.status).toBe(200);
    expect(login.mock.calls[0][0].pin).toBe("12345678");
  });

  test("a same-origin Origin header is allowed", async () => {
    const { deps, login } = makeDeps(SUCCESS);
    const response = await handleStaffLogin(postPin("1234", { origin: "https://scanme.test" }), PARAMS, deps);
    expect(response.status).toBe(200);
    expect(login).toHaveBeenCalledTimes(1);
  });
});

describe("handleStaffLogin: refusals from the server", () => {
  test("wrong pin → 401 with attemptsLeft and the device cookie, but no session cookie", async () => {
    const { deps } = makeDeps({ ok: false, code: "staff/wrong_pin", deviceToken: NEW_DEVICE, attemptsLeft: 3 });
    const response = await handleStaffLogin(postPin("0000"), PARAMS, deps);
    expect(response.status).toBe(401);
    expectNoStore(response);
    expect((await read(response)).body).toEqual({ ok: false, code: "staff/wrong_pin", attemptsLeft: 3 });
    expect(response.headers.getSetCookie()).toHaveLength(1);
    expect(cookieNamed(response, "smk_s")).toBeUndefined();
    await expectDeviceCookie(response, NEW_DEVICE);
  });

  test("locked → 423 with lockedUntil and the device cookie", async () => {
    const { deps } = makeDeps({ ok: false, code: "staff/locked", deviceToken: NEW_DEVICE, lockedUntil: 1_800_000_900_000 });
    const response = await handleStaffLogin(postPin("0000"), PARAMS, deps);
    expect(response.status).toBe(423);
    expectNoStore(response);
    expect((await read(response)).body).toEqual({ ok: false, code: "staff/locked", lockedUntil: 1_800_000_900_000 });
    expect(response.headers.getSetCookie()).toHaveLength(1);
    expect(cookieNamed(response, "smk_s")).toBeUndefined();
    await expectDeviceCookie(response, NEW_DEVICE);
  });

  test("rate limited → 429 with retryAt and the device cookie; retryAt may be null", async () => {
    const limited = makeDeps({ ok: false, code: "staff/rate_limited", deviceToken: NEW_DEVICE, retryAt: 1_800_000_060_000 });
    const response = await handleStaffLogin(postPin("0000"), PARAMS, limited.deps);
    expect(response.status).toBe(429);
    expectNoStore(response);
    expect((await read(response)).body).toEqual({ ok: false, code: "staff/rate_limited", retryAt: 1_800_000_060_000 });
    expect(response.headers.getSetCookie()).toHaveLength(1);
    expect(cookieNamed(response, "smk_s")).toBeUndefined();
    await expectDeviceCookie(response, NEW_DEVICE);

    const unknown = makeDeps({ ok: false, code: "staff/rate_limited", deviceToken: NEW_DEVICE, retryAt: null });
    const second = await handleStaffLogin(postPin("0000"), PARAMS, unknown.deps);
    expect(second.status).toBe(429);
    expect((await read(second)).body).toEqual({ ok: false, code: "staff/rate_limited", retryAt: null });
  });

  test("pin unavailable → 503 and panel not found → 404, both without any cookie", async () => {
    const unavailable = makeDeps({ ok: false, code: "staff/pin_unavailable" });
    const first = await handleStaffLogin(postPin("1234"), PARAMS, unavailable.deps);
    expect(first.status).toBe(503);
    expectNoStore(first);
    expect((await read(first)).body).toEqual({ ok: false, code: "staff/pin_unavailable" });
    expect(first.headers.getSetCookie()).toHaveLength(0);

    const missing = makeDeps({ ok: false, code: "staff/panel_not_found" });
    const second = await handleStaffLogin(postPin("1234"), PARAMS, missing.deps);
    expect(second.status).toBe(404);
    expectNoStore(second);
    expect((await read(second)).body).toEqual({ ok: false, code: "staff/panel_not_found" });
    expect(second.headers.getSetCookie()).toHaveLength(0);
  });

  test("the login throwing → 502 network, without cookies", async () => {
    const { deps, login } = makeDeps(new Error("fetch failed"));
    const response = await handleStaffLogin(postPin("1234"), PARAMS, deps);
    expect(response.status).toBe(502);
    expectNoStore(response);
    expect((await read(response)).body).toEqual({ ok: false, code: "network" });
    expect(response.headers.getSetCookie()).toHaveLength(0);
    expect(login).toHaveBeenCalledTimes(1);
  });
});

describe("handleStaffLogin: refusals of the request itself", () => {
  test("no secret → 503 unavailable, login not called, no cookies", async () => {
    const { deps, login } = makeDeps(SUCCESS, { secret: null });
    const response = await handleStaffLogin(postPin("1234"), PARAMS, deps);
    expect(response.status).toBe(503);
    expectNoStore(response);
    expect((await read(response)).body).toEqual({ ok: false, code: "unavailable" });
    expect(response.headers.getSetCookie()).toHaveLength(0);
    expect(login).not.toHaveBeenCalled();
  });

  test.each([
    ["not JSON", "this is not json"],
    ["broken JSON", '{"pin": "12'],
    ["an empty body", ""],
    ["a JSON null", "null"],
    ["a JSON string", '"1234"'],
    ["no pin", "{}"],
    ["a null pin", '{"pin":null}'],
    ["a numeric pin", '{"pin":1234}'],
    ["an array pin", '{"pin":["1234"]}'],
    ["an empty pin", '{"pin":""}'],
    ["a 9-character pin", '{"pin":"123456789"}'],
  ])("%s → 400 invalid_request, login not called", async (_name, raw) => {
    const { deps, login } = makeDeps(SUCCESS);
    const response = await handleStaffLogin(post(raw), PARAMS, deps);
    expect(response.status).toBe(400);
    expectNoStore(response);
    expect((await read(response)).body).toEqual({ ok: false, code: "invalid_request" });
    expect(response.headers.getSetCookie()).toHaveLength(0);
    expect(login).not.toHaveBeenCalled();
  });

  test.each([
    ["another site", "https://evil.example"],
    ["a sibling subdomain", "https://evil.scanme.test"],
    ["an unparseable origin", "null"],
  ])("an Origin from %s → 403 forbidden, login not called", async (_name, origin) => {
    const { deps, login } = makeDeps(SUCCESS);
    const response = await handleStaffLogin(postPin("1234", { origin }), PARAMS, deps);
    expect(response.status).toBe(403);
    expectNoStore(response);
    expect((await read(response)).body).toEqual({ ok: false, code: "forbidden" });
    expect(response.headers.getSetCookie()).toHaveLength(0);
    expect(login).not.toHaveBeenCalled();
  });
});

describe("readStaffSessionToken", () => {
  test("reads and verifies smk_s of this venue", async () => {
    const header = `a=1; smk_s=${await signedSession()}; smk_d=${await signedDevice()}`;
    expect(await readStaffSessionToken(header, SLUG, SECRET)).toBe(SESSION);
  });

  test("null without a secret, without the header, without the cookie", async () => {
    const header = `smk_s=${await signedSession()}`;
    expect(await readStaffSessionToken(header, SLUG, null)).toBeNull();
    expect(await readStaffSessionToken(header, SLUG, "")).toBeNull();
    expect(await readStaffSessionToken(null, SLUG, SECRET)).toBeNull();
    expect(await readStaffSessionToken(undefined, SLUG, SECRET)).toBeNull();
    expect(await readStaffSessionToken("", SLUG, SECRET)).toBeNull();
    expect(await readStaffSessionToken("a=1; smk_d=abc", SLUG, SECRET)).toBeNull();
    expect(await readStaffSessionToken("smk_s=", SLUG, SECRET)).toBeNull();
  });

  test("null for a forged, unsigned, other-venue, other-secret or other-cookie value", async () => {
    expect(await readStaffSessionToken(`smk_s=${SESSION}.forgedforgedforged`, SLUG, SECRET)).toBeNull();
    expect(await readStaffSessionToken(`smk_s=${SESSION}`, SLUG, SECRET)).toBeNull();
    expect(await readStaffSessionToken(`smk_s=${await signedSession(SESSION, OTHER_SLUG)}`, SLUG, SECRET)).toBeNull();
    const otherSecret = await signCookieValue(SESSION, "another-secret-0123456789", staffSessionCookieContext(SLUG));
    expect(await readStaffSessionToken(`smk_s=${otherSecret}`, SLUG, SECRET)).toBeNull();
    // The device cookie's signature must not pass as a session.
    expect(await readStaffSessionToken(`smk_s=${await signedDevice(SESSION)}`, SLUG, SECRET)).toBeNull();
  });
});

describe("handleStaffLogout", () => {
  const CLEARED = "smk_s=; Path=/demo-restoran/konobar; Max-Age=0; HttpOnly; Secure; SameSite=Lax";

  test("with a valid session cookie: logout gets the raw token, 200 and the cookie is cleared", async () => {
    const { deps, logout } = makeDeps(SUCCESS);
    const response = await handleStaffLogout(del({ cookie: `smk_s=${await signedSession()}` }), PARAMS, deps);
    expect(response.status).toBe(200);
    expectNoStore(response);
    expect((await read(response)).body).toEqual({ ok: true });
    expect(response.headers.getSetCookie()).toEqual([CLEARED]);
    expect(logout).toHaveBeenCalledTimes(1);
    expect(logout).toHaveBeenCalledWith({ slug: SLUG, panelCode: PANEL, sessionToken: SESSION });
  });

  test("without a cookie: logout not called, still 200 and a clearing cookie", async () => {
    const { deps, logout } = makeDeps(SUCCESS);
    const response = await handleStaffLogout(del(), PARAMS, deps);
    expect(response.status).toBe(200);
    expect((await read(response)).body).toEqual({ ok: true });
    expect(response.headers.getSetCookie()).toEqual([CLEARED]);
    expect(logout).not.toHaveBeenCalled();
  });

  test("forged, other-venue cookie or missing secret: logout not called, still cleared", async () => {
    const cases: Array<[string, string | null]> = [
      [`smk_s=${SESSION}.forgedforgedforged`, SECRET],
      [`smk_s=${await signedSession(SESSION, OTHER_SLUG)}`, SECRET],
      [`smk_s=${await signedSession()}`, null],
    ];
    for (const [cookie, secret] of cases) {
      const { deps, logout } = makeDeps(SUCCESS, { secret });
      const response = await handleStaffLogout(del({ cookie }), PARAMS, deps);
      expect(response.status).toBe(200);
      expect(response.headers.getSetCookie()).toEqual([CLEARED]);
      expect(logout).not.toHaveBeenCalled();
    }
  });

  test("logout throwing is swallowed: still 200 and cleared", async () => {
    const { deps, logout } = makeDeps(SUCCESS);
    logout.mockRejectedValueOnce(new Error("fetch failed"));
    const response = await handleStaffLogout(del({ cookie: `smk_s=${await signedSession()}` }), PARAMS, deps);
    expect(logout).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    expect((await read(response)).body).toEqual({ ok: true });
    expect(response.headers.getSetCookie()).toEqual([CLEARED]);
  });

  test("a cross-site Origin → 403 forbidden, logout not called, the cookie is not cleared", async () => {
    const { deps, logout } = makeDeps(SUCCESS);
    const response = await handleStaffLogout(
      del({ cookie: `smk_s=${await signedSession()}`, origin: "https://evil.example" }),
      PARAMS,
      deps,
    );
    expect(response.status).toBe(403);
    expectNoStore(response);
    expect((await read(response)).body).toEqual({ ok: false, code: "forbidden" });
    expect(response.headers.getSetCookie()).toHaveLength(0);
    expect(logout).not.toHaveBeenCalled();
  });

  test("a same-origin Origin is allowed", async () => {
    const { deps, logout } = makeDeps(SUCCESS);
    const response = await handleStaffLogout(
      del({ cookie: `smk_s=${await signedSession()}`, origin: "https://scanme.test" }),
      PARAMS,
      deps,
    );
    expect(response.status).toBe(200);
    expect(logout).toHaveBeenCalledTimes(1);
  });
});

describe("the device token never reaches an answer body", () => {
  test("not in the success body (only the session token is), nor in any refusal or logout body", async () => {
    const outcomes: StaffLoginOutcome[] = [
      SUCCESS,
      { ok: false, code: "staff/wrong_pin", deviceToken: NEW_DEVICE, attemptsLeft: 2 },
      { ok: false, code: "staff/locked", deviceToken: NEW_DEVICE, lockedUntil: 1_800_000_900_000 },
      { ok: false, code: "staff/rate_limited", deviceToken: NEW_DEVICE, retryAt: 1_800_000_060_000 },
      { ok: false, code: "staff/pin_unavailable" },
      { ok: false, code: "staff/panel_not_found" },
    ];
    for (const outcome of outcomes) {
      const { deps } = makeDeps(outcome);
      // The request carries the old device cookie too; neither token may leak.
      const response = await handleStaffLogin(postPin("1234", { cookie: `smk_d=${await signedDevice()}` }), PARAMS, deps);
      const { text } = await read(response);
      expect(text).not.toContain(NEW_DEVICE);
      expect(text).not.toContain(DEVICE);
      if (outcome.ok) expect(text).toContain(SESSION);
      else expect(text).not.toContain(SESSION);
    }

    const { deps } = makeDeps(SUCCESS);
    const logout = await handleStaffLogout(
      del({ cookie: `smk_s=${await signedSession()}; smk_d=${await signedDevice()}` }),
      PARAMS,
      deps,
    );
    const { text } = await read(logout);
    expect(text).not.toContain(DEVICE);
    expect(text).not.toContain(SESSION);
  });
});
