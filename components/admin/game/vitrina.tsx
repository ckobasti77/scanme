"use client";

import { X } from "lucide-react";
import { useRef, useState } from "react";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { BadgeId } from "@/lib/admin-v2/game/ids";
import { BADGE_ART } from "@/lib/admin-v2/game/medal-art";
import type { BadgeState, OperatorView, StreakView } from "@/lib/admin-v2/game/types";
import { fmt } from "@/lib/i18n/format";
import { adminGameSr as d } from "@/lib/i18n/sr/admin-game";
import { cn } from "@/lib/utils";
import { Medal2D } from "./medal-2d";
import { MedalStage } from "./medal-stage";

// ADMIN v3 V4 — the Vitrina (plan §5.3): the dialog of the badges. The selected
// badge is one big 3D medal (turn it by dragging; the grid below and beside it is
// 2D, so there is one WebGL context at most), with its name, rarity, the date it
// was won or the condition and the progress of a locked one. The grid is a plain
// list of buttons with the full name of each badge: that is the text equivalent
// of the scene, which is hidden from assistive technology.

const v = d.vitrina;
const dateFormat = new Intl.DateTimeFormat("sr-Latn-RS", { day: "numeric", month: "numeric", year: "numeric", timeZone: "Europe/Belgrade" });
const dateOf = (at: number) => dateFormat.format(at);

const isEarned = (badge: BadgeState) => badge.earnedAt !== null;

/** What the badge says it is in the grid and for assistive technology: „Osvojena {date}“ or „Zaključano. Uslov: …“. */
function stateOf(badge: BadgeState): string {
  if (badge.earnedAt !== null) return fmt(v.earned, { date: dateOf(badge.earnedAt) });
  return `${v.locked}. ${fmt(v.condition, { condition: d.badges[badge.id].condition })}`;
}

/** The last badge won, else the first. */
function defaultBadge(badges: readonly BadgeState[]): BadgeState | null {
  let latest: BadgeState | null = null;
  for (const badge of badges) {
    if (badge.earnedAt !== null && (latest === null || badge.earnedAt > (latest.earnedAt ?? 0))) latest = badge;
  }
  return latest ?? badges[0] ?? null;
}

