import type { OperatorView, StreakView } from "@/lib/admin-v2/game/types";
import { ADMIN_GAME_MOTION } from "@/lib/admin-v2/motion";
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
// V5 (S10): in the sidebar (`dense`), on a window up to 800 px tall, the row is one
// line: the rank, „Nv 7“, a thin bar and the flame. The heading and the two lines
// of text under the bar stay for assistive technology (`sr-only`); the bar keeps
// its `aria-valuetext`. The drawer of a phone never sets `dense`: it shows the full row.

// The dictionary sentence ends with its own full stop, so the one the date format closes with is dropped.
const sinceFormat = new Intl.DateTimeFormat("sr-Latn-RS", { day: "numeric", month: "numeric", year: "numeric", timeZone: "Europe/Belgrade" });

export function OperatorRow({ operator, streak, onOpen, dense = false, className }: { operator: OperatorView | null; streak: StreakView | null; onOpen: () => void; dense?: boolean; className?: string }) {
  if (!operator) return null;
  const progress = fmt(d.operator.progress, { into: operator.into, span: operator.span, next: operator.level + 1 });
  const share = Math.min(1, Math.max(0, operator.share));
  return (
    <section data-admin-operator="" aria-label={d.operator.title} className={cn("grid min-w-0 gap-1.5 border-t border-[var(--admin-border)] px-5 py-3", dense && "[@media(max-height:800px)]:flex [@media(max-height:800px)]:items-center [@media(max-height:800px)]:gap-2 [@media(max-height:800px)]:py-2", className)}>
      <div className={cn("flex min-w-0 items-center justify-between gap-2", dense && "[@media(max-height:800px)]:contents")}>
        <p className={cn("text-[0.67rem] font-bold tracking-[0.08em] text-[var(--admin-text-muted)] uppercase", dense && "[@media(max-height:800px)]:sr-only")}>{d.operator.title}</p>
        {streak ? <StreakFlame streak={streak} className={dense ? "[@media(max-height:800px)]:order-last [@media(max-height:800px)]:flex-none" : undefined} /> : null}
      </div>
      <div className={cn("relative -mx-2 grid min-w-0 gap-1.5 rounded-lg px-2 py-1 transition-colors duration-150 hover:bg-[var(--admin-surface-muted)]", dense && "[@media(max-height:800px)]:flex [@media(max-height:800px)]:min-h-9 [@media(max-height:800px)]:flex-1 [@media(max-height:800px)]:items-center [@media(max-height:800px)]:gap-2 [@media(max-height:800px)]:py-0 [@media(max-height:800px)]:pointer-coarse:min-h-11")}>
        <button
          type="button"
          onClick={onOpen}
          aria-label={fmt(d.operator.chip, { rank: d.ranks[operator.rank], level: operator.level })}
          // The target is the whole block (the overlay), well above 44 px; the line itself stays as tall as its text.
          className={cn("flex min-w-0 items-baseline justify-between gap-2 rounded-lg text-left after:absolute after:inset-0 after:rounded-lg after:content-['']", dense && "[@media(max-height:800px)]:flex-none [@media(max-height:800px)]:justify-start")}
        >
          <span className="min-w-0 truncate text-sm font-semibold">{d.ranks[operator.rank]}</span>
          <span className={cn("flex-none text-sm text-[var(--admin-text-muted)] tabular-nums", dense && "[@media(max-height:800px)]:hidden")}>{fmt(d.operator.level, { level: operator.level })}</span>
          {dense ? <span aria-hidden="true" className="hidden flex-none text-sm text-[var(--admin-text-muted)] tabular-nums [@media(max-height:800px)]:inline">{fmt(d.operator.levelShort, { level: operator.level })}</span> : null}
        </button>
        <div
          role="progressbar"
          aria-label={d.operator.progressLabel}
          aria-valuemin={0}
          aria-valuemax={operator.span}
          aria-valuenow={operator.into}
          aria-valuetext={progress}
          className={cn("h-1.5 overflow-hidden rounded-full bg-[var(--admin-border)]", dense && "[@media(max-height:800px)]:min-w-6 [@media(max-height:800px)]:flex-1")}
        >
          {/* The fill follows its number: a transform only, so the gain reads as movement; none in the quiet mode or with reduced motion. */}
          <div
            className="h-full origin-left rounded-full bg-[var(--admin-energy-ink)] transition-transform ease-[var(--admin-ease-out)] motion-reduce:transition-none [.admin-v1[data-admin-quiet]_&]:transition-none"
            style={{ transform: `scaleX(${share})`, transitionDuration: `${ADMIN_GAME_MOTION.xpBar}s` }}
          />
        </div>
        <p className={cn("flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 text-xs text-[var(--admin-text-muted)] tabular-nums", dense && "[@media(max-height:800px)]:sr-only")}>
          <span>{progress}</span>
          {operator.todayXp > 0 ? <span className="font-semibold text-[var(--admin-text)]">{fmt(d.operator.today, { xp: operator.todayXp })}</span> : null}
        </p>
      </div>
      {!operator.complete && operator.since !== null ? <p className={cn("text-xs text-[var(--admin-text-muted)]", dense && "[@media(max-height:800px)]:sr-only")}>{fmt(d.operator.since, { date: sinceFormat.format(operator.since).replace(/\.$/, "") })}</p> : null}
    </section>
  );
}
