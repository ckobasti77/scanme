// Javni ulaz 3D Rendgen pregledača (A03 §1.3). Ovo je jedino mesto (sa ostalim fajlovima u viewer/)
// koje uvozi `three`; učitava ga samo `viewer-island.tsx` preko dinamičkog `import("./viewer")`.
//
// A10: prelaz režima je kratko pretapanje (snimak starog frejma u 2D canvasu iznad scene gubi
// providnost, a ispod je već nov režim), boja laka prelazi bojom, presek je ravan sa naglašenom
// ivicom, a kiosk okreće početni kadar oko auta. Uz reduced motion sve to je trenutno.

import { Color, Scene, Vector3, type Mesh, type Object3D } from "three";
import manifestJson from "@/public/3d/auto3d/limuzina.manifest.json";
import type { Instance, PartId, SystemId } from "@/lib/auto3d/catalog";
import type { Mode } from "@/lib/auto3d/filter";
import {
  POSTER_ASPECT,
  SYSTEM_VIEWS,
  blendPose,
  orbitPose,
  partPose,
  shiftToPlace,
  systemPose,
  type Pose,
  type Rect,
} from "@/lib/auto3d/framing";
import { parseManifest, type Auto3dManifest, type ManifestCamera, type Viewport } from "@/lib/auto3d/manifest";
import { dprFor, type QualityPlan } from "@/lib/auto3d/quality";
import { Animator, easeInOut, easeOut, linear } from "./anim";
import { CameraRig, LIMITS } from "./camera-rig";
import { SelectionEdges } from "./edges";
import { Studio } from "./environment";
import { applyExplode, maxExplodedX, nodeBox } from "./explode";
import { computeVisuals } from "./filter";
import { parseModel } from "./loader";
import { DEFAULT_PAINT_LOOK, MaterialSets, type PaintLook } from "./materials";
import { prepareMesh } from "./mesh-ray";
import { Picker } from "./picking";
import { buildRegistry, type Registry } from "./registry";
import { Section } from "./section";
import { Stage } from "./stage";

export type { PaintLook, Rect };

export type ViewerLayout = {
  width: number;
  height: number;
  /** Kutija u kojoj se poster crta sa `object-fit: contain` (CSS px u studiju). */
  posterBox: Rect;
  /** Slobodna zona za kadriranje dela i grupe (bez panela i kontrola). */
  freeArea: Rect;
  viewport: Viewport;
};

export type ViewerEvents = {
  ready(info: { quality: "desktop" | "lite"; renderer: string; ms: number }): void;
  hover(part: PartId | null): void;
  pick(part: PartId, instance: Instance | ""): void;
  interact(): void;
  error(kind: "load" | "webgl" | "context"): void;
  contextLost(): void;
  contextRestored(): void;
};

export type ViewerOptions = {
  canvas: HTMLCanvasElement;
  host: HTMLElement;
  plan: QualityPlan & { glb: "desktop" | "lite" };
  /** GLB koji ostrvo već preuzima (paralelno sa uvozom ovog modula, A12). */
  model: Promise<ArrayBuffer>;
  reducedMotion: boolean;
  touchPanY: boolean;
  events: ViewerEvents;
};

export type ViewerSnapshot = {
  mode: Mode;
  part: PartId | null;
  explode: number;
  frames: number;
  calls: number;
  triangles: number;
  dpr: number;
  pickMs: number;
  /** GPU resursi (A10: kiosk ne sme da raste satima). */
  geometries: number;
  textures: number;
};

export type Viewer = {
  load(): Promise<void>;
  setLayout(layout: ViewerLayout): void;
  setMode(mode: Mode): void;
  select(part: PartId | null, o?: { instance?: Instance | ""; frame?: boolean }): void;
  hover(part: PartId | null): void;
  setFilter(system: SystemId | null): void;
  setExplode(p: number, o?: { animate?: boolean; ms?: number }): void;
  /** Presek 0–1 ili null (isključen). */
  setSection(t: number | null): void;
  setPaint(paint: PaintLook): void;
  frameStart(o?: { animate?: boolean }): void;
  orbitBy(dAzDeg: number, dElDeg: number, zoom?: number): void;
  setAutoRotate(on: boolean): void;
  setReducedMotion(on: boolean): void;
  snapshot(): ViewerSnapshot;
  dispose(): void;
};

