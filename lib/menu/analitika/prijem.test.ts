// ScanMe Menu V1 (K29) — what the ingest accepts from a browser
// (docs/menu/ANALITIKA-DEFINICIJE.md §2 "Provera ključeva"): known kinds only,
// keys with the shape of a page / article key, a broken optional field is
// dropped, a broken required one drops the event. Tag [prijem].

import { describe, expect, test } from "vitest";
import { ocistiDogadjaj, type UlazniDogadjaj } from "./prijem";

const PG = "pg_5k2m9q0x7c1d";
const AR = "ar_5k2m9q0x7c1d";
const SC = "sc_5k2m9q0x7c1d";
const KARTICA = "k123456789ab";
const SESIJA = "abcdefghjkmnpqrs";

const SA_SESIJOM = { sesijaDozvoljena: true };
const BEZ_SESIJE = { sesijaDozvoljena: false };

describe("ocistiDogadjaj: kinds", () => {
  test("[prijem] an unknown kind is dropped", () => {
    for (const vrsta of ["klik", "", "STRANICA", "Stranica", "scroll", "pageview", "stranica ", "__proto__"]) {
      expect(ocistiDogadjaj({ vrsta, stranica: PG, artikal: AR, korak: "zahtev", sesija: SESIJA }, SA_SESIJOM), vrsta).toBeNull();
    }
  });

  test("[prijem] server-side kinds are never accepted from a browser", () => {
    for (const vrsta of ["zahtev_poslat", "zahtev_prihvacen", "rezervacija_poslata", "rezervacija_otkazana"]) {
      expect(ocistiDogadjaj({ vrsta, stranica: PG }, SA_SESIJOM), vrsta).toBeNull();
    }
  });
});

describe("ocistiDogadjaj: stranica", () => {
  test("[prijem] a page open with a valid page key is kept", () => {
    expect(ocistiDogadjaj({ vrsta: "stranica", stranica: PG }, BEZ_SESIJE)).toStrictEqual({ vrsta: "stranica", stranica: PG });
  });

  test("[prijem] the Room service page key _rs becomes room_service", () => {
    expect(ocistiDogadjaj({ vrsta: "stranica", stranica: "_rs" }, BEZ_SESIJE)).toStrictEqual({
      vrsta: "stranica",
      stranica: "room_service",
    });
  });

  test("[prijem] a missing page key drops the event", () => {
    expect(ocistiDogadjaj({ vrsta: "stranica" }, SA_SESIJOM)).toBeNull();
    expect(ocistiDogadjaj({ vrsta: "stranica", stranica: "" }, SA_SESIJOM)).toBeNull();
  });

  test("[prijem] an invalid page key drops the event", () => {
    for (const stranica of [
      "pg_5k2m9q0x7c1",
      "pg_5k2m9q0x7c1dd",
      "pg_5K2M9Q0X7C1D",
      "pg_5k2m9q0x7c1i",
      "pg_5k2m9q0x7c1l",
      "pg_5k2m9q0x7c1o",
      "pg_5k2m9q0x7c1u",
      "pg-5k2m9q0x7c1d",
      "pg_5k2m9q0x7c1d ",
      " pg_5k2m9q0x7c1d",
      "5k2m9q0x7c1d",
      "pg_",
      "_rs ",
      "_RS",
      "rs",
      "room_service",
      "../etc/passwd",
      "<script>",
    ]) {
      expect(ocistiDogadjaj({ vrsta: "stranica", stranica }, SA_SESIJOM), JSON.stringify(stranica)).toBeNull();
    }
  });

  test("[prijem] an article key (or any other key kind) used as the page drops the event", () => {
    expect(ocistiDogadjaj({ vrsta: "stranica", stranica: AR }, SA_SESIJOM)).toBeNull();
    expect(ocistiDogadjaj({ vrsta: "stranica", stranica: SC }, SA_SESIJOM)).toBeNull();
    expect(ocistiDogadjaj({ vrsta: "stranica", stranica: "va_5k2m9q0x7c1d" }, SA_SESIJOM)).toBeNull();
  });

  test("[prijem] a page open never carries an article or a step", () => {
    const izlaz = ocistiDogadjaj({ vrsta: "stranica", stranica: PG, artikal: AR, korak: "zahtev" }, SA_SESIJOM);
    expect(izlaz).toStrictEqual({ vrsta: "stranica", stranica: PG });
  });
});

