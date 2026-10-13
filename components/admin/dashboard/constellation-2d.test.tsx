import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { FLAT_VIEW, ORBIT_RADIUS, STAR_RADIUS, flatPoint } from "@/lib/admin-v2/constellation/geometry";
import type { ConstellationLayout, Star } from "@/lib/admin-v2/constellation/types";
import { Constellation2D } from "./constellation-2d";

// The 2D fallback of the Constellation: a still, decorative SVG. The layout is
// written by hand here (the real one comes from layout.ts).

const moreMark = (count: number) => `+${count}`;

function star(overrides: Partial<Star> & Pick<Star, "id" | "orbit">): Star {
  return { kind: "item", angle: 0.5, size: "medium", tone: "danger", pulse: false, more: 0, ...overrides };
}

const EMPTY: ConstellationLayout = { stars: [], calm: [], calmTotal: 0, backlog: null };

function render(layout: ConstellationLayout, props: Partial<Parameters<typeof Constellation2D>[0]> = {}) {
  return renderToStaticMarkup(<Constellation2D layout={layout} moreMark={moreMark} {...props} />);
}

function group(html: string, id: string): string {
  const match = html.match(new RegExp(`<g data-star="${id}"[^>]*>.*?</g>`));
  if (!match) throw new Error(`no star group for ${id}`);
  return match[0];
}

function translateOf(markup: string): [number, number] {
  const match = markup.match(/transform="translate\(([-\d.e]+) ([-\d.e]+)\)"/);
  if (!match) throw new Error("no translate");
  return [Number(match[1]), Number(match[2])];
}

const FULL: ConstellationLayout = {
  stars: [
    star({ id: "u1", orbit: 1, tone: "danger", size: "large", angle: 0.4 }),
    star({ id: "d1", orbit: 2, tone: "warning", angle: 1.6 }),
    star({ id: "w1", orbit: 3, tone: "neutral", size: "small", angle: 3.1 }),
    star({ id: "more:3", kind: "more", orbit: 3, tone: "neutral", angle: 4.4, more: 5 }),
    star({ id: "c1", orbit: 4, tone: "success", angle: 5.2 }),
  ],
  calm: [
    { angle: 0.1, radius: 0.9 },
    { angle: 2.2, radius: 0.97 },
    { angle: 4.0, radius: 0.92 },
  ],
  calmTotal: 60,
  backlog: { hp: 5, hpMax: 10, share: 0.5 },
};

