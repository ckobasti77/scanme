import * as THREE from "three";
import type { Rarity } from "@/lib/admin-v2/game/ids";
import { lockedPalette, medalMaterial, medalPalette, medalTilt, spinStep, type MedalArt, type MedalMaterial } from "@/lib/admin-v2/game/medal-art";
import type { StageRun, StageScene } from "../admin-stage";
import { createComposer, type StageComposer } from "../post";
import type { Stage } from "../stage";

// ADMIN v3 V4 — the medal (plan §5.3, ZADATAK-V3 §3.3): one coin, one mesh, one
// ShaderMaterial and no lights. The sign of the badge is a 256 px relief texture
// drawn from its SVG paths; the shader bends the normal by its slope, and the
// rarity is read in the material (matte, metal, holographic, holographic with
// a glow). The environment is an analytic gradient of sky, horizon and ground
// inside the shader. A locked badge is a dark silhouette: only the rim and the
// shape, no relief, no highlight. In `showcase` the medal turns under the
// finger (1:1, then inertia) and leans after the pointer; in `ceremony` it
// swings once from a third of a turn to face the camera (its face is seen from
// the first frame: the moment is 1.6 s long). Without motion (reduced
// motion, the quiet mode) nothing leans, coasts or turns on its own: the medal
// stands a little turned so the material shows, and a drag still turns it.

export type MedalSceneProps = {
  art: MedalArt;
  rarity: Rarity;
  /** A locked badge: a dark silhouette, only the rim and the shape, no relief. */
  locked: boolean;
  /** `showcase`: the Vitrina (drag to turn, follows the cursor); `ceremony`: one calm swing to the camera, no input. */
  mode: "showcase" | "ceremony";
};

const DEV = process.env.NODE_ENV !== "production";
const TEXTURE_SIZE = 256;
/** The blur of the edge of the sign in the relief texture (px of the texture): it gives the relief a slope. */
const EDGE_BLUR = 7;
/** The sign box (100 × 100) spans this much of the coin across (object units, ±0.8). */
const FACE = 0.8;
const CAMERA_FOV = 30;
/** The share of the shorter side of the host the coin fills. */
const FILL = 0.7;
const REST_DEG = 18;
const CEREMONY_S = 0.9;
/** Where the swing of a ceremony starts (radians): turned away, but never edge-on. */
const CEREMONY_FROM = -Math.PI / 3;
/** The fastest a fling may turn (rad/s). */
const SPIN_MAX = 16;
/** The slow turn of a legendary medal (rad/s). */
const AUTO_SPIN = 0.3;
/** A release after the finger has stood this long (ms) is a drop, not a fling. */
const FLING_IDLE_MS = 90;
const TILT_SECONDS = 0.12;
const MATERIAL_INDEX: Record<MedalMaterial, number> = { matte: 0, metal: 1, holo: 2, "holo-glow": 3 };

/** The sky, the horizon and the ground that the metal reflects, by theme; `box` is the strength of the two soft boxes. */
const ENVIRONMENT = {
  light: { zenith: "#c9dcef", horizon: "#f6f2e6", ground: "#8d8778", box: 0.6 },
  dark: { zenith: "#202a38", horizon: "#7d8b9e", ground: "#101413", box: 1.15 },
} as const;

// The profile of the coin from the back to the front (radius, height): a slightly sunk face, a raised rim, a bevelled edge.
const PROFILE = [
  [0.001, -0.055],
  [0.84, -0.055],
  [0.9, -0.06],
  [0.96, -0.06],
  [1, -0.03],
  [1, 0.03],
  [0.96, 0.06],
  [0.9, 0.06],
  [0.84, 0.055],
  [0.001, 0.055],
].map(([radius, height]) => new THREE.Vector2(radius, height));

const VERTEX = /* glsl */ `
  varying vec3 vPos;
  varying vec3 vObjN;
  varying vec3 vN;
  varying vec3 vViewPos;
  varying vec3 vX;
  varying vec3 vY;
  void main() {
    vPos = position;
    vObjN = normal;
    vN = normalize(normalMatrix * normal);
    // Where the object axes of the face point in the view: the relief bends the normal along them.
    vX = normalize(normalMatrix * vec3(1.0, 0.0, 0.0));
    vY = normalize(normalMatrix * vec3(0.0, 1.0, 0.0));
    vec4 view = modelViewMatrix * vec4(position, 1.0);
    vViewPos = view.xyz;
    gl_Position = projectionMatrix * view;
  }
`;

