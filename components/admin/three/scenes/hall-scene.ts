import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { HeatScene } from "@/lib/admin-v2/analytics/heat-blocks";
import { liftLabels } from "@/lib/admin-v2/analytics/label-lift";
import { HALL_PARTICLES, emitCount, impulseDelays, replayRates } from "@/lib/admin-v2/hall/impulses";
import { frameRect, projectBox, viewAxes, type FrameRect } from "@/lib/admin-v2/hall/framing";
import { HALL_MOTION, approach, hourRingAt, introCamera, introGrow, shortGrow } from "@/lib/admin-v2/hall/motion";
import { playerT } from "@/lib/admin-v2/hall/player";
import { rimStrip } from "@/lib/admin-v2/hall/rim";
import { dayLevelsAt, heightsAt, layersAt, levelsAt } from "@/lib/admin-v2/hall/timelapse";
import type { HallImpulse, HallLayer, HallSeries, HallStand, TimelapsePlayer } from "@/lib/admin-v2/hall/types";
import { blendMode } from "@/lib/admin-v2/three/theme";
import { fairHeatColor } from "@/lib/fair-heat";
import type { StageRun, StageScene } from "../admin-stage";
import { createParticles, type ParticleSpec } from "../particles";
import { createPicker } from "../picking";
import { createComposer } from "../post";
import type { Stage } from "../stage";

// ADMIN v3 V3 — the Living hall (ZADATAK-V3 §3.2): the hall heat map on the 3D
// kit. Every stand of the floor plan is a column: its height is the number of
// scans, its top is the colour of the heat with a lit rim (in the dark theme the
// rim is above the bloom threshold, so every top glows and the colour of the
// legend stays exact), and with the hourly read of the day the column is layered:
// one layer per hour, in the colour of the heat of that hour, so the hall shows
// how much AND when. Green is what happens now: a new scan of a poll is a ring
// and a burst of particles from its stand, in the calm state particles rise in
// proportion to the last hour, and a beam stands over an active stand.
// The Vremeplov moves the same columns through a day: the scene computes the
// moment from the player every frame, so the columns grow smoothly while the
// text beside them follows four times a second.
// The camera comes round in an intro of 1.4 s that any input skips; then it is
// the orbit of X3 (drag turns, Ctrl + wheel or two fingers zoom, a plain wheel
// scrolls the page). With reduced motion and in the quiet mode: the final
// picture, no particles, no intro.
// V5: the home view is fitted to the stands that have something to show (the
// rest of the plan peeks in at the edges, `lib/admin-v2/hall/framing.ts`), and
// every whole hour of a replay sends a ring over the floor from the middle of
// that frame.

export type HallSceneProps = {
  /** The floor plan with the live picture: the height and the heat of every stand right now. */
  floor: HeatScene;
  /** The hourly read of the shown day: the layers of the columns and the Vremeplov. null = plain columns. */
  series: HallSeries | null;
  player: TimelapsePlayer;
  picked: string | null;
  /** The new scans of the last poll; a new array is a new burst. */
  impulses: readonly HallImpulse[];
  /** The calm state: particles per second per map location. */
  ambient: ReadonlyMap<string, number>;
  /** The excerpt on Pregled: no orbit, no pick, no labels. */
  mini: boolean;
  /** „Vrati pogled“: a new number puts the camera back. */
  resetKey: number;
  onPick: (locationId: string | null) => void;
};

type Block = {
  id: string;
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  edges: THREE.LineBasicMaterial;
  /** The lit rim of the top (the dark theme). */
  rim: THREE.Mesh;
  rimMaterial: THREE.MeshBasicMaterial;
  center: [number, number];
  /** Half the size of the stand on the floor: where its particles start. */
  spread: [number, number];
  /** The box of the stand on the floor: what the home view is fitted to. */
  rect: FrameRect;
  /** How near the camera the stand is (0 = the nearest). */
  order: number;
  /** Its turn in the intro, among the stands that have something to show (the nearest first). */
  turn: number;
  /** What is drawn: the height (0–1 of the tallest), the heat of the top, how lit the beam is. */
  shown: { height: number; level: number; beam: number };
  to: { height: number; level: number; beam: number };
  /** The layers the material holds were written for this key. */
  layersKey: string;
  carry: number;
  ring: number;
};

type Ring = { mesh: THREE.Mesh; material: THREE.MeshBasicMaterial; block: Block | null; age: number };
/** The ring of a whole hour of the replay: it belongs to no stand, it goes out from the middle of the frame. */
type HourRing = { mesh: THREE.Mesh; material: THREE.MeshBasicMaterial; active: boolean; age: number };
type Spark = ParticleSpec & { position: THREE.Vector3; velocity: THREE.Vector3 };
type TokenColor = { token: string; light: string; dark: string };

const LAYERS_MAX = 16;
const RINGS = 8;
/** An hour is 0.9 s and a replay crosses one about every second: two rings are never both in use for long. */
const HOUR_RINGS = 2;
/** What the keys of a column are, hoisted out of the frame. */
const SHOWN_KEYS = ["height", "level", "beam"] as const;
/** The replay has no stream in the live picture (never written to). */
const NO_RATES: ReadonlyMap<string, number> = new Map();
const DEV = process.env.NODE_ENV !== "production";
/** What a click beside every stand (the floor, the empty space around the hall) is for the picker: it closes the picked stand. */
const NO_STAND = "\u0000none";
const ENERGY: Record<"light" | "dark", TokenColor> = {
  // The same pair as the Pulse: ScanMe green on a dark surface, the darker success green on a light one.
  dark: { token: "--admin-nav-line", light: "#6fc05d", dark: "#6fc05d" },
  light: { token: "--admin-success", light: "#477d12", dark: "#a9dc70" },
};
/** The luminance the bloom pass sees (linear). */
const luma = (color: THREE.Color) => 0.299 * color.r + 0.587 * color.g + 0.114 * color.b;
/** The rim of a top is lifted to this luminance in the dark theme: above the bloom threshold of the kit (0.72). */
const RIM_LUMA = 0.92;
/** A colour is scaled this much at most; the rest of the lift is white, so the hue stays readable. */
const RIM_GAIN_MAX = 3.2;
/** Without the bloom pass a lifted colour only washes out: the rim is just a lighter line. */
const RIM_GAIN_PLAIN = 1.35;
/** The width of the rim, as a share of the width of the floor. */
const RIM_WIDTH = 0.0055;

