"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useId, useMemo, useState, useSyncExternalStore } from "react";
import { AdminPanel } from "@/components/admin/admin-primitives";
import HeatMap3D from "@/components/admin/events/analytics/heat-map-3d";
import { HALL_3D_FROM, hallViewStore } from "@/components/admin/events/analytics/hall-view";
import { useHallMotion } from "@/components/admin/events/analytics/use-hall-timelapse";
import { countOf } from "@/lib/admin-v2/analytics/format";
import { heatBlocks, heatZoneIds, locationScans } from "@/lib/admin-v2/analytics/heat-blocks";
import type { AnalyticsData } from "@/lib/admin-v2/analytics/types";
import { ambientRates, scanImpulses } from "@/lib/admin-v2/hall/impulses";
import type { HallImpulse } from "@/lib/admin-v2/hall/types";
import { fairHeatColor } from "@/lib/fair-heat";
import { fairMapForEventCode, fairMapLocationTakesStands, fairMapPointsAttr, type FairMapGeometry } from "@/lib/fair-map";
import { fmt } from "@/lib/i18n/format";
import { adminEventsSr } from "@/lib/i18n/sr/admin-events";
import { cn } from "@/lib/utils";

// ADMIN v3 V3 — the excerpt of the Living hall on Pregled, while a fair day is
// open: the same columns and the same light as on Analitika, without controls
// (no orbit, no pick, no labels), and the link „Otvori Vremeplov“. Below 768 px
// and without WebGL it is the flat picture of the hall. The numbers per stand
// are on Analitika; here the sentence under the heading names the leading stand.

const w = adminEventsSr.analytics.v2.timelapse;
const NO_IMPULSES: readonly HallImpulse[] = [];
const noPick = () => {};

/** The hall from above in the colours of the heat: what stands in the box until (and whenever) the 3D scene does not. */
function HallFlat({ geometry, zoneIds, levels }: { geometry: FairMapGeometry; zoneIds: readonly string[]; levels: ReadonlyMap<string, number> }) {
  return (
    <div data-hall-mini-flat="" aria-hidden="true" className="flex h-full min-w-0 items-stretch justify-center gap-3 p-3">
      {geometry.zones.filter((zone) => zoneIds.includes(zone.id)).map((zone) => (
        <div key={zone.id} className="relative min-w-0 flex-1">
          <svg viewBox={`0 0 ${zone.image.width} ${zone.image.height}`} className="absolute inset-0 block h-full w-full">
          {zone.outline ? <polygon points={fairMapPointsAttr(zone.outline)} fill="var(--admin-surface-muted)" stroke="var(--admin-border)" strokeWidth={zone.image.width / 300} /> : null}
          {zone.locations.filter(fairMapLocationTakesStands).map((location) => {
            const level = levels.get(location.id);
            return (
              <polygon
                key={location.id}
                points={fairMapPointsAttr(location.polygon)}
                fill={level ? fairHeatColor(level) : "var(--admin-surface-strong)"}
                fillOpacity={level ? 0.9 : 1}
                stroke="var(--admin-text-muted)"
                strokeOpacity={0.45}
                strokeWidth={1.5 * (zone.image.width / 600)}
              />
            );
          })}
          </svg>
        </div>
      ))}
    </div>
  );
}

export function HallMini({ eventCode, data, href, className }: {
  eventCode: string;
  /** The analytics read of the event; undefined while it loads. */
  data: AnalyticsData | undefined;
  /** `analitika#mapa`: where „Otvori Vremeplov“ leads. */
  href: string;
  className?: string;
}) {
  const headingId = useId();
  const motion = useHallMotion();
  // „2D“ chosen for the hall on Analitika holds here too.
  const view = useSyncExternalStore(hallViewStore.subscribe, hallViewStore.get, hallViewStore.getServer);
  const geometry = fairMapForEventCode(eventCode);
  const rows = data?.heat.today;
  const scansNow = useMemo(() => (data ? locationScans(data.models, "today") : null), [data]);
  const zoneIds = useMemo(() => {
    if (!geometry || !rows) return [];
    const hot = heatZoneIds(geometry, rows);
    return hot.length ? hot : geometry.zones.map((zone) => zone.id);
  }, [geometry, rows]);
  const scene = useMemo(() => (geometry && rows && scansNow ? heatBlocks(geometry, rows, scansNow, zoneIds) : null), [geometry, rows, scansNow, zoneIds]);
  const levels = useMemo(() => new Map((rows ?? []).map((row) => [row.locationId, row.level])), [rows]);
  const ambient = useMemo(() => ambientRates(new Map((data?.heat.hour ?? []).map((row) => [row.locationId, row.count]))), [data]);

  // The new scans of a poll are a burst of light from their stand (the first read and a new day are a state).
  const [seen, setSeen] = useState<{ day: string | null; scans: ReadonlyMap<string, number> | null; impulses: readonly HallImpulse[] }>({ day: null, scans: null, impulses: NO_IMPULSES });
  if (data && scansNow && seen.scans !== scansNow) {
    const next = seen.day === data.todayKey ? scanImpulses(seen.scans, scansNow) : [];
    setSeen({ day: data.todayKey, scans: scansNow, impulses: next.length ? next : seen.impulses });
  }

  const leader = scene?.blocks.reduce<{ label: string; value: number } | null>((best, block) => (block.value > (best?.value ?? 0) ? { label: block.label, value: block.value } : best), null) ?? null;
  if (!geometry) return null;

  return (
    <AdminPanel data-hall-mini="" aria-labelledby={headingId} className={cn("grid min-w-0 gap-3 p-4 sm:p-5", className)}>
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="grid min-w-0 gap-0.5">
          <h2 id={headingId} className="text-xs font-bold tracking-[0.08em] text-[var(--admin-text-muted)] uppercase">{w.miniTitle}</h2>
          <p className="text-base leading-6 font-semibold tracking-[-0.015em]">{w.miniQuestion}</p>
        </div>
        <Link href={href} data-open-timelapse="" className="inline-flex min-h-11 items-center gap-1 rounded-sm text-sm font-semibold underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-focus,var(--admin-ink))] lg:min-h-9">
          {w.miniOpen}
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
      {scene ? (
        <HeatMap3D
          scene={scene}
          picked={null}
          onPick={noPick}
          impulses={motion ? seen.impulses : NO_IMPULSES}
          ambient={ambient}
          label={w.miniLabel}
          fallback={<HallFlat geometry={geometry} zoneIds={zoneIds} levels={levels} />}
          mini
          flatBelow={HALL_3D_FROM}
          flat={view === "2d"}
          className="h-[16rem]"
        />
      ) : (
        <div data-admin-primitive="loading" role="status" aria-label={adminEventsSr.analytics.v2.loadingPart} className="h-[16rem] rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface-muted)]" />
      )}
      {data ? <p className="text-sm text-[var(--admin-text-muted)]">{leader ? fmt(w.miniSummary, { stand: leader.label, count: countOf(leader.value, adminEventsSr.analytics.v2.units.scans) }) : w.miniEmpty}</p> : null}
    </AdminPanel>
  );
}
