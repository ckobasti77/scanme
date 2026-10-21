// K25 — the server side of the guest's reservation form, the cancel link and
// "Moji zahtevi" (lib/menu/http/reservation.ts): real signed cookies and a fake
// Convex that records every call. What must hold: the cancel token is made
// here (256 random bits) and handed back once, the device cookie is minted and
// set on both paths when the phone has none, a table never rides along, bad
// input is refused before Convex is asked, and every Convex failure comes back
// as a value. Invented data only.

import { describe, expect, test } from "vitest";
import { RESERVATION_ERROR } from "../errors/reservations";
import {
  MENU_GUEST_DEVICE_COOKIE,
  MENU_GUEST_DEVICE_MAX_AGE_S,
  MENU_GUEST_SESSION_COOKIE,
  deviceCookieContext,
  sessionCookieContext,
  signCookieValue,
  verifyCookieValue,
} from "../signed-cookie";
import { isMenuToken } from "../tokens";
import {
  cancelReservationByDeviceAction,
  cancelReservationByTokenAction,
  reservationLinkPath,
  submitReservationAction,
  type ReservationActionDeps,
} from "./reservation";

const SECRET = "test-secret-k25";
const SLUG = "demo-restoran";
const IP_HASH = "a1b2c3d4e5f60718";
const DEVICE = "d".repeat(43);
const NEW_DEVICE = "n".repeat(43);
const CANCEL = "c".repeat(43);
const REQUESTED_AT = Date.UTC(2026, 9, 24, 18, 0);

const UNOS = {
  clientRequestId: "AbC_def-12345678",
  guestName: "Mira Probić",
  partySize: 4,
  requestedAt: REQUESTED_AT,
  contactEmail: "mira@example.com",
  contactPhone: "+381 64 123 4567",
  note: "Kod prozora",
};

type Convex = ReservationActionDeps["convex"];
type SubmitArgs = Parameters<Convex["submit"]>[0];

const SUBMIT_OK = { ok: true as const, reservationId: "rez_probna", requestedAt: REQUESTED_AT, partySize: 4, deduped: false };

/** A Convex that answers ok and remembers what it was asked; `over` replaces methods. */
function lazniConvex(over: Partial<Convex> = {}) {
  const pozivi = { submit: [] as SubmitArgs[], cancelByToken: [] as unknown[], cancelByDevice: [] as unknown[] };
  const convex: Convex = {
    async submit(args) {
      pozivi.submit.push(args);
      return SUBMIT_OK;
    },
    async cancelByToken(args) {
      pozivi.cancelByToken.push(args);
      return { ok: true };
    },
    async cancelByDevice(args) {
      pozivi.cancelByDevice.push(args);
      return { ok: true };
    },
    ...over,
  };
  return { convex, pozivi };
}

type Podesavanje = {
  kolacici?: Record<string, string | undefined>;
  /** null = the guest's cookies cannot be trusted, the form is off. */
  secret?: string | null;
  convex?: Partial<Convex>;
  /** The tokens `newToken` hands out, in order (device token first, when one is minted). */
  tokeni?: string[];
};

type PostavljenKolacic = { name: string; value: string; path: string; maxAgeS: number };

function zavisnosti(podesavanje: Podesavanje = {}) {
  const { convex, pozivi } = lazniConvex(podesavanje.convex);
  const kolacici = podesavanje.kolacici ?? {};
  const postavljeni: PostavljenKolacic[] = [];
  const greske: unknown[] = [];
  const red = podesavanje.tokeni ? [...podesavanje.tokeni] : null;
  const deps: ReservationActionDeps = {
    cookie: (name) => kolacici[name],
    setCookie: (name, value, options) => {
      postavljeni.push({ name, value, path: options.path, maxAgeS: options.maxAgeS });
    },
    secret: podesavanje.secret === undefined ? SECRET : podesavanje.secret,
    ipHash: IP_HASH,
    onError: (error) => {
      greske.push(error);
    },
    convex,
    ...(red
      ? {
          newToken: () => {
            const token = red.shift();
            if (!token) throw new Error("no more test tokens");
            return token;
          },
        }
      : {}),
  };
  return { deps, pozivi, postavljeni, greske };
}

