import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { ADMIN_CEREMONY, ADMIN_DURATION, ADMIN_LAYER_MAX, ADMIN_REVEAL, ADMIN_SHIMMER } from "@/lib/admin-v2/motion";

// ADMIN v3 V1 — the contract between the motion tokens and the stylesheet
// (the source is read from disk, like lib/admin-v2/frame/titles.test.ts):
// the CSS custom properties hold the same numbers as motion.ts, and no CSS
// rule hides what the reveal engine animates. The hidden start state is set by
// JavaScript only, so without it (and with reduced motion) all content is
// visible.

const css = readFileSync(path.join(process.cwd(), "app", "globals.css"), "utf8");
const ms = (seconds: number) => `${Math.round(seconds * 1000)}ms`;
const token = (name: string) => new RegExp(`${name}:\\s*([^;]+);`).exec(css)?.[1].trim();

describe("the motion tokens in CSS", () => {
  test("the interaction layer keeps the v2 values", () => {
    expect(token("--admin-dur-1")).toBe(ms(ADMIN_DURATION.feedback));
    expect(token("--admin-dur-2")).toBe(ms(ADMIN_DURATION.state));
    expect(token("--admin-dur-3")).toBe(ms(ADMIN_DURATION.move));
    expect(token("--admin-dur-4")).toBe(ms(ADMIN_DURATION.frame));
  });

  test("the reveal and the ceremony layers are the same numbers as motion.ts", () => {
    expect(token("--admin-reveal-exit")).toBe(ms(ADMIN_REVEAL.exit));
    expect(token("--admin-reveal-budget")).toBe(ms(ADMIN_REVEAL.budget));
    expect(token("--admin-ceremony-max")).toBe(ms(ADMIN_LAYER_MAX.ceremonija));
    expect(token("--admin-shimmer")).toBe(ms(ADMIN_SHIMMER));
    const big = ADMIN_CEREMONY.big.in + ADMIN_CEREMONY.big.hold + ADMIN_CEREMONY.big.out;
    expect(big).toBeLessThanOrEqual(ADMIN_LAYER_MAX.ceremonija);
  });
});

describe("content does not depend on the animation", () => {
  // Every selector of the stylesheet (the text before a `{`), without comments.
  const selectors = css.replace(/\/\*[\s\S]*?\*\//g, "").split("{").map((chunk) => chunk.slice(chunk.lastIndexOf("}") + 1).trim());

  test("no CSS rule targets what the engine reveals: nothing can be hidden without JavaScript", () => {
    const marks = ["data-admin-reveal", "data-admin-draw", "data-admin-bar", "data-admin-cell", "data-admin-count", "data-admin-title-line", "data-admin-ring-mask", "data-admin-page"];
    for (const selector of selectors) {
      // The whole attribute name (`data-admin-drawer` is not `data-admin-draw`).
      for (const mark of marks) expect(new RegExp(`${mark}(?![a-z-])`).test(selector), `${selector} → ${mark}`).toBe(false);
    }
  });

  test("the decoration layers take no pointer events, so the page is clickable from the first frame", () => {
    for (const layer of [".admin-scan", ".admin-glow", ".admin-pulse", ".admin-edge"]) {
      const body = new RegExp(`\\.admin-v1 \\${layer} \\{([^}]*)\\}`).exec(css)?.[1] ?? "";
      expect(body, layer).toContain("pointer-events: none");
    }
  });

  test("the loops stand still in the quiet mode, and reduced motion ends every admin animation at once", () => {
    expect(css).toMatch(/\.admin-v1\[data-admin-quiet\] \.admin-shimmer::after \{\s*animation: none;/);
    const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce) {\n  .admin-v1 *,"));
    expect(reduced).toContain("animation-duration: 0.01ms !important");
    expect(reduced).toContain("animation-iteration-count: 1 !important");
    // The only endless CSS animation of the admin is the shimmer of a skeleton.
    const endless = [...css.matchAll(/animation:[^;]*infinite[^;]*;/g)].map((match) => match[0]).filter((rule) => rule.includes("admin-"));
    expect(endless).toEqual(["animation: admin-shimmer var(--admin-shimmer) linear infinite;"]);
  });

  test("the live edge follows --admin-energy with opacity only", () => {
    expect(css).toMatch(/\.admin-v1 \.admin-edge-ring \{[^}]*opacity: calc\(var\(--admin-energy, 0\) \* 0\.55\);/);
    expect(css).toMatch(/html\[data-theme="dark"\] \.admin-v1 \.admin-edge-glow \{\s*opacity: calc\(var\(--admin-energy, 0\) \* 0\.18\);/);
  });
});