const CLICK_SLOP_PX = 6;
/** Koliko je providan deo koji zaklanja izabrani deo (0 = normalan, 1 = prigušen kao van grupe). */
const GHOST_DIM = 0.72;
/** Pomeraji ugla (az u smeru manifesta, el) koje kamera proba kad je deo zaklonjen. */
const VIEW_TRIES: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [0, 18],
  [-25, 12],
  [25, 12],
  [0, -25],
  [0, 34],
  [-45, 24],
  [45, 24],
  [0, -45],
  [-30, -35],
  [30, -35],
  [0, 50],
];
const CLICK_MAX_MS = 500;
/** Pretapanje pri promeni režima (A10: „kratak prelaz“). */
const MODE_FADE_MS = 280;
/** Promena boje laka. */
const PAINT_MS = 320;
/** Ravan preseka ulazi i izlazi (fokalni momenat); klizač je prati brže. */
const SECTION_IN_MS = 480;
const SECTION_SLIDE_MS = 120;
/** Okretanje kioska: ≈ 3,6°/s (A03 §5.3). */
const AUTO_ROTATE_DPS = 3.6;

type CameraMode = "home" | "part" | "free";

class ViewerImpl implements Viewer {
  private manifest: Auto3dManifest;
  private scene = new Scene();
  private stage: Stage;
  private rig: CameraRig;
  private studio: Studio;
  private anim = new Animator();
  private picker = new Picker();
  private edges = new SelectionEdges({ visible: 0.9, hidden: 0.22 });
  private hoverEdges = new SelectionEdges({ visible: 0.45, hidden: null }, this.edges.edgeCache);
  private registry: Registry | null = null;
  private mats: MaterialSets | null = null;
  private layout: ViewerLayout | null = null;
  private section = new Section();
  /** Zadati presek (null = isključen); `section.t` je trenutna, animirana vrednost. */
  private sectionTarget: number | null = null;
  private paint: PaintLook = DEFAULT_PAINT_LOOK;
  private autoRotate = false;
  /** Ugao okretanja početnog kadra u kiosku (stepeni). */
  private autoAz = 0;
  private lastTick = 0;
  /** Gornja granica DPR-a; adaptivni DPR je spušta po 0,25 do 1 i ne vraća je u istoj sesiji. */
  private dprCap: number;
  /** 2D snimak starog frejma za pretapanje režima. */
  private fade: HTMLCanvasElement | null = null;
  private fadeTimer = 0;
  /** Idle posao posle `ready` (kutije za picking). */
  private idleJob = 0;

  private mode: Mode = "rendgen";
  private part: PartId | null = null;
  private instance: Instance | "" = "";
  private hovered: PartId | null = null;
  private group: SystemId | null = null;
  private explode = 0;
  private reduced: boolean;
  private cameraMode: CameraMode = "home";
  /** Delovi koji zaklanjaju izabrani deo (providni dok je deo izabran). */
  private ghosts = new Set<string>();
  /** Ugao i daljina poslednjeg kadra dela (za granice orbite dok je deo izabran). */
  private partFrame: { el: number; dist: number } | null = null;
  private losses: number[] = [];
  private disposed = false;
  private down: { x: number; y: number; t: number; id: number } | null = null;
  private hoverRaf = 0;
  private lastPointer: { x: number; y: number } | null = null;
  private tmpA = new Vector3();
  private tmpB = new Vector3();

  constructor(private opts: ViewerOptions) {
    this.manifest = parseManifest(manifestJson);
    this.reduced = opts.reducedMotion;
    this.dprCap = opts.plan.maxDpr;
    this.stage = new Stage(opts.canvas, opts.host, { msaa: opts.plan.msaa }, this.onFrame, {
      contextLost: this.onContextLost,
      contextRestored: this.onContextRestored,
      slow: this.onSlow,
    });
    this.rig = new CameraRig(opts.canvas, { touchPanY: opts.touchPanY }, this.stage.requestRender, this.onUserCamera);
    this.studio = new Studio(this.stage.renderer, this.scene);
    this.studio.setLook(false);
    const c = opts.canvas;
    c.addEventListener("pointerdown", this.onPointerDown);
    c.addEventListener("pointerup", this.onPointerUp);
    c.addEventListener("pointercancel", this.onPointerCancel);
    if (opts.plan.hover) {
      c.addEventListener("pointermove", this.onPointerMove);
      c.addEventListener("pointerleave", this.onPointerLeave);
    }
  }

  // ------------------------------------------------------------------ učitavanje

