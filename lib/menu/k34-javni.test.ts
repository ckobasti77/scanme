// K34 tests for two review fixes of the public menu that live outside the
// components: B13 (the writing direction of a menu language, lib/menu/languages.ts)
// and B18 (the server loader of the public menu, app/[slug]/meni/_lib/ucitaj.ts:
// the optional reads - the EUR rate and the guest session - fail soft, the page
// reads still fail hard). The loader runs here with Convex and the request cookies
// replaced by fakes (no deployment, no Next runtime); the guest cookie is a REAL
// signed one. Invented data only.

import { afterEach, beforeEach, describe, expect, test, vi, type MockInstance } from "vitest";
import { ucitajJavno } from "@/app/[slug]/meni/_lib/ucitaj";
import { MENU_SOURCE_LANGUAGE, MENU_TRANSLATION_LANGUAGES, smerPisma } from "./languages";
import { MENU_DEFAULT_PRESENTATION } from "./presentation";
import { MENU_GUEST_SESSION_COOKIE, sessionCookieContext, signCookieValue } from "./signed-cookie";

// -----------------------------------------------------------------------------
// B13 — smerPisma
// -----------------------------------------------------------------------------

describe("smerPisma", () => {
  test("Arabic and Hebrew read right to left; the source language and every other translation language left to right", () => {
    expect(smerPisma("ar")).toBe("rtl");
    expect(smerPisma("he")).toBe("rtl");
    expect(smerPisma(MENU_SOURCE_LANGUAGE)).toBe("ltr");
    for (const kod of MENU_TRANSLATION_LANGUAGES) {
      expect(smerPisma(kod), kod).toBe(kod === "ar" || kod === "he" ? "rtl" : "ltr");
    }
  });

  test("a right-to-left language added to the list later cannot silently read left to right", () => {
    // ISO 639-1 codes of languages written right to left. Whichever of them the list allows must be "rtl".
    const DESNO_NA_LEVO = ["ar", "he", "fa", "ur", "ps", "sd", "ug", "yi", "dv"];
    const dozvoljeni = MENU_TRANSLATION_LANGUAGES.filter((kod) => DESNO_NA_LEVO.includes(kod));
    expect(dozvoljeni.length).toBeGreaterThan(0);
    for (const kod of dozvoljeni) expect(smerPisma(kod), kod).toBe("rtl");
  });

  test("an unknown or empty code reads left to right", () => {
    for (const kod of ["", "xx", "arabic"]) expect(smerPisma(kod), kod).toBe("ltr");
  });
});

// -----------------------------------------------------------------------------
// B18 — ucitajJavno
// -----------------------------------------------------------------------------

const mock = vi.hoisted(() => ({
  /** Convex function name ("module:function") -> what the fake deployment answers (or throws). */
  odgovori: new Map<string, () => unknown>(),
  /** The request's cookies. */
  kolacici: new Map<string, string>(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = mock.kolacici.get(name);
      return value === undefined ? undefined : { name, value };
    },
  }),
}));

vi.mock("convex/nextjs", () => ({
  fetchQuery: async (ref: unknown) => {
    const { getFunctionName } = await import("convex/server");
    const ime = getFunctionName(ref as never);
    const odgovor = mock.odgovori.get(ime);
    if (!odgovor) throw new Error(`no fake answer for ${ime}`);
    return odgovor();
  },
}));

const SLUG = "demo-restoran";
const SECRET = "test-secret-k34";
const GUEST = "g".repeat(43);

const STRANICA_META = { key: "pg_glavni", slug: "glavni", title: null, isDefault: true, navigation: "standalone", iconKey: null };
const STRANICA = {
  kind: "page",
  menuServiceId: "svc_probni",
  business: { name: "Probni lokal", slug: SLUG },
  logoUrl: null,
  presentation: { ...MENU_DEFAULT_PRESENTATION, currencyToggle: true },
  page: STRANICA_META,
  pages: [STRANICA_META],
  sections: [],
  lang: "sr",
  languages: ["sr"],
  allergensEnabled: false,
};
const KURS = { rate: 117.2, effectiveDate: "2026-10-20", fetchedAt: 1_000 };
const SESIJA = {
  position: { label: "Sto 4", kind: "table" },
  actions: { call: true, bill: true, order: false, roomService: false },
  cardId: "cd_probna",
};

