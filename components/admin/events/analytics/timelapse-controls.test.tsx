import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { TimelapseControls, type TimelapseControlsProps } from "@/components/admin/events/analytics/timelapse-controls";
import { adminEventsSr } from "@/lib/i18n/sr/admin-events";

const v = adminEventsSr.analytics.v2.timelapse;
const noop = () => {};
// The attribute, not the `disabled:` utility classes.
const DISABLED = / disabled(=""| |>|\/>)/;
const HOURS = [8, 9, 10, 11, 12, 13];
const base: TimelapseControlsProps = {
  days: [
    { dateKey: "2026-10-09", label: "TEST dan 1" },
    { dateKey: "2026-10-10", label: "TEST dan 2" },
  ],
  dateKey: "2026-10-10",
  onDay: noop,
  hours: HOURS,
  end: 6,
  t: 3,
  clock: "11:00",
  mode: "paused",
  onSeek: noop,
  onToggle: noop,
  onLive: noop,
  status: "ready",
  onRetry: noop,
  announcement: "",
};
const render = (props: Partial<TimelapseControlsProps> = {}) => renderToStaticMarkup(<TimelapseControls {...base} {...props} />);
const tag = (html: string, marker: string) => html.match(new RegExp(`<[a-z]+ [^>]*${marker}[^>]*>`))?.[0] ?? "";
const button = (html: string, action: string) => html.match(new RegExp(`<button [^>]*data-timelapse-action="${action}"[^>]*>.*?</button>`))?.[0] ?? "";

