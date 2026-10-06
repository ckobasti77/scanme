import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Admin UX A10 (A0 §2.9) — a row of key numbers as one description list:
// label, the number, a short hint. A metric whose function no package has is
// left out by the caller (no fake zeros). `href` makes the number a link.

export type AdminKpi = { id: string; label: string; value: ReactNode; hint?: ReactNode; tone?: "default" | "danger" | "warning"; href?: string };

const VALUE_TONES = { default: "", danger: "text-[var(--admin-danger)]", warning: "text-[var(--admin-warning)]" } as const;

export function AdminKpiRow({ items, label, className, itemClassName }: {
  items: readonly AdminKpi[];
  label: string;
  className?: string;
  /** Tile width per breakpoint when the row sits in a narrow column. */
  itemClassName?: string;
}) {
  return (
    <dl
      data-admin-primitive="kpi-row"
      aria-label={label}
      className={cn("flex min-w-0 flex-wrap gap-px overflow-hidden rounded-[var(--admin-radius-control)] border border-[var(--admin-border)] bg-[var(--admin-border)]", className)}
    >
      {items.map((item) => (
        // Tiles grow to fill each row, so a row never ends with an empty cell (2 per row on a phone, one row on a wide screen).
        <div key={item.id} className={cn("grid min-w-0 flex-[1_1_9.5rem] content-start gap-1 bg-[var(--admin-surface-strong)] p-3 sm:p-4 xl:flex-[1_1_8rem]", itemClassName)}>
          <dt className="text-xs leading-4 font-semibold text-[var(--admin-text-muted)]">{item.label}</dt>
          <dd className={cn("text-2xl leading-8 font-semibold tracking-[-0.03em] tabular-nums", VALUE_TONES[item.tone ?? "default"])}>
            {item.href ? (
              <Link href={item.href} className="rounded-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-focus,var(--admin-ink))]">{item.value}</Link>
            ) : item.value}
          </dd>
          {item.hint ? <dd className="text-xs leading-5 text-[var(--admin-text-muted)] [overflow-wrap:anywhere]">{item.hint}</dd> : null}
        </div>
      ))}
    </dl>
  );
}