describe("ocistiDogadjaj: detalj", () => {
  test("[prijem] a detail needs a valid page key and a valid article key", () => {
    expect(ocistiDogadjaj({ vrsta: "detalj", stranica: PG, artikal: AR }, BEZ_SESIJE)).toStrictEqual({
      vrsta: "detalj",
      stranica: PG,
      artikal: AR,
    });
  });

  test("[prijem] a detail from the Room service page is kept with room_service", () => {
    expect(ocistiDogadjaj({ vrsta: "detalj", stranica: "_rs", artikal: AR }, BEZ_SESIJE)).toStrictEqual({
      vrsta: "detalj",
      stranica: "room_service",
      artikal: AR,
    });
  });

  test("[prijem] a detail without an article is dropped", () => {
    expect(ocistiDogadjaj({ vrsta: "detalj", stranica: PG }, SA_SESIJOM)).toBeNull();
    expect(ocistiDogadjaj({ vrsta: "detalj", stranica: PG, artikal: "" }, SA_SESIJOM)).toBeNull();
  });

  test("[prijem] a detail with an invalid article key is dropped", () => {
    for (const artikal of ["ar_5k2m9q0x7c1", "ar_5k2m9q0x7c1dd", "ar_5K2M9Q0X7C1D", "ar_5k2m9q0x7c1u", "5k2m9q0x7c1d", "ar_"]) {
      expect(ocistiDogadjaj({ vrsta: "detalj", stranica: PG, artikal }, SA_SESIJOM), artikal).toBeNull();
    }
  });

  test("[prijem] a page key or section key in the place of the article is dropped", () => {
    expect(ocistiDogadjaj({ vrsta: "detalj", stranica: PG, artikal: PG }, SA_SESIJOM)).toBeNull();
    expect(ocistiDogadjaj({ vrsta: "detalj", stranica: PG, artikal: SC }, SA_SESIJOM)).toBeNull();
  });

  test("[prijem] a detail with an invalid or missing page is dropped", () => {
    expect(ocistiDogadjaj({ vrsta: "detalj", artikal: AR }, SA_SESIJOM)).toBeNull();
    expect(ocistiDogadjaj({ vrsta: "detalj", stranica: "pg_bad", artikal: AR }, SA_SESIJOM)).toBeNull();
    expect(ocistiDogadjaj({ vrsta: "detalj", stranica: AR, artikal: AR }, SA_SESIJOM)).toBeNull();
  });

  test("[prijem] a detail never carries a card or a step", () => {
    const izlaz = ocistiDogadjaj({ vrsta: "detalj", stranica: PG, artikal: AR, kartica: KARTICA, korak: "zahtev" }, SA_SESIJOM);
    expect(izlaz).toStrictEqual({ vrsta: "detalj", stranica: PG, artikal: AR });
  });
});

