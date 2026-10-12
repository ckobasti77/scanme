"use client";

import { Check, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useRef } from "react";
import { gsap, useAdminGsapLayout } from "@/components/admin/frame/use-admin-gsap";
import type { MissionConfirm } from "@/components/admin/admin-ui/use-mission-progress";
import { plural } from "@/lib/admin-v2/analytics/format";
import type { MissionBoard, MissionRow, MissionTone } from "@/lib/admin-v2/missions";
import { ringDash } from "@/lib/admin-v2/missions";
import { ADMIN_DURATION, ADMIN_EASE } from "@/lib/admin-v2/motion";
import { fmt } from "@/lib/i18n/format";
import { adminUiSr as dict } from "@/lib/i18n/sr/admin-ui";
import { cn } from "@/lib/utils";

// ADMIN v2 X4 — missions with progress (ZADATAK §5.1): the ring and „3 od 5
// misija rešeno“ of the day (missions, said so), the open missions with what
// was solved inside each („2 od 3“), the short confirmation of a solved one and
// „Sve čisto“. Presentational: the board and the confirmation come from
// useMissionProgress. The ring is never animated (it changes at once); only the
// confirmation moves, and only transform and opacity.

const m = dict.missions;
const RADIUS = 15.5;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/** The confirmation of a solved mission stays this long (seconds) before it fades. */
const CONFIRM_HOLD = 1.2;

const TONE_BADGE: Record<MissionTone, string> = {
  hitno: "border-[var(--admin-danger-border)] bg-[var(--admin-danger-soft)] text-[var(--admin-danger)]",
  uskoro: "border-[var(--admin-warning-border)] bg-[var(--admin-warning-soft)] text-[var(--admin-warning)]",
  info: "border-[var(--admin-border)] bg-[var(--admin-surface-muted)] text-[var(--admin-text-muted)]",
};

/** „1 od 4 misije rešeno“: the unit is written, so the number is never read as items. */
export function missionProgressText(board: Pick<MissionBoard, "done" | "total">): string {
  return fmt(m.progress, { done: board.done, total: board.total, noun: plural(board.total, m.units) });
}

/** What the confirmation says: a mission with nothing left is solved, otherwise only how far it is. */
export function missionConfirmText(confirm: MissionConfirm | null): string {
  if (!confirm?.items.length) return "";
  return confirm.items
    .map((item) => (item.complete ? fmt(m.resolved, { label: item.label }) : fmt(m.resolvedPart, { label: item.label, done: item.done, total: item.total })))
    .join(" · ");
}

/** The solved share of the day as a ring; a full ring wears a check. `label` names it, without one it is decoration. */
export function AdminMissionRing({ share, label, className }: { share: number; label?: string; className?: string }) {
  const full = share >= 1;
  return (
    <span data-mission-ring="" data-full={full ? "" : undefined} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true} className={cn("relative inline-grid size-7 flex-none place-items-center", className)}>
      <svg viewBox="0 0 36 36" className="size-full -rotate-90" aria-hidden="true">
        <circle cx="18" cy="18" r={RADIUS} fill="none" stroke="var(--admin-border)" strokeWidth="4" />
        {share > 0 ? <circle cx="18" cy="18" r={RADIUS} fill="none" stroke="var(--admin-nav-line)" strokeWidth="4" strokeLinecap={full ? "butt" : "round"} strokeDasharray={ringDash(share, CIRCUMFERENCE)} /> : null}
      </svg>
      {full ? <Check className="absolute size-[55%] text-[var(--admin-nav-current)]" strokeWidth={3} aria-hidden="true" /> : null}
    </span>
  );
}

/** The short confirmation of a solved mission: it covers the progress line for a moment, then gives it back. */
function Confirmation({ confirm }: { confirm: MissionConfirm | null }) {
  const ref = useRef<HTMLSpanElement>(null);
  const seq = confirm?.seq;
  useAdminGsapLayout(
    ({ reduced }) => {
      const element = ref.current;
      const line = element?.previousElementSibling;
      if (!element || !line) return;
      const timeline = gsap.timeline().to(line, { autoAlpha: 0, duration: ADMIN_DURATION.feedback, ease: ADMIN_EASE.in });
      // Reduced motion: the line only fades in and out; nothing rises and the check does not grow.
      if (reduced) {
        timeline.fromTo(element, { autoAlpha: 0 }, { autoAlpha: 1, duration: ADMIN_DURATION.move, ease: ADMIN_EASE.out });
      } else {
        timeline
          .fromTo(element, { autoAlpha: 0, y: 4 }, { autoAlpha: 1, y: 0, duration: ADMIN_DURATION.move, ease: ADMIN_EASE.out })
          .fromTo(element.firstElementChild, { scale: 0.6 }, { scale: 1, duration: ADMIN_DURATION.move, ease: ADMIN_EASE.out }, "<");
      }
      timeline
        .to(element, { autoAlpha: 0, duration: ADMIN_DURATION.state, ease: ADMIN_EASE.in }, `+=${CONFIRM_HOLD}`)
        .to(line, { autoAlpha: 1, duration: ADMIN_DURATION.state, ease: ADMIN_EASE.out, clearProps: "opacity,visibility" });
    },
    [seq],
  );
  const text = missionConfirmText(confirm);
  if (!confirm || !text) return null;
  return (
    <span key={confirm.seq} ref={ref} data-mission-confirm="" aria-hidden="true" title={text} className="invisible absolute inset-0 flex min-w-0 items-center gap-1.5 text-sm font-semibold">
      <CheckCircle2 className="size-4 flex-none text-[var(--admin-success)]" aria-hidden="true" />
      <span className="min-w-0 truncate">{text}</span>
    </span>
  );
}

