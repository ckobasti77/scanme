// K21 — the server side of the guest's buttons (lib/menu/http/guest-actions.ts):
// real signed cookies (smm_g / smm_d) and a fake Convex that records every
// call. What must hold: Convex only ever sees the VERIFIED token (never the
// raw cookie), a cookie of another venue or another kind is worth nothing,
// bad input is refused before Convex is asked, and the device cookie (not the
// session cookie) is what cancels a request. Invented data only.

import { describe, expect, test, vi } from "vitest";
import { REQUEST_ERROR } from "../errors/requests";
import {
  MENU_GUEST_DEVICE_COOKIE,
  MENU_GUEST_SESSION_COOKIE,
  deviceCookieContext,
  sessionCookieContext,
  signCookieValue,
} from "../signed-cookie";
import { deviceKeyHashFor } from "../tokens";
import {
  callWaiterAction,
  cancelRequestAction,
  deviceTokenOf,
  guestTokenOf,
  myRequestsKeyOf,
  requestBillAction,
  submitOrderAction,
  type GuestActionDeps,
  type GuestActionResult,
} from "./guest-actions";

const SECRET = "test-secret-k21";
const SLUG = "demo-restoran";
const DRUGI_SLUG = "kafana-kod-mike";
const GUEST = "g".repeat(43);
const DEVICE = "d".repeat(43);
const IP_HASH = "a1b2c3d4e5f60718";

const OK: GuestActionResult = {
  ok: true,
  requestId: "rq_probni",
  status: "new",
  createdAt: 1_000,
  deduped: false,
  totals: null,
  paymentPreference: null,
};

type Convex = GuestActionDeps["convex"];
type Poziv = { metod: keyof Convex; args: unknown };

/** A Convex that answers `OK` and remembers what it was asked; `over` replaces methods. */
function lazniConvex(over: Partial<Convex> = {}) {
  const pozivi: Poziv[] = [];
  const convex: Convex = {
    async callWaiter(args) {
      pozivi.push({ metod: "callWaiter", args });
      return OK;
    },
    async requestBill(args) {
      pozivi.push({ metod: "requestBill", args });
      return OK;
    },
    async submitOrder(args) {
      pozivi.push({ metod: "submitOrder", args });
      return OK;
    },
    async cancelRequest(args) {
      pozivi.push({ metod: "cancelRequest", args });
      return { ok: true };
    },
    ...over,
  };
  return { convex, pozivi };
}

type Podesavanje = {
  kolacici?: Record<string, string | undefined>;
  /** null = guest actions are off. */
  secret?: string | null;
  convex?: Partial<Convex>;
};

function zavisnosti(podesavanje: Podesavanje = {}) {
  const { convex, pozivi } = lazniConvex(podesavanje.convex);
  const kolacici = podesavanje.kolacici ?? {};
  /** What the route would log: every error Convex threw. */
  const greske: unknown[] = [];
  const deps: GuestActionDeps = {
    cookie: (name) => kolacici[name],
    secret: podesavanje.secret === undefined ? SECRET : podesavanje.secret,
    ipHash: IP_HASH,
    onError: (error) => greske.push(error),
    convex,
  };
  return { deps, pozivi, greske };
}

const sesijskiKolacic = (slug = SLUG, token = GUEST, secret = SECRET) =>
  signCookieValue(token, secret, sessionCookieContext(slug));
const uredjajKolacic = (token = DEVICE, secret = SECRET) => signCookieValue(token, secret, deviceCookieContext());

const NEMA_SESIJE = { ok: false, code: REQUEST_ERROR.noSession };
const NEISPRAVAN_UNOS = { ok: false, code: REQUEST_ERROR.invalidInput };

const LINIJA = {
  pageKey: "pg_glavni",
  articleKey: "ar_probni",
  variantKey: null,
  addonKeys: ["ao_1", "ao_2"],
  quantity: 2,
  note: "bez luka",
};
const PORUDZBINA = { channel: "standard", lines: [LINIJA], seenTotalRsd: 1_200 };

