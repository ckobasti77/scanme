"use client";

import { CheckCircle2, CircleAlert, FileJson, QrCode, TriangleAlert } from "lucide-react";
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { AdminEventsInteractions, type InteractionsActions, type InteractionsView } from "@/components/admin/admin-events-interactions";
import { AdminEventsLeads } from "@/components/admin/admin-events-leads";
import { AdminEventsSponsored } from "@/components/admin/admin-events-sponsored";
import { AdminEmptyState, AdminLoadingState, AdminPanel, AdminStatus } from "@/components/admin/admin-primitives";
import { FAIR_PACKAGE_TIERS, type FairClientSegment, type FairEventStatus, type FairModelStatus, type FairPackageTier, type FairParticipationStatus } from "@/lib/fair-contract";
import { fmt } from "@/lib/i18n/format";
import { adminEventsSr as dict } from "@/lib/i18n/sr/admin-events";
import type { AdminEventsResolveProblem } from "@/lib/i18n/types";
import { cn } from "@/lib/utils";

// Sajam 2026 B1A — the admin `Događaji` tab. Presentational only: data and
// actions come from AdminEventsWorkspace (Convex, requireAdmin functions from
// B1) or from the static TEST preview. No visitor or contact PII is shown.

export type IssueView = { severity: "error" | "warning"; code: string; path: string };
export type Outcome = { ok: true; warnings?: IssueView[] } | { ok: false; code: string; issues?: IssueView[] };
export type Result<T> = { ok: true; value: T } | { ok: false; code: string; issues?: IssueView[] };

export type ModelView = {
  id: string;
  externalKey: string;
  displayName: string;
  variant?: string;
  slug: string;
  brandName: string;
  exhibitorName: string;
  standLabel: string;
  tier: FairPackageTier;
  status: FairModelStatus;
  priceText: string;
  specCount: number;
  highlightCount: number;
  hasPhoto: boolean;
  passportEligible: boolean;
  packageActivatedAt: number;
  qrCode: string | null;
  issues: IssueView[];
};

export type CatalogView = {
  days: { dateKey: string; label: string }[];
  participations: { id: string; externalKey: string; exhibitorName: string; codes: string; segment: FairClientSegment; status: FairParticipationStatus }[];
  stands: { id: string; externalKey: string; code: string; displayName: string; mapLocationId: string; exhibitorName: string; status: FairParticipationStatus }[];
  models: ModelView[];
  qrConfigured: boolean;
};

export type InventoryRowView = {
  cardId: string;
  resolverCode: string;
  smqCode: string | null;
  state: "active" | "inactive" | "problem" | null;
  assignment: { modelId: string; modelName: string | null; sameEvent: boolean } | null;
};

export type EventClientView = { accountId: string; name: string; smkCode: string | null };

export type Paged<T> = { rows: T[]; status: "loading" | "ready"; canLoadMore: boolean; loadingMore: boolean; onLoadMore: () => void };

export type ResolveView = { outcome: "fair_model" | "other" | "invalid"; problem: string | null; path: string | null };
type Counts = { new: number; existing: number };
export type DryRunView = { ok: boolean; issues: IssueView[]; summary: { participations: Counts; stands: Counts; models: Counts; upgrades: number; qrAssignments: number } };
type ResultCounts = { created: number; updated: number; unchanged: number };
export type CommitView = { committed: boolean; issues: IssueView[]; results: { participations: ResultCounts; stands: ResultCounts; models: ResultCounts; upgrades: number; qrAssignments: number } };

export type EventsActions = {
  publish: (modelId: string) => Promise<Outcome>;
  withdraw: (modelId: string) => Promise<Outcome>;
  upgrade: (modelId: string, toTier: FairPackageTier) => Promise<Outcome>;
  assignQr: (modelId: string, resolverCode: string) => Promise<Outcome>;
  releaseQr: (modelId: string, reason: string) => Promise<Outcome>;
  resolveTest: (resolverCode: string) => Promise<Result<ResolveView>>;
  dryRun: (payload: unknown) => Promise<Result<DryRunView>>;
  commit: (payload: unknown) => Promise<Result<CommitView>>;
  convert: (accountId: string) => Promise<Outcome>;
};

