import { describe, expect, it } from "vitest";
import { HUD_STALE_MS, hudData, hudEvent, hudState, type HudInput } from "./hud";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const START = Date.parse("2026-10-09T00:00:00+02:00");
const days = [0, 1, 2].map((index) => ({ startsAt: START + index * DAY + 9 * HOUR, endsAt: START + index * DAY + 19 * HOUR }));

const input = (phase: HudInput["phase"], extra: Partial<HudInput> = {}): HudInput => ({ phase, days, scansToday: 179, leadsToday: 0, actions: [], ...extra });

describe("the event the HUD is for", () => {
  const fair = { slug: "test-sajam", title: "TEST Sajam", startsAt: START, endsAt: START + 3 * DAY, status: "live" };

  it("is the event whose fair is on now", () => {
    expect(hudEvent([fair], START + DAY)?.slug).toBe("test-sajam");
    expect(hudEvent([fair], START)).not.toBeNull();
  });

  it("is none before the opening and after the last day", () => {
    expect(hudEvent([fair], START - 1)).toBeNull();
    expect(hudEvent([fair], fair.endsAt)).toBeNull();
    expect(hudEvent([], START)).toBeNull();
  });

  it("is never a draft or an archived event", () => {
    for (const status of ["draft", "ended", "archived"]) expect(hudEvent([{ ...fair, status }], START + DAY)).toBeNull();
    expect(hudEvent([{ ...fair, status: "published" }], START + DAY)).not.toBeNull();
  });

  it("with two fairs at once it is the one that started last", () => {
    const later = { ...fair, slug: "test-amf", startsAt: START + DAY };
    expect(hudEvent([fair, later], START + 2 * DAY)?.slug).toBe("test-amf");
    expect(hudEvent([later, fair], START + 2 * DAY)?.slug).toBe("test-amf");
  });
});

describe("what the HUD shows", () => {
  it("an open fair day: the day, how far it is, the time left and the scans of the day", () => {
    const now = days[2].startsAt + 8 * HOUR;
    const state = hudState(input({ kind: "sajam", dayOpen: true, dayIndex: 3, dayCount: 3, nextDeadline: { kind: "day_end", at: days[2].endsAt } }), now);
    expect(state).toEqual({ kind: "live", dayIndex: 3, dayCount: 3, progress: 0.8, left: 2 * HOUR, scansToday: 179, scansCapped: false });
  });

  it("a partial scan count is marked", () => {
    const state = hudState(input({ kind: "sajam", dayOpen: true, dayIndex: 1, dayCount: 3, nextDeadline: null }, { scansCapped: true }), days[0].startsAt + HOUR);
    expect(state).toMatchObject({ kind: "live", scansCapped: true });
  });

  it("between two fair days: the next day and how long until it opens, no live mark", () => {
    const now = days[0].endsAt + HOUR;
    const state = hudState(input({ kind: "sajam", dayOpen: false, dayIndex: 2, dayCount: 3, nextDeadline: { kind: "day_start", at: days[1].startsAt } }), now);
    expect(state).toEqual({ kind: "between", dayIndex: 2, dayCount: 3, left: 13 * HOUR });
  });

  it("nothing before the fair, after it, and after the last day closed", () => {
    expect(hudState(input({ kind: "pre", dayOpen: false, dayIndex: null, dayCount: 3, nextDeadline: { kind: "opening", at: START } }), START - HOUR)).toBeNull();
    expect(hudState(input({ kind: "posle", dayOpen: false, dayIndex: null, dayCount: 3, nextDeadline: { kind: "lead_delivery", at: START + 30 * DAY } }), START + 10 * DAY)).toBeNull();
    expect(hudState(input({ kind: "sajam", dayOpen: false, dayIndex: 3, dayCount: 3, nextDeadline: { kind: "lead_delivery", at: START + 30 * DAY } }), days[2].endsAt + HOUR)).toBeNull();
    expect(hudState(input({ kind: "obrisano", dayOpen: false, dayIndex: null, dayCount: 3, nextDeadline: null }), START + 60 * DAY)).toBeNull();
  });

  it("the time left is never negative", () => {
    const late = hudState(input({ kind: "sajam", dayOpen: true, dayIndex: 1, dayCount: 3, nextDeadline: null }), days[0].endsAt + HOUR);
    expect(late).toMatchObject({ kind: "live", progress: 1, left: 0 });
  });
});

describe("the HUD of an event from its dashboard read", () => {
  const event = { title: "TEST Sajam", href: "/admin/dogadjaji/test-sajam/pregled" };

  it("carries the event, its link and the state", () => {
    const at = days[2].startsAt + 5 * HOUR;
    const hud = hudData(event, { at, phase: { kind: "sajam", dayOpen: true, dayIndex: 3, dayCount: 3, nextDeadline: null }, days, kpis: { scans: { today: 179, capped: true } } }, at);
    expect(hud).toEqual({ eventTitle: "TEST Sajam", href: event.href, readAt: at, stale: false, state: { kind: "live", dayIndex: 3, dayCount: 3, progress: 0.5, left: 5 * HOUR, scansToday: 179, scansCapped: true } });
  });

  it("a read the polls have not renewed for a while is not live any more", () => {
    const at = days[2].startsAt + 5 * HOUR;
    const dashboard = { at, phase: { kind: "sajam", dayOpen: true, dayIndex: 3, dayCount: 3, nextDeadline: null }, days, kpis: { scans: { today: 179, capped: false } } };
    expect(hudData(event, dashboard, at + HUD_STALE_MS)?.stale).toBe(false);
    const late = hudData(event, dashboard, at + HUD_STALE_MS + 60_000);
    expect(late).toMatchObject({ stale: true, readAt: at });
    // The clock of the day still moves; only the number is old.
    expect(late?.state).toMatchObject({ kind: "live", left: 5 * HOUR - HUD_STALE_MS - 60_000 });
  });

  it("is null outside the fair days", () => {
    expect(hudData(event, { at: START + 10 * DAY, phase: { kind: "posle", dayOpen: false, dayIndex: null, dayCount: 3, nextDeadline: null }, days, kpis: { scans: { today: 0, capped: false } } }, START + 10 * DAY)).toBeNull();
  });
});
