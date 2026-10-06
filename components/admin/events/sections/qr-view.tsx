"use client";

import { ArrowRight, Check, ChevronDown, ChevronUp, Copy, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useId, useMemo, useReducer, useState, type ReactNode } from "react";
import {
  issueText,
  type CatalogView,
  type EventsActions,
  type InventoryRowView,
  type ModelView,
  type Outcome,
  type Paged,
  type QrActions,
  type QrBulkActions,
  type QrBulkCommitView,
  type QrBulkDryRunView,
  type QrBulkRowView,
  type QrDetailView,
  type QrScanStatsView,
  type ResolveView,
} from "@/components/admin/admin-events";
import { AdminEmptyState, AdminErrorState, AdminLoadingState, AdminPanel, AdminStatus } from "@/components/admin/admin-primitives";
import {
  AdminDataCard,
  AdminDataView,
  AdminFilterBar,
  AdminHierarchyPicker,
  adminFieldClass,
  adminPrimaryButtonClass,
  adminSecondaryButtonClass,
  type AdminColumn,
  type AdminFilterChip,
} from "@/components/admin/admin-ui";
import { BackLink, eventDateTime, Fact, Feedback, LoadMore, Meta, modelName, Section, type EventMessage } from "@/components/admin/events/event-ui";
import { FairQrCodeImage, QrCodeImage, useFairQrUrl } from "@/components/admin/events/qr-code-image";
import { buildHierarchy, type HierarchyData, type HierarchyValue } from "@/lib/admin-v1/hierarchy";
import { modelHierarchy } from "@/lib/admin-v1/model-filters";
import { parseQrBulkText } from "@/lib/admin-v1/qr-bulk";
import {
  applyQrFilters,
  clearQrFiltersPatch,
  qrCodeFromSearch,
  qrHierarchyCountedIds,
  qrPrintedLabel,
  qrRowModel,
  qrStateCounts,
  qrStateOf,
  QR_STATES,
  type QrStateKey,
} from "@/lib/admin-v1/qr-filters";
import { QR_FLOW_IDLE, qrFlowProblem, qrFlowReducer, type QrActiveFlow, type QrFlowAction } from "@/lib/admin-v1/qr-flow";
import type { AdminQueryPatch, AdminQueryState } from "@/lib/admin-v1/query-state";
import { FAIR_QR_BULK_MAX_ROWS, FAIR_QR_REASON_MAX_LENGTH, FAIR_QR_REASON_MIN_LENGTH } from "@/lib/fair-contract";
import { fmt } from "@/lib/i18n/format";
import { adminEventsSr as dict } from "@/lib/i18n/sr/admin-events";
import { adminUiSr } from "@/lib/i18n/sr/admin-ui";
import type { AdminEventsResolveProblem } from "@/lib/i18n/types";
import { cn } from "@/lib/utils";

// Admin UX A4 — `qr` (inventory with Izlagač → Brend → Model + stanje +
// search, Tabela/Kartice with scan columns, „Dodela u većem broju“ with a dry
// run) and `qr/[kod]` (where the printed code leads, „Promeni odredište“,
// „Ukloni vezu“, resolve test, scan numbers, assignment history). A printed
// QR is dynamic, so there is no „free the code“ button: „Upravljaj“ opens the
// detail. Izlagači 2026: every code shows its sticker label (`SA26-001`) and,
// on the card and the detail, the real QR of `<origin>/r/<kod>` — the same
// address as the printed sticker on production — to scan right from the
// screen. Presentational: containers pass Convex data and actions, the dev
// preview passes TEST fixtures.

const list = dict.qrList;
const detailText = dict.qrDetail;
const bulkText = dict.qrBulk;

function problemText(code: string) {
  return code in dict.resolveProblems ? dict.resolveProblems[code as AdminEventsResolveProblem] : fmt(dict.unknownProblem, { code });
}

const STATE_TONE: Record<QrStateKey, "neutral" | "active" | "waiting" | "problem"> = { slobodan: "neutral", ovaj: "active", drugi: "waiting", neaktivan: "problem" };

export function QrStateBadge({ state }: { state: QrStateKey }) {
  return <AdminStatus label={list.states[state]} tone={STATE_TONE[state]} className="whitespace-nowrap" />;
}

/** The name of a code on screen: the sticker label, else the SMQ serial, else the resolver code. */
function codeTitle(row: { label?: string | null; resolverCode: string; smqCode: string | null }) {
  return qrPrintedLabel(row) ?? row.smqCode ?? row.resolverCode;
}

function CodeCell({ row }: { row: Pick<InventoryRowView, "label" | "resolverCode" | "smqCode"> }) {
  const label = qrPrintedLabel(row);
  return (
    <span className="grid font-mono text-xs leading-5 whitespace-nowrap">
      {label ? <strong className="text-base font-semibold tracking-[-0.01em]">{label}</strong> : null}
      <span className={label ? "text-[var(--admin-text-muted)]" : "text-sm font-semibold"}>{row.smqCode ?? row.resolverCode}</span>
      {row.smqCode ? <span className="text-[var(--admin-text-muted)]">{row.resolverCode}</span> : null}
    </span>
  );
}

function modelLine(model: ModelView) {
  return `${model.exhibitorName} · ${model.brandName}`;
}

function ScansCell({ stats }: { stats: QrScanStatsView | null | undefined }) {
  if (stats === undefined) return <span className="text-xs text-[var(--admin-text-muted)]">{dict.loading}</span>;
  if (!stats || stats.total === null) return <span className="text-[var(--admin-text-muted)]">—</span>;
  return (
    <span className="grid leading-5 whitespace-nowrap">
      <span className="font-semibold">{fmt(list.scansTotal, { count: stats.total })}</span>
      <span className="text-xs text-[var(--admin-text-muted)]">{fmt(list.scansUnique, { count: stats.unique ?? 0 })}</span>
    </span>
  );
}