describe("callWaiterAction", () => {
  test("Convex gets the verified token and the ip hash, never the raw cookie", async () => {
    const kolacic = await sesijskiKolacic();
    const { deps, pozivi } = zavisnosti({ kolacici: { [MENU_GUEST_SESSION_COOKIE]: kolacic } });

    expect(await callWaiterAction(SLUG, deps)).toEqual(OK);

    expect(pozivi).toStrictEqual([{ metod: "callWaiter", args: { slug: SLUG, guestToken: GUEST, ipHash: IP_HASH } }]);
    const poslato = JSON.stringify(pozivi);
    expect(poslato).not.toContain(kolacic);
    // Neither the signature that rides in the cookie.
    expect(poslato).not.toContain(kolacic.slice(GUEST.length + 1));
  });

  test("the answer of Convex comes back as it is (a deduped call stays deduped)", async () => {
    const dedupe: GuestActionResult = { ...OK, deduped: true, status: "accepted", paymentPreference: null };
    const { deps } = zavisnosti({
      kolacici: { [MENU_GUEST_SESSION_COOKIE]: await sesijskiKolacic() },
      convex: { callWaiter: async () => dedupe },
    });
    expect(await callWaiterAction(SLUG, deps)).toEqual(dedupe);
  });

  test("a cookie signed for ANOTHER venue is no session, and Convex is not asked", async () => {
    const { deps, pozivi } = zavisnosti({
      kolacici: { [MENU_GUEST_SESSION_COOKIE]: await sesijskiKolacic(DRUGI_SLUG) },
    });
    expect(await callWaiterAction(SLUG, deps)).toEqual(NEMA_SESIJE);
    expect(pozivi).toEqual([]);
  });

  test("forged, tampered, foreign-secret, malformed or missing cookies are no session", async () => {
    const dobar = await sesijskiKolacic();
    const slucajevi: Record<string, string | undefined> = {
      "no cookie": undefined,
      "empty cookie": "",
      "garbage": "not-a-signed-cookie",
      "right token, invented signature": `${GUEST}.forgedforgedforgedforged`,
      "tampered signature": dobar.slice(0, -1) + (dobar.endsWith("A") ? "B" : "A"),
      "signed with another secret": await sesijskiKolacic(SLUG, GUEST, "another-secret"),
      "the device cookie in the session slot": await uredjajKolacic(),
      "over-long value": "x".repeat(300),
    };
    for (const [opis, kolacic] of Object.entries(slucajevi)) {
      const { deps, pozivi } = zavisnosti({ kolacici: { [MENU_GUEST_SESSION_COOKIE]: kolacic } });
      expect(await callWaiterAction(SLUG, deps), opis).toEqual(NEMA_SESIJE);
      expect(pozivi, opis).toEqual([]);
    }
  });

  test("without SCANME_GUEST_SECRET no cookie can be trusted", async () => {
    const kolacic = await sesijskiKolacic();
    for (const secret of [null, ""]) {
      const { deps, pozivi } = zavisnosti({ kolacici: { [MENU_GUEST_SESSION_COOKIE]: kolacic }, secret });
      expect(await callWaiterAction(SLUG, deps)).toEqual(NEMA_SESIJE);
      expect(pozivi).toEqual([]);
    }
  });

  test("a slug of the wrong shape is no session, even with a cookie signed for exactly that slug", async () => {
    const losi: unknown[] = ["Demo Restoran", "DEMO", "../demo", "demo/restoran", "-demo", "demo--restoran", "", "a".repeat(81), 42, null, undefined, {}];
    for (const slug of losi) {
      const kolacic = typeof slug === "string" ? await sesijskiKolacic(slug) : undefined;
      const { deps, pozivi } = zavisnosti({ kolacici: { [MENU_GUEST_SESSION_COOKIE]: kolacic } });
      expect(await callWaiterAction(slug, deps), String(slug)).toEqual(NEMA_SESIJE);
      expect(pozivi, String(slug)).toEqual([]);
    }
  });

  test("a failing Convex is a value the guest can retry on, not a throw", async () => {
    const pad = vi.fn(async () => {
      throw new Error("convex je nedostupan");
    });
    const { deps, greske } = zavisnosti({
      kolacici: { [MENU_GUEST_SESSION_COOKIE]: await sesijskiKolacic() },
      convex: { callWaiter: pad },
    });
    await expect(callWaiterAction(SLUG, deps)).resolves.toEqual({ ok: false, code: "network" });
    expect(pad).toHaveBeenCalledOnce();
    // The route logs what failed; the guest only gets "network".
    expect(greske).toHaveLength(1);
    expect(greske[0]).toBeInstanceOf(Error);
    expect((greske[0] as Error).message).toBe("convex je nedostupan");
  });

  test("onError is for Convex failures only: refusals and bad input never reach it", async () => {
    const kolacic = await sesijskiKolacic();
    const bez = zavisnosti();
    await callWaiterAction(SLUG, bez.deps);
    await callWaiterAction("Neispravan Slug", bez.deps);
    await requestBillAction(SLUG, "cash", bez.deps);
    await submitOrderAction(SLUG, "nije porudzbina", bez.deps);
    await cancelRequestAction(SLUG, "", bez.deps);
    expect(bez.greske).toEqual([]);

    // An answer of "no" from Convex is an answer, not a failure.
    const odbijeno: GuestActionResult = { ok: false, code: REQUEST_ERROR.actionOff };
    const sa = zavisnosti({
      kolacici: { [MENU_GUEST_SESSION_COOKIE]: kolacic },
      convex: { callWaiter: async () => odbijeno },
    });
    expect(await callWaiterAction(SLUG, sa.deps)).toEqual(odbijeno);
    expect(sa.greske).toEqual([]);
  });

  test("without an onError the failure is still a network answer", async () => {
    const { deps } = zavisnosti({
      kolacici: { [MENU_GUEST_SESSION_COOKIE]: await sesijskiKolacic() },
      convex: {
        callWaiter: async () => {
          throw new Error("convex je nedostupan");
        },
      },
    });
    const bezOnError: GuestActionDeps = { ...deps, onError: undefined };
    await expect(callWaiterAction(SLUG, bezOnError)).resolves.toEqual({ ok: false, code: "network" });
  });
});

