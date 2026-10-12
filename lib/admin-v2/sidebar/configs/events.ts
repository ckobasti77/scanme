// ADMIN v2 — sidebar of `Događaji`: the event (context), the section
// navigation and the filters of each section (ZADATAK §3). The filter keys
// are the query keys the sections already read (lib/admin-v1/event-sections.ts);
// options without a fixed list (izlagač, brend, model, dan) come from the
// section with their counts (`useAdminSidebarLive`).

import { AUDIENCE_STATUS_PARAMS, AUDIENCE_STATUSES } from "@/lib/admin-v1/audience-quota";
import { eventNavGroups, eventSectionHref, resolveEventSection, type EventSectionPath } from "@/lib/admin-v1/event-sections";
import { EXHIBITOR_SEGMENT_VALUES } from "@/lib/admin-v1/exhibitors";
import { INTERACTION_PACKAGE_VALUES } from "@/lib/admin-v1/interaction-exhibitors";
import { MODEL_FACET_VALUES, MODEL_FACETS } from "@/lib/admin-v1/model-filters";
import { PASSPORT_STATE_OF_PARAM, PASSPORT_STATE_VALUES } from "@/lib/admin-v1/passport-overview";
import { QR_STATES } from "@/lib/admin-v1/qr-filters";
import { ANALYTICS_ANCHORS } from "@/lib/admin-v2/analytics/anchors";
import { adminEventsSr as dict } from "@/lib/i18n/sr/admin-events";
import { adminUiSr as ui } from "@/lib/i18n/sr/admin-ui";
import type { SidebarConfig, SidebarGroup } from "../types";

const exhibitor: SidebarGroup = { id: "izlagac", label: ui.hierarchy.exhibitor };
const brand: SidebarGroup = { id: "brend", label: ui.hierarchy.brand };
const model: SidebarGroup = { id: "model", label: ui.hierarchy.model };

type Filters = Pick<SidebarConfig, "views" | "search" | "groups" | "anchors">;

const LIST_FILTERS: Partial<Record<EventSectionPath, Filters>> = {
  modeli: {
    // One search (ZADATAK §3); a model picked by an older link stays as a chip.
    search: { key: "q", label: dict.modelList.searchLabel, placeholder: dict.modelList.searchPlaceholder },
    groups: [
      exhibitor,
      brand,
      { ...model, chipOnly: true },
      ...MODEL_FACETS.map((facet): SidebarGroup => ({
        id: facet,
        label: dict.modelList.facets[facet],
        options: MODEL_FACET_VALUES[facet].map((value) => ({ value, label: (dict.modelList.values[facet] as Record<string, string>)[value] ?? value })),
      })),
    ],
  },
  qr: {
    search: { key: "q", label: dict.qrList.searchLabel, placeholder: dict.qrList.searchPlaceholder },
    groups: [exhibitor, brand, model, { id: "stanje", label: dict.qrList.facetState, options: QR_STATES.map((value) => ({ value, label: dict.qrList.states[value] })) }],
  },
  izlagaci: {
    search: { key: "q", label: dict.exhibitorList.searchLabel, placeholder: dict.exhibitorList.searchPlaceholder },
    groups: [{ id: "segment", label: dict.exhibitorList.facetSegment, options: EXHIBITOR_SEGMENT_VALUES.map((value) => ({ value, label: dict.exhibitorList.segments[value] })) }],
  },
  interakcije: {
    views: {
      key: "paket",
      label: dict.interactionExhibitors.facetPackage,
      defaultValue: "interakcije",
      items: (["interakcije", ...INTERACTION_PACKAGE_VALUES] as const).map((value) => ({ value, label: dict.interactionExhibitors.packages[value] })),
    },
    search: { key: "q", label: dict.interactionExhibitors.searchLabel, placeholder: dict.interactionExhibitors.searchPlaceholder },
    // A passport state arrives by a link from Pregled; the list has no control for it.
    groups: [{ id: "stanje", label: dict.passportAuto.facetState, chipOnly: true, options: PASSPORT_STATE_VALUES.map((value) => ({ value, label: dict.passportAuto.states[PASSPORT_STATE_OF_PARAM[value]] })) }],
  },
  leadovi: {
    groups: [
      exhibitor,
      brand,
      model,
      { id: "period", label: ui.filters.period, kind: "custom", keys: ["od", "do"] },
      { id: "tip", label: dict.leadInbox.facetKind, options: (["zainteresovan", "probna-voznja"] as const).map((value) => ({ value, label: dict.leadInbox.kindOptions[value] })) },
      { id: "isporuka", label: dict.leadInbox.facetDelivery, options: (["ne", "da"] as const).map((value) => ({ value, label: dict.leadInbox.deliveryOptions[value] })) },
    ],
  },
  // A long page of charts: its parts instead of filters (the charts have none).
  analitika: { anchors: { label: dict.analytics.v2.onThisPage, items: ANALYTICS_ANCHORS } },
  izvestaji: {
    groups: [
      { id: "dan", label: dict.reportQueue.facetDay },
      { id: "izlagac", label: dict.reportQueue.facetExhibitor },
      { id: "status", label: dict.reportQueue.facetStatus },
    ],
  },
};

/** The exhibitor's Interakcije page: the question list and the brand passports are filtered there. */
const INTERACTION_EXHIBITOR_FILTERS: Filters = {
  groups: [
    { id: "status", label: dict.audience.facetStatus, options: AUDIENCE_STATUSES.map((status) => ({ value: AUDIENCE_STATUS_PARAMS[status], label: dict.audience.statuses[status] })) },
    { id: "stanje", label: dict.passportAuto.facetState, options: PASSPORT_STATE_VALUES.map((value) => ({ value, label: dict.passportAuto.states[PASSPORT_STATE_OF_PARAM[value]] })) },
    { ...brand, chipOnly: true },
  ],
};

/** `base` = the event's link base (admin or a dev preview); `segments` = the path below it. */
export function eventsSidebarConfig(base: string, segments: readonly string[]): SidebarConfig {
  const section = resolveEventSection(segments);
  const path = section?.path ?? null;
  const detail = section?.kind === "section" && section.detailId !== undefined;
  const filters = !path || section?.kind !== "section" ? undefined : detail ? (path === "interakcije" ? INTERACTION_EXHIBITOR_FILTERS : undefined) : LIST_FILTERS[path];
  return {
    id: `dogadjaji/${path ?? "nepoznato"}${detail ? "/detalj" : ""}`,
    context: { id: "dogadjaj", label: dict.eventLabel },
    nav: eventNavGroups((target) => eventSectionHref(base, target), path),
    navLabel: dict.sectionsAria,
    ...filters,
  };
}
