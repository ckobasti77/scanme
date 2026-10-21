import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { dodajUZbir, noviZbir, upisiZbir, type DnevniZbir } from "./lib/menuAnalytics";
import { menuCardRows } from "./menuQr";
import {
  KORAK_METRIKA,
  MENU_ANALYTICS_SESSION_KEEP_MS,
  doprinosi,
  koraciSesije,
  type KorakSesije,
} from "../lib/menu/analitika/definicije";
import { granicaSirovih, najstarijiDanAgregata } from "../lib/menu/analitika/period";
import { nastavljaSesiju } from "../lib/menu/analitika/sesija";
import { danUBeogradu } from "../lib/menu/analitika/vreme";
import { addDays } from "../lib/menu/working-hours";

// =============================================================================
// ScanMe Menu V1 (K29) — the analytics crons (docs/menu/ANALITIKA-DEFINICIJE.md
// §3, §7). Registered in convex/crons.ts:
//
// zbir       (15 min) sums raw events into the daily rows, in the order they
//            were inserted (_creationTime after the cursor, at most ZBIR_SERIJA
//            per transaction, MAX_NASTAVAKA continuations per run). The cursor
//            moves in the SAME transaction as the sums, so an event is never
//            counted twice; events younger than ZBIR_ZASTITA_MS wait for the
//            next run, so a mutation still in flight is never skipped. Sessions:
//            a pause of 30 min (or more) starts a new one, counted on its start
//            day; each step (detail, request, order, reservation) counts once.
// skenovi    (1 h) moves the scans of a finished Belgrade day from
//            dailyCardMetrics (the card resolver's rollup) into the daily rows of
//            every Menu service, a few services per transaction; the first run
//            moves the last 30 days. Today's scans the panel reads live.
// retencija  (1 h) deletes raw events after 90 days, session rows a day after
//            their last event, daily rows older than 24 months, in batches.
// =============================================================================

export const ZBIR_SERIJA = 500;
export const ZBIR_ZASTITA_MS = 2 * 60 * 1000;
export const MAX_NASTAVAKA = 20;
// K33: the cost of one service grows with its cards (up to MENU_MAX_QR_CARDS = 500, three
// to five index reads each), so one transaction takes ONE service; with five, a few big
// venues on the same page would exceed the 4,096 query ranges, the cursor would not
// move, and every later service would wait behind that page forever. The continuation
// bound keeps the old reach of one run (5 services x 250 continuations = 1,250).
export const SKENOVI_USLUGA_PO_SERIJI = 1;
export const SKENOVI_MAX_NASTAVAKA = 1250;
export const SKENOVI_PRVI_PRENOS_DANA = 30;
export const RETENCIJA_SERIJA = 500;
// K33: `zbir` sums up to ZBIR_SERIJA x (MAX_NASTAVAKA + 1) events per run and runs every
// 15 minutes, so retention (hourly) must be able to delete four times that, or the raw
// table grows whenever the intake stays above its own deletion capacity. The batch size
// stays; only the chain is longer: 4 x (MAX_NASTAVAKA + 1) transactions = 1 + this many.
export const RETENCIJA_MAX_NASTAVAKA = 4 * MAX_NASTAVAKA + 3;

type KljucKursora = Doc<"menuAnalyticsCursors">["kljuc"];

async function kursor(ctx: MutationCtx, kljuc: KljucKursora) {
  return await ctx.db
    .query("menuAnalyticsCursors")
    .withIndex("by_kljuc", (q) => q.eq("kljuc", kljuc))
    .first();
}

async function sacuvajKursor(
  ctx: MutationCtx,
  kljuc: KljucKursora,
  polja: Partial<Pick<Doc<"menuAnalyticsCursors">, "poslednji" | "dan" | "radniDan" | "stranica">>,
  now: number,
): Promise<void> {
  const postojeci = await kursor(ctx, kljuc);
  if (postojeci) await ctx.db.patch(postojeci._id, { ...polja, updatedAt: now });
  else await ctx.db.insert("menuAnalyticsCursors", { kljuc, ...polja, updatedAt: now });
}

// -----------------------------------------------------------------------------
// zbir
// -----------------------------------------------------------------------------

type SesijaRad = {
  id: Id<"menuAnalyticsSessions"> | null;
  menuServiceId: Id<"menuServices">;
  sesija: string;
  dayKey: string;
  pocetak: number;
  poslednji: number;
  koraci: Partial<Record<KorakSesije, boolean>>;
};