  async load() {
    const t0 = performance.now();
    let root: Object3D;
    try {
      const buffer = await this.opts.model;
      if (this.disposed) return;
      root = await parseModel(buffer);
    } catch (err) {
      if (!this.disposed) this.opts.events.error("load");
      throw err;
    }
    if (this.disposed) return;
    const registry = buildRegistry(root, this.manifest);
    this.registry = registry;
    this.scene.add(root);
    this.mats = new MaterialSets(registry, this.manifest.look.xray, this.opts.plan.glb === "lite", this.section.plane, this.paint);
    this.edges.setClipping(this.section.plane);
    this.hoverEdges.setClipping(this.section.plane);
    // Stanje postavljeno pre učitavanja (URL, store) se primenjuje bez animacije.
    this.mats.apply(this.mode);
    this.studio.setLook(this.mode === "lak");
    applyExplode(registry.nodes, this.explode, this.manifest.explode.windows);
    // Kutije za picking i zrake kadra dela čitaju matrixWorld; rasklapanje zadato pre učitavanja ga menja (A13).
    this.scene.updateMatrixWorld(true);
    this.updateSectionExtent();
    this.section.set(this.sectionTarget ?? 0, this.sectionTarget !== null);
    this.applyVisuals(false);
    if (this.part) {
      this.highlight(null, this.part);
      this.cameraMode = "part";
    }
    if (this.layout) this.placeCamera();
    await this.stage.renderer.compileAsync(this.scene, this.rig.camera);
    if (this.disposed) return;
    this.stage.renderNow();
    this.stage.adaptive = true;
    this.opts.events.ready({ quality: this.opts.plan.glb, renderer: this.stage.rendererName, ms: Math.round(performance.now() - t0) });
    // Kutije grupa trouglova za picking (A12): u idle vremenu, posle prvog frejma.
    const prepare = () => {
      this.idleJob = 0;
      for (const n of registry.nodes) for (const m of n.meshes) prepareMesh(m);
    };
    this.idleJob = typeof requestIdleCallback === "function" ? requestIdleCallback(prepare, { timeout: 2000 }) : window.setTimeout(prepare, 300);
  }

  // ------------------------------------------------------------------ petlja

  private onFrame = (): boolean => {
    const now = performance.now();
    const dt = this.lastTick ? Math.min(0.1, (now - this.lastTick) / 1000) : 0;
    this.lastTick = now;
    const animating = this.anim.step(now);
    if (this.autoRotate) {
      this.autoAz = (this.autoAz + AUTO_ROTATE_DPS * dt) % 360;
      if (this.cameraMode === "home" && !this.rig.flying && this.layout && this.registry) {
        const h = this.home();
        this.rig.setPose(h.pose, h.shift);
      }
    }
    const moving = this.rig.update();
    if (this.registry) this.stage.renderer.render(this.scene, this.rig.camera);
    const more = animating || moving || this.rig.flying || this.autoRotate;
    if (!more) this.lastTick = 0;
    return more;
  };

  private request() {
    this.stage.requestRender();
  }

  // ------------------------------------------------------------------ kamera

  private viewportCamera(state: "start" | "rasklopljen"): ManifestCamera {
    const vp = this.layout?.viewport ?? "desktop";
    return this.manifest.cameras[state][vp];
  }

  private fov(): number {
    return this.viewportCamera("start").fov;
  }

  private areaCenterShift(): [number, number] {
    const a = this.layout?.freeArea;
    if (!a) return [0, 0];
    return shiftToPlace(this.rig.frame, a.x + a.w / 2, a.y + a.h / 2);
  }

  /** „Dom“ kamere: kadar grupe, ili početni kadar pomeren ka rasklopljenom po napretku p. */
  private home(): { pose: Pose; shift: [number, number] } {
    if (this.group && this.registry && this.layout) return this.systemTarget(this.group);
    const a = this.viewportCamera("start");
    const b = this.viewportCamera("rasklopljen");
    const pose = blendPose({ position: a.position, target: a.target }, { position: b.position, target: b.target }, this.explode);
    return { pose: orbitPose(pose, this.autoAz), shift: [0, 0] };
  }

  private systemTarget(system: SystemId): { pose: Pose; shift: [number, number] } {
    const reg = this.registry as Registry;
    const layout = this.layout as ViewerLayout;
    const boxes = reg.nodes.filter((n) => n.system === system).map((n) => nodeBox(n, this.explode, this.manifest.explode.windows));
    const pose = systemPose(boxes, SYSTEM_VIEWS[system], layout.freeArea, this.rig.frame, this.fov());
    return { pose, shift: this.areaCenterShift() };
  }

