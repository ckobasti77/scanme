// Izlog fixtures: invented analytics of "Demo restoran" for the preview of the
// Analitika section (K30). Deterministic: every day's numbers depend only on the
// day key and the state (seeded by a hash of the day, no Math.random, no clock),
// so the last 7 days look the same whether the period is 7, 30 or 90 days, and
// the previous period comes out of the same generator. Integer arithmetic keeps
// every total equal to the sum of its days and every split equal to its whole.

import {
  DEFINICIJE,
  METRIKE,
  OSTALO,
  pokrivenostSesija,
  procenat,
  sesijePouzdane,
  type Dimenzija,
  type Metrika,
} from "@/lib/menu/analitika/definicije";
import { VRSTE_ZAHTEVA, type IshodZahteva, type IzvestajAnalitike, type RaspodelaAnalitike, type VrstaZahteva } from "@/lib/menu/analitika/izvestaj";
import { brojDana, daniPerioda, poredi, prethodniPeriod, type Period } from "@/lib/menu/analitika/period";
import { danUBeogradu } from "@/lib/menu/analitika/vreme";
import { createRng, type Rng } from "./rng";
import { IZLOG_SADA } from "./lokal";

/** The Belgrade day of IZLOG_SADA ("2026-10-17"). */
export const IZLOG_DANAS = danUBeogradu(IZLOG_SADA);

export const ANALITIKA_FIXTURE_STANJA = ["puno", "malo-podataka", "prazno", "bez-sesija"] as const;
export type AnalitikaFixtureStanje = (typeof ANALITIKA_FIXTURE_STANJA)[number];

// -----------------------------------------------------------------------------
// Building blocks
// -----------------------------------------------------------------------------

/** FNV-1a: a stable seed out of a string. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    h ^= text.charCodeAt(index);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** `pct` percent of `n`, rounded up or down at random, so small counts still vary (never above `n`). */
function udeo(n: number, pct: number, rng: Rng): number {
  return Math.max(0, Math.min(n, Math.floor((n * pct) / 100 + rng.next())));
}

/** Largest-remainder split of `ukupno` by integer weights; the parts always add up to `ukupno`. */
function podeliCeo(ukupno: number, tezine: readonly number[]): number[] {
  const zbir = tezine.reduce((a, b) => a + b, 0);
  if (ukupno <= 0 || zbir <= 0) return tezine.map(() => 0);
  const delovi = tezine.map((tezina, index) => ({
    index,
    osnova: Math.floor((ukupno * tezina) / zbir),
    ostatak: (ukupno * tezina) % zbir,
  }));
  let preostalo = ukupno - delovi.reduce((a, d) => a + d.osnova, 0);
  const poRedu = [...delovi].sort((a, b) => b.ostatak - a.ostatak || a.index - b.index);
  const izlaz = delovi.map((d) => d.osnova);
  for (const deo of poRedu) {
    if (preostalo <= 0) break;
    izlaz[deo.index] += 1;
    preostalo -= 1;
  }
  return izlaz;
}

const zbir = (lista: readonly number[]): number => lista.reduce((a, b) => a + b, 0);

// -----------------------------------------------------------------------------
// One day
// -----------------------------------------------------------------------------

type PodaciDana = {
  metrike: Record<Metrika, number>;
  zahtevi: Record<VrstaZahteva, IshodZahteva>;
  roomService: number;
  /** Cancelled requests by the guest (the rest is staff). */
  zahteviOtkazaoGost: number;
  /** Cancelled reservations by the guest (the rest is staff). */
  rezervacijeOtkazaoGost: number;
};

function nulaDan(): PodaciDana {
  return {
    metrike: Object.fromEntries(METRIKE.map((m) => [m, 0])) as Record<Metrika, number>,
    zahtevi: {
      call: { poslato: 0, prihvaceno: 0, zavrseno: 0, otkazano: 0 },
      bill: { poslato: 0, prihvaceno: 0, zavrseno: 0, otkazano: 0 },
      order: { poslato: 0, prihvaceno: 0, zavrseno: 0, otkazano: 0 },
    },
    roomService: 0,
    zahteviOtkazaoGost: 0,
    rezervacijeOtkazaoGost: 0,
  };
}

