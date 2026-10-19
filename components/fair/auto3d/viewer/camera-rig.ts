// Kamera (A03 §3): PerspectiveCamera sa setViewOffset (poster i canvas imaju isti kadar), OrbitControls
// bez pomeranja mete, granice po stanju i GSAP letovi po sferi oko mete. Uz reduced motion: rezovi.

import { gsap } from "gsap";
import { PerspectiveCamera, Spherical, Vector3 } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  blendPose,
  containFrame,
  flightDuration,
  viewOffsetArgs,
  type ContainFrame,
  type Pose,
  type Rect,
} from "@/lib/auto3d/framing";
import type { Vec3 } from "@/lib/auto3d/manifest";

export type Limits = { minDistance: number; maxDistance: number; minPolarDeg: number; maxPolarDeg: number };

export const LIMITS = {
  free: { minDistance: 3.2, maxDistance: 13, minPolarDeg: 10, maxPolarDeg: 92 },
  kiosk: { minDistance: 4.5, maxDistance: 11, minPolarDeg: 35, maxPolarDeg: 85 },
} as const satisfies Record<string, Limits>;

const DEG = Math.PI / 180;
const v3 = (v: Vector3): Vec3 => [v.x, v.y, v.z];

export class CameraRig {
  readonly camera: PerspectiveCamera;
  readonly controls: OrbitControls;
  frame: ContainFrame = { imageW: 1, imageH: 1, offsetX: 0, offsetY: 0 };
  width = 1;
  height = 1;
  shift: [number, number] = [0, 0];
  private tween: gsap.core.Tween | null = null;
  private engaged = false;
  private sph = new Spherical();
  private tmp = new Vector3();

  constructor(
    private canvas: HTMLCanvasElement,
    opts: { touchPanY: boolean },
    private onChange: () => void,
    private onUserStart: () => void,
  ) {
    this.camera = new PerspectiveCamera(28, 16 / 9, 0.05, 80);
    // Točkić miša zumira tek kad je korisnik „uhvatio“ scenu (klik ili Ctrl/⌘); inače skroluje stranu.
    canvas.addEventListener("wheel", this.onWheel, { passive: true, capture: true });
    canvas.addEventListener("pointerdown", this.onEngage);
    canvas.addEventListener("pointerleave", this.onDisengage);
    this.controls = new OrbitControls(this.camera, canvas);
    const c = this.controls;
    c.enablePan = false;
    c.enableDamping = true;
    c.dampingFactor = 0.08;
    c.rotateSpeed = 0.7;
    c.zoomSpeed = 0.8;
    c.zoomToCursor = false;
    if (opts.touchPanY) canvas.style.touchAction = "pan-y";
    c.addEventListener("change", this.onChange);
    c.addEventListener("start", this.onStart);
    this.setLimits(LIMITS.free);
  }

  private onWheel = (e: WheelEvent) => {
    if (!this.engaged && !e.ctrlKey && !e.metaKey) e.stopImmediatePropagation();
  };

  private onEngage = () => {
    this.engaged = true;
  };

  private onDisengage = () => {
    this.engaged = false;
  };

  private onStart = () => {
    this.stop();
    this.onUserStart();
  };

  get flying(): boolean {
    return this.tween !== null;
  }

  setLimits(l: Limits) {
    const c = this.controls;
    c.minDistance = l.minDistance;
    c.maxDistance = l.maxDistance;
    c.minPolarAngle = l.minPolarDeg * DEG;
    c.maxPolarAngle = l.maxPolarDeg * DEG;
  }

  /** Veličina canvasa, kutija postera i odnos postera → projekcija sa view offset-om. */
  setViewport(width: number, height: number, posterAspect: number, posterBox: Rect, fov: number) {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.frame = containFrame(posterAspect, posterBox);
    this.camera.fov = fov;
    this.applyProjection();
  }