const uredjajKolacic = (token = DEVICE, secret = SECRET) => signCookieValue(token, secret, deviceCookieContext());
const sesijskiKolacic = (slug = SLUG, token = "g".repeat(43), secret = SECRET) =>
  signCookieValue(token, secret, sessionCookieContext(slug));

const OFF = { ok: false, code: RESERVATION_ERROR.off };
const NEISPRAVAN_UNOS = { ok: false, code: RESERVATION_ERROR.invalidInput };
const NIJE_NADJENO = { ok: false, code: RESERVATION_ERROR.notFound };
const MREZA = { ok: false, code: "network" };

describe("submitReservationAction: when the form is off", () => {
  test("a slug of the wrong shape is off, and nothing is asked or set", async () => {
    const losi: unknown[] = ["Demo Restoran", "DEMO", "../demo", "demo/restoran", "-demo", "demo--restoran", "", "a".repeat(81), 42, null, undefined, {}];
    for (const slug of losi) {
      const { deps, pozivi, postavljeni } = zavisnosti();
      expect(await submitReservationAction(slug, UNOS, deps), String(slug)).toEqual(OFF);
      expect(pozivi.submit, String(slug)).toEqual([]);
      expect(postavljeni, String(slug)).toEqual([]);
    }
  });

  test("without SCANME_GUEST_SECRET the form is off, even with a perfect request and cookie", async () => {
    const kolacic = await uredjajKolacic();
    for (const secret of [null, ""]) {
      const { deps, pozivi, postavljeni } = zavisnosti({ secret, kolacici: { [MENU_GUEST_DEVICE_COOKIE]: kolacic } });
      expect(await submitReservationAction(SLUG, UNOS, deps), String(secret)).toEqual(OFF);
      expect(pozivi.submit).toEqual([]);
      expect(postavljeni).toEqual([]);
    }
  });

  test("off comes before the input check: a bad slug with bad input is still off", async () => {
    const { deps } = zavisnosti();
    expect(await submitReservationAction("Neispravan Slug", "nije unos", deps)).toEqual(OFF);
  });
});

