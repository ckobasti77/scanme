import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { qualityParams } from "@/lib/admin-v2/three/quality";
import { bloomParams } from "@/lib/admin-v2/three/theme";
import type { Stage } from "./stage";

// ADMIN v3 V2 — the bloom of the 3D kit, by theme (ZADATAK-V3 §3): the pass
// exists only in the dark theme at the high quality. In the light theme and at
// the low quality the scene is drawn straight to the canvas: no composer, no
// extra targets. The bloom pass blurs at half the resolution of the canvas and
// does not keep transparency, so the stage clears with the colour of the
// surface. Only colours a scene lifts above the threshold glow; the surface
// and the text around the canvas never do.

export type StageComposer = {
  /** Whether the bloom pass is drawing right now. */
  readonly bloom: boolean;
  dispose(): void;
};

export function createComposer(stage: Stage, camera: THREE.Camera): StageComposer {
  let composer: EffectComposer | null = null;
  let bloomPass: UnrealBloomPass | null = null;

  const drop = () => {
    if (!composer) return;
    stage.setRender(null);
    for (const pass of composer.passes) pass.dispose();
    composer.dispose();
    composer = null;
    bloomPass = null;
  };

  const sync = () => {
    const params = bloomParams(stage.theme, stage.quality);
    if (!params) {
      drop();
      return;
    }
    const { width, height } = stage.size;
    if (!composer) {
      const created = new EffectComposer(stage.renderer);
      // Set before the first use of the targets: the scene is antialiased inside the composer.
      const samples = qualityParams(stage.quality).msaa;
      created.renderTarget1.samples = samples;
      created.renderTarget2.samples = samples;
      created.addPass(new RenderPass(stage.scene, camera));
      bloomPass = new UnrealBloomPass(new THREE.Vector2(width, height), params.strength, params.radius, params.threshold);
      created.addPass(bloomPass);
      created.addPass(new OutputPass());
      composer = created;
      stage.setRender((delta) => created.render(delta));
    }
    if (bloomPass) {
      bloomPass.strength = params.strength;
      bloomPass.radius = params.radius;
      bloomPass.threshold = params.threshold;
    }
    composer.setPixelRatio(stage.pixelRatio);
    composer.setSize(width, height);
  };

  const off = [stage.onTheme(sync), stage.onQuality(sync), stage.onResize(sync)];
  sync();

  const handle: StageComposer = {
    get bloom() {
      return composer !== null;
    },
    dispose() {
      for (const stop of off) stop();
      drop();
    },
  };
  return stage.track(handle);
}