function lastScanText(stats: QrScanStatsView | null | undefined) {
  if (stats === undefined) return dict.loading;
  return stats?.lastScanAt ? eventDateTime.format(stats.lastScanAt) : "—";
}

// -----------------------------------------------------------------------------
// qr: list
// -----------------------------------------------------------------------------

export type EventQrViewProps = {
  catalog: CatalogView;
  inventory: Paged<InventoryRowView>;
  /** Polled scan columns by cardId; undefined = not loaded yet. */
  stats: ReadonlyMap<string, QrScanStatsView> | undefined;
  /** The query string of the page (filters and `prikaz`). */
  query: AdminQueryState;
  onQueryChange: (patch: AdminQueryPatch) => void;
  /** Detail of one code; the container keeps the list filters in it. */
  qrHref: (code: string) => string;
  modelHref: (modelId: string) => string;
  bulk: QrBulkActions;
  actions: Pick<EventsActions, "resolveTest">;
};

export function EventQrView({ catalog, inventory, stats, query, onQueryChange, qrHref, modelHref, bulk, actions }: EventQrViewProps) {
  const modelsById = useMemo(() => new Map(catalog.models.map((model) => [model.id, model])), [catalog.models]);
  const hierarchy = useMemo(() => modelHierarchy(catalog.models, modelName), [catalog.models]);
  const columns = useMemo(() => qrColumns(modelsById, modelHref, stats), [modelsById, modelHref, stats]);

  if (!catalog.qrConfigured) return <AdminPanel><AdminEmptyState title={dict.sectionLabels.qr} body={dict.qrNotConfigured} /></AdminPanel>;

  const rows = inventory.rows;
  const filtered = applyQrFilters(rows, modelsById, query);
  const counts = qrStateCounts(rows, modelsById, query);
  const counted = qrHierarchyCountedIds(rows, modelsById, query);
  const value: HierarchyValue = { exhibitorId: query.izlagac, brandId: query.brend, modelId: query.model };
  const typedCode = qrCodeFromSearch(query.q);

  const chips: AdminFilterChip[] = [];
  const exhibitor = hierarchy.exhibitors.find((row) => row.id === query.izlagac);
  const brand = hierarchy.brands.find((row) => row.id === query.brend);
  const model = hierarchy.models.find((row) => row.id === query.model);
  if (exhibitor) chips.push({ id: "izlagac", label: `${dict.colExhibitor}: ${exhibitor.label}`, onRemove: () => onQueryChange({ izlagac: null, brend: null, model: null }) });
  if (brand) chips.push({ id: "brend", label: `${dict.colBrand}: ${brand.label}`, onRemove: () => onQueryChange({ brend: null, model: null }) });
  if (model) chips.push({ id: "model", label: `${dict.colModel}: ${model.label}`, onRemove: () => onQueryChange({ model: null }) });
  if (query.q) chips.push({ id: "q", label: fmt(list.searchChip, { q: query.q }), onRemove: () => onQueryChange({ q: null }) });
  if (query.stanje && (QR_STATES as readonly string[]).includes(query.stanje)) {
    chips.push({ id: "stanje", label: `${list.facetState}: ${list.states[query.stanje as QrStateKey]}`, onRemove: () => onQueryChange({ stanje: null }) });
  }
  const clear = () => onQueryChange(clearQrFiltersPatch());

  return (
    <div className="grid min-w-0 gap-4">
      <p className="text-sm text-[var(--admin-text-muted)]">{dict.qrSubtitle}</p>
      <AdminFilterBar
        label={list.hierarchyLabel}
        search={{ value: query.q ?? "", onChange: (q) => onQueryChange({ q: q || null }), label: list.searchLabel, placeholder: list.searchPlaceholder }}
        hierarchy={
          <AdminHierarchyPicker
            data={hierarchy}
            value={value}
            counted={counted}
            label={list.hierarchyLabel}
            onChange={(next) => onQueryChange({ izlagac: next.exhibitorId ?? null, brend: next.brandId ?? null, model: next.modelId ?? null })}
          />
        }
        facets={[{ id: "stanje", label: list.facetState, options: QR_STATES.map((state) => ({ value: state, label: list.states[state], count: counts[state] })) }]}
        values={query}
        onFacetChange={(id, next) => onQueryChange({ [id]: next ?? null })}
        chips={chips}
        onClear={clear}
      />
      {typedCode ? (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <Link href={qrHref(typedCode)} className={cn(adminSecondaryButtonClass, "min-h-9 px-3")}>
            {fmt(list.openCode, { code: typedCode })}<ArrowRight className="size-4" aria-hidden="true" />
          </Link>
          <span className="text-xs text-[var(--admin-text-muted)]">{list.openCodeHint}</span>
        </p>
      ) : null}
      <Section title={dict.sectionLabels.qr}>
        <AdminDataView
          listKey="dogadjaji.qr"
          caption={dict.sectionLabels.qr}
          rows={inventory.status === "loading" ? undefined : filtered}
          loadingLabel={dict.loading}
          getRowId={(row) => row.cardId}
          columns={columns}
          tableClassName="min-w-[56rem]"
          toolbar={
            <div className="grid gap-0.5">
              <p className="text-sm font-semibold" role="status" aria-live="polite">{fmt(list.count, { shown: filtered.length, total: rows.length })}</p>
              {inventory.canLoadMore ? <Meta>{fmt(list.partial, { loaded: rows.length })}</Meta> : null}
            </div>
          }
          empty={rows.length ? (
            <div className="grid justify-items-center gap-2 pb-4">
              <AdminEmptyState title={list.noMatchTitle} body={list.noMatchBody} className="min-h-40" />
              <button type="button" onClick={clear} className={adminSecondaryButtonClass}>{adminUiSr.filters.clear}</button>
            </div>
          ) : { title: dict.sectionLabels.qr, body: dict.qrEmpty }}
          renderCard={(row) => {
            const rowModel = qrRowModel(row, modelsById);
            const rowStats = stats ? stats.get(row.cardId) ?? null : undefined;
            // Under the title: the codes the title does not show (SMQ and resolver code).
            const codes = [qrPrintedLabel(row) ? row.smqCode : null, row.smqCode || qrPrintedLabel(row) ? row.resolverCode : null].filter(Boolean).join(" · ");
            return (
              <AdminDataCard
                title={<span className="font-mono text-lg">{codeTitle(row)}</span>}
                subtitle={codes ? <span className="font-mono">{codes}</span> : undefined}
                aside={<FairQrCodeImage resolverCode={row.resolverCode} label={fmt(list.qrAria, { code: codeTitle(row) })} className="size-24 shrink-0" />}
                badges={<QrStateBadge state={qrStateOf(row)} />}
                fields={[
                  { label: list.colModel, value: <QrModelCell row={row} model={rowModel} modelHref={modelHref} /> },
                  { label: list.colScans, value: <ScansCell stats={rowStats} /> },
                  { label: list.colLastScan, value: lastScanText(rowStats) },
                ]}
              />
            );
          }}
          rowActions={(row) => (
            <Link href={qrHref(row.resolverCode)} aria-label={fmt(list.manageAria, { code: codeTitle(row) })} className={cn(adminSecondaryButtonClass, "min-h-9 px-3")}>
              {list.manage}
            </Link>
          )}
          footer={<LoadMore list={inventory} />}
        />
        <p className="mt-3 text-xs text-[var(--admin-text-muted)]">{list.statsNote}</p>
      </Section>
      <QrBulkPanel catalog={catalog} bulk={bulk} />
      <ResolvePanel actions={actions} />
    </div>
  );
}