/** The first day of "malo-podataka": the last four days up to IZLOG_DANAS. */
const MALO_OD = "2026-10-14";

/** Mon–Thu 95, Fri–Sat 150, Sun 110 menu opens before the ±15% noise. */
function osnovaOtvaranja(dan: string): number {
  const [y, m, d] = dan.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  if (dow === 5 || dow === 6) return 150;
  if (dow === 0) return 110;
  return 95;
}

function podaciDana(dan: string, stanje: AnalitikaFixtureStanje): PodaciDana {
  const malo = stanje === "malo-podataka";
  if (stanje === "prazno" || (malo && (dan < MALO_OD || dan > IZLOG_DANAS))) return nulaDan();

  const rng = createRng(hash(`${dan}|${malo ? "malo" : "puno"}`));
  const izlaz = nulaDan();
  const m = izlaz.metrike;

  const otvaranja = malo ? rng.int(2, 4) : Math.round(osnovaOtvaranja(dan) * (0.85 + 0.3 * rng.next()));
  const detalji = udeo(otvaranja, malo ? 40 : rng.int(35, 40), rng);
  const skenovi = udeo(otvaranja, malo ? 55 : rng.int(50, 60), rng);
  const poslatih = malo ? (dan === "2026-10-15" || dan === IZLOG_DANAS ? 1 : 0) : udeo(otvaranja, rng.int(14, 18), rng);
  const call = udeo(poslatih, 45, rng);
  const bill = Math.min(poslatih - call, udeo(poslatih, 35, rng));
  const order = poslatih - call - bill;
  const rezervacija = malo ? (dan === "2026-10-16" ? 1 : 0) : rng.int(0, 3) + (osnovaOtvaranja(dan) === 150 ? 1 : 0);

  const poslato: Record<VrstaZahteva, number> = { call, bill, order };
  for (const vrsta of VRSTE_ZAHTEVA) {
    const p = poslato[vrsta];
    const prihvaceno = p - udeo(p, 5, rng);
    izlaz.zahtevi[vrsta] = {
      poslato: p,
      prihvaceno,
      zavrseno: Math.min(prihvaceno, p - udeo(p, 10, rng)),
      otkazano: udeo(p, 4, rng),
    };
  }
  izlaz.roomService = udeo(order, 15, rng);
  const otkazanoZahteva = zbir(VRSTE_ZAHTEVA.map((v) => izlaz.zahtevi[v].otkazano));
  izlaz.zahteviOtkazaoGost = udeo(otkazanoZahteva, 60, rng);

  const prihvacene = udeo(rezervacija, 70, rng);
  const odbijene = Math.min(rezervacija - prihvacene, udeo(rezervacija, 10, rng));
  const predlozi = Math.min(rezervacija - prihvacene - odbijene, udeo(rezervacija, 10, rng));
  const realizovane = Math.min(prihvacene, udeo(rezervacija, 55, rng));
  const otkazane = udeo(rezervacija, 8, rng);
  izlaz.rezervacijeOtkazaoGost = udeo(otkazane, 60, rng);

  const imaSesije = stanje !== "bez-sesija";
  const sesije = !imaSesije ? 0 : malo ? otvaranja - (otvaranja >= 3 && rng.next() < 0.35 ? 1 : 0) : udeo(otvaranja, 45, rng);
  const saDetaljem = udeo(sesije, 50, rng);
  const saZahtevom = Math.min(udeo(sesije, 25, rng), poslatih);
  const saPorudzbinom = Math.min(udeo(sesije, 7, rng), saZahtevom, order);
  const saRezervacijom = Math.min(udeo(sesije, 2, rng), rezervacija);

  Object.assign(m, {
    otvaranja,
    otvaranjaSaSesijom: imaSesije ? otvaranja : 0,
    detalji,
    skenovi,
    zahtevi: poslatih,
    porudzbine: order,
    zahteviPrihvaceni: zbir(VRSTE_ZAHTEVA.map((v) => izlaz.zahtevi[v].prihvaceno)),
    zahteviZavrseni: zbir(VRSTE_ZAHTEVA.map((v) => izlaz.zahtevi[v].zavrseno)),
    zahteviOtkazani: otkazanoZahteva,
    rezervacije: rezervacija,
    rezervacijePrihvacene: prihvacene,
    rezervacijeOdbijene: odbijene,
    rezervacijePredlozi: predlozi,
    rezervacijeRealizovane: realizovane,
    rezervacijeOtkazane: otkazane,
    sesije,
    sesijeSaDetaljem: saDetaljem,
    sesijeSaZahtevom: saZahtevom,
    sesijeSaPorudzbinom: saPorudzbinom,
    sesijeSaRezervacijom: saRezervacijom,
  });
  return izlaz;
}