describe("submitReservationAction: malformed input", () => {
  const bezPolja = (polje: keyof typeof UNOS) => {
    const kopija: Record<string, unknown> = { ...UNOS };
    delete kopija[polje];
    return kopija;
  };

  const LOSI: Record<string, unknown> = {
    "null": null,
    "undefined": undefined,
    "a string": "rezervacija",
    "a number": 42,
    "an array": [UNOS],
    "no clientRequestId": bezPolja("clientRequestId"),
    "clientRequestId too short": { ...UNOS, clientRequestId: "abcdefg" },
    "clientRequestId too long": { ...UNOS, clientRequestId: "k".repeat(65) },
    "clientRequestId with a space": { ...UNOS, clientRequestId: "ima razmak 1" },
    "clientRequestId with a dot": { ...UNOS, clientRequestId: "tacka.u.kljucu" },
    "clientRequestId with a letter outside ASCII": { ...UNOS, clientRequestId: "žćčšđ-kljuc-12" },
    "clientRequestId is a number": { ...UNOS, clientRequestId: 12345678 },
    "no guestName": bezPolja("guestName"),
    "guestName is a number": { ...UNOS, guestName: 7 },
    "guestName is over 2000 characters": { ...UNOS, guestName: "m".repeat(2_001) },
    "no partySize": bezPolja("partySize"),
    "partySize is text": { ...UNOS, partySize: "4" },
    "partySize is NaN": { ...UNOS, partySize: Number.NaN },
    "partySize is infinite": { ...UNOS, partySize: Number.POSITIVE_INFINITY },
    "no requestedAt": bezPolja("requestedAt"),
    "requestedAt is text": { ...UNOS, requestedAt: String(REQUESTED_AT) },
    "requestedAt is NaN": { ...UNOS, requestedAt: Number.NaN },
    "requestedAt is infinite": { ...UNOS, requestedAt: Number.POSITIVE_INFINITY },
    "contactEmail is a number": { ...UNOS, contactEmail: 5 },
    "contactEmail is over 2000 characters": { ...UNOS, contactEmail: "e".repeat(2_001) },
    "contactPhone is an object": { ...UNOS, contactPhone: {} },
    "contactPhone is over 2000 characters": { ...UNOS, contactPhone: "1".repeat(2_001) },
    "note is a number": { ...UNOS, note: 5 },
    "note is over 2000 characters": { ...UNOS, note: "n".repeat(2_001) },
  };

  test("is invalid input, and neither Convex nor the cookie jar is touched", async () => {
    for (const [opis, unos] of Object.entries(LOSI)) {
      const bez = zavisnosti();
      expect(await submitReservationAction(SLUG, unos, bez.deps), opis).toEqual(NEISPRAVAN_UNOS);
      expect(bez.pozivi.submit, opis).toEqual([]);
      expect(bez.postavljeni, opis).toEqual([]);
      expect(bez.greske, opis).toEqual([]);

      const sa = zavisnosti({ kolacici: { [MENU_GUEST_DEVICE_COOKIE]: await uredjajKolacic() } });
      expect(await submitReservationAction(SLUG, unos, sa.deps), `${opis} (with a device)`).toEqual(NEISPRAVAN_UNOS);
      expect(sa.pozivi.submit, `${opis} (with a device)`).toEqual([]);
    }
  });

  test("exactly 2000 characters still pass this cheap shape check (Convex re-checks the real limits)", async () => {
    const { deps, pozivi } = zavisnosti({ tokeni: [NEW_DEVICE, CANCEL] });
    const odgovor = await submitReservationAction(SLUG, { ...UNOS, guestName: "m".repeat(2_000), note: "n".repeat(2_000) }, deps);
    expect(odgovor.ok).toBe(true);
    expect(pozivi.submit).toHaveLength(1);
  });

  test("a send key is 8 to 64 characters of letters, digits, _ and -", async () => {
    for (const clientRequestId of ["abcdefgh", "ABCDEFGH", "a_b-c_d-", "k".repeat(64), "AbC_def-12345678"]) {
      const { deps, pozivi } = zavisnosti({ tokeni: [NEW_DEVICE, CANCEL] });
      expect((await submitReservationAction(SLUG, { ...UNOS, clientRequestId }, deps)).ok, clientRequestId).toBe(true);
      expect(pozivi.submit[0].clientRequestId, clientRequestId).toBe(clientRequestId);
    }
  });

  test("the contact fields and the note are optional", async () => {
    const { deps, pozivi } = zavisnosti({ tokeni: [NEW_DEVICE, CANCEL] });
    const minimalno = { clientRequestId: UNOS.clientRequestId, guestName: "Mira", partySize: 2, requestedAt: REQUESTED_AT };
    expect((await submitReservationAction(SLUG, minimalno, deps)).ok).toBe(true);
    expect(Object.keys(pozivi.submit[0]).sort()).toEqual([
      "cancelToken",
      "clientRequestId",
      "deviceToken",
      "guestName",
      "ipHash",
      "partySize",
      "requestedAt",
      "slug",
    ]);
  });
});

