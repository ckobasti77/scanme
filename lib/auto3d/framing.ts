// Kadriranje 3D Rendgen pregledača (A01 §3.7 „contain parity“, A03 §3). Čista matematika na
// nizovima, bez three-a: poster i canvas dele isti kadar, a deo i grupa se kadriraju u slobodnu zonu.
//
// Konvencije: glTF ose (+Y gore, +Z napred, +X levo); az u stepenima (0 spreda, 90 sleva), el u stepenima.

import type { SystemId } from "./catalog";
import type { Vec3, Viewport } from "./manifest";

export type Rect = { x: number; y: number; w: number; h: number };
export type Box = { min: Vec3; max: Vec3 };
export type Pose = { position: Vec3; target: Vec3 };
/** Gde je slika postera u studiju (CSS px, apsolutno u odnosu na studio). */
export type ContainFrame = { imageW: number; imageH: number; offsetX: number; offsetY: number };

/** Odnos stranica postera i kamere iz manifesta po viewport-u. */
export const POSTER_ASPECT: Readonly<Record<Viewport, number>> = { desktop: 16 / 9, telefon: 4 / 5, kiosk: 16 / 9 };

/** Ugao kadra po sistemu (grupa i tura). */
export const SYSTEM_VIEWS: Readonly<Record<SystemId, { az: number; el: number }>> = {
  karoserija: { az: 32, el: 12 },
  enterijer: { az: 20, el: 38 },
  motor: { az: 40, el: 28 },
  usis_izduv: { az: -60, el: 20 },
  hladjenje: { az: 18, el: 14 },
  prenos: { az: 70, el: -14 },
  vesanje: { az: 55, el: 8 },
  kocnice: { az: 82, el: 6 },
  energija: { az: 150, el: 26 },
  elektrika: { az: 25, el: 20 },
};

const DEG = Math.PI / 180;

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: Vec3): Vec3 => scale(a, 1 / (len(a) || 1));

/** `object-fit: contain` slike odnosa `aspect` u kutiji `box` (sidro ax, ay). */
export function containFrame(aspect: number, box: Rect, ax = 0.5, ay = 0.5): ContainFrame {
  const boxAspect = box.w / Math.max(box.h, 1);
  const imageW = boxAspect >= aspect ? box.h * aspect : box.w;
  const imageH = boxAspect >= aspect ? box.h : box.w / aspect;
  return { imageW, imageH, offsetX: box.x + (box.w - imageW) * ax, offsetY: box.y + (box.h - imageH) * ay };
}

/**
 * Argumenti za `camera.setViewOffset(fullW, fullH, x, y, w, h)`: kamera sa odnosom postera crta
 * poster preko celog canvasa (canvas je kadar postera produžen u margine). Pozitivan pomak
 * pomera sliku levo i gore.
 */
export function viewOffsetArgs(
  frame: ContainFrame,
  width: number,
  height: number,
  shiftX = 0,
  shiftY = 0,
): [number, number, number, number, number, number] {
  return [frame.imageW, frame.imageH, -frame.offsetX + shiftX, -frame.offsetY + shiftY, width, height];
}

/** Pomak koji metu kamere (centar postera) dovodi u tačku (x, y) studija. */
export function shiftToPlace(frame: ContainFrame, x: number, y: number): [number, number] {
  return [frame.offsetX + frame.imageW / 2 - x, frame.offsetY + frame.imageH / 2 - y];
}

/** Piksela studija po jedinici tangensa ugla (isto vodoravno i uspravno). */
export function pxPerTan(frame: ContainFrame, fovDeg: number): number {
  return frame.imageH / (2 * Math.tan((fovDeg * DEG) / 2));
}

/** Jedinični smer od mete ka kameri za az/el u stepenima. */
export function dirFromAzEl(azDeg: number, elDeg: number): Vec3 {
  const az = azDeg * DEG;
  const el = elDeg * DEG;
  return [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];
}

export function boxCenter(b: Box): Vec3 {
  return scale(add(b.min, b.max), 0.5);
}

export function unionBoxes(boxes: readonly Box[]): Box {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const b of boxes) {
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], b.min[i]);
      max[i] = Math.max(max[i], b.max[i]);
    }
  }
  return { min, max };
}

/**
 * Najmanja daljina od centra kutije duž `dir` na kojoj svih 8 temena staje u slobodnu zonu
 * (meta se pomakom view offset-a crta u centru zone, pa su granice u prostoru tangensa tačne).
 */
