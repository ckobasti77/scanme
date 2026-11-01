// K34 review fixes for the card hop GET /r/[cardCode]/meni (lib/menu/http/guest-hop.ts).
//   C4  a hop that opened no session because the card's bucket was empty must also drop the
//       guest's cookie of the PREVIOUS table (smm_g), or calls and orders go to the wrong table;
//       a card without a position leaves the cookie alone (the guest still sits at their table).
//   C9  without SCANME_GUEST_SECRET no cookie can carry a session, so the hop must not ask
//       for one (every scan would write a session row and schedule its expiry for nothing).

import { describe, expect, test, vi } from "vitest";
import { handleGuestHop, type GuestHopDeps, type GuestHopMintOutcome } from "./guest-hop";
import {
  MENU_GUEST_DEVICE_COOKIE,
  MENU_GUEST_SESSION_COOKIE,
  cookieHeader,
  deviceCookieContext,
  sessionCookieContext,
  signCookieValue,
  verifyCookieValue,
} from "../signed-cookie";

const SECRET = "test-secret-k34";
const GUEST = "g".repeat(43);
const DEVICE = "d".repeat(43);
const IP_HASH = "a1b2c3d4e5f60718";

function setup(outcome: GuestHopMintOutcome, extra: Partial<GuestHopDeps> = {}) {
  const mint = vi.fn<GuestHopDeps["mint"]>(async () => outcome);
  return { mint, deps: { mint, secret: SECRET, ipHash: IP_HASH, ...extra } satisfies GuestHopDeps };
}

/** A scan of the card, by a phone that may already carry the guest cookie of its previous table. */
const request = (cookie?: string) =>
  new Request("https://scanme.test/r/K7M2Q9XA/meni", cookie ? { headers: { cookie } } : undefined);

const OLD_TABLE_COOKIE = `${MENU_GUEST_SESSION_COOKIE}=${GUEST}.previous-table-signature-xx`;

describe("C4: a hop that opened no session because the card's bucket was empty drops the old session cookie", () => {
  const throttled = (pagePath: string | null): GuestHopMintOutcome => ({
    kind: "menu",
    slug: "demo-restoran",
    pagePath,
    session: null,
    throttled: true,
  });

  test("Set-Cookie clears smm_g with the Path the hop sets it with, and the guest still reaches the menu", async () => {
    const { deps } = setup(throttled(null));
    const response = await handleGuestHop(request(OLD_TABLE_COOKIE), "K7M2Q9XA", deps);
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("https://scanme.test/demo-restoran/meni");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const cookies = response.headers.getSetCookie();
    expect(cookies).toEqual(["smm_g=; Path=/demo-restoran/meni; Max-Age=0; HttpOnly; Secure; SameSite=Lax"]);
    // Exactly what the hop would set, only expired: same name, same Path and attributes.
    expect(cookies[0]).toBe(cookieHeader(MENU_GUEST_SESSION_COOKIE, "", { path: "/demo-restoran/meni", maxAgeS: 0 }));
  });

  test("the cookie is dropped for the venue's whole menu, whatever page the card opens; the device cookies are left alone", async () => {
    const { deps } = setup(throttled("vinska-karta"));
    const response = await handleGuestHop(request(OLD_TABLE_COOKIE), "K7M2Q9XA", deps);
    expect(response.headers.get("Location")).toBe("https://scanme.test/demo-restoran/meni/vinska-karta");
    const cookies = response.headers.getSetCookie();
    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toContain("Path=/demo-restoran/meni;");
    expect(cookies[0]).toContain("Max-Age=0;");
    expect(cookies.some((cookie) => cookie.startsWith(`${MENU_GUEST_DEVICE_COOKIE}=`))).toBe(false);
  });

  test("the device cookie of /r is still verified and passed on to the hop", async () => {
    const device = await signCookieValue(DEVICE, SECRET, deviceCookieContext());
    const { deps, mint } = setup(throttled(null));
    await handleGuestHop(request(`${MENU_GUEST_DEVICE_COOKIE}=${device}; ${OLD_TABLE_COOKIE}`), "K7M2Q9XA", deps);
    expect(mint).toHaveBeenCalledWith({ cardCode: "K7M2Q9XA", ipHash: IP_HASH, deviceToken: DEVICE });
  });

  test("a card WITHOUT a position (a page card) sets nothing and clears nothing: the guest still sits at their table", async () => {
    for (const outcome of [
      { kind: "menu", slug: "demo-restoran", pagePath: "vinska-karta", session: null } as const,
      { kind: "menu", slug: "demo-restoran", pagePath: null, session: null, throttled: false } as const,
    ]) {
      const { deps } = setup(outcome);
      const response = await handleGuestHop(request(OLD_TABLE_COOKIE), "K7M2Q9XA", deps);
      expect(response.status).toBe(302);
      expect(response.headers.getSetCookie()).toHaveLength(0);
    }
  });

  test("a hop that DID open a session sets the new cookies as before and clears nothing", async () => {
    const { deps } = setup({
      kind: "menu",
      slug: "demo-restoran",
      pagePath: null,
      session: { guestToken: GUEST, deviceToken: DEVICE },
    });
    const response = await handleGuestHop(request(OLD_TABLE_COOKIE), "K7M2Q9XA", deps);
    const cookies = response.headers.getSetCookie();
    expect(cookies).toHaveLength(3);
    expect(cookies.some((cookie) => cookie.includes("Max-Age=0"))).toBe(false);
    const session = cookies.find((cookie) => cookie.startsWith(`${MENU_GUEST_SESSION_COOKIE}=`))!;
    const value = session.split(";")[0].slice(MENU_GUEST_SESSION_COOKIE.length + 1);
    expect(await verifyCookieValue(value, SECRET, sessionCookieContext("demo-restoran"))).toBe(GUEST);
  });

  test("an invalid card or a flooded address still lands on /r/nevazeca without touching any cookie", async () => {
    for (const outcome of [{ kind: "invalid" } as const, { kind: "rate_limited" } as const]) {
      const { deps } = setup(outcome);
      const response = await handleGuestHop(request(OLD_TABLE_COOKIE), "NEPOSTOJI", deps);
      expect(response.headers.get("Location")).toBe("https://scanme.test/r/nevazeca");
      expect(response.headers.getSetCookie()).toHaveLength(0);
    }
  });
});