  applyProjection() {
    const cam = this.camera;
    cam.aspect = this.frame.imageW / this.frame.imageH;
    const [fw, fh, x, y, w, h] = viewOffsetArgs(this.frame, this.width, this.height, this.shift[0], this.shift[1]);
    cam.setViewOffset(fw, fh, x, y, w, h);
    cam.updateProjectionMatrix();
  }

  pose(): Pose {
    return { position: v3(this.camera.position), target: v3(this.controls.target) };
  }

  setPose(p: Pose, shift: [number, number] = this.shift) {
    this.camera.position.set(...p.position);
    this.controls.target.set(...p.target);
    this.shift = [shift[0], shift[1]];
    this.applyProjection();
    this.controls.update();
  }

  stop() {
    if (this.tween) {
      this.tween.kill();
      this.tween = null;
      this.controls.enabled = true;
    }
  }

  /**
   * Let do poze; `seconds` 0 (ili reduced motion) daje rez. Cilj može biti i funkcija koja se čita
   * u svakom frejmu (živ cilj): kadar koji prati rasklapanje ili okretanje kioska se tako stigne bez
   * skoka na kraju leta.
   */
  flyTo(
    toPose: Pose | (() => Pose),
    shift: [number, number],
    opts: { reduced: boolean; seconds?: number; ease?: string },
  ): Promise<void> {
    this.stop();
    const target = typeof toPose === "function" ? toPose : () => toPose;
    const from = this.pose();
    const fromShift: [number, number] = [this.shift[0], this.shift[1]];
    const seconds = opts.reduced ? 0 : (opts.seconds ?? flightDuration(from, target()));
    if (seconds <= 0) {
      this.setPose(target(), shift);
      this.onChange();
      return Promise.resolve();
    }
    this.controls.enabled = false;
    const state = { t: 0 };
    return new Promise((resolve) => {
      this.tween = gsap.to(state, {
        t: 1,
        duration: seconds,
        ease: opts.ease ?? "power2.inOut",
        onUpdate: () => {
          const p = blendPose(from, target(), state.t);
          this.setPose(p, [fromShift[0] + (shift[0] - fromShift[0]) * state.t, fromShift[1] + (shift[1] - fromShift[1]) * state.t]);
          this.onChange();
        },
        onComplete: () => {
          this.tween = null;
          this.controls.enabled = true;
          this.setPose(target(), shift);
          this.onChange();
          resolve();
        },
        onInterrupt: () => resolve(),
      });
    });
  }

  /** Tastatura: okret za dAz/dEl stepeni i zum (množilac daljine). */
  orbitBy(dAzDeg: number, dElDeg: number, zoom: number, reduced: boolean): Promise<void> {
    const p = this.pose();
    const target = new Vector3(...p.target);
    this.tmp.set(...p.position).sub(target);
    this.sph.setFromVector3(this.tmp);
    const c = this.controls;
    this.sph.theta += dAzDeg * DEG;
    this.sph.phi = Math.min(c.maxPolarAngle, Math.max(c.minPolarAngle, this.sph.phi - dElDeg * DEG));
    this.sph.radius = Math.min(c.maxDistance, Math.max(c.minDistance, this.sph.radius * zoom));
    this.tmp.setFromSpherical(this.sph).add(target);
    return this.flyTo({ position: v3(this.tmp), target: p.target }, this.shift, { reduced, seconds: 0.24, ease: "power2.out" });
  }

  /** Jedan korak prigušenja; true dok se kamera još kreće. */
  update(): boolean {
    return this.controls.update();
  }

  dispose() {
    this.stop();
    this.canvas.removeEventListener("wheel", this.onWheel, { capture: true });
    this.canvas.removeEventListener("pointerdown", this.onEngage);
    this.canvas.removeEventListener("pointerleave", this.onDisengage);
    this.controls.removeEventListener("change", this.onChange);
    this.controls.removeEventListener("start", this.onStart);
    this.controls.dispose();
  }
}
