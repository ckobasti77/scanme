// Tekstovi sa brojem i najave za aria-live (A03 §4.5). Čisto, iz rečnika; bez React-a.

import { PARTS, SYSTEMS, type PartId, type SystemId } from "@/lib/auto3d/catalog";
import { partDef, SYSTEM_PART_COUNT } from "@/lib/auto3d/groups";
import type { PaintId } from "@/lib/auto3d/paints";
import { catalogDocs, queryTokens, searchParts } from "@/lib/auto3d/search";
import type { Auto3dState } from "@/lib/auto3d/state";
import { TOUR_STEPS } from "@/lib/auto3d/tour";
import { fmt, srPluralCategory } from "@/lib/i18n/format";
import { fairAuto3dSr as t } from "@/lib/i18n/sr/fair-auto3d";
import { fairAuto3dDeloviSr as delovi } from "@/lib/i18n/sr/fair-auto3d-delovi";

/** „1 deo“, „3 dela“, „9 delova“. */
export function partsCount(count: number): string {
  const key = { one: t.partsCountOne, few: t.partsCountFew, many: t.partsCountMany }[srPluralCategory(count)];
  return fmt(key, { count });
}

/** Dokumenti pretrage iz rečnika (naziv dela i naziv sistema). */
export const SEARCH_DOCS = catalogDocs(
  (id) => delovi.parts[id].name,
  (id) => delovi.systems[id].name,
);

/** Delovi liste: pogoci pretrage, samo iz izabrane grupe ako je ima. */
export function listParts(query: string, group: Auto3dState["group"]): PartId[] {
  const hits = searchParts(SEARCH_DOCS, query);
  return group ? hits.filter((id) => partDef(id).system === group) : hits;
}

export const MODE_LABEL = { rendgen: t.modeRendgen, lak: t.modeLak, kostur: t.modeKostur } as const;

export const PAINT_LABEL: Readonly<Record<PaintId, string>> = {
  grafit: t.paintGrafit,
  plava: t.paintPlava,
  crvena: t.paintCrvena,
  zelena: t.paintZelena,
  srebro: t.paintSrebro,
  bela: t.paintBela,
};

/** Titl koraka ture: sistem (naziv i opis iz rečnika delova), uvod ili kraj. */
export function tourCaption(step: number): { title: string; text: string; system: SystemId | null } {
  const def = TOUR_STEPS[step] ?? TOUR_STEPS[0];
  if (def.id === "uvod") return { title: t.tourIntroTitle, text: fmt(t.tourIntroText, { parts: PARTS.length, groups: SYSTEMS.length }), system: null };
  if (def.id === "kraj") return { title: t.tourOutroTitle, text: t.tourOutroText, system: null };
  return { title: delovi.systems[def.id].name, text: delovi.systems[def.id].description, system: def.id };
}

export function selectedText(part: PartId): string {
  const def = partDef(part);
  const values = { name: delovi.parts[part].name, system: delovi.systems[def.system].name };
  return fmt(def.instances.length === 2 ? t.announceSelectedTwo : t.announceSelected, values);
}

/**
 * Najava za promenu stanja, po prioritetu: tura, deo, grupa, pretraga, režim, boja, presek, status.
 * Hover se ne najavljuje, a ni koraci ture ni kiosk petlja (titl se vidi, A03 §4.5).
 */
export function announcement(prev: Auto3dState, next: Auto3dState): string | null {
  const loop = next.kiosk && next.kioskAuto;
  if (!loop && next.tour.active !== prev.tour.active) {
    if (next.tour.active) return t.announceTourStart;
    // Izbor dela prekida turu: najavljuje se i kraj ture i izabrani deo (A13).
    return next.part && next.part !== prev.part ? `${t.announceTourEnd} ${selectedText(next.part)}` : t.announceTourEnd;
  }
  if (next.tour.active && next.tour.paused && !prev.tour.paused) return t.announceTourPaused;
  if (next.part && next.part !== prev.part) return selectedText(next.part);
  if (next.group !== prev.group) {
    if (next.tour.active || loop) return null;
    if (!next.group) return t.announceGroupAll;
    return fmt(t.announceGroup, { name: delovi.systems[next.group].name, count: partsCount(SYSTEM_PART_COUNT[next.group]) });
  }
  if (next.query !== prev.query && queryTokens(next.query).length > 0) {
    const count = listParts(next.query, next.group).length;
    return count ? fmt(t.announceSearch, { count: partsCount(count) }) : fmt(t.searchEmpty, { query: next.query.trim() });
  }
  if (next.mode !== prev.mode && !loop) return fmt(t.announceMode, { mode: MODE_LABEL[next.mode] });
  if (next.paint !== prev.paint && !loop) return fmt(t.announcePaint, { name: PAINT_LABEL[next.paint] });
  if ((next.section === null) !== (prev.section === null)) return next.section === null ? t.announceSectionOff : t.announceSectionOn;
  if (next.status !== prev.status) {
    if (next.status === "ready" && prev.status !== "lost") return t.announceReady;
    if (next.status === "nowebgl") return t.announceNoWebgl;
    if (next.status === "error") return t.announceError;
  }
  return null;
}
