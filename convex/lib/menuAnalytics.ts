import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import {
  MAX_VREDNOSTI_PO_DIMENZIJI,
  OSTALO,
  type Dimenzija,
  type Metrika,
  type ServerskaVrsta,
} from "../../lib/menu/analitika/definicije";
import { danUBeogradu, satUBeogradu } from "../../lib/menu/analitika/vreme";
import type { MenuRequestStatus } from "../../lib/menu/request-status";
import type { ReservationAction } from "../../lib/menu/reservation-status";

// =============================================================================
// ScanMe Menu V1 (K29) — writing analytics events from the backend, and the
// daily rows the crons sum into (docs/menu/ANALITIKA-DEFINICIJE.md §4, §7).
//
// A server event is ONE insert into menuAnalyticsEvents inside the mutation
// that created the request or changed its status: no read, no counter row,
// so no write contention with anything else. The rollup cron
// (convex/menuAnalyticsRollup.ts) is the only writer of the daily rows.
// =============================================================================

export type ServerskiDogadjaj = {
  vrsta: ServerskaVrsta;
  zahtev?: Doc<"menuRequests">["kind"];
  kanal?: Doc<"menuRequests">["channel"];
  kartica?: Id<"cards">;
  ko?: "guest" | "staff";
};

export async function zabeleziDogadjaj(
  ctx: MutationCtx,
  menuServiceId: Id<"menuServices">,
  dogadjaj: ServerskiDogadjaj,
  now: number,
): Promise<void> {
  await ctx.db.insert("menuAnalyticsEvents", {
    menuServiceId,
    vrsta: dogadjaj.vrsta,
    occurredAt: now,
    dayKey: danUBeogradu(now),
    sat: satUBeogradu(now),
    ...(dogadjaj.zahtev ? { zahtev: dogadjaj.zahtev } : {}),
    ...(dogadjaj.kanal ? { kanal: dogadjaj.kanal } : {}),
    ...(dogadjaj.kartica ? { kartica: dogadjaj.kartica } : {}),
    ...(dogadjaj.ko ? { ko: dogadjaj.ko } : {}),
  });
}

/** A request status that really changed (applyRequestAction). Finishing a new request also accepts it. */
export async function zabeleziPrelazZahteva(
  ctx: MutationCtx,
  request: Doc<"menuRequests">,
  to: MenuRequestStatus,
  alsoAccepted: boolean,
  ko: "guest" | "staff" | undefined,
  now: number,
): Promise<void> {
  const osnova = { zahtev: request.kind, kanal: request.channel };
  if (to === "accepted" || alsoAccepted) {
    await zabeleziDogadjaj(ctx, request.menuServiceId, { vrsta: "zahtev_prihvacen", ...osnova }, now);
  }
  if (to === "done") await zabeleziDogadjaj(ctx, request.menuServiceId, { vrsta: "zahtev_zavrsen", ...osnova }, now);
  if (to === "cancelled") {
    await zabeleziDogadjaj(ctx, request.menuServiceId, { vrsta: "zahtev_otkazan", ...osnova, ...(ko ? { ko } : {}) }, now);
  }
}

const VRSTA_REZERVACIJE: Readonly<Record<ReservationAction, ServerskaVrsta>> = {
  accept: "rezervacija_prihvacena",
  acceptProposal: "rezervacija_prihvacena",
  decline: "rezervacija_odbijena",
  propose: "rezervacija_predlog",
  arrive: "rezervacija_realizovana",
  cancel: "rezervacija_otkazana",
};

/** A reservation status that really changed (applyReservationAction). */
export async function zabeleziPrelazRezervacije(
  ctx: MutationCtx,
  reservation: Doc<"menuReservations">,
  action: ReservationAction,
  ko: "guest" | "staff",
  now: number,
): Promise<void> {
  const vrsta = VRSTA_REZERVACIJE[action];
  await zabeleziDogadjaj(ctx, reservation.menuServiceId, { vrsta, ...(action === "cancel" ? { ko } : {}) }, now);
}