async function saberi(ctx: MutationCtx, dogadjaji: Doc<"menuAnalyticsEvents">[], now: number): Promise<void> {
  const zbirovi = new Map<string, { menuServiceId: Id<"menuServices">; dayKey: string; zbir: DnevniZbir }>();
  const zbirZa = (menuServiceId: Id<"menuServices">, dayKey: string): DnevniZbir => {
    const kljuc = `${menuServiceId}|${dayKey}`;
    let red = zbirovi.get(kljuc);
    if (!red) {
      red = { menuServiceId, dayKey, zbir: noviZbir() };
      zbirovi.set(kljuc, red);
    }
    return red.zbir;
  };
  const sesije = new Map<string, SesijaRad>();

  for (const dogadjaj of dogadjaji) {
    for (const { metrika, dimenzije } of doprinosi(dogadjaj)) {
      dodajUZbir(zbirZa(dogadjaj.menuServiceId, dogadjaj.dayKey), metrika, dimenzije);
    }
    if (!dogadjaj.sesija) continue;

    const kljuc = `${dogadjaj.menuServiceId}|${dogadjaj.sesija}`;
    let sesija = sesije.get(kljuc) ?? null;
    if (!sesije.has(kljuc)) {
      const row = await ctx.db
        .query("menuAnalyticsSessions")
        .withIndex("by_menuServiceId_and_sesija", (q) =>
          q.eq("menuServiceId", dogadjaj.menuServiceId).eq("sesija", dogadjaj.sesija as string),
        )
        .first();
      sesija = row
        ? { id: row._id, menuServiceId: row.menuServiceId, sesija: row.sesija, dayKey: row.dayKey, pocetak: row.pocetak, poslednji: row.poslednji, koraci: { ...row.koraci } }
        : null;
    }
    if (!sesija || !nastavljaSesiju(sesija.poslednji, dogadjaj.occurredAt)) {
      // A new session (or a new segment of the same id after a pause of 30 min): counted on its start day.
      sesija = {
        id: sesija?.id ?? null,
        menuServiceId: dogadjaj.menuServiceId,
        sesija: dogadjaj.sesija,
        dayKey: dogadjaj.dayKey,
        pocetak: dogadjaj.occurredAt,
        poslednji: dogadjaj.occurredAt,
        koraci: {},
      };
      dodajUZbir(zbirZa(dogadjaj.menuServiceId, dogadjaj.dayKey), "sesije", {});
    } else {
      sesija.poslednji = Math.max(sesija.poslednji, dogadjaj.occurredAt);
    }
    for (const korak of koraciSesije(dogadjaj)) {
      if (sesija.koraci[korak]) continue;
      sesija.koraci[korak] = true;
      dodajUZbir(zbirZa(dogadjaj.menuServiceId, sesija.dayKey), KORAK_METRIKA[korak], {});
    }
    sesije.set(kljuc, sesija);
  }

  for (const sesija of sesije.values()) {
    const polja = {
      menuServiceId: sesija.menuServiceId,
      sesija: sesija.sesija,
      dayKey: sesija.dayKey,
      pocetak: sesija.pocetak,
      poslednji: sesija.poslednji,
      koraci: sesija.koraci,
    };
    if (sesija.id) await ctx.db.replace(sesija.id, polja);
    else await ctx.db.insert("menuAnalyticsSessions", polja);
  }
  for (const { menuServiceId, dayKey, zbir } of zbirovi.values()) {
    await upisiZbir(ctx, menuServiceId, dayKey, zbir, now);
  }
}

export const zbir = internalMutation({
  args: { nastavak: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const now = Date.now();
    const granica = now - ZBIR_ZASTITA_MS;
    const stanje = await kursor(ctx, "dogadjaji");
    const od = stanje?.poslednji ?? 0;
    const red = await ctx.db
      .query("menuAnalyticsEvents")
      .withIndex("by_creation_time", (q) => q.gt("_creationTime", od).lte("_creationTime", granica))
      .take(ZBIR_SERIJA + 1);
    let posao = red;
    const jos = red.length > ZBIR_SERIJA;
    if (jos) {
      // Events that share the boundary instant all wait for the next batch, so none is skipped.
      const granicni = red[ZBIR_SERIJA]._creationTime;
      posao = red.slice(0, ZBIR_SERIJA).filter((row) => row._creationTime < granicni);
      if (posao.length === 0) {
        posao = await ctx.db
          .query("menuAnalyticsEvents")
          .withIndex("by_creation_time", (q) => q.eq("_creationTime", granicni))
          .take(ZBIR_SERIJA * 10);
      }
    }
    if (posao.length === 0) return { obradjeno: 0, jos: false };

    await saberi(ctx, posao, now);
    await sacuvajKursor(ctx, "dogadjaji", { poslednji: posao[posao.length - 1]._creationTime }, now);
    const nastavak = args.nastavak ?? 0;
    if (jos && nastavak < MAX_NASTAVAKA) {
      await ctx.scheduler.runAfter(0, internal.menuAnalyticsRollup.zbir, { nastavak: nastavak + 1 });
    }
    return { obradjeno: posao.length, jos };
  },
});

