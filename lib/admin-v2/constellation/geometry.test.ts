import { describe, expect, test } from "vitest";
import { FLAT_VIEW, ORBIT_RADIUS, TOUCH_REACH_PX, flatPoint, flatProject, flatScale, flatStars, nearestStar, tapStar } from "./geometry";

// The tap on the 2D picture: the nearest star within the reach of a 44 px target.

const A = { id: "a", x: 0, y: 0 };
const B = { id: "b", x: 0.1, y: 0 };

describe("flatScale", () => {
  test("the picture fits whole: the tighter side sets the scale", () => {
    expect(flatScale(318, 1000)).toBeCloseTo(318 / (2 * FLAT_VIEW.halfWidth), 6);
    expect(flatScale(1000, 100)).toBeCloseTo(100 / (2 * FLAT_VIEW.halfHeight), 6);
  });
});

describe("nearestStar", () => {
  test("of two stars the nearer one wins", () => {
    expect(nearestStar({ x: 0.04, y: 0 }, [A, B], 0.2)).toBe("a");
    expect(nearestStar({ x: 0.06, y: 0 }, [A, B], 0.2)).toBe("b");
    expect(nearestStar({ x: 0.06, y: 0 }, [B, A], 0.2)).toBe("b");
  });

  test("a tap beyond the reach of every star is nothing", () => {
    expect(nearestStar({ x: 0, y: 0.2001 }, [A, B], 0.2)).toBeNull();
    expect(nearestStar({ x: 0.3001, y: 0 }, [A, B], 0.2)).toBeNull();
    expect(nearestStar({ x: 0, y: 0 }, [], 0.2)).toBeNull();
  });

  test("a tap exactly at the reach still counts", () => {
    expect(nearestStar({ x: 0, y: 0.2 }, [A], 0.2)).toBe("a");
  });

  test("a tie is stable: the first star of the list wins, whatever the order of the rest", () => {
    const middle = { x: 0.05, y: 0 };
    expect(nearestStar(middle, [A, B], 0.2)).toBe("a");
    expect(nearestStar(middle, [B, A], 0.2)).toBe("b");
    expect(nearestStar(middle, [A, B, { id: "c", x: 0.05, y: 0.05 }], 0.2)).toBe("a");
  });

  test("a „+N“ star counts like any other", () => {
    const stars = flatStars([
      { id: "item", orbit: 3, angle: 1 },
      { id: "more:3", orbit: 3, angle: 1.12 },
    ]);
    const [x, y] = flatPoint(1.12, ORBIT_RADIUS[3]);
    expect(nearestStar({ x, y }, stars, 0.05)).toBe("more:3");
  });
});

describe("flatStars", () => {
  test("puts a star where the flat picture draws it", () => {
    const [star] = flatStars([{ id: "s", orbit: 2, angle: 2.2 }]);
    const [x, y] = flatPoint(2.2, ORBIT_RADIUS[2]);
    expect(star).toEqual({ id: "s", x, y });
  });
});

describe("tapStar", () => {
  // A phone: the picture is 342 px wide and as tall as it needs to be.
  const width = 342;
  const height = (width * FLAT_VIEW.halfHeight) / FLAT_VIEW.halfWidth;
  const box = { left: 24, top: 300, width, height };
  const at = (angle: number, orbit: 1 | 2 | 3 | 4) => {
    const point = flatProject(angle, ORBIT_RADIUS[orbit], width, height);
    return { x: box.left + point.x, y: box.top + point.y };
  };
  // Two urgent stars about 30 px apart: the old hit circles (26-29 px wide) overlapped here.
  const stars = flatStars([
    { id: "left", orbit: 1, angle: 0.55 },
    { id: "right", orbit: 1, angle: 0.2 },
  ]);

  test("the reach is a 44 px target", () => {
    expect(TOUCH_REACH_PX * 2).toBe(44);
    const star = at(0.55, 1);
    expect(tapStar(star.x + 21, star.y, box, stars)).not.toBeNull();
    const far = at(1.4, 3);
    expect(tapStar(far.x, far.y, box, stars)).toBeNull();
  });

  test("a tap between two stars goes to the nearer one", () => {
    const l = at(0.55, 1);
    const r = at(0.2, 1);
    expect(Math.hypot(r.x - l.x, r.y - l.y)).toBeLessThan(44);
    expect(tapStar(l.x + (r.x - l.x) * 0.4, l.y + (r.y - l.y) * 0.4, box, stars)).toBe("left");
    expect(tapStar(l.x + (r.x - l.x) * 0.6, l.y + (r.y - l.y) * 0.6, box, stars)).toBe("right");
  });

  test("a tap farther than the reach from every star is nothing, 1 px either side of it", () => {
    const l = at(0.55, 1);
    // To the left of the left star, away from the right one.
    expect(tapStar(l.x - (TOUCH_REACH_PX - 1), l.y, box, stars)).toBe("left");
    expect(tapStar(l.x - (TOUCH_REACH_PX + 1), l.y, box, stars)).toBeNull();
  });

  test("the reach is in px, not in picture units: a larger picture reaches no farther", () => {
    const wide = { left: 0, top: 0, width: 1000, height: 500 };
    const [star] = flatStars([{ id: "only", orbit: 2, angle: 0 }]);
    const centre = flatProject(0, ORBIT_RADIUS[2], wide.width, wide.height);
    expect(tapStar(centre.x + TOUCH_REACH_PX - 1, centre.y, wide, [star])).toBe("only");
    expect(tapStar(centre.x + TOUCH_REACH_PX + 1, centre.y, wide, [star])).toBeNull();
  });

  test("an empty box is nothing", () => {
    expect(tapStar(10, 10, { left: 0, top: 0, width: 0, height: 0 }, stars)).toBeNull();
  });
});