describe("C9: without SCANME_GUEST_SECRET the hop asks only where the menu is", () => {
  test("the mint call says so, the menu opens with no cookies, and the missing secret is reported once", async () => {
    const onMissingSecret = vi.fn();
    const { deps, mint } = setup(
      { kind: "menu", slug: "demo-restoran", pagePath: "vinska-karta", session: null },
      { secret: null, onMissingSecret },
    );
    const response = await handleGuestHop(request(), "K7M2Q9XA", deps);
    expect(mint).toHaveBeenCalledOnce();
    expect(mint).toHaveBeenCalledWith({ cardCode: "K7M2Q9XA", ipHash: IP_HASH, withoutSession: true });
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("https://scanme.test/demo-restoran/meni/vinska-karta");
    expect(response.headers.getSetCookie()).toHaveLength(0);
    expect(onMissingSecret).toHaveBeenCalledOnce();
  });

  test("an old device cookie is not even read without the secret (it could not be verified)", async () => {
    const device = await signCookieValue(DEVICE, SECRET, deviceCookieContext());
    const { deps, mint } = setup({ kind: "menu", slug: "demo-restoran", pagePath: null, session: null }, { secret: null });
    await handleGuestHop(request(`${MENU_GUEST_DEVICE_COOKIE}=${device}`), "K7M2Q9XA", deps);
    expect(mint).toHaveBeenCalledWith({ cardCode: "K7M2Q9XA", ipHash: IP_HASH, withoutSession: true });
  });

  test("even if a session came back it is never turned into cookies, and an old cookie is left alone", async () => {
    const { deps } = setup(
      { kind: "menu", slug: "demo-restoran", pagePath: null, session: { guestToken: GUEST, deviceToken: DEVICE } },
      { secret: null },
    );
    const response = await handleGuestHop(request(OLD_TABLE_COOKIE), "K7M2Q9XA", deps);
    expect(response.headers.get("Location")).toBe("https://scanme.test/demo-restoran/meni");
    expect(response.headers.getSetCookie()).toHaveLength(0);

    const flooded = setup(
      { kind: "menu", slug: "demo-restoran", pagePath: null, session: null, throttled: true },
      { secret: null },
    );
    const second = await handleGuestHop(request(OLD_TABLE_COOKIE), "K7M2Q9XA", flooded.deps);
    expect(second.headers.getSetCookie()).toHaveLength(0);
  });

  test("an invalid card still lands on /r/nevazeca, and nothing is reported for it", async () => {
    const onMissingSecret = vi.fn();
    const { deps } = setup({ kind: "invalid" }, { secret: null, onMissingSecret });
    const response = await handleGuestHop(request(), "NEPOSTOJI", deps);
    expect(response.headers.get("Location")).toBe("https://scanme.test/r/nevazeca");
    expect(onMissingSecret).not.toHaveBeenCalled();
  });

  test("with the secret the mint call is exactly as before K34: no withoutSession in it", async () => {
    const { deps, mint } = setup({
      kind: "menu",
      slug: "demo-restoran",
      pagePath: null,
      session: { guestToken: GUEST, deviceToken: DEVICE },
    });
    await handleGuestHop(request(), "K7M2Q9XA", deps);
    expect(mint).toHaveBeenCalledOnce();
    const input = mint.mock.calls[0][0];
    expect(input).toEqual({ cardCode: "K7M2Q9XA", ipHash: IP_HASH });
    expect("withoutSession" in input).toBe(false);
  });
});
