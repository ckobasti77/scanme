"use client";

import { useRef } from "react";
import { useAdminFlip } from "@/components/admin/admin-ui/use-admin-flip";
import { chartFocusRing } from "@/components/admin/events/analytics/chart-kit";
import { countOf } from "@/lib/admin-v2/analytics/format";
import { chartColor } from "@/lib/admin-v2/analytics/palette";
import type { HallRankRow } from "@/lib/admin-v2/hall/types";
import { fmt } from "@/lib/i18n/format";
import { adminEventsSr } from "@/lib/i18n/sr/admin-events";
import { cn } from "@/lib/utils";

// ADMIN v3 V3 — the rank beside the hall at the shown moment of the Vremeplov
// (ZADATAK-V3 §3.2): the stands in the given order (the player sorts them), a
// thin bar scaled to the largest total of the day, a click picks the stand. The
// list re-orders with the v2 FLIP; the bar only ever changes `transform`.

const v = adminEventsSr.analytics.v2.timelapse;
const units = adminEventsSr.analytics.v2.units;

export type TimelapseRankProps = {
  rows: readonly HallRankRow[];
  /** The clock of the rank, "14:00". */
  time: string;
  /** The scale of the bars (the largest total of the day). */
  max: number;
  picked: string | null;
  onPick: (locationId: string | null) => void;
};

/** The scale of a bar: 0 … 1, 0 when there is no scale. */
const barScale = (scans: number, max: number) => (max > 0 ? Number(Math.min(1, Math.max(0, scans / max)).toFixed(4)) : 0);

export function TimelapseRank({ rows, time, max, picked, onPick }: TimelapseRankProps) {
  const list = useRef<HTMLOListElement>(null);
  useAdminFlip(list, "[data-rank-row]", rows.map((row) => row.locationId).join(","));
  return (
    <section aria-label={v.rankTitle} data-timelapse-rank-section="" className="grid min-w-0 gap-1.5">
      <div className="flex min-w-0 items-baseline justify-between gap-3">
        <h3 className="text-xs font-bold tracking-[0.08em] text-[var(--admin-text-muted)] uppercase">{v.rankTitle}</h3>
        <span className="text-xs text-[var(--admin-text-muted)] tabular-nums">{fmt(v.rankAt, { time })}</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-[var(--admin-text-muted)]">{fmt(v.rankEmpty, { time })}</p>
      ) : (
        <ol ref={list} data-timelapse-rank="" className="grid min-w-0 gap-1 @2xl:grid-cols-2">
          {rows.map((row) => {
            const on = picked === row.locationId;
            return (
              <li key={row.locationId} data-rank-row={row.locationId} className="min-w-0">
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => onPick(on ? null : row.locationId)}
                  className={cn(
                    "grid min-h-11 w-full min-w-0 grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 rounded-lg border px-2 py-1.5 text-left text-sm tabular-nums lg:min-h-9",
                    on ? "border-[var(--admin-text)]" : "border-transparent hover:bg-[var(--admin-surface-muted)]",
                    chartFocusRing,
                  )}
                >
                  <span className="text-[var(--admin-text-muted)]">{row.place}</span>
                  <span className="min-w-0 [overflow-wrap:anywhere]">{fmt(v.rankRow, { stand: row.label })}</span>
                  <span className="text-right whitespace-nowrap">{countOf(row.scans, units.scans)}</span>
                  <span aria-hidden="true" data-rank-bar="" className="col-span-2 col-start-2 block h-[3px] overflow-hidden rounded-full bg-[var(--admin-border)]">
                    <span className="block h-full origin-left rounded-full" style={{ background: chartColor(1), transform: `scaleX(${barScale(row.scans, max)})` }} />
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