  private partTarget(
    part: PartId,
    instance: Instance | "",
  ): { pose: Pose; shift: [number, number]; el: number; dist: number; ghosts: Set<string> } | null {
    const entry = this.registry?.parts.get(part);
    if (!entry || !this.layout) return null;
    const node = entry.nodes.find((n) => n.instance === instance) ?? entry.nodes[0];
    const box = nodeBox(node, this.explode, this.manifest.explode.windows);
    const area = this.layout.freeArea;
    // Ugao iz manifesta, a ako deo zaklanja drugi neprozirni deo, prvi susedni ugao iz kog se vidi.
    let focus = node.focus;
    let clearView = false;
    for (const [dAz, dEl] of VIEW_TRIES) {
      const f = { ...node.focus, az: node.focus.az + dAz * Math.sign(node.focus.az || 1), el: Math.max(-70, Math.min(70, node.focus.el + dEl)) };
      if (this.clearRays(partPose(box, f, area, this.rig.frame, this.fov()), box, new Set([part])) >= 2) {
        focus = f;
        clearView = true;
        break;
      }
    }
    const pose = partPose(box, focus, area, this.rig.frame, this.fov());
    const d = Math.hypot(...pose.position.map((v, i) => v - pose.target[i]));
    // Ako nijedan ugao nije čist, ugao ostaje iz manifesta, a delovi koji zaklanjaju postaju providni.
    const ghosts = clearView ? new Set<string>() : this.occluders(pose, box, part);
    this.partFrame = { el: focus.el, dist: d };
    return { pose, shift: this.areaCenterShift(), el: focus.el, dist: d, ghosts };
  }

  private rayPoints(box: { min: number[]; max: number[] }): number[][] {
    const c = [(box.min[0] + box.max[0]) / 2, (box.min[1] + box.max[1]) / 2, (box.min[2] + box.max[2]) / 2];
    return [c, [c[0], box.max[1], c[2]], [(c[0] + box.min[0]) / 2, c[1], (c[2] + box.max[2]) / 2]];
  }

  /** Koliko od tri zraka (centar i dve tačke kutije) stiže do dela bez neprozirne prepreke; 2+ znači da se vidi. */
  private clearRays(pose: Pose, box: { min: number[]; max: number[] }, skip: ReadonlySet<string>): number {
    const eye = this.tmpA.set(...pose.position);
    let clear = 0;
    for (const q of this.rayPoints(box)) {
      if (!this.picker.firstOpaque(eye, this.tmpB.set(q[0], q[1], q[2]), this.mode, skip)) clear++;
    }
    return clear;
  }

  /** Svi delovi između kamere i izabranog dela (najviše 8 po zraku). */
  private occluders(pose: Pose, box: { min: number[]; max: number[] }, part: PartId): Set<string> {
    const eye = this.tmpA.set(...pose.position);
    const skip = new Set<string>([part]);
    for (const q of this.rayPoints(box)) {
      for (let i = 0; i < 8; i++) {
        const key = this.picker.firstOpaque(eye, this.tmpB.set(q[0], q[1], q[2]), this.mode, skip);
        if (!key) break;
        skip.add(key);
      }
    }
    skip.delete(part);
    return skip;
  }

  /**
   * Granice orbite u „domu“; uvek puštaju i trenutnu pozu, da posle leta na kadar grupe odozdo
   * (prenos, el −14°) ili rasklopljenog auta OrbitControls ne „preseče“ kameru na granicu (skok).
   */
  private setHomeLimits() {
    const lim = this.layout?.viewport === "kiosk" ? LIMITS.kiosk : LIMITS.free;
    const p = this.rig.pose();
    const off = p.position.map((v, i) => v - p.target[i]);
    const dist = Math.hypot(off[0], off[1], off[2]);
    const polar = (Math.acos(Math.min(1, Math.max(-1, off[1] / (dist || 1)))) * 180) / Math.PI;
    this.rig.setLimits({
      minDistance: Math.min(lim.minDistance, dist * 0.95),
      maxDistance: Math.max(lim.maxDistance, dist * 1.05),
      minPolarDeg: Math.min(lim.minPolarDeg, polar - 1),
      maxPolarDeg: Math.max(lim.maxPolarDeg, polar + 1),
    });
  }