function QrModelCell({ row, model, modelHref }: { row: InventoryRowView; model: ModelView | null; modelHref: (modelId: string) => string }) {
  if (model) {
    return (
      <span className="grid min-w-0 leading-5">
        <Link href={modelHref(model.id)} className="font-semibold underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-focus,var(--admin-ink))]">{modelName(model)}</Link>
        <span className="text-xs text-[var(--admin-text-muted)]">{modelLine(model)}</span>
      </span>
    );
  }
  return <span className="text-[var(--admin-text-muted)]">{row.assignment && !row.assignment.sameEvent ? list.modelOtherEvent : list.modelNone}</span>;
}

function qrColumns(modelsById: ReadonlyMap<string, ModelView>, modelHref: (modelId: string) => string, stats: ReadonlyMap<string, QrScanStatsView> | undefined): AdminColumn<InventoryRowView>[] {
  const statsOf = (row: InventoryRowView) => (stats ? stats.get(row.cardId) ?? null : undefined);
  return [
    { id: "code", header: list.colCode, rowHeader: true, sortValue: (row) => codeTitle(row), cell: (row) => <CodeCell row={row} /> },
    { id: "state", header: list.colState, sortValue: (row) => QR_STATES.indexOf(qrStateOf(row)), cell: (row) => <QrStateBadge state={qrStateOf(row)} /> },
    {
      id: "model", header: list.colModel,
      sortValue: (row) => { const model = qrRowModel(row, modelsById); return model ? `${model.exhibitorName} ${model.brandName} ${modelName(model)}` : null; },
      cell: (row) => <QrModelCell row={row} model={qrRowModel(row, modelsById)} modelHref={modelHref} />,
    },
    { id: "scans", header: list.colScans, align: "end", sortValue: (row) => statsOf(row)?.total ?? null, cell: (row) => <ScansCell stats={statsOf(row)} /> },
    { id: "last", header: list.colLastScan, sortValue: (row) => statsOf(row)?.lastScanAt ?? null, cell: (row) => <span className="text-xs whitespace-nowrap">{lastScanText(statsOf(row))}</span> },
  ];
}

// -----------------------------------------------------------------------------
// „Dodela u većem broju“
// -----------------------------------------------------------------------------

const BULK_STATUS: Record<QrBulkRowView["status"] | "applied", { label: string; tone: "active" | "neutral" | "problem" }> = {
  ok: { label: bulkText.statusOk, tone: "active" },
  unchanged: { label: bulkText.statusUnchanged, tone: "neutral" },
  error: { label: bulkText.statusError, tone: "problem" },
  applied: { label: bulkText.statusApplied, tone: "active" },
};

type BulkResultRow = QrBulkRowView & { line: number; final?: "applied" | "unchanged" | "error"; finalIssue?: string };

