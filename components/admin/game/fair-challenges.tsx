import { Check } from "lucide-react";
import { useId } from "react";
import { AdminPanel } from "@/components/admin/admin-primitives";
import type { FairChallenge } from "@/lib/admin-v2/game/types";
import { fmt } from "@/lib/i18n/format";
import { adminGameSr as d } from "@/lib/i18n/sr/admin-game";
import { cn } from "@/lib/utils";

// ADMIN v3 V4 — the daily challenges of a running fair (plan §6.8), Događaji →
// Pregled. `items` come from `fairChallenges(analytics, engagement)`: the value
// of each is a count the event polling already reads (scans of today, leads,
// open urgent items), the target a rule over real numbers. A challenge is met,
// missed (its deadline passed) or in progress; the bar is a share, never a guess.

export function FairChallenges({ items, className }: { items: readonly FairChallenge[]; className?: string }) {
  const heading = useId();
  if (!items.length) return null;
  return (
    <AdminPanel data-game-fair-challenges="" aria-labelledby={heading} className={cn("min-w-0 px-4 py-4 sm:px-5", className)}>
      <h2 id={heading} className="text-base font-semibold">{d.fair.challengesTitle}</h2>
      <p className="mt-1 text-sm text-[var(--admin-text-muted)]">{d.fair.challengesHint}</p>
      <ul data-admin-reveal="rows" className="mt-3 grid gap-3">
        {items.map((item) => {
          const name = fmt(d.fair.challenges[item.id], { goal: item.target });
          const progress = fmt(d.fair.value, { value: item.value, goal: item.target });
          // A target of zero (open urgent items must be at zero) has nothing to fill: the number stands alone.
          const bar = item.target > 0;
          return (
            <li key={item.id} data-challenge={item.id} data-done={item.done ? "" : undefined} data-missed={item.missed ? "" : undefined} className="grid min-w-0 gap-1.5">
              <div className="flex min-w-0 items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 font-semibold">{name}</span>
                {item.done ? (
                  <span className="inline-flex flex-none items-center gap-1 font-semibold text-[var(--admin-success)]">
                    <Check className="size-4" strokeWidth={3} aria-hidden="true" />
                    {d.fair.done}
                  </span>
                ) : item.missed ? (
                  <span className="flex-none text-[var(--admin-text-muted)]">{d.fair.missed}</span>
                ) : (
                  <span className="flex-none text-[var(--admin-text-muted)] tabular-nums">{bar ? progress : item.value}</span>
                )}
              </div>
              {bar ? (
                <div
                  role="progressbar"
                  aria-label={name}
                  aria-valuemin={0}
                  aria-valuemax={item.target}
                  aria-valuenow={Math.min(item.value, item.target)}
                  aria-valuetext={progress}
                  className="h-1.5 overflow-hidden rounded-full bg-[var(--admin-border)]"
                >
                  <div className={cn("h-full origin-left rounded-full", item.missed && !item.done ? "bg-[var(--admin-text-muted)]" : "bg-[var(--admin-nav-line)]")} style={{ transform: `scaleX(${Math.min(1, item.value / Math.max(1, item.target))})` }} />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </AdminPanel>
  );
}
