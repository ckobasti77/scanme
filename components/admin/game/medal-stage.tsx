"use client";

import { useMemo } from "react";
import { AdminStage, type StageSceneModule } from "@/components/admin/three/admin-stage";
import { stageSession } from "@/components/admin/three/stage-session";
import type { MedalSceneProps } from "@/components/admin/three/scenes/medal-scene";
import type { Rarity } from "@/lib/admin-v2/game/ids";
import type { MedalArt } from "@/lib/admin-v2/game/medal-art";
import { cn } from "@/lib/utils";
import { Medal2D } from "./medal-2d";

// ADMIN v3 V4 — the 3D medal on the stage of the kit. It never imports `three`:
// the scene arrives through `import()` (lib/admin-v2/three/import-boundary.test.ts).
// Until it does, and always on a phone or where WebGL does not run, the 2D medal
// of the same badge is shown. The scene is asked for at once (the Vitrina was
// opened on purpose) and it stops every other scene while it lives. The box is a
// square cut to a circle: the canvas is opaque, and the circle keeps its corners
// from showing as a lighter box.

/** Below this window width (px) the medal stays 2D. */
const FLAT_BELOW = 768;

let sceneReady = false;
const loadScene = () =>
  (import("@/components/admin/three/scenes/medal-scene") as Promise<StageSceneModule<MedalSceneProps>>).then((module) => {
    sceneReady = true;
    return module;
  });

/** The chunk of the medal scene is in this tab: a ceremony may show the 3D medal without waiting for the network. */
export const medalSceneReady = () => sceneReady;

/**
 * Brings the medal scene in ahead of a ceremony, but only on a page that already loaded the 3D kit
 * (a scene of its own); a page without one never asks for `three` because of a ceremony.
 */
export function warmMedalScene(): () => void {
  return stageSession.onKitLoaded(() => {
    if (!sceneReady) void loadScene().catch(() => undefined);
  });
}

export function MedalStage({
  art,
  rarity,
  locked = false,
  mode,
  className,
}: {
  art: MedalArt;
  rarity: Rarity;
  locked?: boolean;
  mode: "showcase" | "ceremony";
  className?: string;
}) {
  const sceneProps = useMemo<MedalSceneProps>(() => ({ art, rarity, locked, mode }), [art, rarity, locked, mode]);
  return (
    <div data-medal-stage="" className={cn("aspect-square overflow-hidden rounded-full", className)}>
      <AdminStage
        load={loadScene}
        sceneProps={sceneProps}
        flatBelow={FLAT_BELOW}
        eager
        exclusive
        className="size-full"
        fallback={
          // The coin of the scene fills 70 % of the box: the 2D medal is the same size, so the canvas fades in without a jump.
          <div className="size-full p-[15%]">
            <Medal2D art={art} rarity={rarity} locked={locked} className="size-full" />
          </div>
        }
      />
    </div>
  );
}
