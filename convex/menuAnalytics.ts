import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { activeMenuServiceForBusiness, getMenuAccess } from "./lib/menuAccess";
import {
  menuAnalyticsDeviceValidator,
  menuAnalyticsDimensionValidator,
  menuAnalyticsIncomingEventValidator,
  menuAnalyticsMetricValidator,
} from "./lib/menuAnalyticsValidators";
import { requireMenuCapability } from "./lib/menuCapabilities";
import { rateLimiter } from "./lib/rateLimits";
import { activeBusinessBySlug, isPubliclyServed } from "./menuPublic";
import { menuCardRows } from "./menuQr";
import {
  MAX_DANA_PERIODA,
  MAX_DOGADJAJA_PO_POZIVU,
  METRIKE,
  OSTALO,
  pokrivenostSesija,
  procenat,
  sesijePouzdane,
  type Dimenzija,
  type Metrika,
} from "../lib/menu/analitika/definicije";
import {
  brojDana,
  daniPerioda,
  jeDan,
  poredi,
  poslednjihDana,
  prethodniPeriod,
  proveriPeriod,
  type Period,
  type Poredjenje,
} from "../lib/menu/analitika/period";
import { ocistiDogadjaj } from "../lib/menu/analitika/prijem";
import { danUBeogradu, satUBeogradu } from "../lib/menu/analitika/vreme";
import { ANALYTICS_ERROR } from "../lib/menu/errors/analytics";

// =============================================================================
// ScanMe Menu V1 (K29) — analytics: the ingest of the public menu's browser
// events and the panel queries (master §14; every number is defined in
// docs/menu/ANALITIKA-DEFINICIJE.md, which K30 explains from).
//
// ingest   (public; called only by app/api/meni/analitika/route.ts, which
//          drops bots and signed-in ScanMe users and hashes the IP) — 1–10
//          events, known kinds and key shapes only, bucket menuAnalyticsIp
//          per IP hash. Inserts raw rows only: no counter, no fanout. Like the
//          card scan counters, a determined caller can inflate these
//          non-monetary numbers; nothing depends on them for security.
// pregled  (Standard) the last 7 or 30 days.
// period   (Premium, advancedAnalytics) a custom period ≤ 366 days within
//          24 months, the conversion flow and the previous period.
// raspodela (Premium) one metric by one dimension: the filters.
// Every query needs `analytics.read` on the service (Vlasnik, Menadžer,
// ScanMe admin) and returns null otherwise; the device sends `danas` (its
// Belgrade day), so no query reads the clock. Reads are bounded: one totals
// row and one breakdown row per day of the period, the venue's Menu cards.
// =============================================================================

const IP_HASH_PATTERN = /^[0-9a-f]{16,64}$/;
const ipKeyOf = (ipHash: string | undefined) => (ipHash && IP_HASH_PATTERN.test(ipHash) ? ipHash : "shared");

/** The most top articles / cards / breakdown values a query returns. */
const TOP_ARTIKALA = 10;
/** Article keys checked against the menu for the top list (removed articles are skipped): a bound on reads. */
const MAX_KANDIDATA_ARTIKALA = 50;
const TOP_VREDNOSTI = 20;
/** Scans of the days the scans cron has not moved yet are read live, at most this many days. */
const MAX_DANA_SKENOVA_UZIVO = 3;

export const ingest = mutation({
  args: {
    slug: v.string(),
    ipHash: v.optional(v.string()),
    uredjaj: menuAnalyticsDeviceValidator,
    dogadjaji: v.array(menuAnalyticsIncomingEventValidator),
  },
  handler: async (ctx, args) => {
    const odbijeno = { ok: false as const, primljeno: 0 };
    if (args.dogadjaji.length === 0 || args.dogadjaji.length > MAX_DOGADJAJA_PO_POZIVU) return odbijeno;
    const business = await activeBusinessBySlug(ctx, args.slug);
    if (!business) return odbijeno;
    const menuService = await activeMenuServiceForBusiness(ctx, business._id);
    if (!menuService || !(await isPubliclyServed(ctx, menuService))) return odbijeno;
    const limit = await rateLimiter.limit(ctx, "menuAnalyticsIp", {
      key: ipKeyOf(args.ipHash),
      count: args.dogadjaji.length,
    });
    if (!limit.ok) return odbijeno;

    const now = Date.now();
    const vreme = { occurredAt: now, dayKey: danUBeogradu(now), sat: satUBeogradu(now) };
    let primljeno = 0;
    for (const ulaz of args.dogadjaji) {
      const cist = ocistiDogadjaj(ulaz, { sesijaDozvoljena: true });
      if (!cist) continue;
      const kartica = cist.kartica ? ctx.db.normalizeId("cards", cist.kartica) : null;
      await ctx.db.insert("menuAnalyticsEvents", {
        menuServiceId: menuService._id,
        vrsta: cist.vrsta,
        ...vreme,
        uredjaj: args.uredjaj,
        ...(cist.stranica ? { stranica: cist.stranica } : {}),
        ...(cist.artikal ? { artikal: cist.artikal } : {}),
        ...(kartica ? { kartica } : {}),
        ...(cist.jezik ? { jezik: cist.jezik } : {}),
        ...(cist.korak ? { korak: cist.korak } : {}),
        ...(cist.sesija ? { sesija: cist.sesija } : {}),
      });
      primljeno += 1;
    }
    return { ok: true as const, primljeno };
  },
});