describe("ocistiDogadjaj: optional fields", () => {
  const otvaranje = (dopuna: Partial<UlazniDogadjaj>): UlazniDogadjaj => ({ vrsta: "stranica", stranica: PG, ...dopuna });

  test("[prijem] a card id is kept only when it is 10 to 64 lowercase letters and digits", () => {
    const duzine = [9, 10, 12, 64, 65];
    expect(duzine.map((duzina) => ocistiDogadjaj(otvaranje({ kartica: "a".repeat(duzina) }), BEZ_SESIJE)?.kartica)).toEqual([
      undefined,
      "a".repeat(10),
      "a".repeat(12),
      "a".repeat(64),
      undefined,
    ]);
    expect(ocistiDogadjaj(otvaranje({ kartica: KARTICA }), BEZ_SESIJE)).toStrictEqual({
      vrsta: "stranica",
      stranica: PG,
      kartica: KARTICA,
    });
  });

  test("[prijem] a broken card id is dropped and the event is kept", () => {
    for (const kartica of ["K123456789AB", "abc-def-ghi-jkl", "abc def ghi jkl", "k12345678é", "", "<script>alert(1)</script>"]) {
      const izlaz = ocistiDogadjaj(otvaranje({ kartica }), BEZ_SESIJE);
      expect(izlaz, kartica).toStrictEqual({ vrsta: "stranica", stranica: PG });
    }
  });

  test("[prijem] a language is two lowercase letters, otherwise dropped (the event is kept)", () => {
    for (const jezik of ["sr", "en", "de", "ru"]) {
      expect(ocistiDogadjaj(otvaranje({ jezik }), BEZ_SESIJE)?.jezik, jezik).toBe(jezik);
    }
    for (const jezik of ["SR", "Sr", "srp", "s", "", "s1", "1s", "sr-RS", "sr ", " sr", "šr"]) {
      const izlaz = ocistiDogadjaj(otvaranje({ jezik }), BEZ_SESIJE);
      expect(izlaz, jezik).toStrictEqual({ vrsta: "stranica", stranica: PG });
    }
  });

  test("[prijem] a language is kept on a detail too", () => {
    expect(ocistiDogadjaj({ vrsta: "detalj", stranica: PG, artikal: AR, jezik: "en" }, BEZ_SESIJE)).toStrictEqual({
      vrsta: "detalj",
      stranica: PG,
      artikal: AR,
      jezik: "en",
    });
  });

  test("[prijem] values that are not strings are dropped, not coerced", () => {
    const losi = { vrsta: "stranica", stranica: PG, kartica: 123456789012, jezik: 42, sesija: 7 } as unknown as UlazniDogadjaj;
    expect(ocistiDogadjaj(losi, SA_SESIJOM)).toStrictEqual({ vrsta: "stranica", stranica: PG });
    const objekat = { vrsta: "stranica", stranica: PG, jezik: ["sr"], kartica: { a: 1 } } as unknown as UlazniDogadjaj;
    expect(ocistiDogadjaj(objekat, SA_SESIJOM)).toStrictEqual({ vrsta: "stranica", stranica: PG });
    const brojKaoStranica = { vrsta: "stranica", stranica: 5 } as unknown as UlazniDogadjaj;
    expect(ocistiDogadjaj(brojKaoStranica, SA_SESIJOM)).toBeNull();
  });

  test("[prijem] fields the ingest does not know about are never copied (no name, IP, User-Agent, token)", () => {
    const sSmecem = {
      vrsta: "stranica",
      stranica: PG,
      ime: "Ana",
      ip: "203.0.113.7",
      userAgent: "Mozilla/5.0",
      token: "secret",
    } as unknown as UlazniDogadjaj;
    expect(ocistiDogadjaj(sSmecem, SA_SESIJOM)).toStrictEqual({ vrsta: "stranica", stranica: PG });
  });
});