export function QrBulkPanel({ catalog, bulk, initialOpen = false }: { catalog: CatalogView; bulk: QrBulkActions; initialOpen?: boolean }) {
  const id = useId();
  const [open, setOpen] = useState(initialOpen);
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<EventMessage>(null);
  const [checked, setChecked] = useState<{ text: string; lines: number[]; view: QrBulkDryRunView; commit?: QrBulkCommitView } | null>(null);
  const parsed = useMemo(() => parseQrBulkText(text), [text]);
  const modelsById = useMemo(() => new Map(catalog.models.map((model) => [model.id, model])), [catalog.models]);
  // A result belongs to the text it was made from; editing the text asks for a new check.
  const result = checked && checked.text === text ? checked : null;

  async function check() {
    setMessage(null);
    setConfirming(false);
    if (!parsed.rows.length) return setMessage({ tone: "error", text: bulkText.empty });
    if (parsed.tooMany) return setMessage({ tone: "error", text: fmt(bulkText.tooMany, { max: FAIR_QR_BULK_MAX_ROWS }) });
    setPending(true);
    try {
      const outcome = await bulk.dryRun(parsed.rows.map(({ code, model }) => ({ code, model })));
      if (outcome.ok) setChecked({ text, lines: parsed.rows.map((row) => row.line), view: outcome.value });
      else setMessage({ tone: "error", text: issueText(outcome.code) });
    } finally {
      setPending(false);
    }
  }

  async function commit() {
    if (!result) return;
    setPending(true);
    setMessage(null);
    try {
      const outcome = await bulk.commit(parsed.rows.map(({ code, model }) => ({ code, model })));
      if (outcome.ok) {
        setChecked({ ...result, commit: outcome.value });
        setMessage({ tone: "ok", text: fmt(bulkText.done, outcome.value.summary) });
      } else {
        setMessage({ tone: "error", text: issueText(outcome.code) });
      }
    } finally {
      setPending(false);
      setConfirming(false);
    }
  }

  const rows: BulkResultRow[] = result
    ? result.view.rows.map((row) => {
      const final = result.commit?.rows.find((entry) => entry.index === row.index);
      return { ...row, line: result.lines[row.index] ?? row.index + 1, final: final?.status, finalIssue: final?.issue };
    })
    : [];
  const ready = result && !result.commit ? result.view.summary.ok : 0;

  const columns: AdminColumn<BulkResultRow>[] = [
    { id: "line", header: bulkText.colLine, sortValue: (row) => row.line, cell: (row) => <span className="font-mono text-xs">{row.line}</span> },
    { id: "code", header: bulkText.colCode, rowHeader: true, sortValue: (row) => row.code, cell: (row) => <BulkCode row={row} /> },
    { id: "model", header: bulkText.colModel, sortValue: (row) => row.model, cell: (row) => <BulkModel row={row} modelsById={modelsById} /> },
    { id: "result", header: bulkText.colResult, sortValue: (row) => row.final ?? row.status, cell: (row) => <BulkResult row={row} modelsById={modelsById} /> },
  ];

  return (
    <Section
      title={bulkText.title}
      action={
        <button type="button" aria-expanded={open} aria-controls={`${id}-bulk`} onClick={() => setOpen((value) => !value)} className={cn(adminSecondaryButtonClass, "min-h-9 px-3")}>
          {open ? bulkText.close : bulkText.open}
          {open ? <ChevronUp className="size-4" aria-hidden="true" /> : <ChevronDown className="size-4" aria-hidden="true" />}
        </button>
      }
    >
      <div id={`${id}-bulk`} hidden={!open} className="grid min-w-0 gap-4">
        <p className="text-sm text-[var(--admin-text-muted)]">{fmt(bulkText.help, { max: FAIR_QR_BULK_MAX_ROWS })}</p>
        <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); void check(); }}>
          <label className="grid gap-1.5 text-sm font-semibold">{bulkText.textLabel}
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={6}
              spellCheck={false}
              autoComplete="off"
              placeholder={bulkText.placeholder}
              className={cn(adminFieldClass, "min-h-36 py-2 font-mono text-xs")}
            />
          </label>
          <div role="status" aria-live="polite" className="grid gap-1 text-xs text-[var(--admin-text-muted)]">
            {parsed.headerSkipped ? <p>{bulkText.headerSkipped}</p> : null}
            {parsed.invalidLines.slice(0, 5).map((line) => <p key={line} className="text-[var(--admin-danger)]">{fmt(bulkText.parseProblem, { line })}</p>)}
          </div>
          <button type="submit" className={cn(adminSecondaryButtonClass, "w-fit")} disabled={pending || !text.trim()}>{pending && !confirming ? bulkText.checking : bulkText.check}</button>
        </form>
        <Feedback message={message} />
        {result ? (
          <div className="grid min-w-0 gap-3">
            <h3 className="text-sm font-semibold">{bulkText.resultTitle}</h3>
            <p className="text-sm" role="status">{fmt(bulkText.summary, result.view.summary)}</p>
            <AdminDataView
              listKey="dogadjaji.qr.masovno"
              caption={bulkText.resultTitle}
              rows={rows}
              getRowId={(row) => String(row.index)}
              columns={columns}
              renderCard={(row) => (
                <AdminDataCard
                  title={<BulkCode row={row} />}
                  subtitle={`${bulkText.colLine} ${row.line}`}
                  fields={[{ label: bulkText.colModel, value: <BulkModel row={row} modelsById={modelsById} /> }, { label: bulkText.colResult, value: <BulkResult row={row} modelsById={modelsById} /> }]}
                />
              )}
            />
            {result.commit ? (
              <p className="rounded-xl border border-[var(--admin-warning-border)] bg-[var(--admin-warning-soft)] p-3 text-sm">{bulkText.verifyReminder}</p>
            ) : confirming ? (
              <QrConfirmPanel
                title={bulkText.confirmTitle}
                body={fmt(bulkText.confirmBody, { count: ready })}
                confirmLabel={bulkText.confirm}
                pending={pending}
                onConfirm={() => void commit()}
                onBack={() => setConfirming(false)}
              />
            ) : ready ? (
              <button type="button" className={cn(adminPrimaryButtonClass, "w-fit")} disabled={pending} onClick={() => setConfirming(true)}>{fmt(bulkText.commit, { count: ready })}</button>
            ) : <p className="text-sm text-[var(--admin-text-muted)]">{bulkText.nothingToApply}</p>}
          </div>
        ) : null}
      </div>
    </Section>
  );
}

