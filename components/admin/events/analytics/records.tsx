"use client";

import { Trophy } from "lucide-react";
import { useEffect, useRef } from "react";
import { countOf, hourLabel, lowerFirst } from "@/lib/admin-v2/analytics/format";
import { recordNews, recordsSeen, type FairRecords, type RecordsSeen } from "@/lib/admin-v2/analytics/records";
import { useGameApi } from "@/components/admin/game/game-context";
import { fmt } from "@/lib/i18n/format";
import { adminEventsSr } from "@/lib/i18n/sr/admin-events";
import { cn } from "@/lib/utils";

// ADMIN v2 X4 — a record as a small tag beside a chart and as a toast when a
// new one arrives (ZADATAK §5.4). A fact of the numbers, not a score: the name
// of the record in bold, its value in plain text, both in text tokens; the
// accent is only the icon and the thin border, so the tag reads without it.
// ADMIN v3 V4 — a new record goes to the game of the frame: it is a small
// ceremony beside the XP chip (the same toast as before where a ceremony cannot
// show, and outside a frame), and the hour record feeds the fair badges.

const d = adminEventsSr.analytics.v2;
const v = d.records;

export function RecordBadge({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <span
      data-record-badge=""
      className={cn(
        "inline-flex min-w-0 max-w-full flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-full border border-[var(--admin-medal-1)] px-2 py-0.5 text-xs leading-5 text-[var(--admin-text)]",
        className,
      )}
    >
      <Trophy aria-hidden="true" className="size-3.5 flex-none text-[var(--admin-medal-1)]" />
      <span className="font-semibold">{label}</span>
      <span className="text-[var(--admin-text-muted)]">{value}</span>
    </span>
  );
}

/** The words of the hour record in its tag; an hour that still runs says so, because its number can grow. */
export function hourRecordValue(record: Pick<NonNullable<FairRecords["hour"]>, "value" | "dayLabel" | "hour"> & { running?: boolean }): string {
  const value = fmt(v.hourValue, { scans: countOf(record.value, d.units.scans), day: lowerFirst(record.dayLabel), hour: hourLabel(record.hour) });
  return record.running ? fmt(v.hourRunning, { value }) : value;
}

/**
 * Toasts for the records that are new since the last look at this page. The
 * first look for a scope reports nothing; a new scope (another event or day)
 * starts over. The quiet mode says nothing about a record (as in v2).
 */
export function useRecordToasts(scope: string, records: FairRecords, leadsTotal: number): void {
  const seen = useRef<{ scope: string; value: RecordsSeen } | null>(null);
  const game = useGameApi();
  useEffect(() => {
    const last = seen.current?.scope === scope ? seen.current.value : null;
    for (const news of recordNews(last, records, leadsTotal)) {
      if (news.id === "hour" && records.hour) {
        game.celebrate({ key: news.key, title: fmt(v.toastHour, { scans: countOf(records.hour.value, d.units.scans), hour: hourLabel(records.hour.hour) }) });
        game.reportFair({ hourRecordSeen: true });
      } else if (news.id === "stand" && records.stand) {
        game.celebrate({ key: news.key, title: fmt(v.toastStand, { stand: records.stand.standCode }) });
      } else if (news.id === "firstLead") {
        game.celebrate({ key: news.key, title: v.toastFirstLead });
      }
    }
    seen.current = { scope, value: recordsSeen(records, leadsTotal, last) };
  }, [scope, records, leadsTotal, game]);
  // The facts the fair badges read: the record of an hour and the first lead of the event.
  const hourRecord = records.hour?.value ?? null;
  const firstLead = records.firstLead !== null;
  useEffect(() => {
    if (hourRecord !== null || firstLead) game.reportFair({ ...(hourRecord !== null ? { hourRecord } : {}), ...(firstLead ? { firstLead } : {}) });
  }, [game, hourRecord, firstLead]);
}
