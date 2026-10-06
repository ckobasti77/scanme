import { CircleAlert, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { issueText, type IssueView, type ModelView, type Paged } from "@/components/admin/admin-events";
import { AdminPanel, AdminStatus } from "@/components/admin/admin-primitives";
import { adminSecondaryButtonClass } from "@/components/admin/admin-ui";
import type { FairClientSegment, FairModelStatus, FairParticipationStatus } from "@/lib/fair-contract";
import { fmt } from "@/lib/i18n/format";
import { adminEventsSr as dict } from "@/lib/i18n/sr/admin-events";
import { cn } from "@/lib/utils";

// Admin UX A2 — presentational pieces shared by the B1 section views
// (Pregled, Modeli, QR, Izlagači, Import); moved from admin-events.tsx.

export type EventMessage = { tone: "ok" | "error"; text: string; issues?: IssueView[] } | null;

export const eventDateTime = new Intl.DateTimeFormat("sr-Latn-RS", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Belgrade" });

export function Feedback({ message }: { message: EventMessage }) {
  return (
    <div role="status" aria-live="polite" className="min-h-0">
      {message ? (
        <div className={cn("grid gap-2 rounded-xl border p-3 text-sm", message.tone === "ok" ? "border-[var(--admin-success-border)] bg-[var(--admin-success-soft)]" : "border-[var(--admin-danger-border)] bg-[var(--admin-danger-soft)]")}>
          <p className="font-semibold">{message.text}</p>
          {message.issues?.length ? <IssueList issues={message.issues} /> : null}
        </div>
      ) : null}
    </div>
  );
}

export function IssueList({ issues }: { issues: IssueView[] }) {
  if (!issues.length) return <p className="text-sm text-[var(--admin-text-muted)]">{dict.noIssues}</p>;
  return (
    <ul className="grid gap-2">
      {issues.map((issue, index) => (
        <li key={`${issue.code}-${issue.path}-${index}`} className="flex min-w-0 items-start gap-2 text-sm">
          {issue.severity === "error" ? <CircleAlert className="mt-0.5 size-4 shrink-0 text-[var(--admin-danger)]" aria-hidden="true" /> : <TriangleAlert className="mt-0.5 size-4 shrink-0 text-[var(--admin-warning)]" aria-hidden="true" />}
          <span className="min-w-0">
            <span className="sr-only">{issue.severity === "error" ? dict.severityError : dict.severityWarning}: </span>
            {issueText(issue.code)}
            {issue.path ? <span className="block break-all font-mono text-[0.7rem] text-[var(--admin-text-muted)]">{issue.path}</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <AdminPanel className="min-w-0 p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-[-0.025em]">{title}</h2>
        {action}
      </div>
      {children}
    </AdminPanel>
  );
}

export function Meta({ children }: { children: ReactNode }) {
  return <span className="block break-words text-xs text-[var(--admin-text-muted)]">{children}</span>;
}

export function Fact({ label, value }: { label: string; value: ReactNode }) {
  return <div className="min-w-0"><dt className="text-xs font-semibold text-[var(--admin-text-muted)]">{label}</dt><dd className="mt-1 break-words text-sm">{value}</dd></div>;
}

export function LoadMore({ list }: { list: Paged<unknown> }) {
  if (!list.canLoadMore) return null;
  return <button type="button" className={cn(adminSecondaryButtonClass, "mt-3")} disabled={list.loadingMore} onClick={list.onLoadMore}>{list.loadingMore ? dict.loadingMore : dict.loadMore}</button>;
}

export function checkLabel(issues: IssueView[]) {
  const errors = issues.filter((issue) => issue.severity === "error").length;
  const warnings = issues.length - errors;
  return issues.length ? fmt(dict.checkSummary, { errors, warnings }) : dict.checkReady;
}

export function modelName(model: Pick<ModelView, "displayName" | "variant">) {
  return `${model.displayName}${model.variant ? ` ${model.variant}` : ""}`;
}

export function modelTone(status: FairModelStatus) {
  return status === "published" ? "active" as const : status === "draft" ? "waiting" as const : "neutral" as const;
}

export function SegmentStatus({ segment }: { segment: FairClientSegment }) {
  return <AdminStatus label={dict.segments[segment]} tone={segment === "event_only" ? "waiting" : "neutral"} />;
}

export function EntryStatus({ status }: { status: FairParticipationStatus }) {
  return <AdminStatus label={dict.entryStatus[status]} tone={status === "active" ? "active" : "neutral"} />;
}