describe("requestBillAction", () => {
  test("cash and card go through with the verified token", async () => {
    for (const payment of ["cash", "card"] as const) {
      const { deps, pozivi } = zavisnosti({ kolacici: { [MENU_GUEST_SESSION_COOKIE]: await sesijskiKolacic() } });
      expect(await requestBillAction(SLUG, payment, deps)).toEqual(OK);
      expect(pozivi).toStrictEqual([
        { metod: "requestBill", args: { slug: SLUG, guestToken: GUEST, ipHash: IP_HASH, payment } },
      ]);
    }
  });

  test("any other payment is invalid input and Convex is not asked", async () => {
    const losi: unknown[] = ["Cash", "CARD", " cash", "cash ", "", "paypal", "online", null, undefined, 1, true, {}, ["cash"]];
    for (const payment of losi) {
      const { deps, pozivi } = zavisnosti({ kolacici: { [MENU_GUEST_SESSION_COOKIE]: await sesijskiKolacic() } });
      expect(await requestBillAction(SLUG, payment, deps), String(payment)).toEqual(NEISPRAVAN_UNOS);
      expect(pozivi, String(payment)).toEqual([]);
    }
  });

  test("a good payment without a session is no session; a failing Convex is a network answer", async () => {
    const bez = zavisnosti();
    expect(await requestBillAction(SLUG, "cash", bez.deps)).toEqual(NEMA_SESIJE);
    expect(bez.pozivi).toEqual([]);

    const { deps, greske } = zavisnosti({
      kolacici: { [MENU_GUEST_SESSION_COOKIE]: await sesijskiKolacic() },
      convex: {
        requestBill: async () => {
          throw new Error("convex je nedostupan");
        },
      },
    });
    expect(await requestBillAction(SLUG, "card", deps)).toEqual({ ok: false, code: "network" });
    expect(greske).toHaveLength(1);
  });

  test("the way of paying the bill carries comes back as Convex answered (an open cash bill stays cash)", async () => {
    const otvoren: GuestActionResult = { ...OK, deduped: true, paymentPreference: "cash" };
    const { deps } = zavisnosti({
      kolacici: { [MENU_GUEST_SESSION_COOKIE]: await sesijskiKolacic() },
      convex: { requestBill: async () => otvoren },
    });
    const odgovor = await requestBillAction(SLUG, "card", deps);
    expect(odgovor).toEqual(otvoren);
    expect(odgovor).toMatchObject({ ok: true, deduped: true, paymentPreference: "cash" });
  });
});