describe("submitReservationAction: what travels to Convex", () => {
  test("only the fields Convex expects: a table the phone adds (positionId) is never forwarded", async () => {
    const { deps, pozivi } = zavisnosti({
      kolacici: { [MENU_GUEST_DEVICE_COOKIE]: await uredjajKolacic() },
      tokeni: [CANCEL],
    });
    const sPrtljagom = {
      ...UNOS,
      positionId: "pos_stol_7",
      deviceToken: "zlonamerni-uredjaj",
      cancelToken: "zlonamerni-token",
      ipHash: "00000000",
      slug: "drugi-lokal",
      status: "accepted",
      reservationId: "rez_tudja",
    };

    expect((await submitReservationAction(SLUG, sPrtljagom, deps)).ok).toBe(true);

    expect(pozivi.submit).toHaveLength(1);
    const poslato = pozivi.submit[0];
    expect("positionId" in poslato).toBe(false);
    expect(poslato).toStrictEqual({
      slug: SLUG,
      deviceToken: DEVICE,
      clientRequestId: UNOS.clientRequestId,
      cancelToken: CANCEL,
      guestName: UNOS.guestName,
      partySize: 4,
      requestedAt: REQUESTED_AT,
      contactEmail: UNOS.contactEmail,
      contactPhone: UNOS.contactPhone,
      note: UNOS.note,
      ipHash: IP_HASH,
    });
  });

  test("the ip hash is the route's, never one the phone sent", async () => {
    const { deps, pozivi } = zavisnosti({ tokeni: [NEW_DEVICE, CANCEL] });
    await submitReservationAction(SLUG, { ...UNOS, ipHash: "lazni" }, deps);
    expect(pozivi.submit[0].ipHash).toBe(IP_HASH);
  });

  test("an undefined optional field is left out altogether, not sent as undefined", async () => {
    const { deps, pozivi } = zavisnosti({ tokeni: [NEW_DEVICE, CANCEL] });
    await submitReservationAction(SLUG, { ...UNOS, contactPhone: undefined, note: undefined }, deps);
    expect(Object.keys(pozivi.submit[0])).not.toContain("contactPhone");
    expect(Object.keys(pozivi.submit[0])).not.toContain("note");
    expect(pozivi.submit[0].contactEmail).toBe(UNOS.contactEmail);
  });

  test("Convex never sees the raw cookie or its signature", async () => {
    const kolacic = await uredjajKolacic();
    const { deps, pozivi } = zavisnosti({ kolacici: { [MENU_GUEST_DEVICE_COOKIE]: kolacic }, tokeni: [CANCEL] });
    await submitReservationAction(SLUG, UNOS, deps);
    const poslato = JSON.stringify(pozivi.submit);
    expect(poslato).not.toContain(kolacic);
    expect(poslato).not.toContain(kolacic.slice(DEVICE.length + 1));
  });
});

