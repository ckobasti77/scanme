import { ringDash } from "@/lib/admin-v2/missions";
import type { OperatorView } from "@/lib/admin-v2/game/types";
import { fmt } from "@/lib/i18n/format";
import { adminGameSr as d } from "@/lib/i18n/sr/admin-game";
import { cn } from "@/lib/utils";

// ADMIN v3 V4 — the XP chip of the navbar (plan §6.11), left of the profile:
// the ring of the level (the share of the level already earned, from
// OperatorView.share) with the level number in it, and „Nv 7“ beside it. A
// click opens the Vitrina. Where the navbar has no room for it (below 1400 px
// its nine links fill the row), the same ring stands around the icon of the
// profile instead (`XpProfileRing`), and the profile menu opens the Vitrina.
// The ring is `data-admin-xp-ring`: the target of the spark and of the
// ceremony. Nothing here reads the game; it only draws.

const RADIUS = 15.5;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function XpChip({ operator, onOpen, className }: { operator: OperatorView | null; onOpen: () => void; className?: string }) {
  if (!operator) return null;
  const label = fmt(d.operator.chip, { rank: d.ranks[operator.rank], level: operator.level });
  return (
    <button
      type="button"
      data-admin-xp-chip=""
      onClick={onOpen}
      aria-label={label}
      title={label}
      className={cn("inline-flex min-h-11 min-w-11 flex-none items-center justify-center gap-2 rounded-lg px-2 text-sm font-semibold text-[var(--admin-text)] transition-colors duration-150 hover:bg-[var(--admin-surface-muted)]", className)}
    >
      <span data-admin-xp-ring="" aria-hidden="true" className="relative inline-grid size-7 flex-none place-items-center">
        <svg viewBox="0 0 36 36" className="size-full -rotate-90">
          <circle cx="18" cy="18" r={RADIUS} fill="none" stroke="var(--admin-border)" strokeWidth="4" />
          {operator.share > 0 ? <circle cx="18" cy="18" r={RADIUS} fill="none" stroke="var(--admin-nav-line)" strokeWidth="4" strokeLinecap="round" strokeDasharray={ringDash(operator.share, CIRCUMFERENCE)} /> : null}
        </svg>
        <span className="absolute text-[0.6875rem] leading-none font-bold tabular-nums">{operator.level}</span>
      </span>
      <span aria-hidden="true" className="whitespace-nowrap tabular-nums">{fmt(d.operator.levelShort, { level: operator.level })}</span>
    </button>
  );
}

/** The ring of the level around the icon of the profile button: decoration over it, no width of its own. */
export function XpProfileRing({ operator, className }: { operator: OperatorView | null; className?: string }) {
  if (!operator) return null;
  return (
    <span data-admin-xp-ring="" aria-hidden="true" className={cn("pointer-events-none absolute inset-0 m-auto size-9", className)}>
      <svg viewBox="0 0 36 36" className="size-full -rotate-90">
        <circle cx="18" cy="18" r="16.5" fill="none" stroke="var(--admin-border)" strokeWidth="2.5" />
        {operator.share > 0 ? <circle cx="18" cy="18" r="16.5" fill="none" stroke="var(--admin-nav-line)" strokeWidth="2.5" strokeLinecap="round" strokeDasharray={ringDash(operator.share, 2 * Math.PI * 16.5)} /> : null}
      </svg>
    </span>
  );
}
