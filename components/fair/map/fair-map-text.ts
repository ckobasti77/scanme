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

/** "1 rezultat", "3 rezultata", "12 rezultata" (the screen reader hears the count of search hits). */
export function fairMapResultCount(count: number) {
  const category = srPluralCategory(count);
  return fmt(category === "one" ? dict.searchResultsOne : category === "few" ? dict.searchResultsFew : dict.searchResultsMany, { count });
}

/** One character as the search compares it (lib/fair-map fairMapSearchKey: case and diacritics off, đ → dj). */
function searchChar(char: string) {
  return char.toLocaleLowerCase("sr").replaceAll("đ", "dj").normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * The text split into plain and matched parts, so a search result can mark
 * what the query hit ("Đorđe" is hit by "djo", "Citroën" by "citroen").
 */
export function fairMapMarks(text: string, query: string): Array<{ text: string; mark: boolean }> {
  const words = query.split(/\s+/).map(searchChar).filter(Boolean);
  if (!words.length || !text) return [{ text, mark: false }];
  // The normalized text and, per normalized character, the index of its source character.
  let normalized = "";
  const source: number[] = [];
  for (let index = 0; index < text.length; index += 1) {
    const key = searchChar(text[index]);
    normalized += key;
    for (let step = 0; step < key.length; step += 1) source.push(index);
  }
  const marked = new Array<boolean>(text.length).fill(false);
  for (const word of words) {
    for (let at = normalized.indexOf(word); at !== -1; at = normalized.indexOf(word, at + 1)) {
      for (let step = at; step < at + word.length; step += 1) marked[source[step]] = true;
    }
  }
  const parts: Array<{ text: string; mark: boolean }> = [];
  for (let index = 0; index < text.length; index += 1) {
    const last = parts[parts.length - 1];
    if (last && last.mark === marked[index]) last.text += text[index];
    else parts.push({ text: text[index], mark: marked[index] });
  }
  return parts;
}
