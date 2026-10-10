// Admin UX A2 — the one registry of the `Događaji` sections. Every section is
// a real route `/admin/dogadjaji/[eventSlug]/<path>` (and the same `<path>`
// under `/dev/admin-events-preview`). The paths are fixed by
// ADMIN-UX-ZAHTEVI §2 — labels may change, paths may not.

import { adminEventsSr as dict } from "@/lib/i18n/sr/admin-events";
import { parseAdminQuery, serializeAdminQuery, type AdminQueryKey, type AdminQueryState } from "./query-state";
import type { AdminSubnavGroup, AdminSubnavItem } from "./subnav";

export const EVENT_SECTION_PATHS = [
  "pregled",
  // Sajam 2026 N2 (odluka vlasnika 8. 10.): „Poveži nalepnicu“ on the fair floor.
  "povezi",
  "modeli",
  "qr",
  "izlagaci",
  "import",
  "interakcije",
  "sponzorisano",
  // SAJAM SUPER Korak 4 — numbers of the fair (admin only, polled).
  "analitika",
  "leadovi",
  "leadovi/follow-up",
  "leadovi/podesavanja",
  "izvestaji",
  "brisanje",
] as const;

export type EventSectionPath = (typeof EVENT_SECTION_PATHS)[number];
type EventSectionGroup = "katalog" | "sajam" | "posle";
type EventSectionParent = "leadovi";

export type EventSectionDef = {
  path: EventSectionPath;
  group: EventSectionGroup | null;
  parent?: EventSectionParent;
  /** Query keys the section reads (filters and `prikaz`). */
  queryKeys: readonly AdminQueryKey[];
  /** `<path>/<id>` opens a detail page. */
  detail?: "model" | "qr" | "izlagac";
};

export const EVENT_SECTIONS: readonly EventSectionDef[] = [
  { path: "pregled", group: null, queryKeys: ["prikaz", "faza"] },
  // N2 — the sticker (`kod`, also what the /r/ admin shortcut opens), the exhibitor and the car being linked.
  { path: "povezi", group: null, queryKeys: ["kod", "izlagac", "model"] },
  { path: "modeli", group: "katalog", queryKeys: ["izlagac", "brend", "model", "q", "paket", "status", "problemi", "qr", "foto", "prikaz"], detail: "model" },
  { path: "qr", group: "katalog", queryKeys: ["izlagac", "brend", "model", "stanje", "q", "prikaz"], detail: "qr" },
  { path: "izlagaci", group: "katalog", queryKeys: ["q", "segment", "prikaz"] },
  { path: "import", group: "katalog", queryKeys: [] },
  // Izlagači 2026 — one page of exhibitor cards (`paket`: default only exhibitors
  // with Starter/Napredni cars, `svi` all; `stanje` = a brand passport in that
  // state, `dan` = the day of the Glas publike numbers). `<participationId>` is
  // the exhibitor's page with Glas publike, Ankete, Pasoš brenda and Forme
  // (`model` + `dan` open the question form, `status` filters the questions,
  // `anketa` opens a car's survey, `brend` + `stanje` filter the passports,
  // `forma` opens a car's form exception). The list filters stay in the URL of
  // the page, so "Svi izlagači" returns to the same list.
  { path: "interakcije", group: "sajam", queryKeys: ["paket", "q", "stanje", "dan", "model", "status", "anketa", "brend", "forma", "prikaz"], detail: "izlagac" },
  { path: "sponzorisano", group: "sajam", queryKeys: ["prikaz"] },
  // SAJAM SUPER Korak 4 — `dan` = the day of the hour chart.
  { path: "analitika", group: "sajam", queryKeys: ["dan", "prikaz"] },
  // A8 — the inbox filters; `lead` opens the lead's drawer.
  { path: "leadovi", group: "posle", parent: "leadovi", queryKeys: ["izlagac", "brend", "model", "tip", "isporuka", "od", "do", "lead", "prikaz"] },
  // A8 — `izlagac` opens that exhibitor's text, `lead` previews it on that lead.
  { path: "leadovi/follow-up", group: "posle", parent: "leadovi", queryKeys: ["izlagac", "lead", "prikaz"] },
  { path: "leadovi/podesavanja", group: "posle", parent: "leadovi", queryKeys: [] },
  { path: "izvestaji", group: "posle", queryKeys: ["dan", "izlagac", "status", "prikaz"] },
  { path: "brisanje", group: "posle", queryKeys: ["prikaz"] },
];