describe("submitOrderAction", () => {
  test("malformed input is invalid input and Convex is not asked, session or not", async () => {
    const dobraLinija = { ...LINIJA };
    const bezPolja = (polje: keyof typeof LINIJA) => {
      const kopija: Record<string, unknown> = { ...LINIJA };
      delete kopija[polje];
      return kopija;
    };
    const loseNarudzbine: Record<string, unknown> = {
      "not an object (null)": null,
      "not an object (string)": "porudzbina",
      "not an object (number)": 42,
      "undefined": undefined,
      "an array": [PORUDZBINA],
      "no channel": { lines: [dobraLinija], seenTotalRsd: 1_200 },
      "unknown channel": { ...PORUDZBINA, channel: "delivery" },
      "channel with another case": { ...PORUDZBINA, channel: "Standard" },
      "lines is not an array": { ...PORUDZBINA, lines: "ar_probni" },
      "lines is an object": { ...PORUDZBINA, lines: { 0: dobraLinija } },
      "too many lines": { ...PORUDZBINA, lines: Array.from({ length: 101 }, () => dobraLinija) },
      "a null line": { ...PORUDZBINA, lines: [null] },
      "a string line": { ...PORUDZBINA, lines: ["ar_probni"] },
      "articleKey is not a string": { ...PORUDZBINA, lines: [{ ...LINIJA, articleKey: 123 }] },
      "no articleKey": { ...PORUDZBINA, lines: [bezPolja("articleKey")] },
      "quantity is a string": { ...PORUDZBINA, lines: [{ ...LINIJA, quantity: "2" }] },
      "addonKeys is not an array": { ...PORUDZBINA, lines: [{ ...LINIJA, addonKeys: "ao_1" }] },
      "an add-on key is a number": { ...PORUDZBINA, lines: [{ ...LINIJA, addonKeys: ["ao_1", 2] }] },
      "pageKey is a number": { ...PORUDZBINA, lines: [{ ...LINIJA, pageKey: 7 }] },
      "pageKey is missing": { ...PORUDZBINA, lines: [bezPolja("pageKey")] },
      "variantKey is a number": { ...PORUDZBINA, lines: [{ ...LINIJA, variantKey: 7 }] },
      "note is a number": { ...PORUDZBINA, lines: [{ ...LINIJA, note: 7 }] },
      "seenTotalRsd is a string": { ...PORUDZBINA, seenTotalRsd: "1200" },
      "no seenTotalRsd": { channel: "standard", lines: [dobraLinija] },
    };
    for (const [opis, unos] of Object.entries(loseNarudzbine)) {
      const sa = zavisnosti({ kolacici: { [MENU_GUEST_SESSION_COOKIE]: await sesijskiKolacic() } });
      expect(await submitOrderAction(SLUG, unos, sa.deps), opis).toEqual(NEISPRAVAN_UNOS);
      expect(sa.pozivi, opis).toEqual([]);
      const bez = zavisnosti();
      expect(await submitOrderAction(SLUG, unos, bez.deps), `${opis} (no session)`).toEqual(NEISPRAVAN_UNOS);
      expect(bez.pozivi, `${opis} (no session)`).toEqual([]);
    }
  });

  test("a good order without a session is no session", async () => {
    const { deps, pozivi } = zavisnosti();
    expect(await submitOrderAction(SLUG, PORUDZBINA, deps)).toEqual(NEMA_SESIJE);
    expect(pozivi).toEqual([]);
  });

  test("only the fields Convex expects travel on: nothing the phone added rides along", async () => {
    const { deps, pozivi } = zavisnosti({ kolacici: { [MENU_GUEST_SESSION_COOKIE]: await sesijskiKolacic() } });
    const sPrtljagom = {
      channel: "room_service",
      seenTotalRsd: 1_500,
      guestToken: "zlonamerni-token",
      ipHash: "00000000",
      slug: DRUGI_SLUG,
      lines: [
        {
          pageKey: null,
          articleKey: "ar_probni",
          variantKey: "va_mala",
          addonKeys: ["ao_1"],
          quantity: 3,
          note: null,
          name: "Izmišljen naziv",
          pieceRsd: 1,
          id: "ar_probni|izmisljeno",
          totalRsd: 0,
        },
        { ...LINIJA, pageKey: null, price: 0, note: "bez soli" },
      ],
    };

    expect(await submitOrderAction(SLUG, sPrtljagom, deps)).toEqual(OK);

    expect(pozivi).toHaveLength(1);
    expect(pozivi[0].metod).toBe("submitOrder");
    expect(pozivi[0].args).toStrictEqual({
      slug: SLUG,
      guestToken: GUEST,
      ipHash: IP_HASH,
      channel: "room_service",
      lines: [
        { pageKey: null, articleKey: "ar_probni", variantKey: "va_mala", addonKeys: ["ao_1"], quantity: 3, note: null },
        { pageKey: null, articleKey: "ar_probni", variantKey: null, addonKeys: ["ao_1", "ao_2"], quantity: 2, note: "bez soli" },
      ],
      seenTotalRsd: 1_500,
    });
  });

  test("the add-on keys are copied, so a later change of the input cannot reach what was sent", async () => {
    const { deps, pozivi } = zavisnosti({ kolacici: { [MENU_GUEST_SESSION_COOKIE]: await sesijskiKolacic() } });
    const unos = { ...PORUDZBINA, lines: [{ ...LINIJA, addonKeys: ["ao_1"] }] };
    await submitOrderAction(SLUG, unos, deps);
    const poslato = pozivi[0].args as { lines: { addonKeys: string[] }[] };
    expect(poslato.lines[0].addonKeys).toEqual(["ao_1"]);
    expect(poslato.lines[0].addonKeys).not.toBe(unos.lines[0].addonKeys);
  });

  test("exactly 100 lines still pass this cheap shape check (Convex re-checks the real limits)", async () => {
    const { deps, pozivi } = zavisnosti({ kolacici: { [MENU_GUEST_SESSION_COOKIE]: await sesijskiKolacic() } });
    const unos = { ...PORUDZBINA, lines: Array.from({ length: 100 }, () => LINIJA) };
    expect(await submitOrderAction(SLUG, unos, deps)).toEqual(OK);
    expect(pozivi).toHaveLength(1);
  });

  test("a failing Convex is a network answer, and onError hears about it", async () => {
    const { deps, greske } = zavisnosti({
      kolacici: { [MENU_GUEST_SESSION_COOKIE]: await sesijskiKolacic() },
      convex: {
        submitOrder: async () => {
          throw new Error("convex je nedostupan");
        },
      },
    });
    expect(await submitOrderAction(SLUG, PORUDZBINA, deps)).toEqual({ ok: false, code: "network" });
    expect(greske).toHaveLength(1);
    expect((greske[0] as Error).message).toBe("convex je nedostupan");
  });

  test("the send key (clientRequestId) is forwarded to Convex as it is", async () => {
    const { deps, pozivi } = zavisnosti({ kolacici: { [MENU_GUEST_SESSION_COOKIE]: await sesijskiKolacic() } });
    const kljuc = "AbC_def-12345678";
    expect(await submitOrderAction(SLUG, { ...PORUDZBINA, clientRequestId: kljuc }, deps)).toEqual(OK);
    expect(pozivi).toHaveLength(1);
    expect(pozivi[0].args).toStrictEqual({
      slug: SLUG,
      guestToken: GUEST,
      ipHash: IP_HASH,
      channel: "standard",
      lines: [{ pageKey: "pg_glavni", articleKey: "ar_probni", variantKey: null, addonKeys: ["ao_1", "ao_2"], quantity: 2, note: "bez luka" }],
      seenTotalRsd: 1_200,
      clientRequestId: kljuc,
    });
  });

  test("an order without a send key (or with an undefined one) carries no clientRequestId at all", async () => {
    for (const unos of [PORUDZBINA, { ...PORUDZBINA, clientRequestId: undefined }]) {
      const { deps, pozivi } = zavisnosti({ kolacici: { [MENU_GUEST_SESSION_COOKIE]: await sesijskiKolacic() } });
      expect(await submitOrderAction(SLUG, unos, deps)).toEqual(OK);
      expect(Object.keys(pozivi[0].args as object).sort()).toEqual(["channel", "guestToken", "ipHash", "lines", "seenTotalRsd", "slug"]);
    }
  });

  test("a send key is 8 to 64 characters of letters, digits, _ and -; anything else is invalid input", async () => {
    const dobri = ["abcdefgh", "ABCDEFGH", "a1b2c3d4", "a_b-c_d-", "k".repeat(64), "AbC_def-12345678"];
    for (const kljuc of dobri) {
      const { deps, pozivi } = zavisnosti({ kolacici: { [MENU_GUEST_SESSION_COOKIE]: await sesijskiKolacic() } });
      expect(await submitOrderAction(SLUG, { ...PORUDZBINA, clientRequestId: kljuc }, deps), kljuc).toEqual(OK);
      expect((pozivi[0].args as { clientRequestId: string }).clientRequestId, kljuc).toBe(kljuc);
    }

    const losi: unknown[] = [
      "",
      "kratak",
      "abcdefg",
      "k".repeat(65),
      "k".repeat(500),
      "ima razmak 1",
      "tacka.u.kljucu",
      "kosa/crta/1234",
      "plus+znak+1234",
      "jednako=1234567",
      "žćčšđ-kljuc-12",
      "kljuc\n12345678",
      12345678,
      null,
      true,
      {},
      ["abcdefgh"],
    ];
    for (const kljuc of losi) {
      // With a session and without: the shape is checked first, so Convex is never asked.
      const sa = zavisnosti({ kolacici: { [MENU_GUEST_SESSION_COOKIE]: await sesijskiKolacic() } });
      expect(await submitOrderAction(SLUG, { ...PORUDZBINA, clientRequestId: kljuc }, sa.deps), String(kljuc)).toEqual(NEISPRAVAN_UNOS);
      expect(sa.pozivi, String(kljuc)).toEqual([]);
      const bez = zavisnosti();
      expect(await submitOrderAction(SLUG, { ...PORUDZBINA, clientRequestId: kljuc }, bez.deps), String(kljuc)).toEqual(NEISPRAVAN_UNOS);
      expect(bez.pozivi, String(kljuc)).toEqual([]);
    }
  });

  test("a refusal of Convex (new prices, unavailable articles) is passed on untouched", async () => {
    const odbijeno: GuestActionResult = {
      ok: false,
      code: REQUEST_ERROR.cartPriceChanged,
      prices: [{ index: 0, pieceRsd: 640, lineTotalRsd: 1_280 }],
      totals: { subtotalRsd: 1_280, deliveryFeeRsd: 0, totalRsd: 1_280 },
    };
    const { deps } = zavisnosti({
      kolacici: { [MENU_GUEST_SESSION_COOKIE]: await sesijskiKolacic() },
      convex: { submitOrder: async () => odbijeno },
    });
    expect(await submitOrderAction(SLUG, PORUDZBINA, deps)).toEqual(odbijeno);
  });
});

