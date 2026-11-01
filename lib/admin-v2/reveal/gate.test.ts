import { describe, expect, test } from "vitest";
import { adminRoute } from "@/lib/admin-v2/frame/routes";
import { ADMIN_REVEAL } from "@/lib/admin-v2/motion";
import {
  LIVE_ROW_MAX,
  LIVE_ROW_QUIET_MS,
  REVEAL_LOG_KEY,
  clearRevealLog,
  inRevealWindow,
  isLiveRow,
  isPageExit,
  lastFullEntrance,
  lateReveal,
  readRevealLog,
  revealMode,
  revealRouteKey,
  writeRevealVisit,
  type RevealGateInput,
} from "./gate";

// ADMIN v3 V1 — the gate of the reveal engine: when a page enters and how.
// Reduced motion, the quiet mode, a hidden tab and a page the server drew show
// the final state at once; the first visit of a page in the session is the
// full entrance, a return is short, and after 20 minutes it is full again.

const NOW = Date.parse("2026-10-13T10:00:00+02:00");
const MINUTE = 60_000;
const open: RevealGateInput = { reducedMotion: false, quiet: false, visible: true, hydrating: false, history: false, lastFullAt: null, now: NOW };

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

const broken = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
  removeItem: () => {
    throw new Error("blocked");
  },
};

describe("the mode of an entrance", () => {
  test("reduced motion, the quiet mode, a hidden tab and hydration show the final state", () => {
    expect(revealMode({ ...open, reducedMotion: true })).toBe("none");
    expect(revealMode({ ...open, quiet: true })).toBe("none");
    expect(revealMode({ ...open, visible: false })).toBe("none");
    expect(revealMode({ ...open, hydrating: true })).toBe("none");
    // Each of them wins over a first visit and over Back.
    expect(revealMode({ ...open, reducedMotion: true, history: true })).toBe("none");
    expect(revealMode({ ...open, quiet: true, lastFullAt: NOW - MINUTE })).toBe("none");
  });

  test("the first visit of a page in the session is the full entrance", () => {
    expect(revealMode(open)).toBe("full");
  });

  test("a second visit within 20 minutes is short; after 20 minutes it is full again", () => {
    expect(revealMode({ ...open, lastFullAt: NOW - MINUTE })).toBe("short");
    expect(revealMode({ ...open, lastFullAt: NOW - 20 * MINUTE + 1 })).toBe("short");
    expect(revealMode({ ...open, lastFullAt: NOW - 20 * MINUTE })).toBe("full");
    expect(revealMode({ ...open, lastFullAt: NOW - 3 * 60 * MINUTE })).toBe("full");
    expect(ADMIN_REVEAL.rearmMs).toBe(20 * MINUTE);
  });

  test("Back and Forward are short, also to a page that was never entered in full", () => {
    expect(revealMode({ ...open, history: true })).toBe("short");
    expect(revealMode({ ...open, history: true, lastFullAt: NOW - 60 * MINUTE })).toBe("short");
  });

  test("a time from the future (a changed clock) is not a recent visit", () => {
    expect(revealMode({ ...open, lastFullAt: NOW + MINUTE })).toBe("full");
  });
});

