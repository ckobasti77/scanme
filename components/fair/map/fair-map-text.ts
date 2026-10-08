import type { FairMapLocation, FairMapLocationSummary, FairMapZoneId } from "@/lib/fair-map";
import { fmt, srPluralCategory } from "@/lib/i18n/format";
import { fairMapSr as dict } from "@/lib/i18n/sr/fair-map";

// N4 — the few sentences the map, the sheet and the list build from data.

/** "Štand 12 · Ispred hale", "Partner sajma, uz 10B · Hala", "Zadnji deo". */
export function fairMapPlaceText(location: Pick<FairMapLocation, "kind" | "label">, zoneId: FairMapZoneId, label = location.label) {
  const zone = dict.zones[zoneId];
  if (location.kind === "partner") return fmt(dict.partnerLocation, { label, zone });
  if (location.kind === "area") return fmt(dict.areaLocation, { zone });
  return fmt(dict.standLocation, { label, zone });
}

/**
 * Header of a selected location: "Štand 2 · Hala · 490 m²" (m² only when the organizer gives it,
 * never broken from its number; D1: a box of a split stand says the area is the group's, "12 m² ukupno").
 */
export function fairMapSummaryText(summary: FairMapLocationSummary) {
  const place = fairMapPlaceText(summary.location, summary.zoneId, summary.label);
  if (summary.areaM2 === undefined) return place;
  const groupArea = summary.group !== undefined && summary.location.areaM2 === undefined;
  return fmt(groupArea ? dict.standSummaryGroup : dict.standSummary, { place, area: summary.areaM2 });
}

/** "1 izlagač", "3 izlagača", "12 izlagača". */
export function fairMapExhibitorCount(count: number) {
  const category = srPluralCategory(count);
  return fmt(category === "one" ? dict.exhibitorsOne : category === "few" ? dict.exhibitorsFew : dict.exhibitorsMany, { count });
}