const COLUMN_VERTEX = /* glsl */ `
  varying float vY;
  varying vec3 vN;
  void main() {
    vY = position.y;
    vN = normal;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// The top is one colour; a side is cut into the layers of the day: `uBounds[i]` is where layer i ends (0–1 of
// the column) and a thin darker line marks the end of every layer but the last.
const COLUMN_FRAGMENT = /* glsl */ `
  uniform vec3 uColors[${LAYERS_MAX}];
  uniform float uBounds[${LAYERS_MAX}];
  uniform int uCount;
  uniform vec3 uTop;
  uniform float uLine;
  uniform float uShade;
  uniform float uFlash;
  varying float vY;
  varying vec3 vN;
  void main() {
    vec3 color = uTop * (1.0 + 0.5 * uFlash);
    if (vN.y < 0.5) {
      vec3 layer = uColors[0];
      float seam = 0.0;
      for (int i = 0; i < ${LAYERS_MAX}; i++) {
        if (i >= uCount) break;
        layer = uColors[i];
        if (vY <= uBounds[i]) {
          if (i < uCount - 1) seam = 1.0 - smoothstep(0.0, uLine, uBounds[i] - vY);
          break;
        }
      }
      // Two faces of a column are never the same shade, and its foot is a little darker: it reads as a solid.
      float face = 0.86 + 0.14 * abs(vN.x);
      color = layer * uShade * face * (0.84 + 0.16 * vY) * (1.0 - 0.3 * seam);
    }
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const BEAM_VERTEX = /* glsl */ `
  attribute float aStrength;
  varying vec2 vUv;
  varying float vStrength;
  void main() {
    vUv = uv;
    vStrength = aStrength;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;

// A beam is brightest at the top of its stand and along its axis, and fades out upwards.
const BEAM_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uGain;
  uniform float uOpacity;
  varying vec2 vUv;
  varying float vStrength;
  void main() {
    float across = 1.0 - abs(vUv.x - 0.5) * 2.0;
    float along = pow(1.0 - vUv.y, 1.3);
    gl_FragColor = vec4(uColor * uGain, across * along * vStrength * uOpacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function shapeOf(polygon: ReadonlyArray<readonly [number, number]>): THREE.Shape {
  const shape = new THREE.Shape();
  polygon.forEach(([x, y], index) => (index === 0 ? shape.moveTo(x, -y) : shape.lineTo(x, -y)));
  shape.closePath();
  return shape;
}

/** What has to be built again: the outlines, not the numbers on them. */
const floorKey = (floor: HeatScene) => `${floor.width}:${floor.depth}:${floor.zones.map((zone) => zone.id).join(",")}:${floor.blocks.map((block) => block.locationId).join(",")}`;

export function create(stage: Stage, initial: HallSceneProps, run: StageRun): StageScene<HallSceneProps> {
  const { scene } = stage;
  const motion = run.motion;
  let props = initial;
  let disposed = false;
  let time = 0;

  // --- colours ------------------------------------------------------------------
  const dark = () => blendMode(stage.theme) === "additive";
  const palette = { floor: new THREE.Color(), tile: new THREE.Color(), ink: new THREE.Color(), quiet: new THREE.Color(), energy: new THREE.Color(), spark: new THREE.Color() };
  const readPalette = () => {
    const light = stage.theme === "light";
    palette.floor.copy(stage.token("--admin-surface-muted", light ? "#eeeee8" : "#343a36"));
    palette.tile.copy(stage.token("--admin-surface-strong", light ? "#fffefa" : "#292e2b"));
    palette.ink.copy(stage.token("--admin-text", light ? "#171918" : "#f2f4ee"));
    palette.quiet.copy(stage.token("--admin-text-muted", light ? "#5f6462" : "#b0b6af"));
    const energy = ENERGY[stage.theme];
    palette.energy.copy(stage.token(energy.token, energy[stage.theme]));
  };
  readPalette();

  // --- the camera ---------------------------------------------------------------
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  stage.setCamera(camera);
  /** Half the width and the height of the hall as the isometric view sees it (world units). */
  let extent = { halfWidth: 1, halfHeight: 1 };
  /** The isometric view the intro ends on and „Vrati pogled“ returns to. */
  const home = { position: new THREE.Vector3(), target: new THREE.Vector3() };
  const offset = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);
  /** Where the camera stands, seen from the middle of the floor: low and mostly from the front, so a wide hall fills a wide box. */
  const VIEW = new THREE.Vector3(0.48, 0.56, 1).normalize();

  /** Half the height of what the box shows at zoom 1: the width is this times the aspect. */
  const fitHalf = (box: { halfWidth: number; halfHeight: number }) => Math.max(box.halfHeight, box.halfWidth / (stage.size.width / stage.size.height));

  const fit = () => {
    const { width, height } = stage.size;
    const aspect = width / height;
    const half = fitHalf(extent);
    camera.left = -half * aspect;
    camera.right = half * aspect;
    camera.top = half;
    camera.bottom = -half;
    camera.updateProjectionMatrix();
  };

  // The wheel never zooms on its own (it would stop the page under the cursor): Ctrl + wheel and a pinch do. It is
  // registered BEFORE the controls: an older Safari runs the listeners of one target in the order they were added,
  // and the controls would zoom first.
  const onWheel = (event: WheelEvent) => {
    endIntro();
    if (!event.ctrlKey && !event.metaKey) event.stopImmediatePropagation();
  };
  stage.canvas.addEventListener("wheel", onWheel, { capture: true, passive: true });

  let controls: OrbitControls | null = null;
  if (!props.mini) {
    controls = stage.track(new OrbitControls(camera, stage.canvas));
    controls.enableDamping = false;
    controls.screenSpacePanning = true;
    controls.maxPolarAngle = Math.PI * 0.48;
    controls.minZoom = 0.6;
    controls.maxZoom = 6;
    // The controls take every touch for themselves; a vertical swipe over the hall still scrolls the page.
    stage.canvas.style.touchAction = "pan-y";
    stage.canvas.style.cursor = "grab";
  }

  // --- what the hall is built of --------------------------------------------------
  const root = new THREE.Group();
  scene.add(root);
  /** Geometries and materials of the current floor plan: disposed when the plan changes (and with the stage). */
  const built: Array<{ dispose(): void }> = [];
  const own = <T extends { dispose(): void }>(item: T) => {
    built.push(item);
    return item;
  };
  let blocks: Block[] = [];
  let floors: THREE.Mesh[] = [];
  let byId = new Map<string, Block>();
  let builtKey = "";
  let tallest = 1;
  let lowest = 0.01;
  let tile = 0.002;
  /** The labels of the stands (DOM, drawn by React over the scene) have to be placed again. */
  let labelsDirty = true;
  let sizesAt = -1;
  const labelSizes = new Map<HTMLElement, { width: number; height: number }>();

  const worldHeight = (share: number) => (share > 0 ? Math.max(lowest, share * tallest) : tile);

  const clear = () => {
    root.clear();
    for (const item of built.splice(0)) item.dispose();
    blocks = [];
    floors = [];
    byId = new Map();
  };

  // --- the frame of the home view -------------------------------------------------
  /** The floor being drawn (map pixels) and how far the camera stands from its middle. */
  const plan = { width: 1, depth: 1, radius: 1, headroom: 0 };
  /** The middle of the framed part of the floor and its reach: the ring of an hour goes out from here. */
  const framed = { x: 0, z: 0, reach: 1 };
  /** Which stands the home view was fitted to. */
  let frameKey = "";
  /** What it takes to see the whole floor (the zoom of the controls may go out that far). */
  let wholeView = { halfWidth: 1, halfHeight: 1 };
  const viewDirection: [number, number, number] = [VIEW.x, VIEW.y, VIEW.z];
  const axes = viewAxes(viewDirection);
  const rightAxis = new THREE.Vector3(...axes.right);
  const upAxis = new THREE.Vector3(...axes.up);

  /** The stands the home view is fitted to: all of the series (a replay never grows out of the frame), else those with a value. */
  const framedStands = (from: HallSceneProps) =>
    (from.series ? from.series.stands.map((stand) => stand.locationId) : from.floor.blocks.filter((block) => block.value > 0).map((block) => block.locationId))
      .filter((id) => byId.has(id))
      .sort();

  const atHome = () => !controls || (camera.position.distanceTo(home.position) < plan.width * 1e-3 && controls.target.distanceTo(home.target) < plan.width * 1e-3 && Math.abs(camera.zoom - 1) < 1e-3);

  /** How far the controls may zoom out: far enough to see the whole floor, never less than before the frame. */
  const limitZoom = () => {
    if (controls) controls.minZoom = Math.min(0.6, fitHalf(extent) / fitHalf(wholeView));
  };

  /**
   * Fits the home view (what the intro ends on and „Vrati pogled“ returns to) to the stands that have something to
   * show. `follow`: the camera goes there too (the hall was just built). Otherwise it goes only if it is still at
   * home; a camera someone has orbited keeps its place and its scale on the screen, and only „Vrati pogled“ changes.
   */
  const setFrame = (follow: boolean) => {
    const ids = framedStands(props);
    frameKey = ids.join("|");
    const rect = frameRect(plan, ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!.rect] : [])));
    const look: [number, number] = [plan.width / 2, plan.depth / 2];
    const seen = projectBox(rect, plan.headroom, viewDirection, look);
    const all = projectBox({ minX: 0, minZ: 0, maxX: plan.width, maxZ: plan.depth }, plan.headroom, viewDirection, look);
    const before = fitHalf(extent);
    const moves = follow || intro === "full" || atHome();
    extent = { halfWidth: seen.halfWidth * 1.06, halfHeight: seen.halfHeight * 1.08 };
    wholeView = { halfWidth: all.halfWidth * 1.06, halfHeight: all.halfHeight * 1.08 };
    home.target.set(look[0], 0, look[1]).addScaledVector(rightAxis, seen.shiftRight).addScaledVector(upAxis, seen.shiftUp);
    home.position.copy(home.target).addScaledVector(VIEW, plan.radius * 3);
    framed.x = (rect.minX + rect.maxX) / 2;
    framed.z = (rect.minZ + rect.maxZ) / 2;
    framed.reach = Math.max(1, Math.hypot(rect.maxX - rect.minX, rect.maxZ - rect.minZ) / 2);
    if (moves) {
      camera.position.copy(home.position);
      camera.zoom = 1;
      camera.lookAt(home.target);
    } else camera.zoom *= fitHalf(extent) / before;
    fit();
    if (controls) {
      limitZoom();
      if (moves) {
        controls.target.copy(home.target);
        controls.update();
      }
      controls.target0.copy(home.target);
      controls.position0.copy(home.position);
      controls.zoom0 = 1;
    }
    if (intro === "full") placeIntroCamera();
  };

  const build = (floor: HeatScene) => {
    clear();
    builtKey = floorKey(floor);
    // The tallest stand is a small part of the floor, so it never hides the stands behind it.
    tallest = floor.width * 0.14;
    lowest = floor.width * 0.006;
    tile = floor.width * 0.002;
    const flat = (polygon: ReadonlyArray<readonly [number, number]>) => {
      const geometry = own(stage.track(new THREE.ShapeGeometry(shapeOf(polygon))));
      geometry.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(geometry, own(stage.track(new THREE.MeshBasicMaterial({ color: palette.floor }))));
      root.add(mesh);
      floors.push(mesh);
    };
    for (const zone of floor.zones) {
      flat(zone.outline ?? [[zone.offsetX, 0], [zone.offsetX + zone.width, 0], [zone.offsetX + zone.width, zone.height], [zone.offsetX, zone.height]]);
    }
    for (const block of floor.blocks) {
      const geometry = own(stage.track(new THREE.ExtrudeGeometry(shapeOf(block.polygon), { depth: 1, bevelEnabled: false })));
      geometry.rotateX(-Math.PI / 2);
      const material = own(
        stage.track(
          new THREE.ShaderMaterial({
            vertexShader: COLUMN_VERTEX,
            fragmentShader: COLUMN_FRAGMENT,
            uniforms: {
              uColors: { value: new Float32Array(LAYERS_MAX * 3) },
              uBounds: { value: new Float32Array(LAYERS_MAX).fill(1) },
              uCount: { value: 1 },
              uTop: { value: new THREE.Color() },
              uLine: { value: 0.01 },
              uShade: { value: 0.72 },
              uFlash: { value: 0 },
            },
          }),
        ),
      );
      const mesh = new THREE.Mesh(geometry, material);
      mesh.userData.locationId = block.locationId;
      const edges = own(stage.track(new THREE.LineBasicMaterial({ transparent: true })));
      mesh.add(new THREE.LineSegments(own(stage.track(new THREE.EdgesGeometry(geometry))), edges));
      // The rim rides on the top of the column (it is its child, at y = 1 of the unit column).
      const rimMaterial = own(stage.track(new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })));
      // The strip along the inside of the outline, flat at the top of the unit column.
      const strip = rimStrip(block.polygon, floor.width * RIM_WIDTH);
      const rimShape = own(stage.track(new THREE.BufferGeometry()));
      rimShape.setAttribute("position", new THREE.Float32BufferAttribute(strip.points.flatMap((value, index) => (index % 2 === 0 ? [value, 1] : [value])), 3));
      rimShape.setIndex(strip.indices);
      const rim = new THREE.Mesh(rimShape, rimMaterial);
      rim.visible = false;
      mesh.add(rim);
      root.add(mesh);
      const xs = block.polygon.map((point) => point[0]);
      const ys = block.polygon.map((point) => point[1]);
      blocks.push({
        id: block.locationId,
        mesh,
        material,
        edges,
        rim,
        rimMaterial,
        center: [block.center[0], block.center[1]],
        spread: [(Math.max(...xs) - Math.min(...xs)) / 2, (Math.max(...ys) - Math.min(...ys)) / 2],
        rect: { minX: Math.min(...xs), minZ: Math.min(...ys), maxX: Math.max(...xs), maxZ: Math.max(...ys) },
        order: 0,
        turn: 0,
        shown: { height: 0, level: 0, beam: 0 },
        to: { height: 0, level: 0, beam: 0 },
        layersKey: "",
        carry: 0,
        ring: 0,
      });
    }
    byId = new Map(blocks.map((block) => [block.id, block]));

    // Isometric, no rotation of its own. The camera looks at the middle of the floor from far enough that every
    // corner is between its planes; what it frames is decided by `setFrame`.
    plan.width = floor.width;
    plan.depth = floor.depth;
    plan.radius = Math.max(1, Math.hypot(floor.width, floor.depth) / 2);
    plan.headroom = tallest + floor.width * HALL_PARTICLES.rise * 0.3;
    camera.near = plan.radius * 0.1;
    camera.far = plan.radius * 8;
    setFrame(true);
    // The order of the intro: the stands nearest to the camera rise first.
    const toward = new THREE.Vector3().subVectors(home.position, home.target).normalize();
    [...blocks]
      .sort((a, b) => (b.center[0] * toward.x + b.center[1] * toward.z) - (a.center[0] * toward.x + a.center[1] * toward.z))
      .forEach((block, index) => (block.order = index));
    labelSizes.clear();
    labelsDirty = true;
  };

  // --- the beams, the rings, the particles -------------------------------------------
  const beamGeometry = stage.track(new THREE.PlaneGeometry(1, 1));
  beamGeometry.translate(0, 0.5, 0);
  const beamMaterial = stage.track(
    new THREE.ShaderMaterial({
      vertexShader: BEAM_VERTEX,
      fragmentShader: BEAM_FRAGMENT,
      uniforms: { uColor: { value: palette.energy }, uGain: { value: 1 }, uOpacity: { value: 1 } },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  const BEAMS = 64;
  const beamStrength = new THREE.InstancedBufferAttribute(new Float32Array(BEAMS), 1);
  beamGeometry.setAttribute("aStrength", beamStrength);
  const beams = stage.track(new THREE.InstancedMesh(beamGeometry, beamMaterial, BEAMS));
  beams.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  beams.frustumCulled = false;
  beams.renderOrder = 5;
  beams.count = 0;
  scene.add(beams);

  const ringGeometry = stage.track(new THREE.RingGeometry(0.8, 1, 48));
  ringGeometry.rotateX(-Math.PI / 2);
  const rings: Ring[] = Array.from({ length: RINGS }, () => {
    const material = stage.track(new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    const mesh = new THREE.Mesh(ringGeometry, material);
    mesh.visible = false;
    mesh.renderOrder = 6;
    scene.add(mesh);
    return { mesh, material, block: null, age: 0 };
  });

  // The ring of a whole hour: a thin ring over the floor (its width grows with it), two pooled meshes, nothing allocated per hour.
  const hourGeometry = stage.track(new THREE.RingGeometry(0.975, 1, 96));
  hourGeometry.rotateX(-Math.PI / 2);
  const hourRings: HourRing[] = Array.from({ length: HOUR_RINGS }, () => {
    const material = stage.track(new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    const mesh = new THREE.Mesh(hourGeometry, material);
    mesh.visible = false;
    mesh.renderOrder = 6;
    scene.add(mesh);
    return { mesh, material, active: false, age: 0 };
  });
  let hourCount = 0;

  const particles = createParticles(stage, { max: 600, ambient: true });
  const composer = createComposer(stage, camera);

  const paint = () => {
    readPalette();
    const additive = dark();
    for (const mesh of floors) (mesh.material as THREE.MeshBasicMaterial).color.copy(palette.floor);
    beamMaterial.blending = additive ? THREE.AdditiveBlending : THREE.NormalBlending;
    beamMaterial.uniforms.uColor.value = palette.energy;
    beamMaterial.uniforms.uGain.value = additive ? (composer.bloom ? 2.2 : RIM_GAIN_PLAIN) : 1;
    beamMaterial.uniforms.uOpacity.value = additive ? 0.9 : 0.8;
    beamMaterial.needsUpdate = true;
    for (const ring of [...rings, ...hourRings]) {
      ring.material.blending = additive ? THREE.AdditiveBlending : THREE.NormalBlending;
      ring.material.color.copy(palette.energy).multiplyScalar(additive && composer.bloom ? 2.4 : 1);
      ring.material.needsUpdate = true;
    }
    // A particle is small: in the dark theme it is lifted over the bloom threshold, or it would be a dull dot.
    palette.spark.copy(palette.energy).multiplyScalar(additive && composer.bloom ? 1.9 : 1);
    // The shade of the sides and the colour of an empty tile are of the theme: every column is written again.
    for (const block of blocks) block.layersKey = "";
    lastMoment = undefined;
    paintEdges();
  };

  const paintEdges = () => {
    const hovered = picker?.hovered ?? null;
    for (const block of blocks) {
      const on = block.id === props.picked;
      block.edges.color.copy(on ? palette.ink : palette.quiet);
      block.edges.opacity = on ? 1 : block.id === hovered ? 0.8 : 0.35;
    }
  };

  // --- what every column shows ---------------------------------------------------------
  const heat = new THREE.Color();
  /** The colour of a top: exactly the colour of the legend, in both themes. */
  const topColor = (level: number, into: THREE.Color) => (level > 0 ? into.set(fairHeatColor(level)) : into.copy(palette.tile));
  /** The rim of a top in the dark theme: the heat colour lifted over the bloom threshold (a lighter line where there is no bloom). */
  const rimColor = (level: number, into: THREE.Color) => {
    into.set(fairHeatColor(level));
    if (!composer.bloom) return into.multiplyScalar(RIM_GAIN_PLAIN);
    into.multiplyScalar(Math.min(RIM_LUMA / Math.max(0.02, luma(into)), RIM_GAIN_MAX));
    const short = RIM_LUMA - luma(into);
    return short > 0 ? into.addScalar(short) : into;
  };

  const writeLayers = (block: Block, layers: readonly HallLayer[] | null, level: number) => {
    const key = layers ? layers.map((layer) => `${layer.hour}:${layer.scans.toFixed(2)}:${layer.level}`).join("|") : `plain:${level.toFixed(3)}`;
    const { uniforms } = block.material;
    uniforms.uShade.value = level > 0 || layers?.length ? (dark() ? 0.5 : 0.72) : 0.9;
    if (key === block.layersKey) return;
    block.layersKey = key;
    const colors = uniforms.uColors.value as Float32Array;
    const bounds = uniforms.uBounds.value as Float32Array;
    const put = (index: number, color: THREE.Color, bound: number) => {
      colors[index * 3] = color.r;
      colors[index * 3 + 1] = color.g;
      colors[index * 3 + 2] = color.b;
      bounds[index] = bound;
    };
    const total = layers ? layers.reduce((sum, layer) => sum + layer.scans, 0) : 0;
    if (!layers || layers.length === 0 || !(total > 0)) {
      put(0, level > 0 ? heat.set(fairHeatColor(level)) : heat.copy(palette.tile), 1);
      uniforms.uCount.value = 1;
      return;
    }
    // More hours than the material holds: the oldest ones share the first layer.
    const extra = Math.max(0, layers.length - LAYERS_MAX);
    let passed = 0;
    for (let index = 0; index < layers.length; index += 1) {
      passed += layers[index].scans;
      const slot = Math.max(0, index - extra);
      put(slot, heat.set(fairHeatColor(layers[index].level)), index === layers.length - 1 ? 1 : passed / total);
    }
    uniforms.uCount.value = Math.min(layers.length, LAYERS_MAX);
  };

  /** The moment of the Vremeplov the scene shows; null = the live picture. */
  const momentNow = () => (props.series && props.player.mode !== "live" ? playerT(props.player, performance.now(), props.series.end, motion) : null);
  let lastMoment: number | null | undefined;
  let lastHour = -1;
  let flash = 0;
  let replay: ReadonlyMap<string, number> = NO_RATES;
  /** The stands of a series by location: built once per series, not on every frame of a replay. */
  let standIndex: { series: HallSeries; byLocation: ReadonlyMap<string, HallStand> } | null = null;
  const standsOf = (series: HallSeries) => {
    if (standIndex?.series !== series) standIndex = { series, byLocation: new Map(series.stands.map((stand) => [stand.locationId, stand])) };
    return standIndex.byLocation;
  };

  /** Where every column is going: the live picture of the floor, or the moment of the day. */
  const aim = (moment: number | null) => {
    const series = props.series;
    const standOf = series ? standsOf(series) : null;
    if (moment === null || !series) {
      replay = NO_RATES;
      for (const item of props.floor.blocks) {
        const block = byId.get(item.locationId);
        if (!block) continue;
        block.to.height = item.height;
        block.to.level = item.level;
        block.to.beam = Math.min(1, (props.ambient.get(block.id) ?? 0) / HALL_PARTICLES.ambientRate);
        const stand = standOf?.get(block.id);
        writeLayers(block, stand && series ? layersAt(series, stand, series.end) : null, item.level);
      }
      return;
    }
    const heights = heightsAt(series, moment);
    // The top is the heat of the day so far (the measure of the live map); the beam is the heat of the running hour.
    const levels = dayLevelsAt(series, moment);
    const hour = levelsAt(series, moment);
    replay = replayRates(series, moment);
    for (const block of blocks) {
      const stand = standOf?.get(block.id);
      block.to.height = heights.get(block.id) ?? 0;
      block.to.level = levels.get(block.id) ?? 0;
      block.to.beam = hour.get(block.id) ?? 0;
      writeLayers(block, stand ? layersAt(series, stand, moment) : null, block.to.level);
    }
  };

  // --- hover and click ---------------------------------------------------------------------
  const picker = props.mini
    ? null
    : createPicker(stage, {
        camera,
        targets: () => blocks.map((block) => block.mesh),
        // A flat tile (a stand without a scan, height 0) is no stand: the ray goes on to a column behind it, and with
        // none behind it the click is a click beside every stand — it closes the picked one, as the floor does.
        idOf: (hits) => {
          const hit = hits.find((item) => (byId.get(item.object.userData.locationId as string)?.to.height ?? 0) > 0);
          return (hit?.object.userData.locationId as string | undefined) ?? NO_STAND;
        },
        onHover: (id) => {
          stage.canvas.style.cursor = id && id !== NO_STAND ? "pointer" : "grab";
          paintEdges();
          stage.invalidate();
        },
        onPick: (id) => props.onPick(id === NO_STAND ? null : id),
      });

  // --- the intro -------------------------------------------------------------------------------
  let intro: "full" | "short" | "none" = motion ? run.intro : "none";
  /** When the intro started, on the wall clock (s): a slow device draws fewer frames of it, it does not make it longer. */
  let introAt = -1;
  const introElapsed = () => (introAt < 0 ? 0 : performance.now() / 1000 - introAt);
  /** The intro waits until at least half of the hall is on the screen: it is played for someone who sees it. */
  let onScreen = intro === "none";
  const watcher = onScreen
    ? null
    : new IntersectionObserver(
        (entries) => {
          const entry = entries[entries.length - 1];
          if (!entry || (entry.intersectionRatio < 0.5 && entry.intersectionRect.height < (entry.rootBounds?.height ?? Infinity) * 0.5)) return;
          onScreen = true;
          watcher?.disconnect();
          stage.invalidate();
        },
        { threshold: [0, 0.5, 1] },
      );
  watcher?.observe(stage.host);
  /** How many columns rise in the intro. */
  let rising = 1;
  /** The columns rise in the order of their distance from the camera: only the stands with a scan take a turn. */
  const takeTurns = () => {
    const withScans = blocks.filter((block) => block.to.height > 0).sort((a, b) => a.order - b.order);
    withScans.forEach((block, index) => (block.turn = index));
    rising = Math.max(1, withScans.length);
  };
  /** 0–1 per column while an intro runs; 1 after it. */
  const grown = (block: Block) => {
    if (intro === "none") return 1;
    return intro === "full" ? introGrow(introElapsed(), block.turn, rising) : shortGrow(introElapsed());
  };
  const placeIntroCamera = () => {
    const { azimuth, zoom } = introCamera(introElapsed());
    offset.subVectors(home.position, home.target).applyAxisAngle(UP, azimuth);
    camera.position.copy(home.target).add(offset);
    camera.zoom = zoom;
    camera.lookAt(home.target);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  };
  const endIntro = () => {
    if (intro === "none") return;
    const cameraMoved = intro === "full";
    intro = "none";
    stage.canvas.removeEventListener("pointerdown", endIntro, true);
    window.removeEventListener("keydown", endIntro);
    if (cameraMoved) {
      camera.position.copy(home.position);
      camera.zoom = 1;
      camera.lookAt(home.target);
      camera.updateProjectionMatrix();
    }
    if (controls) {
      controls.enabled = true;
      controls.update();
    }
    labelsDirty = true;
    stage.invalidate();
  };
  if (intro !== "none") {
    // Any input skips it: the press that skips it already turns the hall.
    stage.canvas.addEventListener("pointerdown", endIntro, true);
    window.addEventListener("keydown", endIntro);
    if (controls && intro === "full") controls.enabled = false;
  }
  const onControls = () => {
    labelsDirty = true;
    stage.invalidate();
  };
  controls?.addEventListener("change", onControls);

  // --- the labels (DOM over the scene) ---------------------------------------------------------
  const point = new THREE.Vector3();
  const placeLabels = () => {
    labelsDirty = false;
    const overlay = stage.host.parentElement;
    if (!overlay || props.mini) return;
    const { width, height } = stage.size;
    // Text never rides on a moving column: while the intro or a replay runs the labels wait.
    const still = intro === "none" && props.player.mode !== "playing";
    if (time - sizesAt > 0.25) {
      sizesAt = time;
      labelSizes.clear();
    }
    const visible: { label: HTMLElement; x: number; y: number; width: number; height: number }[] = [];
    for (const block of blocks) {
      const label = overlay.querySelector<HTMLElement>(`[data-block-label="${block.id}"]`);
      if (!label) continue;
      point.set(block.center[0], worldHeight(block.shown.height), block.center[1]).project(camera);
      const on = still && block.to.height > 0 && Math.abs(point.x) <= 1 && Math.abs(point.y) <= 1;
      label.style.opacity = on ? "1" : "0";
      if (!on) continue;
      let size = labelSizes.get(label);
      if (!size) {
        size = { width: label.offsetWidth, height: label.offsetHeight };
        labelSizes.set(label, size);
      }
      visible.push({ label, x: ((point.x + 1) / 2) * width, y: ((1 - point.y) / 2) * height, ...size });
    }
    // Neighbouring labels meet on a narrow canvas: the one further back moves up above the nearer one.
    const liftedTo = liftLabels(visible);
    visible.forEach((item, index) => {
      item.label.style.transform = `translate(${item.x}px, ${liftedTo[index]}px) translate(-50%, -100%)`;
    });
  };

  // --- bursts ---------------------------------------------------------------------------------------
  const topOf = (block: Block, into: THREE.Vector3) => into.set(block.center[0], worldHeight(block.shown.height), block.center[1]);
  const rise = () => (props.floor.width * HALL_PARTICLES.rise) / HALL_PARTICLES.lifeS;
  // The specs of the particles are reused: `emit` copies them into its buffers as it takes them, and keeps nothing.
  const sparkPool: Spark[] = Array.from({ length: Math.max(HALL_PARTICLES.perStandMax, HALL_PARTICLES.burstMax) }, () => ({
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    life: HALL_PARTICLES.lifeS,
    size: 7,
    color: palette.spark,
    delay: 0,
  }));
  const sparkBatch: Spark[] = [];
  /** Sends `count` particles up from the top of a stand; `delays` (seconds from now) default to all at once. */
  const sendSparks = (block: Block, count: number, delays?: readonly number[]) => {
    sparkBatch.length = 0;
    for (let index = 0; index < Math.min(count, sparkPool.length); index += 1) {
      const spec = sparkPool[index];
      topOf(block, spec.position);
      spec.position.x += (Math.random() - 0.5) * block.spread[0];
      spec.position.z += (Math.random() - 0.5) * block.spread[1];
      spec.velocity.set(0, rise() * (0.8 + 0.4 * Math.random()), 0);
      spec.delay = delays?.[index] ?? 0;
      sparkBatch.push(spec);
    }
    particles.emit(sparkBatch);
  };
  let bursts = 0;
  const burst = (impulses: readonly HallImpulse[]) => {
    if (!motion) return;
    bursts += 1;
    for (const impulse of impulses) {
      const block = byId.get(impulse.locationId);
      if (!block) continue;
      const delays = impulseDelays(impulse.count);
      sendSparks(block, delays.length, delays);
      block.ring = 1;
      const ring = rings.find((item) => !item.block) ?? rings.reduce((oldest, item) => (item.age > oldest.age ? item : oldest));
      ring.block = block;
      ring.age = 0;
    }
    stage.invalidate();
  };

  /** The replay crossed a whole hour: a ring goes out over the floor from the middle of the framed stands. */
  const startHourRing = () => {
    const ring = hourRings.find((item) => !item.active) ?? hourRings.reduce((oldest, item) => (item.age > oldest.age ? item : oldest));
    ring.active = true;
    ring.age = 0;
    hourCount += 1;
  };

  // --- a frame ------------------------------------------------------------------------------------------
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const facing = new THREE.Vector3();

  const offFrame = stage.onFrame((delta, now) => {
    time = now;
    let moving = false;

    if (intro !== "none" && onScreen) {
      if (introAt < 0) {
        introAt = performance.now() / 1000;
        takeTurns();
      }
      const length = intro === "full" ? HALL_MOTION.intro.camera : HALL_MOTION.short;
      if (introElapsed() >= length) endIntro();
      else {
        if (intro === "full") placeIntroCamera();
        moving = true;
      }
    }

    // The moment of the Vremeplov: a replay moves it every frame, a pause and the live picture only when they change.
    const moment = momentNow();
    const playing = props.player.mode === "playing";
    if (moment !== lastMoment || playing) {
      if (playing && moment !== null) {
        const hour = Math.floor(moment);
        if (hour !== lastHour && lastHour >= 0 && motion) {
          flash = 1;
          startHourRing();
        }
        lastHour = hour;
      } else lastHour = -1;
      lastMoment = moment;
      aim(moment);
      labelsDirty = true;
    }

    const worldPerPx = (camera.top - camera.bottom) / camera.zoom / Math.max(1, stage.size.height);
    if (flash > 0) {
      flash = Math.max(0, flash - delta / HALL_MOTION.flash);
      moving = true;
    }
    let beamCount = 0;
    camera.getWorldDirection(facing);
    quaternion.setFromAxisAngle(UP, Math.atan2(-facing.x, -facing.z));
    for (const block of blocks) {
      const { shown, to } = block;
      // A replay is the motion itself; a jump of the slider or a poll settles inside the interaction layer.
      const direct = !motion || playing;
      for (const key of SHOWN_KEYS) {
        if (shown[key] === to[key]) continue;
        shown[key] = direct ? to[key] : approach(shown[key], to[key], delta, HALL_MOTION.settle);
        if (Math.abs(shown[key] - to[key]) < 0.002) shown[key] = to[key];
        else moving = true;
        labelsDirty = true;
      }
      const high = worldHeight(shown.height) * (shown.height > 0 ? Math.max(0.001, grown(block)) : 1);
      block.mesh.scale.y = Math.max(tile, high);
      const { uniforms } = block.material;
      topColor(shown.level, uniforms.uTop.value as THREE.Color);
      // The rim is the light of the dark theme; a flat tile and the light theme have none. The picked stand wears
      // it in ink in both themes: a 1 px edge line alone is hard to see on a tall column.
      const isPicked = block.id === props.picked;
      const lit = dark() && shown.level > 0 && shown.height > 0;
      block.rim.visible = isPicked || lit;
      if (isPicked) block.rimMaterial.color.copy(palette.ink);
      else if (lit) rimColor(shown.level, block.rimMaterial.color).multiplyScalar(1 + 0.6 * flash);
      uniforms.uFlash.value = flash;
      uniforms.uLine.value = Math.min(0.08, (worldPerPx * 1.6) / Math.max(tile, high));

      if (block.ring > 0) block.ring = Math.max(0, block.ring - delta / HALL_MOTION.ring);
      const strength = Math.min(1, shown.beam + block.ring) * (intro === "none" ? 1 : 0);
      if (strength > 0.01 && beamCount < BEAMS && shown.height > 0) {
        scale.set(props.floor.width * 0.03, props.floor.width * (0.06 + 0.12 * shown.beam + 0.05 * block.ring), 1);
        matrix.compose(point.set(block.center[0], high, block.center[1]), quaternion, scale);
        beams.setMatrixAt(beamCount, matrix);
        beamStrength.setX(beamCount, strength);
        beamCount += 1;
      }

      // The calm state and the replay: particles rise in proportion to what happens on the stand.
      if (motion && intro === "none" && shown.height > 0) {
        const rate = playing ? replay.get(block.id) ?? 0 : props.player.mode === "live" ? props.ambient.get(block.id) ?? 0 : 0;
        if (rate > 0) {
          const next = emitCount(rate, block.carry, delta);
          block.carry = next.carry;
          if (next.count > 0) sendSparks(block, next.count);
        }
      }
    }
    beams.count = beamCount;
    beams.instanceMatrix.needsUpdate = true;
    beamStrength.needsUpdate = true;

    for (const ring of rings) {
      if (!ring.block) continue;
      ring.age += delta;
      const k = ring.age / HALL_MOTION.ring;
      if (k >= 1) {
        ring.block = null;
        ring.mesh.visible = false;
        continue;
      }
      const radius = Math.max(ring.block.spread[0], ring.block.spread[1]) * (0.5 + 0.9 * k);
      topOf(ring.block, ring.mesh.position).y += tile;
      ring.mesh.scale.set(radius, 1, radius);
      // Added light fades fast; painted on a light surface the ring has to stay readable for most of its life.
      ring.material.opacity = dark() ? (1 - k) * (1 - k) : (1 - k) * 0.9;
      ring.mesh.visible = true;
      moving = true;
    }

    for (const ring of hourRings) {
      if (!ring.active) continue;
      ring.age += delta;
      const at = hourRingAt(ring.age);
      if (!at) {
        ring.active = false;
        ring.mesh.visible = false;
        continue;
      }
      // It grows past the frame, so the whole picture is swept; a hair above the flat tiles of the empty stands.
      const radius = Math.max(tile, framed.reach * 1.2 * at.reach);
      ring.mesh.position.set(framed.x, tile * 2, framed.z);
      ring.mesh.scale.set(radius, 1, radius);
      ring.material.opacity = dark() ? at.additive : at.painted;
      ring.mesh.visible = true;
      moving = true;
    }

    if (labelsDirty) placeLabels();
    if (DEV) {
      // What the frames script of the step reads (dev only).
      const state = stage.host.dataset;
      state.hallIntro = intro;
      state.hallMoment = moment === null ? "live" : moment.toFixed(3);
      state.hallParticles = String(particles.alive());
      state.hallBursts = String(bursts);
      state.hallHours = String(hourCount);
      state.hallFrame = frameKey;
      state.hallCamera = camera.position.toArray().map((value) => value.toFixed(1)).join(",");
      state.hallView = `${(camera.right - camera.left).toFixed(1)}x${(camera.top - camera.bottom).toFixed(1)}`;
      state.hallZoom = camera.zoom.toFixed(3);
      state.hallHeight = Math.max(0, ...blocks.map((block) => (block.shown.height > 0 ? block.shown.height * grown(block) : 0))).toFixed(3);
      const up = blocks.filter((block) => block.shown.height > 0);
      state.hallRisen = (up.reduce((sum, block) => sum + grown(block), 0) / Math.max(1, up.length)).toFixed(3);
    }
    // Motion a person started (the intro, a seek, a burst) is drawn every frame; what only breathes keeps the 30 fps of the kit.
    if (moving) stage.invalidate();
    stage.setAmbient(motion && (playing || particles.alive() > 0 || hasAmbient()));
  });

  const hasAmbient = () => props.player.mode === "live" && props.ambient.size > 0;

  const offResize = stage.onResize(() => {
    fit();
    limitZoom();
    labelSizes.clear();
    labelsDirty = true;
  });
  const offTheme = stage.onTheme(() => paint());
  const offQuality = stage.onQuality(() => paint());

  const dispose = () => {
    disposed = true;
    offFrame();
    offResize();
    offTheme();
    offQuality();
    watcher?.disconnect();
    stage.canvas.removeEventListener("wheel", onWheel, true);
    stage.canvas.removeEventListener("pointerdown", endIntro, true);
    window.removeEventListener("keydown", endIntro);
    controls?.removeEventListener("change", onControls);
    controls?.dispose();
    picker?.dispose();
    particles.dispose();
    composer.dispose();
    clear();
    scene.remove(root, beams, ...rings.map((ring) => ring.mesh), ...hourRings.map((ring) => ring.mesh));
    stage.canvas.style.cursor = "";
  };

  try {
    build(initial.floor);
    paint();
    aim(momentNow());
    for (const block of blocks) {
      Object.assign(block.shown, block.to);
      block.mesh.scale.y = intro === "none" ? worldHeight(block.shown.height) : tile;
    }
    if (intro === "full") placeIntroCamera();
    stage.setAmbient(motion && hasAmbient());
  } catch (error) {
    // The kit shows the 2D picture instead; nothing of this scene may stay behind (a listener on the window, an observer).
    dispose();
    throw error;
  }

  return {
    update(next) {
      if (disposed) return;
      const previous = props;
      props = next;
      if (floorKey(next.floor) !== builtKey) {
        // Another floor plan (a day brought a zone the hall did not show): the columns are built again and stand
        // at once where they were going, they do not rise a second time; a ring of the old plan has nothing to ride on.
        build(next.floor);
        paint();
        aim(momentNow());
        for (const block of blocks) Object.assign(block.shown, block.to);
        for (const ring of rings) {
          ring.block = null;
          ring.mesh.visible = false;
        }
        if (introAt >= 0) takeTurns();
        lastMoment = undefined;
      } else if ((next.floor !== previous.floor || next.series !== previous.series) && framedStands(next).join("|") !== frameKey) {
        // The stands with something to show changed (the first scan of a stand, a day with another set, the measure
        // of the map): the home view is fitted again; a camera that someone has orbited stays where it is.
        setFrame(false);
        labelsDirty = true;
      }
      if (next.floor !== previous.floor || next.series !== previous.series || next.ambient !== previous.ambient || next.player !== previous.player) {
        lastMoment = undefined;
        for (const block of blocks) block.layersKey = "";
      }
      if (next.picked !== previous.picked) paintEdges();
      // News of the live hall only: a day that is being replayed has no „now“.
      if (next.impulses !== previous.impulses && next.impulses.length && next.player.mode === "live") burst(next.impulses);
      if (next.resetKey !== previous.resetKey && controls) {
        endIntro();
        controls.reset();
      }
      labelsDirty = true;
      stage.invalidate();
    },
    project(id) {
      const block = byId.get(id);
      if (!block) return null;
      const { width, height } = stage.size;
      topOf(block, point).project(camera);
      return { x: ((point.x + 1) / 2) * width, y: ((1 - point.y) / 2) * height };
    },
    dispose,
  };
}
