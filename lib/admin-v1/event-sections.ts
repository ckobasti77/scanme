// Admin UX A2 — the one registry of the `Događaji` sections. Every section is
// a real route `/admin/dogadjaji/[eventSlug]/<path>` (and the same `<path>`
// under `/dev/admin-events-preview`). The paths are fixed by
// ADMIN-UX-ZAHTEVI §2 — labels may change, paths may not.

import { adminEventsSr as dict } from "@/lib/i18n/sr/admin-events";
import { parseAdminQuery, serializeAdminQuery, type AdminQueryKey, type AdminQueryState } from "./query-state";
import type { AdminSubnavGroup, AdminSubnavItem } from "./subnav";

export const EVENT_SECTION_PATHS = [
  "pregled",
  "modeli",
  "qr",
  "izlagaci",
  "import",
  "interakcije/glas-publike",
  "interakcije/ankete",
  "interakcije/pasos",
  "interakcije/forme",
  "sponzorisano",
  "leadovi",
  "leadovi/follow-up",
  "leadovi/podesavanja",
  "izvestaji",
  "brisanje",
] as const;

export type EventSectionPath = (typeof EVENT_SECTION_PATHS)[number];
type EventSectionGroup = "katalog" | "sajam" | "posle";
type EventSectionParent = "interakcije" | "leadovi";

export type EventSectionDef = {
  path: EventSectionPath;
  group: EventSectionGroup | null;
  parent?: EventSectionParent;
  /** Query keys the section reads (filters and `prikaz`). */
  queryKeys: readonly AdminQueryKey[];
  /** `<path>/<id>` opens a detail page. */
  detail?: "model" | "qr";
};

export const EVENT_SECTIONS: readonly EventSectionDef[] = [
  { path: "pregled", group: null, queryKeys: ["prikaz", "faza"] },
  { path: "modeli", group: "katalog", queryKeys: ["izlagac", "brend", "model", "q", "paket", "status", "problemi", "qr", "foto", "prikaz"], detail: "model" },
  { path: "qr", group: "katalog", queryKeys: ["prikaz"], detail: "qr" },
  { path: "izlagaci", group: "katalog", queryKeys: ["prikaz"] },
  { path: "import", group: "katalog", queryKeys: [] },
  { path: "interakcije/glas-publike", group: "sajam", parent: "interakcije", queryKeys: ["prikaz"] },
  { path: "interakcije/ankete", group: "sajam", parent: "interakcije", queryKeys: ["prikaz"] },
  { path: "interakcije/pasos", group: "sajam", parent: "interakcije", queryKeys: ["prikaz"] },
  { path: "interakcije/forme", group: "sajam", parent: "interakcije", queryKeys: ["model"] },
  { path: "sponzorisano", group: "sajam", queryKeys: ["prikaz"] },
  { path: "leadovi", group: "posle", parent: "leadovi", queryKeys: ["izlagac", "prikaz"] },
  { path: "leadovi/follow-up", group: "posle", parent: "leadovi", queryKeys: ["model"] },
  { path: "leadovi/podesavanja", group: "posle", parent: "leadovi", queryKeys: [] },
  { path: "izvestaji", group: "posle", queryKeys: ["prikaz"] },
  { path: "brisanje", group: "posle", queryKeys: ["prikaz"] },
];

export const DEFAULT_EVENT_SECTION: EventSectionPath = "pregled";

/** Parent paths that have no page of their own and open their first child. */
const PARENT_REDIRECTS: Record<string, EventSectionPath> = { interakcije: "interakcije/glas-publike" };

const DETAIL_ID = /^[A-Za-z0-9_-]{1,64}$/;

export function isEventSectionPath(value: string): value is EventSectionPath {
  return (EVENT_SECTION_PATHS as readonly string[]).includes(value);
}

export function eventSectionDef(path: EventSectionPath): EventSectionDef {
  return EVENT_SECTIONS.find((section) => section.path === path)!;
}

export type ResolvedEventSection =
  | { kind: "section"; path: EventSectionPath; detailId?: string }
  | { kind: "redirect"; path: EventSectionPath };

/**
 * Route segments under the event (`[[...section]]`) → the section, a detail
 * of it, or a redirect (no segments → Pregled; `interakcije` → its first
 * child). null = not a section: the page shows a "not found" state.
 */
export function resolveEventSection(segments: readonly string[] | undefined): ResolvedEventSection | null {
  const parts = segments ?? [];
  if (parts.length === 0) return { kind: "redirect", path: DEFAULT_EVENT_SECTION };
  if (parts.length === 1) {
    const [only] = parts;
    if (isEventSectionPath(only)) return { kind: "section", path: only };
    const target = PARENT_REDIRECTS[only];
    return target ? { kind: "redirect", path: target } : null;
  }
  if (parts.length !== 2) return null;
  const joined = `${parts[0]}/${parts[1]}`;
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

export function eventDetailHref(base: string, path: "modeli" | "qr", id: string, query: AdminQueryState = {}) {
  return `${base}/${path}/${encodeURIComponent(id)}${serializeAdminQuery(query)}`;
}

/** Filters that mean the same in every event; ID filters (izlagac, model…) belong to one event. */
const KEPT_ON_EVENT_SWITCH: readonly AdminQueryKey[] = ["prikaz", "paket", "status", "problemi", "qr", "foto", "stanje", "tip", "isporuka", "q"];

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
  const label = section.detailId ? (section.path === "modeli" ? dict.detailModelTitle : dict.detailQrTitle) : dict.sectionLabels[section.path];
  return `${label} · ${dict.pageTitle}`;
}

const PARENT_LABELS: Record<EventSectionParent, string> = { interakcije: dict.navInteractions, leadovi: dict.navLeads };

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