async function ucitaj() {
  const ucitano = await ucitajJavno(SLUG, undefined, undefined);
  if (!ucitano || ucitano.vrsta !== "stranica") throw new Error("expected a menu page");
  return ucitano;
}

describe("ucitajJavno: the optional reads fail soft, the page reads fail hard (B18)", () => {
  let log: MockInstance<typeof console.error>;

  beforeEach(async () => {
    vi.stubEnv("SCANME_GUEST_SECRET", SECRET);
    mock.odgovori.clear();
    mock.odgovori.set("menuPublic:page", () => STRANICA);
    mock.odgovori.set("menuPublic:live", () => ({ versionNumber: 3, unavailableKeys: [] }));
    mock.odgovori.set("menuPublic:pageMedia", () => ({}));
    mock.odgovori.set("menuFx:current", () => KURS);
    mock.odgovori.set("menuGuest:sessionView", () => SESIJA);
    mock.kolacici.clear();
    mock.kolacici.set(MENU_GUEST_SESSION_COOKIE, await signCookieValue(GUEST, SECRET, sessionCookieContext(SLUG)));
    log = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    log.mockRestore();
    vi.unstubAllEnvs();
  });

  test("everything answers: the page with the rate, the guest's position and the card", async () => {
    const ucitano = await ucitaj();
    expect(ucitano.kurs).toEqual(KURS);
    expect(ucitano.gost?.kontekst.pozicija).toEqual({ naziv: "Sto 4", vrsta: "table" });
    expect(ucitano.kartica).toBe("cd_probna");
    expect(log).not.toHaveBeenCalled();
  });

  test("the EUR rate failing serves the menu without a rate and logs only the kind of failure", async () => {
    mock.odgovori.set("menuFx:current", () => {
      throw new Error("convex je pao: tajni detalj");
    });
    const ucitano = await ucitaj();
    expect(ucitano.kurs).toBeNull();
    expect(ucitano.gost?.kontekst.pozicija.naziv).toBe("Sto 4");
    expect(log.mock.calls).toEqual([["MENU_FX_RATE_FAILED", "Error"]]);
  });

  test("the guest session failing serves a plain menu: no position, no card, the rate intact", async () => {
    mock.odgovori.set("menuGuest:sessionView", () => {
      throw new Error("convex je pao: tajni detalj");
    });
    const ucitano = await ucitaj();
    expect(ucitano.gost).toBeNull();
    expect(ucitano.kartica).toBeNull();
    expect(ucitano.kurs).toEqual(KURS);
    expect(ucitano.view.lokal.naziv).toBe("Probni lokal");
    expect(log.mock.calls).toEqual([["MENU_GUEST_SESSION_FAILED", "Error"]]);
  });

  test("both optional reads failing at once still serves the menu; a failure that is no Error is logged as its type", async () => {
    mock.odgovori.set("menuFx:current", () => {
      throw "boom";
    });
    mock.odgovori.set("menuGuest:sessionView", () => {
      throw new TypeError("loshe");
    });
    const ucitano = await ucitaj();
    expect(ucitano.kurs).toBeNull();
    expect(ucitano.gost).toBeNull();
    expect(log.mock.calls).toEqual(
      expect.arrayContaining([
        ["MENU_FX_RATE_FAILED", "string"],
        ["MENU_GUEST_SESSION_FAILED", "TypeError"],
      ]),
    );
    expect(log).toHaveBeenCalledTimes(2);
  });

  test("a plain link (no guest cookie) never asks for a session, so nothing is logged", async () => {
    mock.kolacici.clear();
    mock.odgovori.set("menuGuest:sessionView", () => {
      throw new Error("must not be asked");
    });
    const ucitano = await ucitaj();
    expect(ucitano.gost).toBeNull();
    expect(log).not.toHaveBeenCalled();
  });

  test.each(["menuPublic:page", "menuPublic:live", "menuPublic:pageMedia"])(
    "%s failing still fails the whole load (the error reaches error.tsx)",
    async (ime) => {
      mock.odgovori.set(ime, () => {
        throw new Error("convex je pao");
      });
      await expect(ucitajJavno(SLUG, undefined, undefined)).rejects.toThrow("convex je pao");
    },
  );

  test("an unpublished menu is still null (not an error)", async () => {
    mock.odgovori.set("menuPublic:page", () => null);
    expect(await ucitajJavno(SLUG, undefined, undefined)).toBeNull();
  });
});
