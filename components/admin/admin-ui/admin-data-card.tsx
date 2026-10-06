import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Admin UX A1 — the body of one card in AdminDataView's `Kartice` view: the
// most important fields of the table row. The frame and the row actions are
// added by AdminDataView, so a card always offers the same actions as its row.

export type AdminDataCardField = { label: string; value: ReactNode };

export function AdminDataCard({
  title,
  subtitle,
  badges,
  fields,
  aside,
  children,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  badges?: ReactNode;
  fields?: readonly (AdminDataCardField | null | false)[];
  /** Small leading element on the right of the title (icon, signal). */
  aside?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const visible = (fields ?? []).filter((field): field is AdminDataCardField => Boolean(field));
  return (
    <div data-admin-primitive="data-card" className={cn("grid min-w-0 gap-2.5", className)}>
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm leading-5 font-semibold [overflow-wrap:anywhere]">{title}</h3>
          {subtitle ? <p className="mt-0.5 text-xs leading-5 text-[var(--admin-text-muted)] [overflow-wrap:anywhere]">{subtitle}</p> : null}
        </div>
        {aside ? <div className="shrink-0">{aside}</div> : null}
      </div>
      {badges ? <div className="flex min-w-0 flex-wrap items-center gap-1.5">{badges}</div> : null}
      {visible.length ? (
        <dl className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
          {visible.map((field) => (
            <div key={field.label} className="contents">
              <dt className="text-xs leading-5 font-semibold text-[var(--admin-text-muted)]">{field.label}</dt>
              <dd className="min-w-0 leading-5 [overflow-wrap:anywhere]">{field.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {children}
    </div>
  );
}