describe("the key of a page", () => {
  test("is its canonical admin path", () => {
    expect(revealRouteKey(adminRoute("/admin"))).toBe("dashboard");
    expect(revealRouteKey(adminRoute("/admin/klijenti/"))).toBe("klijenti");
    expect(revealRouteKey(adminRoute("/admin/operativa/porudzbine"))).toBe("operativa/porudzbine");
    expect(revealRouteKey(adminRoute("/admin/klijenti/abc123"))).toBe("klijenti/abc123");
  });

  test("a dev preview has the key of the admin page it shows", () => {
    expect(revealRouteKey(adminRoute("/dev/admin-clients-preview"))).toBe("klijenti");
    expect(revealRouteKey(adminRoute("/dev/admin-okvir-preview/zadaci"))).toBe("zadaci");
    expect(revealRouteKey(adminRoute("/dev/admin-okvir-preview"))).toBe("dashboard");
  });

  test("the sections of Događaji are keyed without the event", () => {
    expect(revealRouteKey(adminRoute("/admin/dogadjaji/test-sajam/analitika"))).toBe("dogadjaji/analitika");
    expect(revealRouteKey(adminRoute("/admin/dogadjaji/drugi-sajam/analitika"))).toBe("dogadjaji/analitika");
    expect(revealRouteKey(adminRoute("/dev/admin-events-preview/pregled"))).toBe("dogadjaji/pregled");
    expect(revealRouteKey(adminRoute("/admin/dogadjaji/test-sajam"))).toBe("dogadjaji");
    // The list of events is its own page.
    expect(revealRouteKey(adminRoute("/admin/dogadjaji"))).toBe("dogadjaji");
  });
});

describe("the visit log of the session", () => {
  test("a full entrance is written and read back per page", () => {
    const storage = memoryStorage();
    expect(lastFullEntrance(storage, "klijenti")).toBeNull();
    expect(writeRevealVisit(storage, "klijenti", NOW)).toBe(true);
    expect(writeRevealVisit(storage, "zadaci", NOW + MINUTE)).toBe(true);
    expect(lastFullEntrance(storage, "klijenti")).toBe(NOW);
    expect(lastFullEntrance(storage, "zadaci")).toBe(NOW + MINUTE);
    expect(lastFullEntrance(storage, "inbox")).toBeNull();
    expect(JSON.parse(storage.data.get(REVEAL_LOG_KEY)!)).toEqual({ klijenti: NOW, zadaci: NOW + MINUTE });
  });

  test("first visit, then short, then full again after 20 minutes", () => {
    const storage = memoryStorage();
    const at = (now: number) => revealMode({ ...open, now, lastFullAt: lastFullEntrance(storage, "klijenti") });
    expect(at(NOW)).toBe("full");
    writeRevealVisit(storage, "klijenti", NOW);
    expect(at(NOW + 5 * MINUTE)).toBe("short");
    expect(at(NOW + 21 * MINUTE)).toBe("full");
  });

  test("entries older than 20 minutes are dropped when the log is written", () => {
    const storage = memoryStorage();
    writeRevealVisit(storage, "klijenti", NOW);
    writeRevealVisit(storage, "zadaci", NOW + 25 * MINUTE);
    expect(readRevealLog(storage)).toEqual({ zadaci: NOW + 25 * MINUTE });
  });

  test("a storage that throws, is missing or holds something else never throws: the page is a first visit", () => {
    expect(readRevealLog(broken)).toEqual({});
    expect(lastFullEntrance(broken, "klijenti")).toBeNull();
    expect(writeRevealVisit(broken, "klijenti", NOW)).toBe(false);
    expect(() => clearRevealLog(broken)).not.toThrow();
    expect(readRevealLog(null)).toEqual({});
    expect(writeRevealVisit(null, "klijenti", NOW)).toBe(false);
    for (const raw of ["not json", "[1,2]", "null", "42", '{"klijenti":"yesterday"}']) {
      expect(readRevealLog(memoryStorage({ [REVEAL_LOG_KEY]: raw }))).toEqual({});
    }
  });

  test("clearing the log makes every page a first visit again (the dev replay)", () => {
    const storage = memoryStorage();
    writeRevealVisit(storage, "klijenti", NOW);
    clearRevealLog(storage);
    expect(lastFullEntrance(storage, "klijenti")).toBeNull();
  });
});