// -----------------------------------------------------------------------------
// Reading
// -----------------------------------------------------------------------------

type Dani = {
  zbirovi: Map<string, Record<string, number>>;
  raspodele: Map<string, Doc<"menuAnalyticsDailyDims">["po"]>;
};

async function citajDane(
  ctx: QueryCtx,
  menuServiceId: Id<"menuServices">,
  period: Period,
  saRaspodelama: boolean,
  saZbirovima = true,
): Promise<Dani> {
  const [zbirovi, raspodele] = await Promise.all([
    // K30: a breakdown never reads the daily totals (up to 366 rows saved per call).
    saZbirovima
      ? ctx.db
          .query("menuAnalyticsDaily")
          .withIndex("by_menuServiceId_and_dayKey", (q) => q.eq("menuServiceId", menuServiceId).gte("dayKey", period.od).lte("dayKey", period.do))
          .take(MAX_DANA_PERIODA + 1)
      : Promise.resolve([]),
    saRaspodelama
      ? ctx.db
          .query("menuAnalyticsDailyDims")
          .withIndex("by_menuServiceId_and_dayKey", (q) => q.eq("menuServiceId", menuServiceId).gte("dayKey", period.od).lte("dayKey", period.do))
          .take(MAX_DANA_PERIODA + 1)
      : Promise.resolve([]),
  ]);
  return {
    zbirovi: new Map(zbirovi.map((row) => [row.dayKey, row.brojevi])),
    raspodele: new Map(raspodele.map((row) => [row.dayKey, row.po])),
  };
}

/** The scans of the days the scans cron has not moved into the daily rows yet (read live per card). */
async function skenoviUzivo(
  ctx: QueryCtx,
  kartice: Doc<"cards">[],
  dani: string[],
): Promise<Map<string, Map<Id<"cards">, number>>> {
  const kursor = await ctx.db
    .query("menuAnalyticsCursors")
    .withIndex("by_kljuc", (q) => q.eq("kljuc", "skenovi"))
    .unique();
  // A day being moved right now is left to the cron (never counted twice).
  const preneto = kursor?.radniDan ?? kursor?.dan ?? null;
  const uzivo = dani.filter((dan) => preneto === null || dan > preneto).slice(-MAX_DANA_SKENOVA_UZIVO);
  const izlaz = new Map<string, Map<Id<"cards">, number>>();
  for (const dan of uzivo) {
    const poKartici = new Map<Id<"cards">, number>();
    for (const card of kartice) {
      const row = await ctx.db
        .query("dailyCardMetrics")
        .withIndex("by_cardId_and_dateKey", (q) => q.eq("cardId", card._id).eq("dateKey", dan))
        .unique();
      if (row && row.scans > 0) poKartici.set(card._id, row.scans);
    }
    izlaz.set(dan, poKartici);
  }
  return izlaz;
}

function vrednostDimenzije(
  raspodela: Doc<"menuAnalyticsDailyDims">["po"] | undefined,
  metrika: Metrika,
  dimenzija: Dimenzija,
): Record<string, number> {
  return raspodela?.[metrika]?.[dimenzija] ?? {};
}

function zbirDimenzije(dani: Dani, metrika: Metrika, dimenzija: Dimenzija): Map<string, number> {
  const izlaz = new Map<string, number>();
  for (const raspodela of dani.raspodele.values()) {
    for (const [vrednost, broj] of Object.entries(vrednostDimenzije(raspodela, metrika, dimenzija))) {
      izlaz.set(vrednost, (izlaz.get(vrednost) ?? 0) + broj);
    }
  }
  return izlaz;
}

