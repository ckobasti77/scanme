// ScanMe Menu V1 (K16) — Room service of an in-memory menu, as the editor
// shows it (the izlog; the app reads menuRoomService.get, which computes the
// same with the same price rule). Every row carries its price and where the
// price comes from (lib/menu/rs-price-origin.ts), and the warning raised when
// the base price of an article with a manual Room service price changed.

import { markupBpsToPercent, roomServiceUnitPrice, type RoomServiceRule } from "../room-service-pricing";
import { rsWarningView } from "../rs-price-origin";
import type { MenuDraftSnapshot, SnapshotRoomServiceItem } from "../snapshot";
import type { StudioRoomService, StudioRsRed, StudioRsUpozorenje } from "./model";

const poRedu = <T extends { order: number }>(a: T, b: T) => a.order - b.order;

export function rsPravilo(snapshot: MenuDraftSnapshot): RoomServiceRule {
  const config = snapshot.roomService.config;
  return { markupBps: config?.markupBps ?? 0, markupScope: config?.markupScope ?? "all" };
}

/** The id of a Room service item in memory: its article key (an article is in RS at most once). */
export const rsStavkaId = (item: Pick<SnapshotRoomServiceItem, "articleKey">) => item.articleKey;

/** The warning of one item as the dialog shows it, or null. */
export function rsUpozorenjeStavke(snapshot: MenuDraftSnapshot, item: SnapshotRoomServiceItem): StudioRsUpozorenje | null {
  if (!item.priceWarning) return null;
  const article = snapshot.articles.find((candidate) => candidate.key === item.articleKey);
  if (!article) return null;
  const pogled = rsWarningView(
    rsPravilo(snapshot),
    { basePriceRsd: article.basePriceRsd, markupApplies: item.markupApplies, manualPriceRsd: item.manualPriceRsd },
    item.priceWarning,
  );
  return {
    stavkaId: rsStavkaId(item),
    naziv: article.name,
    staraOsnovna: pogled.oldBaseRsd,
    novaOsnovna: pogled.newBaseRsd,
    rsCena: pogled.roomServicePriceRsd,
    izracunata: pogled.recomputedPriceRsd,
  };
}

export function roomServiceIzSnapshota(snapshot: MenuDraftSnapshot): StudioRoomService {
  const rule = rsPravilo(snapshot);
  const config = snapshot.roomService.config;
  const articles = new Map(snapshot.articles.map((article) => [article.key, article]));
  const red = (item: SnapshotRoomServiceItem): StudioRsRed[] => {
    const article = articles.get(item.articleKey);
    if (!article) return [];
    const osnovna = article.basePriceRsd;
    const cena = roomServiceUnitPrice(rule, { basePriceRsd: osnovna, markupApplies: item.markupApplies, manualPriceRsd: item.manualPriceRsd });
    const varijante = article.variantsEnabled
      ? snapshot.variants
          .filter((variant) => variant.articleKey === article.key)
          .sort(poRedu)
          .map((variant) => {
            const rucna = item.manualVariantPrices?.find((entry) => entry.variantKey === variant.key)?.priceRsd ?? null;
            const v = roomServiceUnitPrice(rule, {
              basePriceRsd: variant.priceRsd ?? osnovna,
              markupApplies: item.markupApplies,
              manualPriceRsd: rucna,
            });
            return { key: variant.key, naziv: variant.name, cena: v.priceRsd, poreklo: v.origin };
          })
      : [];
    return [
      {
        stavkaId: rsStavkaId(item),
        artikalId: article.key,
        artikalKey: article.key,
        naziv: article.name,
        osnovna,
        uvecanje: item.markupApplies,
        rucna: item.manualPriceRsd,
        cena: cena.priceRsd,
        poreklo: cena.origin,
        upozorenje: rsUpozorenjeStavke(snapshot, item),
        varijante,
      },
    ];
  };
  const kategorije = snapshot.roomService.categories
    .slice()
    .sort(poRedu)
    .map((category) => ({
      id: category.key,
      key: category.key,
      naziv: category.name,
      redovi: snapshot.roomService.items.filter((item) => item.categoryKey === category.key).sort(poRedu).flatMap(red),
    }));
  const uRs = new Set(snapshot.roomService.items.map((item) => item.articleKey));
  return {
    pravila: {
      uvecanje: rule.markupBps > 0 ? markupBpsToPercent(rule.markupBps) : null,
      obuhvat: rule.markupScope,
      naknada: config?.deliveryFeeRsd ?? null,
    },
    kategorije,
    vanRs: snapshot.articles.filter((article) => !uRs.has(article.key)).length,
    skraceno: false,
  };
}