describe("cancelRequestAction", () => {
  test("it is the DEVICE cookie that cancels, not the session cookie", async () => {
    const { deps, pozivi } = zavisnosti({
      kolacici: {
        [MENU_GUEST_SESSION_COOKIE]: await sesijskiKolacic(),
        [MENU_GUEST_DEVICE_COOKIE]: await uredjajKolacic(),
      },
    });
    expect(await cancelRequestAction(SLUG, "rq_probni", deps)).toEqual({ ok: true });
    expect(pozivi).toStrictEqual([
      { metod: "cancelRequest", args: { slug: SLUG, deviceToken: DEVICE, requestId: "rq_probni", ipHash: IP_HASH } },
    ]);
    expect(JSON.stringify(pozivi)).not.toContain(GUEST);
  });

  test("a valid session without a device cookie cannot cancel", async () => {
    const { deps, pozivi } = zavisnosti({ kolacici: { [MENU_GUEST_SESSION_COOKIE]: await sesijskiKolacic() } });
    expect(await cancelRequestAction(SLUG, "rq_probni", deps)).toEqual(NEMA_SESIJE);
    expect(pozivi).toEqual([]);
  });

  test("a forged or misplaced device cookie, or no secret, cannot cancel", async () => {
    const slucajevi: Record<string, Podesavanje> = {
      "garbage": { kolacici: { [MENU_GUEST_DEVICE_COOKIE]: "garbage" } },
      "invented signature": { kolacici: { [MENU_GUEST_DEVICE_COOKIE]: `${DEVICE}.forgedforgedforgedforged` } },
      "signed with another secret": { kolacici: { [MENU_GUEST_DEVICE_COOKIE]: await uredjajKolacic(DEVICE, "another-secret") } },
      "a session cookie in the device slot": { kolacici: { [MENU_GUEST_DEVICE_COOKIE]: await sesijskiKolacic() } },
      "no secret": { kolacici: { [MENU_GUEST_DEVICE_COOKIE]: await uredjajKolacic() }, secret: null },
    };
    for (const [opis, podesavanje] of Object.entries(slucajevi)) {
      const { deps, pozivi } = zavisnosti(podesavanje);
      expect(await cancelRequestAction(SLUG, "rq_probni", deps), opis).toEqual(NEMA_SESIJE);
      expect(pozivi, opis).toEqual([]);
    }
  });

  test("a slug of the wrong shape is no session", async () => {
    const { deps, pozivi } = zavisnosti({ kolacici: { [MENU_GUEST_DEVICE_COOKIE]: await uredjajKolacic() } });
    for (const slug of ["Demo Restoran", "../demo", "", 7, null]) {
      expect(await cancelRequestAction(slug, "rq_probni", deps), String(slug)).toEqual(NEMA_SESIJE);
    }
    expect(pozivi).toEqual([]);
  });

  test("an empty, over-long or non-string request id is not found, and Convex is not asked", async () => {
    const { deps, pozivi } = zavisnosti({ kolacici: { [MENU_GUEST_DEVICE_COOKIE]: await uredjajKolacic() } });
    const losi: unknown[] = ["", "r".repeat(65), "r".repeat(500), 123, null, undefined, {}, ["rq_probni"]];
    for (const requestId of losi) {
      expect(await cancelRequestAction(SLUG, requestId, deps), String(requestId)).toEqual({
        ok: false,
        code: REQUEST_ERROR.notFound,
      });
    }
    expect(pozivi).toEqual([]);
  });

  test("a request id of exactly 64 characters is still asked about", async () => {
    const { deps, pozivi } = zavisnosti({ kolacici: { [MENU_GUEST_DEVICE_COOKIE]: await uredjajKolacic() } });
    const requestId = "r".repeat(64);
    expect(await cancelRequestAction(SLUG, requestId, deps)).toEqual({ ok: true });
    expect(pozivi).toHaveLength(1);
    expect((pozivi[0].args as { requestId: string }).requestId).toBe(requestId);
  });

  test("a refusal of Convex is passed on; anything extra in an ok answer is dropped; a throw is network", async () => {
    const kolacici = { [MENU_GUEST_DEVICE_COOKIE]: await uredjajKolacic() };
    const odbijeno = zavisnosti({
      kolacici,
      convex: { cancelRequest: async () => ({ ok: false, code: REQUEST_ERROR.notCancellable }) },
    });
    expect(await cancelRequestAction(SLUG, "rq_probni", odbijeno.deps)).toEqual({
      ok: false,
      code: REQUEST_ERROR.notCancellable,
    });

    const sa = zavisnosti({
      kolacici,
      convex: { cancelRequest: async () => ({ ok: true, interno: "ne za telefon" }) as { ok: true } },
    });
    expect(await cancelRequestAction(SLUG, "rq_probni", sa.deps)).toStrictEqual({ ok: true });

    const pad = zavisnosti({
      kolacici,
      convex: {
        cancelRequest: async () => {
          throw new Error("convex je nedostupan");
        },
      },
    });
    expect(await cancelRequestAction(SLUG, "rq_probni", pad.deps)).toEqual({ ok: false, code: "network" });
    // The route logs it; the guest never sees the error itself.
    expect(pad.greske).toHaveLength(1);
    expect((pad.greske[0] as Error).message).toBe("convex je nedostupan");
    expect(odbijeno.greske).toEqual([]);
  });
});