describe("Constellation2D", () => {
  test("is decoration: aria-hidden, not focusable, no tab stop anywhere", () => {
    const html = render(FULL, { onPick: () => {} });
    expect(html).toMatch(/^<svg [^>]*aria-hidden="true"/);
    expect(html).toContain('focusable="false"');
    expect(html).toContain("data-constellation-2d");
    expect(html).not.toMatch(/tabindex/i);
    expect(html).toContain('preserveAspectRatio="xMidYMid meet"');
    // The picture is exactly the flat view of the layout: the same box the 3D camera is fitted to.
    expect(html).toContain(`viewBox="${-FLAT_VIEW.halfWidth} ${-FLAT_VIEW.halfHeight} ${2 * FLAT_VIEW.halfWidth} ${2 * FLAT_VIEW.halfHeight}"`);
    expect(html).toContain('class="block h-full w-full"');
  });

  test("appends the className", () => {
    expect(render(EMPTY, { className: "min-h-40" })).toContain('class="block h-full w-full min-h-40"');
  });

  test("draws the four orbits as ellipses, the fourth one dashed", () => {
    const html = render(FULL);
    const rings = html.match(/<ellipse data-orbit-ring="\d"[^>]*>/g) ?? [];
    expect(rings).toHaveLength(4);
    rings.forEach((ring, index) => {
      const orbit = (index + 1) as 1 | 2 | 3 | 4;
      expect(ring).toContain(`rx="${ORBIT_RADIUS[orbit]}"`);
      expect(ring).toContain(`ry="${flatPoint(Math.PI / 2, ORBIT_RADIUS[orbit])[1]}"`);
      expect(ring).toContain('fill="none"');
      expect(ring).toContain('stroke="var(--admin-text-muted)"');
      if (orbit === 4) expect(ring).toContain('stroke-dasharray="0.012 0.018"');
      else expect(ring).not.toContain("stroke-dasharray");
    });
  });

  test("draws one group per star with its orbit, tone and kind", () => {
    const html = render(FULL);
    for (const s of FULL.stars) {
      const g = group(html, s.id);
      expect(g).toContain(`data-orbit="${s.orbit}"`);
      expect(g).toContain(`data-tone="${s.tone}"`);
      expect(g).toContain(`data-kind="${s.kind}"`);
    }
    expect(html.match(/<g data-star=/g)).toHaveLength(FULL.stars.length);
  });

  test("colours a star by its tone and sizes the disc by its size", () => {
    const html = render(FULL);
    expect(group(html, "u1")).toContain(`<circle r="${STAR_RADIUS.large}" fill="var(--admin-danger)"></circle>`);
    expect(group(html, "d1")).toContain('fill="var(--admin-warning)"');
    expect(group(html, "w1")).toContain(`<circle r="${STAR_RADIUS.small}" fill="var(--admin-text-muted)"></circle>`);
    expect(group(html, "c1")).toContain('fill="var(--admin-success)"');
  });

  test("gives every star an invisible touch target as its first circle", () => {
    const g = group(render(FULL), "d1");
    expect(g).toMatch(/^<g [^>]*style="cursor:pointer"[^>]*><circle r="0.085" fill="transparent"><\/circle>/);
  });

  test("a star of orbit 1 stands nearer the core than one of orbit 4 at the same angle", () => {
    const html = render({ ...EMPTY, stars: [star({ id: "in", orbit: 1, angle: 1 }), star({ id: "out", orbit: 4, angle: 1 })] });
    const [ix, iy] = translateOf(group(html, "in"));
    const [ox, oy] = translateOf(group(html, "out"));
    expect(Math.hypot(ix, iy)).toBeLessThan(Math.hypot(ox, oy));
    const [ex, ey] = flatPoint(1, ORBIT_RADIUS[1]);
    expect(ix).toBeCloseTo(ex, 4);
    expect(iy).toBeCloseTo(ey, 4);
  });

  test("a 'more' star shows its mark and a ring, not a disc", () => {
    const g = group(render(FULL), "more:3");
    expect(g).toContain(">+5</text>");
    expect(g).toContain('font-size="0.05"');
    expect(g).toContain('text-anchor="middle"');
    expect(g).toContain('fill="none"');
    // halo + ring only; the disc of an item star would be a third filled circle
    expect(g.match(/<circle /g)).toHaveLength(3);
    expect(g).not.toContain(`r="${STAR_RADIUS.medium}"`);
  });

  test("the mark of a 'more' star stands beside the ring, to the left at the right edge", () => {
    const right = render({ ...EMPTY, stars: [star({ id: "r", kind: "more", orbit: 4, angle: 0, more: 2 })] });
    expect(right).toMatch(/<text x="-0\.118"/);
    const left = render({ ...EMPTY, stars: [star({ id: "l", kind: "more", orbit: 4, angle: Math.PI, more: 2 })] });
    expect(left).toMatch(/<text x="0\.118"/);
  });

  test("the aimed star carries data-aimed and an extra ring; the others do not", () => {
    const html = render(FULL, { aimed: "d1" });
    const aimed = group(html, "d1");
    expect(aimed).toContain("data-aimed");
    expect(aimed).toContain(`r="${STAR_RADIUS.medium * 2.6}"`);
    expect(aimed).toContain('stroke="var(--admin-text)"');
    expect(html.match(/data-aimed/g)).toHaveLength(1);
    expect(group(render(FULL), "d1")).not.toContain("data-aimed");
  });

  test("draws no backlog ring when the counts are not known", () => {
    const html = render({ ...FULL, backlog: null });
    expect(html).not.toContain("data-backlog-ring");
    expect(html).not.toContain("data-backlog-arc");
  });

  test("draws the arc of the backlog by its share", () => {
    const html = render(FULL);
    const arc = html.match(/<ellipse data-backlog-arc=""[^>]*>/)?.[0] ?? "";
    expect(arc).toContain('pathLength="1"');
    expect(arc).toContain('stroke-dasharray="0.5 1"');
    expect(arc).toContain('stroke-linecap="round"');
    expect(arc).toContain('stroke-width="0.012"');
    expect(html).toContain('stroke-opacity="0.18"');
  });

  test("draws no arc when the share is 0, but keeps the pale ring", () => {
    const html = render({ ...FULL, backlog: { hp: 0, hpMax: 10, share: 0 } });
    expect(html).toContain("data-backlog-ring");
    expect(html).not.toContain("data-backlog-arc");
  });

  test("draws as many calm dots as the layout has", () => {
    expect(render(FULL).match(/data-calm-dot/g)).toHaveLength(3);
    expect(render(EMPTY)).not.toContain("data-calm-dot");
  });

  test("an empty layout still draws the orbits and the core", () => {
    const html = render(EMPTY);
    expect(html.match(/<ellipse /g)).toHaveLength(4);
    expect(html).toContain('fill="var(--admin-nav-line)"');
    expect(html).not.toContain("data-star");
  });

  test("is a still picture: no animation of any kind", () => {
    const html = render(FULL, { aimed: "u1" });
    expect(html).not.toContain("<animate");
    expect(html).not.toMatch(/animation/i);
  });
});
