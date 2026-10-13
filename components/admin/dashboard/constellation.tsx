"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AdminStage, type StageScene, type StageSceneModule } from "@/components/admin/three/admin-stage";
import type { ConstellationSceneProps } from "@/components/admin/three/scenes/constellation-scene";
import { ORBIT_RADIUS, flatProject } from "@/lib/admin-v2/constellation/geometry";
import { orbitLayout } from "@/lib/admin-v2/constellation/layout";
import type { ConstellationCounts, ConstellationItem, ConstellationLayout, Star } from "@/lib/admin-v2/constellation/types";
import { fmt } from "@/lib/i18n/format";
import { adminV1Sr } from "@/lib/i18n/sr/admin-v1";
import { cn } from "@/lib/utils";
import { Constellation2D } from "./constellation-2d";
import { ConstellationSummary } from "./constellation-summary";

// ADMIN v3 V2 — the Constellation as the hero of the Dashboard: the 3D scene
// (loaded lazily by the kit), its 2D fallback, the text equivalent and the
// tooltip of a star. It shows the work, it does not replace it: the list „Za
// reakciju“ stays below, and a click on a star does what the main action of
// its row does. Nothing here is a tab stop: the list is the keyboard path, and
// a focused row lights up its star.

/** Below this window width (px) the Constellation is the 2D picture. */
const FLAT_BELOW = 768;

const loadScene = () => import("@/components/admin/three/scenes/constellation-scene") as Promise<StageSceneModule<ConstellationSceneProps>>;

const moreMark = (count: number) => fmt(adminV1Sr.dashboardConstellationMoreMark, { count });

/** Where a star is on the host: asked by the tooltip and by the aim line of the list. */
export type StarProjector = (id: string) => { x: number; y: number } | null;

export type ConstellationHandle = {
  /** The element the positions of `project` are relative to. */
  host: HTMLElement | null;
  project: StarProjector;
};

export function Constellation({
  items,
  counts,
  now,
  hpMax,
  aimed,
  onStarHover,
  onPick,
  tooltip,
  onHandle,
  className,
}: {
  items: readonly ConstellationItem[];
  counts: ConstellationCounts | null;
  now: number;
  /** The largest backlog seen while the page is open. */
  hpMax: number;
  /** The star lit from its row of the list. */
  aimed: string | null;
  onStarHover: (id: string | null) => void;
  onPick: (star: Star) => void;
  /** What the tooltip of a star says (the same as its row). */
  tooltip: (star: Star) => ReactNode;
  /** Called when the way to place things over the stars changes (the 2D picture, then the scene). */
  onHandle?: (handle: ConstellationHandle) => void;
  className?: string;
}) {
  const layout = useMemo<ConstellationLayout>(() => orbitLayout(items, counts, now, hpMax), [items, counts, now, hpMax]);
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<StageScene<ConstellationSceneProps> | null>(null);
  const latest = useRef({ layout, onPick, onStarHover });
  const [hovered, setHovered] = useState<{ star: Star; x: number; y: number; width: number } | null>(null);

  useEffect(() => {
    latest.current = { layout, onPick, onStarHover };
  });

  const project = useCallback<StarProjector>((id) => {
    const live = scene.current?.project?.(id);
    if (live) return live;
    const star = latest.current.layout.stars.find((candidate) => candidate.id === id);
    const box = host.current?.getBoundingClientRect();
    return star && box ? flatProject(star.angle, ORBIT_RADIUS[star.orbit], box.width, box.height) : null;
  }, []);

  const onHover = useCallback(
    (id: string | null) => {
      latest.current.onStarHover(id);
      const star = id ? latest.current.layout.stars.find((candidate) => candidate.id === id) : undefined;
      const point = star ? project(star.id) : null;
      setHovered(star && point ? { star, ...point, width: host.current?.clientWidth ?? 0 } : null);
    },
    [project],
  );
  const pick = useCallback((id: string) => {
    const star = latest.current.layout.stars.find((candidate) => candidate.id === id);
    if (star) latest.current.onPick(star);
  }, []);

  const sceneProps = useMemo<ConstellationSceneProps>(
    () => ({ layout, total: counts?.total ?? null, aimed, onHover, onPick: pick }),
    [layout, counts, aimed, onHover, pick],
  );

  const announce = useCallback(() => onHandle?.({ host: host.current, project }), [onHandle, project]);
  useEffect(announce, [announce, layout]);
  const onScene = useCallback(
    (next: StageScene<ConstellationSceneProps> | null) => {
      scene.current = next;
      announce();
    },
    [announce],
  );

  // A star that has left while the pointer stood on it has nothing to say any more.
  const shown = hovered && layout.stars.some((star) => star.id === hovered.star.id) ? hovered : null;
  // The tooltip stays inside the host: near an edge it is pinned to it, near the top it goes below the star.
  const half = 124;
  const left = shown ? Math.min(Math.max(shown.x, half), Math.max(half, shown.width - half)) : 0;
  const below = shown ? shown.y < 96 : false;

  return (
    <div ref={host} data-constellation="" className={cn("relative min-w-0", className)}>
      <AdminStage
        load={loadScene}
        sceneProps={sceneProps}
        flatBelow={FLAT_BELOW}
        onScene={onScene}
        className="h-full w-full"
        summary={<ConstellationSummary counts={counts} />}
        fallback={<Constellation2D layout={layout} aimed={aimed ?? shown?.star.id ?? null} onHover={onHover} onPick={pick} moreMark={moreMark} />}
      >
        {shown ? (
          <div
            aria-hidden="true"
            data-constellation-tooltip=""
            style={{ left, top: shown.y }}
            className={cn(
              "pointer-events-none absolute z-10 w-max max-w-[15rem] -translate-x-1/2 rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface-strong)] px-3 py-2 text-left shadow-[var(--admin-shadow-md)]",
              below ? "translate-y-4" : "-translate-y-[calc(100%+1rem)]",
            )}
          >
            {tooltip(shown.star)}
          </div>
        ) : null}
      </AdminStage>
    </div>
  );
}
