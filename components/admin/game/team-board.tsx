import Link from "next/link";
import { useId } from "react";
import { AdminPanel, AdminTable } from "@/components/admin/admin-primitives";
import { RankMedal, RankMove } from "@/components/admin/events/analytics/chart-kit";
import type { TeamBoard as TeamBoardData, TeamRow } from "@/lib/admin-v2/game/types";
import { fmt } from "@/lib/i18n/format";
import { adminGameSr as d } from "@/lib/i18n/sr/admin-game";
import { cn } from "@/lib/utils";

// ADMIN v3 V4 — the weekly table of the team (plan §6.7). `board` comes from the
// same XP rules for every member (Monday 00:00 in Belgrade to now, the journal
// read back up to 200 actions each; „najmanje“ marks a read that did not reach
// Monday). `full` is the panel with the table (the Tim page); `strip` is one thin
// row for the Dashboard: the first three and me.

const weekFormat = new Intl.DateTimeFormat("sr-Latn-RS", { day: "numeric", month: "numeric", timeZone: "Europe/Belgrade" });

const medalLabel = (row: TeamRow) => (row.medal ? d.team.medals[row.medal - 1] : fmt(d.team.place, { rank: row.rank }));
const moveLabels = {
  up: (n: number) => fmt(d.team.moveUp, { n }),
  down: (n: number) => fmt(d.team.moveDown, { n }),
  same: d.team.moveSame,
  isNew: "",
};

function MeChip({ className }: { className?: string }) {
  return <span data-team-me-chip="" className={cn("inline-flex rounded-full border border-[var(--admin-border)] px-1.5 text-[0.6875rem] leading-5 font-semibold text-[var(--admin-text-muted)]", className)}>{d.team.me}</span>;
}

function FullBoard({ board, className }: { board: TeamBoardData; className?: string }) {
  const heading = useId();
  const empty = board.rows.every((row) => row.xp === 0);
  return (
    <AdminPanel data-game-team="full" aria-labelledby={heading} className={cn("min-w-0", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-[var(--admin-border)] px-4 py-4 sm:px-5">
        <h2 id={heading} className="text-base font-semibold">{d.team.title}</h2>
        <p className="text-sm text-[var(--admin-text-muted)] tabular-nums">{fmt(d.team.week, { date: weekFormat.format(board.weekStart) })}</p>
      </div>
      {empty ? (
        <p className="px-4 py-5 text-sm text-[var(--admin-text-muted)] sm:px-5">{d.team.empty}</p>
      ) : (
        <AdminTable caption={d.team.title} className="rounded-none border-0 bg-transparent">
          <thead className="bg-[var(--admin-surface-muted)] text-[0.67rem] font-bold tracking-[0.06em] text-[var(--admin-text-muted)] uppercase">
            <tr>
              <th className="px-3 py-3 sm:pl-5" scope="col">{d.team.columns.place}</th>
              <th className="px-3 py-3" scope="col">{d.team.columns.member}</th>
              <th className="px-3 py-3" scope="col">{d.team.columns.xp}</th>
              <th className="px-3 py-3" scope="col">{d.team.columns.actions}</th>
              <th className="px-3 py-3" scope="col">{d.team.columns.combo}</th>
              <th className="px-3 py-3 sm:pr-5" scope="col">{d.team.columns.move}</th>
            </tr>
          </thead>
          <tbody data-admin-reveal="rows">
            {board.rows.map((row) => (
              <tr key={row.id} data-team-row={row.id} data-me={row.me ? "" : undefined} className={cn("border-t border-[var(--admin-border)]", row.me ? "bg-[var(--admin-surface-muted)]" : "")}>
                <td className="px-3 py-2.5 sm:pl-5"><RankMedal rank={row.rank} medal={row.medal} label={medalLabel(row)} /></td>
                <td className="px-3 py-2.5 font-semibold">
                  {row.name}
                  {row.me ? <MeChip className="ml-2" /> : null}
                </td>
                <td className="px-3 py-2.5">
                  <span className="font-mono font-semibold tabular-nums">{row.atLeast ? fmt(d.team.atLeast, { xp: row.xp }) : row.xp}</span>
                  {row.atLeast ? <span className="block text-xs text-[var(--admin-text-muted)]">{d.team.capped}</span> : null}
                </td>
                <td className="px-3 py-2.5 tabular-nums">{row.actions}</td>
                <td className="px-3 py-2.5 tabular-nums">{row.bestChain}</td>
                <td className="px-3 py-2.5 sm:pr-5"><RankMove move={row.move} isNew={false} labels={moveLabels} /></td>
              </tr>
            ))}
          </tbody>
        </AdminTable>
      )}
      <p className="border-t border-[var(--admin-border)] px-4 py-3 text-xs leading-5 text-[var(--admin-text-muted)] sm:px-5">{d.team.note}</p>
    </AdminPanel>
  );
}

function StripItem({ row }: { row: TeamRow }) {
  return (
    <li data-team-row={row.id} data-me={row.me ? "" : undefined} className="flex min-w-0 items-center gap-1.5 text-sm">
      <RankMedal rank={row.rank} medal={row.medal} label={medalLabel(row)} />
      <span className="min-w-0 truncate font-semibold">{row.name}</span>
      {row.me ? <MeChip /> : null}
      <span className="font-mono text-xs text-[var(--admin-text-muted)] tabular-nums">{row.atLeast ? fmt(d.team.atLeast, { xp: row.xp }) : `${row.xp} ${d.team.columns.xp}`}</span>
    </li>
  );
}

function StripBoard({ board, href, className }: { board: TeamBoardData; href?: string; className?: string }) {
  const ranked = [...board.rows].sort((a, b) => a.rank - b.rank);
  const top = ranked.filter((row) => row.xp > 0).slice(0, 3);
  const mine = ranked.find((row) => row.me);
  const shown = mine && !top.includes(mine) ? [...top, mine] : top;
  return (
    <AdminPanel data-game-team="strip" className={cn("flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5", className)}>
      <p className="text-[0.67rem] font-bold tracking-[0.08em] text-[var(--admin-text-muted)] uppercase">{d.team.stripTitle}</p>
      {top.length ? (
        <ol className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
          {shown.map((row) => <StripItem key={row.id} row={row} />)}
        </ol>
      ) : (
        <p className="text-sm text-[var(--admin-text-muted)]">{d.team.empty}</p>
      )}
      {href ? <Link href={href} className="-my-2.5 ml-auto inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-semibold hover:underline">{d.team.openTeam}</Link> : null}
    </AdminPanel>
  );
}

export function TeamBoard({ board, variant, href, className }: { board: TeamBoardData | null; variant: "full" | "strip"; href?: string; className?: string }) {
  const loading = useId();
  if (!board) {
    if (variant === "strip") return null;
    return (
      <AdminPanel data-game-team="full" aria-labelledby={loading} className={cn("px-4 py-4 sm:px-5", className)}>
        <h2 id={loading} className="text-base font-semibold">{d.team.title}</h2>
        <p className="mt-2 text-sm text-[var(--admin-text-muted)]">{d.team.loading}</p>
      </AdminPanel>
    );
  }
  return variant === "full" ? <FullBoard board={board} className={className} /> : <StripBoard board={board} href={href} className={className} />;
}