function Details({ badge }: { badge: BadgeState }) {
  const { name, condition } = d.badges[badge.id];
  const earned = badge.earnedAt !== null;
  const progress = !earned ? badge.progress : undefined;
  return (
    <div aria-live="polite" className="grid justify-items-center gap-1 text-center">
      <h3 data-vitrina-name="" className="text-base font-semibold text-[var(--admin-text)]">
        {name}
      </h3>
      <p data-rarity={badge.rarity} className="text-[0.68rem] font-bold tracking-[0.06em] text-[var(--admin-text-muted)] uppercase">
        {d.rarity[badge.rarity]}
      </p>
      {earned ? (
        <p className="text-sm text-[var(--admin-text)]">
          {badge.count !== undefined && badge.count > 1
            ? fmt(v.earnedCount, { count: badge.count, date: dateOf(badge.earnedAt as number) })
            : fmt(v.earned, { date: dateOf(badge.earnedAt as number) })}
        </p>
      ) : (
        <>
          <p className="text-sm font-semibold text-[var(--admin-text)]">{v.locked}</p>
          <p className="text-sm text-[var(--admin-text-muted)]">{fmt(v.condition, { condition })}</p>
          {progress && progress.target > 0 ? (
            <div className="mt-1 grid w-full justify-items-center gap-1.5">
              <p className="text-xs text-[var(--admin-text-muted)] tabular-nums">{fmt(v.progress, { value: progress.value, goal: progress.target })}</p>
              <div
                role="progressbar"
                aria-label={name}
                aria-valuemin={0}
                aria-valuemax={progress.target}
                aria-valuenow={Math.min(progress.value, progress.target)}
                aria-valuetext={fmt(v.progress, { value: progress.value, goal: progress.target })}
                className="h-1.5 w-full max-w-[14rem] overflow-hidden rounded-full bg-[var(--admin-surface-muted)]"
              >
                <div className="h-full origin-left rounded-full bg-[var(--admin-accent)]" style={{ transform: `scaleX(${Math.min(1, Math.max(0, progress.value / progress.target))})` }} />
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function Group({ title, badges, selectedId, onSelect, note }: { title: string; badges: readonly BadgeState[]; selectedId: BadgeId | null; onSelect: (id: BadgeId) => void; note?: string }) {
  if (badges.length === 0) return null;
  return (
    <section className="grid gap-2">
      <h3 className="text-[0.68rem] font-bold tracking-[0.06em] text-[var(--admin-text-muted)] uppercase">{title}</h3>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-2">
        {badges.map((badge) => {
          const name = d.badges[badge.id].name;
          return (
            <li key={badge.id} className="flex">
              <button
                type="button"
                data-badge={badge.id}
                data-locked={isEarned(badge) ? undefined : ""}
                aria-pressed={badge.id === selectedId}
                aria-label={fmt(v.badgeAria, { name, rarity: d.rarity[badge.rarity], state: stateOf(badge) })}
                onClick={() => onSelect(badge.id)}
                className={cn(
                  "flex min-h-11 w-full flex-col items-center gap-1.5 rounded-xl border border-transparent p-2 text-center text-[0.72rem] leading-tight font-medium text-[var(--admin-text)] transition-colors duration-150",
                  "hover:bg-[var(--admin-surface-muted)] aria-pressed:border-[var(--admin-accent)] aria-pressed:bg-[var(--admin-surface-muted)] data-[locked]:text-[var(--admin-text-muted)]",
                )}
              >
                <Medal2D art={BADGE_ART[badge.id]} rarity={badge.rarity} locked={!isEarned(badge)} className="size-12" />
                <span aria-hidden="true">{name}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {note ? <p className="text-xs text-[var(--admin-text-muted)]">{note}</p> : null}
    </section>
  );
}

/** The content of the dialog: the Radix portal is not drawn on the server, so this part stands by itself. */
export function VitrinaBody({
  badges,
  operator,
  streak = null,
  selectedId,
  onSelect,
}: {
  badges: readonly BadgeState[];
  operator: OperatorView | null;
  /** The streak says from when this device keeps it (it does not travel to another one). */
  streak?: StreakView | null;
  /** Controlled by the dialog, so the choice stays when it is opened again; without it the body keeps its own. */
  selectedId?: BadgeId | null;
  onSelect?: (id: BadgeId) => void;
}) {
  const [own, setOwn] = useState<BadgeId | null>(null);
  const picked = selectedId !== undefined ? selectedId : own;
  const selected = badges.find((badge) => badge.id === picked) ?? defaultBadge(badges);
  const select = (id: BadgeId) => {
    setOwn(id);
    onSelect?.(id);
  };
  const earned = badges.filter(isEarned).length;
  return (
    <div data-vitrina="" className="grid gap-6 md:grid-cols-[18rem_minmax(0,1fr)] md:gap-8">
      <div className="grid content-start justify-items-center gap-3 md:sticky md:top-0 md:self-start">
        {selected ? (
          <>
            <MedalStage art={BADGE_ART[selected.id]} rarity={selected.rarity} locked={!isEarned(selected)} mode="showcase" className="size-44 md:size-72" />
            <Details badge={selected} />
            <p className="hidden text-center text-xs text-[var(--admin-text-muted)] md:block">{v.sceneHint}</p>
          </>
        ) : null}
      </div>
      <div className="grid min-w-0 content-start gap-5">
        <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p data-vitrina-count="" className="text-sm font-semibold text-[var(--admin-text)] tabular-nums">
            {fmt(v.count, { earned, total: badges.length })}
          </p>
          {operator ? (
            <p data-vitrina-operator="" className="text-sm text-[var(--admin-text-muted)] tabular-nums">
              {d.ranks[operator.rank]} · {fmt(d.operator.level, { level: operator.level })}
            </p>
          ) : null}
        </header>
        <Group title={v.groupPersonal} badges={badges.filter((badge) => badge.group === "personal")} selectedId={selected?.id ?? null} onSelect={select} />
        <Group title={v.groupFair} badges={badges.filter((badge) => badge.group === "fair")} selectedId={selected?.id ?? null} onSelect={select} note={v.fairNote} />
        <p className="text-xs text-[var(--admin-text-muted)]">{v.localNote}</p>
        <p data-vitrina-streak="" className="text-xs text-[var(--admin-text-muted)]">
          {d.streak.rule}
          {/* The sentence of the dictionary closes with its own full stop: the one of the date is dropped. */}
          {streak?.since ? ` ${fmt(d.streak.since, { date: dateOf(Date.parse(`${streak.since}T12:00:00Z`)).replace(/\.$/, "") })}` : ""}
        </p>
      </div>
    </div>
  );
}

export function Vitrina({
  open,
  onOpenChange,
  badges,
  operator,
  streak = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  badges: readonly BadgeState[];
  operator: OperatorView | null;
  streak?: StreakView | null;
}) {
  // The choice outlives the dialog: Radix unmounts its content when it closes.
  const [selectedId, setSelectedId] = useState<BadgeId | null>(null);
  // The dialog has no Trigger (the chip, the menu or a key opens it), so Radix would focus nothing on close.
  const opener = useRef<HTMLElement | null>(null);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        data-reveal="off"
        data-admin-dialog="vitrina"
        onOpenAutoFocus={() => {
          opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        }}
        onCloseAutoFocus={(event) => {
          // Opened from the profile menu the item is gone by now: the XP chip of the navbar takes the focus instead.
          const chip = [...document.querySelectorAll<HTMLElement>("[data-admin-xp-chip]")].find((element) => element.offsetParent !== null);
          const target = opener.current?.isConnected ? opener.current : chip;
          opener.current = null;
          if (!target) return;
          event.preventDefault();
          target.focus();
        }}
        className="admin-v1 max-h-[90vh] w-[min(64rem,calc(100vw-2rem))] max-w-none overflow-y-auto rounded-[var(--admin-radius-panel)] border-[var(--admin-border)] bg-[var(--admin-surface-strong)] p-5 shadow-[var(--admin-shadow-lg)] sm:w-[min(64rem,calc(100vw-2rem))] sm:max-w-none"
      >
        <DialogHeader className="pr-12 text-left">
          <DialogTitle>{v.title}</DialogTitle>
          <DialogDescription>{v.description}</DialogDescription>
        </DialogHeader>
        <DialogClose
          aria-label={v.close}
          className="absolute top-3 right-3 inline-flex size-11 items-center justify-center rounded-lg text-[var(--admin-text-muted)] transition-colors duration-150 hover:bg-[var(--admin-surface-muted)] hover:text-[var(--admin-text)]"
        >
          <X aria-hidden="true" className="size-4" />
        </DialogClose>
        <VitrinaBody badges={badges} operator={operator} streak={streak} selectedId={selectedId} onSelect={setSelectedId} />
      </DialogContent>
    </Dialog>
  );
}
