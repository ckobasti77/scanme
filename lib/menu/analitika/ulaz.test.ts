// ScanMe Menu V1 (K29) — the decisions of the ingest route
// (app/api/meni/analitika/route.ts) as a pure function: what is dropped before
// Convex is called at all (docs/menu/ANALITIKA-DEFINICIJE.md §2). Tags
// [interni], [uredjaj], [prijem].

import { describe, expect, test } from "vitest";
import { MAX_DOGADJAJA_PO_POZIVU } from "./definicije";
import { pripremiUlaz } from "./ulaz";
import type { AnalitikaRezim } from "./saglasnost";

const PG = "pg_5k2m9q0x7c1d";
const AR = "ar_5k2m9q0x7c1d";
const SESIJA = "abcdefghjkmnpqrs";

const TELEFON =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
const TABLET =
  "Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
const RACUNAR =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const GOOGLEBOT = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

type Kontekst = Parameters<typeof pripremiUlaz>[1];

function kontekst(dopuna: Partial<Kontekst> = {}): Kontekst {
  return { userAgent: TELEFON, prijavljen: false, rezim: "iskljuceno", ...dopuna };
}

const dogadjajStranice = { vrsta: "stranica", stranica: PG, jezik: "sr" };
const telo = (dopuna: Record<string, unknown> = {}) => ({ slug: "cafe-bar", dogadjaji: [dogadjajStranice], ...dopuna });

describe("pripremiUlaz: bots and internal traffic", () => {
  test("[uredjaj] a bot User-Agent is dropped before anything else", () => {
    expect(pripremiUlaz(telo(), kontekst({ userAgent: GOOGLEBOT }))).toEqual({ ok: false, razlog: "bot" });
  });

  test("[uredjaj] a request without a User-Agent is dropped as a bot", () => {
    expect(pripremiUlaz(telo(), kontekst({ userAgent: null }))).toEqual({ ok: false, razlog: "bot" });
    expect(pripremiUlaz(telo(), kontekst({ userAgent: "" }))).toEqual({ ok: false, razlog: "bot" });
  });

  test("[uredjaj] link previews and headless browsers are dropped", () => {
    for (const userAgent of [
      "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
      "WhatsApp/2.23.20.0 A",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/124.0.0.0 Safari/537.36",
    ]) {
      expect(pripremiUlaz(telo(), kontekst({ userAgent }))).toEqual({ ok: false, razlog: "bot" });
    }
  });

  test("[interni] a browser with a signed-in ScanMe session is not counted, even with a valid body", () => {
    expect(pripremiUlaz(telo(), kontekst({ prijavljen: true }))).toEqual({ ok: false, razlog: "interni" });
    expect(pripremiUlaz(telo(), kontekst({ prijavljen: true, rezim: "ukljuceno" }))).toEqual({ ok: false, razlog: "interni" });
  });

  test("[interni] the same request without a sign-in is counted", () => {
    expect(pripremiUlaz(telo(), kontekst({ prijavljen: false })).ok).toBe(true);
  });
});

