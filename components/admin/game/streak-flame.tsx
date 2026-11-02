import { Flame } from "lucide-react";
import type { StreakView } from "@/lib/admin-v2/game/types";
import { fmt, srPluralCategory } from "@/lib/i18n/format";
import { adminGameSr as d } from "@/lib/i18n/sr/admin-game";
import { cn } from "@/lib/utils";

// ADMIN v3 V4 — the flame of the streak (plan §6.5): a static mark that grows
// in five sizes with `streak.flame` (1–2 days, 3–4, 5–9, 10–19, 20+); it never
// flickers. The number of days and the broken-streak day come from the
// StreakView the game computed; nothing here is invented.

const SIZE = ["size-3.5", "size-3.5", "size-4", "size-[1.125rem]", "size-5", "size-6"] as const;

const dayFormat = new Intl.DateTimeFormat("sr-Latn-RS", { weekday: "long", day: "numeric", month: "numeric", timeZone: "UTC" });

/** „dan“ after a number: 1, 21 → dan; 2–4, 22–24 → dana; the rest (and 11–14) → dana. */
export function dayNoun(count: number): string {
  const form = srPluralCategory(count);
  return d.streak.days[form === "one" ? 0 : form === "few" ? 1 : 2];
}

/** `2026-10-13` → „utorak, 13. 10“ (the closing full stop is left to the sentence of the dictionary); a key that is not a date is shown as it is. */
export function streakDayText(key: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return key;
  return dayFormat.format(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))).replace(/\.$/, "");
}

/** The sentence of the flame, for assistive technology and the tooltip. */
export function streakText(streak: StreakView): string {
  if (streak.count > 0) {
    const value = fmt(d.streak.value, { count: streak.count, noun: dayNoun(streak.count) });
    return `${value}. ${streak.todayDone ? d.streak.todayDone : d.streak.todayOpen}`;
  }
  if (streak.brokenOn) return fmt(d.streak.broken, { day: streakDayText(streak.brokenOn), best: streak.best, noun: dayNoun(streak.best) });
  return d.streak.none;
}

export function StreakFlame({ streak, className }: { streak: StreakView; className?: string }) {
  const text = streakText(streak);
  return (
    // The tooltip also says how a day is written down: the rule is not a secret.
    <span data-admin-streak="" data-flame={streak.flame} title={`${text} ${d.streak.rule}`} className={cn("inline-flex min-w-0 items-center gap-1 text-xs font-semibold", className)}>
      <Flame className={cn("flex-none", SIZE[streak.flame], streak.flame === 0 ? "text-[var(--admin-text-muted)]" : "text-[var(--admin-warning)]")} aria-hidden="true" />
      <span aria-hidden="true" className="tabular-nums">{streak.count}</span>
      <span className="sr-only">{text}</span>
    </span>
  );
}
