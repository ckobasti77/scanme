import { describe, expect, test } from "vitest";
import { TIMELAPSE_PLAY_MS, TIMELAPSE_TEXT_MS, playT, playerDone, playerReduce, playerT, seekByKey, seekByPosition } from "./player";
import type { TimelapsePlayer } from "./types";

// ADMIN v3 V3 — the player of the Vremeplov: „Premotaj dan“ plays a day in about
// 12 seconds, and a pause, the slider and „Uživo“ work at any moment.

/** A day of 13 hours (08:00 – 21:00). */
const END = 13;
const at = (now: number) => ({ now, end: END });

describe("playT: the whole day takes about 12 seconds", () => {
  test("it starts at the opening, is half way after 6 s and at the end after 12 s", () => {
    expect(TIMELAPSE_PLAY_MS).toBe(12_000);
    expect(playT(0, 0, END)).toBe(0);
    expect(playT(0, 6000, END)).toBeCloseTo(6.5, 10);
    expect(playT(0, 12_000, END)).toBe(END);
  });

  test("the pace is the same wherever it starts: the rest of the day takes the rest of the 12 s", () => {
    expect(playT(6.5, 3000, END)).toBeCloseTo(9.75, 10);
    expect(playT(6.5, 6000, END)).toBe(END);
  });

  test("it never passes the end, and an open day (a fractional end) plays in the same 12 s", () => {
    expect(playT(0, 60_000, END)).toBe(END);
    expect(playT(0, 6000, 6.4)).toBeCloseTo(3.2, 10);
    expect(playT(0, 12_000, 6.4)).toBe(6.4);
  });

  test("an empty day and bad input give 0", () => {
    expect(playT(0, 5000, 0)).toBe(0);
    expect(playT(Number.NaN, 0, END)).toBe(0);
    expect(playT(2, -500, END)).toBe(2);
  });
});

describe("playerT: the moment the player shows", () => {
  test("the live picture has no moment", () => {
    expect(playerT({ mode: "live" }, 1000, END)).toBeNull();
  });

  test("a pause stands where it was put, inside the day", () => {
    expect(playerT({ mode: "paused", t: 5 }, 99_999, END)).toBe(5);
    expect(playerT({ mode: "paused", t: 1e6 }, 0, END)).toBe(END);
    expect(playerT({ mode: "paused", t: -3 }, 0, END)).toBe(0);
  });

  test("a replay moves with the clock", () => {
    const player: TimelapsePlayer = { mode: "playing", fromT: 0, startedAt: 10_000 };
    expect(playerT(player, 10_000, END)).toBe(0);
    expect(playerT(player, 13_000, END)).toBeCloseTo(3.25, 10);
    expect(playerT(player, 22_000, END)).toBe(END);
  });

  test("without motion a replay jumps hour by hour and still reaches the end of an open day", () => {
    const player: TimelapsePlayer = { mode: "playing", fromT: 0, startedAt: 0 };
    expect(playerT(player, 3000, END, false)).toBe(3);
    expect(playerT(player, 3900, END, false)).toBe(4);
    expect(playerT(player, 12_000, 6.4, false)).toBe(6.4);
  });

  test("a replay is done when it has reached the end", () => {
    const player: TimelapsePlayer = { mode: "playing", fromT: 0, startedAt: 0 };
    expect(playerDone(player, 11_999, END)).toBe(false);
    expect(playerDone(player, 12_000, END)).toBe(true);
    expect(playerDone({ mode: "paused", t: END }, 12_000, END)).toBe(false);
    expect(playerDone({ mode: "live" }, 12_000, END)).toBe(false);
  });

  test("the text beside the hall follows four times a second", () => {
    expect(TIMELAPSE_TEXT_MS).toBe(250);
  });
});