// -----------------------------------------------------------------------------
// Daily rows
// -----------------------------------------------------------------------------

/** What one service gains on one day: totals and breakdowns. */
export type DnevniZbir = {
  brojevi: Record<string, number>;
  po: Record<string, Record<string, Record<string, number>>>;
};

export function noviZbir(): DnevniZbir {
  return { brojevi: {}, po: {} };
}

export function dodajUZbir(
  zbir: DnevniZbir,
  metrika: Metrika,
  dimenzije: Partial<Record<Dimenzija, string>>,
  n = 1,
): void {
  zbir.brojevi[metrika] = (zbir.brojevi[metrika] ?? 0) + n;
  for (const [dimenzija, vrednost] of Object.entries(dimenzije)) {
    if (vrednost === undefined) continue;
    const poMetrici = (zbir.po[metrika] ??= {});
    const poDimenziji = (poMetrici[dimenzija] ??= {});
    poDimenziji[vrednost] = (poDimenziji[vrednost] ?? 0) + n;
  }
}

/** Adds `dodatak` into `postojece`; a value past MAX_VREDNOSTI_PO_DIMENZIJI goes to `ostalo`. */
export function spojiRaspodele(
  postojece: DnevniZbir["po"],
  dodatak: DnevniZbir["po"],
): DnevniZbir["po"] {
  const izlaz: DnevniZbir["po"] = {};
  for (const [metrika, dims] of Object.entries(postojece)) {
    izlaz[metrika] = {};
    for (const [dimenzija, vrednosti] of Object.entries(dims)) izlaz[metrika][dimenzija] = { ...vrednosti };
  }
  for (const [metrika, dims] of Object.entries(dodatak)) {
    const poMetrici = (izlaz[metrika] ??= {});
    for (const [dimenzija, vrednosti] of Object.entries(dims)) {
      const poDimenziji = (poMetrici[dimenzija] ??= {});
      for (const [vrednost, broj] of Object.entries(vrednosti)) {
        const imaMesta = vrednost in poDimenziji || Object.keys(poDimenziji).length < MAX_VREDNOSTI_PO_DIMENZIJI;
        const kljuc = imaMesta ? vrednost : OSTALO;
        poDimenziji[kljuc] = (poDimenziji[kljuc] ?? 0) + broj;
      }
    }
  }
  return izlaz;
}

/** Adds one service-day's gains into its two daily rows (only the crons call this). */
export async function upisiZbir(
  ctx: MutationCtx,
  menuServiceId: Id<"menuServices">,
  dayKey: string,
  zbir: DnevniZbir,
  now: number,
): Promise<void> {
  if (Object.keys(zbir.brojevi).length > 0) {
    const dnevni = await ctx.db
      .query("menuAnalyticsDaily")
      .withIndex("by_menuServiceId_and_dayKey", (q) => q.eq("menuServiceId", menuServiceId).eq("dayKey", dayKey))
      .unique();
    const brojevi: Record<string, number> = { ...(dnevni?.brojevi ?? {}) };
    for (const [metrika, broj] of Object.entries(zbir.brojevi)) brojevi[metrika] = (brojevi[metrika] ?? 0) + broj;
    if (dnevni) await ctx.db.patch(dnevni._id, { brojevi, updatedAt: now });
    else await ctx.db.insert("menuAnalyticsDaily", { menuServiceId, dayKey, brojevi, updatedAt: now });
  }
  if (Object.keys(zbir.po).length > 0) {
    const raspodela = await ctx.db
      .query("menuAnalyticsDailyDims")
      .withIndex("by_menuServiceId_and_dayKey", (q) => q.eq("menuServiceId", menuServiceId).eq("dayKey", dayKey))
      .unique();
    const po = spojiRaspodele(raspodela?.po ?? {}, zbir.po);
    if (raspodela) await ctx.db.patch(raspodela._id, { po, updatedAt: now });
    else await ctx.db.insert("menuAnalyticsDailyDims", { menuServiceId, dayKey, po, updatedAt: now });
  }
}
