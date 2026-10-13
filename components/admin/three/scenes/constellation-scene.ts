import * as THREE from "three";
import { BACKLOG_TOKEN, CORE_TOKEN, ORBIT_LINE_TOKEN, STAR_TOKENS, type TokenColor } from "@/lib/admin-v2/constellation/colors";
import { constellationDiff } from "@/lib/admin-v2/constellation/diff";
import { BACKLOG_RADIUS, CONSTELLATION_TILT_DEG, CORE_RADIUS, FLAT_VIEW, ORBIT_PERIOD_S, ORBIT_RADIUS, STAR_RADIUS } from "@/lib/admin-v2/constellation/geometry";
import { CONSTELLATION_MOTION as M, angleDelta, arrivalRadius, backOut, introStarStart, powerInOut, powerOut, spiralPoint } from "@/lib/admin-v2/constellation/motion";
import { CALM_DOTS_MAX } from "@/lib/admin-v2/constellation/layout";
import type { ConstellationLayout, OrbitIndex, Star, StarTone } from "@/lib/admin-v2/constellation/types";
import { blendMode } from "@/lib/admin-v2/three/theme";
import type { StageRun, StageScene } from "../admin-stage";
import { createParticles } from "../particles";
import { createPicker } from "../picking";
import { createComposer } from "../post";
import type { Stage } from "../stage";

// ADMIN v3 V2 — the Constellation (ZADATAK-V3 §3.1), the hero of the Dashboard.
// The ScanMe core in the middle; every open item of „Za reakciju“ is a star.
// The distance from the core is the urgency (orbit 1 „Hitno“ pulses), the size
// is the wait, the colour is the signal of the orbit; the unnamed calm items
// are the belt of dots on the outer orbit and the backlog of the day is the
// ring around the core. The layout is the pure `orbitLayout`; this file only
// draws it: one instanced mesh for all the stars, one `Points` for the belt,
// one for the particles. A resolved item spirals out to the calm orbit with a
// trail, a new one falls into its orbit. With reduced motion and in the quiet
// mode nothing turns and nothing pulses: the same picture, still.

export type ConstellationSceneProps = {
  layout: ConstellationLayout;
  /** `counts.total`; null when the totals are not available. */
  total: number | null;
  /** The star aimed at from its row of the list. */
  aimed: string | null;
  onHover: (id: string | null) => void;
  onPick: (id: string) => void;
};

type Body = {
  id: string;
  star: Star;
  /** Offsets from the place on the orbit; a move brings them to 0. */
  dr: number;
  da: number;
  /** A star that left its orbit for good flies on its own. */
  free: { radius: number; angle: number } | null;
  scale: number;
  alpha: number;
  hover: number;
  /** The ring of a star that has just arrived (1 → 0). */
  ring: number;
  /** 0 = the colour of its tone, 1 = the calm green (a resolved star on its way out). */
  calm: number;
  phase: number;
};

type Tween = { key: string | null; at: number; duration: number; step: (k: number) => void; done?: () => void };
type Palette = Record<StarTone, THREE.Color> & { core: THREE.Color; backlog: THREE.Color; line: THREE.Color; ink: THREE.Color };

const TAU = Math.PI * 2;
const ORBITS: OrbitIndex[] = [1, 2, 3, 4];
/** The disc of a star as a share of its quad; the rest of the quad is the halo (and the hit area). */
const DISC = 0.38;
const STAR_CAPACITY = 48;
/** The most stars on their way out at once. */
const LEAVING_MAX = 12;
const ORBIT_SEGMENTS = 128;
/** How much brighter than its token a colour is drawn in the dark theme: above 1 it reaches the bloom. */
const GAIN: Record<StarTone, number> = { danger: 1.9, warning: 1.6, neutral: 1, success: 1.2 };
/** Without the bloom pass (the low quality) a lifted colour only washes out: it is lifted this much at most. */
const GAIN_PLAIN = 1.12;
const LINE_OPACITY = { rest: 0.32, on: 0.7 };

const STAR_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uPulse;
  uniform float uBeat;
  attribute vec3 aColor;
  attribute vec4 aParams;
  attribute vec2 aShape;
  varying vec2 vUv;
  varying vec3 vColor;
  varying vec4 vParams;
  varying vec2 vShape;
  varying float vBeat;
  void main() {
    vUv = uv;
    vColor = aColor;
    vParams = aParams;
    vShape = aShape;
    vBeat = (0.5 + 0.5 * sin(uTime * uBeat + aParams.x)) * aParams.y * uPulse;
    float grow = 1.0 + 0.1 * vBeat + ${(M.hoverScale - 1).toFixed(2)} * aParams.w;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position * grow, 1.0);
  }
