import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { DASHBOARD_HERO_KEY, readDashboardHero, writeDashboardHero } from "@/components/admin/dashboard/hero-choice";
import { ADMIN_STAGE_MOTION } from "@/lib/admin-v2/motion";
import { AdminStage, type StageSceneModule } from "./admin-stage";

// ADMIN v3 V2 — the React side of the 3D kit, without a DOM: what the server
// sends (the 2D fallback and the text equivalent, never an empty box), and that
// nothing of `three` is asked for until the browser decides to. The stage and
// the scenes themselves need WebGL: they are proven by the frames of the step
// (output/playwright/admin-v3/V2/kadrovi.mjs), the pure rules by lib/admin-v2/three/*.test.ts.

const load = vi.fn(async (): Promise<StageSceneModule<{ value: number }>> => {
  throw new Error("the scene must not be loaded on the server");
});

function html() {
  return renderToStaticMarkup(
    <AdminStage load={load} sceneProps={{ value: 1 }} summary={<p className="sr-only">Tri hitne stavke.</p>} fallback={<svg data-test-fallback="" aria-hidden="true" />} className="h-60">
      <span data-test-overlay="" />
    </AdminStage>,
  );
}

describe("AdminStage on the server and without JavaScript", () => {
  test("the 2D fallback and the text equivalent are in the markup; there is no canvas", () => {
    const markup = html();
    expect(markup).toContain('data-admin-stage=""');
    expect(markup).toContain('data-stage-state="flat"');
    expect(markup).toContain('<p class="sr-only">Tri hitne stavke.</p>');
    expect(markup).toMatch(/<div data-stage-fallback="" class="absolute inset-0"><svg data-test-fallback="" aria-hidden="true"><\/svg><\/div>/);
    expect(markup).not.toContain("<canvas");
    expect(markup).toContain('data-test-overlay=""');
  });

  test("the place of the canvas is empty, transparent and takes no pointer until a scene runs", () => {
    const match = html().match(/<div data-stage-mount="" class="([^"]*)" style="([^"]*)"><\/div>/);
    const mount = match?.[1] ?? "";
    expect(mount).toContain("opacity-0");
    expect(mount).toContain("pointer-events-none");
    // The fade of the canvas is of the stage token (V5: an inline duration, not a class literal) and stands with reduced motion.
    expect(mount).toContain("motion-reduce:transition-none");
    expect(mount).not.toContain("duration-300");
    expect(match?.[2]).toBe(`transition-duration:${ADMIN_STAGE_MOTION.fade}s`);
  });

  test("V5: the server markup is the plain fallback: no shade, no ignite mark, whatever the caller asked", () => {
    const markup = renderToStaticMarkup(
      <AdminStage load={load} sceneProps={{ value: 1 }} ignite startAfterMs={350} fallback={<svg data-test-fallback="" aria-hidden="true" />} className="h-60" />,
    );
    expect(markup).toContain('<div data-stage-fallback="" class="absolute inset-0"><svg');
    expect(markup).not.toContain("data-stage-ignite");
    expect(markup).not.toContain("opacity:");
    expect(markup).not.toContain("<canvas");
  });

  test("rendering asks for no scene: the chunk is requested only by the browser", () => {
    load.mockClear();
    html();
    expect(load).not.toHaveBeenCalled();
  });

  test("the host clips the scene and keeps the size the caller gives it", () => {
    expect(html()).toMatch(/<div data-admin-stage="" data-stage-state="flat" class="relative overflow-hidden h-60">/);
  });
});

