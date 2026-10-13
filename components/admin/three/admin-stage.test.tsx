import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { DASHBOARD_HERO_KEY, readDashboardHero, writeDashboardHero } from "@/components/admin/dashboard/hero-choice";
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
    const mount = html().match(/<div data-stage-mount="" class="([^"]*)"><\/div>/)?.[1] ?? "";
    expect(mount).toContain("opacity-0");
    expect(mount).toContain("pointer-events-none");
    // The fade of the canvas is of the reveal layer and stands with reduced motion.
    expect(mount).toContain("motion-reduce:transition-none");
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
    // A geometry or a material made outside `stage.track(…)` would outlive the scene.
    for (const file of ["components/admin/three/particles.ts", "components/admin/three/scenes/constellation-scene.ts", "components/admin/three/scenes/hall-scene.ts", "components/admin/three/scenes/medal-scene.ts"]) {
      const untracked = source(file).split("\n").filter((line) => /new THREE\.(\w*Geometry|\w*Material)\(/.test(line) && !/stage\.track\(|^\s*(\?|:)\s*new THREE\.|^\s*new THREE\.\w+Material\(\{/.test(line));
      expect(untracked, file).toEqual([]);
    }
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
