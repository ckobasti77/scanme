// ADMIN v3 V5 — the comet of gained XP (the chain of cause), as pure geometry and
// timing. The component (components/admin/game/cause-chain.tsx) measures the screen
// and draws; this file decides how long the flight is, where the comet is on its
// slightly curved path, which way its tail points and where the „+XP“ pill stands.

import { ADMIN_SPARK } from "@/lib/admin-v2/motion";

export type Point = { x: number; y: number };
/** The part of a DOMRect the placement needs. */
export type Box = { left: number; right: number; top: number; bottom: number };

/** The flight in seconds: to the bar of the boss (when it goes through it), into the chip, and what the landing leaves behind. */
export function sparkSeconds(viaBoss: boolean): { toBoss: number; toChip: number; landing: number; total: number } {
  const toBoss = viaBoss ? ADMIN_SPARK.toBoss : 0;
  const landing = toBoss + ADMIN_SPARK.toChip;
  // The label stays longest; the ring and the fade of the comet are inside it.
  const total = landing + Math.max(ADMIN_SPARK.label, ADMIN_SPARK.ring, ADMIN_SPARK.fade);
  return { toBoss, toChip: ADMIN_SPARK.toChip, landing, total: Math.round(total * 1000) / 1000 };
}

/** The box is at least partly inside the area (the scrolling screen of the frame): a bar scrolled out of it is not struck, the comet goes straight to the chip. */
export function inView(box: Box, area: Box): boolean {
  return box.right > area.left && box.left < area.right && box.bottom > area.top && box.top < area.bottom;
}

/** Where the comet strikes the bar of the boss: at the end of what is left of it (`now` of `max`), inside the ends of the bar. */
export function barImpact(bar: Box, now: number, max: number): Point {
  const width = bar.right - bar.left;
  const share = max > 0 && Number.isFinite(now) ? Math.min(1, Math.max(0, now / max)) : 0.5;
  const inset = Math.min(6, width / 2);
  return { x: Math.min(Math.max(bar.left + width * share, bar.left + inset), bar.right - inset), y: (bar.top + bar.bottom) / 2 };
}

/** The tail is `ADMIN_SPARK.tail` px, but never longer than most of a short flight (and never shorter than three heads). */
export function tailLength(distance: number): number {
  return Math.min(ADMIN_SPARK.tail, Math.max(ADMIN_SPARK.head * 3, distance * 0.9));
}

/** The control point of a leg: the middle of it, pushed sideways by a share of its length, so the flight is a gentle arc. */
export function curveControl(from: Point, to: Point, bend = 0.12): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return { x: from.x + dx / 2 + dy * bend, y: from.y + dy / 2 - dx * bend };
}

/** A point of the quadratic curve at `t` (0–1). */
export function curvePoint(from: Point, control: Point, to: Point, t: number): Point {
  const u = 1 - t;
  return { x: u * u * from.x + 2 * u * t * control.x + t * t * to.x, y: u * u * from.y + 2 * u * t * control.y + t * t * to.y };
}

/** The direction of flight on the curve at `t`, in degrees (0 to the right, y grows downwards): where the head goes, so the tail points the other way. */
export function curveHeading(from: Point, control: Point, to: Point, t: number): number {
  const u = 1 - t;
  const dx = 2 * u * (control.x - from.x) + 2 * t * (to.x - control.x);
  const dy = 2 * u * (control.y - from.y) + 2 * t * (to.y - control.y);
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

/** `current` turned `share` (0–1) of the way to `target`, the short way round. */
export function approachAngle(current: number, target: number, share: number): number {
  const delta = ((((target - current) % 360) + 540) % 360) - 180;
  return current + delta * share;
}

/**
 * Where the „+XP“ pill stands: beside the chip, centred on it, on the side with room (left first, so it does not
 * cover the level number that sits right of the ring), kept inside the viewport and inside the navbar.
 */
export function labelPlace(chip: Box, label: { width: number; height: number }, navbar: Box | null, viewWidth: number, gap = 8, margin = 8): { left: number; top: number; side: "left" | "right" } {
  const centre = (chip.top + chip.bottom) / 2;
  let top = centre - label.height / 2;
  if (navbar && navbar.bottom - navbar.top >= label.height + 4) top = Math.min(Math.max(top, navbar.top + 2), navbar.bottom - label.height - 2);
  const leftFits = chip.left - gap - label.width >= margin;
  const side = leftFits ? "left" : "right";
  const left = leftFits ? chip.left - gap - label.width : chip.right + gap;
  return { left: Math.min(Math.max(left, margin), Math.max(margin, viewWidth - margin - label.width)), top, side };
}
