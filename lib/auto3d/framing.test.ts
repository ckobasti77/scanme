import { describe, expect, test } from "vitest";
import { SYSTEMS } from "./catalog";
import {
  PART_MIN_DISTANCE,
  SYSTEM_VIEWS,
  blendPose,
  boxCenter,
  containFrame,
  dirFromAzEl,
  fitBoxDistance,
  flightDuration,
  orbitPose,
  partPose,
  pxPerTan,
  shiftToPlace,
  systemPose,
  viewOffsetArgs,
  type Box,
  type ContainFrame,
  type Pose,
  type Rect,
} from "./framing";
import type { Vec3 } from "./manifest";

const close3 = (a: Vec3, b: Vec3, digits = 6) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], digits));

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: Vec3): Vec3 => {
  const l = Math.hypot(...a);
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** Projekcija tačke u px studija za kameru čija se meta crta u centru zone `area`. */
function project(p: Vec3, pose: Pose, frame: ContainFrame, fov: number, area: Rect): [number, number] {
  const back = unit(sub(pose.position, pose.target));
  const right = unit(cross([0, 1, 0], back));
  const up = cross(back, right);
  const v = sub(p, pose.position);
  const z = -dot(v, back);
  const ppt = pxPerTan(frame, fov);
  return [area.x + area.w / 2 + (dot(v, right) / z) * ppt, area.y + area.h / 2 - (dot(v, up) / z) * ppt];
}

describe("contain parity", () => {
  test("širi kontejner: slika pune visine, centrirana vodoravno", () => {
    const f = containFrame(16 / 9, { x: 280, y: 0, w: 1096, h: 748 });
    expect(f.imageW).toBeCloseTo(1096);
    expect(f.imageH).toBeCloseTo(616.5);
    expect(f.offsetX).toBe(280);
    expect(f.offsetY).toBeCloseTo(65.75);
  });

  test("telefon 4:5 u 390 × 473", () => {
    const f = containFrame(4 / 5, { x: 0, y: 0, w: 390, h: 473 });
    expect(f.imageH).toBe(473);
    expect(f.imageW).toBeCloseTo(378.4);
    expect(f.offsetX).toBeCloseTo(5.8);
  });

  test("kvadratni poster u uskom kontejneru", () => {
    expect(containFrame(1, { x: 0, y: 0, w: 300, h: 600 })).toEqual({ imageW: 300, imageH: 300, offsetX: 0, offsetY: 150 });
  });

  test("view offset: kadar postera u canvasu, pomak pomera prozor", () => {
    const f = containFrame(16 / 9, { x: 0, y: 0, w: 1376, h: 748 });
    const args = viewOffsetArgs(f, 1376, 748);
    [f.imageW, f.imageH, -f.offsetX, -f.offsetY, 1376, 748].forEach((v, i) => expect(args[i]).toBeCloseTo(v, 9));
    expect(viewOffsetArgs(f, 1376, 748, 10, -4)[2]).toBeCloseTo(-f.offsetX + 10);
  });

  test("shiftToPlace: 0 za centar postera", () => {
    const f = containFrame(16 / 9, { x: 280, y: 0, w: 1096, h: 748 });
    expect(shiftToPlace(f, 280 + 548, 374)).toEqual([0, 0]);
    expect(shiftToPlace(f, 620, 374)[0]).toBeCloseTo(208);
  });
});

describe("uglovi i kadrovi", () => {
  test("dirFromAzEl: 0 spreda (+Z), 90 sleva (+X), el 90 gore", () => {
    close3(dirFromAzEl(0, 0), [0, 0, 1]);
    close3(dirFromAzEl(90, 0), [1, 0, 0]);
    close3(dirFromAzEl(0, 90), [0, 1, 0]);
  });

  test("SYSTEM_VIEWS ima svih 10 sistema", () => {
    expect(Object.keys(SYSTEM_VIEWS).sort()).toEqual(SYSTEMS.map((s) => s.id).sort());
  });

  const area: Rect = { x: 280, y: 16, w: 680, h: 700 };
  const frame = containFrame(16 / 9, { x: 280, y: 0, w: 1096, h: 748 });
  const box: Box = { min: [0.3, 0.4, 0.9], max: [0.7, 0.75, 1.3] };

  test("fitBoxDistance: sva temena staju u slobodnu zonu", () => {
    for (const [az, el] of [
      [35, 18],
      [-60, 20],
      [150, 26],
      [70, -14],
    ] as const) {
      const dir = dirFromAzEl(az, el);
      const d = fitBoxDistance(box, dir, area, frame, 28, 1.0);
      const c = boxCenter(box);
      const pose: Pose = { target: c, position: [c[0] + dir[0] * d, c[1] + dir[1] * d, c[2] + dir[2] * d] };
      for (let i = 0; i < 8; i++) {
        const p: Vec3 = [i & 1 ? box.max[0] : box.min[0], i & 2 ? box.max[1] : box.min[1], i & 4 ? box.max[2] : box.min[2]];
        const [x, y] = project(p, pose, frame, 28, area);
        expect(x).toBeGreaterThanOrEqual(area.x - 0.5);
        expect(x).toBeLessThanOrEqual(area.x + area.w + 0.5);
        expect(y).toBeGreaterThanOrEqual(area.y - 0.5);
        expect(y).toBeLessThanOrEqual(area.y + area.h + 0.5);
      }
    }
  });

  test("manja zona traži veću daljinu", () => {
    const dir = dirFromAzEl(35, 18);
    const small = fitBoxDistance(box, dir, { ...area, w: 300, h: 300 }, frame, 28, 1);
    expect(small).toBeGreaterThan(fitBoxDistance(box, dir, area, frame, 28, 1));
  });

  test("partPose poštuje focus.dist kad je veći od potrebnog", () => {
    const pose = partPose(box, { dist: 4, az: 35, el: 18 }, area, frame, 28);
    expect(Math.hypot(...sub(pose.position, pose.target))).toBeCloseTo(4, 6);
    close3(pose.target, boxCenter(box));
    const tight = partPose(box, { dist: 0.1, az: 35, el: 18 }, area, frame, 28);
    expect(Math.hypot(...sub(tight.position, tight.target))).toBeGreaterThan(0.1);
  });

  test("partPose ne prilazi bliže od PART_MIN_DISTANCE (deo ostaje u kontekstu)", () => {
    const tiny: Box = { min: [0, 0.5, 1], max: [0.02, 0.52, 1.02] };
    const pose = partPose(tiny, { dist: 0.3, az: 35, el: 18 }, area, frame, 28);
    expect(Math.hypot(...sub(pose.position, pose.target))).toBeCloseTo(PART_MIN_DISTANCE, 6);
  });

  test("systemPose gleda centar unije kutija", () => {
    const pose = systemPose([box, { min: [-0.7, 0.4, 0.9], max: [-0.3, 0.75, 1.3] }], SYSTEM_VIEWS.motor, area, frame, 28);
    close3(pose.target, [0, 0.575, 1.1]);
  });
});

describe("let kamere", () => {
  const a: Pose = { position: [5, 1.6, 7], target: [0, 0.6, 0] };
  const b: Pose = { position: [-1, 1, 2], target: [0.5, 0.5, 1.4] };

  test("krajevi leta su tačno početna i ciljna poza", () => {
    const s = blendPose(a, b, 0);
    close3(s.position, a.position);
    close3(s.target, a.target);
    const e = blendPose(a, b, 1);
    close3(e.position, b.position);
    close3(e.target, b.target);
  });

  test("azimut ide najkraćim putem", () => {
    const p: Pose = { position: [Math.sin(3) * 5, 1, Math.cos(3) * 5], target: [0, 0, 0] };
    const q: Pose = { position: [Math.sin(-3) * 5, 1, Math.cos(-3) * 5], target: [0, 0, 0] };
    expect(blendPose(p, q, 0.5).position[2]).toBeLessThan(-4.5); // prolazi iza auta, ne kroz prednji kraj
  });

  test("trajanje je između 0,7 i 1,4 s", () => {
    expect(flightDuration(a, a)).toBeCloseTo(0.7);
    expect(flightDuration(a, b)).toBeGreaterThan(0.7);
    expect(flightDuration(a, { position: [-5, 1.6, -7], target: [0, 0.6, 0] })).toBeLessThanOrEqual(1.4);
  });

  test("A10: orbitPose okreće kameru oko mete po uspravnoj osi (kiosk)", () => {
    const p: Pose = { target: [0, 0.6, 0], position: [0, 2, 8] };
    expect(orbitPose(p, 0)).toBe(p);
    const q = orbitPose(p, 90);
    expect(q.target).toEqual(p.target);
    expect(q.position[0]).toBeCloseTo(8, 9);
    expect(q.position[1]).toBe(2);
    expect(q.position[2]).toBeCloseTo(0, 9);
    // Smer je isti kao az: dirFromAzEl(90, 0) gleda sleva (+X).
    expect(Math.sign(q.position[0])).toBe(Math.sign(dirFromAzEl(90, 0)[0]));
    const full = orbitPose(p, 360);
    full.position.forEach((v, i) => expect(v).toBeCloseTo(p.position[i], 9));
  });
});
