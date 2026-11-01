import { describe, expect, test, vi } from "vitest";
import { handleGuestHop, type GuestHopDeps, type GuestHopMintOutcome } from "./guest-hop";
import { menuOutcomePath } from "./card-redirect";
import {
  MENU_GUEST_DEVICE_COOKIE,
  MENU_GUEST_SESSION_COOKIE,
  cookieHeader,
  deviceCookieContext,
  readCookie,
  sessionCookieContext,
  signCookieValue,
  verifyCookieValue,
} from "../signed-cookie";
import { deviceKeyHashFor, isMenuToken, newMenuToken, sessionTokenHash, sha256Hex } from "../tokens";

const SECRET = "test-secret-k20";
const GUEST = "g".repeat(43);
const DEVICE = "d".repeat(43);

function deps(outcome: GuestHopMintOutcome | Error, extra: Partial<GuestHopDeps> = {}) {
  const mint = vi.fn(async () => {
    if (outcome instanceof Error) throw outcome;
    return outcome;
  });
  return { mint, deps: { mint, secret: SECRET, ipHash: "a1b2c3d4e5f60718", ...extra } satisfies GuestHopDeps };
}

const request = (cookie?: string) =>
  new Request("https://scanme.test/r/K7M2Q9XA/meni", cookie ? { headers: { cookie } } : undefined);

describe("menuOutcomePath (the resolver's menu branch)", () => {
  test("no link → /{slug}/meni exactly as before K20", () => {
    expect(menuOutcomePath({ kind: "menu", businessSlug: "demo-restoran" })).toBe("/demo-restoran/meni");
  });
  test("a linked page → its sub-link; a position → the hop", () => {
    expect(menuOutcomePath({ kind: "menu", businessSlug: "demo-restoran", pagePath: "vinska-karta" })).toBe(
      "/demo-restoran/meni/vinska-karta",
    );
    expect(
      menuOutcomePath({
        kind: "menu",
        businessSlug: "demo-restoran",
        pagePath: "vinska-karta",
        hop: true,
        cardCode: "K7M2Q9XA",
      }),
    ).toBe("/r/K7M2Q9XA/meni");
  });
});

