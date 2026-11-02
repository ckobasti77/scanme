import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { BACKLOG_TOKEN, CORE_TOKEN, ORBIT_LINE_TOKEN, STAR_TOKENS, SURFACE_TOKEN, orbitTone, starTone, type TokenColor } from "./colors";
import type { ConstellationPriority, OrbitIndex, StarTone } from "./types";

// ADMIN v3 V2 — the colours of the Constellation are the admin's own tokens.
// The stylesheet is read from disk (like reveal/css-contract.test.ts): the
// values repeated in colors.ts must be the ones in app/globals.css.

const css = readFileSync(path.join(process.cwd(), "app", "globals.css"), "utf8");

/** The body of the first rule whose selector line is exactly `selector`. */
function block(selector: string): string {
  const start = css.indexOf(`\n${selector} {\n`);
  expect(start, selector).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf("\n}", start));
}

const light = block(".admin-v1");
const dark = block('html[data-theme="dark"] .admin-v1');
const valueIn = (body: string, token: string) => new RegExp(`\\n\\s*${token}:\\s*([^;]+);`).exec(body)?.[1].trim().toLowerCase();

describe("the tone of a star", () => {
  test("every priority has the expected tone", () => {
    const expected: Record<ConstellationPriority, StarTone> = {
      blocking_or_overdue: "danger",
      due_today: "warning",
      needs_reply: "neutral",
      grace_or_warning: "neutral",
      waiting_scanme: "neutral",
      waiting_client: "neutral",
      other: "success",
    };
    for (const [priority, tone] of Object.entries(expected)) {
      expect(starTone(priority as ConstellationPriority), priority).toBe(tone);
    }
  });

  test("the tone of an orbit", () => {
    const expected: Record<OrbitIndex, StarTone> = { 1: "danger", 2: "warning", 3: "neutral", 4: "success" };
    for (const orbit of [1, 2, 3, 4] as const) expect(orbitTone(orbit), String(orbit)).toBe(expected[orbit]);
  });
});

describe("the colours stand in app/globals.css", () => {
  const tokens: Array<[string, TokenColor]> = [
    ...(Object.entries(STAR_TOKENS) as Array<[string, TokenColor]>),
    ["core", CORE_TOKEN],
    ["backlog", BACKLOG_TOKEN],
    ["orbit line", ORBIT_LINE_TOKEN],
    ["surface", SURFACE_TOKEN],
  ];

  test("the light value of every token is the one of the light theme", () => {
    for (const [name, color] of tokens) expect(valueIn(light, color.token), name).toBe(color.light.toLowerCase());
  });

  test("the dark value is the one of the dark theme, or the light one where the dark theme does not redefine the token", () => {
    for (const [name, color] of tokens) {
      expect(valueIn(dark, color.token) ?? valueIn(light, color.token), name).toBe(color.dark.toLowerCase());
    }
  });

  test("the core token is defined once, in the light theme only", () => {
    expect(valueIn(light, "--admin-nav-line")).toBe("#6fc05d");
    expect(valueIn(dark, "--admin-nav-line")).toBeUndefined();
  });

  test("the backlog and the orbit lines reuse the signal tokens", () => {
    expect(BACKLOG_TOKEN).toBe(STAR_TOKENS.danger);
    expect(ORBIT_LINE_TOKEN).toBe(STAR_TOKENS.neutral);
  });
});