// -----------------------------------------------------------------------------
// Breakdowns of one day
// -----------------------------------------------------------------------------

type Stavka = { vrednost: string; naziv: string | null; tezina: number };

/** The invented dishes and drinks, most opened first (keys are `ar_` + 8). */
const ARTIKLI: readonly { vrednost: string; naziv: string }[] = [
  { vrednost: "ar_cevapi01", naziv: "Ćevapi u lepinji" },
  { vrednost: "ar_snicla01", naziv: "Karađorđeva šnicla" },
  { vrednost: "ar_sopska01", naziv: "Šopska salata" },
  { vrednost: "ar_limun001", naziv: "Domaća limunada" },
  { vrednost: "ar_corba001", naziv: "Teleća čorba" },
  { vrednost: "ar_pljes001", naziv: "Pljeskavica sa kajmakom" },
  { vrednost: "ar_tirami01", naziv: "Tiramisu" },
  { vrednost: "ar_pastrm01", naziv: "Pastrmka na žaru" },
  { vrednost: "ar_espres01", naziv: "Espresso" },
  { vrednost: "ar_palac001", naziv: "Palačinke sa orasima" },
];
/** The share of article opens that the ten listed items hold (the rest is "ostalo"). */
const UDEO_ARTIKALA = 70;

const STRANICE: readonly Stavka[] = [
  { vrednost: "pg_hrana01", naziv: "Hrana", tezina: 55 },
  { vrednost: "pg_pica0001", naziv: "Pića", tezina: 35 },
  { vrednost: "pg_deserti1", naziv: "Deserti", tezina: 10 },
];

const JEZICI: readonly Stavka[] = [
  { vrednost: "sr", naziv: null, tezina: 62 },
  { vrednost: "en", naziv: null, tezina: 30 },
  { vrednost: "de", naziv: null, tezina: 8 },
];

const UREDJAJI_STAVKE: readonly Stavka[] = [
  { vrednost: "telefon", naziv: null, tezina: 86 },
  { vrednost: "racunar", naziv: null, tezina: 9 },
  { vrednost: "tablet", naziv: null, tezina: 5 },
];

/** Hours 8–23, busiest around lunch (12–14) and dinner (19–21). */
const SATI: readonly Stavka[] = [1, 2, 3, 5, 9, 10, 8, 4, 3, 4, 6, 9, 10, 8, 4, 2].map((tezina, index) => ({
  vrednost: String(8 + index),
  naziv: null,
  tezina,
}));