function BulkCode({ row }: { row: QrBulkRowView }) {
  return (
    <span className="grid font-mono text-xs leading-5">
      <span className="font-semibold break-all">{row.code}</span>
      {row.resolverCode ? <span className="text-[var(--admin-text-muted)]">{[row.smqCode, row.resolverCode].filter((part) => part && part !== row.code.toUpperCase()).join(" · ")}</span> : null}
    </span>
  );
}

function BulkModel({ row, modelsById }: { row: QrBulkRowView; modelsById: ReadonlyMap<string, ModelView> }) {
  const model = row.eventModelId ? modelsById.get(row.eventModelId) : undefined;
  return (
    <span className="grid leading-5">
      <span className="font-mono text-xs break-all">{row.model}</span>
      {model ? <span className="text-xs text-[var(--admin-text-muted)]">{modelName(model)} · {model.brandName}</span> : null}
    </span>
  );
}

function BulkResult({ row, modelsById }: { row: BulkResultRow; modelsById: ReadonlyMap<string, ModelView> }) {
  const status = row.final ?? row.status;
  const issue = row.finalIssue ?? row.issue;
  const holder = row.assignedEventModelId ? modelsById.get(row.assignedEventModelId) : undefined;
  return (
    <span className="grid gap-1 leading-5">
      <AdminStatus label={BULK_STATUS[status].label} tone={BULK_STATUS[status].tone} className="w-fit whitespace-nowrap" />
      {issue ? <span className="text-xs">{issueText(issue)}</span> : null}
      {holder ? <span className="text-xs text-[var(--admin-text-muted)]">{fmt(bulkText.heldBy, { model: modelName(holder) })}</span> : null}
    </span>
  );
}

// -----------------------------------------------------------------------------
// Shared: confirmation panel and resolve test
// -----------------------------------------------------------------------------