describe("ocistiDogadjaj: session id", () => {
  test("[prijem] a session id is kept when sessions are allowed and it has the right shape", () => {
    expect(ocistiDogadjaj({ vrsta: "stranica", stranica: PG, sesija: SESIJA }, SA_SESIJOM)).toStrictEqual({
      vrsta: "stranica",
      stranica: PG,
      sesija: SESIJA,
    });
    expect(ocistiDogadjaj({ vrsta: "detalj", stranica: PG, artikal: AR, sesija: SESIJA }, SA_SESIJOM)?.sesija).toBe(SESIJA);
  });

  test("[prijem] a session id is dropped when sessions are not allowed (the event is kept)", () => {
    expect(ocistiDogadjaj({ vrsta: "stranica", stranica: PG, sesija: SESIJA }, BEZ_SESIJE)).toStrictEqual({
      vrsta: "stranica",
      stranica: PG,
    });
    expect(ocistiDogadjaj({ vrsta: "detalj", stranica: PG, artikal: AR, sesija: SESIJA }, BEZ_SESIJE)).toStrictEqual({
      vrsta: "detalj",
      stranica: PG,
      artikal: AR,
    });
  });

  test("[prijem] a session id with the wrong shape is dropped (the event is kept)", () => {
    for (const sesija of [SESIJA.slice(0, 15), `${SESIJA}a`, SESIJA.toUpperCase(), `${SESIJA.slice(0, 15)}o`, `${SESIJA.slice(0, 15)}i`, "", "a b c d e f g h "]) {
      const izlaz = ocistiDogadjaj({ vrsta: "stranica", stranica: PG, sesija }, SA_SESIJOM);
      expect(izlaz, sesija).toStrictEqual({ vrsta: "stranica", stranica: PG });
    }
  });
});

describe("ocistiDogadjaj: korak", () => {
  test.each(["zahtev", "porudzbina", "rezervacija"])("[prijem] the step %s is kept with its session", (korak) => {
    expect(ocistiDogadjaj({ vrsta: "korak", korak, sesija: SESIJA }, SA_SESIJOM)).toStrictEqual({
      vrsta: "korak",
      korak,
      sesija: SESIJA,
    });
  });

  test("[prijem] an unknown or missing step drops the event", () => {
    for (const korak of ["tableta", "Zahtev", "zahtev ", "", "detalj", "stranica", "order"]) {
      expect(ocistiDogadjaj({ vrsta: "korak", korak, sesija: SESIJA }, SA_SESIJOM), korak).toBeNull();
    }
    expect(ocistiDogadjaj({ vrsta: "korak", sesija: SESIJA }, SA_SESIJOM)).toBeNull();
  });

  test("[prijem] a step without a session drops the event", () => {
    expect(ocistiDogadjaj({ vrsta: "korak", korak: "zahtev" }, SA_SESIJOM)).toBeNull();
    expect(ocistiDogadjaj({ vrsta: "korak", korak: "porudzbina", sesija: "" }, SA_SESIJOM)).toBeNull();
  });

  test("[prijem] a step with a badly formed session drops the event", () => {
    expect(ocistiDogadjaj({ vrsta: "korak", korak: "zahtev", sesija: SESIJA.slice(0, 15) }, SA_SESIJOM)).toBeNull();
    expect(ocistiDogadjaj({ vrsta: "korak", korak: "zahtev", sesija: SESIJA.toUpperCase() }, SA_SESIJOM)).toBeNull();
  });

  test("[prijem] a step is dropped when sessions are not allowed, even with a valid session id", () => {
    expect(ocistiDogadjaj({ vrsta: "korak", korak: "zahtev", sesija: SESIJA }, BEZ_SESIJE)).toBeNull();
    expect(ocistiDogadjaj({ vrsta: "korak", korak: "rezervacija", sesija: SESIJA }, BEZ_SESIJE)).toBeNull();
  });

  test("[prijem] a step keeps only a valid language besides step and session (no page, article or card)", () => {
    const izlaz = ocistiDogadjaj(
      { vrsta: "korak", korak: "zahtev", sesija: SESIJA, jezik: "sr", stranica: PG, artikal: AR, kartica: KARTICA },
      SA_SESIJOM,
    );
    expect(izlaz).toStrictEqual({ vrsta: "korak", korak: "zahtev", sesija: SESIJA, jezik: "sr" });
    expect(ocistiDogadjaj({ vrsta: "korak", korak: "zahtev", sesija: SESIJA, jezik: "SRB" }, SA_SESIJOM)).toStrictEqual({
      vrsta: "korak",
      korak: "zahtev",
      sesija: SESIJA,
    });
  });
});