describe("submitReservationAction: the device cookie", () => {
  test("without one a new device token is minted and set on both paths for 180 days", async () => {
    const { deps, pozivi, postavljeni } = zavisnosti();

    const odgovor = await submitReservationAction(SLUG, UNOS, deps);
    expect(odgovor.ok).toBe(true);

    expect(pozivi.submit).toHaveLength(1);
    const poslato = pozivi.submit[0];
    expect(isMenuToken(poslato.deviceToken)).toBe(true);
    expect(postavljeni).toHaveLength(2);
    expect(postavljeni.map((kolacic) => kolacic.path)).toEqual(["/demo-restoran/meni", "/r"]);
    for (const kolacic of postavljeni) {
      expect(kolacic.name).toBe(MENU_GUEST_DEVICE_COOKIE);
      expect(kolacic.name).toBe("smm_d");
      expect(kolacic.maxAgeS).toBe(MENU_GUEST_DEVICE_MAX_AGE_S);
      expect(kolacic.maxAgeS).toBe(180 * 24 * 60 * 60);
      // The cookie value is the token signed for the device context, and it verifies.
      expect(await verifyCookieValue(kolacic.value, SECRET, deviceCookieContext())).toBe(poslato.deviceToken);
    }
    expect(postavljeni[0].value).toBe(postavljeni[1].value);
  });

  test("the minted cookie is worth nothing under another secret or in another cookie's slot", async () => {
    const { deps, postavljeni } = zavisnosti();
    await submitReservationAction(SLUG, UNOS, deps);
    const vrednost = postavljeni[0].value;
    expect(await verifyCookieValue(vrednost, "another-secret", deviceCookieContext())).toBeNull();
    expect(await verifyCookieValue(vrednost, SECRET, sessionCookieContext(SLUG))).toBeNull();
  });

  test("the device token and the cancel token are different tokens", async () => {
    const { deps, pozivi } = zavisnosti();
    await submitReservationAction(SLUG, UNOS, deps);
    expect(pozivi.submit[0].deviceToken).not.toBe(pozivi.submit[0].cancelToken);
  });

  test("a minted token is the one newToken gave, and the next one is the cancel token", async () => {
    const { deps, pozivi, postavljeni } = zavisnosti({ tokeni: [NEW_DEVICE, CANCEL] });
    await submitReservationAction(SLUG, UNOS, deps);
    expect(pozivi.submit[0].deviceToken).toBe(NEW_DEVICE);
    expect(pozivi.submit[0].cancelToken).toBe(CANCEL);
    expect(await verifyCookieValue(postavljeni[0].value, SECRET, deviceCookieContext())).toBe(NEW_DEVICE);
  });

  test("with a valid device cookie it is reused and no cookie is set", async () => {
    const { deps, pozivi, postavljeni } = zavisnosti({
      kolacici: { [MENU_GUEST_DEVICE_COOKIE]: await uredjajKolacic() },
      tokeni: [CANCEL],
    });
    expect((await submitReservationAction(SLUG, UNOS, deps)).ok).toBe(true);
    expect(pozivi.submit[0].deviceToken).toBe(DEVICE);
    expect(postavljeni).toEqual([]);
  });

  test("a forged, foreign or misplaced device cookie counts as none: a new one is minted", async () => {
    const slucajevi: Record<string, string> = {
      "garbage": "garbage",
      "invented signature": `${DEVICE}.forgedforgedforgedforged`,
      "signed with another secret": await uredjajKolacic(DEVICE, "another-secret"),
      "a session cookie in the device slot": await sesijskiKolacic(),
    };
    for (const [opis, kolacic] of Object.entries(slucajevi)) {
      const { deps, pozivi, postavljeni } = zavisnosti({ kolacici: { [MENU_GUEST_DEVICE_COOKIE]: kolacic }, tokeni: [NEW_DEVICE, CANCEL] });
      expect((await submitReservationAction(SLUG, UNOS, deps)).ok, opis).toBe(true);
      expect(pozivi.submit[0].deviceToken, opis).toBe(NEW_DEVICE);
      expect(postavljeni, opis).toHaveLength(2);
    }
  });

  test("a second send from the same phone keeps the device and gets a new cancel link", async () => {
    const prvi = zavisnosti();
    const odgovor1 = await submitReservationAction(SLUG, UNOS, prvi.deps);
    // The phone now has the cookie the first send set.
    const kolacic = prvi.postavljeni[0].value;
    const drugi = zavisnosti({ kolacici: { [MENU_GUEST_DEVICE_COOKIE]: kolacic } });
    const odgovor2 = await submitReservationAction(SLUG, UNOS, drugi.deps);
    if (!odgovor1.ok || !odgovor2.ok) throw new Error("expected both sends to be ok");

    expect(drugi.pozivi.submit[0].deviceToken).toBe(prvi.pozivi.submit[0].deviceToken);
    expect(drugi.postavljeni).toEqual([]);
    expect(odgovor2.cancelToken).not.toBe(odgovor1.cancelToken);
  });
});

