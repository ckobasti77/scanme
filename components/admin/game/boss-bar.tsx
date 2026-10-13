"use client";

import { CheckCircle2 } from "lucide-react";
import { useRef } from "react";
import { useQuietMode } from "@/components/admin/admin-ui/admin-toast";
import { gsap, useAdminGsap } from "@/components/admin/frame/use-admin-gsap";
import type { BossEvent, BossView } from "@/lib/admin-v2/game/types";
import { ADMIN_EASE, ADMIN_LAYER_MAX } from "@/lib/admin-v2/motion";
import { fmt } from "@/lib/i18n/format";
import { adminGameSr as d } from "@/lib/i18n/sr/admin-game";
import { cn } from "@/lib/utils";

// ADMIN v3 V4 — the boss of the day (plan §6.4) in the legend of the Dashboard
// hero: the backlog of „Za reakciju“ as a health bar. `boss` comes from the
// counts of the server (hp = 3 × urgent + 2 × needs reply + 1 × today; the full
// bar is the largest backlog seen today on this device). A hit of mine pops the
// damage number and jolts the bar for 250 ms; the text of the event stays in a status
// line until the next one. With reduced motion and in the quiet mode only the
// text stands. A defeat is a ceremony of the leader's, not drawn here.

const bossHour = new Intl.DateTimeFormat("sr-Latn-RS", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Belgrade" });
/** The jolt of the bar (x: 0, −3, 3, 0) lasts 250 ms: a quarter to the left, half across to the right, a quarter back. */
const JOLT_STEP = ADMIN_LAYER_MAX.interakcija / 4;
const POP_SECONDS = 0.6;

export type BossBarEvent = BossEvent & {
  /** Changes with every event, so the same event twice is shown twice. */
  seq: number;
};

/** The words of an event; a defeat has none here (the ceremony says it). */
export function bossEventText(event: BossBarEvent | null): string {
  if (!event) return "";
  switch (event.kind) {
    case "hit":
      return fmt(event.mine ? d.boss.hitMine : d.boss.hitTeam, { damage: event.damage });
    case "snoozed":
      return d.boss.snoozed;
    case "grew":
      return fmt(d.boss.grew, { amount: event.amount });
    default:
      return "";
  }
}

export function BossBar({ boss, event, className }: { boss: BossView; event: BossBarEvent | null; className?: string }) {
  const [quiet] = useQuietMode();
  const track = useRef<HTMLDivElement>(null);
  const damage = useRef<HTMLSpanElement>(null);
  // Only my own hit pops the number and jolts the bar; a fall that is the team's only shortens it (the status line says so).
  const hit = event?.kind === "hit" && event.mine;
  useAdminGsap(
    ({ reduced }) => {
      if (!hit || reduced || quiet) return;
      if (damage.current) gsap.fromTo(damage.current, { y: 0, opacity: 1 }, { y: -10, opacity: 0, duration: POP_SECONDS, ease: ADMIN_EASE.out });
      if (track.current) {
        gsap
          .timeline({ defaults: { ease: "none" } })
          .to(track.current, { x: -3, duration: JOLT_STEP })
          .to(track.current, { x: 3, duration: JOLT_STEP * 2 })
          .to(track.current, { x: 0, duration: JOLT_STEP, clearProps: "transform" });
      }
    },
    [event?.seq],
  );

  const text = bossEventText(event);
  const value = boss.kind === "alive" ? fmt(d.boss.value, { hp: boss.hp, max: boss.hpMax }) : "";
  return (
    <div data-game-boss={boss.kind} title={d.boss.help} className={cn("min-w-0", className)}>
      {/* The title and the number share one row: the legend of the hero is low, and the list below it must stay on the first screen. */}
      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3">
        <p className="text-[0.67rem] font-bold tracking-[0.08em] text-[var(--admin-text-muted)] uppercase">{d.boss.title}</p>
        {boss.kind === "alive" ? (
          <p className="flex items-baseline gap-2">
            {hit && event ? (
              // The floating damage is decoration: the status line below says the same in words.
              <span key={event.seq} ref={damage} aria-hidden="true" className="font-mono text-xs font-bold text-[var(--admin-danger)] tabular-nums opacity-0">
                {bossEventText(event)}
              </span>
            ) : null}
            <span className="font-mono text-xs leading-4 font-semibold tabular-nums">{value}</span>
          </p>
        ) : null}
      </div>
      {boss.kind === "unavailable" ? <p className="mt-1 text-sm text-[var(--admin-text-muted)]">{d.boss.unavailable}</p> : null}
      {boss.kind === "none" ? <p className="mt-1 text-sm text-[var(--admin-text-muted)]">{d.boss.none}</p> : null}
      {boss.kind === "alive" ? (
        <>
          <div
            ref={track}
            role="progressbar"
            aria-label={d.boss.title}
            aria-valuemin={0}
            aria-valuemax={boss.hpMax}
            aria-valuenow={boss.hp}
            aria-valuetext={value}
            className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--admin-border)]"
          >
            <div
              className="h-full origin-left rounded-full bg-[var(--admin-danger)] transition-transform duration-[var(--admin-dur-3)] ease-[var(--admin-ease-out)] motion-reduce:transition-none"
              style={{ transform: `scaleX(${Math.min(1, Math.max(0, boss.share))})` }}
            />
          </div>
          {boss.returned ? <p className="mt-1 text-xs text-[var(--admin-warning)]">{d.boss.returned}</p> : null}
        </>
      ) : null}
      {boss.kind === "down" ? (
        <>
          <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold">
            <CheckCircle2 className="size-4 flex-none text-[var(--admin-success)]" aria-hidden="true" />
            {fmt(d.boss.down, { time: bossHour.format(boss.downAt) })}
          </p>
          <div aria-hidden="true" className="mt-1.5 h-1.5 rounded-full bg-[var(--admin-border)]" />
        </>
      ) : null}
      {/* Always in the DOM, so a new text is announced; a snooze or a defeat of the team is not a victory. */}
      <p role="status" data-boss-event={text ? event?.kind : undefined} className={cn("text-xs tabular-nums", text ? "mt-1" : "", event?.kind === "grew" ? "text-[var(--admin-warning)]" : "text-[var(--admin-text-muted)]")}>
        {text}
      </p>
    </div>
  );
}