  private flyHome(animate: boolean) {
    // Bez okretanja kioska kadar je uvek kanonski; let kreće iz trenutne poze, pa nema skoka.
    if (!this.autoRotate) this.autoAz = 0;
    const h = this.home();
    this.cameraMode = "home";
    this.relaxLimitsFor(h.pose);
    // Živ cilj: kadar prati rasklapanje i okretanje i dok let traje (bez skoka na kraju leta).
    void this.rig.flyTo(() => this.home().pose, h.shift, { reduced: this.reduced || !animate }).then(() => {
      if (this.cameraMode === "home") this.setHomeLimits();
    });
    this.request();
  }

  /** Granice ne smeju da „preseku“ let: dok traje, puštaju i ciljnu i trenutnu daljinu. */
  private relaxLimitsFor(target: Pose) {
    const cur = this.rig.pose();
    const dCur = Math.hypot(...cur.position.map((v, i) => v - cur.target[i]));
    const dTo = Math.hypot(...target.position.map((v, i) => v - target.target[i]));
    this.rig.setLimits({ minDistance: Math.min(0.4, dCur, dTo) * 0.9, maxDistance: Math.max(13, dCur, dTo) * 1.1, minPolarDeg: 1, maxPolarDeg: 179 });
  }

  private placeCamera() {
    if (!this.layout) return;
    if (this.cameraMode === "part" && this.part) {
      const t = this.partTarget(this.part, this.instance);
      if (t) {
        this.setGhosts(t.ghosts);
        this.relaxLimitsFor(t.pose);
        this.rig.setPose(t.pose, t.shift);
        this.setPartOrHomeLimits();
        return;
      }
    }
    if (this.cameraMode === "free") {
      this.rig.applyProjection();
      return;
    }
    const h = this.home();
    this.relaxLimitsFor(h.pose);
    this.rig.setPose(h.pose, h.shift);
    this.setHomeLimits();
  }

  private onUserCamera = () => {
    this.cameraMode = "free";
    this.setPartOrHomeLimits();
    this.opts.events.interact();
  };

  private setPartOrHomeLimits() {
    const info = this.part ? this.partFrame : null;
    if (info) {
      this.rig.setLimits({
        minDistance: Math.min(0.6, info.dist * 0.9),
        maxDistance: 13,
        minPolarDeg: 10,
        maxPolarDeg: info.el < 0 ? 90 + Math.abs(info.el) + 8 : 92,
      });
    } else this.setHomeLimits();
  }

  // ------------------------------------------------------------------ komande

  setLayout(layout: ViewerLayout) {
    const first = this.layout === null;
    const vpChanged = !first && this.layout?.viewport !== layout.viewport;
    this.layout = layout;
    this.applySize();
    this.rig.setViewport(layout.width, layout.height, POSTER_ASPECT[layout.viewport], layout.posterBox, this.fov());
    if (vpChanged && this.cameraMode === "free") this.cameraMode = this.part ? "part" : "home";
    if (this.registry) this.placeCamera();
    this.request();
  }

  private applySize() {
    const l = this.layout;
    if (!l) return;
    this.stage.setSize(l.width, l.height, dprFor(l.width, l.height, window.devicePixelRatio || 1, this.dprCap));
  }

  /** Adaptivni DPR (A03 §1.6): kad pokret ne stiže 50 fps, oštrina se spušta za 0,25, najniže do 1. */
  private onSlow = () => {
    const current = this.stage.renderer.getPixelRatio();
    if (current <= 1) return;
    this.dprCap = Math.max(1, current - 0.25);
    this.applySize();
    this.request();
  };

  setMode(mode: Mode) {
    if (mode === this.mode) return;
    this.crossfade();
    this.mode = mode;
    this.mats?.apply(mode);
    this.studio.setLook(mode === "lak");
    this.applyVisuals(false);
    this.request();
  }