export type AdminEventsSurfaceProps = {
  preview?: boolean;
  events: { id: string; title: string; status: FairEventStatus }[] | undefined;
  selectedEventId: string | null;
  onSelectEvent: (eventId: string) => void;
  catalog: CatalogView | undefined;
  inventory: Paged<InventoryRowView>;
  eventClients: Paged<EventClientView>;
  actions: EventsActions;
  /** B3: questions, surveys and passports (absent in the static preview). */
  interactions?: { view: InteractionsView | undefined; actions: InteractionsActions };
  /**
   * B4: the connected Leadovi section (AdminEventsLeadsWorkspace). Rendered
   * only while its tab is open, so contact data is never fetched in the
   * background. Absent in the static preview.
   */
  leads?: ReactNode;
  /** B5: the connected Sponzorisano section (AdminEventsSponsoredWorkspace); absent in the static preview. */
  sponsored?: ReactNode;
};

type Tab = "overview" | "model" | "qr" | "interactions" | "leads" | "sponsored" | "import" | "clients";
const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: dict.tabOverview },
  { id: "model", label: dict.tabModel },
  { id: "qr", label: dict.tabQr },
  { id: "interactions", label: dict.tabInteractions },
  { id: "leads", label: dict.tabLeads },
  { id: "sponsored", label: dict.tabSponsored },
  { id: "import", label: dict.tabImport },
  { id: "clients", label: dict.tabClients },
];

const field = "min-h-11 w-full min-w-0 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-focus)]";
const primaryButton = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[var(--admin-ink)] px-4 text-sm font-semibold text-[var(--admin-on-ink)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-focus)]";
const secondaryButton = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface-strong)] px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-focus)]";