type MetrikaNiz = { ukupno: number; poDanu: number[] };

function nizovi(dani: string[], citano: Dani, skenovi: Map<string, Map<Id<"cards">, number>>): Record<Metrika, MetrikaNiz> {
  const izlaz = {} as Record<Metrika, MetrikaNiz>;
  for (const metrika of METRIKE) {
    const poDanu = dani.map((dan) => {
      const uzivo = metrika === "skenovi" ? skenovi.get(dan) : undefined;
      if (uzivo) return [...uzivo.values()].reduce((a, b) => a + b, 0);
      return citano.zbirovi.get(dan)?.[metrika] ?? 0;
    });
    izlaz[metrika] = { ukupno: poDanu.reduce((a, b) => a + b, 0), poDanu };
  }
  return izlaz;
}

type IshodZahteva = { poslato: number; prihvaceno: number; zavrseno: number; otkazano: number };
const VRSTE_ZAHTEVA = ["call", "bill", "order"] as const;

async function naziviArtikala(
  ctx: QueryCtx,
  menuServiceId: Id<"menuServices">,
  kandidati: [string, number][],
): Promise<{ artikal: string; naziv: string; broj: number }[]> {
  const izlaz: { artikal: string; naziv: string; broj: number }[] = [];
  for (const [artikal, broj] of kandidati) {
    if (izlaz.length >= TOP_ARTIKALA) break;
    const row = await ctx.db
      .query("menuArticles")
      .withIndex("by_menuServiceId_and_key", (q) => q.eq("menuServiceId", menuServiceId).eq("key", artikal))
      .unique();
    // An article no longer in the menu is not in the top list (definitions §5).
    if (row) izlaz.push({ artikal, naziv: row.name, broj });
  }
  return izlaz;
}