describe("TimelapseControls", () => {
  test("the block is a named group that carries the mode", () => {
    const html = render({ mode: "playing" });
    expect(html).toContain(`role="group" aria-label="${v.title}"`);
    expect(html).toContain('data-timelapse=""');
    expect(html).toContain('data-timelapse-mode="playing"');
  });

  test("the days are a radiogroup and the chosen one is checked", () => {
    const html = render();
    expect(html).toContain(`role="radiogroup" aria-label="${v.days}"`);
    expect(html).toMatch(/data-value="2026-10-10"/);
    expect(html).toMatch(/role="radio" aria-checked="true"[^>]*data-value="2026-10-10"/);
    expect(html).toMatch(/role="radio" aria-checked="false"[^>]*data-value="2026-10-09"/);
    expect(html).toContain("TEST dan 1");
    expect(html).toContain("TEST dan 2");
  });

  test("a single day is still shown; no days, no radiogroup", () => {
    expect(render({ days: [base.days[0]], dateKey: base.days[0].dateKey })).toContain('role="radiogroup"');
    expect(render({ days: [], dateKey: null })).not.toContain('role="radiogroup"');
  });

  test("the slider carries the moment, the range and the clock as its text", () => {
    const html = render({ t: 2.5, clock: "10:30" });
    const slider = tag(html, "data-timelapse-slider");
    expect(slider).toContain('type="range"');
    expect(slider).toContain('min="0"');
    expect(slider).toContain('max="6"');
    expect(slider).toContain('step="any"');
    expect(slider).toContain('value="2.5"');
    expect(slider).toContain(`aria-label="${v.slider}"`);
    expect(slider).toContain('aria-valuetext="10:30"');
    expect(slider).not.toMatch(DISABLED);
  });

  test("the clock shows the given time, and it is keyed by the whole hour", () => {
    const html = render({ clock: "11:20", t: 3.33 });
    expect(html).toMatch(/data-timelapse-clock="[^>]*>[^]*<span class="admin-hall-tick">11:20<\/span>/);
  });

  test("the fill of the track is a transform, never a width", () => {
    const html = render({ t: 3 });
    expect(tag(html, "data-timelapse-fill")).toContain("scaleX(0.5)");
    expect(tag(html, "data-timelapse-fill")).not.toContain("width");
    expect(tag(render({ t: 0 }), "data-timelapse-fill")).toContain("scaleX(0)");
    expect(tag(render({ t: 6 }), "data-timelapse-fill")).toContain("scaleX(1)");
  });

  test("one tick per hour and a label under every second hour", () => {
    const html = render();
    expect((html.match(/data-timelapse-tick="/g) ?? []).length).toBe(HOURS.length);
    const labels = [...html.matchAll(/data-timelapse-tick-label="(\d+)"[^>]*>(\d+)</g)].map((match) => match[2]);
    expect(labels).toEqual(["08", "10", "12"]);
    // The first tick is at the start of the track, the third at a third of it.
    expect(html).toMatch(/data-timelapse-tick="8"[^>]*style="left:0%"/);
    expect(html).toMatch(/data-timelapse-tick="10"[^>]*style="left:33\.33%"/);
  });

  test("the open day has ticks only for the hours that started", () => {
    const html = render({ hours: [8, 9, 10], end: 2.4, t: 2.4 });
    expect((html.match(/data-timelapse-tick="/g) ?? []).length).toBe(3);
    expect(render({ hours: [8, 9, 10], end: 2, t: 2 }).match(/data-timelapse-tick="/g)?.length).toBe(2);
  });

  test("the button says play when paused or live and pause when playing", () => {
    for (const mode of ["paused", "live"] as const) {
      const toggle = button(render({ mode }), "toggle");
      expect(toggle).toContain(v.play);
      expect(toggle).not.toContain(v.pause);
      expect(toggle).not.toContain("aria-pressed");
    }
    const playing = button(render({ mode: "playing" }), "toggle");
    expect(playing).toContain(v.pause);
    expect(playing).not.toContain(v.play);
    expect(playing).toContain('aria-hidden="true"');
  });

  test("Uživo is pressed only in the live mode, and the live mark is drawn only there", () => {
    expect(button(render({ mode: "live" }), "live")).toContain('aria-pressed="true"');
    expect(render({ mode: "live" })).toContain('data-timelapse-live=""');
    for (const mode of ["paused", "playing"] as const) {
      expect(button(render({ mode }), "live")).toContain('aria-pressed="false"');
      expect(render({ mode })).not.toContain("data-timelapse-live");
    }
    expect(button(render(), "live")).toContain(v.live);
  });

  test("V5: the live mark leaves an invisible mark of the same text in its place, hidden from a screen reader, so a click moves nothing", () => {
    expect(render({ mode: "live" })).not.toContain("data-timelapse-hold");
    for (const mode of ["paused", "playing"] as const) {
      const html = render({ mode });
      expect(html).toMatch(/<span data-timelapse-hold="" aria-hidden="true" class="invisible[^"]*">/);
      expect(html).not.toContain("data-timelapse-live");
    }
    // Never two live marks at once.
    for (const mode of ["live", "paused", "playing"] as const) {
      const html = render({ mode });
      expect((html.match(/data-timelapse-live=""|data-timelapse-hold=""/g) ?? []).length).toBe(1);
    }
  });

  test("ready: the help text, no status line, the play button and the slider are enabled", () => {
    const html = render();
    expect(html).toContain(v.help);
    expect(html).not.toContain("data-timelapse-status");
    expect(button(html, "toggle")).not.toMatch(DISABLED);
    expect(tag(html, "data-timelapse-slider")).not.toMatch(DISABLED);
  });

  test("a series that ends at 0 cannot be played even when it is ready", () => {
    const html = render({ hours: [], end: 0, t: 0, clock: "" });
    expect(button(html, "toggle")).toMatch(DISABLED);
    expect(tag(html, "data-timelapse-slider")).toMatch(DISABLED);
    expect(html).not.toContain("data-timelapse-tick");
  });

  test("loading: a status line, both controls disabled, no help text", () => {
    const html = render({ status: "loading", hours: [], end: 0, t: 0, clock: "" });
    expect(html).toMatch(/<p role="status" data-timelapse-status="loading">/);
    expect(html).toContain(v.loading);
    expect(html).not.toContain(v.help);
    expect(button(html, "toggle")).toMatch(DISABLED);
    expect(tag(html, "data-timelapse-slider")).toMatch(DISABLED);
  });

  test("error: the text and a retry button, controls disabled", () => {
    const html = render({ status: "error", hours: [], end: 0, t: 0, clock: "" });
    expect(html).toContain(v.error);
    expect(button(html, "retry")).toContain(v.retry);
    expect(button(html, "toggle")).toMatch(DISABLED);
    expect(tag(html, "data-timelapse-slider")).toMatch(DISABLED);
  });

  test("empty: the text, controls disabled, no retry", () => {
    const html = render({ status: "empty", hours: [], end: 0, t: 0, clock: "" });
    expect(html).toContain(v.empty);
    expect(html).not.toContain('data-timelapse-action="retry"');
    expect(button(html, "toggle")).toMatch(DISABLED);
  });

  test("none: only the text, no slider, no play button, no clock", () => {
    const html = render({ status: "none", days: [], dateKey: null, hours: [], end: 0, t: 0, clock: "" });
    expect(html).toContain(v.none);
    expect(html).not.toContain("data-timelapse-slider");
    expect(html).not.toContain('data-timelapse-action="toggle"');
    expect(html).not.toContain('data-timelapse-action="live"');
    expect(html).not.toContain("data-timelapse-clock");
    expect(html).toContain('data-timelapse-announce=""');
  });

  test("the live region is always there and carries the announcement", () => {
    expect(render()).toMatch(/<p class="sr-only" aria-live="polite" data-timelapse-announce=""><\/p>/);
    const text = "11:00. Vodi TEST štand 1, 3 skena.";
    expect(render({ announcement: text })).toMatch(/aria-live="polite" data-timelapse-announce="">11:00\. Vodi TEST štand 1, 3 skena\.<\/p>/);
  });

  test("the text of the block comes from the dictionary", () => {
    const html = render();
    for (const text of [v.title, v.days, v.play, v.live, v.slider, v.help]) expect(html).toContain(text);
  });
});