  /**
   * Kratko pretapanje režima: trenutni frejm se prepiše u 2D canvas iznad scene (isti bafer, pre
   * prikaza), a on za MODE_FADE_MS izgubi providnost dok se ispod crta nov režim. Uz reduced motion,
   * pre učitavanja i van ekrana nema pretapanja.
   */
  private crossfade() {
    const src = this.opts.canvas;
    if (this.reduced || !this.registry || this.stage.paused || !src.width || !src.height || !src.parentElement) return;
    let c = this.fade;
    if (!c) {
      c = document.createElement("canvas");
      c.setAttribute("aria-hidden", "true");
      c.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;visibility:hidden";
      this.fade = c;
    }
    if (c.parentElement !== src.parentElement) src.parentElement.appendChild(c);
    c.width = src.width;
    c.height = src.height;
    this.stage.renderNow();
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(src, 0, 0);
    c.style.transition = "none";
    c.style.opacity = "1";
    c.style.visibility = "visible";
    void c.offsetWidth;
    c.style.transition = `opacity ${MODE_FADE_MS}ms cubic-bezier(0.65, 0, 0.35, 1)`;
    c.style.opacity = "0";
    window.clearTimeout(this.fadeTimer);
    this.fadeTimer = window.setTimeout(() => this.clearFade(), MODE_FADE_MS + 60);
  }

  private clearFade() {
    const c = this.fade;
    if (!c) return;
    c.style.visibility = "hidden";
    // Prazan bafer: snimak ne drži memoriju između prelaza (kiosk radi satima).
    c.width = 0;
    c.height = 0;
  }

  private applyVisuals(animate: boolean) {
    const reg = this.registry;
    const mats = this.mats;
    if (!reg || !mats) return;
    const v = computeVisuals(reg, this.mode, this.group);
    for (const [key, { visual }] of v.byKey) {
      const u = mats.uniforms.get(key);
      if (!u) continue;
      const to = visual === "dim" ? 1 : this.ghosts.has(key) ? GHOST_DIM : 0;
      this.anim.run(`dim:${key}`, u.dim.value, to, animate ? 200 : 0, (x) => {
        u.dim.value = x;
        mats.applyDimFor(key);
      });
    }
    this.picker.setPickables(v.pickables);
    this.picker.ghosts = this.ghosts;
    if (this.hovered && v.byKey.get(this.hovered)?.visual !== "normal") this.hover(null);
  }

  private setGhosts(next: Set<string>) {
    const same = next.size === this.ghosts.size && [...next].every((k) => this.ghosts.has(k));
    if (same) return;
    this.ghosts = next;
    this.applyVisuals(true);
  }

  /** Isticanje izbora: bela boja, uniform `select` i ivice svih instanci. */
  private highlight(prev: PartId | null, part: PartId | null) {
    const reg = this.registry;
    const mats = this.mats;
    if (!reg || !mats) return;
    if (prev && prev !== part) {
      const u = mats.uniforms.get(prev);
      const sys = reg.parts.get(prev)?.system;
      if (u && sys) {
        mats.setSelectedColor(prev, sys, false);
        this.anim.run(`sel:${prev}`, u.select.value, 0, 200, (x) => (u.select.value = x));
      }
    }
    if (!part) {
      this.edges.clear();
      return;
    }
    const entry = reg.parts.get(part);
    const u = mats.uniforms.get(part);
    if (entry && u) {
      mats.setSelectedColor(part, entry.system, true);
      this.anim.run(`sel:${part}`, u.select.value, 1, 200, (x) => (u.select.value = x));
      this.edges.show(entry.nodes.flatMap((n) => n.meshes));
    }
  }

  select(part: PartId | null, o: { instance?: Instance | ""; frame?: boolean } = {}) {
    const instance = o.instance ?? "";
    if (part === this.part && instance === this.instance) return;
    const prev = this.part;
    this.part = part;
    this.instance = instance;
    if (!this.registry || !this.mats) return;
    if (prev !== part) this.highlight(prev, part);
    if (part && part === this.hovered) this.hoverEdges.clear();
    if (part && o.frame !== false) {
      const t = this.partTarget(part, instance);
      if (t) {
        this.cameraMode = "part";
        this.setGhosts(t.ghosts);
        this.relaxLimitsFor(t.pose);
        void this.rig.flyTo(t.pose, t.shift, { reduced: this.reduced }).then(() => {
          if (this.cameraMode === "part") this.setPartOrHomeLimits();
        });
      }
    } else if (!part && prev) {
      this.setGhosts(new Set());
      this.flyHome(true);
    }
    this.request();
  }