/** Card labels in the order of their ids (`card_demo_01` … `card_demo_17`). */
const KARTICE_NAZIVI: readonly string[] = [
  ...Array.from({ length: 12 }, (_, index) => `Sto ${index + 1}`),
  ...Array.from({ length: 4 }, (_, index) => `Terasa ${index + 1}`),
  "Šank",
];
/** Most scanned first. */
const KARTICE_REDOSLED: readonly string[] = [
  "Sto 4", "Sto 2", "Šank", "Terasa 1", "Sto 7", "Sto 1", "Sto 9", "Terasa 2", "Sto 5",
  "Sto 11", "Sto 3", "Terasa 3", "Sto 8", "Sto 6", "Sto 12", "Sto 10", "Terasa 4",
];
const kartica = (naziv: string): { vrednost: string; naziv: string } => ({
  vrednost: `card_demo_${String(KARTICE_NAZIVI.indexOf(naziv) + 1).padStart(2, "0")}`,
  naziv,
});

/** A Zipf-like weight for the item at `mesto` (0 = the first). */
const zipf = (mesto: number, izlozilac: number): number => Math.round(10000 / (mesto + 1) ** izlozilac);

function stavkeZa(dimenzija: Dimenzija): Stavka[] {
  switch (dimenzija) {
    case "artikal": {
      const stavke: Stavka[] = ARTIKLI.map((a, mesto) => ({ ...a, tezina: zipf(mesto, 0.9) }));
      // The rest of the menu: what is left of the whole after the ten items hold their share.
      const ostatak = Math.round((zbir(stavke.map((s) => s.tezina)) * (100 - UDEO_ARTIKALA)) / UDEO_ARTIKALA);
      return [...stavke, { vrednost: OSTALO, naziv: null, tezina: ostatak }];
    }
    case "kartica":
      return KARTICE_REDOSLED.map((naziv, mesto) => ({ ...kartica(naziv), tezina: zipf(mesto, 0.75) }));
    case "stranica":
      return [...STRANICE];
    case "jezik":
      return [...JEZICI];
    case "uredjaj":
      return [...UREDJAJI_STAVKE];
    case "sat":
      return [...SATI];
    default:
      return [];
  }
}

/** Metric → the field of the per-type outcome it reads. */
const ISHOD_METRIKE: Partial<Record<Metrika, keyof IshodZahteva>> = {
  zahtevi: "poslato",
  zahteviPrihvaceni: "prihvaceno",
  zahteviZavrseni: "zavrseno",
  zahteviOtkazani: "otkazano",
};

type DeoDana = { vrednost: string; naziv: string | null; broj: number };