describe("content that arrives later", () => {
  test("inside the entrance window (1200 ms) it still gets its choreography", () => {
    expect(inRevealWindow(NOW, NOW + 600)).toBe(true);
    expect(inRevealWindow(NOW, NOW + 1199)).toBe(true);
    expect(inRevealWindow(NOW, NOW + 1200)).toBe(false);
    // A poll a minute later never repeats the entrance.
    expect(inRevealWindow(NOW, NOW + MINUTE)).toBe(false);
  });

  const live = { afterWindow: true, seen: false, sinceQueryChange: 60_000, listWasEmpty: false, addedTogether: 1 };

  test("a row that arrives while the page is open is a live row", () => {
    expect(isLiveRow(live)).toBe(true);
    expect(isLiveRow({ ...live, addedTogether: LIVE_ROW_MAX })).toBe(true);
  });

  test("a page of results, a filter, a first fill and the entrance itself are not", () => {
    expect(isLiveRow({ ...live, addedTogether: LIVE_ROW_MAX + 1 })).toBe(false);
    expect(isLiveRow({ ...live, addedTogether: 25 })).toBe(false);
    expect(isLiveRow({ ...live, sinceQueryChange: LIVE_ROW_QUIET_MS - 1 })).toBe(false);
    expect(isLiveRow({ ...live, listWasEmpty: true })).toBe(false);
    expect(isLiveRow({ ...live, afterWindow: false })).toBe(false);
    expect(isLiveRow({ ...live, seen: true })).toBe(false);
    expect(isLiveRow({ ...live, addedTogether: 0 })).toBe(false);
  });
});

describe("a read that arrives after the navigation (V5, RV S1)", () => {
  const late = { inWindow: false, replacedSkeleton: true, regionSeen: false, queryChanged: false };

  test("inside the window everything new gets its choreography, also what replaced nothing", () => {
    expect(lateReveal({ ...late, inWindow: true })).toBe("group");
    expect(lateReveal({ inWindow: true, replacedSkeleton: false, regionSeen: true, queryChanged: true })).toBe("group");
  });

  test("after the window the first read of a place still enters in full: the real admin waits for its queries", () => {
    // 1.5 s and 3 s after the navigation: the number counts from zero, the ring is drawn, the rows cascade.
    expect(inRevealWindow(NOW, NOW + 1500)).toBe(false);
    expect(lateReveal(late)).toBe("group");
  });

  test("a later read of the same place and a read that answers a filter only fade", () => {
    expect(lateReveal({ ...late, regionSeen: true })).toBe("fade");
    expect(lateReveal({ ...late, queryChanged: true })).toBe("fade");
  });

  test("polling replaces no skeleton, so it never enters", () => {
    expect(lateReveal({ ...late, replacedSkeleton: false })).toBe("none");
    expect(lateReveal({ inWindow: false, replacedSkeleton: false, regionSeen: true, queryChanged: true })).toBe("none");
  });
});

describe("leaving a page", () => {
  const origin = "https://scanme.test";
  const click = (current: string, pathname: string, extra: Partial<{ plain: boolean; origin: string }> = {}) =>
    isPageExit({ current, target: { origin: extra.origin ?? origin, pathname }, origin, plain: extra.plain ?? true });

  test("a link to another admin page is a transition", () => {
    expect(click("/admin", "/admin/klijenti")).toBe(true);
    expect(click("/admin/klijenti", "/admin/klijenti/abc123")).toBe(true);
    expect(click("/dev/admin-okvir-preview", "/dev/admin-okvir-preview/zadaci")).toBe(true);
    expect(click("/dev/admin-dashboard-preview", "/dev/admin-clients-preview")).toBe(true);
  });

  test("a filter (the same path), a link out of the admin and a click that opens something else are not", () => {
    expect(click("/admin/klijenti", "/admin/klijenti")).toBe(false);
    expect(click("/admin/klijenti/", "/admin/klijenti")).toBe(false);
    expect(click("/admin", "/sajam/mapa")).toBe(false);
    expect(click("/admin", "/")).toBe(false);
    expect(click("/admin", "/admin/klijenti", { origin: "https://example.com" })).toBe(false);
    expect(click("/admin", "/admin/klijenti", { plain: false })).toBe(false);
  });
});