describe("playerReduce: play, pause, the slider and „Uživo“ at any moment", () => {
  test("„Premotaj dan“ from the live picture starts at the opening", () => {
    expect(playerReduce({ mode: "live" }, { type: "toggle" }, at(500))).toEqual({ mode: "playing", fromT: 0, startedAt: 500 });
  });

  test("a pause keeps the moment the replay had reached, and the next press goes on from there", () => {
    const playing: TimelapsePlayer = { mode: "playing", fromT: 0, startedAt: 0 };
    const paused = playerReduce(playing, { type: "toggle" }, at(3000));
    expect(paused.mode).toBe("paused");
    expect(paused.mode === "paused" && paused.t).toBeCloseTo(3.25, 10);
    expect(playerReduce(paused, { type: "toggle" }, at(8000))).toEqual({ mode: "playing", fromT: paused.mode === "paused" ? paused.t : -1, startedAt: 8000 });
  });

  test("from the end of the day the replay starts over", () => {
    expect(playerReduce({ mode: "paused", t: END }, { type: "toggle" }, at(100))).toEqual({ mode: "playing", fromT: 0, startedAt: 100 });
    expect(playerReduce({ mode: "paused", t: 1e6 }, { type: "toggle" }, at(100))).toEqual({ mode: "playing", fromT: 0, startedAt: 100 });
  });

  test("the slider stops a replay at the chosen moment, clamped into the day", () => {
    const playing: TimelapsePlayer = { mode: "playing", fromT: 0, startedAt: 0 };
    expect(playerReduce(playing, { type: "seek", t: 4 }, at(2000))).toEqual({ mode: "paused", t: 4 });
    expect(playerReduce({ mode: "live" }, { type: "seek", t: 99 }, at(0))).toEqual({ mode: "paused", t: END });
    expect(playerReduce({ mode: "live" }, { type: "seek", t: -2 }, at(0))).toEqual({ mode: "paused", t: 0 });
  });

  test("„Uživo“ leaves the Vremeplov from any state", () => {
    for (const player of [{ mode: "live" }, { mode: "paused", t: 3 }, { mode: "playing", fromT: 1, startedAt: 0 }] satisfies TimelapsePlayer[]) {
      expect(playerReduce(player, { type: "live" }, at(0))).toEqual({ mode: "live" });
    }
  });

  test("a replay that has reached the end stays there, paused; a finish of anything else changes nothing", () => {
    expect(playerReduce({ mode: "playing", fromT: 0, startedAt: 0 }, { type: "finish" }, at(12_000))).toEqual({ mode: "paused", t: END });
    const paused: TimelapsePlayer = { mode: "paused", t: 2 };
    expect(playerReduce(paused, { type: "finish" }, at(0))).toBe(paused);
  });

  test("a day without hours cannot be played", () => {
    const live: TimelapsePlayer = { mode: "live" };
    expect(playerReduce(live, { type: "toggle" }, { now: 0, end: 0 })).toBe(live);
  });
});

describe("the slider: the keyboard moves a whole hour", () => {
  test("the arrows go to the next and the previous whole hour", () => {
    expect(seekByKey("ArrowRight", 3, END)).toBe(4);
    expect(seekByKey("ArrowUp", 3.4, END)).toBe(4);
    expect(seekByKey("ArrowLeft", 3, END)).toBe(2);
    expect(seekByKey("ArrowDown", 3.4, END)).toBe(3);
  });

  test("the ends stop the arrows; an open day ends at its own end", () => {
    expect(seekByKey("ArrowLeft", 0, END)).toBe(0);
    expect(seekByKey("ArrowRight", END, END)).toBe(END);
    expect(seekByKey("ArrowRight", 6, 6.4)).toBe(6.4);
    expect(seekByKey("ArrowLeft", 6.4, 6.4)).toBe(6);
  });

  test("Page Up and Page Down move three hours, Home and End go to the opening and the end", () => {
    expect(seekByKey("PageUp", 3, END)).toBe(6);
    expect(seekByKey("PageDown", 3, END)).toBe(0);
    expect(seekByKey("Home", 7.5, END)).toBe(0);
    expect(seekByKey("End", 2, 6.4)).toBe(6.4);
  });

  test("another key is not a key of the slider", () => {
    for (const key of ["a", "Tab", " ", "Enter", "Escape"]) expect(seekByKey(key, 3, END)).toBeNull();
  });

  test("a dragged position is the nearest whole hour, or the end of an open day", () => {
    expect(seekByPosition(3.4, END)).toBe(3);
    expect(seekByPosition(3.5, END)).toBe(4);
    expect(seekByPosition(6.3, 6.4)).toBe(6);
    expect(seekByPosition(6.39, 6.4)).toBe(6);
    expect(seekByPosition(99, 6.4)).toBe(6.4);
    expect(seekByPosition(-1, END)).toBe(0);
    expect(seekByPosition(Number.NaN, END)).toBe(0);
  });
});