function poredjaj(mapa: Map<string, number>): [string, number][] {
  return [...mapa.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

async function izvestaj(
  ctx: QueryCtx,
  menuService: Doc<"menuServices">,
  period: Period,
  opcije: { konverzije: boolean; poredi: boolean },
) {
  const dani = daniPerioda(period);
  const [citano, kartice] = await Promise.all([
    citajDane(ctx, menuService._id, period, true),
    menuCardRows(ctx, menuService._id, menuService.businessId),
  ]);
  const karticeUsluge = kartice.rows.map((row) => row.card);
  const skenovi = await skenoviUzivo(ctx, karticeUsluge, dani);
  const metrike = nizovi(dani, citano, skenovi);
  const ukupno = (metrika: Metrika) => metrike[metrika].ukupno;

  // Requests by kind and their outcomes; orders by channel.
  const poVrsti = (metrika: Metrika) => zbirDimenzije(citano, metrika, "zahtev");
  const [poslato, prihvaceno, zavrseno, otkazano] = (
    ["zahtevi", "zahteviPrihvaceni", "zahteviZavrseni", "zahteviOtkazani"] as const
  ).map(poVrsti);
  const zahtevi = Object.fromEntries(
    VRSTE_ZAHTEVA.map((vrsta) => [
      vrsta,
      {
        poslato: poslato.get(vrsta) ?? 0,
        prihvaceno: prihvaceno.get(vrsta) ?? 0,
        zavrseno: zavrseno.get(vrsta) ?? 0,
        otkazano: otkazano.get(vrsta) ?? 0,
      },
    ]),
  ) as Record<(typeof VRSTE_ZAHTEVA)[number], IshodZahteva>;
  const otkazaoZahtev = zbirDimenzije(citano, "zahteviOtkazani", "ko");
  const otkazaoRezervaciju = zbirDimenzije(citano, "rezervacijeOtkazane", "ko");
  const kanali = zbirDimenzije(citano, "porudzbine", "kanal");

  // Sessions only when (almost) every open carried an identifier (definitions §3).
  const pouzdano = sesijePouzdane(ukupno("otvaranjaSaSesijom"), ukupno("otvaranja"));
  const sesije = {
    broj: pouzdano ? ukupno("sesije") : null,
    pokrivenost: pokrivenostSesija(ukupno("otvaranjaSaSesijom"), ukupno("otvaranja")),
  };

  // Top articles (names from the menu; removed articles are left out) and scans per card.
  const najotvaraniji = await naziviArtikala(
    ctx,
    menuService._id,
    poredjaj(zbirDimenzije(citano, "detalji", "artikal")).slice(0, MAX_KANDIDATA_ARTIKALA),
  );
  const poKartici = zbirDimenzije(citano, "skenovi", "kartica");
  for (const poDanu of skenovi.values()) {
    for (const [cardId, broj] of poDanu) poKartici.set(cardId, (poKartici.get(cardId) ?? 0) + broj);
  }
  const naziviKartica = new Map(karticeUsluge.map((card) => [card._id as string, card.label]));
  const skenoviPoKartici = poredjaj(poKartici)
    .filter(([cardId]) => naziviKartica.has(cardId))
    .slice(0, TOP_VREDNOSTI)
    .map(([cardId, broj]) => ({ kartica: cardId as Id<"cards">, naziv: naziviKartica.get(cardId) ?? "", broj }));

  const konverzije =
    opcije.konverzije && sesije.broj !== null
      ? {
          sesije: sesije.broj,
          saDetaljem: ukupno("sesijeSaDetaljem"),
          saZahtevom: ukupno("sesijeSaZahtevom"),
          saPorudzbinom: ukupno("sesijeSaPorudzbinom"),
          saRezervacijom: ukupno("sesijeSaRezervacijom"),
          udeo: {
            detalj: procenat(ukupno("sesijeSaDetaljem"), sesije.broj),
            zahtev: procenat(ukupno("sesijeSaZahtevom"), sesije.broj),
            porudzbina: procenat(ukupno("sesijeSaPorudzbinom"), sesije.broj),
            rezervacija: procenat(ukupno("sesijeSaRezervacijom"), sesije.broj),
          },
        }
      : null;

  let prethodni: { period: Period; ukupno: Record<Metrika, number>; poredjenje: Record<Metrika, Poredjenje> } | null = null;
  if (opcije.poredi) {
    const ranije = prethodniPeriod(period);
    const citanoRanije = await citajDane(ctx, menuService._id, ranije, false);
    const ukupnoRanije = {} as Record<Metrika, number>;
    const poredjenje = {} as Record<Metrika, Poredjenje>;
    for (const metrika of METRIKE) {
      let zbir = 0;
      for (const brojevi of citanoRanije.zbirovi.values()) zbir += brojevi[metrika] ?? 0;
      ukupnoRanije[metrika] = zbir;
      poredjenje[metrika] = poredi(ukupno(metrika), zbir);
    }
    prethodni = { period: ranije, ukupno: ukupnoRanije, poredjenje };
  }

  return {
    period: { ...period, dana: brojDana(period) },
    dani,
    metrike,
    zahtevi,
    porudzbinePoKanalu: { standard: kanali.get("standard") ?? 0, roomService: kanali.get("room_service") ?? 0 },
    zahteviOtkazao: { gost: otkazaoZahtev.get("guest") ?? 0, osoblje: otkazaoZahtev.get("staff") ?? 0 },
    rezervacije: {
      poslato: ukupno("rezervacije"),
      prihvaceno: ukupno("rezervacijePrihvacene"),
      odbijeno: ukupno("rezervacijeOdbijene"),
      predlozeno: ukupno("rezervacijePredlozi"),
      realizovano: ukupno("rezervacijeRealizovane"),
      otkazano: ukupno("rezervacijeOtkazane"),
      otkazao: { gost: otkazaoRezervaciju.get("guest") ?? 0, osoblje: otkazaoRezervaciju.get("staff") ?? 0 },
    },
    sesije,
    najotvaraniji,
    skenovi: skenoviPoKartici,
    konverzije,
    prethodni,
  };
}

export type MenuAnalyticsReport = Awaited<ReturnType<typeof izvestaj>>;

export const pregled = query({
  args: {
    menuServiceId: v.id("menuServices"),
    danas: v.string(),
    dana: v.union(v.literal(7), v.literal(30)),
  },
  handler: async (ctx, args) => {
    const access = await getMenuAccess(ctx, { menuServiceId: args.menuServiceId }, "analytics.read");
    if (!access || !jeDan(args.danas)) return null;
    return await izvestaj(ctx, access.menuService, poslednjihDana(args.danas, args.dana), {
      konverzije: false,
      poredi: false,
    });
  },
});

const periodArgs = {
  menuServiceId: v.id("menuServices"),
  danas: v.string(),
  od: v.string(),
  do: v.string(),
};

export const period = query({
  args: { ...periodArgs, poredi: v.boolean() },
  handler: async (ctx, args) => {
    const access = await getMenuAccess(ctx, { menuServiceId: args.menuServiceId }, "analytics.read");
    if (!access) return null;
    await requireMenuCapability(ctx, access.business._id, "advancedAnalytics");
    const izabran = { od: args.od, do: args.do };
    if (proveriPeriod(izabran, args.danas)) throw new ConvexError(ANALYTICS_ERROR.invalidPeriod);
    return await izvestaj(ctx, access.menuService, izabran, { konverzije: true, poredi: args.poredi });
  },
});

export const raspodela = query({
  args: { ...periodArgs, metrika: menuAnalyticsMetricValidator, dimenzija: menuAnalyticsDimensionValidator },
  handler: async (ctx, args) => {
    const access = await getMenuAccess(ctx, { menuServiceId: args.menuServiceId }, "analytics.read");
    if (!access) return null;
    await requireMenuCapability(ctx, access.business._id, "advancedAnalytics");
    const izabran = { od: args.od, do: args.do };
    if (proveriPeriod(izabran, args.danas)) throw new ConvexError(ANALYTICS_ERROR.invalidPeriod);

    const menuService = access.menuService;
    const dani = daniPerioda(izabran);
    const citano = await citajDane(ctx, menuService._id, izabran, true, false);
    const nizovi = new Map<string, number[]>();
    const dodaj = (vrednost: string, indeks: number, broj: number) => {
      const niz = nizovi.get(vrednost) ?? dani.map(() => 0);
      niz[indeks] += broj;
      nizovi.set(vrednost, niz);
    };
    dani.forEach((dan, indeks) => {
      for (const [vrednost, broj] of Object.entries(vrednostDimenzije(citano.raspodele.get(dan), args.metrika, args.dimenzija))) {
        dodaj(vrednost, indeks, broj);
      }
    });
    let kartice: Doc<"cards">[] = [];
    if (args.metrika === "skenovi" || args.dimenzija === "kartica") {
      kartice = (await menuCardRows(ctx, menuService._id, menuService.businessId)).rows.map((row) => row.card);
    }
    if (args.metrika === "skenovi" && args.dimenzija === "kartica") {
      const uzivo = await skenoviUzivo(ctx, kartice, dani);
      dani.forEach((dan, indeks) => {
        for (const [cardId, broj] of uzivo.get(dan) ?? []) dodaj(cardId, indeks, broj);
      });
    }

    // Only the venue's current Menu cards are named values (like `pregled.skenovi`); a card that is no
    // longer one counts in `ostalo`, so the total stays the total.
    if (args.dimenzija === "kartica") {
      const svoje = new Set<string>(kartice.map((card) => card._id));
      for (const [vrednost, niz] of [...nizovi.entries()]) {
        if (svoje.has(vrednost) || vrednost === OSTALO) continue;
        nizovi.delete(vrednost);
        niz.forEach((broj, indeks) => dodaj(OSTALO, indeks, broj));
      }
    }
    const ukupno = (niz: number[]) => niz.reduce((a, b) => a + b, 0);
    const redom = [...nizovi.entries()].sort((a, b) => ukupno(b[1]) - ukupno(a[1]) || a[0].localeCompare(b[0]));
    const prikazane = redom.filter(([vrednost]) => vrednost !== OSTALO).slice(0, TOP_VREDNOSTI);
    const ostalo = dani.map((_, indeks) =>
      redom.filter((entry) => !prikazane.includes(entry)).reduce((zbir, [, niz]) => zbir + niz[indeks], 0),
    );

    const naziv = async (vrednost: string): Promise<string | null> => {
      if (args.dimenzija === "artikal") {
        const row = await ctx.db
          .query("menuArticles")
          .withIndex("by_menuServiceId_and_key", (q) => q.eq("menuServiceId", menuService._id).eq("key", vrednost))
          .unique();
        return row?.name ?? null;
      }
      if (args.dimenzija === "stranica") {
        const row = await ctx.db
          .query("menuPages")
          .withIndex("by_menuServiceId_and_key", (q) => q.eq("menuServiceId", menuService._id).eq("key", vrednost))
          .unique();
        return row?.name ?? null;
      }
      if (args.dimenzija === "kartica") return kartice.find((card) => card._id === vrednost)?.label ?? null;
      // Device, language, hour, kind, channel and who cancelled are named by the panel (i18n).
      return null;
    };

    const vrednosti = [];
    for (const [vrednost, poDanu] of prikazane) {
      vrednosti.push({ vrednost, naziv: await naziv(vrednost), ukupno: ukupno(poDanu), poDanu });
    }
    return {
      period: { ...izabran, dana: brojDana(izabran) },
      dani,
      metrika: args.metrika,
      dimenzija: args.dimenzija,
      vrednosti,
      ostalo: { ukupno: ukupno(ostalo), poDanu: ostalo },
    };
  },
});