`;

// aShape.x: 0 a star (disc), 1 the „+N“ star (a ring with a plus), 2 the glow of the core. aShape.y: the gain of the body.
// aParams: x phase of the pulse, y strength of the pulse, z opacity, w hover (0–1).
const STAR_FRAGMENT = /* glsl */ `
  uniform float uDark;
  uniform vec3 uInk;
  varying vec2 vUv;
  varying vec3 vColor;
  varying vec4 vParams;
  varying vec2 vShape;
  varying float vBeat;
  const float DISC = ${DISC.toFixed(2)};
  void main() {
    vec2 q = vUv * 2.0 - 1.0;
    float d = length(q);
    float disc = 1.0 - smoothstep(DISC - 0.05, DISC, d);
    float ring = smoothstep(DISC - 0.12, DISC - 0.08, d) * (1.0 - smoothstep(DISC - 0.02, DISC + 0.02, d));
    float plus = max(
      (1.0 - step(0.045, abs(q.x))) * (1.0 - step(0.16, abs(q.y))),
      (1.0 - step(0.045, abs(q.y))) * (1.0 - step(0.16, abs(q.x)))
    );
    float isMore = step(0.5, vShape.x) * (1.0 - step(1.5, vShape.x));
    float isGlow = step(1.5, vShape.x);
    float body = mix(disc, max(ring, plus), isMore) * (1.0 - isGlow);
    float halo = pow(max(0.0, 1.0 - d), mix(2.4, 1.5, isGlow));
    float aim = smoothstep(0.78, 0.82, d) * (1.0 - smoothstep(0.88, 0.92, d)) * vParams.w;
    float light = halo * mix(0.42 + 0.75 * vBeat, 1.0, isGlow);

    // The centre of a disc is the hottest: the rim keeps the colour of the star.
    float heat = mix(1.0, vShape.y, 1.0 - smoothstep(0.0, DISC, d));
    vec3 darkColor = vColor * (body * heat + light * 0.9 * (1.0 - body)) + uInk * aim;
    float darkAlpha = vParams.z;

    float paint = max(body, halo * mix(0.2 + 0.3 * vBeat, 0.3, isGlow));
    vec3 lightColor = mix(vColor, uInk, aim);
    float lightAlpha = max(paint, aim * 0.85) * vParams.z;

    gl_FragColor = vec4(mix(lightColor, darkColor, uDark), mix(lightAlpha, darkAlpha, uDark));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const CORE_VERTEX = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vec4 view = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = normalize(-view.xyz);
    gl_Position = projectionMatrix * view;
  }
