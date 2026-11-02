import * as THREE from "three";
import type { Stage } from "./stage";

// ADMIN v3 V2 — the one pattern for hover and click in a scene of the 3D kit:
// a ray from the pointer through the camera. A click is a press and a release
// at (almost) the same place, so dragging or scrolling over the canvas is
// never a click. Hover is read at most once a frame and only for a mouse or a
// pen; a touch has no hover and picks on tap. An `InstancedMesh` is one target:
// the scene turns the hit (its `instanceId`) into an id.

/** A press and a release farther apart than this (px) is a drag. */
export const PICK_SLOP_PX = 5;

export type Picker = {
  /** The id under the pointer right now, or null. */
  readonly hovered: string | null;
  dispose(): void;
};

export type PickerOptions = {
  camera: THREE.Camera;
  /** What can be hit, asked at every read (a scene may rebuild its meshes). */
  targets: () => THREE.Object3D[];
  /** The id of a read: the hits are sorted from the nearest; null = nothing to pick there. */
  idOf: (hits: THREE.Intersection[]) => string | null;
  onHover: (id: string | null) => void;
  onPick: (id: string, event: PointerEvent) => void;
  /** The pointer over the canvas, in −1…1 from its centre (y up); null when it left. */
  onMove?: (point: { x: number; y: number } | null) => void;
};

export function createPicker(stage: Stage, options: PickerOptions): Picker {
  const { canvas } = stage;
  const raycaster = new THREE.Raycaster();
  const point = new THREE.Vector2();
  let hovered: string | null = null;
  let down: { x: number; y: number } | null = null;
  let pending: PointerEvent | null = null;
  let raf = 0;

  const read = (event: PointerEvent): string | null => {
    const box = canvas.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return null;
    point.set(((event.clientX - box.left) / box.width) * 2 - 1, -((event.clientY - box.top) / box.height) * 2 + 1);
    raycaster.setFromCamera(point, options.camera);
    return options.idOf(raycaster.intersectObjects(options.targets(), false));
  };

  const setHovered = (id: string | null) => {
    if (id === hovered) return;
    hovered = id;
    canvas.style.cursor = id ? "pointer" : "";
    options.onHover(id);
  };

  const flush = () => {
    raf = 0;
    const event = pending;
    pending = null;
    if (!event) return;
    setHovered(read(event));
    options.onMove?.({ x: point.x, y: point.y });
  };

  const onPointerMove = (event: PointerEvent) => {
    if (event.pointerType === "touch") return;
    pending = event;
    if (!raf) raf = requestAnimationFrame(flush);
  };
  const onPointerLeave = () => {
    pending = null;
    setHovered(null);
    options.onMove?.(null);
  };
  const onPointerDown = (event: PointerEvent) => {
    // The right and the middle button, and a second finger, never pick.
    down = event.button === 0 && event.isPrimary ? { x: event.clientX, y: event.clientY } : null;
  };
  const onPointerUp = (event: PointerEvent) => {
    const start = down;
    down = null;
    if (event.button !== 0 || !start || Math.hypot(event.clientX - start.x, event.clientY - start.y) > PICK_SLOP_PX) return;
    const id = read(event);
    if (id) options.onPick(id, event);
  };
  const onPointerCancel = () => {
    down = null;
  };

  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerleave", onPointerLeave);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerCancel);

  const handle: Picker = {
    get hovered() {
      return hovered;
    },
    dispose() {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerCancel);
      canvas.style.cursor = "";
    },
  };
  return stage.track(handle);
}