// -----------------------------------------------------------------------------
// skenovi
// -----------------------------------------------------------------------------

export const skenovi = internalMutation({
  args: { nastavak: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const now = Date.now();
    const juce = addDays(danUBeogradu(now), -1);
    const stanje = await kursor(ctx, "skenovi");
    const dan =
      stanje?.radniDan ?? (stanje?.dan ? addDays(stanje.dan, 1) : addDays(juce, -(SKENOVI_PRVI_PRENOS_DANA - 1)));
    if (dan > juce) return { dan: null };

    const strana = await ctx.db
      .query("menuServices")
      .paginate({ numItems: SKENOVI_USLUGA_PO_SERIJI, cursor: stanje?.radniDan ? (stanje.stranica ?? null) : null });
    for (const usluga of strana.page) {
      const { rows } = await menuCardRows(ctx, usluga._id, usluga.businessId);
      const zbir = noviZbir();
      for (const { card } of rows) {
        const row = await ctx.db
          .query("dailyCardMetrics")
          .withIndex("by_cardId_and_dateKey", (q) => q.eq("cardId", card._id).eq("dateKey", dan))
          .unique();
        if (row && row.scans > 0) dodajUZbir(zbir, "skenovi", { kartica: card._id }, row.scans);
      }
      await upisiZbir(ctx, usluga._id, dan, zbir, now);
    }

    if (strana.isDone) {
      await sacuvajKursor(ctx, "skenovi", { dan, radniDan: undefined, stranica: undefined }, now);
    } else {
      await sacuvajKursor(ctx, "skenovi", { radniDan: dan, stranica: strana.continueCursor }, now);
    }
    const jos = !strana.isDone || dan < juce;
    const nastavak = args.nastavak ?? 0;
    if (jos && nastavak < SKENOVI_MAX_NASTAVAKA) {
      await ctx.scheduler.runAfter(0, internal.menuAnalyticsRollup.skenovi, { nastavak: nastavak + 1 });
    }
    return { dan };
  },
});

// -----------------------------------------------------------------------------
// retencija
// -----------------------------------------------------------------------------

export const retencija = internalMutation({
  args: { nastavak: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const now = Date.now();
    const najstariji = najstarijiDanAgregata(danUBeogradu(now));
    const [sirovi, sesije, dnevni, raspodele] = await Promise.all([
      ctx.db
        .query("menuAnalyticsEvents")
        .withIndex("by_creation_time", (q) => q.lt("_creationTime", granicaSirovih(now)))
        .take(RETENCIJA_SERIJA),
      ctx.db
        .query("menuAnalyticsSessions")
        .withIndex("by_poslednji", (q) => q.lt("poslednji", now - MENU_ANALYTICS_SESSION_KEEP_MS))
        .take(RETENCIJA_SERIJA),
      ctx.db
        .query("menuAnalyticsDaily")
        .withIndex("by_dayKey", (q) => q.lt("dayKey", najstariji))
        .take(RETENCIJA_SERIJA),
      ctx.db
        .query("menuAnalyticsDailyDims")
        .withIndex("by_dayKey", (q) => q.lt("dayKey", najstariji))
        .take(RETENCIJA_SERIJA),
    ]);
    for (const row of sirovi) await ctx.db.delete(row._id);
    for (const row of sesije) await ctx.db.delete(row._id);
    for (const row of dnevni) await ctx.db.delete(row._id);
    for (const row of raspodele) await ctx.db.delete(row._id);

    const pun = [sirovi, sesije, dnevni, raspodele].some((rows) => rows.length === RETENCIJA_SERIJA);
    const nastavak = args.nastavak ?? 0;
    if (pun && nastavak < RETENCIJA_MAX_NASTAVAKA) {
      await ctx.scheduler.runAfter(0, internal.menuAnalyticsRollup.retencija, { nastavak: nastavak + 1 });
    }
    return { sirovi: sirovi.length, sesije: sesije.length, dnevni: dnevni.length, raspodele: raspodele.length };
  },
});