export function fitBoxDistance(box: Box, dir: Vec3, area: Rect, frame: ContainFrame, fovDeg: number, margin: number): number {
  const ppt = pxPerTan(frame, fovDeg);
  const tanH = Math.max(area.w / 2, 1) / ppt;
  const tanV = Math.max(area.h / 2, 1) / ppt;
  const back = norm(dir); // od mete ka kameri
  const ref: Vec3 = Math.abs(back[1]) > 0.985 ? [0, 0, 1] : [0, 1, 0];
  const right = norm(cross(ref, back));
  const up = cross(back, right);
  const c = boxCenter(box);
  let d = 0;
  for (let i = 0; i < 8; i++) {
    const p: Vec3 = [i & 1 ? box.max[0] : box.min[0], i & 2 ? box.max[1] : box.min[1], i & 4 ? box.max[2] : box.min[2]];
    const v = sub(p, c);
    const toward = dot(v, back);
    d = Math.max(d, toward + Math.abs(dot(v, right)) / tanH, toward + Math.abs(dot(v, up)) / tanV);
  }
  return d * margin;
}

/** Najmanja daljina kamere od izabranog dela: deo ostaje u kontekstu auta. */
export const PART_MIN_DISTANCE = 1.2;

/**
 * Kadar dela: ugao iz `focus`, a daljina je najveća od focus.dist, PART_MIN_DISTANCE i one pri kojoj
 * deo zauzima najviše oko 40 % slobodne zone (rezerva 2,4).
 */
export function partPose(
  box: Box,
  focus: { dist: number; az: number; el: number },
  area: Rect,
  frame: ContainFrame,
  fovDeg: number,
): Pose {
  const dir = dirFromAzEl(focus.az, focus.el);
  const target = boxCenter(box);
  const dist = Math.max(focus.dist, PART_MIN_DISTANCE, fitBoxDistance(box, dir, area, frame, fovDeg, 2.4));
  return { target, position: add(target, scale(dir, dist)) };
}

/** Kadar grupe: unija kutija sistema, ugao iz SYSTEM_VIEWS, rezerva 15 %. */
export function systemPose(
  boxes: readonly Box[],
  view: { az: number; el: number },
  area: Rect,
  frame: ContainFrame,
  fovDeg: number,
): Pose {
  const box = unionBoxes(boxes);
  const dir = dirFromAzEl(view.az, view.el);
  const target = boxCenter(box);
  const dist = fitBoxDistance(box, dir, area, frame, fovDeg, 1.15);
  return { target, position: add(target, scale(dir, dist)) };
}

function spherical(offset: Vec3): { r: number; theta: number; phi: number } {
  const r = len(offset) || 1e-6;
  return { r, theta: Math.atan2(offset[0], offset[2]), phi: Math.acos(Math.min(1, Math.max(-1, offset[1] / r))) };
}

function shortestAngle(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * Let između dve poze: meta linearno, kamera po sferi oko mete (az najkraćim putem, polarni ugao
 * linearno, poluprečnik u log prostoru, pa zum deluje ravnomerno).
 */
export function blendPose(a: Pose, b: Pose, t: number): Pose {
  const target: Vec3 = [
    a.target[0] + (b.target[0] - a.target[0]) * t,
    a.target[1] + (b.target[1] - a.target[1]) * t,
    a.target[2] + (b.target[2] - a.target[2]) * t,
  ];
  const sa = spherical(sub(a.position, a.target));
  const sb = spherical(sub(b.position, b.target));
  const r = Math.exp(Math.log(sa.r) + (Math.log(sb.r) - Math.log(sa.r)) * t);
  const phi = sa.phi + (sb.phi - sa.phi) * t;
  const theta = sa.theta + shortestAngle(sa.theta, sb.theta) * t;
  const offset: Vec3 = [r * Math.sin(phi) * Math.sin(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.cos(theta)];
  return { target, position: add(target, offset) };
}

/** Poza okrenuta oko uspravne ose kroz metu za `deg` stepeni (pozitivno = kao az: spreda ka levoj strani). */
export function orbitPose(p: Pose, deg: number): Pose {
  if (!deg) return p;
  const a = deg * DEG;
  const dx = p.position[0] - p.target[0];
  const dz = p.position[2] - p.target[2];
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { target: p.target, position: [p.target[0] + dx * c + dz * s, p.position[1], p.target[2] - dx * s + dz * c] };
}

/** Trajanje leta kamere u sekundama (A03 §3.3): duži ugao i veći zum traju duže, 0,7–1,4 s. */
export function flightDuration(a: Pose, b: Pose): number {
  const da = sub(a.position, a.target);
  const db = sub(b.position, b.target);
  const angle = Math.acos(Math.min(1, Math.max(-1, dot(norm(da), norm(db)))));
  const zoom = Math.abs(Math.log((len(db) || 1e-6) / (len(da) || 1e-6)));
  const pan = len(sub(b.target, a.target));
  return Math.min(1.4, Math.max(0.7, 0.55 + 0.35 * angle + 0.25 * zoom + 0.1 * pan));
}