const dateTime = new Intl.DateTimeFormat("sr-Latn-RS", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Belgrade" });

export function issueText(code: string) {
  if (code === "ACTION_FAILED") return dict.actionFailed;
  return code in dict.issues ? dict.issues[code as keyof typeof dict.issues] : fmt(dict.unknownIssue, { code });
}

function problemText(code: string) {
  return code in dict.resolveProblems ? dict.resolveProblems[code as AdminEventsResolveProblem] : fmt(dict.unknownProblem, { code });
}

function modelTone(status: FairModelStatus) {
  return status === "published" ? "active" as const : status === "draft" ? "waiting" as const : "neutral" as const;
}

function Feedback({ message }: { message: { tone: "ok" | "error"; text: string; issues?: IssueView[] } | null }) {
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

function IssueList({ issues }: { issues: IssueView[] }) {
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

function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
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

function RowList({ children }: { children: ReactNode }) {
  return <ul className="grid divide-y divide-[var(--admin-border)] overflow-hidden rounded-[var(--admin-radius-control)] border border-[var(--admin-border)]">{children}</ul>;
}

function Row({ children }: { children: ReactNode }) {
  return <li className="grid min-w-0 gap-2 bg-[var(--admin-surface)] px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">{children}</li>;
}

function Meta({ children }: { children: ReactNode }) {
  return <span className="block break-words text-xs text-[var(--admin-text-muted)]">{children}</span>;
}

function LoadMore({ list }: { list: Paged<unknown> }) {
  if (!list.canLoadMore) return null;
  return <button type="button" className={cn(secondaryButton, "mt-3")} disabled={list.loadingMore} onClick={list.onLoadMore}>{list.loadingMore ? dict.loadingMore : dict.loadMore}</button>;
}

function checkLabel(issues: IssueView[]) {
  const errors = issues.filter((issue) => issue.severity === "error").length;
  const warnings = issues.length - errors;
  return issues.length ? fmt(dict.checkSummary, { errors, warnings }) : dict.checkReady;
}

// -----------------------------------------------------------------------------
// Overview
// -----------------------------------------------------------------------------

function Overview({ catalog, onOpenModel }: { catalog: CatalogView; onOpenModel: (modelId: string) => void }) {
  return (
    <div className="grid min-w-0 gap-5">
      <Section title={dict.daysTitle}>
        {catalog.days.length ? (
          <ul className="flex flex-wrap gap-2">
            {catalog.days.map((day) => <li key={day.dateKey} className="rounded-full border border-[var(--admin-border)] bg-[var(--admin-surface-muted)] px-3 py-1.5 text-sm"><strong>{day.label}</strong> <span className="font-mono text-xs text-[var(--admin-text-muted)]">{day.dateKey}</span></li>)}
          </ul>
        ) : <p className="text-sm text-[var(--admin-text-muted)]">{dict.noDays}</p>}
      </Section>
      {catalog.participations.length || catalog.models.length ? (
        <>
          <Section title={dict.participationsTitle}>
            <RowList>
              {catalog.participations.map((row) => (
                <Row key={row.id}>
                  <span className="min-w-0"><strong className="block break-words text-sm">{row.exhibitorName}</strong><Meta>{row.codes} · <span className="font-mono">{row.externalKey}</span></Meta></span>
                  <span className="flex flex-wrap gap-2">
                    <AdminStatus label={dict.segments[row.segment]} tone={row.segment === "event_only" ? "waiting" : "neutral"} />
                    <AdminStatus label={dict.entryStatus[row.status]} tone={row.status === "active" ? "active" : "neutral"} />
                  </span>
                </Row>
              ))}
            </RowList>
          </Section>
          <Section title={dict.standsTitle}>
            <RowList>
              {catalog.stands.map((row) => (
                <Row key={row.id}>
                  <span className="min-w-0"><strong className="block text-sm">{row.displayName} · {row.code}</strong><Meta>{row.exhibitorName} · {dict.colMapLocation}: <span className="font-mono">{row.mapLocationId}</span></Meta></span>
                  <AdminStatus label={dict.entryStatus[row.status]} tone={row.status === "active" ? "active" : "neutral"} />
                </Row>
              ))}
            </RowList>
          </Section>
          <Section title={dict.modelsTitle}>
            <RowList>
              {catalog.models.map((model) => (
                <Row key={model.id}>
                  <span className="min-w-0">
                    <strong className="block break-words text-sm">{model.displayName}{model.variant ? ` ${model.variant}` : ""}</strong>
                    <Meta>{model.brandName} · {model.exhibitorName} · {model.standLabel}</Meta>
                    <Meta>{dict.colQr}: <span className="font-mono">{model.qrCode ?? dict.noQr}</span> · {dict.colCheck}: {checkLabel(model.issues)}</Meta>
                  </span>
                  <span className="flex flex-wrap items-center gap-2">
                    <AdminStatus label={dict.tiers[model.tier]} tone="neutral" />
                    <AdminStatus label={dict.modelStatus[model.status]} tone={modelTone(model.status)} />
                    <button type="button" className={secondaryButton} onClick={() => onOpenModel(model.id)}>{dict.openModel}</button>
                  </span>
                </Row>
              ))}
            </RowList>
          </Section>
        </>
      ) : <AdminPanel><AdminEmptyState title={dict.emptyCatalogTitle} body={dict.emptyCatalogBody} /></AdminPanel>}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Model detail: publish / withdraw / upgrade
// -----------------------------------------------------------------------------

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return <div className="min-w-0"><dt className="text-xs font-semibold text-[var(--admin-text-muted)]">{label}</dt><dd className="mt-1 break-words text-sm">{value}</dd></div>;
}

function ModelDetail({ catalog, modelId, onSelect, actions }: { catalog: CatalogView; modelId: string | null; onSelect: (id: string) => void; actions: EventsActions }) {
  const selectId = useId();
  const model = catalog.models.find((row) => row.id === modelId) ?? null;
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string; issues?: IssueView[] } | null>(null);
  const [pending, setPending] = useState(false);
  const [target, setTarget] = useState<FairPackageTier | "">("");
  const [confirming, setConfirming] = useState(false);
  const higher = model ? FAIR_PACKAGE_TIERS.slice(FAIR_PACKAGE_TIERS.indexOf(model.tier) + 1) : [];
  const effectiveTarget = target && higher.includes(target) ? target : higher[0] ?? "";

  async function run(action: () => Promise<Outcome>, success: string) {
    setPending(true);
    setMessage(null);
    try {
      const outcome = await action();
      setMessage(outcome.ok ? { tone: "ok", text: success, issues: outcome.warnings?.length ? outcome.warnings : undefined } : { tone: "error", text: issueText(outcome.code), issues: outcome.issues });
    } finally {
      setPending(false);
      setConfirming(false);
    }
  }

  return (
    <div className="grid min-w-0 gap-5">
      <AdminPanel className="p-4 sm:p-5">
        <label htmlFor={selectId} className="text-sm font-semibold">{dict.modelPickLabel}</label>
        <select id={selectId} value={model?.id ?? ""} onChange={(event) => { onSelect(event.target.value); setMessage(null); setConfirming(false); setTarget(""); }} className={cn(field, "mt-1.5")}>
          <option value="">{dict.modelPickPlaceholder}</option>
          {catalog.models.map((row) => <option key={row.id} value={row.id}>{row.displayName}{row.variant ? ` ${row.variant}` : ""} · {row.brandName}</option>)}
        </select>
      </AdminPanel>
      {!model ? <AdminPanel><AdminEmptyState title={dict.tabModel} body={dict.modelPickEmpty} /></AdminPanel> : (
        <>
          <Section title={`${model.displayName}${model.variant ? ` ${model.variant}` : ""}`} action={<span className="flex flex-wrap gap-2"><AdminStatus label={dict.tiers[model.tier]} tone="neutral" /><AdminStatus label={dict.modelStatus[model.status]} tone={modelTone(model.status)} /></span>}>
            <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <Fact label={dict.fieldExternalKey} value={<span className="font-mono text-xs">{model.externalKey}</span>} />
              <Fact label={dict.fieldSlug} value={<span className="font-mono text-xs">{model.slug}</span>} />
              <Fact label={dict.colBrand} value={`${model.brandName} · ${model.exhibitorName}`} />
              <Fact label={dict.fieldStand} value={model.standLabel} />
              <Fact label={dict.fieldPrice} value={model.priceText} />
              <Fact label={dict.fieldSpecifications} value={fmt(dict.specCount, { count: model.specCount, highlights: model.highlightCount })} />
              <Fact label={dict.fieldPhoto} value={model.hasPhoto ? dict.photoYes : dict.photoNo} />
              <Fact label={dict.fieldQr} value={<span className="font-mono">{model.qrCode ?? dict.noQr}</span>} />
              <Fact label={dict.fieldPackageSince} value={dateTime.format(model.packageActivatedAt)} />
              <Fact label={dict.fieldPassport} value={model.passportEligible ? dict.yes : dict.no} />
            </dl>
          </Section>
          <Section title={dict.validationTitle}>
            {model.issues.length ? <IssueList issues={model.issues} /> : <p className="flex items-center gap-2 text-sm"><CheckCircle2 className="size-4 text-[var(--admin-success)]" aria-hidden="true" />{dict.validationOk}</p>}
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className={primaryButton} disabled={pending || model.status === "published"} onClick={() => void run(() => actions.publish(model.id), dict.publishDone)}>{dict.publish}</button>
              <button type="button" className={secondaryButton} disabled={pending || model.status === "withdrawn"} onClick={() => void run(() => actions.withdraw(model.id), dict.withdrawDone)}>{dict.withdraw}</button>
            </div>
            {model.issues.some((issue) => issue.severity === "error") && model.status !== "published" ? <p className="mt-2 text-xs text-[var(--admin-text-muted)]">{dict.publishBlocked}</p> : null}
          </Section>
          <Section title={dict.upgradeTitle}>
            <p className="text-sm text-[var(--admin-text-muted)]">{dict.upgradeHelp}</p>
            {higher.length ? (
              confirming && effectiveTarget ? (
                <div className="mt-4 grid gap-3 rounded-xl border border-[var(--admin-warning-border)] bg-[var(--admin-warning-soft)] p-4">
                  <h3 className="font-semibold">{dict.upgradeConfirmTitle}</h3>
                  <p className="text-sm">{fmt(dict.upgradeConfirmBody, { model: model.displayName, from: dict.tiers[model.tier], to: dict.tiers[effectiveTarget] })}</p>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" autoFocus className={primaryButton} disabled={pending} onClick={() => void run(() => actions.upgrade(model.id, effectiveTarget), dict.upgradeDone)}>{dict.upgradeConfirm}</button>
                    <button type="button" className={secondaryButton} disabled={pending} onClick={() => setConfirming(false)}>{dict.cancel}</button>
                  </div>
                </div>
              ) : (
                <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,16rem)_auto] sm:items-end sm:justify-start">
                  <label className="grid gap-1.5 text-sm font-semibold">{dict.upgradeTarget}
                    <select value={effectiveTarget} onChange={(event) => setTarget(event.target.value as FairPackageTier)} className={field}>
                      {higher.map((tier) => <option key={tier} value={tier}>{dict.tiers[tier]}</option>)}
                    </select>
                  </label>
                  <button type="button" className={secondaryButton} disabled={pending} onClick={() => setConfirming(true)}>{dict.upgradeStart}</button>
                </div>
              )
            ) : <p className="mt-3 text-sm">{dict.upgradeNone}</p>}
          </Section>
          <Feedback message={message} />
        </>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// QR inventory: list, assign, release, resolve test
// -----------------------------------------------------------------------------

function QrInventory({ catalog, inventory, actions }: { catalog: CatalogView; inventory: Paged<InventoryRowView>; actions: EventsActions }) {
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string; issues?: IssueView[] } | null>(null);
  const [pending, setPending] = useState(false);
  const [assignModel, setAssignModel] = useState("");
  const [assignCode, setAssignCode] = useState("");
  const [releasing, setReleasing] = useState<string | null>(null);
  const [releaseReason, setReleaseReason] = useState("");
  const [resolveCode, setResolveCode] = useState("");
  const [resolved, setResolved] = useState<{ code: string; view: ResolveView } | null>(null);
  const free = catalog.models.filter((model) => !model.qrCode);

  async function run(action: () => Promise<Outcome>, success: string, after?: () => void) {
    setPending(true);
    setMessage(null);
    try {
      const outcome = await action();
      setMessage(outcome.ok ? { tone: "ok", text: success } : { tone: "error", text: issueText(outcome.code), issues: outcome.issues });
      if (outcome.ok) after?.();
    } finally {
      setPending(false);
    }
  }

  async function resolve() {
    const code = resolveCode.trim();
    if (!code) return;
    setPending(true);
    try {
      const result = await actions.resolveTest(code);
      if (result.ok) setResolved({ code, view: result.value });
      else setMessage({ tone: "error", text: issueText(result.code) });
    } finally {
      setPending(false);
    }
  }

  if (!catalog.qrConfigured) return <AdminPanel><AdminEmptyState title={dict.tabQr} body={dict.qrNotConfigured} /></AdminPanel>;
  return (
    <div className="grid min-w-0 gap-5">
      <p className="text-sm text-[var(--admin-text-muted)]">{dict.qrSubtitle}</p>
      <Section title={dict.assignTitle}>
        {free.length ? (
          <form className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,14rem)_auto] md:items-end" onSubmit={(event) => { event.preventDefault(); if (assignModel && assignCode.trim()) void run(() => actions.assignQr(assignModel, assignCode.trim()), dict.assignDone, () => { setAssignCode(""); setAssignModel(""); }); }}>
            <label className="grid gap-1.5 text-sm font-semibold">{dict.assignModel}
              <select value={assignModel} onChange={(event) => setAssignModel(event.target.value)} className={field}>
                <option value="">{dict.modelPickPlaceholder}</option>
                {free.map((model) => <option key={model.id} value={model.id}>{model.displayName}{model.variant ? ` ${model.variant}` : ""} · {model.brandName}</option>)}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-semibold">{dict.assignCode}
              <input value={assignCode} onChange={(event) => setAssignCode(event.target.value)} placeholder={dict.assignCodePlaceholder} autoComplete="off" spellCheck={false} className={cn(field, "font-mono uppercase")} />
            </label>
            <button type="submit" className={primaryButton} disabled={pending || !assignModel || !assignCode.trim()}>{dict.assignSubmit}</button>
          </form>
        ) : <p className="text-sm text-[var(--admin-text-muted)]">{dict.assignNoModels}</p>}
      </Section>
      <Feedback message={message} />
      <Section title={dict.tabQr}>
        {inventory.status === "loading" ? <AdminLoadingState compact label={dict.loading} /> : inventory.rows.length ? (
          <RowList>
            {inventory.rows.map((row) => (
              <Row key={row.cardId}>
                <span className="flex min-w-0 items-start gap-3">
                  <QrCode className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0">
                    <strong className="block font-mono text-sm">{row.resolverCode}</strong>
                    <Meta>{row.smqCode ? <span className="font-mono">{row.smqCode} · </span> : null}{row.state ? dict.channelStates[row.state] : dict.unassigned}</Meta>
                    <Meta>{dict.colAssignment}: {row.assignment ? (row.assignment.sameEvent ? row.assignment.modelName ?? row.assignment.modelId : dict.otherEvent) : dict.unassigned}</Meta>
                  </span>
                </span>
                {row.assignment?.sameEvent ? (
                  releasing === row.cardId ? (
                    <form className="grid gap-2 sm:min-w-[18rem]" onSubmit={(event) => { event.preventDefault(); const modelId = row.assignment!.modelId; if (releaseReason.trim()) void run(() => actions.releaseQr(modelId, releaseReason.trim()), dict.releaseDone, () => { setReleasing(null); setReleaseReason(""); }); }}>
                      <label className="grid gap-1 text-xs font-semibold">{dict.releaseReason}<input autoFocus value={releaseReason} onChange={(event) => setReleaseReason(event.target.value)} className={field} /></label>
                      <span className="flex flex-wrap gap-2">
                        <button type="submit" className={primaryButton} disabled={pending || !releaseReason.trim()}>{dict.releaseConfirm}</button>
                        <button type="button" className={secondaryButton} onClick={() => { setReleasing(null); setReleaseReason(""); }}>{dict.cancel}</button>
                      </span>
                    </form>
                  ) : <button type="button" className={secondaryButton} disabled={pending} onClick={() => { setReleasing(row.cardId); setReleaseReason(""); }}>{dict.release}</button>
                ) : null}
              </Row>
            ))}
          </RowList>
        ) : <p className="text-sm text-[var(--admin-text-muted)]">{dict.qrEmpty}</p>}
        <LoadMore list={inventory} />
      </Section>
      <Section title={dict.resolveTitle}>
        <p className="text-sm text-[var(--admin-text-muted)]">{dict.resolveHelp}</p>
        <form className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,16rem)_auto] sm:items-end sm:justify-start" onSubmit={(event) => { event.preventDefault(); void resolve(); }}>
          <label className="grid gap-1.5 text-sm font-semibold">{dict.resolveCode}<input value={resolveCode} onChange={(event) => setResolveCode(event.target.value)} autoComplete="off" spellCheck={false} className={cn(field, "font-mono uppercase")} /></label>
          <button type="submit" className={secondaryButton} disabled={pending || !resolveCode.trim()}>{dict.resolveSubmit}</button>
        </form>
        <div role="status" aria-live="polite">
          {resolved ? (
            <div className="mt-4 grid gap-1 rounded-xl bg-[var(--admin-surface-muted)] p-3 text-sm">
              <strong className="font-mono">{resolved.code}</strong>
              {resolved.view.outcome === "fair_model" ? <p>{dict.resolveOpens}: <span className="break-all font-mono">{resolved.view.path}</span></p>
                : resolved.view.outcome === "other" ? <p>{dict.resolveOther}</p>
                : <p>{dict.resolveBlocked}: {problemText(resolved.view.problem ?? "destination_missing")}{resolved.view.path ? <span className="block break-all font-mono text-xs text-[var(--admin-text-muted)]">{resolved.view.path}</span> : null}</p>}
              <p className="text-xs text-[var(--admin-text-muted)]">{dict.resolveLiveNote}</p>
            </div>
          ) : null}
        </div>
      </Section>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Import: paste/upload → dryRun → commit
// -----------------------------------------------------------------------------

function ImportPanel({ actions }: { actions: EventsActions }) {
  const textId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [checked, setChecked] = useState<{ text: string; view: DryRunView } | null>(null);
  const [committed, setCommitted] = useState<CommitView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canCommit = checked !== null && checked.text === text && checked.view.ok && !pending;

  function parse(): { ok: true; value: unknown } | { ok: false } {
    try {
      return { ok: true, value: JSON.parse(text) };
    } catch {
      setError(dict.importInvalidJson);
      return { ok: false };
    }
  }

  async function dryRun() {
    setError(null);
    setCommitted(null);
    const parsed = parse();
    if (!parsed.ok) return;
    setPending(true);
    try {
      const result = await actions.dryRun(parsed.value);
      if (result.ok) setChecked({ text, view: result.value });
      else { setChecked(null); setError(result.code === "ACTION_FAILED" ? dict.importShapeInvalid : issueText(result.code)); }
    } finally {
      setPending(false);
    }
  }

  async function commit() {
    const parsed = parse();
    if (!parsed.ok || !canCommit) return;
    setPending(true);
    setError(null);
    try {
      const result = await actions.commit(parsed.value);
      if (result.ok) { setCommitted(result.value); setChecked(null); }
      else setError(issueText(result.code));
    } finally {
      setPending(false);
    }
  }

  const summary = checked?.text === text ? checked.view : null;
  const entities = [["participations", dict.entityParticipations], ["stands", dict.entityStands], ["models", dict.entityModels]] as const;
  return (
    <div className="grid min-w-0 gap-5">
      <Section title={dict.importTitle}>
        <p className="text-sm text-[var(--admin-text-muted)]">{dict.importHelp}</p>
        <div className="mt-4 grid gap-3">
          <label htmlFor={textId} className="text-sm font-semibold">{dict.importTextLabel}</label>
          <textarea id={textId} value={text} onChange={(event) => setText(event.target.value)} rows={10} spellCheck={false} className={cn(field, "min-h-48 py-2 font-mono text-xs")} />
          <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(event) => { const file = event.target.files?.[0]; if (file) void file.text().then((value) => { setText(value); setError(null); }); event.target.value = ""; }} />
          <div className="flex flex-wrap gap-2">
            <button type="button" className={secondaryButton} onClick={() => fileRef.current?.click()}><FileJson className="size-4" aria-hidden="true" />{dict.importFile}</button>
            <button type="button" className={secondaryButton} disabled={pending || !text.trim()} onClick={() => void dryRun()}>{dict.dryRun}</button>
            <button type="button" className={primaryButton} disabled={!canCommit} onClick={() => void commit()}>{dict.commit}</button>
          </div>
          {!canCommit ? <p className="text-xs text-[var(--admin-text-muted)]">{dict.commitNeedsDryRun}</p> : null}
        </div>
      </Section>
      <div role="status" aria-live="polite" className="grid gap-5">
        {error ? <p className="rounded-xl border border-[var(--admin-danger-border)] bg-[var(--admin-danger-soft)] p-3 text-sm font-semibold">{error}</p> : null}
        {summary ? (
          <Section title={dict.issuesTitle}>
            <p className="mb-3 text-sm font-semibold">{summary.ok ? dict.dryRunOk : dict.dryRunFailed}</p>
            <ul className="mb-4 grid gap-1 text-sm">
              {entities.map(([key, label]) => <li key={key}>{fmt(dict.summaryLine, { entity: label, new: summary.summary[key].new, existing: summary.summary[key].existing })}</li>)}
              <li>{fmt(dict.summaryUpgrades, { count: summary.summary.upgrades })}</li>
              <li>{fmt(dict.summaryQr, { count: summary.summary.qrAssignments })}</li>
            </ul>
            <IssueList issues={summary.issues} />
          </Section>
        ) : null}
        {committed ? (
          <Section title={committed.committed ? dict.commitDone : dict.commitRejected}>
            <ul className="mb-4 grid gap-1 text-sm">
              {entities.map(([key, label]) => <li key={key}>{fmt(dict.commitLine, { entity: label, ...committed.results[key] })}</li>)}
              <li>{fmt(dict.summaryUpgrades, { count: committed.results.upgrades })}</li>
              <li>{fmt(dict.summaryQr, { count: committed.results.qrAssignments })}</li>
            </ul>
            <IssueList issues={committed.issues} />
          </Section>
        ) : null}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Event-only clients → standard
// -----------------------------------------------------------------------------

function EventClients({ clients, actions }: { clients: Paged<EventClientView>; actions: EventsActions }) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  async function convert(accountId: string) {
    setPending(true);
    try {
      const outcome = await actions.convert(accountId);
      setMessage(outcome.ok ? { tone: "ok", text: dict.convertDone } : { tone: "error", text: issueText(outcome.code) });
      setConfirming(null);
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="grid min-w-0 gap-5">
      <Section title={dict.tabClients}>
        <p className="mb-4 text-sm text-[var(--admin-text-muted)]">{dict.clientsSubtitle}</p>
        {clients.status === "loading" ? <AdminLoadingState compact label={dict.loading} /> : clients.rows.length ? (
          <RowList>
            {clients.rows.map((row) => (
              <Row key={row.accountId}>
                <span className="min-w-0"><strong className="block break-words text-sm">{row.name}</strong><Meta><span className="font-mono">{row.smkCode ?? "—"}</span> · {dict.segments.event_only}</Meta></span>
                {confirming === row.accountId ? (
                  <span className="grid gap-2 sm:max-w-sm">
                    <span className="text-sm">{fmt(dict.convertConfirmBody, { name: row.name })}</span>
                    <span className="flex flex-wrap gap-2">
                      <button type="button" autoFocus className={primaryButton} disabled={pending} onClick={() => void convert(row.accountId)}>{dict.convertConfirm}</button>
                      <button type="button" className={secondaryButton} disabled={pending} onClick={() => setConfirming(null)}>{dict.cancel}</button>
                    </span>
                  </span>
                ) : <button type="button" className={secondaryButton} disabled={pending} onClick={() => setConfirming(row.accountId)}>{dict.convert}</button>}
              </Row>
            ))}
          </RowList>
        ) : <p className="text-sm text-[var(--admin-text-muted)]">{dict.clientsEmpty}</p>}
        <LoadMore list={clients} />
      </Section>
      <Feedback message={message} />
    </div>
  );
}

// -----------------------------------------------------------------------------
// Surface
// -----------------------------------------------------------------------------

export function AdminEventsSurface(props: AdminEventsSurfaceProps) {
  const baseId = useId();
  const eventSelectId = useId();
  const [tab, setTab] = useState<Tab>("overview");
  const [modelId, setModelId] = useState<string | null>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function onTabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const delta = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    const next = (index + delta + TABS.length) % TABS.length;
    setTab(TABS[next].id);
    tabRefs.current[next]?.focus();
  }

  const events = props.events;
  return (
    <div className="grid min-w-0 gap-5 sm:gap-6">
      <header className="grid gap-2">
        {props.preview ? <span className="w-fit rounded-full border border-[var(--admin-warning-border)] bg-[var(--admin-warning-soft)] px-2.5 py-1 text-xs font-bold text-[var(--admin-warning)]">{dict.previewBadge}</span> : null}
        <h1 className="text-[clamp(2rem,4vw,3.4rem)] leading-none font-semibold tracking-[-0.055em]">{dict.pageTitle}</h1>
        <p className="max-w-2xl text-sm leading-6 text-[var(--admin-text-muted)] sm:text-base">{props.preview ? dict.previewDescription : dict.pageSubtitle}</p>
      </header>
      {events === undefined ? <AdminPanel><AdminLoadingState label={dict.loading} /></AdminPanel> : !events.length ? (
        <AdminPanel><AdminEmptyState title={dict.noEventsTitle} body={dict.noEventsBody} /></AdminPanel>
      ) : (
        <>
          <div className="grid gap-3 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:items-end">
            <label htmlFor={eventSelectId} className="grid gap-1.5 text-sm font-semibold">{dict.eventLabel}
              <select id={eventSelectId} value={props.selectedEventId ?? ""} onChange={(event) => { props.onSelectEvent(event.target.value); setModelId(null); }} className={field}>
                {events.map((event) => <option key={event.id} value={event.id}>{fmt(dict.eventOption, { title: event.title, status: dict.eventStatus[event.status] })}</option>)}
              </select>
            </label>
            <div role="tablist" aria-label={dict.sectionsAria} className="flex flex-wrap gap-1 rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-surface-strong)] p-1 lg:justify-self-end">
              {TABS.map((item, index) => (
                <button
                  key={item.id}
                  ref={(node) => { tabRefs.current[index] = node; }}
                  id={`${baseId}-tab-${item.id}`}
                  type="button"
                  role="tab"
                  aria-selected={tab === item.id}
                  aria-controls={`${baseId}-panel`}
                  tabIndex={tab === item.id ? 0 : -1}
                  onKeyDown={(event) => onTabKey(event, index)}
                  onClick={() => setTab(item.id)}
                  className={cn("min-h-10 rounded-xl px-3 text-sm font-semibold whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-focus)]", tab === item.id ? "bg-[var(--admin-ink)] text-[var(--admin-on-ink)]" : "text-[var(--admin-text)] hover:bg-[var(--admin-surface-muted)]")}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <div id={`${baseId}-panel`} role="tabpanel" aria-labelledby={`${baseId}-tab-${tab}`} className="min-w-0">
            {tab === "import" ? <ImportPanel actions={props.actions} />
              : tab === "clients" ? <EventClients clients={props.eventClients} actions={props.actions} />
              : tab === "interactions" ? <AdminEventsInteractions view={props.interactions?.view} actions={props.interactions?.actions} />
              : tab === "leads" ? props.leads ?? <AdminEventsLeads view={undefined} actions={undefined} />
              : tab === "sponsored" ? props.sponsored ?? <AdminEventsSponsored view={undefined} actions={undefined} />
              : props.catalog === undefined ? <AdminPanel><AdminLoadingState label={dict.loading} /></AdminPanel>
              : tab === "overview" ? <Overview catalog={props.catalog} onOpenModel={(id) => { setModelId(id); setTab("model"); }} />
              : tab === "model" ? <ModelDetail key={modelId ?? "none"} catalog={props.catalog} modelId={modelId} onSelect={(id) => setModelId(id || null)} actions={props.actions} />
              : <QrInventory catalog={props.catalog} inventory={props.inventory} actions={props.actions} />}
          </div>
        </>
      )}
    </div>
  );
}