`;

// A fresnel rim: in the dark theme the edge of the core is the brightest thing of the scene.
const CORE_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uDark;
  uniform float uPower;
  uniform float uRim;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    float facing = max(dot(normalize(vNormal), normalize(vView)), 0.0);
    float rim = pow(1.0 - facing, 2.2);
    vec3 darkColor = uColor * (0.5 + 0.35 * facing + uRim * rim) * uPower;
    vec3 lightColor = uColor * (0.8 + 0.24 * facing) + vec3(0.14) * rim;
    gl_FragColor = vec4(mix(lightColor, darkColor, uDark), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const RING_VERTEX = /* glsl */ `
  varying float vTurn;
  void main() {
    vTurn = fract(atan(position.z, position.x) / 6.28318530718);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// The lit part of the ring is the share of the backlog that is still open; the rest is its faint track.
const RING_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uArc;
  uniform float uGain;
  uniform float uOpacity;
  varying float vTurn;
  void main() {
    float lit = 1.0 - smoothstep(uArc - 0.004, uArc + 0.004, vTurn);
    lit *= step(0.0005, uArc);
    gl_FragColor = vec4(uColor * mix(1.0, uGain, lit), mix(0.16, 1.0, lit) * uOpacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const DOT_VERTEX = /* glsl */ `
  uniform float uSize;
  void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = uSize;
  }
`;

const DOT_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    gl_FragColor = vec4(uColor, (1.0 - smoothstep(0.55, 1.0, d)) * uOpacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function create(stage: Stage, initial: ConstellationSceneProps, run: StageRun): StageScene<ConstellationSceneProps> {
  const { scene } = stage;
  const motion = run.motion;
  let props = initial;
  let layout: ConstellationLayout | null = null;
  let total: number | null = null;
  let time = 0;
  let disposed = false;

  // --- colours ----------------------------------------------------------------
  const read = (token: TokenColor) => stage.token(token.token, token[stage.theme]);
  const palette = {} as Palette;
  const readPalette = () => {
    for (const tone of Object.keys(STAR_TOKENS) as StarTone[]) palette[tone] = read(STAR_TOKENS[tone]);
    palette.core = read(CORE_TOKEN);
    palette.backlog = read(BACKLOG_TOKEN);
    palette.line = read(ORBIT_LINE_TOKEN);
    palette.ink = stage.token("--admin-text", stage.theme === "dark" ? "#f2f4ee" : "#171918");
  };
  readPalette();
  const dark = () => blendMode(stage.theme) === "additive";

  // --- the camera -------------------------------------------------------------
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 80);
  const tilt = THREE.MathUtils.degToRad(CONSTELLATION_TILT_DEG);
  const target = new THREE.Vector3();
  let distance = 4;
  /** The camera leans after the cursor: where it is and where it goes (−1…1). */
  const lean = { x: 0, y: 0, toX: 0, toY: 0 };
  const rim = Array.from({ length: 48 }, (_, index) => {
    const angle = (index / 48) * TAU;
    return new THREE.Vector3(Math.cos(angle) * FLAT_VIEW.halfWidth, 0, Math.sin(angle) * FLAT_VIEW.halfWidth);
  });
  const probe = new THREE.Vector3();

  const placeCamera = () => {
    const azimuth = lean.x * THREE.MathUtils.degToRad(M.parallaxDeg);
    const elevation = tilt - lean.y * THREE.MathUtils.degToRad(M.parallaxDeg / 2);
    camera.position.set(Math.sin(elevation) * Math.sin(azimuth), Math.cos(elevation), Math.sin(elevation) * Math.cos(azimuth)).multiplyScalar(distance).add(target);
    camera.lookAt(target);
    camera.updateMatrixWorld();
  };
  const bounds = () => {
    placeCamera();
    let x = 0;
    let top = -Infinity;
    let bottom = Infinity;
    for (const point of rim) {
      probe.copy(point).project(camera);
      x = Math.max(x, Math.abs(probe.x));
      top = Math.max(top, probe.y);
      bottom = Math.min(bottom, probe.y);
    }
    return { x, top, bottom };
  };
  /** The whole system fits the host, centred, with room above and below for the halo of a star. */
  const fitCamera = () => {
    const { width, height } = stage.size;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    const kept = { x: lean.x, y: lean.y };
    lean.x = 0;
    lean.y = 0;
    target.set(0, 0, 0);
    for (let round = 0; round < 3; round += 1) {
      let near = 1;
      let far = 40;
      for (let step = 0; step < 18; step += 1) {
        distance = (near + far) / 2;
        const box = bounds();
        if (box.x <= 0.97 && box.top <= 0.9 && box.bottom >= -0.9) far = distance;
        else near = distance;
      }
      distance = far;
      // Perspective makes the near half of the system taller: look a little in front of the core.
      let back = -0.6;
      let front = 0.6;
      for (let step = 0; step < 14; step += 1) {
        target.z = (back + front) / 2;
        const box = bounds();
        if (box.top + box.bottom > 0) front = target.z;
        else back = target.z;
      }
    }
    lean.x = kept.x;
    lean.y = kept.y;
    placeCamera();
  };
  stage.setCamera(camera);

  // --- the orbits -------------------------------------------------------------
  const orbitLines = ORBITS.map((orbit) => {
    const points: number[] = [];
    for (let index = 0; index <= ORBIT_SEGMENTS; index += 1) {
      const angle = (index / ORBIT_SEGMENTS) * TAU;
      points.push(Math.cos(angle) * ORBIT_RADIUS[orbit], 0, Math.sin(angle) * ORBIT_RADIUS[orbit]);
    }
    const geometry = stage.track(new THREE.BufferGeometry());
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    const material = stage.track(
      orbit === 4
        ? new THREE.LineDashedMaterial({ transparent: true, opacity: LINE_OPACITY.rest, depthTest: false, depthWrite: false, dashSize: 0.028, gapSize: 0.04 })
        : new THREE.LineBasicMaterial({ transparent: true, opacity: LINE_OPACITY.rest, depthTest: false, depthWrite: false }),
    );
    const line = new THREE.Line(geometry, material);
    if (orbit === 4) line.computeLineDistances();
    line.renderOrder = 0;
    line.frustumCulled = false;
    scene.add(line);
    return { orbit, geometry, material, line, opacity: LINE_OPACITY.rest };
  });
  const drawOrbits = (share: number) => {
    for (const { geometry } of orbitLines) geometry.setDrawRange(0, Math.max(2, Math.round((ORBIT_SEGMENTS + 1) * share)));
  };

  // --- the ring of the backlog -------------------------------------------------
  const ringGeometry = stage.track(new THREE.RingGeometry(BACKLOG_RADIUS - 0.011, BACKLOG_RADIUS + 0.011, 96, 1));
  ringGeometry.rotateX(-Math.PI / 2);
  const ringMaterial = stage.track(
    new THREE.ShaderMaterial({
      vertexShader: RING_VERTEX,
      fragmentShader: RING_FRAGMENT,
      uniforms: { uColor: { value: palette.backlog }, uArc: { value: 0 }, uGain: { value: 1 }, uOpacity: { value: 1 } },
      transparent: true,
      // The far half of the ring is behind the core.
      depthTest: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  const ring = new THREE.Mesh(ringGeometry, ringMaterial);
  ring.renderOrder = 2;
  ring.visible = false;
  scene.add(ring);
  /** A hit on the ring: it flares when the backlog falls. */
  let ringFlare = 0;

  // --- the core ----------------------------------------------------------------
  const coreGeometry = stage.track(new THREE.SphereGeometry(CORE_RADIUS * 0.8, 40, 24));
  const coreMaterial = stage.track(
    new THREE.ShaderMaterial({
      vertexShader: CORE_VERTEX,
      fragmentShader: CORE_FRAGMENT,
      uniforms: { uColor: { value: palette.core }, uDark: { value: 0 }, uPower: { value: 1 }, uRim: { value: 1 } },
    }),
  );
  const core = new THREE.Mesh(coreGeometry, coreMaterial);
  core.renderOrder = 1;
  scene.add(core);
  /** 0–1: how lit the core is (its intro), how busy the system is (`--admin-energy`), a flash for a resolved item. */
  const coreState = { lit: 1, energy: 0, energyTo: 0, flash: 0, energyReadAt: -10 };

  // --- the belt of calm dots ---------------------------------------------------
  const dotGeometry = stage.track(new THREE.BufferGeometry());
  // One buffer for the whole life of the scene: a new attribute on every read would leave its old buffer on the GPU.
  const dotPosition = new THREE.BufferAttribute(new Float32Array(CALM_DOTS_MAX * 3), 3);
  dotGeometry.setAttribute("position", dotPosition);
  dotGeometry.setDrawRange(0, 0);
  const dotMaterial = stage.track(
    new THREE.ShaderMaterial({
      vertexShader: DOT_VERTEX,
      fragmentShader: DOT_FRAGMENT,
      uniforms: { uColor: { value: palette.success }, uOpacity: { value: 0.6 }, uSize: { value: 4 } },
      transparent: true,
      depthTest: false,
      depthWrite: false,
    }),
  );
  const dots = new THREE.Points(dotGeometry, dotMaterial);
  dots.renderOrder = 3;
  dots.frustumCulled = false;
  scene.add(dots);
  let dotsShown = 1;

  // --- the stars ---------------------------------------------------------------
  const starGeometry = stage.track(new THREE.PlaneGeometry(1, 1));
  const starColor = new THREE.InstancedBufferAttribute(new Float32Array(STAR_CAPACITY * 3), 3);
  const starParams = new THREE.InstancedBufferAttribute(new Float32Array(STAR_CAPACITY * 4), 4);
  const starShape = new THREE.InstancedBufferAttribute(new Float32Array(STAR_CAPACITY * 2), 2);
  starGeometry.setAttribute("aColor", starColor);
  starGeometry.setAttribute("aParams", starParams);
  starGeometry.setAttribute("aShape", starShape);
  const starMaterial = stage.track(
    new THREE.ShaderMaterial({
      vertexShader: STAR_VERTEX,
      fragmentShader: STAR_FRAGMENT,
      uniforms: { uTime: { value: 0 }, uPulse: { value: motion ? 1 : 0 }, uBeat: { value: TAU / M.pulsePeriod }, uDark: { value: 0 }, uInk: { value: palette.ink } },
      transparent: true,
      depthTest: false,
      depthWrite: false,
    }),
  );
  const stars = new THREE.InstancedMesh(starGeometry, starMaterial, STAR_CAPACITY);
  stars.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  stars.renderOrder = 4;
  stars.frustumCulled = false;
  stars.count = 0;
  scene.add(stars);
  stage.track(stars);

  const bodies = new Map<string, Body>();
  /** Stars on their way out: drawn, never picked. */
  const leaving: Body[] = [];
  /** The id of every drawn instance (null: the glow of the core and the stars on their way out). */
  let instanceIds: Array<string | null> = [];
  const spin: Record<OrbitIndex, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };

  const particles = createParticles(stage, { max: 600 });
  const composer = createComposer(stage, camera);

  const paint = () => {
    readPalette();
    const additive = dark();
    const blending = additive ? THREE.AdditiveBlending : THREE.NormalBlending;
    starMaterial.uniforms.uDark.value = additive ? 1 : 0;
    starMaterial.uniforms.uInk.value = palette.ink;
    starMaterial.blending = blending;
    starMaterial.needsUpdate = true;
    coreMaterial.uniforms.uDark.value = additive ? 1 : 0;
    coreMaterial.uniforms.uColor.value = palette.core;
    ringMaterial.uniforms.uColor.value = palette.backlog;
    ringMaterial.blending = blending;
    ringMaterial.needsUpdate = true;
    dotMaterial.uniforms.uColor.value = palette.success;
    dotMaterial.blending = blending;
    dotMaterial.needsUpdate = true;
    for (const { material } of orbitLines) material.color.copy(palette.line);
  };
  paint();

  // --- tweens (the time of the stage: they stand while the scene is not drawn) --
  const tweens: Tween[] = [];
  const tween = (options: { key?: string; delay?: number; duration: number; step: (k: number) => void; done?: () => void }) => {
    if (options.key) {
      const at = tweens.findIndex((item) => item.key === options.key);
      if (at >= 0) tweens.splice(at, 1);
    }
    if (!motion || options.duration <= 0) {
      options.step(1);
      options.done?.();
      return;
    }
    options.step(0);
    tweens.push({ key: options.key ?? null, at: time + (options.delay ?? 0), duration: options.duration, step: options.step, done: options.done });
    stage.invalidate();
  };
  const runTweens = () => {
    for (const item of [...tweens]) {
      if (time < item.at) continue;
      const k = Math.min(1, (time - item.at) / item.duration);
      item.step(k);
      if (k < 1) continue;
      const at = tweens.indexOf(item);
      if (at >= 0) tweens.splice(at, 1);
      item.done?.();
    }
  };

  // --- where a star is -----------------------------------------------------------
  const placeOf = (body: Body) => body.free ?? { radius: ORBIT_RADIUS[body.star.orbit] + body.dr, angle: body.star.angle + spin[body.star.orbit] + body.da };
  const worldOf = (body: Body, into: THREE.Vector3) => {
    const place = placeOf(body);
    return into.set(Math.cos(place.angle) * place.radius, 0, Math.sin(place.angle) * place.radius);
  };

  const newBody = (star: Star): Body => ({ id: star.id, star, dr: 0, da: 0, free: null, scale: 1, alpha: 1, hover: 0, ring: 0, calm: 0, phase: (star.angle * 7) % TAU });

  /** The star that is looked at; one that has left since (the pointer did not move) no longer counts. */
  const highlighted = () => [picker.hovered, props.aimed].find((id) => id !== null && bodies.has(id)) ?? null;

  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  const colour = new THREE.Color();

  const writeStars = () => {
    const additive = dark();
    instanceIds = [];
    let at = 0;
    const put = (id: string | null, where: THREE.Vector3, side: number, tint: THREE.Color, shape: number, gain: number, phase: number, pulse: number, alpha: number, hover: number) => {
      if (at >= STAR_CAPACITY) return;
      scale.setScalar(side);
      matrix.compose(where, camera.quaternion, scale);
      stars.setMatrixAt(at, matrix);
      starColor.setXYZ(at, tint.r, tint.g, tint.b);
      starParams.setXYZW(at, phase, pulse, alpha, hover);
      starShape.setXY(at, shape, gain);
      instanceIds.push(id);
      at += 1;
    };
    // The glow of the core breathes with the energy of the system.
    const glow = (additive ? 0.28 + 0.4 * coreState.energy + 0.5 * coreState.flash : 0.5 + 0.3 * coreState.energy + 0.3 * coreState.flash) * coreState.lit;
    put(null, position.set(0, 0, 0), CORE_RADIUS * 5, palette.core, 2, 1, 0, 0, glow, 0);
    const lift = (gain: number) => (composer.bloom ? gain : Math.min(gain, GAIN_PLAIN));
    const one = (body: Body, id: string | null) => {
      const { star } = body;
      const side = ((2 * STAR_RADIUS[star.size]) / DISC) * body.scale;
      colour.copy(palette[star.tone]).lerp(palette.success, body.calm);
      const gain = additive ? lift(GAIN[star.tone] + (GAIN.success - GAIN[star.tone]) * body.calm) : 1;
      put(id, worldOf(body, position), side, colour, star.kind === "more" ? 1 : 0, gain, body.phase, star.pulse && !body.free ? 1 : 0, body.alpha, Math.max(body.hover, body.ring));
    };
    // The live stars first: if the buffer is ever full, it is a leaving one that is not drawn.
    for (const body of bodies.values()) one(body, body.id);
    for (const body of leaving) one(body, null);
    stars.count = at;
    stars.instanceMatrix.needsUpdate = true;
    starColor.needsUpdate = true;
    starParams.needsUpdate = true;
    starShape.needsUpdate = true;
    stars.computeBoundingSphere();
  };

  // --- hover and click -----------------------------------------------------------
  const picker = createPicker(stage, {
    camera,
    targets: () => [stars],
    idOf: (hits) => {
      // Halos overlap: of the stars under the pointer, the one whose centre is nearest wins.
      let best: { id: string; off: number } | null = null;
      for (const hit of hits) {
        const id = hit.instanceId === undefined ? null : instanceIds[hit.instanceId];
        if (!id || !hit.uv) continue;
        const off = Math.hypot(hit.uv.x - 0.5, hit.uv.y - 0.5) * 2;
        if (off <= 0.95 && (!best || off < best.off)) best = { id, off };
      }
      return best?.id ?? null;
    },
    onHover: (id) => {
      props.onHover(id);
      stage.invalidate();
    },
    onPick: (id) => props.onPick(id),
    onMove: (point) => {
      // No lean with reduced motion or in the quiet mode; and while a star is under the pointer the camera
      // stands, so its tooltip does not move.
      if (!motion || picker.hovered) return;
      lean.toX = point ? point.x : 0;
      lean.toY = point ? point.y : 0;
      stage.invalidate();
    },
  });

  // --- what happens to a star ------------------------------------------------------
  const sparkle = (body: Body) => {
    if (!motion) return;
    const at = worldOf(body, new THREE.Vector3());
    const tint = palette[body.star.tone].clone();
    particles.emit(
      Array.from({ length: M.arrived.sparks }, (_, index) => {
        const angle = (index / M.arrived.sparks) * TAU;
        return { position: at, velocity: new THREE.Vector3(Math.cos(angle) * 0.22, 0, Math.sin(angle) * 0.22), life: M.arrived.sparkLife, size: 5, color: tint };
      }),
    );
  };

  const arrive = (star: Star) => {
    const body = newBody(star);
    bodies.set(star.id, body);
    const home = ORBIT_RADIUS[star.orbit];
    // The way in is lit behind the star, so a small one falling on the far side is still seen.
    const angle = star.angle + spin[star.orbit];
    const tint = palette[star.tone].clone();
    if (motion) particles.emit(
      Array.from({ length: M.arrived.trail }, (_, index) => {
        const k = ((index + 1) / (M.arrived.trail + 1)) * 0.8;
        const radius = arrivalRadius(k, home);
        return { position: new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius), life: M.arrived.sparkLife, size: 6, color: tint, delay: k * M.arrived.duration };
      }),
    );
    tween({ key: `${star.id}:place`, duration: M.arrived.duration, step: (k) => (body.dr = arrivalRadius(k, home) - home) });
    // Apart from the way in: a new read may move the star again before it has landed, and it must not stay dim.
    tween({
      duration: M.arrived.duration,
      step: (k) => (body.alpha = Math.min(1, k * 4)),
      done: () => {
        if (bodies.get(star.id) !== body) return;
        sparkle(body);
        tween({ key: `${star.id}:ring`, duration: M.arrived.ring, step: (k) => (body.ring = 1 - k) });
      },
    });
  };

  const show = (star: Star, delay = 0, duration: number = M.shown, pop = false) => {
    const body = newBody(star);
    bodies.set(star.id, body);
    tween({
      key: `${star.id}:show`,
      delay,
      duration,
      step: (k) => {
        body.alpha = powerOut(k);
        body.scale = pop ? backOut(k, 1.4) : 0.6 + 0.4 * powerOut(k);
      },
    });
  };

  const leave = (body: Body, resolved: boolean) => {
    bodies.delete(body.id);
    // Stars leave for less than a second; many at once (a tab that was hidden) are not all worth a flight.
    if (leaving.length >= LEAVING_MAX) leaving.shift();
    leaving.push(body);
    const gone = () => {
      const at = leaving.indexOf(body);
      if (at >= 0) leaving.splice(at, 1);
    };
    const from = placeOf(body);
    body.free = { ...from };
    body.hover = 0;
    if (!resolved) {
      tween({ duration: M.left, step: (k) => (body.alpha = 1 - k), done: gone });
      return;
    }
    if (!motion) {
      gone();
      return;
    }
    // The trail is the path itself, lit point by point as the star passes.
    const green = palette.success.clone();
    particles.emit(
      Array.from({ length: M.resolved.trail }, (_, index) => {
        const k = (index + 1) / (M.resolved.trail + 1);
        const point = spiralPoint(k, from.radius, from.angle);
        return {
          position: new THREE.Vector3(Math.cos(point.angle) * point.radius, 0, Math.sin(point.angle) * point.radius),
          life: M.resolved.trailLife,
          size: 7,
          color: green,
          delay: k * M.resolved.duration,
        };
      }),
    );
    coreState.flash = 1;
    tween({
      duration: M.resolved.duration,
      step: (k) => {
        const point = spiralPoint(k, from.radius, from.angle);
        body.free = { radius: point.radius, angle: point.angle };
        body.alpha = point.alpha;
        body.calm = powerOut(k * 2);
        body.scale = 1 - 0.35 * powerInOut(k);
      },
      done: gone,
    });
  };

  const retarget = (body: Body, star: Star) => {
    const before = placeOf(body);
    body.star = star;
    const home = ORBIT_RADIUS[star.orbit];
    const dr = before.radius - home;
    const da = angleDelta(star.angle + spin[star.orbit], before.angle);
    if (Math.abs(dr) < 1e-4 && Math.abs(da) < 1e-4) {
      body.dr = 0;
      body.da = 0;
      return;
    }
    tween({
      key: `${star.id}:place`,
      duration: M.moved,
      step: (k) => {
        const left = 1 - powerInOut(k);
        body.dr = dr * left;
        body.da = da * left;
      },
    });
  };

  const setDots = (next: ConstellationLayout) => {
    const shown = Math.min(next.calm.length, CALM_DOTS_MAX);
    for (let index = 0; index < shown; index += 1) {
      const dot = next.calm[index];
      dotPosition.setXYZ(index, Math.cos(dot.angle) * dot.radius, 0, Math.sin(dot.angle) * dot.radius);
    }
    dotPosition.needsUpdate = true;
    dotGeometry.setDrawRange(0, shown);
  };

  const setRing = (next: ConstellationLayout, animate: boolean) => {
    const share = next.backlog?.share ?? 0;
    ring.visible = next.backlog !== null && next.backlog.hpMax > 0;
    const from = ringMaterial.uniforms.uArc.value as number;
    if (!animate || Math.abs(from - share) < 1e-4) {
      ringMaterial.uniforms.uArc.value = share;
      return;
    }
    if (share < from && motion) ringFlare = 1;
    tween({ key: "ring", duration: M.ring, step: (k) => (ringMaterial.uniforms.uArc.value = from + (share - from) * powerOut(k)) });
  };

  const apply = (next: ConstellationSceneProps) => {
    const first = layout === null;
    const changes = constellationDiff(layout, next.layout, total, next.total);
    const kindOf = new Map(changes.map((change) => [change.id, change.kind]));
    const wanted = new Map(next.layout.stars.map((star) => [star.id, star]));
    for (const body of [...bodies.values()]) {
      if (!wanted.has(body.id)) leave(body, kindOf.get(body.id) === "resolved");
    }
    for (const star of next.layout.stars) {
      const body = bodies.get(star.id);
      if (body) retarget(body, star);
      else if (first) bodies.set(star.id, newBody(star));
      else if (kindOf.get(star.id) === "arrived") arrive(star);
      else show(star);
    }
    setDots(next.layout);
    setRing(next.layout, !first);
    layout = next.layout;
    total = next.total;
    props = next;
    stage.invalidate();
  };

  // --- the intro: the core lights up, the orbits are drawn, the stars come out ------
  const intro = () => {
    const share = layout?.backlog?.share ?? 0;
    coreState.lit = 0;
    drawOrbits(0);
    ringMaterial.uniforms.uArc.value = 0;
    dotsShown = 0;
    tween({ delay: M.intro.core[0], duration: M.intro.core[1] - M.intro.core[0], step: (k) => (coreState.lit = powerOut(k)) });
    tween({
      delay: M.intro.orbits[0],
      duration: M.intro.orbits[1] - M.intro.orbits[0],
      step: (k) => {
        drawOrbits(powerInOut(k));
        ringMaterial.uniforms.uArc.value = share * powerInOut(k);
      },
    });
    tween({ delay: introStarStart(ORBIT_RADIUS[4]), duration: M.intro.star, step: (k) => (dotsShown = powerOut(k)) });
    for (const body of bodies.values()) {
      body.alpha = 0;
      body.scale = 0;
      tween({
        key: `${body.id}:show`,
        delay: introStarStart(ORBIT_RADIUS[body.star.orbit]),
        duration: M.intro.star,
        step: (k) => {
          body.alpha = powerOut(k);
          body.scale = backOut(k, 1.4);
        },
      });
    }
  };

  // --- a frame -----------------------------------------------------------------------
  const approach = (value: number, to: number, delta: number, seconds: number) => (motion ? value + (to - value) * (1 - Math.exp((-3 * delta) / seconds)) : to);

  const offFrame = stage.onFrame((delta, now) => {
    time = now;
    runTweens();
    const aim = highlighted();
    // The orbits turn, the inner ones faster; they stand while a star is looked at, so its text never moves.
    if (motion && !aim) for (const orbit of ORBITS) spin[orbit] = (spin[orbit] + (delta * TAU) / ORBIT_PERIOD_S[orbit]) % TAU;
    dots.rotation.y = -spin[4];

    let moving = tweens.length > 0;
    for (const body of bodies.values()) {
      const to = body.id === aim ? 1 : 0;
      if (body.hover === to) continue;
      body.hover = approach(body.hover, to, delta, M.hover);
      if (Math.abs(body.hover - to) < 0.01) body.hover = to;
      else moving = true;
    }
    const aimedOrbit = aim ? bodies.get(aim)?.star.orbit : undefined;
    for (const item of orbitLines) {
      const to = item.orbit === aimedOrbit ? LINE_OPACITY.on : LINE_OPACITY.rest;
      if (item.opacity !== to) {
        item.opacity = approach(item.opacity, to, delta, M.hover);
        if (Math.abs(item.opacity - to) < 0.01) item.opacity = to;
        else moving = true;
      }
      item.material.opacity = item.opacity;
    }

    if (lean.x !== lean.toX || lean.y !== lean.toY) {
      lean.x = approach(lean.x, lean.toX, delta, 0.4);
      lean.y = approach(lean.y, lean.toY, delta, 0.4);
      if (Math.abs(lean.x - lean.toX) < 0.002 && Math.abs(lean.y - lean.toY) < 0.002) {
        lean.x = lean.toX;
        lean.y = lean.toY;
      } else moving = true;
      placeCamera();
    }

    // The energy of the system (the Pulse writes it on the frame, at most once a second).
    if (now - coreState.energyReadAt >= 1) {
      coreState.energyReadAt = now;
      const value = Number.parseFloat(getComputedStyle(stage.host).getPropertyValue("--admin-energy"));
      coreState.energyTo = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
    }
    coreState.energy = approach(coreState.energy, coreState.energyTo, delta, 0.6);
    if (coreState.flash > 0) {
      coreState.flash = Math.max(0, coreState.flash - delta / 0.5);
      moving = true;
    }
    if (ringFlare > 0) {
      ringFlare = Math.max(0, ringFlare - delta / M.ring);
      moving = true;
    }
    const breath = motion ? 0.02 * Math.sin(now * 1.6) : 0;
    core.scale.setScalar((0.6 + 0.4 * coreState.lit) * (1 + breath));
    coreMaterial.uniforms.uPower.value = coreState.lit * (0.8 + 0.4 * coreState.energy + 0.8 * coreState.flash);
    ringMaterial.uniforms.uOpacity.value = coreState.lit;
    coreMaterial.uniforms.uRim.value = composer.bloom ? 1.9 : 0.6;
    ringMaterial.uniforms.uGain.value = (composer.bloom ? 1.7 : dark() ? GAIN_PLAIN : 1) + ringFlare * (dark() ? 1.2 : 0.3);
    dotMaterial.uniforms.uOpacity.value = (dark() ? 0.75 : 0.6) * dotsShown;
    dotMaterial.uniforms.uSize.value = 3.4 * stage.pixelRatio;
    starMaterial.uniforms.uTime.value = now;
    writeStars();
    if (moving) stage.invalidate();
  });

  const offResize = stage.onResize(() => fitCamera());
  const offTheme = stage.onTheme(() => paint());

  fitCamera();
  apply(initial);
  drawOrbits(1);
  // A returning page (`short`) has no intro of its own: the canvas fading in over the 2D picture is the whole of it.
  if (run.intro === "full") intro();
  writeStars();
  stage.setAmbient(motion);

  return {
    update(next) {
      if (disposed) return;
      if (next.layout !== layout || next.total !== total) apply(next);
      else {
        props = next;
        stage.invalidate();
      }
    },
    project(id) {
      const body = bodies.get(id);
      if (!body) return null;
      const { width, height } = stage.size;
      worldOf(body, probe).project(camera);
      return { x: ((probe.x + 1) / 2) * width, y: ((1 - probe.y) / 2) * height };
    },
    dispose() {
      disposed = true;
      offFrame();
      offResize();
      offTheme();
      picker.dispose();
      particles.dispose();
      composer.dispose();
      tweens.length = 0;
      scene.remove(core, ring, dots, stars, ...orbitLines.map((item) => item.line));
    },
  };
}
