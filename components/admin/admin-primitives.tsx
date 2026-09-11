import {
  AlertTriangle,
  Inbox,
  Nfc,
  Package,
  QrCode,
} from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { adminV1Sr } from "@/lib/i18n/sr/admin-v1";
import { cn } from "@/lib/utils";

export function AdminPanel({
  className,
  ...props
}: ComponentProps<"section">) {
  return (
    <section
      data-admin-primitive="panel"
      className={cn(
        "rounded-[var(--admin-radius-panel)] border border-[var(--admin-border)] bg-[var(--admin-surface)] shadow-[var(--admin-shadow-sm)]",
        className,
      )}
      {...props}
    />
  );
}

export function AdminTable({
  caption,
  children,
  className,
}: {
  caption: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-admin-primitive="table"
      className={cn(
        "max-w-full overflow-x-auto rounded-[var(--admin-radius-control)] border border-[var(--admin-border)] bg-[var(--admin-surface)]",
        className,
      )}
    >
      <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  );
}

const statusToneClasses = {
  active: "border-[var(--admin-success-border)] bg-[var(--admin-success-soft)] text-[var(--admin-success)]",
  waiting:
    "border-[var(--admin-warning-border)] bg-[var(--admin-warning-soft)] text-[var(--admin-warning)]",
  problem:
    "border-[var(--admin-danger-border)] bg-[var(--admin-danger-soft)] text-[var(--admin-danger)]",
  neutral:
    "border-[var(--admin-border)] bg-[var(--admin-surface-muted)] text-[var(--admin-text-muted)]",
} as const;

export function AdminStatus({
  label,
  tone,
  className,
}: {
  label: string;
  tone: keyof typeof statusToneClasses;
  className?: string;
}) {
  return (
    <span
      data-admin-primitive="status"
      data-tone={tone}
      className={cn(
        "inline-flex min-h-7 items-center gap-2 rounded-full border px-2.5 text-xs font-semibold",
        statusToneClasses[tone],
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {label}
    </span>
  );
}

export function AdminLoadingState({
  label = adminV1Sr.loadingLabel,
  compact = false,
}: {
  label?: string;
  compact?: boolean;
}) {
  return (
    <div
      data-admin-primitive="loading"
      role="status"
      aria-live="polite"
      className={cn("grid gap-3", compact ? "p-4" : "p-6 sm:p-8")}
    >
      <span className="sr-only">{label}</span>
      <div className="h-3 w-32 animate-pulse rounded-full bg-[var(--admin-skeleton)]" />
      <div className="h-10 w-full animate-pulse rounded-xl bg-[var(--admin-skeleton)]" />
      {!compact ? (
        <div className="h-10 w-4/5 animate-pulse rounded-xl bg-[var(--admin-skeleton)]" />
      ) : null}
    </div>
  );
}

export function AdminEmptyState({
  title = adminV1Sr.emptyStateTitle,
  body = adminV1Sr.emptyStateBody,
  className,
}: {
  title?: string;
  body?: string;
  className?: string;
}) {
  return (
    <div
      data-admin-primitive="empty"
      className={cn(
        "grid min-h-56 place-items-center px-5 py-8 text-center",
        className,
      )}
    >
      <div className="max-w-md">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-[var(--admin-surface-muted)] text-[var(--admin-text-muted)]">
          <Inbox className="size-5" aria-hidden="true" />
        </span>
        <h2 className="mt-5 text-lg font-semibold tracking-[-0.02em]">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--admin-text-muted)]">{body}</p>
      </div>
    </div>
  );
}

export function AdminErrorState({
  title = adminV1Sr.errorStateTitle,
  body = adminV1Sr.errorStateBody,
  className,
}: {
  title?: string;
  body?: string;
  className?: string;
}) {
  return (
    <div
      data-admin-primitive="error"
      role="alert"
      className={cn("grid min-h-56 place-items-center px-5 py-8 text-center", className)}
    >
      <div className="max-w-md">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-[var(--admin-danger-soft)] text-[var(--admin-danger)]">
          <AlertTriangle className="size-5" aria-hidden="true" />
        </span>
        <h2 className="mt-5 text-lg font-semibold tracking-[-0.02em]">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--admin-text-muted)]">{body}</p>
      </div>
    </div>
  );
}

export function AdminSummaryPill({
  products,
  qr,
  nfc,
  problems,
  className,
}: {
  products: number;
  qr: number;
  nfc: number;
  problems: number;
  className?: string;
}) {
  const segments = [
    { icon: Package, value: products, label: adminV1Sr.summaryProducts },
    { icon: QrCode, value: qr, label: adminV1Sr.summaryQr },
    { icon: Nfc, value: nfc, label: adminV1Sr.summaryNfc },
    {
      icon: AlertTriangle,
      value: problems,
      label: adminV1Sr.summaryProblems,
      problem: true,
    },
  ];

  return (
    <div
      data-admin-primitive="summary-pill"
      className={cn(
        "inline-flex max-w-full flex-wrap items-center rounded-full border border-[var(--admin-border)] bg-[var(--admin-surface)] px-1.5 py-1 shadow-[var(--admin-shadow-xs)]",
        className,
      )}
    >
      {segments.map((segment, index) => {
        const Icon = segment.icon;
        return (
          <div
            key={segment.label}
            className={cn(
              "inline-flex min-h-8 items-center gap-1.5 px-2.5 text-xs font-medium",
              index > 0 && "border-l border-[var(--admin-border)]",
              segment.problem
                ? "text-[var(--admin-danger)]"
                : "text-[var(--admin-text)]",
            )}
          >
            <Icon className="size-3.5" aria-hidden="true" />
            <span className="font-mono font-semibold tabular-nums">{segment.value}</span>
            <span>{segment.label}</span>
          </div>
        );
      })}
    </div>
  );
}