describe("submitReservationAction: the answer", () => {
  test("the cancel token handed back is the one sent to Convex: 43 characters, shown once", async () => {
    const { deps, pozivi } = zavisnosti();
    const odgovor = await submitReservationAction(SLUG, UNOS, deps);
    if (!odgovor.ok) throw new Error("expected ok");
    expect(odgovor.cancelToken).toBe(pozivi.submit[0].cancelToken);
    expect(odgovor.cancelToken).toHaveLength(43);
    expect(isMenuToken(odgovor.cancelToken)).toBe(true);
  });

  test("an ok answer carries exactly the cancel token and what Convex confirmed", async () => {
    const { deps } = zavisnosti({
      tokeni: [NEW_DEVICE, CANCEL],
      convex: {
        submit: async () => ({ ...SUBMIT_OK, deduped: true, interno: "ne za telefon" }) as typeof SUBMIT_OK,
      },
    });
    expect(await submitReservationAction(SLUG, UNOS, deps)).toStrictEqual({
      ok: true,
      cancelToken: CANCEL,
      reservationId: "rez_probna",
      requestedAt: REQUESTED_AT,
      partySize: 4,
      deduped: true,
    });
  });

  test("a refusal of Convex passes its code and field errors on", async () => {
    const odbijeno = {
      ok: false as const,
      code: RESERVATION_ERROR.invalidInput,
      fieldErrors: { guestName: "required" as const, partySize: "range" as const },
    };
    const { deps, greske } = zavisnosti({ convex: { submit: async () => odbijeno } });
    expect(await submitReservationAction(SLUG, UNOS, deps)).toStrictEqual({
      ok: false,
      code: "reservation/invalid_input",
      fieldErrors: { guestName: "required", partySize: "range" },
    });
    // An answer of "no" is an answer, not a failure.
    expect(greske).toEqual([]);
  });

  test("a refusal without field errors has no fieldErrors key at all", async () => {
    for (const code of [
      RESERVATION_ERROR.outsideHours,
      RESERVATION_ERROR.inPast,
      RESERVATION_ERROR.tooFar,
      RESERVATION_ERROR.rateLimited,
      RESERVATION_ERROR.tooManyOpen,
      RESERVATION_ERROR.hoursMissing,
      RESERVATION_ERROR.off,
    ]) {
      const { deps } = zavisnosti({ convex: { submit: async () => ({ ok: false as const, code }) } });
      expect(await submitReservationAction(SLUG, UNOS, deps), code).toStrictEqual({ ok: false, code });
    }
  });

  test("a failing Convex is a network answer, and onError hears about it", async () => {
    const { deps, greske } = zavisnosti({
      convex: {
        submit: async () => {
          throw new Error("convex je nedostupan");
        },
      },
    });
    expect(await submitReservationAction(SLUG, UNOS, deps)).toEqual(MREZA);
    expect(greske).toHaveLength(1);
    expect((greske[0] as Error).message).toBe("convex je nedostupan");
  });

  test("without an onError the failure is still a network answer", async () => {
    const { deps } = zavisnosti({
      convex: {
        submit: async () => {
          throw new Error("convex je nedostupan");
        },
      },
    });
    const bezOnError: ReservationActionDeps = { ...deps, onError: undefined };
    await expect(submitReservationAction(SLUG, UNOS, bezOnError)).resolves.toEqual(MREZA);
  });
});