export const DEFAULT_EVENT_SECTION: EventSectionPath = "pregled";

/** Izlagači 2026 — the parts of an exhibitor's Interakcije page, in page order (also the `#` anchors). */
export const INTERACTION_PARTS = ["glas-publike", "ankete", "pasos", "forme"] as const;
export type InteractionPart = (typeof INTERACTION_PARTS)[number];

export function isInteractionPart(value: string): value is InteractionPart {
  return (INTERACTION_PARTS as readonly string[]).includes(value);
}

const DETAIL_ID = /^[A-Za-z0-9_-]{1,64}$/;

export function isEventSectionPath(value: string): value is EventSectionPath {
  return (EVENT_SECTION_PATHS as readonly string[]).includes(value);
}

export function eventSectionDef(path: EventSectionPath): EventSectionDef {
  return EVENT_SECTIONS.find((section) => section.path === path)!;
}

export type ResolvedEventSection =
  | { kind: "section"; path: EventSectionPath; detailId?: string }
  /** `legacy` = a former `interakcije/<part>` page (Izlagači 2026: one page per exhibitor). */
  | { kind: "redirect"; path: EventSectionPath; legacy?: InteractionPart };

/**
 * Route segments under the event (`[[...section]]`) → the section, a detail
 * of it, or a redirect (no segments → Pregled; a former Interakcije page →
 * the exhibitor's page or the list, eventRedirectHref). null = not a section:
 * the page shows a "not found" state.
 */
export function resolveEventSection(segments: readonly string[] | undefined): ResolvedEventSection | null {
  const parts = segments ?? [];
  if (parts.length === 0) return { kind: "redirect", path: DEFAULT_EVENT_SECTION };
  if (parts.length === 1) {
    const [only] = parts;
    return isEventSectionPath(only) ? { kind: "section", path: only } : null;
  }
  if (parts.length !== 2) return null;
  const joined = `${parts[0]}/${parts[1]}`;
  if (parts[0] === "interakcije" && isInteractionPart(parts[1])) return { kind: "redirect", path: "interakcije", legacy: parts[1] };
  if (isEventSectionPath(joined)) return { kind: "section", path: joined };
  if (isEventSectionPath(parts[0]) && eventSectionDef(parts[0]).detail && DETAIL_ID.test(parts[1])) {
    return { kind: "section", path: parts[0], detailId: parts[1] };
  }
  return null;
}

/** Path segments of `pathname` below `base` (e.g. `/admin/dogadjaji/x`). */
export function eventPathSegments(pathname: string, base: string): string[] {
  if (pathname !== base && !pathname.startsWith(`${base}/`)) return [];
  return pathname.slice(base.length).split("/").filter(Boolean).map((part) => {
    try {
      return decodeURIComponent(part);
    } catch {
      return part;
    }
  });
}

export function eventBasePath(eventSlug: string) {
  return `/admin/dogadjaji/${encodeURIComponent(eventSlug)}`;
}

export function eventSectionHref(base: string, path: EventSectionPath, query: AdminQueryState = {}) {
  return `${base}/${path}${serializeAdminQuery(query)}`;
}

export function eventDetailHref(base: string, path: "modeli" | "qr" | "interakcije", id: string, query: AdminQueryState = {}) {
  return `${base}/${path}/${encodeURIComponent(id)}${serializeAdminQuery(query)}`;
}

/** An exhibitor's Interakcije page, optionally at one part (`#glas-publike`…). */
export function interactionExhibitorHref(base: string, participationId: string, query: AdminQueryState = {}, part?: InteractionPart) {
  return `${eventDetailHref(base, "interakcije", participationId, query)}${part ? `#${part}` : ""}`;
}

/** What a former `interakcije/<part>?izlagac=…` link meant, in the keys of the exhibitor's page. */
const LEGACY_PART_KEYS: Record<InteractionPart, readonly [from: AdminQueryKey, to: AdminQueryKey][]> = {
  "glas-publike": [["model", "model"], ["dan", "dan"], ["status", "status"]],
  ankete: [["model", "anketa"]],
  pasos: [["brend", "brend"], ["stanje", "stanje"]],
  forme: [["model", "forma"]],
};

/**
 * Where a redirect goes, with the filters the target reads. A former
 * Interakcije page with `?izlagac=` opens that exhibitor's page at the same
 * part (its model, day and filters kept); without it, the exhibitor list.
 * `extra` adds keys of the target (the preview keeps `?dogadjaj=`).
 */
