import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { ADMIN_SPARK } from "@/lib/admin-v2/motion";

vi.mock("convex/react", () => ({ useQuery: () => undefined, useMutation: () => () => undefined, useConvex: () => ({}) }));

import { CauseChain, SPARK } from "./cause-chain";
import { GameProvider } from "./game-provider";

// ADMIN v3 V5 — the comet of gained XP. Its geometry and timing are tested in
// lib/admin-v2/game/spark.test.ts; the frames of the flight are looked at in
// output/playwright/admin-v3/V5. Here: the layer in the markup and the rules the
// drawing keeps (tokens for every duration, transform and opacity only, no input).

describe("the layer", () => {
  test("it is decoration: no pointer events, hidden from a screen reader, empty until XP is gained", () => {
    const markup = renderToStaticMarkup(<GameProvider mode="off"><CauseChain /></GameProvider>);
    expect(markup).toBe('<div data-admin-spark-layer="" aria-hidden="true" class="pointer-events-none fixed inset-0 z-[71] overflow-hidden"></div>');
  });

  test("the timing is the token of motion.ts", () => {
    expect(SPARK).toBe(ADMIN_SPARK);
  });
});

describe("how the comet is drawn", () => {
  const source = readFileSync(join(process.cwd(), "components/admin/game/cause-chain.tsx"), "utf8");

  test("every duration is a token", () => {
    expect(source).not.toMatch(/duration: \d/);
    for (const token of ["sparkSeconds(", "time.toBoss", "ADMIN_SPARK.fade", "ADMIN_SPARK.strike", "ADMIN_SPARK.ring", "ADMIN_SPARK.label", "ADMIN_SPARK.head", "time.toChip"]) expect(source, token).toContain(token);
  });

  test("it moves with transform and opacity only: positions are set once, in the style of a part that then only scales and fades", () => {
    // The tweens of GSAP never name a layout property.
    const tweened = source.split("\n").filter((line) => /\bflight\.(to|fromTo|set)\(|gsap\.set\(/.test(line));
    expect(tweened.length).toBeGreaterThan(8);
    for (const line of tweened) expect(line, line).not.toMatch(/\b(left|top|width|height|margin|padding)\s*:/);
  });

  test("the marks are hidden until their own tween starts, and a bar scrolled out of the frame is not struck", () => {
    // The strike ring, the flash, the ring around the chip and the pill start from opacity 0 in their style, so a tween that starts later must not draw its first frame at creation.
    expect(source.match(/immediateRender: false/g)).toHaveLength(4);
    expect(source).toContain('main[data-admin-frame="screen"]');
    expect(source).toContain("inView(barRect, screen)");
  });

  test("it takes no input and is gone with the layer", () => {
    expect(source).not.toMatch(/addEventListener|tabindex|\.focus\(|preventDefault/);
    expect(source).toContain("flight.kill()");
    expect(source).toContain("replaceChildren()");
  });

  test("the pill is beside the chip inside the navbar, placed by the pure helper, on a backing", () => {
    expect(source).toContain("labelPlace(");
    expect(source).toContain('[data-admin-frame="navbar"]');
    expect(source).toContain("background:var(--admin-surface-strong)");
    expect(source).toContain("border:1px solid var(--admin-border)");
    // No longer hung under the chip, on the edge of the navbar.
    expect(source).not.toContain("chip.bottom");
  });

  test("the strike jolts the bar only when its own hit is not shaking it, and the quiet mode and reduced motion do not fly", () => {
    expect(source).toContain("gsap.isTweening(bar)");
    expect(source).toContain("quietModeStore.get() || prefersReducedMotion()");
    expect(source).toContain('document.visibilityState !== "visible"');
  });
});