  hover(part: PartId | null) {
    if (part === this.hovered) return;
    const mats = this.mats;
    const prev = this.hovered;
    this.hovered = part;
    if (!mats) return;
    if (prev) {
      const u = mats.uniforms.get(prev);
      if (u) this.anim.run(`hov:${prev}`, u.hover.value, 0, 120, (x) => (u.hover.value = x));
    }
    if (part) {
      const u = mats.uniforms.get(part);
      if (u) this.anim.run(`hov:${part}`, u.hover.value, 1, 120, (x) => (u.hover.value = x));
    }
    const entry = part && part !== this.part ? this.registry?.parts.get(part) : undefined;
    if (entry) this.hoverEdges.show(entry.nodes.flatMap((n) => n.meshes));
    else this.hoverEdges.clear();
    this.request();
  }

  setFilter(system: SystemId | null) {
    if (system === this.group) return;
    this.group = system;
    this.applyVisuals(true);
    if (this.registry && !this.part) this.flyHome(true);
    this.request();
  }

  setExplode(p: number, o: { animate?: boolean; ms?: number } = {}) {
    const to = Math.min(1, Math.max(0, p));
    const animate = o.animate && !this.reduced;
    const from = this.explode;
    const apply = (x: number) => {
      this.explode = x;
      if (this.registry) applyExplode(this.registry.nodes, x, this.manifest.explode.windows);
      this.picker.invalidate();
      this.updateSectionExtent();
      if (this.cameraMode === "home" && !this.rig.flying && this.layout && this.registry) {
        const h = this.home();
        this.relaxLimitsFor(h.pose);
        this.rig.setPose(h.pose, h.shift);
        this.setHomeLimits();
      }
    };
    const ms = animate ? (o.ms ?? 1600 * Math.abs(to - from)) : 120;
    this.anim.run("explode", from, to, ms, apply, animate ? easeInOut : linear);
    this.request();
  }

  /** Spoljna ivica auta u trenutnom rasklapanju (presek t = 0 je tik uz nju). */
  private updateSectionExtent() {
    const reg = this.registry;
    if (!reg) return;
    this.section.setExtent(maxExplodedX(reg.nodes, this.explode, this.manifest.explode.windows, this.manifest.bbox.max[0]));
  }

  setSection(t: number | null) {
    if (t === this.sectionTarget) return;
    const was = this.sectionTarget;
    this.sectionTarget = t;
    if (!this.registry) return;
    const on = t !== null;
    const to = t ?? 0;
    // Ravan ulazi i izlazi sporije (fokalni momenat), a klizač prati brzo; uz reduced motion odmah.
    const ms = this.reduced ? 0 : was === null || t === null ? SECTION_IN_MS : SECTION_SLIDE_MS;
    const from = this.section.on ? this.section.t : 0;
    this.anim.run(
      "section",
      from,
      to,
      ms,
      (x) => {
        this.section.set(x, true);
        this.picker.invalidate();
      },
      easeOut,
      () => {
        if (!on) this.section.set(0, false);
      },
    );
    this.request();
  }

  setPaint(paint: PaintLook) {
    if (paint.hex === this.paint.hex && paint.metalness === this.paint.metalness && paint.roughness === this.paint.roughness) return;
    this.paint = paint;
    const mats = this.mats;
    if (!mats) return;
    const from = { color: mats.paint.color.clone(), metalness: mats.paint.metalness, roughness: mats.paint.roughness };
    const to = { color: new Color(paint.hex), metalness: paint.metalness, roughness: paint.roughness };
    mats.paint = to;
    this.anim.run("paint", 0, 1, this.reduced ? 0 : PAINT_MS, (k) => mats.setPaintMix(from, to, k), easeOut);
    this.request();
  }

  frameStart(o: { animate?: boolean } = {}) {
    this.flyHome(o.animate ?? true);
  }

  orbitBy(dAzDeg: number, dElDeg: number, zoom = 1) {
    this.cameraMode = "free";
    this.setPartOrHomeLimits();
    void this.rig.orbitBy(dAzDeg, dElDeg, zoom, this.reduced);
    this.request();
  }

  /** Kiosk: početni kadar se polako okreće oko auta (i dok se auto rasklapa). Ne uz reduced motion. */
  setAutoRotate(on: boolean) {
    const next = on && !this.reduced;
    if (next === this.autoRotate) return;
    this.autoRotate = next;
    this.lastTick = 0;
    this.request();
  }

  setReducedMotion(on: boolean) {
    this.reduced = on;
    if (on) this.autoRotate = false;
  }