describe("cancelReservationByTokenAction", () => {
  test("a good token reaches Convex with the slug, the token and the ip hash", async () => {
    const { deps, pozivi } = zavisnosti();
    expect(await cancelReservationByTokenAction(SLUG, CANCEL, deps)).toStrictEqual({ ok: true });
    expect(pozivi.cancelByToken).toStrictEqual([{ slug: SLUG, token: CANCEL, ipHash: IP_HASH }]);
  });

  test("no cookie is needed: the link is the proof", async () => {
    const { deps, pozivi } = zavisnosti({ kolacici: {} });
    expect(await cancelReservationByTokenAction(SLUG, CANCEL, deps)).toEqual({ ok: true });
    expect(pozivi.cancelByToken).toHaveLength(1);
  });

  test("a token of the wrong shape is not found, and Convex is not asked", async () => {
    const losi: unknown[] = [
      "",
      "c".repeat(42),
      "c".repeat(44),
      `${"c".repeat(42)}+`,
      `${"c".repeat(42)}.`,
      `${"c".repeat(42)} `,
      `${"c".repeat(41)}ž`,
      undefined,
      null,
      42,
      {},
      [CANCEL],
    ];
    for (const token of losi) {
      const { deps, pozivi, greske } = zavisnosti();
      expect(await cancelReservationByTokenAction(SLUG, token, deps), String(token)).toEqual(NIJE_NADJENO);
      expect(pozivi.cancelByToken, String(token)).toEqual([]);
      expect(greske).toEqual([]);
    }
  });

  test("a slug of the wrong shape is not found, and Convex is not asked", async () => {
    for (const slug of ["Demo Restoran", "../demo", "", "a".repeat(81), 7, null, undefined]) {
      const { deps, pozivi } = zavisnosti();
      expect(await cancelReservationByTokenAction(slug, CANCEL, deps), String(slug)).toEqual(NIJE_NADJENO);
      expect(pozivi.cancelByToken).toEqual([]);
    }
  });

  test("a refusal of Convex is passed on; anything extra in an ok answer is dropped; a throw is network", async () => {
    const odbijeno = zavisnosti({
      convex: { cancelByToken: async () => ({ ok: false, code: RESERVATION_ERROR.notCancellable }) },
    });
    expect(await cancelReservationByTokenAction(SLUG, CANCEL, odbijeno.deps)).toStrictEqual({
      ok: false,
      code: "reservation/not_cancellable",
    });
    expect(odbijeno.greske).toEqual([]);

    const sa = zavisnosti({ convex: { cancelByToken: async () => ({ ok: true, interno: "ne za telefon" }) as { ok: true } } });
    expect(await cancelReservationByTokenAction(SLUG, CANCEL, sa.deps)).toStrictEqual({ ok: true });

    const pad = zavisnosti({
      convex: {
        cancelByToken: async () => {
          throw new Error("convex je nedostupan");
        },
      },
    });
    expect(await cancelReservationByTokenAction(SLUG, CANCEL, pad.deps)).toEqual(MREZA);
    expect(pad.greske).toHaveLength(1);
    expect((pad.greske[0] as Error).message).toBe("convex je nedostupan");
  });
});

