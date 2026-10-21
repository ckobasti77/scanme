import * as THREE from "three";
import { clampEmit, particleBudget } from "@/lib/admin-v2/three/budget";
import { blendMode } from "@/lib/admin-v2/three/theme";
import type { Stage } from "./stage";

// ADMIN v3 V2 — the particles of the 3D kit: one `THREE.Points`, one draw call,
// a ring buffer. A particle is written once; its movement and fading are
// computed in the shader from `uTime − aBirth`, so a live particle costs the
// CPU nothing. The budget is the quality's (600 or 150): what does not fit is
// not emitted. While a particle lives the stage keeps drawing; when the last
// one is gone the loop is free to stop. A scene whose particles never end (the
// hall) passes `ambient` and keeps the 30 fps loop itself.

export type ParticleSpec = {
  position: THREE.Vector3;
  /** Units per second. */
  velocity?: THREE.Vector3;
  /** Seconds. */
  life: number;
  /** Diameter at birth (CSS px); it shrinks to half. */
  size: number;
  color: THREE.Color;
  /** Seconds from now until it appears. */
  delay?: number;
};

export type Particles = {
  readonly points: THREE.Points;
  /** How many of `specs` were emitted (the rest did not fit the budget). */
  emit(specs: readonly ParticleSpec[]): number;
  /** Particles that are alive or still waiting for their delay. */
  alive(): number;
  dispose(): void;
};

const VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uPixelRatio;
  attribute vec3 aVelocity;
  attribute float aBirth;
  attribute float aLife;
  attribute float aSize;
  attribute vec3 aColor;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    float age = uTime - aBirth;
    float live = step(0.0, age) * step(age, aLife);
    float k = clamp(age / max(aLife, 0.0001), 0.0, 1.0);
    vec3 moved = position + aVelocity * max(age, 0.0);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(moved, 1.0);
    gl_PointSize = aSize * uPixelRatio * (1.0 - 0.5 * k) * live;
    vAlpha = live * (1.0 - k) * (1.0 - k);
    vColor = aColor;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform float uGain;
  uniform float uOpacity;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float soft = 1.0 - smoothstep(0.2, 1.0, d);
    gl_FragColor = vec4(vColor * uGain, soft * vAlpha * uOpacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function createParticles(stage: Stage, options: { max: number; /** The scene keeps an ambient loop while particles live (at most 30 fps): they do not ask for frames themselves. */ ambient?: boolean }): Particles {
  const capacity = Math.max(1, Math.floor(options.max));
  let budget = Math.min(capacity, particleBudget(stage.quality));
  let cursor = 0;
  let now = 0;

  const position = new THREE.BufferAttribute(new Float32Array(capacity * 3), 3);
  const velocity = new THREE.BufferAttribute(new Float32Array(capacity * 3), 3);
  // Born in the far future: an empty slot is never drawn.
  const birth = new THREE.BufferAttribute(new Float32Array(capacity).fill(1e9), 1);
  const life = new THREE.BufferAttribute(new Float32Array(capacity), 1);
  const size = new THREE.BufferAttribute(new Float32Array(capacity), 1);
  const color = new THREE.BufferAttribute(new Float32Array(capacity * 3), 3);
  /** When each slot stops being drawn (stage time). */
  const ends = new Float32Array(capacity).fill(-1);

  const geometry = stage.track(new THREE.BufferGeometry());
  geometry.setAttribute("position", position);
  geometry.setAttribute("aVelocity", velocity);
  geometry.setAttribute("aBirth", birth);
  geometry.setAttribute("aLife", life);
  geometry.setAttribute("aSize", size);
  geometry.setAttribute("aColor", color);
  // The particles move in the shader, so the box of the buffer says nothing about where they are.
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

  const material = stage.track(
    new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: { uTime: { value: 0 }, uPixelRatio: { value: stage.pixelRatio }, uGain: { value: 1 }, uOpacity: { value: 1 } },
      transparent: true,
      depthTest: false,
      depthWrite: false,
    }),
  );
  const paint = () => {
    const additive = blendMode(stage.theme) === "additive";
    material.blending = additive ? THREE.AdditiveBlending : THREE.NormalBlending;
    material.uniforms.uGain.value = additive ? 1.6 : 1;
    material.uniforms.uOpacity.value = additive ? 1 : 0.85;
    material.needsUpdate = true;
  };
  paint();

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 10;
  stage.scene.add(points);

  const alive = () => {
    let count = 0;
    for (let index = 0; index < capacity; index += 1) if (ends[index] > now) count += 1;
    return count;
  };

  const off = [
    stage.onFrame((_delta, time) => {
      now = time;
      material.uniforms.uTime.value = time;
      if (!options.ambient && alive() > 0) stage.invalidate();
    }),
    stage.onTheme(paint),
    stage.onQuality((quality) => {
      budget = Math.min(capacity, particleBudget(quality));
      material.uniforms.uPixelRatio.value = stage.pixelRatio;
    }),
  ];

  return stage.track({
    points,
    emit(specs) {
      const count = clampEmit(specs.length, alive(), budget);
      for (let index = 0; index < count; index += 1) {
        const spec = specs[index];
        const slot = cursor;
        cursor = (cursor + 1) % capacity;
        const born = now + (spec.delay ?? 0);
        position.setXYZ(slot, spec.position.x, spec.position.y, spec.position.z);
        velocity.setXYZ(slot, spec.velocity?.x ?? 0, spec.velocity?.y ?? 0, spec.velocity?.z ?? 0);
        birth.setX(slot, born);
        life.setX(slot, spec.life);
        size.setX(slot, spec.size);
        color.setXYZ(slot, spec.color.r, spec.color.g, spec.color.b);
        ends[slot] = born + spec.life;
      }
      if (count > 0) {
        for (const attribute of [position, velocity, birth, life, size, color]) attribute.needsUpdate = true;
        // An ambient scene draws them on its next frame (30 fps): an emission is not a reason for a frame of its own.
        if (!options.ambient) stage.invalidate();
      }
      return count;
    },
    alive,
    dispose() {
      for (const stop of off) stop();
      stage.scene.remove(points);
    },
  });
}
