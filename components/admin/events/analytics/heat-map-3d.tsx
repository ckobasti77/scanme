"use client";

import { RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AdminStage, type StageScene, type StageSceneModule } from "@/components/admin/three/admin-stage";
import type { HallSceneProps } from "@/components/admin/three/scenes/hall-scene";
import type { HeatScene } from "@/lib/admin-v2/analytics/heat-blocks";
import type { HallImpulse, HallSeries, TimelapsePlayer } from "@/lib/admin-v2/hall/types";
import { cn } from "@/lib/utils";

// ADMIN v3 V3 — the hall heat map in 3D, on the 3D kit (ZADATAK-V3 §3.2). This
// file is the React side only and never imports `three`: the kit loads the
// stage and `scenes/hall-scene.ts` through `import()` when the hall is near the
// screen and the page has entered. Until then, and whenever WebGL cannot run,
// the 2D picture of the same data stands in the same box. The scene draws the
// columns, their glowing tops, the beams and the particles; the labels of the
// stands and „Vrati pogled“ are DOM over it. The text equivalent is the list
// (or the rank) of the stands under the map and the table twin of the chart.

const loadScene = () => import("@/components/admin/three/scenes/hall-scene") as Promise<StageSceneModule<HallSceneProps>>;

const NO_IMPULSES: readonly HallImpulse[] = [];
const NO_AMBIENT: ReadonlyMap<string, number> = new Map();
const LIVE: TimelapsePlayer = { mode: "live" };

export default function HeatMap3D({
  scene,
  series = null,
  player = LIVE,
  picked,
  onPick,
  onUnavailable,
  impulses = NO_IMPULSES,
  ambient = NO_AMBIENT,
  label,
  resetLabel,
  blockLabel,
  fallback,
  mini = false,
  flatBelow = 0,
  flat = false,
  className,
}: {
  scene: HeatScene;
  /** The hourly read of the shown day: the layers of the columns and the Vremeplov. */
  series?: HallSeries | null;
  player?: TimelapsePlayer;
  picked: string | null;
  onPick: (locationId: string | null) => void;
  /** WebGL could not start or its context was lost: the parent goes back to the 2D map. */
  onUnavailable?: () => void;
  /** The new scans of the last poll (a new array is a new burst of light). */
  impulses?: readonly HallImpulse[];
  /** The calm state: particles per second per map location. */
  ambient?: ReadonlyMap<string, number>;
  label: string;
  resetLabel?: string;
  /** The text over a column (the stand and its number); null = no label. */
  blockLabel?: (block: HeatScene["blocks"][number]) => string | null;
  /** The 2D picture of the same data: shown until the scene runs and whenever it cannot. */
  fallback: ReactNode;
  /** The excerpt on Pregled: no orbit, no pick, no labels. */
  mini?: boolean;
  /** Below this window width (px) the 2D picture stays. */
  flatBelow?: number;
  /** The user chose the 2D view: the scene is not loaded. */
  flat?: boolean;
  className?: string;
}) {
  const [live, setLive] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const pick = useRef(onPick);
  useEffect(() => {
    pick.current = onPick;
  });
  const onScenePick = useCallback((locationId: string | null) => pick.current(locationId), []);
  const sceneProps = useMemo<HallSceneProps>(
    () => ({ floor: scene, series, player, picked, impulses, ambient, mini, resetKey, onPick: onScenePick }),
    [scene, series, player, picked, impulses, ambient, mini, resetKey, onScenePick],
  );
  const onScene = useCallback((next: StageScene<HallSceneProps> | null) => setLive(next !== null), []);

  return (
    <AdminStage
      load={loadScene}
      sceneProps={sceneProps}
      flatBelow={flatBelow}
      flat={flat}
      onScene={onScene}
      onUnavailable={onUnavailable}
      summary={<p className="sr-only">{label}</p>}
      fallback={fallback}
      className={cn("min-w-0 rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface-strong)]", className)}
    >
      <div data-heat-3d="" data-heat-3d-state={live ? "live" : "flat"} className="pointer-events-none absolute inset-0">
        {!mini && blockLabel
          ? scene.blocks.map((block) => {
              const text = blockLabel(block);
              return text === null ? null : (
                <span
                  key={block.locationId}
                  aria-hidden="true"
                  data-block-label={block.locationId}
                  className="absolute top-0 left-0 rounded-md border border-[var(--admin-border)] bg-[var(--admin-surface-strong)] px-1.5 py-0.5 text-[0.6875rem] leading-4 font-bold whitespace-nowrap text-[var(--admin-text)] tabular-nums opacity-0 shadow-[var(--admin-shadow-xs)] transition-opacity duration-[var(--admin-dur-2)] motion-reduce:transition-none"
                >
                  {text}
                </span>
              );
            })
          : null}
        {!mini && live && resetLabel ? (
          <button
            type="button"
            onClick={() => setResetKey((key) => key + 1)}
            className="pointer-events-auto absolute top-2 right-2 inline-flex min-h-11 items-center gap-1.5 rounded-full border border-[var(--admin-border)] bg-[var(--admin-surface-strong)] px-3 text-xs font-semibold text-[var(--admin-text)] hover:bg-[var(--admin-surface-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-focus)] lg:min-h-8"
          >
            <RotateCcw aria-hidden="true" className="size-3.5" />
            {resetLabel}
          </button>
        ) : null}
      </div>
    </AdminStage>
  );
}