describe("the tokens behind the cookies", () => {
  test("myRequestsKeyOf is the venue-scoped hash of the device token", async () => {
    const { deps } = zavisnosti({ kolacici: { [MENU_GUEST_DEVICE_COOKIE]: await uredjajKolacic() } });
    const kljuc = await myRequestsKeyOf(deps, "svc_probni");
    expect(kljuc).toBe(await deviceKeyHashFor("svc_probni", DEVICE));
    expect(kljuc).toMatch(/^[0-9a-f]{64}$/);
    // Scoped to the venue; and it is not the token itself.
    expect(await myRequestsKeyOf(deps, "svc_drugi")).not.toBe(kljuc);
    expect(kljuc).not.toContain(DEVICE);
  });

  test("myRequestsKeyOf is null without a valid device cookie", async () => {
    const slucajevi: Record<string, Podesavanje> = {
      "no cookie": {},
      "garbage": { kolacici: { [MENU_GUEST_DEVICE_COOKIE]: "garbage" } },
      "invented signature": { kolacici: { [MENU_GUEST_DEVICE_COOKIE]: `${DEVICE}.forgedforgedforgedforged` } },
      "another secret": { kolacici: { [MENU_GUEST_DEVICE_COOKIE]: await uredjajKolacic(DEVICE, "another-secret") } },
      "only a session cookie": { kolacici: { [MENU_GUEST_SESSION_COOKIE]: await sesijskiKolacic() } },
      "a session cookie in the device slot": { kolacici: { [MENU_GUEST_DEVICE_COOKIE]: await sesijskiKolacic() } },
      "no secret": { kolacici: { [MENU_GUEST_DEVICE_COOKIE]: await uredjajKolacic() }, secret: null },
    };
    for (const [opis, podesavanje] of Object.entries(slucajevi)) {
      expect(await myRequestsKeyOf(zavisnosti(podesavanje).deps, "svc_probni"), opis).toBeNull();
    }
  });

  test("guestTokenOf never returns a token for another venue's context", async () => {
    const { deps } = zavisnosti({ kolacici: { [MENU_GUEST_SESSION_COOKIE]: await sesijskiKolacic(SLUG) } });
    expect(await guestTokenOf(deps, SLUG)).toBe(GUEST);
    expect(await guestTokenOf(deps, DRUGI_SLUG)).toBeNull();
    expect(await guestTokenOf(deps, "demo")).toBeNull();
    expect(await guestTokenOf(deps, `${SLUG}-2`)).toBeNull();
  });

  test("guestTokenOf reads only the session cookie, deviceTokenOf only the device cookie", async () => {
    const sesija = await sesijskiKolacic(SLUG);
    const uredjaj = await uredjajKolacic();
    const prave = zavisnosti({ kolacici: { [MENU_GUEST_SESSION_COOKIE]: sesija, [MENU_GUEST_DEVICE_COOKIE]: uredjaj } });
    expect(await guestTokenOf(prave.deps, SLUG)).toBe(GUEST);
    expect(await deviceTokenOf(prave.deps)).toBe(DEVICE);

    // Each cookie in the other's slot is worth nothing.
    const zamenjene = zavisnosti({ kolacici: { [MENU_GUEST_SESSION_COOKIE]: uredjaj, [MENU_GUEST_DEVICE_COOKIE]: sesija } });
    expect(await guestTokenOf(zamenjene.deps, SLUG)).toBeNull();
    expect(await deviceTokenOf(zamenjene.deps)).toBeNull();
  });

  test("without a secret there is no token at all", async () => {
    const { deps } = zavisnosti({
      kolacici: {
        [MENU_GUEST_SESSION_COOKIE]: await sesijskiKolacic(SLUG),
        [MENU_GUEST_DEVICE_COOKIE]: await uredjajKolacic(),
      },
      secret: null,
    });
    expect(await guestTokenOf(deps, SLUG)).toBeNull();
    expect(await deviceTokenOf(deps)).toBeNull();
    expect(await myRequestsKeyOf(deps, "svc_probni")).toBeNull();
  });
});