/** The ring and „3 od 5 misija rešeno“ of the day; `title` names the ring for assistive technology. */
export function AdminMissionSummary({ title, board, confirm = null, className }: { title: string; board: MissionBoard; confirm?: MissionConfirm | null; className?: string }) {
  const noun = plural(board.total, m.units);
  return (
    <div data-mission-summary="" className={cn("flex min-w-0 items-center gap-2", className)}>
      <AdminMissionRing share={board.share} label={fmt(m.progressAria, { title, done: board.done, total: board.total, noun })} />
      <span className="relative min-w-0 flex-1">
        <span aria-hidden="true" className="block truncate text-sm font-semibold tabular-nums">{missionProgressText(board)}</span>
        <Confirmation confirm={confirm} />
      </span>
      {/* Always in the DOM, so the confirmation is announced when its text arrives. */}
      <span role="status" className="sr-only">{missionConfirmText(confirm)}</span>
    </div>
  );
}

function Row({ mission, row }: { mission: MissionRow; row: string }) {
  const progress = mission.progress;
  // A limited read gives "at least this many": the number says so.
  const count = mission.capped ? fmt(m.capped, { count: mission.count }) : String(mission.count);
  const content = (
    <>
      <span className="min-w-0 flex-1 truncate">{mission.label}</span>
      {progress && progress.done > 0 ? (
        <span data-mission-progress="" className="shrink-0 text-xs text-[var(--admin-text-muted)] tabular-nums">
          <span aria-hidden="true">{fmt(m.rowProgress, progress)}</span>
          <span className="sr-only">{fmt(m.rowProgressAria, progress)}</span>
        </span>
      ) : null}
      <span data-urgency={mission.tone} className={cn("inline-flex min-w-5 shrink-0 items-center justify-center rounded-full border px-1.5 text-[0.68rem] leading-5 font-bold tabular-nums", TONE_BADGE[mission.tone])}>
        <span aria-hidden="true">{count}</span>
        <span className="sr-only">{fmt(dict.urgency[mission.tone], { count })}</span>
      </span>
    </>
  );
  const className = cn("flex min-w-0 items-center justify-between gap-2 rounded-lg px-2 text-sm", row);
  return (
    <li data-mission={mission.id} className="min-w-0">
      {mission.href ? <Link href={mission.href} className={cn(className, "hover:bg-[var(--admin-surface-muted)]")}>{content}</Link> : <div className={className}>{content}</div>}
    </li>
  );
}

/** „Sve čisto“: a celebration the first time of the day, one calm line after that. */
export function AdminMissionClear({ board, emptyText, className }: { board: MissionBoard; emptyText: string; className?: string }) {
  if (board.clear === "celebrate") {
    return (
      <div data-mission-clear="celebrate" role="status" className={cn("flex min-w-0 items-start gap-2.5 rounded-lg border border-[var(--admin-success-border)] bg-[var(--admin-success-soft)] p-3", className)}>
        <AdminMissionRing share={1} className="mt-0.5" />
        <div className="min-w-0">
          <p className="text-sm font-semibold">{m.clearTitle}</p>
          <p className="mt-0.5 text-xs leading-5 text-[var(--admin-text)]">{m.clearBody} {missionProgressText(board)}.</p>
        </div>
      </div>
    );
  }
  return (
    <p data-mission-clear={board.clear} className={cn("px-2 py-1.5 text-sm leading-5 text-[var(--admin-text-muted)]", className)}>
      {board.clear === "quiet" ? `${m.clearQuiet} ${missionProgressText(board)}.` : emptyText}
    </p>
  );
}

/** The missions block of a sidebar: the day's progress, then what still waits (the most urgent first). */
export function AdminMissionList({ title, board, confirm = null, pending = false, row, emptyText }: {
  title: string;
  board: MissionBoard;
  confirm?: MissionConfirm | null;
  /** The numbers are being replaced: only the rows are shown, no progress and no all-clear is claimed. */
  pending?: boolean;
  /** Height class of a row (36 px in the sidebar, 44 px in the drawer). */
  row: string;
  emptyText: string;
}) {
  return (
    <>
      {board.clear === "open" && !pending ? <AdminMissionSummary title={title} board={board} confirm={confirm} className="px-2 pb-1" /> : null}
      {board.rows.length ? (
        <ul className="grid min-w-0 gap-0.5">
          {board.rows.map((mission) => <Row key={mission.id} mission={mission} row={row} />)}
        </ul>
      ) : null}
      {board.clear === "open" || pending ? null : <AdminMissionClear board={board} emptyText={emptyText} className={board.rows.length ? "mt-1" : undefined} />}
    </>
  );
}
