import { Check, Lock } from "lucide-react";
import { useId } from "react";
import { AdminPanel } from "@/components/admin/admin-primitives";
import type { FairNode } from "@/lib/admin-v2/game/types";
import { ringDash } from "@/lib/admin-v2/missions";
import { fmt } from "@/lib/i18n/format";
import { adminGameSr as d } from "@/lib/i18n/sr/admin-game";
import { cn } from "@/lib/utils";

// ADMIN v3 V4 — the map of missions before a fair (plan §6.8), Događaji →
// Pregled. `nodes` come from `fairChain(dashboard)`: every number is a count of
// the event dashboard (published models, stickers, active exhibitors, covered
// questions, active follow-ups). A node is locked, open (with its progress) or
// lit; the links between nodes are drawn by the reveal engine and are decoration
// (`aria-hidden`): the list itself says name, state and progress as text.

const RADIUS = 17;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function Circle({ node }: { node: FairNode }) {
  const base = "relative z-10 grid size-10 flex-none place-items-center rounded-full";
  if (node.state === "lit") {
    // The mark is dark on the green fill in both themes.
    return (
      <span aria-hidden="true" className={cn(base, "bg-[var(--admin-nav-line)] text-[color-mix(in_oklab,var(--admin-canvas)_12%,black)]")}>
        <Check className="size-5" strokeWidth={3} aria-hidden="true" />
      </span>
    );
  }
  if (node.state === "open") {
    const share = node.total > 0 ? node.done / node.total : 0;
    return (
      <span aria-hidden="true" className={cn(base, "bg-[var(--admin-surface-strong)]")}>
        <svg viewBox="0 0 40 40" className="absolute size-full -rotate-90">
          <circle cx="20" cy="20" r={RADIUS} fill="none" stroke="var(--admin-border)" strokeWidth="3" />
          {share > 0 ? <circle cx="20" cy="20" r={RADIUS} fill="none" stroke="var(--admin-warning)" strokeWidth="3" strokeLinecap="round" strokeDasharray={ringDash(share, CIRCUMFERENCE)} /> : null}
        </svg>
        <span className="relative text-[0.625rem] leading-none font-bold tracking-tight tabular-nums">{node.done}/{node.total}</span>
      </span>
    );
  }
  return (
    <span aria-hidden="true" className={cn(base, "border-2 border-[var(--admin-border)] bg-[var(--admin-surface-strong)] text-[var(--admin-text-muted)]")}>
      <Lock className="size-4" aria-hidden="true" />
    </span>
  );
}

/** The link to the next node: a vertical rule in the column layout, a stretched line (drawn by the reveal engine) in the row. */
function Connector({ lit }: { lit: boolean }) {
  return (
    <>
      <span aria-hidden="true" className={cn("absolute top-10 bottom-0 left-[19px] border-l-2 sm:hidden", lit ? "border-[var(--admin-nav-line)]" : "border-dashed border-[var(--admin-border)]")} />
      <svg aria-hidden="true" focusable="false" viewBox="0 0 100 2" preserveAspectRatio="none" className="absolute top-[19px] left-1/2 hidden h-0.5 w-full overflow-visible sm:block">
        <path data-admin-draw="line" d="M0 1 H100" fill="none" vectorEffect="non-scaling-stroke" strokeWidth="2" stroke={lit ? "var(--admin-nav-line)" : "var(--admin-border)"} strokeDasharray={lit ? undefined : "4 4"} />
      </svg>
    </>
  );
}

export function FairChain({ nodes, className }: { nodes: readonly FairNode[]; className?: string }) {
  const heading = useId();
  if (!nodes.length) return null;
  return (
    <AdminPanel data-game-fair-chain="" aria-labelledby={heading} className={cn("min-w-0 px-4 py-4 sm:px-5", className)}>
      <h2 id={heading} className="text-base font-semibold">{d.fair.chainTitle}</h2>
      <p className="mt-1 text-sm text-[var(--admin-text-muted)]">{d.fair.chainHint}</p>
      <ol className="mt-4 flex flex-col sm:flex-row">
        {nodes.map((node, index) => (
          <li key={node.id} data-node={node.id} data-state={node.state} title={d.fair.nodes[node.id].hint} className="relative flex min-w-0 gap-3 pb-6 last:pb-0 sm:flex-1 sm:flex-col sm:items-center sm:gap-0 sm:pb-0 sm:text-center">
            {index < nodes.length - 1 ? <Connector lit={node.state === "lit"} /> : null}
            <Circle node={node} />
            <div className="min-w-0 pt-0.5 sm:mt-2 sm:px-1 sm:pt-0">
              <p className="text-sm font-semibold">{d.fair.nodes[node.id].name}</p>
              <p className={cn("text-xs", node.state === "open" ? "text-[var(--admin-warning)]" : "text-[var(--admin-text-muted)]")}>{d.fair.state[node.state]}</p>
              {node.state === "open" ? <p className="text-xs text-[var(--admin-text-muted)] tabular-nums">{fmt(d.fair.progress, { done: node.done, total: node.total })}</p> : null}
            </div>
          </li>
        ))}
      </ol>
    </AdminPanel>
  );
}