describe("cancelReservationByDeviceAction", () => {
  const kolacici = async () => ({ [MENU_GUEST_DEVICE_COOKIE]: await uredjajKolacic() });

  test("the verified device token, not the cookie, reaches Convex", async () => {
    const kolacic = await uredjajKolacic();
    const { deps, pozivi } = zavisnosti({ kolacici: { [MENU_GUEST_DEVICE_COOKIE]: kolacic } });
    expect(await cancelReservationByDeviceAction(SLUG, "rez_probna", deps)).toStrictEqual({ ok: true });
    expect(pozivi.cancelByDevice).toStrictEqual([{ slug: SLUG, deviceToken: DEVICE, reservationId: "rez_probna", ipHash: IP_HASH }]);
    expect(JSON.stringify(pozivi.cancelByDevice)).not.toContain(kolacic);
  });

  test("without a device cookie it is not found, and Convex is not asked", async () => {
    const { deps, pozivi } = zavisnosti();
    expect(await cancelReservationByDeviceAction(SLUG, "rez_probna", deps)).toEqual(NIJE_NADJENO);
    expect(pozivi.cancelByDevice).toEqual([]);
  });

  test("a session cookie alone cannot cancel", async () => {
    const { deps, pozivi } = zavisnosti({ kolacici: { [MENU_GUEST_SESSION_COOKIE]: await sesijskiKolacic() } });
    expect(await cancelReservationByDeviceAction(SLUG, "rez_probna", deps)).toEqual(NIJE_NADJENO);
    expect(pozivi.cancelByDevice).toEqual([]);
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
      expect(await cancelReservationByDeviceAction(SLUG, "rez_probna", deps), opis).toEqual(NIJE_NADJENO);
      expect(pozivi.cancelByDevice, opis).toEqual([]);
    }
  });

  test("a slug of the wrong shape is not found", async () => {
    const { deps, pozivi } = zavisnosti({ kolacici: await kolacici() });
    for (const slug of ["Demo Restoran", "../demo", "", 7, null]) {
      expect(await cancelReservationByDeviceAction(slug, "rez_probna", deps), String(slug)).toEqual(NIJE_NADJENO);
    }
    expect(pozivi.cancelByDevice).toEqual([]);
  });

  test("an empty, over-long or non-string reservation id is not found, and Convex is not asked", async () => {
    const { deps, pozivi } = zavisnosti({ kolacici: await kolacici() });
    const losi: unknown[] = ["", "r".repeat(65), "r".repeat(500), 123, null, undefined, {}, ["rez_probna"]];
    for (const reservationId of losi) {
      expect(await cancelReservationByDeviceAction(SLUG, reservationId, deps), String(reservationId)).toEqual(NIJE_NADJENO);
    }
    expect(pozivi.cancelByDevice).toEqual([]);
  });

  test("a reservation id of exactly 64 characters is still asked about", async () => {
    const { deps, pozivi } = zavisnosti({ kolacici: await kolacici() });
    const reservationId = "r".repeat(64);
    expect(await cancelReservationByDeviceAction(SLUG, reservationId, deps)).toEqual({ ok: true });
    expect(pozivi.cancelByDevice).toHaveLength(1);
    expect((pozivi.cancelByDevice[0] as { reservationId: string }).reservationId).toBe(reservationId);
  });

  test("a refusal of Convex is passed on; anything extra in an ok answer is dropped; a throw is network", async () => {
    const odbijeno = zavisnosti({
      kolacici: await kolacici(),
      convex: { cancelByDevice: async () => ({ ok: false, code: RESERVATION_ERROR.notCancellable }) },
    });
    expect(await cancelReservationByDeviceAction(SLUG, "rez_probna", odbijeno.deps)).toStrictEqual({
      ok: false,
      code: "reservation/not_cancellable",
    });
    expect(odbijeno.greske).toEqual([]);

    const sa = zavisnosti({
      kolacici: await kolacici(),
      convex: { cancelByDevice: async () => ({ ok: true, interno: "ne za telefon" }) as { ok: true } },
    });
    expect(await cancelReservationByDeviceAction(SLUG, "rez_probna", sa.deps)).toStrictEqual({ ok: true });

    const pad = zavisnosti({
      kolacici: await kolacici(),
      convex: {
        cancelByDevice: async () => {
          throw new Error("convex je nedostupan");
        },
      },
    });
    expect(await cancelReservationByDeviceAction(SLUG, "rez_probna", pad.deps)).toEqual(MREZA);
    expect(pad.greske).toHaveLength(1);
    expect((pad.greske[0] as Error).message).toBe("convex je nedostupan");
  });
});

describe("reservationLinkPath", () => {
  test("is the page of the cancel link under the venue's menu", () => {
    expect(reservationLinkPath(SLUG, CANCEL)).toBe(`/demo-restoran/meni/rezervacija/${CANCEL}`);
    expect(reservationLinkPath("kafana-kod-mike", "abc")).toBe("/kafana-kod-mike/meni/rezervacija/abc");
  });

  test("it ends with the token the guest was handed", async () => {
    const { deps } = zavisnosti();
    const odgovor = await submitReservationAction(SLUG, UNOS, deps);
    if (!odgovor.ok) throw new Error("expected ok");
    const putanja = reservationLinkPath(SLUG, odgovor.cancelToken);
    expect(putanja.startsWith("/demo-restoran/meni/rezervacija/")).toBe(true);
    expect(putanja.endsWith(odgovor.cancelToken)).toBe(true);
  });
});