// uMat: 0 matte, 1 metal, 2 holo, 3 holo with a glow. The normal is bent by the slope of the sign (the relief) and by a faint
// dome, so that a flat face reflects a sweep of the environment and not one colour.
const FRAGMENT = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uMat;
  uniform float uLocked;
  uniform float uDark;
  uniform float uTime;
  uniform float uAngle;
  uniform float uBloom;
  uniform float uBox;
  uniform vec3 uBase;
  uniform vec3 uRim;
  uniform vec3 uSign;
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uGround;
  varying vec3 vPos;
  varying vec3 vObjN;
  varying vec3 vN;
  varying vec3 vViewPos;
  varying vec3 vX;
  varying vec3 vY;
  const float FACE = ${FACE.toFixed(2)};

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 345.45));
    p += dot(p, p + 34.23);
    return fract(p.x * p.y);
  }

  // The height of the sign at a point of the face; the back of the coin carries the sign mirrored, so it reads from behind.
  float signAt(vec2 p, float back) {
    vec2 uv = vec2(mix(p.x, -p.x, back), p.y) / (2.0 * FACE) + 0.5;
    return texture2D(uMap, uv).r;
  }

  // Sky above the horizon, ground below it and two soft boxes: the light a metal medal reflects.
  vec3 environment(vec3 r) {
    vec3 sky = mix(uHorizon, uZenith, smoothstep(0.0, 0.8, r.y));
    vec3 ground = mix(uHorizon * 0.55, uGround, smoothstep(0.0, 0.6, -r.y));
    vec3 c = mix(ground, sky, smoothstep(-0.12, 0.12, r.y));
    vec3 boxA = normalize(vec3(-0.35, 0.42, 0.84));
    vec3 boxB = normalize(vec3(0.5, -0.1, 0.86));
    c += uBox * (smoothstep(0.93, 0.975, dot(r, boxA)) + 0.55 * smoothstep(0.95, 0.985, dot(r, boxB)));
    return c;
  }

  void main() {
    vec3 V = normalize(-vViewPos);
    vec3 N0 = normalize(vN);
    float front = step(0.9, vObjN.z);
    float back = step(0.9, -vObjN.z);
    float face = max(front, back);
    vec2 p = vPos.xy;
    float r = length(p);

    float e = 0.016;
    float h = signAt(p, back) * face;
    float gx = signAt(p + vec2(e, 0.0), back) - signAt(p - vec2(e, 0.0), back);
    float gy = signAt(p + vec2(0.0, e), back) - signAt(p - vec2(0.0, e), back);
    float relief = face * (1.0 - uLocked);
    vec3 N = normalize(N0 + 0.2 * face * (p.x * vX + p.y * vY) * (1.0 - uLocked) - 2.2 * relief * (gx * vX + gy * vY));

    float rim = smoothstep(0.92, 0.985, r);
    vec3 albedo = mix(mix(uBase, uSign, h), uRim, rim);
    float ndv = clamp(dot(N, V), 0.0, 1.0);
    float fres = pow(1.0 - ndv, 4.0);
    vec3 L = normalize(vec3(-0.45, 0.62, 0.64));

    // Matte: soft diffuse and a soft edge, a muted colour.
    float wrap = 0.5 + 0.5 * dot(N, L);
    vec3 matte = albedo * (0.34 + 0.8 * wrap * wrap) + uRim * pow(1.0 - ndv, 2.5) * 0.22;

    // Metal: the sky reflected through the normal, with a sharp highlight.
    vec3 R = reflect(-V, N);
    vec3 F = albedo + (1.0 - albedo) * fres;
    vec3 metal = environment(R) * F * 1.15 + albedo * 0.06 + F * pow(max(dot(R, L), 0.0), 48.0) * 1.2;

    vec3 col = matte;
    if (uMat > 0.5) col = metal;
    if (uMat > 1.5) {
      // Holographic: a hue from the angle to the view, the place on the face and the lean, through a cosine palette,
      // mixed with the metal by the fresnel and cut by diffraction stripes that turn with the medal.
      vec2 q = p / (2.0 * FACE) + 0.5;
      float lean = N.x * 0.55 + N.y * 0.4;
      float t = ndv * 1.1 + q.x * 0.45 + q.y * 0.25 + lean + uAngle * 0.35;
      vec3 irid = vec3(0.55) + vec3(0.45) * cos(6.28318 * (vec3(1.0) * t + vec3(0.0, 0.33, 0.67)));
      float ca = cos(uAngle);
      float sa = sin(uAngle);
      vec2 c = q - 0.5;
      vec2 turned = vec2(ca * c.x - sa * c.y, sa * c.x + ca * c.y);
      float stripes = 0.5 + 0.5 * sin(turned.x * 70.0 + turned.y * 30.0 + lean * 14.0);
      irid *= 0.78 + 0.42 * stripes;
      float k = clamp(0.42 + 0.5 * pow(1.0 - ndv, 1.5), 0.0, 0.92);
      col = mix(metal, irid * mix(0.7, 1.0, h), k);
      if (uMat > 2.5) {
        // Sparks from noise in time. Under the bloom (dark theme) the body is held below its threshold, so that
        // only the sparks and the rim are lifted over it and glow.
        if (uBloom > 0.5) col = 0.66 * (1.0 - exp(-col / 0.5));
        vec2 grid = q * 22.0;
        vec2 cell = floor(grid);
        float rnd = hash21(cell);
        vec2 spot = vec2(hash21(cell + 7.1), hash21(cell + 13.7)) * 0.6 + 0.2;
        float twinkle = pow(max(0.0, sin(uTime * (1.2 + rnd * 2.5) + rnd * 60.0)), 20.0);
        float spark = step(0.86, rnd) * twinkle * smoothstep(0.22, 0.0, length(fract(grid) - spot));
        spark *= face * (1.0 - smoothstep(0.76, 0.84, r));
        col += spark * (vec3(0.9) + uSign * 0.4) * (1.0 + uDark * 1.6);
        col += uSign * 0.5 * smoothstep(0.955, 0.99, r) * uBloom;
      }
    }

    // Locked: a dark silhouette, the rim and the shape only, no relief and no highlight.
    if (uLocked > 0.5) {
      float edge = smoothstep(0.93, 0.985, r) + pow(1.0 - clamp(dot(N0, V), 0.0, 1.0), 2.2) * 0.55;
      col = mix(uBase, uSign, h) + uRim * edge * 0.9;
    }

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const easeOutCubic = (k: number) => 1 - (1 - k) ** 3;
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

export function create(stage: Stage, initial: MedalSceneProps, run: StageRun): StageScene<MedalSceneProps> {
  const { scene, canvas } = stage;
  const motion = run.motion;
  const undo: Array<() => void> = [];
  const restAngle = motion ? 0 : THREE.MathUtils.degToRad(REST_DEG);
  let props = initial;
  let disposed = false;
  let composer = null as StageComposer | null;

  // The pose: the turn about the upright axis, its speed, and the lean after the pointer (degrees).
  let angle = restAngle;
  let velocity = 0;
  const tilt = { x: 0, y: 0 };
  const tiltTo = { x: 0, y: 0 };
  let drag: { id: number; x: number; at: number } | null = null;
  let ceremonyAt: number | null = null;
  let ceremonyDone = true;
  let ambientOn = false;
  let applyNext: ((next: MedalSceneProps) => void) | null = null;

  try {
    // --- the sign: a relief texture drawn from the paths -----------------------------
    const signCanvas = document.createElement("canvas");
    signCanvas.width = TEXTURE_SIZE;
    signCanvas.height = TEXTURE_SIZE;
    const ctx = signCanvas.getContext("2d");
    if (!ctx) throw new Error("the 2D canvas is not available");
    const paintSign = (art: MedalArt) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
      ctx.save();
      ctx.scale(TEXTURE_SIZE / 100, TEXTURE_SIZE / 100);
      // The blur of a shadow is not scaled by the transform: it softens the edge, so the relief has a slope.
      ctx.fillStyle = "#fff";
      ctx.shadowColor = "#fff";
      ctx.shadowBlur = EDGE_BLUR;
      for (const d of art.paths) ctx.fill(new Path2D(d), "evenodd");
      ctx.restore();
    };
    paintSign(initial.art);
    const texture = stage.track(new THREE.CanvasTexture(signCanvas));
    texture.colorSpace = THREE.NoColorSpace;
    texture.anisotropy = Math.min(4, stage.renderer.capabilities.getMaxAnisotropy());

    // --- the coin ---------------------------------------------------------------------
    const geometry = stage.track(new THREE.LatheGeometry(PROFILE, 64));
    // The lathe turns about Y: lay the faces towards the camera (+Z).
    geometry.rotateX(Math.PI / 2);
    const uniforms: Record<string, THREE.IUniform> = {
      uMap: { value: texture },
      uMat: { value: 0 },
      uLocked: { value: 0 },
      uDark: { value: 0 },
      uTime: { value: 0 },
      uAngle: { value: 0 },
      uBloom: { value: 0 },
      uBox: { value: 1 },
      uBase: { value: new THREE.Color() },
      uRim: { value: new THREE.Color() },
      uSign: { value: new THREE.Color() },
      uZenith: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uGround: { value: new THREE.Color() },
    };
    const material = stage.track(
      new THREE.ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        uniforms,
      }),
    );
    const medal = new THREE.Mesh(geometry, material);
    scene.add(medal);
    undo.push(() => scene.remove(medal));

    // --- the camera: the coin fills about 70 % of the shorter side of the host ---------
    const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.1, 30);
    const fit = () => {
      const { width, height } = stage.size;
      const aspect = width / height;
      camera.aspect = aspect;
      camera.position.set(0, 0, 2 / FILL / Math.min(1, aspect) / (2 * Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV / 2))));
      camera.updateProjectionMatrix();
    };
    fit();
    stage.setCamera(camera);
    undo.push(stage.onResize(() => fit()));

    // --- what the props say --------------------------------------------------------------
    const materialOf = () => medalMaterial(props.rarity);
    const glows = () => materialOf() === "holo-glow" && !props.locked;
    const autoSpin = () => motion && props.mode === "showcase" && glows();
    const ceremonyActive = () => motion && props.mode === "ceremony" && !ceremonyDone;

    const syncAmbient = () => {
      const on = !disposed && (ceremonyActive() || (!drag && (velocity !== 0 || autoSpin())));
      if (on === ambientOn) return;
      ambientOn = on;
      stage.setAmbient(on);
    };

    const paint = () => {
      const theme = stage.theme;
      const palette = props.locked ? lockedPalette(theme) : medalPalette(props.rarity, theme);
      const environment = ENVIRONMENT[theme];
      (uniforms.uBase.value as THREE.Color).set(palette.base);
      (uniforms.uRim.value as THREE.Color).set(palette.rim);
      (uniforms.uSign.value as THREE.Color).set(palette.sign);
      (uniforms.uZenith.value as THREE.Color).set(environment.zenith);
      (uniforms.uHorizon.value as THREE.Color).set(environment.horizon);
      (uniforms.uGround.value as THREE.Color).set(environment.ground);
      uniforms.uBox.value = environment.box;
      uniforms.uDark.value = theme === "dark" ? 1 : 0;
    };

    /** The bloom pass belongs to the glowing medal only; the composer itself is off in the light theme and at the low quality. */
    const syncComposer = () => {
      if (glows() && !composer) composer = createComposer(stage, camera);
      else if (!glows() && composer) {
        composer.dispose();
        composer = null;
      }
    };

    const restart = () => {
      velocity = 0;
      tilt.x = 0;
      tilt.y = 0;
      tiltTo.x = 0;
      tiltTo.y = 0;
      ceremonyAt = null;
      if (props.mode === "ceremony" && motion) {
        ceremonyDone = false;
        angle = CEREMONY_FROM;
      } else {
        ceremonyDone = true;
        angle = restAngle;
      }
    };

    const apply = (next: MedalSceneProps, first: boolean) => {
      const artChanged = first || next.art !== props.art;
      const modeChanged = !first && next.mode !== props.mode;
      props = next;
      if (artChanged) {
        paintSign(next.art);
        texture.needsUpdate = true;
      }
      if (artChanged || modeChanged) restart();
      uniforms.uMat.value = MATERIAL_INDEX[materialOf()];
      uniforms.uLocked.value = next.locked ? 1 : 0;
      paint();
      syncComposer();
      canvas.style.cursor = next.mode === "showcase" ? (drag ? "grabbing" : "grab") : "";
      syncAmbient();
      stage.invalidate();
    };

    // --- the hand: drag to turn, lean after the pointer ---------------------------------
    /** The distance (px) from the centre of the coin to its rim: a finger moving by it turns the medal by one radian. */
    const rimPx = () => Math.max(1, (Math.min(stage.size.width, stage.size.height) * FILL) / 2);

    const onDown = (event: PointerEvent) => {
      if (props.mode !== "showcase" || !event.isPrimary || event.button !== 0) return;
      drag = { id: event.pointerId, x: event.clientX, at: event.timeStamp };
      velocity = 0;
      tiltTo.x = 0;
      tiltTo.y = 0;
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch {
        // A pointer that is already gone: the drag simply ends with it.
      }
      canvas.style.cursor = "grabbing";
      syncAmbient();
      stage.invalidate();
    };
    const onMove = (event: PointerEvent) => {
      if (props.mode !== "showcase") return;
      if (drag) {
        if (event.pointerId !== drag.id) return;
        const turned = (event.clientX - drag.x) / rimPx();
        const seconds = Math.max(0.001, (event.timeStamp - drag.at) / 1000);
        drag.x = event.clientX;
        drag.at = event.timeStamp;
        angle += turned;
        velocity = clamp(0.6 * (turned / seconds) + 0.4 * velocity, -SPIN_MAX, SPIN_MAX);
        stage.invalidate();
        return;
      }
      // Only a mouse and a pen lean after the pointer, and only with motion.
      if (!motion || event.pointerType === "touch") return;
      const box = canvas.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) return;
      const next = medalTilt(((event.clientX - box.left) / box.width) * 2 - 1, 1 - ((event.clientY - box.top) / box.height) * 2);
      tiltTo.x = next.x;
      tiltTo.y = next.y;
      stage.invalidate();
    };
    const release = (event: PointerEvent, fling: boolean) => {
      if (!drag || event.pointerId !== drag.id) return;
      const idle = event.timeStamp - drag.at;
      drag = null;
      try {
        canvas.releasePointerCapture(event.pointerId);
      } catch {
        // Released already.
      }
      canvas.style.cursor = "grab";
      // The medal coasts only when it was let go moving, and only with motion.
      if (!motion || !fling || idle > FLING_IDLE_MS) velocity = 0;
      syncAmbient();
      stage.invalidate();
    };
    const onUp = (event: PointerEvent) => release(event, true);
    const onCancel = (event: PointerEvent) => release(event, false);
    const onLeave = () => {
      if (drag) return;
      tiltTo.x = 0;
      tiltTo.y = 0;
      stage.invalidate();
    };
    const listeners: Array<[string, (event: PointerEvent) => void]> = [
      ["pointerdown", onDown],
      ["pointermove", onMove],
      ["pointerup", onUp],
      ["pointercancel", onCancel],
      ["lostpointercapture", onCancel],
      ["pointerleave", onLeave],
    ];
    for (const [name, listener] of listeners) {
      canvas.addEventListener(name, listener as EventListener);
      undo.push(() => canvas.removeEventListener(name, listener as EventListener));
    }
    undo.push(() => {
      canvas.style.cursor = "";
    });

    // --- a frame -----------------------------------------------------------------------------
    undo.push(
      stage.onFrame((delta, now) => {
        if (props.mode === "ceremony") {
          if (!ceremonyDone) {
            if (ceremonyAt === null) ceremonyAt = now;
            const k = clamp((now - ceremonyAt) / CEREMONY_S, 0, 1);
            angle = CEREMONY_FROM * (1 - easeOutCubic(k));
            if (k >= 1) {
              angle = 0;
              ceremonyDone = true;
            }
          }
        } else if (!drag) {
          if (velocity !== 0) {
            const step = spinStep(angle, velocity, delta);
            angle = step.angle;
            velocity = step.velocity;
          } else if (autoSpin()) angle += AUTO_SPIN * delta;
        }

        let leaning = false;
        if (motion && props.mode === "showcase") {
          const k = 1 - Math.exp(-delta / TILT_SECONDS);
          tilt.x += (tiltTo.x - tilt.x) * k;
          tilt.y += (tiltTo.y - tilt.y) * k;
          if (Math.abs(tilt.x - tiltTo.x) < 0.01 && Math.abs(tilt.y - tiltTo.y) < 0.01) {
            tilt.x = tiltTo.x;
            tilt.y = tiltTo.y;
          } else leaning = true;
        }

        medal.rotation.set(THREE.MathUtils.degToRad(tilt.x), angle + THREE.MathUtils.degToRad(tilt.y), 0);
        uniforms.uAngle.value = angle;
        uniforms.uTime.value = motion ? now : 0;
        uniforms.uBloom.value = glows() && composer?.bloom ? 1 : 0;
        if (DEV) {
          const { dataset } = stage.host;
          dataset.medalAngle = angle.toFixed(3);
          dataset.medalMaterial = materialOf();
          dataset.medalLocked = props.locked ? "1" : "0";
        }
        syncAmbient();
        // The loop is asked for only while the lean eases; coasting, a turn and the glow are the ambient loop.
        if (leaning && !ambientOn) stage.invalidate();
      }),
    );
    undo.push(stage.onTheme(() => paint()));
    if (DEV) {
      undo.push(() => {
        const { dataset } = stage.host;
        delete dataset.medalAngle;
        delete dataset.medalMaterial;
        delete dataset.medalLocked;
      });
    }

    apply(initial, true);
    applyNext = (next) => apply(next, false);
    medal.rotation.set(0, angle, 0);
  } catch (error) {
    // Whatever was made is taken back; the geometry, the material and the texture are the stage's to dispose.
    for (const step of undo.splice(0).reverse()) step();
    composer?.dispose();
    throw error;
  }

  return {
    update(next) {
      if (disposed) return;
      applyNext?.(next);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const step of undo.splice(0).reverse()) step();
      composer?.dispose();
      composer = null;
    },
  };
}