/** One day's value of `metrika` split by `dimenzija`; the parts add up to the day's value. */
function raspodelaDana(dan: string, podaci: PodaciDana, metrika: Metrika, dimenzija: Dimenzija): DeoDana[] {
  if (!DEFINICIJE[metrika].dimenzije.includes(dimenzija)) return [];
  const ukupno = podaci.metrike[metrika];
  switch (dimenzija) {
    case "zahtev": {
      const polje = ISHOD_METRIKE[metrika];
      return polje ? VRSTE_ZAHTEVA.map((v) => ({ vrednost: v, naziv: null, broj: podaci.zahtevi[v][polje] })) : [];
    }
    case "kanal":
      return [{ vrednost: "standard", naziv: null, broj: ukupno }];
    case "ko": {
      const gost = metrika === "zahteviOtkazani" ? podaci.zahteviOtkazaoGost : podaci.rezervacijeOtkazaoGost;
      return [
        { vrednost: "guest", naziv: null, broj: gost },
        { vrednost: "staff", naziv: null, broj: ukupno - gost },
      ];
    }
    default: {
      const stavke = stavkeZa(dimenzija);
      const rng = createRng(hash(`${dan}|${metrika}|${dimenzija}`));
      // A little noise per day (±8%) so the shares are not the same every day.
      const tezine = stavke.map((s) => Math.max(1, Math.round(s.tezina * 10 * (0.92 + 0.16 * rng.next()))));
      const delovi = podeliCeo(ukupno, tezine);
      return stavke.map((s, index) => ({ vrednost: s.vrednost, naziv: s.naziv, broj: delovi[index] }));
    }
  }
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

const MAX_VREDNOSTI = 20;

type Opcije = { period: Period; stanje: AnalitikaFixtureStanje };

function nizDana(opcije: Opcije): { dani: string[]; podaci: PodaciDana[] } {
  const dani = daniPerioda(opcije.period);
  return { dani, podaci: dani.map((dan) => podaciDana(dan, opcije.stanje)) };
}

function ukupnoMetrike(podaci: readonly PodaciDana[], metrika: Metrika): number {
  return zbir(podaci.map((d) => d.metrike[metrika]));
}

/** Values summed over the days, the largest first, only those above zero. */
function zbirPoVrednostima(dani: readonly string[], podaci: readonly PodaciDana[], metrika: Metrika, dimenzija: Dimenzija) {
  const redovi = new Map<string, { naziv: string | null; poDanu: number[] }>();
  const ostalo = dani.map(() => 0);
  dani.forEach((dan, index) => {
    for (const deo of raspodelaDana(dan, podaci[index], metrika, dimenzija)) {
      if (deo.vrednost === OSTALO) {
        ostalo[index] += deo.broj;
        continue;
      }
      let red = redovi.get(deo.vrednost);
      if (!red) {
        red = { naziv: deo.naziv, poDanu: dani.map(() => 0) };
        redovi.set(deo.vrednost, red);
      }
      red.poDanu[index] = deo.broj;
    }
  });
  const lista = [...redovi.entries()]
    .map(([vrednost, red]) => ({ vrednost, naziv: red.naziv, ukupno: zbir(red.poDanu), poDanu: red.poDanu }))
    .filter((red) => red.ukupno > 0)
    .sort((a, b) => b.ukupno - a.ukupno);
  return { lista, ostalo };
}

export function fixtureIzvestaj(opcije: { period: Period; stanje: AnalitikaFixtureStanje; premium: boolean }): IzvestajAnalitike {
  const { period, stanje, premium } = opcije;
  const { dani, podaci } = nizDana(opcije);

  const metrike = Object.fromEntries(
    METRIKE.map((metrika) => [
      metrika,
      { ukupno: ukupnoMetrike(podaci, metrika), poDanu: podaci.map((d) => d.metrike[metrika]) },
    ]),
  ) as unknown as IzvestajAnalitike["metrike"];

  const zahtevi = Object.fromEntries(
    VRSTE_ZAHTEVA.map((vrsta) => [
      vrsta,
      {
        poslato: zbir(podaci.map((d) => d.zahtevi[vrsta].poslato)),
        prihvaceno: zbir(podaci.map((d) => d.zahtevi[vrsta].prihvaceno)),
        zavrseno: zbir(podaci.map((d) => d.zahtevi[vrsta].zavrseno)),
        otkazano: zbir(podaci.map((d) => d.zahtevi[vrsta].otkazano)),
      },
    ]),
  ) as IzvestajAnalitike["zahtevi"];

  const roomService = premium ? zbir(podaci.map((d) => d.roomService)) : 0;
  const zahteviOtkazaoGost = zbir(podaci.map((d) => d.zahteviOtkazaoGost));
  const rezervacijeOtkazaoGost = zbir(podaci.map((d) => d.rezervacijeOtkazaoGost));

  const otvaranja = metrike.otvaranja.ukupno;
  const pouzdane = sesijePouzdane(metrike.otvaranjaSaSesijom.ukupno, otvaranja);
  const sesijaUkupno = metrike.sesije.ukupno;

  const artikli = zbirPoVrednostima(dani, podaci, "detalji", "artikal");
  const kartice = zbirPoVrednostima(dani, podaci, "skenovi", "kartica");
  const nazivArtikla = new Map(ARTIKLI.map((a) => [a.vrednost, a.naziv]));

  let prethodni: IzvestajAnalitike["prethodni"] = null;
  if (premium) {
    const pre = prethodniPeriod(period);
    const preDani = daniPerioda(pre).map((dan) => podaciDana(dan, stanje));
    const ukupno = Object.fromEntries(METRIKE.map((metrika) => [metrika, ukupnoMetrike(preDani, metrika)])) as Record<Metrika, number>;
    const poredjenje = Object.fromEntries(METRIKE.map((metrika) => [metrika, poredi(metrike[metrika].ukupno, ukupno[metrika])])) as unknown as NonNullable<IzvestajAnalitike["prethodni"]>["poredjenje"];
    prethodni = { period: pre, ukupno, poredjenje };
  }

  return {
    period: { ...period, dana: brojDana(period) },
    dani,
    metrike,
    zahtevi,
    porudzbinePoKanalu: { standard: metrike.porudzbine.ukupno - roomService, roomService },
    zahteviOtkazao: { gost: zahteviOtkazaoGost, osoblje: metrike.zahteviOtkazani.ukupno - zahteviOtkazaoGost },
    rezervacije: {
      poslato: metrike.rezervacije.ukupno,
      prihvaceno: metrike.rezervacijePrihvacene.ukupno,
      odbijeno: metrike.rezervacijeOdbijene.ukupno,
      predlozeno: metrike.rezervacijePredlozi.ukupno,
      realizovano: metrike.rezervacijeRealizovane.ukupno,
      otkazano: metrike.rezervacijeOtkazane.ukupno,
      otkazao: { gost: rezervacijeOtkazaoGost, osoblje: metrike.rezervacijeOtkazane.ukupno - rezervacijeOtkazaoGost },
    },
    sesije: {
      broj: pouzdane ? sesijaUkupno : null,
      pokrivenost: pokrivenostSesija(metrike.otvaranjaSaSesijom.ukupno, otvaranja),
    },
    najotvaraniji: artikli.lista.slice(0, 10).map((red) => ({
      artikal: red.vrednost,
      naziv: nazivArtikla.get(red.vrednost) ?? red.vrednost,
      broj: red.ukupno,
    })),
    skenovi: kartice.lista.slice(0, 20).map((red) => ({ kartica: red.vrednost, naziv: red.naziv ?? red.vrednost, broj: red.ukupno })),
    konverzije:
      premium && pouzdane
        ? {
            sesije: sesijaUkupno,
            saDetaljem: metrike.sesijeSaDetaljem.ukupno,
            saZahtevom: metrike.sesijeSaZahtevom.ukupno,
            saPorudzbinom: metrike.sesijeSaPorudzbinom.ukupno,
            saRezervacijom: metrike.sesijeSaRezervacijom.ukupno,
            udeo: {
              detalj: procenat(metrike.sesijeSaDetaljem.ukupno, sesijaUkupno),
              zahtev: procenat(metrike.sesijeSaZahtevom.ukupno, sesijaUkupno),
              porudzbina: procenat(metrike.sesijeSaPorudzbinom.ukupno, sesijaUkupno),
              rezervacija: procenat(metrike.sesijeSaRezervacijom.ukupno, sesijaUkupno),
            },
          }
        : null,
    prethodni,
  };
}

export function fixtureRaspodela(opcije: {
  period: Period;
  stanje: AnalitikaFixtureStanje;
  metrika: Metrika;
  dimenzija: Dimenzija;
}): RaspodelaAnalitike {
  const { period, metrika, dimenzija } = opcije;
  const { dani, podaci } = nizDana(opcije);
  const { lista, ostaloPoDanu } = (() => {
    const { lista: sve, ostalo } = zbirPoVrednostima(dani, podaci, metrika, dimenzija);
    // Whatever does not fit in the first 20 goes into "ostalo".
    const ostaloPoDanu = [...ostalo];
    for (const red of sve.slice(MAX_VREDNOSTI)) red.poDanu.forEach((broj, index) => (ostaloPoDanu[index] += broj));
    return { lista: sve.slice(0, MAX_VREDNOSTI), ostaloPoDanu };
  })();

  return {
    period: { ...period, dana: brojDana(period) },
    dani,
    metrika,
    dimenzija,
    vrednosti: lista,
    ostalo: { ukupno: zbir(ostaloPoDanu), poDanu: ostaloPoDanu },
  };
}