export function eventRedirectHref(base: string, resolved: Extract<ResolvedEventSection, { kind: "redirect" }>, source: Parameters<typeof parseAdminQuery>[0], extra: AdminQueryState = {}) {
  const query = parseAdminQuery(source);
  if (resolved.legacy && query.izlagac) {
    const target: AdminQueryState = {};
    for (const [from, to] of LEGACY_PART_KEYS[resolved.legacy]) if (query[from]) target[to] = query[from];
    if (query.prikaz) target.prikaz = query.prikaz;
    return interactionExhibitorHref(base, query.izlagac, { ...target, ...extra }, resolved.legacy);
  }
  return eventSectionHref(base, resolved.path, { ...parseAdminQuery(query, eventSectionDef(resolved.path).queryKeys), ...extra });
}

/** Filters that mean the same in every event; ID filters (izlagac, model…) belong to one event. */
const KEPT_ON_EVENT_SWITCH: readonly AdminQueryKey[] = ["prikaz", "paket", "status", "problemi", "qr", "foto", "stanje", "segment", "tip", "isporuka", "q"];

/**
 * Switching the event keeps the open section (a detail falls back to its
 * list) and the event-independent filters. `extra` adds keys of the target
 * (the preview picks its event with `?dogadjaj=`).
 */
export function switchEventHref(base: string, current: ResolvedEventSection | null, query: AdminQueryState, extra: AdminQueryState = {}) {
  const path = current?.path ?? DEFAULT_EVENT_SECTION;
  return eventSectionHref(base, path, { ...parseAdminQuery(query, KEPT_ON_EVENT_SWITCH), ...extra });
}

export type EventForPick = { startsAt: number; endsAt: number; status: string };

/**
 * The event `/admin/dogadjaji` opens: the one in progress, else the nearest
 * upcoming, else the last one. Archived events only when nothing else exists.
 */
export function pickCurrentEvent<T extends EventForPick>(events: readonly T[], now: number): T | null {
  const open = events.filter((event) => event.status !== "archived");
  const pool = open.length ? open : events;
  if (!pool.length) return null;
  const running = pool.filter((event) => event.startsAt <= now && now < event.endsAt).sort((a, b) => a.startsAt - b.startsAt);
  if (running.length) return running[0];
  const upcoming = pool.filter((event) => event.startsAt > now).sort((a, b) => a.startsAt - b.startsAt);
  if (upcoming.length) return upcoming[0];
  return [...pool].sort((a, b) => b.endsAt - a.endsAt)[0];
}

/** Page title of a section or its detail (`generateMetadata`). */
export function eventSectionTitle(section: ResolvedEventSection | null) {
  if (!section || section.kind !== "section") return dict.pageTitle;
  const label = section.detailId
    ? section.path === "modeli" ? dict.detailModelTitle : section.path === "interakcije" ? dict.detailExhibitorTitle : dict.detailQrTitle
    : dict.sectionLabels[section.path];
  return `${label} · ${dict.pageTitle}`;
}

const PARENT_LABELS: Record<EventSectionParent, string> = { leadovi: dict.navLeads };

/**
 * Navigation of one event: groups → items → children. `hrefFor` builds the
 * link (admin or preview base); `active` is the open section (null = none).
 */
export function eventNavGroups(hrefFor: (path: EventSectionPath) => string, active: EventSectionPath | null): AdminSubnavGroup[] {
  const groups: AdminSubnavGroup[] = [];
  for (const section of EVENT_SECTIONS) {
    const groupId = section.group ?? "glavno";
    let group = groups.find((row) => row.id === groupId);
    if (!group) {
      group = { id: groupId, ...(section.group ? { label: dict.navGroups[section.group] } : {}), items: [] };
      groups.push(group);
    }
    const item: AdminSubnavItem = { id: section.path, href: hrefFor(section.path), label: dict.sectionLabels[section.path], active: section.path === active };
    if (!section.parent) {
      group.items.push(item);
      continue;
    }
    let parent = group.items.find((row) => row.id === section.parent);
    if (!parent) {
      parent = { id: section.parent, href: item.href, label: PARENT_LABELS[section.parent], active: false, children: [] };
      group.items.push(parent);
    }
    parent.children!.push(item);
    if (item.active) parent.activeChild = true;
  }
  return groups;
}