describe("pripremiUlaz: the body", () => {
  test.each([
    ["null", null],
    ["undefined", undefined],
    ["a string", "slug=cafe-bar"],
    ["a number", 42],
    ["true", true],
    ["an empty object", {}],
    ["an array", [dogadjajStranice]],
  ])("[prijem] a body that is %s is neispravno", (_ime, body) => {
    expect(pripremiUlaz(body, kontekst())).toEqual({ ok: false, razlog: "neispravno" });
  });

  test.each([
    ["uppercase", "Cafe-Bar"],
    ["spaces", "cafe bar"],
    ["an underscore", "cafe_bar"],
    ["a trailing hyphen", "cafe-"],
    ["a leading hyphen", "-cafe"],
    ["a double hyphen", "cafe--bar"],
    ["a slash", "cafe/bar"],
    ["a dot", "cafe.bar"],
    ["a non-ASCII letter", "kafić"],
    ["an empty string", ""],
    ["81 characters", "a".repeat(81)],
    ["a path traversal", "../admin"],
  ])("[prijem] a slug with %s is neispravno", (_ime, slug) => {
    expect(pripremiUlaz(telo({ slug }), kontekst())).toEqual({ ok: false, razlog: "neispravno" });
  });

  test("[prijem] a slug that is not a string is neispravno", () => {
    for (const slug of [undefined, null, 5, ["cafe-bar"], { a: 1 }]) {
      expect(pripremiUlaz(telo({ slug }), kontekst()), JSON.stringify(slug)).toEqual({ ok: false, razlog: "neispravno" });
    }
  });

  test("[prijem] a slug of 80 characters and one with digits and single hyphens are fine", () => {
    expect(pripremiUlaz(telo({ slug: "a".repeat(80) }), kontekst()).ok).toBe(true);
    expect(pripremiUlaz(telo({ slug: "hotel-vista-2" }), kontekst()).ok).toBe(true);
    expect(pripremiUlaz(telo({ slug: "7" }), kontekst()).ok).toBe(true);
  });

  test("[prijem] no events and too many events are neispravno", () => {
    expect(pripremiUlaz(telo({ dogadjaji: [] }), kontekst())).toEqual({ ok: false, razlog: "neispravno" });
    const jedanaest = Array.from({ length: MAX_DOGADJAJA_PO_POZIVU + 1 }, () => dogadjajStranice);
    expect(jedanaest).toHaveLength(11);
    expect(pripremiUlaz(telo({ dogadjaji: jedanaest }), kontekst())).toEqual({ ok: false, razlog: "neispravno" });
  });

  test("[prijem] exactly 10 events are accepted", () => {
    const deset = Array.from({ length: MAX_DOGADJAJA_PO_POZIVU }, () => dogadjajStranice);
    const ulaz = pripremiUlaz(telo({ dogadjaji: deset }), kontekst());
    expect(ulaz.ok && ulaz.dogadjaji).toHaveLength(10);
  });

  test("[prijem] events that are not an array are neispravno", () => {
    for (const dogadjaji of [undefined, null, "stranica", 3, dogadjajStranice]) {
      expect(pripremiUlaz(telo({ dogadjaji }), kontekst()), JSON.stringify(dogadjaji)).toEqual({
        ok: false,
        razlog: "neispravno",
      });
    }
  });

  test("[prijem] when no event in the call is an object with a string kind, the call is neispravno", () => {
    expect(pripremiUlaz(telo({ dogadjaji: [null, "x", 5, [], { vrsta: 5 }, {}] }), kontekst())).toEqual({
      ok: false,
      razlog: "neispravno",
    });
  });

  test("[prijem] unusable events are skipped and the usable ones are kept, in order", () => {
    const ulaz = pripremiUlaz(
      telo({ dogadjaji: [null, { vrsta: "detalj", stranica: PG, artikal: AR }, 7, { vrsta: 3 }, dogadjajStranice] }),
      kontekst(),
    );
    expect(ulaz).toEqual({
      ok: true,
      slug: "cafe-bar",
      uredjaj: "telefon",
      dogadjaji: [{ vrsta: "detalj", stranica: PG, artikal: AR }, { vrsta: "stranica", stranica: PG, jezik: "sr" }],
    });
  });
});