/** The confirmation step of every QR change (inline, keyboard focus starts on the confirm button). */
export function QrConfirmPanel({ title, body, reason, confirmLabel, tone = "default", pending, onConfirm, onBack }: {
  title: string;
  body: ReactNode;
  reason?: string;
  confirmLabel: string;
  tone?: "default" | "danger";
  pending: boolean;
  onConfirm: () => void;
  onBack: () => void;
}) {
  const id = useId();
  return (
    <div
      role="group"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-body`}
      data-qr-confirm={tone}
      className={cn("grid gap-3 rounded-xl border p-4", tone === "danger" ? "border-[var(--admin-danger-border)] bg-[var(--admin-danger-soft)]" : "border-[var(--admin-warning-border)] bg-[var(--admin-warning-soft)]")}
    >
      <h3 id={`${id}-title`} className="font-semibold">{title}</h3>
      <div id={`${id}-body`} className="grid gap-1 text-sm">
        <p>{body}</p>
        {reason ? <p className="break-words">{fmt(detailText.reasonSummary, { reason })}</p> : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" autoFocus className={adminPrimaryButtonClass} disabled={pending} onClick={onConfirm}>{confirmLabel}</button>
        <button type="button" className={adminSecondaryButtonClass} disabled={pending} onClick={onBack}>{detailText.back}</button>
      </div>
    </div>
  );
}

export function ResolvePanel({ actions, initialCode = "", help = dict.resolveHelp }: { actions: Pick<EventsActions, "resolveTest">; initialCode?: string; help?: string }) {
  const [pending, setPending] = useState(false);
  const [resolveCode, setResolveCode] = useState(initialCode);
  const [resolved, setResolved] = useState<{ code: string; view: ResolveView } | null>(null);
  const [error, setError] = useState<EventMessage>(null);

  async function resolve() {
    const code = resolveCode.trim();
    if (!code) return;
    setPending(true);
    setError(null);
    try {
      const result = await actions.resolveTest(code);
      if (result.ok) setResolved({ code, view: result.value });
      else setError({ tone: "error", text: issueText(result.code) });
    } finally {
      setPending(false);
    }
  }

  return (
    <Section title={dict.resolveTitle}>
      <p className="text-sm text-[var(--admin-text-muted)]">{help}</p>
      <form className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,16rem)_auto] sm:items-end sm:justify-start" onSubmit={(event) => { event.preventDefault(); void resolve(); }}>
        <label className="grid gap-1.5 text-sm font-semibold">{dict.resolveCode}<input value={resolveCode} onChange={(event) => setResolveCode(event.target.value)} autoComplete="off" spellCheck={false} className={cn(adminFieldClass, "font-mono uppercase")} /></label>
        <button type="submit" className={adminSecondaryButtonClass} disabled={pending || !resolveCode.trim()}>{dict.resolveSubmit}</button>
      </form>
      <Feedback message={error} />
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
  );
}

// -----------------------------------------------------------------------------
// qr/[kod]: detail
// -----------------------------------------------------------------------------

export type EventQrDetailViewProps = {
  catalog: CatalogView;
  /** The code from the URL (resolver code or SMQ). */
  code: string;
  /** undefined = loading, null = not in this event's inventory. */
  detail: QrDetailView | null | undefined;
  failed?: boolean;
  actions: QrActions;
  /** After a successful change (the container refreshes the polled detail). */
  onChanged?: () => void;
  /** The list with its filters (Nazad na listu). */
  listHref: string;
  modelHref: (modelId: string) => string;
  /** The same card in Operativa → QR. */
  generalQrHref: (detail: QrDetailView) => string;
};

/** Models of the picker: the current target and models that already have a QR are shown but not selectable. */
export function qrTargetHierarchy(models: readonly ModelView[], current: { modelId: string | null; resolverCode: string }): HierarchyData {
  return buildHierarchy(models.map((model) => ({
    id: model.id,
    label: modelName(model),
    sublabel: modelLine(model),
    exhibitorId: model.participationId,
    exhibitorLabel: model.exhibitorName,
    brandId: model.brandId,
    brandLabel: model.brandName,
    searchTerms: [model.externalKey, model.qrCode, model.qrSmq],
    disabledReason: model.id === current.modelId
      ? detailText.pickCurrent
      : model.qrCode && model.qrCode !== current.resolverCode ? fmt(detailText.pickHasQr, { code: model.qrSmq ?? model.qrCode }) : undefined,
  })));
}

function flowProblemText(problem: ReturnType<typeof qrFlowProblem>) {
  return problem ? fmt(detailText.problems[problem], { min: FAIR_QR_REASON_MIN_LENGTH, max: FAIR_QR_REASON_MAX_LENGTH }) : null;
}

export function EventQrDetailView({ catalog, code, detail, failed, actions, onChanged, listHref, modelHref, generalQrHref }: EventQrDetailViewProps) {
  const [flow, dispatch] = useReducer(qrFlowReducer, QR_FLOW_IDLE);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<EventMessage>(null);
  const modelsById = useMemo(() => new Map(catalog.models.map((model) => [model.id, model])), [catalog.models]);

  if (detail === undefined) {
    return (
      <div className="grid min-w-0 gap-4">
        <BackLink href={listHref} label={dict.backToList} />
        <AdminPanel>{failed ? <AdminErrorState title={detailText.errorTitle} body={dict.errorBody} /> : <AdminLoadingState label={detailText.loading} />}</AdminPanel>
      </div>
    );
  }
  if (detail === null) {
    return (
      <div className="grid min-w-0 gap-4">
        <BackLink href={listHref} label={dict.backToList} />
        <AdminPanel><AdminEmptyState title={detailText.notFoundTitle} body={fmt(detailText.notFoundBody, { code })} /></AdminPanel>
      </div>
    );
  }

  const current = detail.current;
  const own = current?.sameEvent ? current : null;
  const currentModel = own ? modelsById.get(own.eventModelId) ?? null : null;
  const currentLabel = currentModel ? modelName(currentModel) : own?.modelLabel ?? detailText.historyUnknownModel;
  const state = qrStateOf({ state: detail.channelState, problemReason: detail.problemReason, assignment: current ? { modelId: current.eventModelId, sameEvent: current.sameEvent } : null });
  const printedLabel = qrPrintedLabel(detail);
  const title = codeTitle(detail);
  const pickData = qrTargetHierarchy(catalog.models, { modelId: own?.eventModelId ?? null, resolverCode: detail.resolverCode });
  const targetModel = flow.step !== "idle" && flow.targetModelId ? modelsById.get(flow.targetModelId) ?? null : null;

  async function run(action: () => Promise<Outcome>, success: string) {
    setPending(true);
    setMessage(null);
    try {
      const outcome = await action();
      if (outcome.ok) {
        dispatch({ type: "reset" });
        setMessage({ tone: "ok", text: success });
        onChanged?.();
      } else {
        setMessage({ tone: "error", text: issueText(outcome.code), issues: outcome.issues });
      }
    } finally {
      setPending(false);
    }
  }

  const resolverCode = detail.resolverCode;
  function confirm(active: QrActiveFlow) {
    const { action, targetModelId, reason } = active;
    if (action === "release") {
      if (own) void run(() => actions.release(own.eventModelId, reason), detailText.removeDone);
    } else if (targetModelId) {
      void (action === "reassign"
        ? run(() => actions.reassign(resolverCode, targetModelId, reason), detailText.changeDone)
        : run(() => actions.assign(targetModelId, resolverCode, reason || undefined), detailText.assignDone));
    }
  }

  const editor = (action: QrFlowAction) => {
    if (flow.step === "idle" || flow.action !== action) return null;
    if (flow.step === "confirm") {
      const body = action === "reassign"
        ? fmt(detailText.confirmChangeBody, { code: title, from: currentLabel, to: targetModel ? modelName(targetModel) : "—" })
        : action === "assign"
          ? fmt(detailText.confirmAssignBody, { code: title, to: targetModel ? modelName(targetModel) : "—" })
          : fmt(detailText.confirmRemoveBody, { code: title, model: currentLabel });
      return (
        <QrConfirmPanel
          title={action === "reassign" ? detailText.confirmChangeTitle : action === "assign" ? detailText.confirmAssignTitle : detailText.confirmRemoveTitle}
          body={body}
          reason={flow.reason || undefined}
          confirmLabel={action === "reassign" ? detailText.confirmChange : action === "assign" ? detailText.confirmAssign : detailText.confirmRemove}
          tone={action === "release" ? "danger" : "default"}
          pending={pending}
          onConfirm={() => confirm(flow)}
          onBack={() => dispatch({ type: "back" })}
        />
      );
    }
    return (
      <QrFlowForm
        flow={flow}
        pickData={action === "release" ? null : pickData}
        currentModelId={own?.eventModelId ?? null}
        onTarget={(modelId) => dispatch({ type: "target", modelId })}
        onReason={(text) => dispatch({ type: "reason", text })}
        onReview={() => dispatch({ type: "review", currentModelId: own?.eventModelId ?? null })}
        onCancel={() => dispatch({ type: "reset" })}
      />
    );
  };

  const busy = pending || flow.step !== "idle";

  return (
    <div className="grid min-w-0 gap-5">
      <nav aria-label={dict.detailQrTitle} className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <BackLink href={listHref} label={dict.backToList} />
        {currentModel ? <Link href={modelHref(currentModel.id)} className={cn(adminSecondaryButtonClass, "min-h-9 px-3")}>{detailText.openModel}<ArrowRight className="size-4" aria-hidden="true" /></Link> : null}
      </nav>
      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
        <div className="grid min-w-0 gap-5">
          <Section title={title} action={<QrStateBadge state={state} />}>
            <div className="grid min-w-0 gap-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start">
              <QrScanPanel resolverCode={detail.resolverCode} title={title} />
              <dl className="grid gap-4 sm:grid-cols-2">
                <Fact label={detailText.factLabel} value={<span className="font-mono text-base font-semibold">{printedLabel ?? "—"}</span>} />
                <Fact label={detailText.factSmq} value={<span className="font-mono">{detail.smqCode ?? "—"}</span>} />
                <Fact label={detailText.factCode} value={<span className="font-mono">{detail.resolverCode}</span>} />
                <Fact label={detailText.factChannel} value={<>{dict.channelStates[detail.channelState]}{detail.problemReason ? <Meta>{problemText(detail.problemReason)}</Meta> : null}</>} />
              </dl>
            </div>
          </Section>
          <Section title={detailText.whereTitle}>
            {own ? (
              <div className="grid gap-4">
                <dl className="grid gap-4 sm:grid-cols-2">
                  <Fact label={detailText.whereModel} value={currentModel
                    ? <><Link href={modelHref(currentModel.id)} className="font-semibold underline underline-offset-4">{modelName(currentModel)}</Link><Meta>{modelLine(currentModel)}</Meta></>
                    : currentLabel} />
                  <Fact label={detailText.wherePath} value={own.path ? <span className="break-all font-mono text-xs">{own.path}</span> : "—"} />
                  <Fact label={detailText.whereModelStatus} value={own.modelStatus ? dict.modelStatus[own.modelStatus] : "—"} />
                  <Fact label={detailText.whereSince} value={eventDateTime.format(own.assignedAt)} />
                  {own.reason ? <Fact label={detailText.whereReason} value={own.reason} /> : null}
                </dl>
                {own.modelStatus && own.modelStatus !== "published" ? <p className="text-sm text-[var(--admin-text-muted)]">{detailText.whereUnpublished}</p> : null}
              </div>
            ) : current ? (
              <p className="text-sm">{fmt(detailText.whereOtherEvent, { event: current.eventTitle ?? "—" })}</p>
            ) : (
              <p className="text-sm">{detailText.whereFree}</p>
            )}
          </Section>
          {current && !own ? null : (
            <Section title={own ? detailText.changeTitle : detailText.assignTitle}>
              <p className="text-sm text-[var(--admin-text-muted)]">{own ? detailText.changeHelp : detailText.assignHelp}</p>
              <div className="mt-4 grid gap-3">
                {editor(own ? "reassign" : "assign") ?? (
                  <button type="button" className={cn(adminPrimaryButtonClass, "w-fit")} disabled={busy} onClick={() => { setMessage(null); dispatch({ type: "start", action: own ? "reassign" : "assign" }); }}>
                    {own ? detailText.changeTitle : detailText.assignTitle}
                  </button>
                )}
              </div>
            </Section>
          )}
          {own ? (
            <Section title={detailText.removeTitle}>
              <p className="text-sm text-[var(--admin-text-muted)]">{detailText.removeHelp}</p>
              <div className="mt-4 grid gap-3">
                {editor("release") ?? (
                  <button type="button" className={cn(adminSecondaryButtonClass, "w-fit")} disabled={busy} onClick={() => { setMessage(null); dispatch({ type: "start", action: "release" }); }}>
                    {detailText.remove}
                  </button>
                )}
              </div>
            </Section>
          ) : null}
          <Feedback message={message} />
          <ResolvePanel key={detail.resolverCode} actions={actions} initialCode={detail.resolverCode} />
        </div>
        <div className="grid min-w-0 gap-5">
          <QrStatsSection detail={detail} />
          <QrHistorySection detail={detail} modelsById={modelsById} modelHref={modelHref} />
          <Section title={detailText.generalAdmin}>
            <p className="text-sm text-[var(--admin-text-muted)]">{detailText.generalAdminHelp}</p>
            <Link href={generalQrHref(detail)} className={cn(adminSecondaryButtonClass, "mt-3 w-fit")}>
              {detailText.generalAdmin}<ExternalLink className="size-4" aria-hidden="true" />
            </Link>
          </Section>
        </div>
      </div>
    </div>
  );
}

/**
 * The real QR of the code with the address it encodes: a phone scan from the
 * screen (or "Otvori adresu") tests where the printed sticker leads now.
 */
function QrScanPanel({ resolverCode, title }: { resolverCode: string; title: string }) {
  const url = useFairQrUrl(resolverCode);
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  return (
    <figure className="grid w-full max-w-56 justify-items-start gap-2">
      <QrCodeImage url={url} label={fmt(list.qrAria, { code: title })} className="w-full max-w-56" />
      <figcaption className="grid w-full gap-2">
        <span className="break-all font-mono text-xs text-[var(--admin-text-muted)]" data-qr-address>{url}</span>
        <span className="flex flex-wrap gap-2">
          <button type="button" className={cn(adminSecondaryButtonClass, "min-h-9 px-3")} onClick={() => void copy()} aria-live="polite">
            {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
            {copied ? detailText.addressCopied : detailText.copyAddress}
          </button>
          <a href={url} target="_blank" rel="noopener noreferrer" className={cn(adminSecondaryButtonClass, "min-h-9 px-3")}>
            {detailText.openAddress}<ExternalLink className="size-4" aria-hidden="true" />
          </a>
        </span>
        <span className="text-xs text-[var(--admin-text-muted)]">{detailText.scanHelp}</span>
      </figcaption>
    </figure>
  );
}

/** Edit step of a change: model picker (not for a removal) and the reason. */
export function QrFlowForm({ flow, pickData, currentModelId, onTarget, onReason, onReview, onCancel }: {
  flow: QrActiveFlow;
  /** null = no model choice (Ukloni vezu). */
  pickData: HierarchyData | null;
  currentModelId: string | null;
  onTarget: (modelId: string | undefined) => void;
  onReason: (text: string) => void;
  onReview: () => void;
  onCancel: () => void;
}) {
  const id = useId();
  const problem = qrFlowProblem(flow, currentModelId);
  const optional = flow.action === "assign";
  return (
    <form className="grid gap-3 rounded-xl border border-[var(--admin-border)] p-4" onSubmit={(event) => { event.preventDefault(); onReview(); }}>
      {pickData ? (
        <AdminHierarchyPicker
          mode="select"
          data={pickData}
          value={{ modelId: flow.targetModelId }}
          onChange={(next) => onTarget(next.modelId)}
          label={detailText.pickLabel}
          required
        />
      ) : null}
      <label className="grid gap-1.5 text-sm font-semibold">{optional ? detailText.reasonOptional : detailText.reasonLabel}
        <input
          value={flow.reason}
          onChange={(event) => onReason(event.target.value)}
          maxLength={FAIR_QR_REASON_MAX_LENGTH}
          aria-describedby={`${id}-reason-help`}
          aria-required={optional ? undefined : true}
          autoComplete="off"
          className={adminFieldClass}
        />
      </label>
      <p id={`${id}-reason-help`} className="text-xs text-[var(--admin-text-muted)]">{fmt(detailText.reasonHelp, { min: FAIR_QR_REASON_MIN_LENGTH, max: FAIR_QR_REASON_MAX_LENGTH })}</p>
      <p role="status" aria-live="polite" className="min-h-5 text-xs font-semibold text-[var(--admin-text-muted)]">{flowProblemText(problem)}</p>
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={adminPrimaryButtonClass} disabled={Boolean(problem)}>{detailText.continue}</button>
        <button type="button" className={adminSecondaryButtonClass} onClick={onCancel}>{dict.cancel}</button>
      </div>
    </form>
  );
}

function QrStatsSection({ detail }: { detail: QrDetailView }) {
  return (
    <Section title={detailText.statsTitle}>
      {detail.stats ? (
        <dl className="grid grid-cols-2 gap-4">
          <Fact label={detailText.statsTotal} value={<span className="text-2xl font-semibold tabular-nums">{detail.stats.total}</span>} />
          <Fact label={detailText.statsUnique} value={<span className="text-2xl font-semibold tabular-nums">{detail.stats.unique}</span>} />
        </dl>
      ) : <p className="text-sm text-[var(--admin-text-muted)]">{detailText.statsNone}</p>}
      <dl className="mt-4 grid grid-cols-2 gap-4">
        <Fact label={detailText.statsLast} value={detail.lastScanAt ? eventDateTime.format(detail.lastScanAt) : detailText.statsNever} />
        <Fact label={detailText.statsAllTime} value={<span className="tabular-nums">{detail.totalScansAllTime}</span>} />
      </dl>
      <p className="mt-3 text-xs text-[var(--admin-text-muted)]">{detailText.statsHelp}</p>
    </Section>
  );
}

function QrHistorySection({ detail, modelsById, modelHref }: { detail: QrDetailView; modelsById: ReadonlyMap<string, ModelView>; modelHref: (modelId: string) => string }) {
  return (
    <Section title={detailText.historyTitle}>
      {detail.history.length ? (
        <ol className="grid gap-3">
          {detail.history.map((row) => {
            const model = row.sameEvent ? modelsById.get(row.eventModelId) ?? null : null;
            const label = model ? modelName(model) : row.modelLabel ?? detailText.historyUnknownModel;
            return (
              <li key={row.assignmentId} className="grid min-w-0 gap-1 rounded-[var(--admin-radius-control)] border border-[var(--admin-border)] p-3 text-sm">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <AdminStatus label={row.status === "assigned" ? detailText.historyActive : detailText.historyReleased} tone={row.status === "assigned" ? "active" : "neutral"} className="whitespace-nowrap" />
                  {!row.sameEvent ? <AdminStatus label={detailText.historyOtherEvent} tone="waiting" className="whitespace-nowrap" /> : null}
                </div>
                {model ? <Link href={modelHref(model.id)} className="font-semibold break-words underline-offset-4 hover:underline">{label}</Link> : <span className="font-semibold break-words">{label}</span>}
                <Meta>{row.releasedAt ? fmt(detailText.historyPeriod, { from: eventDateTime.format(row.assignedAt), to: eventDateTime.format(row.releasedAt) }) : fmt(detailText.historySince, { from: eventDateTime.format(row.assignedAt) })}</Meta>
                {row.reason ? <p className="break-words text-xs">{fmt(detailText.reasonSummary, { reason: row.reason })}</p> : null}
              </li>
            );
          })}
        </ol>
      ) : <p className="text-sm text-[var(--admin-text-muted)]">{detailText.historyEmpty}</p>}
      {detail.historyCapped ? <p className="mt-3 text-xs text-[var(--admin-text-muted)]">{fmt(detailText.historyCapped, { count: detail.history.length })}</p> : null}
    </Section>
  );
}