describe("tokens", () => {
  test("256-bit base64url tokens, hashes are hex and scoped", async () => {
    const token = newMenuToken();
    expect(isMenuToken(token)).toBe(true);
    expect(isMenuToken("short")).toBe(false);
    expect(isMenuToken(42)).toBe(false);
    expect(newMenuToken(() => new Uint8Array(32))).toBe("A".repeat(43));
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(await deviceKeyHashFor("svcA", DEVICE)).not.toBe(await deviceKeyHashFor("svcB", DEVICE));
    expect(await sessionTokenHash(GUEST)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("signed cookies", () => {
  test("a signed value verifies only with the same secret and context", async () => {
    const signed = await signCookieValue(GUEST, SECRET, sessionCookieContext("demo-restoran"));
    expect(await verifyCookieValue(signed, SECRET, sessionCookieContext("demo-restoran"))).toBe(GUEST);
    expect(await verifyCookieValue(signed, SECRET, sessionCookieContext("kafana-kod-mike"))).toBeNull();
    expect(await verifyCookieValue(signed, "other", sessionCookieContext("demo-restoran"))).toBeNull();
    expect(await verifyCookieValue(`${GUEST}.forged-signature-xx`, SECRET, sessionCookieContext("demo-restoran"))).toBeNull();
    expect(await verifyCookieValue(null, SECRET, deviceCookieContext())).toBeNull();
    expect(await verifyCookieValue("x".repeat(300), SECRET, deviceCookieContext())).toBeNull();
    expect(await verifyCookieValue(signed, "", sessionCookieContext("demo-restoran"))).toBeNull();
  });

  test("cookie header attributes and reading", () => {
    expect(cookieHeader("smm_g", "v", { path: "/demo/meni", maxAgeS: 10 })).toBe(
      "smm_g=v; Path=/demo/meni; Max-Age=10; HttpOnly; Secure; SameSite=Lax",
    );
    expect(() => cookieHeader("bad name", "v", { path: "/", maxAgeS: 1 })).toThrow();
    expect(readCookie("a=1; smm_d=abc.def ; b=2", "smm_d")).toBe("abc.def");
    expect(readCookie("a=1", "smm_d")).toBeNull();
    expect(readCookie(null, "smm_d")).toBeNull();
    expect(readCookie("smm_d=", "smm_d")).toBeNull();
  });
});

describe("handleGuestHop", () => {
  test("a position card: clean URL, session + device cookies with exact paths, no-store", async () => {
    const { deps: d, mint } = deps({
      kind: "menu",
      slug: "demo-restoran",
      pagePath: null,
      session: { guestToken: GUEST, deviceToken: DEVICE },
    });
    const response = await handleGuestHop(request(), "K7M2Q9XA", d);
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("https://scanme.test/demo-restoran/meni");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const cookies = response.headers.getSetCookie();
    expect(cookies).toHaveLength(3);
    const session = cookies.find((c) => c.startsWith(`${MENU_GUEST_SESSION_COOKIE}=`))!;
    expect(session).toContain("Path=/demo-restoran/meni;");
    expect(session).toContain("Max-Age=10800;");
    expect(session).toContain("HttpOnly; Secure; SameSite=Lax");
    const devices = cookies.filter((c) => c.startsWith(`${MENU_GUEST_DEVICE_COOKIE}=`));
    expect(devices.map((c) => /Path=([^;]+)/.exec(c)?.[1]).sort()).toEqual(["/demo-restoran/meni", "/r"]);
    // The position never appears in the address; the cookie value is signed.
    const value = session.split(";")[0].slice(MENU_GUEST_SESSION_COOKIE.length + 1);
    expect(await verifyCookieValue(value, SECRET, sessionCookieContext("demo-restoran"))).toBe(GUEST);
    expect(mint).toHaveBeenCalledWith({ cardCode: "K7M2Q9XA", ipHash: "a1b2c3d4e5f60718" });
  });

  test("the device cookie of /r is verified and passed on; a forged one is dropped", async () => {
    const device = await signCookieValue(DEVICE, SECRET, deviceCookieContext());
    const ok = deps({ kind: "menu", slug: "demo-restoran", pagePath: "vinska-karta", session: null });
    const response = await handleGuestHop(request(`smm_d=${device}`), "K7M2Q9XA", ok.deps);
    expect(ok.mint).toHaveBeenCalledWith({ cardCode: "K7M2Q9XA", ipHash: "a1b2c3d4e5f60718", deviceToken: DEVICE });
    expect(response.headers.get("Location")).toBe("https://scanme.test/demo-restoran/meni/vinska-karta");
    // A card without a position: no cookies at all.
    expect(response.headers.getSetCookie()).toHaveLength(0);

    const forged = deps({ kind: "menu", slug: "demo-restoran", pagePath: null, session: null });
    await handleGuestHop(request(`smm_d=${DEVICE}.forgedforgedforged`), "K7M2Q9XA", forged.deps);
    expect(forged.mint).toHaveBeenCalledWith({ cardCode: "K7M2Q9XA", ipHash: "a1b2c3d4e5f60718" });
  });

  test("invalid, throttled or failing → /r/nevazeca", async () => {
    for (const outcome of [{ kind: "invalid" } as const, { kind: "rate_limited" } as const, new Error("network")]) {
      const response = await handleGuestHop(request(), "NEPOSTOJI", deps(outcome).deps);
      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe("https://scanme.test/r/nevazeca");
      expect(response.headers.getSetCookie()).toHaveLength(0);
    }
  });

  test("without the secret the menu still opens, without a position", async () => {
    const onMissingSecret = vi.fn();
    const { deps: d } = deps(
      { kind: "menu", slug: "demo-restoran", pagePath: null, session: { guestToken: GUEST, deviceToken: DEVICE } },
      { secret: null, onMissingSecret },
    );
    const response = await handleGuestHop(request(), "K7M2Q9XA", d);
    expect(response.headers.get("Location")).toBe("https://scanme.test/demo-restoran/meni");
    expect(response.headers.getSetCookie()).toHaveLength(0);
    expect(onMissingSecret).toHaveBeenCalledOnce();
  });
});