describe("pripremiUlaz: a valid call", () => {
  test("[prijem] gives the slug, the device class and the cleaned events", () => {
    const ulaz = pripremiUlaz(telo(), kontekst());
    expect(ulaz).toEqual({
      ok: true,
      slug: "cafe-bar",
      uredjaj: "telefon",
      dogadjaji: [{ vrsta: "stranica", stranica: PG, jezik: "sr" }],
    });
  });

  test("[uredjaj] the device class comes from the User-Agent: telefon, tablet, racunar", () => {
    const ocekivano = [
      [TELEFON, "telefon"],
      [TABLET, "tablet"],
      [RACUNAR, "racunar"],
    ] as const;
    for (const [userAgent, uredjaj] of ocekivano) {
      const ulaz = pripremiUlaz(telo(), kontekst({ userAgent }));
      expect(ulaz.ok && ulaz.uredjaj, uredjaj).toBe(uredjaj);
    }
  });

  test("[prijem] every string field is cut to 80 characters and the kind to 32", () => {
    const dugo = "x".repeat(200);
    const ulaz = pripremiUlaz(
      telo({
        dogadjaji: [{ vrsta: "v".repeat(100), stranica: dugo, artikal: dugo, kartica: dugo, jezik: dugo, korak: dugo, sesija: dugo }],
      }),
      kontekst({ rezim: "ukljuceno" }),
    );
    expect(ulaz.ok).toBe(true);
    if (!ulaz.ok) return;
    const [dogadjaj] = ulaz.dogadjaji;
    expect(dogadjaj.vrsta).toHaveLength(32);
    for (const polje of ["stranica", "artikal", "kartica", "jezik", "korak", "sesija"] as const) {
      expect(dogadjaj[polje], polje).toHaveLength(80);
    }
  });

  test("[prijem] fields that are not strings, and empty strings, are dropped", () => {
    const ulaz = pripremiUlaz(
      telo({
        dogadjaji: [
          { vrsta: "stranica", stranica: ["pg"], artikal: { a: 1 }, kartica: null, jezik: 5, korak: false, sesija: 7 },
          { vrsta: "stranica", stranica: PG, kartica: "", jezik: "" },
        ],
      }),
      kontekst({ rezim: "ukljuceno" }),
    );
    expect(ulaz).toEqual({
      ok: true,
      slug: "cafe-bar",
      uredjaj: "telefon",
      dogadjaji: [{ vrsta: "stranica" }, { vrsta: "stranica", stranica: PG }],
    });
  });

  test("[prijem] fields the route does not know about are dropped (no name, IP, token, User-Agent)", () => {
    const ulaz = pripremiUlaz(
      telo({ dogadjaji: [{ ...dogadjajStranice, ime: "Ana", ip: "203.0.113.7", token: "secret", userAgent: "Mozilla/5.0" }] }),
      kontekst(),
    );
    expect(ulaz.ok && ulaz.dogadjaji).toEqual([{ vrsta: "stranica", stranica: PG, jezik: "sr" }]);
  });

  test("[prijem] the call-level fields other than slug and events are ignored", () => {
    const ulaz = pripremiUlaz(telo({ ip: "203.0.113.7", userAgent: "x" }), kontekst());
    expect(ulaz).toEqual({
      ok: true,
      slug: "cafe-bar",
      uredjaj: "telefon",
      dogadjaji: [{ vrsta: "stranica", stranica: PG, jezik: "sr" }],
    });
  });
});

describe("pripremiUlaz: the session id and the identifier mode", () => {
  const sSesijom = {
    dogadjaji: [
      { vrsta: "stranica", stranica: PG, jezik: "sr", sesija: SESIJA },
      { vrsta: "detalj", stranica: PG, artikal: AR, sesija: SESIJA },
      { vrsta: "korak", korak: "zahtev", sesija: SESIJA },
    ],
  };

  test("[prijem] iskljuceno strips the session id from every event, so a modified browser cannot store one", () => {
    const ulaz = pripremiUlaz(telo(sSesijom), kontekst({ rezim: "iskljuceno" }));
    expect(ulaz.ok).toBe(true);
    if (!ulaz.ok) return;
    expect(ulaz.dogadjaji).toHaveLength(3);
    for (const dogadjaj of ulaz.dogadjaji) expect(dogadjaj).not.toHaveProperty("sesija");
    expect(JSON.stringify(ulaz)).not.toContain(SESIJA);
  });

  test.each(["ukljuceno", "saglasnost"] as const satisfies readonly AnalitikaRezim[])(
    "[prijem] %s keeps the session id of every event",
    (rezim) => {
      const ulaz = pripremiUlaz(telo(sSesijom), kontekst({ rezim }));
      expect(ulaz.ok).toBe(true);
      if (!ulaz.ok) return;
      expect(ulaz.dogadjaji).toHaveLength(3);
      for (const dogadjaj of ulaz.dogadjaji) expect(dogadjaj.sesija).toBe(SESIJA);
    },
  );

  test("[prijem] the mode is applied per call: the same body gives events with and without the id", () => {
    const bez = pripremiUlaz(telo(sSesijom), kontekst({ rezim: "iskljuceno" }));
    const sa = pripremiUlaz(telo(sSesijom), kontekst({ rezim: "ukljuceno" }));
    expect(bez.ok && bez.dogadjaji[0]).toEqual({ vrsta: "stranica", stranica: PG, jezik: "sr" });
    expect(sa.ok && sa.dogadjaji[0]).toEqual({ vrsta: "stranica", stranica: PG, jezik: "sr", sesija: SESIJA });
  });
});
