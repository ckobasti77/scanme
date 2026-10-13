import type { OperatorView, StreakView } from "@/lib/admin-v2/game/types";
import { fmt } from "@/lib/i18n/format";
import { adminGameSr as d } from "@/lib/i18n/sr/admin-game";
import { cn } from "@/lib/utils";
import { StreakFlame } from "./streak-flame";

// ADMIN v3 V4 — the permanent „Operater“ row at the bottom of the sidebar, above
// the HUD „Danas“, and in the drawer on a phone (plan §6.11): the rank and the
// level, the bar to the next level (OperatorView.into of .span, so the XP is the
// one of the server journal), the XP of today, and the flame of the streak.
// The whole block opens the Vitrina: the button stretches over it, while the bar
// stays outside the button so it keeps its meaning for assistive technology.

// The dictionary sentence ends with its own full stop, so the one the date format closes with is dropped.
const sinceFormat = new Intl.DateTimeFormat("sr-Latn-RS", { day: "numeric", month: "numeric", year: "numeric", timeZone: "Europe/Belgrade" });

export function OperatorRow({ operator, streak, onOpen, className }: { operator: OperatorView | null; streak: StreakView | null; onOpen: () => void; className?: string }) {
  if (!operator) return null;
  const progress = fmt(d.operator.progress, { into: operator.into, span: operator.span, next: operator.level + 1 });
  const share = Math.min(1, Math.max(0, operator.share));
  return (
    <section data-admin-operator="" aria-label={d.operator.title} className={cn("grid min-w-0 gap-1.5 border-t border-[var(--admin-border)] px-5 py-3", className)}>
      <div className="flex min-w-0 items-center justify-between gap-2">
        <p className="text-[0.67rem] font-bold tracking-[0.08em] text-[var(--admin-text-muted)] uppercase">{d.operator.title}</p>
        {streak ? <StreakFlame streak={streak} /> : null}
      </div>
      <div className="relative -mx-2 grid min-w-0 gap-1.5 rounded-lg px-2 py-1 transition-colors duration-150 hover:bg-[var(--admin-surface-muted)]">
        <button
          type="button"
          onClick={onOpen}
          aria-label={fmt(d.operator.chip, { rank: d.ranks[operator.rank], level: operator.level })}
          // The target is the whole block (the overlay), well above 44 px; the line itself stays as tall as its text.
          className="flex min-w-0 items-baseline justify-between gap-2 rounded-lg text-left after:absolute after:inset-0 after:rounded-lg after:content-['']"
        >
          <span className="min-w-0 truncate text-sm font-semibold">{d.ranks[operator.rank]}</span>
          <span className="flex-none text-sm text-[var(--admin-text-muted)] tabular-nums">{fmt(d.operator.level, { level: operator.level })}</span>
        </button>
        <div
          role="progressbar"
          aria-label={d.operator.progressLabel}
          aria-valuemin={0}
          aria-valuemax={operator.span}
          aria-valuenow={operator.into}
          aria-valuetext={progress}
          className="h-1.5 overflow-hidden rounded-full bg-[var(--admin-border)]"
        >
          <div className="h-full origin-left rounded-full bg-[var(--admin-nav-line)]" style={{ transform: `scaleX(${share})` }} />
        </div>
        <p className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 text-xs text-[var(--admin-text-muted)] tabular-nums">
          <span>{progress}</span>
          {operator.todayXp > 0 ? <span className="font-semibold text-[var(--admin-text)]">{fmt(d.operator.today, { xp: operator.todayXp })}</span> : null}
        </p>
      </div>
      {!operator.complete && operator.since !== null ? <p className="text-xs text-[var(--admin-text-muted)]">{fmt(d.operator.since, { date: sinceFormat.format(operator.since).replace(/\.$/, "") })}</p> : null}
    </section>
  );
}