describe("the React side never imports three", () => {
  const source = (file: string) => readFileSync(join(process.cwd(), file), "utf8");

  test("admin-stage.tsx and stage-session.ts reach the kit only through types and import()", () => {
    for (const file of ["components/admin/three/admin-stage.tsx", "components/admin/three/stage-session.ts", "components/admin/dashboard/constellation.tsx", "components/admin/events/analytics/heat-map-3d.tsx", "components/admin/events/analytics/hall-mini.tsx", "components/admin/game/medal-stage.tsx", "components/admin/game/vitrina.tsx", "components/admin/game/ceremony-layer.tsx", "components/admin/game/game-parts.tsx"]) {
      const text = source(file);
      expect(text, file).not.toMatch(/from "three/);
      expect(text, file).not.toMatch(/^import (?!type)[^;]*from "\.\/(stage|post|picking|particles)"/m);
      expect(text, file).not.toMatch(/^import (?!type)[^;]*scenes\//m);
    }
    expect(source("components/admin/three/admin-stage.tsx")).toContain('import("./stage")');
    expect(source("components/admin/dashboard/constellation.tsx")).toContain('import("@/components/admin/three/scenes/constellation-scene")');
    expect(source("components/admin/events/analytics/heat-map-3d.tsx")).toContain('import("@/components/admin/three/scenes/hall-scene")');
    // V4: the medal of the Vitrina and of a ceremony.
    expect(source("components/admin/game/medal-stage.tsx")).toContain('import("@/components/admin/three/scenes/medal-scene")');
  });

  test("every GPU resource of the kit goes through the stage, which disposes it", () => {
    const stage = source("components/admin/three/stage.ts");
    for (const call of ["renderer.dispose()", "renderer.forceContextLoss()", "canvas.remove()", "inView.disconnect()", "resize.disconnect()", "themeWatch.disconnect()", "cancelAnimationFrame(raf)", 'removeEventListener("visibilitychange"', 'removeEventListener("webglcontextlost"']) {
      expect(stage, call).toContain(call);
    }
    // A geometry, a material, a texture or a render target made outside `stage.track(…)` would outlive the scene.
    for (const file of ["components/admin/three/particles.ts", "components/admin/three/scenes/constellation-scene.ts", "components/admin/three/scenes/hall-scene.ts", "components/admin/three/scenes/medal-scene.ts"]) {
      expect(untrackedResources(source(file)), file).toEqual([]);
    }
  });
});

describe("V5: the WebGL probe and the life cycle of the stage", () => {
  const source = (file: string) => readFileSync(join(process.cwd(), file), "utf8");

  test("the probe is asked only inside start(), after the 2D view was ruled out, never with the user's choice", () => {
    const text = source("components/admin/three/admin-stage.tsx");
    const calls = [...text.matchAll(/sessionQuality\(/g)].map((match) => match.index ?? -1);
    // One import mention is not a call; the one call is `sessionQuality(null)` inside the start function.
    expect(text.match(/sessionQuality\([^)]*\)/g)).toEqual(["sessionQuality(null)"]);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toBeGreaterThan(text.indexOf("const start = async"));
    expect(text.indexOf("viewIs2D({ flat, width: window.innerWidth, flatBelow, pinned })")).toBeLessThan(text.indexOf("const start = async"));
  });

  test("a scene is disposed before its stage, and nothing throws out of the cleanup", () => {
    const text = source("components/admin/three/admin-stage.tsx");
    expect(text).toMatch(/try \{\s*created\?\.dispose\(\);\s*\} catch \{[^}]*\} finally \{\s*try \{\s*stage\?\.dispose\(\);/);
    // Both places (the failure and the cleanup of the effect) go through that function.
    expect(text.match(/release\(created, stage\)/g)).toHaveLength(2);
    expect(text).not.toMatch(/^\s*created\?\.dispose\(\);\s*\n\s*stage\?\.dispose\(\);/m);
  });

  test("one warm-up frame is drawn after the compile and before the canvas goes live", () => {
    const text = source("components/admin/three/admin-stage.tsx");
    const compile = text.indexOf("await stage.compile()");
    const warm = text.indexOf("stage.warm()");
    const live = text.indexOf('setMode("live")');
    expect(compile).toBeGreaterThan(-1);
    expect(warm).toBeGreaterThan(compile);
    expect(live).toBeGreaterThan(warm);
    // The warm-up calls no frame listener, counts no frame and feeds no regulator.
    const stage = source("components/admin/three/stage.ts");
    const body = stage.slice(stage.indexOf("    warm() {"), stage.indexOf("    dispose() {"));
    expect(body).toContain("customRender(0)");
    for (const forbidden of ["frameListeners", "frames +=", "regulate(", "regulator"]) expect(body, forbidden).not.toContain(forbidden);
  });

  test("the stages are paused and resumed by the pure rule on every create and dispose", () => {
    const stage = source("components/admin/three/stage.ts");
    expect(stage).toContain('from "@/lib/admin-v2/three/exclusive"');
    expect(stage.match(/syncRunning\(\);/g)).toHaveLength(2);
  });

  test("the session knows nothing about WebGL until it was probed, and the probe is the only thing that learns it", async () => {
    vi.resetModules();
    vi.stubGlobal("window", { innerWidth: 1280 });
    vi.stubGlobal("navigator", { hardwareConcurrency: 8 });
    const created: string[] = [];
    vi.stubGlobal("document", {
      createElement: (tag: string) => {
        created.push(tag);
        return { getContext: () => null };
      },
    });
    try {
      const { sessionQuality, stageSession } = await import("./stage-session");
      expect(stageSession.webglKnown()).toBeNull();
      stageSession.contextLost();
      stageSession.downgrade();
      expect(stageSession.webglKnown()).toBeNull();
      expect(created).toEqual([]);
      expect(sessionQuality(null)).toBe("off");
      expect(created).toEqual(["canvas"]);
      expect(stageSession.webglKnown()).toBe(false);
      // Asked once: a second answer comes from the first probe.
      sessionQuality(null);
      expect(created).toEqual(["canvas"]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

/** A GPU resource of three that owns memory until `dispose()`: it has to be made inside `stage.track(…)`. */
const GPU_RESOURCE = /\bnew (?:THREE\.)?(?:\w*Geometry|\w*Material|\w*Texture|\w*RenderTarget)\(/;

/**
 * The lines of a scene that make a GPU resource outside `stage.track(…)`: on the same line, or on a line of a call
 * `stage.track(` that was opened up to three lines above (a material in several lines, a ternary of two materials).
 */
function untrackedResources(text: string): string[] {
  const lines = text.split("\n");
  return lines.filter((line, index) => {
    if (!GPU_RESOURCE.test(line) || /stage\.track\(/.test(line)) return false;
    return !lines.slice(Math.max(0, index - 3), index).some((above) => /stage\.track\($/.test(above.trimEnd()));
  });
}

describe("the guard for resources a scene must hand to the stage", () => {
  test("a texture or a render target made without stage.track(…) is found", () => {
    const broken = [
      "const map = new THREE.CanvasTexture(canvas);",
      "const data = new THREE.DataTexture(pixels, 4, 4);",
      "const plain = new THREE.Texture(image);",
      "const target = new THREE.WebGLRenderTarget(256, 256);",
      "const cube = new THREE.WebGLCubeRenderTarget(128);",
      "const volume = new THREE.Data3DTexture(pixels, 2, 2, 2);",
      "const geometry = new THREE.PlaneGeometry(1, 1);",
      "const material = new THREE.MeshBasicMaterial({ color: 0 });",
    ];
    for (const line of broken) expect(untrackedResources(line), line).toEqual([line]);
  });

  test("a resource inside stage.track(…) passes, on one line or in several", () => {
    expect(untrackedResources("const map = stage.track(new THREE.CanvasTexture(canvas));")).toEqual([]);
    expect(untrackedResources("const target = own(stage.track(new THREE.WebGLRenderTarget(256, 256)));")).toEqual([]);
    expect(untrackedResources(["const material = stage.track(", "  new THREE.ShaderMaterial({", "    vertexShader: VERTEX,", "  }),", ");"].join("\n"))).toEqual([]);
    expect(
      untrackedResources(["const material = stage.track(", "  orbit === 4", "    ? new THREE.LineDashedMaterial({ dashSize: 1 })", "    : new THREE.LineBasicMaterial({ opacity: 1 }),", ");"].join("\n")),
    ).toEqual([]);
  });

  test("a material in several lines without stage.track(… above it is found", () => {
    const broken = ["const material =", "  new THREE.ShaderMaterial({", "    vertexShader: VERTEX,", "  });"].join("\n");
    expect(untrackedResources(broken)).toEqual(["  new THREE.ShaderMaterial({"]);
  });

  test("a resource made far below an unrelated stage.track( is still found", () => {
    const broken = ["const a = stage.track(", "  new THREE.BufferGeometry(),", ");", "const b = 1;", "const c = 2;", "const map = new THREE.CanvasTexture(canvas);"].join("\n");
    expect(untrackedResources(broken)).toEqual(["const map = new THREE.CanvasTexture(canvas);"]);
  });
});

describe("„Sazvežđe | Samo lista“ is kept in this browser", () => {
  const memory = () => {
    const values = new Map<string, string>();
    return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => void values.set(key, value), removeItem: (key: string) => void values.delete(key), values };
  };

  test("the Constellation is the default; the list is remembered and can be taken back", () => {
    const storage = memory();
    expect(readDashboardHero(storage)).toBe("constellation");
    expect(writeDashboardHero(storage, "list")).toBe(true);
    expect(storage.values.get(DASHBOARD_HERO_KEY)).toBe("list");
    expect(readDashboardHero(storage)).toBe("list");
    expect(writeDashboardHero(storage, "constellation")).toBe(true);
    expect(storage.values.has(DASHBOARD_HERO_KEY)).toBe(false);
    expect(readDashboardHero(storage)).toBe("constellation");
  });

  test("a storage that throws or is missing means the default, never an error", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(readDashboardHero(broken)).toBe("constellation");
    expect(writeDashboardHero(broken, "list")).toBe(false);
    expect(readDashboardHero(null)).toBe("constellation");
    expect(writeDashboardHero(undefined, "list")).toBe(false);
    expect(readDashboardHero({ getItem: () => "nesto-drugo" })).toBe("constellation");
  });
});
