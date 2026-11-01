// Izlog fixtures of the analytics: deterministic, internally consistent (every
// total is the sum of its days, every split adds up), and free of anything that
// looks private.

import { describe, expect, test } from "vitest";
import { DEFINICIJE, DIMENZIJE, METRIKE, OSTALO, type Metrika } from "@/lib/menu/analitika/definicije";
import { VRSTE_ZAHTEVA } from "@/lib/menu/analitika/izvestaj";
import { poslednjihDana, prethodniPeriod } from "@/lib/menu/analitika/period";
import {
  ANALITIKA_FIXTURE_STANJA,
  IZLOG_DANAS,
  fixtureIzvestaj,
  fixtureRaspodela,
  type AnalitikaFixtureStanje,
} from "./analitika";

const period = (dana: number) => poslednjihDana(IZLOG_DANAS, dana);
const zbir = (lista: readonly number[]) => lista.reduce((a, b) => a + b, 0);

describe("fixture analitike", () => {

  test("IZLOG_DANAS is the Belgrade day of the izlog clock", () => {
    expect(IZLOG_DANAS).toBe("2026-10-17");
  });

  test("two calls give equal data", () => {
    for (const stanje of ANALITIKA_FIXTURE_STANJA) {
      const opcije = { period: period(30), stanje, premium: true };
      expect(fixtureIzvestaj(opcije)).toEqual(fixtureIzvestaj(opcije));
    }
    const raspodela = { period: period(30), stanje: "puno" as const, metrika: "otvaranja" as const, dimenzija: "sat" as const };
    expect(fixtureRaspodela(raspodela)).toEqual(fixtureRaspodela(raspodela));
  });

  test("the last 7 days of a 30-day period equal the 7-day period", () => {
    const kratko = fixtureIzvestaj({ period: period(7), stanje: "puno", premium: false });
    const dugo = fixtureIzvestaj({ period: period(30), stanje: "puno", premium: false });
    expect(dugo.dani.slice(-7)).toEqual(kratko.dani);
    for (const metrika of METRIKE) {
      expect(dugo.metrike[metrika].poDanu.slice(-7)).toEqual(kratko.metrike[metrika].poDanu);
    }
    const dugoSat = fixtureRaspodela({ period: period(30), stanje: "puno", metrika: "detalji", dimenzija: "artikal" });
    const kratkoSat = fixtureRaspodela({ period: period(7), stanje: "puno", metrika: "detalji", dimenzija: "artikal" });
    for (const vrednost of kratkoSat.vrednosti) {
      const red = dugoSat.vrednosti.find((v) => v.vrednost === vrednost.vrednost);
      expect(red?.poDanu.slice(-7)).toEqual(vrednost.poDanu);
    }
  });

  test("puno: sums and ranges are consistent", () => {
    for (const dana of [7, 30, 90]) {
      for (const premium of [false, true]) {
        const r = fixtureIzvestaj({ period: period(dana), stanje: "puno", premium });
        expect(r.period.dana).toBe(dana);
        expect(r.dani).toHaveLength(dana);
        for (const metrika of METRIKE) {
          const niz = r.metrike[metrika];
          expect(niz.poDanu).toHaveLength(dana);
          expect(niz.ukupno).toBe(zbir(niz.poDanu));
        }
        for (const polje of ["poslato", "prihvaceno", "zavrseno", "otkazano"] as const) {
          const suma = zbir(VRSTE_ZAHTEVA.map((v) => r.zahtevi[v][polje]));
          const metrika: Metrika = { poslato: "zahtevi", prihvaceno: "zahteviPrihvaceni", zavrseno: "zahteviZavrseni", otkazano: "zahteviOtkazani" }[polje] as Metrika;
          expect(suma).toBe(r.metrike[metrika].ukupno);
        }
        for (const v of VRSTE_ZAHTEVA) {
          const z = r.zahtevi[v];
          expect(z.prihvaceno).toBeLessThanOrEqual(z.poslato);
          expect(z.zavrseno).toBeLessThanOrEqual(z.poslato);
          expect(z.otkazano).toBeLessThanOrEqual(z.poslato);
        }
        expect(r.zahteviOtkazao.gost + r.zahteviOtkazao.osoblje).toBe(r.metrike.zahteviOtkazani.ukupno);
        expect(r.rezervacije.otkazao.gost + r.rezervacije.otkazao.osoblje).toBe(r.rezervacije.otkazano);
        expect(r.rezervacije.otkazano).toBe(r.metrike.rezervacijeOtkazane.ukupno);
        expect(r.porudzbinePoKanalu.standard + r.porudzbinePoKanalu.roomService).toBe(r.metrike.porudzbine.ukupno);
        expect(r.metrike.porudzbine.ukupno).toBe(r.zahtevi.order.poslato);
        expect(r.porudzbinePoKanalu.roomService > 0).toBe(premium);
        expect(r.metrike.otvaranjaSaSesijom.ukupno).toBe(r.metrike.otvaranja.ukupno);
        expect(r.sesije.broj).toBe(r.metrike.sesije.ukupno);
        expect(r.sesije.pokrivenost).toBe(1);
        expect(r.metrike.detalji.ukupno).toBeGreaterThan(0);
        expect(r.najotvaraniji.length).toBeGreaterThan(0);
        expect(r.najotvaraniji.length).toBeLessThanOrEqual(10);
        expect(r.najotvaraniji.map((a) => a.broj)).toEqual([...r.najotvaraniji.map((a) => a.broj)].sort((a, b) => b - a));
        expect(r.najotvaraniji.every((a) => a.broj > 0 && /^ar_/.test(a.artikal))).toBe(true);
        expect(zbir(r.skenovi.map((s) => s.broj))).toBe(r.metrike.skenovi.ukupno);
        expect(r.skenovi.length).toBeLessThanOrEqual(20);
        expect(r.skenovi.map((s) => s.broj)).toEqual([...r.skenovi.map((s) => s.broj)].sort((a, b) => b - a));
        expect(r.skenovi.every((s) => s.broj > 0)).toBe(true);
      }
    }
  });

  test("puno: the numbers look like a mid-size restaurant", () => {
    const r = fixtureIzvestaj({ period: period(7), stanje: "puno", premium: false });
    const dnevno = r.metrike.otvaranja.poDanu;
    expect(Math.min(...dnevno)).toBeGreaterThan(60);
    expect(Math.max(...dnevno)).toBeLessThan(190);
    const o = r.metrike.otvaranja.ukupno;
    expect(r.metrike.detalji.ukupno / o).toBeGreaterThan(0.3);
    expect(r.metrike.detalji.ukupno / o).toBeLessThan(0.45);
    expect(r.metrike.zahtevi.ukupno / o).toBeGreaterThan(0.1);
    expect(r.metrike.zahtevi.ukupno / o).toBeLessThan(0.22);
  });

  test("malo-podataka: under 20 opens and under 20 sessions over any period", () => {
    for (const dana of [7, 30, 90]) {
      const r = fixtureIzvestaj({ period: period(dana), stanje: "malo-podataka", premium: true });
      expect(r.metrike.otvaranja.ukupno).toBeGreaterThan(0);
      expect(r.metrike.otvaranja.ukupno).toBeLessThan(20);
      expect(typeof r.sesije.broj).toBe("number");
      expect(r.sesije.broj as number).toBeLessThan(20);
      expect(r.metrike.zahtevi.ukupno).toBeGreaterThan(0);
      expect(r.metrike.rezervacije.ukupno).toBe(1);
      expect(r.metrike.sesije.ukupno).toBeLessThanOrEqual(r.metrike.otvaranja.ukupno);
    }
  });

  test("prazno is all zeros", () => {
    const r = fixtureIzvestaj({ period: period(30), stanje: "prazno", premium: true });
    for (const metrika of METRIKE) {
      expect(r.metrike[metrika].ukupno).toBe(0);
      expect(r.metrike[metrika].poDanu.every((n) => n === 0)).toBe(true);
    }
    expect(r.najotvaraniji).toEqual([]);
    expect(r.skenovi).toEqual([]);
    expect(r.sesije).toEqual({ broj: null, pokrivenost: null });
    expect(r.konverzije).toBeNull();
    expect(r.porudzbinePoKanalu).toEqual({ standard: 0, roomService: 0 });
    expect(r.zahteviOtkazao).toEqual({ gost: 0, osoblje: 0 });
    expect(r.rezervacije.otkazao).toEqual({ gost: 0, osoblje: 0 });
    for (const v of VRSTE_ZAHTEVA) expect(r.zahtevi[v]).toEqual({ poslato: 0, prihvaceno: 0, zavrseno: 0, otkazano: 0 });
  });

  test("bez-sesija has no sessions and no conversions", () => {
    const r = fixtureIzvestaj({ period: period(30), stanje: "bez-sesija", premium: true });
    expect(r.sesije).toEqual({ broj: null, pokrivenost: 0 });
    expect(r.konverzije).toBeNull();
    expect(r.metrike.otvaranja.ukupno).toBeGreaterThan(0);
    for (const metrika of ["otvaranjaSaSesijom", "sesije", "sesijeSaDetaljem", "sesijeSaZahtevom", "sesijeSaPorudzbinom", "sesijeSaRezervacijom"] as const) {
      expect(r.metrike[metrika].ukupno).toBe(0);
    }
    const puno = fixtureIzvestaj({ period: period(30), stanje: "puno", premium: true });
    expect(r.metrike.otvaranja).toEqual(puno.metrike.otvaranja);
    expect(r.metrike.zahtevi).toEqual(puno.metrike.zahtevi);
  });

  test("Standard has no previous period and no conversions, Premium has both", () => {
    const standard = fixtureIzvestaj({ period: period(30), stanje: "puno", premium: false });
    expect(standard.prethodni).toBeNull();
    expect(standard.konverzije).toBeNull();

    const premium = fixtureIzvestaj({ period: period(30), stanje: "puno", premium: true });
    expect(premium.konverzije).not.toBeNull();
    expect(premium.konverzije?.sesije).toBe(premium.sesije.broj);
    expect(premium.konverzije?.udeo.detalj).not.toBeNull();
    expect(premium.prethodni).not.toBeNull();
    expect(premium.prethodni?.period).toEqual(prethodniPeriod(period(30)));
    for (const metrika of METRIKE) {
      expect(premium.prethodni?.poredjenje[metrika].razlika).toBe(
        premium.metrike[metrika].ukupno - (premium.prethodni?.ukupno[metrika] ?? 0),
      );
    }
    const preDirekt = fixtureIzvestaj({ period: prethodniPeriod(period(30)), stanje: "puno", premium: false });
    expect(premium.prethodni?.ukupno.otvaranja).toBe(preDirekt.metrike.otvaranja.ukupno);
  });

  test("raspodela: day sums equal the metric, at most 20 values, no OSTALO key", () => {
    for (const stanje of ANALITIKA_FIXTURE_STANJA) {
      const izvestaj = fixtureIzvestaj({ period: period(30), stanje, premium: true });
      for (const metrika of METRIKE) {
        for (const dimenzija of DIMENZIJE) {
          const r = fixtureRaspodela({ period: period(30), stanje, metrika, dimenzija });
          expect(r.vrednosti.length).toBeLessThanOrEqual(20);
          expect(r.vrednosti.some((v) => v.vrednost === OSTALO)).toBe(false);
          if (!DEFINICIJE[metrika].dimenzije.includes(dimenzija)) {
            expect(r.vrednosti).toEqual([]);
            expect(r.ostalo.ukupno).toBe(0);
            continue;
          }
          const dani = izvestaj.metrike[metrika].poDanu;
          r.dani.forEach((_, index) => {
            const nasDan = zbir(r.vrednosti.map((v) => v.poDanu[index])) + r.ostalo.poDanu[index];
            expect(nasDan).toBe(dani[index]);
          });
          expect(zbir(r.vrednosti.map((v) => v.ukupno)) + r.ostalo.ukupno).toBe(izvestaj.metrike[metrika].ukupno);
          const ukupno = r.vrednosti.map((v) => v.ukupno);
          expect(ukupno).toEqual([...ukupno].sort((a, b) => b - a));
          for (const v of r.vrednosti) expect(v.ukupno).toBe(zbir(v.poDanu));
        }
      }
    }
  });

  test("raspodela: names are given for pages, articles and cards only", () => {
    const opcije = { period: period(7), stanje: "puno" as const };
    const stranica = fixtureRaspodela({ ...opcije, metrika: "otvaranja", dimenzija: "stranica" });
    expect(stranica.vrednosti.map((v) => v.naziv)).toEqual(["Hrana", "Pića", "Deserti"]);
    const artikal = fixtureRaspodela({ ...opcije, metrika: "detalji", dimenzija: "artikal" });
    expect(artikal.vrednosti.every((v) => v.naziv !== null)).toBe(true);
    expect(artikal.ostalo.ukupno).toBeGreaterThan(0);
    const kartica = fixtureRaspodela({ ...opcije, metrika: "skenovi", dimenzija: "kartica" });
    expect(kartica.vrednosti.every((v) => v.naziv !== null && /^card_demo_/.test(v.vrednost))).toBe(true);
    for (const [metrika, dimenzija] of [
      ["otvaranja", "jezik"],
      ["otvaranja", "uredjaj"],
      ["otvaranja", "sat"],
      ["zahtevi", "zahtev"],
      ["zahtevi", "kanal"],
      ["zahteviOtkazani", "ko"],
    ] as const) {
      const r = fixtureRaspodela({ ...opcije, metrika, dimenzija });
      expect(r.vrednosti.length).toBeGreaterThan(0);
      expect(r.vrednosti.every((v) => v.naziv === null)).toBe(true);
    }
    const sat = fixtureRaspodela({ ...opcije, metrika: "otvaranja", dimenzija: "sat" });
    expect(sat.vrednosti.every((v) => Number(v.vrednost) >= 8 && Number(v.vrednost) <= 23)).toBe(true);
    expect(fixtureRaspodela({ ...opcije, metrika: "zahtevi", dimenzija: "kanal" }).vrednosti.map((v) => v.vrednost)).toEqual(["standard"]);
  });

  test("no fixture contains an at sign", () => {
    for (const stanje of ANALITIKA_FIXTURE_STANJA as readonly AnalitikaFixtureStanje[]) {
      for (const premium of [false, true]) {
        expect(JSON.stringify(fixtureIzvestaj({ period: period(90), stanje, premium }))).not.toContain("@");
      }
      for (const dimenzija of DIMENZIJE) {
        expect(JSON.stringify(fixtureRaspodela({ period: period(90), stanje, metrika: "otvaranja", dimenzija }))).not.toContain("@");
      }
    }
  });
});
