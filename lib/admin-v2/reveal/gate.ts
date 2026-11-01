// ADMIN v3 V1 — the gate of the reveal engine (ZADATAK-V3 §0, §2; plan §2.5).
// Pure: whether a page enters at all and how. The content never depends on
// it: with `none` everything is simply in its final state, and without
// JavaScript nothing was ever hidden (the engine sets the hidden start state
// itself, only after this gate said so).

import { ADMIN_REVEAL } from "@/lib/admin-v2/motion";

/**
 * `none`: nothing moves, the page is in its final state.
 * `short`: a return (Back, or a page that had its full entrance a moment ago).
 * `full`: the first visit of the page in this session, or the first after 20 minutes.
 */
export type RevealMode = "none" | "short" | "full";

export type RevealGateInput = {
  /** `prefers-reduced-motion: reduce`. */
  reducedMotion: boolean;
  /** The quiet mode of the admin (`scanme.admin.quiet`). */
  quiet: boolean;
  /** The tab is on the screen. */
  visible: boolean;
  /** The page was drawn by the server and is being hydrated: what is already painted is never hidden. */
  hydrating: boolean;
  /** Back or Forward. */
  history: boolean;
  /** When this route last had its full entrance (ms), null: never in this session. */
  lastFullAt: number | null;
  now: number;
};

export function revealMode(input: RevealGateInput): RevealMode {
  if (input.reducedMotion || input.quiet || !input.visible || input.hydrating) return "none";
  if (input.history) return "short";
  if (input.lastFullAt !== null && input.now >= input.lastFullAt && input.now - input.lastFullAt < ADMIN_REVEAL.rearmMs) return "short";
  return "full";
}

/** The part of `adminRoute()` the key needs. */
export type RevealRoute = { key: string; events: { segments: readonly string[] } | null };

/**
 * The key of a page in the visit log: its canonical admin path. The sections
 * of Događaji are keyed without the event („dogadjaji/analitika“), so another
 * event's Analitika is a return, not a first visit.
 */
export function revealRouteKey(route: RevealRoute): string {
  if (route.events) return ["dogadjaji", ...route.events.segments].join("/");
  const path = route.key.replace(/^\/admin(?=\/|$)/, "").replace(/^\/+|\/+$/g, "");
  return path || "dashboard";
}

export const REVEAL_LOG_KEY = "scanme.admin.reveal.v1";

type ReadStorage = Pick<Storage, "getItem">;
type WriteStorage = Pick<Storage, "setItem">;
type RemoveStorage = Pick<Storage, "removeItem">;

export type RevealLog = Readonly<Record<string, number>>;

/** The visit log of this session; a storage that throws or holds something else is an empty log. */
export function readRevealLog(storage: ReadStorage | null | undefined): RevealLog {
  try {
    const raw = storage?.getItem(REVEAL_LOG_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    const log: Record<string, number> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "number" && Number.isFinite(value)) log[key] = value;
    }
    return log;
  } catch {
    return {};
  }
}

/** When `routeKey` last had its full entrance; null: never (or the log cannot be read). */
export function lastFullEntrance(storage: ReadStorage | null | undefined, routeKey: string): number | null {
  return readRevealLog(storage)[routeKey] ?? null;
}

/** Writes a full entrance; entries older than the re-arm time are dropped. false: it could not be kept. */
export function writeRevealVisit(storage: (ReadStorage & WriteStorage) | null | undefined, routeKey: string, now: number): boolean {
  try {
    if (!storage) return false;
    const log: Record<string, number> = {};
    for (const [key, at] of Object.entries(readRevealLog(storage))) {
      if (now - at < ADMIN_REVEAL.rearmMs) log[key] = at;
    }
    log[routeKey] = now;
    storage.setItem(REVEAL_LOG_KEY, JSON.stringify(log));
    return true;
  } catch {
    return false;
  }
}

export function clearRevealLog(storage: RemoveStorage | null | undefined): void {
  try {
    storage?.removeItem(REVEAL_LOG_KEY);
  } catch {
    // Nothing to clear.
  }
}

/** How long after a change of the query a new row is still the answer to a filter, not a live row (ms). */
export const LIVE_ROW_QUIET_MS = 1500;
/** More rows than this in one frame is a page of results, not live rows. */
export const LIVE_ROW_MAX = 3;

export type LiveRowInput = {
  /** The entrance window of the page is over. */
  afterWindow: boolean;
  /** The engine has already seen this node. */
  seen: boolean;
  /** Time since the query string of the page last changed (ms). */
  sinceQueryChange: number;
  /** The list had no row before this one. */
  listWasEmpty: boolean;
  /** Rows that arrived in the same frame. */
  addedTogether: number;
};

/**
 * A row that arrived while the page is open (polling, a subscription) enters
 * with a green edge. „Učitaj još“, a filter and a sort are not live rows:
 * they bring many rows at once, follow a change of the query, or fill an
 * empty list.
 */
export function isLiveRow(input: LiveRowInput): boolean {
  return input.afterWindow && !input.seen && !input.listWasEmpty && input.sinceQueryChange >= LIVE_ROW_QUIET_MS && input.addedTogether >= 1 && input.addedTogether <= LIVE_ROW_MAX;
}

/** Content that arrives inside the entrance window still gets its choreography; later only a skeleton is replaced. */
export function inRevealWindow(enteredAt: number, now: number): boolean {
  return now - enteredAt < ADMIN_REVEAL.window * 1000;
}

export type LateRevealInput = {
  /** The entrance window of the page is still open. */
  inWindow: boolean;
  /** The content took the place of a skeleton (a read has arrived). */
  replacedSkeleton: boolean;
  /** This place of the page has already had a skeleton replaced in this visit. */
  regionSeen: boolean;
  /** The query string changed since the page was entered (a filter, a sort, a tab). */
  queryChanged: boolean;
};

/**
 * How content that arrives after the navigation enters (V5, RV S1):
 * `group` — its own choreography (the number counts from zero, the chart is drawn, the rows cascade);
 * `fade`  — it only fades in over the skeleton it replaces;
 * `none`  — it is simply there.
 * Inside the entrance window everything new gets its choreography. After it only the FIRST read of a
 * place does: on the real admin the data often arrives later than the window, and the page would
 * otherwise enter with nothing but a fade. A read that follows a filter, and every later read of the
 * same place, only fades; polling replaces no skeleton, so it never enters at all.
 */
export function lateReveal(input: LateRevealInput): "group" | "fade" | "none" {
  if (input.inWindow) return "group";
  if (!input.replacedSkeleton) return "none";
  return input.regionSeen || input.queryChanged ? "fade" : "group";
}

const normalizePath = (path: string) => (path === "/" ? path : path.replace(/\/+$/, ""));
const isAdminPath = (path: string) => path === "/admin" || path.startsWith("/admin/") || path.startsWith("/dev/admin-");

export type PageExitInput = {
  /** The path of the open page. */
  current: string;
  /** The link that was clicked: its origin and path, as `URL` gives them. */
  target: { origin: string; pathname: string };
  origin: string;
  /** A click with a modifier, another button, `target="_blank"` or `download` opens something else. */
  plain: boolean;
};

/**
 * Whether a click leaves the page for another admin page (the old page then
 * dims for 140 ms). A change of the query on the same path (a filter) is not
 * a transition.
 */
export function isPageExit(input: PageExitInput): boolean {
  if (!input.plain || input.target.origin !== input.origin) return false;
  const next = normalizePath(input.target.pathname);
  return isAdminPath(next) && next !== normalizePath(input.current);
}