  snapshot(): ViewerSnapshot {
    const info = this.stage.renderer.info;
    return {
      mode: this.mode,
      part: this.part,
      explode: Math.round(this.explode * 1000) / 1000,
      frames: this.stage.frames,
      calls: info.render.calls,
      triangles: info.render.triangles,
      dpr: this.stage.renderer.getPixelRatio(),
      pickMs: Math.round(this.picker.lastMs * 100) / 100,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
    };
  }

  // ------------------------------------------------------------------ pokazivač

  private local(e: PointerEvent) {
    const r = this.opts.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height };
  }

  private pickAt(x: number, y: number, w: number, h: number) {
    if (!this.registry) return null;
    return this.picker.pick(x, y, w, h, this.rig.camera, this.mode, this.section.x);
  }

  private onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    const p = this.local(e);
    this.down = { x: p.x, y: p.y, t: performance.now(), id: e.pointerId };
  };

  private onPointerUp = (e: PointerEvent) => {
    const start = this.down;
    this.down = null;
    if (!start || start.id !== e.pointerId) return;
    const p = this.local(e);
    if (Math.hypot(p.x - start.x, p.y - start.y) > CLICK_SLOP_PX || performance.now() - start.t > CLICK_MAX_MS) return;
    const hit = this.pickAt(p.x, p.y, p.w, p.h);
    if (hit) this.opts.events.pick(hit.partId, hit.instance);
  };

  private onPointerCancel = () => {
    this.down = null;
  };

  private onPointerMove = (e: PointerEvent) => {
    if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
    if (e.buttons !== 0) return;
    const p = this.local(e);
    this.lastPointer = { x: p.x, y: p.y };
    if (!this.hoverRaf) {
      this.hoverRaf = requestAnimationFrame(() => {
        this.hoverRaf = 0;
        const lp = this.lastPointer;
        if (!lp || this.rig.flying) return;
        const r = this.opts.canvas.getBoundingClientRect();
        const hit = this.pickAt(lp.x, lp.y, r.width, r.height);
        const id = hit?.partId ?? null;
        this.opts.canvas.style.cursor = id ? "pointer" : "";
        if (id !== this.hovered) {
          this.hover(id);
          this.opts.events.hover(id);
        }
      });
    }
  };

  private onPointerLeave = () => {
    this.lastPointer = null;
    if (this.hoverRaf) cancelAnimationFrame(this.hoverRaf);
    this.hoverRaf = 0;
    this.opts.canvas.style.cursor = "";
    if (this.hovered) {
      this.hover(null);
      this.opts.events.hover(null);
    }
  };

  // ------------------------------------------------------------------ kontekst

  private onContextLost = () => {
    const now = performance.now();
    this.losses = [...this.losses.filter((t) => now - t < 60_000), now];
    if (this.losses.length > 1) this.opts.events.error("context");
    else this.opts.events.contextLost();
  };

  private onContextRestored = () => {
    if (this.losses.length > 1) return;
    this.studio.rebuildAfterRestore();
    for (const m of this.mats?.all() ?? []) m.needsUpdate = true;
    this.opts.events.contextRestored();
    this.request();
  };

  // ------------------------------------------------------------------ kraj

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.anim.clear();
    if (this.hoverRaf) cancelAnimationFrame(this.hoverRaf);
    window.clearTimeout(this.fadeTimer);
    if (this.idleJob) {
      if (typeof cancelIdleCallback === "function") cancelIdleCallback(this.idleJob);
      else window.clearTimeout(this.idleJob);
    }
    this.clearFade();
    this.fade?.remove();
    this.fade = null;
    const c = this.opts.canvas;
    c.removeEventListener("pointerdown", this.onPointerDown);
    c.removeEventListener("pointerup", this.onPointerUp);
    c.removeEventListener("pointercancel", this.onPointerCancel);
    c.removeEventListener("pointermove", this.onPointerMove);
    c.removeEventListener("pointerleave", this.onPointerLeave);
    this.rig.dispose();
    this.hoverEdges.dispose();
    this.edges.dispose();
    const geometries = new Set<{ dispose(): void }>();
    this.registry?.root.traverse((o) => {
      const g = (o as Mesh).geometry;
      if (g) geometries.add(g);
    });
    this.mats?.dispose();
    for (const g of geometries) g.dispose();
    this.studio.dispose();
    this.scene.clear();
    this.stage.dispose();
    this.registry = null;
    this.mats = null;
  }
}

export async function createViewer(opts: ViewerOptions): Promise<Viewer> {
  return new ViewerImpl(opts);
}
