"use client";

import { CircleAlert, Download, FileJson, FileSpreadsheet, TriangleAlert } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { issueText, type CatalogView, type CommitView, type DryRunView, type EventsActions, type IssueView, type Result } from "@/components/admin/admin-events";
import { AdminStatus } from "@/components/admin/admin-primitives";
import { AdminDataCard, AdminDataView, adminFieldClass, adminPrimaryButtonClass, adminSecondaryButtonClass, type AdminColumn } from "@/components/admin/admin-ui";
import { IssueList, Meta, Section } from "@/components/admin/events/event-ui";
import {
  detectColumns,
  hasBlockingMappingProblem,
  IMPORT_FIELDS,
  IMPORT_SPEC_PAIRS_MAX,
  mappingProblems,
  parseTargetKey,
  targetKey,
  type ColumnTarget,
  type MappingProblems,
} from "@/lib/fair-import/columns";
import { parseImportTable, type ParsedImportTable } from "@/lib/fair-import/parse";
import { buildImportTemplateCsv, IMPORT_TEMPLATE_FILE_NAME } from "@/lib/fair-import/template";
import {
  buildImportPayload,
  locateImportIssue,
  type ImportBuild,
  type ImportCatalogContext,
  type ImportDefaults,
  type ImportIssueField,
  type ImportPreviewRow,
} from "@/lib/fair-import/to-payload";
import { FAIR_PACKAGE_TIERS, type FairPackageTier } from "@/lib/fair-contract";
import { fmt } from "@/lib/i18n/format";
import { adminEventsSr as dict } from "@/lib/i18n/sr/admin-events";
import { cn } from "@/lib/utils";

// Admin UX A5 — `import`: a guide in four steps so a catalog in any form,
// repacked into a table, goes in by pasting from Excel / Google Sheets or a
// CSV file, without hand-written JSON:
//   1. Izvor — pasted table (TSV), CSV file, or the existing JSON v1 (napredno);
//   2. Mapiranje — columns recognised by header, every mapping editable, plus
//      defaults for what the table does not have;
//   3. Pregled — the first rows after mapping and the existing
//      fairImport.dryRun, errors per row and column, counts;
//   4. Potvrda — fairImport.commit and its summary.
// The table → JSON v1 conversion is pure (lib/fair-import); the JSON v1
// contract does not change.

const guide = dict.importGuide;
const STEPS = ["izvor", "mapiranje", "pregled", "potvrda"] as const;
export type ImportStep = (typeof STEPS)[number];
type SourceKind = "table" | "csv" | "json";
const PREVIEW_ROWS = 10;

/** The import context of an event from the admin catalog view (existing exhibitors, stands and models are matched). */
export function importContextFromCatalog(catalog: CatalogView, eventCode: string): ImportCatalogContext {
  return {
    eventCode,
    participations: catalog.participations.map((row) => ({ id: row.id, externalKey: row.externalKey, exhibitorName: row.exhibitorName, smkCode: row.smkCode, smlCode: row.smlCode })),
    stands: catalog.stands.map((row) => ({ id: row.id, participationId: row.participationId, externalKey: row.externalKey, code: row.code, displayName: row.displayName, mapLocationId: row.mapLocationId })),
    models: catalog.models.map((row) => ({ externalKey: row.externalKey, participationId: row.participationId, brandName: row.brandName, displayName: row.displayName, variant: row.variant })),
  };
}

// -----------------------------------------------------------------------------
// Issues per row and column (table checks + backend dry run)
// -----------------------------------------------------------------------------

export type ImportIssueRow = { id: string; line: number | null; column: string; severity: "error" | "warning"; text: string };

/** Fields derived from another column when the table has none of their own (the key and slug come from the model name…). */
const DERIVED_FROM: Partial<Record<ImportIssueField, ImportIssueField>> = { slug: "model", modelKey: "model", participationKey: "exhibitor", standName: "standCode" };

/** The column a field came from: its header, the column it is derived from, or the default when the table has neither. */
export function importColumnLabel(field: ImportIssueField | null, line: number | null, targets: readonly ColumnTarget[], headers: readonly string[]): string {
  if (!field) return line === null ? guide.wholeImport : "—";
  if (field === "specifications") {
    const specHeaders = headers.filter((_, index) => ["spec", "specLabel", "specValue"].includes(targets[index]?.kind));
    return specHeaders.length ? specHeaders.join(", ") : guide.fields.specifications;
  }
  const columnOf = (wanted: ImportIssueField) => targets.findIndex((target) => target.kind === "field" && target.field === wanted);
  let index = columnOf(field);
  const derived = DERIVED_FROM[field];
  if (index < 0 && derived) index = columnOf(derived);
  return index >= 0 ? headers[index] || guide.unnamedColumn : fmt(guide.fromDefault, { field: guide.fields[field] });
}

/** Table problems and dry-run issues as rows: the whole import first, then by row, errors before warnings. */
export function importIssueRows(build: ImportBuild, dryIssues: readonly IssueView[], targets: readonly ColumnTarget[], headers: readonly string[]): ImportIssueRow[] {
  const rows: ImportIssueRow[] = [
    ...build.issues.map((issue, index) => ({
      id: `t${index}`,
      line: issue.line,
      column: importColumnLabel(issue.field, issue.line, targets, headers),
      severity: issue.severity,
      text: guide.rowIssues[issue.code],
    })),
    ...dryIssues.map((issue, index) => {
      const located = locateImportIssue(issue.path, build.trace);
      return { id: `d${index}`, line: located.line, column: importColumnLabel(located.field, located.line, targets, headers), severity: issue.severity, text: issueText(issue.code) };
    }),
  ];
  const rank = (row: ImportIssueRow) => (row.line ?? -1) * 2 + (row.severity === "error" ? 0 : 1);
  return rows.sort((a, b) => rank(a) - rank(b));
}

const issueColumns: AdminColumn<ImportIssueRow>[] = [
  { id: "line", header: guide.colLine, sortValue: (row) => row.line, cell: (row) => <span className="tabular-nums">{row.line ?? "—"}</span>, width: "5rem" },
  { id: "column", header: guide.colColumn, sortValue: (row) => row.column, cell: (row) => row.column },
  { id: "problem", header: guide.colProblem, rowHeader: true, cell: (row) => <IssueText row={row} /> },
];

function IssueText({ row }: { row: ImportIssueRow }) {
  const Icon = row.severity === "error" ? CircleAlert : TriangleAlert;
  return (
    <span className="flex min-w-0 items-start gap-2">
      <Icon className={cn("mt-0.5 size-4 shrink-0", row.severity === "error" ? "text-[var(--admin-danger)]" : "text-[var(--admin-warning)]")} aria-hidden="true" />
      <span className="min-w-0"><span className="sr-only">{row.severity === "error" ? dict.severityError : dict.severityWarning}: </span>{row.text}</span>
    </span>
  );
}

export function ImportIssuesList({ rows }: { rows: ImportIssueRow[] }) {
  if (!rows.length) return <p className="text-sm text-[var(--admin-text-muted)]">{dict.noIssues}</p>;
  return (
    <AdminDataView
      listKey="dogadjaji.import.greske"
      caption={guide.issuesCaption}
      rows={rows}
      getRowId={(row) => row.id}
      columns={issueColumns}
      tableClassName="min-w-[36rem]"
      renderCard={(row) => <AdminDataCard title={`${guide.colLine} ${row.line ?? "—"} · ${row.column}`} subtitle={<IssueText row={row} />} />}
    />
  );
}

// -----------------------------------------------------------------------------
// Preview rows
// -----------------------------------------------------------------------------

function previewModelName(row: ImportPreviewRow) {
  return row.variant ? `${row.model} ${row.variant}` : row.model;
}

const previewColumns: AdminColumn<ImportPreviewRow>[] = [
  { id: "line", header: guide.colLine, sortValue: (row) => row.line, cell: (row) => <span className="tabular-nums">{row.line}</span> },
  { id: "model", header: guide.colModel, rowHeader: true, sortValue: previewModelName, cell: (row) => <><strong className="font-semibold">{row.model || "—"}</strong>{row.variant ? <Meta>{row.variant}</Meta> : null}</> },
  { id: "brand", header: dict.colBrand, sortValue: (row) => row.brand, cell: (row) => <>{row.brand || "—"}<Meta>{row.exhibitor || "—"}</Meta></> },
  { id: "stand", header: guide.colStand, hideBelow: "xl", sortValue: (row) => row.stand, cell: (row) => row.stand || "—" },
  { id: "price", header: guide.colPrice, sortValue: (row) => row.price, cell: (row) => (row.price || <span className="text-[var(--admin-text-muted)]">{guide.priceFallback}</span>) },
  { id: "package", header: guide.colPackage, sortValue: (row) => (row.tier ? FAIR_PACKAGE_TIERS.indexOf(row.tier) : -1), cell: (row) => (row.tier ? <AdminStatus label={dict.tiers[row.tier]} tone="neutral" className="whitespace-nowrap" /> : "—") },
  {
    id: "specs", header: guide.colSpecs, sortValue: (row) => row.specifications.length,
    cell: (row) => <span title={row.specifications.map((spec) => `${spec.label}: ${spec.value}`).join("\n")}>{fmt(guide.specsCount, { count: row.specifications.length })}</span>,
  },
  { id: "qr", header: guide.colQr, hideBelow: "xl", cell: (row) => <span className="font-mono text-xs">{row.qr || "—"}</span> },
  { id: "state", header: guide.colRow, sortValue: (row) => (row.skipped ? 1 : 0), cell: (row) => <RowState row={row} /> },
];

function RowState({ row }: { row: ImportPreviewRow }) {
  return <AdminStatus label={row.skipped ? guide.rowSkipped : guide.rowReady} tone={row.skipped ? "problem" : "active"} className="whitespace-nowrap" />;
}

// -----------------------------------------------------------------------------
// The guide
// -----------------------------------------------------------------------------

export type EventImportInitial = { text?: string; step?: ImportStep; defaults?: ImportDefaults };

export type EventImportViewProps = {
  /** Existing exhibitors, stands and models of the event; must be stable (memoized). */
  context: ImportCatalogContext;
  /** Must be stable: the dry run runs when the Pregled step opens. */
  actions: Pick<EventsActions, "dryRun" | "commit">;
  /** Dev preview: a pasted TEST table already in the Pregled step. */
  initial?: EventImportInitial;
};

export function EventImportView({ context, actions, initial }: EventImportViewProps) {
  const [kind, setKind] = useState<SourceKind>("table");
  const [text, setText] = useState(initial?.text ?? "");
  const [fileName, setFileName] = useState<string | null>(null);
  const [step, setStep] = useState<ImportStep>(initial?.step ?? "izvor");
  const [overrides, setOverrides] = useState<{ signature: string; keys: Record<number, string> }>({ signature: "", keys: {} });
  const [defaults, setDefaults] = useState<ImportDefaults>(initial?.defaults ?? {});
  const [nonce, setNonce] = useState(0);
  const [check, setCheck] = useState<{ key: string; result: Result<DryRunView> } | null>(null);
  const [committed, setCommitted] = useState<Result<CommitView> | null>(null);
  const [committing, setCommitting] = useState(false);

  const table = useMemo(() => parseImportTable(text), [text]);
  const signature = table.headers.join("\u0001");
  const targets = useMemo(() => {
    const detected = detectColumns(table.headers);
    const keys = overrides.signature === signature ? overrides.keys : {};
    return table.headers.map((header, index) => (keys[index] === undefined ? detected[index] : parseTargetKey(keys[index], header)));
  }, [table.headers, overrides, signature]);
  const problems = mappingProblems(targets, table.headers);
  const build = useMemo(() => buildImportPayload(table.rows, targets, context, defaults), [table.rows, targets, context, defaults]);
  const checkKey = `${nonce}:${JSON.stringify(build.payload)}`;
  const hasModels = build.payload.participations.length > 0;

  // The dry run is a read-only query; it runs when Pregled opens and again on "Proveri ponovo".
  useEffect(() => {
    if (step !== "pregled" || !hasModels) return;
    let live = true;
    void actions.dryRun(build.payload).then((result) => {
      if (live) setCheck({ key: checkKey, result });
    });
    return () => {
      live = false;
    };
  }, [step, hasModels, actions, build.payload, checkKey]);

  const current = check?.key === checkKey ? check.result : null;
  const dry = current?.ok ? current.value : null;
  const reachable: Record<ImportStep, boolean> = {
    izvor: true,
    mapiranje: table.rows.length > 0,
    pregled: table.rows.length > 0 && !hasBlockingMappingProblem(problems),
    potvrda: table.rows.length > 0 && !hasBlockingMappingProblem(problems) && dry?.ok === true,
  };

  function setMapping(index: number, key: string) {
    setOverrides((previous) => ({ signature, keys: { ...(previous.signature === signature ? previous.keys : {}), [index]: key } }));
  }

  function restart() {
    setText("");
    setFileName(null);
    setDefaults({});
    setCheck(null);
    setCommitted(null);
    setStep("izvor");
  }

  async function commit() {
    if (dry?.ok !== true || committing) return;
    setCommitting(true);
    try {
      setCommitted(await actions.commit(build.payload));
    } finally {
      setCommitting(false);
    }
  }

  return (
    <div className="grid min-w-0 gap-5">
      <Section title={dict.importTitle}>
        <SourceKindPicker kind={kind} onChange={setKind} />
        {kind !== "json" ? <StepNav step={step} reachable={reachable} onStep={setStep} /> : null}
      </Section>
      {kind === "json" ? <ImportJsonPanel actions={actions} /> : null}
      {kind !== "json" && step === "izvor" ? (
        <SourceStep
          kind={kind}
          text={text}
          fileName={fileName}
          table={table}
          onText={(value, name) => { setText(value); setFileName(name); }}
          onNext={reachable.mapiranje ? () => setStep("mapiranje") : undefined}
        />
      ) : null}
      {kind !== "json" && step === "mapiranje" ? (
        <MappingStep
          table={table}
          targets={targets}
          problems={problems}
          onMapping={setMapping}
          context={context}
          defaults={defaults}
          onDefaults={setDefaults}
          onBack={() => setStep("izvor")}
          onNext={reachable.pregled ? () => setStep("pregled") : undefined}
        />
      ) : null}
      {kind !== "json" && step === "pregled" ? (
        <Section title={`3. ${guide.previewTitle}`}>
          <p className="mb-4 text-sm text-[var(--admin-text-muted)]">{fmt(guide.previewHelp, { count: PREVIEW_ROWS })}</p>
          <AdminDataView
            listKey="dogadjaji.import.pregled"
            caption={guide.previewCaption}
            rows={build.rows.slice(0, PREVIEW_ROWS)}
            getRowId={(row) => String(row.line)}
            columns={previewColumns}
            tableClassName="min-w-[52rem]"
            toolbar={<p className="text-sm font-semibold">{fmt(guide.previewShown, { shown: Math.min(PREVIEW_ROWS, build.rows.length), total: build.rows.length })}</p>}
            renderCard={(row) => (
              <AdminDataCard
                title={`${guide.colLine} ${row.line} · ${previewModelName(row) || "—"}`}
                subtitle={`${row.brand || "—"} · ${row.exhibitor || "—"} · ${row.stand || "—"}`}
                badges={<>{row.tier ? <AdminStatus label={dict.tiers[row.tier]} tone="neutral" /> : null}<RowState row={row} /></>}
                fields={[
                  { label: guide.colPrice, value: row.price || guide.priceFallback },
                  { label: guide.colSpecs, value: fmt(guide.specsCount, { count: row.specifications.length }) },
                ]}
              />
            )}
          />
          <CheckResult build={build} result={current} checking={hasModels && !current} targets={targets} headers={table.headers} onRecheck={() => setNonce((value) => value + 1)} />
          <StepButtons onBack={() => setStep("mapiranje")} onNext={reachable.potvrda ? () => setStep("potvrda") : undefined} />
        </Section>
      ) : null}
      {kind !== "json" && step === "potvrda" ? (
        <Section title={`4. ${guide.confirmTitle}`}>
          <p className="mb-4 text-sm text-[var(--admin-text-muted)]">{guide.confirmHelp}</p>
          {dry ? <Counts view={dry} skipped={build.skipped} /> : null}
          {committed ? (
            <CommitResult result={committed} onRestart={restart} />
          ) : (
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className={adminSecondaryButtonClass} onClick={() => setStep("pregled")}>{guide.back}</button>
              <button type="button" className={adminPrimaryButtonClass} disabled={dry?.ok !== true || committing} onClick={() => void commit()}>{committing ? guide.committing : guide.confirmSubmit}</button>
            </div>
          )}
          {dry?.ok !== true && !committed ? <p className="mt-2 text-xs text-[var(--admin-text-muted)]">{guide.confirmBlocked}</p> : null}
        </Section>
      ) : null}
    </div>
  );
}

function SourceKindPicker({ kind, onChange }: { kind: SourceKind; onChange: (kind: SourceKind) => void }) {
  const name = useId();
  const options: [SourceKind, string][] = [["table", guide.sourceKinds.table], ["csv", guide.sourceKinds.csv], ["json", guide.sourceKinds.json]];
  return (
    <fieldset className="mb-4 min-w-0">
      <legend className="sr-only">{guide.sourceKindsAria}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map(([value, label]) => (
          <label key={value} className="cursor-pointer">
            <input type="radio" name={name} value={value} checked={kind === value} onChange={() => onChange(value)} className="peer sr-only" />
            <span className="inline-flex min-h-10 items-center rounded-[var(--admin-radius-control)] border border-[var(--admin-border)] px-3 text-sm font-semibold text-[var(--admin-text-muted)] peer-checked:border-[var(--admin-ink)] peer-checked:bg-[var(--admin-ink)] peer-checked:text-[var(--admin-surface)] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--admin-focus,var(--admin-ink))]">
              {label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function StepNav({ step, reachable, onStep }: { step: ImportStep; reachable: Record<ImportStep, boolean>; onStep: (step: ImportStep) => void }) {
  const index = STEPS.indexOf(step);
  return (
    <nav aria-label={guide.stepsAria}>
      <p className="sr-only" aria-live="polite">{fmt(guide.stepOf, { n: index + 1, total: STEPS.length })}: {guide.steps[step]}</p>
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {STEPS.map((id, position) => (
          <li key={id} className="min-w-0">
            <button
              type="button"
              aria-current={id === step ? "step" : undefined}
              disabled={!reachable[id]}
              onClick={() => onStep(id)}
              className={cn(
                "flex min-h-11 w-full min-w-0 items-center gap-2 rounded-[var(--admin-radius-control)] border px-3 text-left text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-focus,var(--admin-ink))] disabled:cursor-not-allowed disabled:opacity-50",
                id === step ? "border-[var(--admin-ink)] bg-[var(--admin-surface-muted)]" : "border-[var(--admin-border)]",
              )}
            >
              <span className={cn("grid size-6 shrink-0 place-items-center rounded-full text-xs tabular-nums", position <= index ? "bg-[var(--admin-ink)] text-[var(--admin-surface)]" : "bg-[var(--admin-surface-muted)] text-[var(--admin-text-muted)]")} aria-hidden="true">{position + 1}</span>
              <span className="min-w-0 truncate">{guide.steps[id]}</span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function StepButtons({ onBack, onNext }: { onBack?: () => void; onNext?: () => void }) {
  return (
    <div className="mt-5 flex flex-wrap gap-2">
      {onBack ? <button type="button" className={adminSecondaryButtonClass} onClick={onBack}>{guide.back}</button> : null}
      <button type="button" className={adminPrimaryButtonClass} disabled={!onNext} onClick={onNext}>{guide.next}</button>
    </div>
  );
}

function downloadTemplate() {
  const url = URL.createObjectURL(new Blob([buildImportTemplateCsv()], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = IMPORT_TEMPLATE_FILE_NAME;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

const DELIMITER_LABEL = { "\t": guide.delimiters.tab, ";": guide.delimiters.semicolon, ",": guide.delimiters.comma } as const;

function SourceStep({ kind, text, fileName, table, onText, onNext }: {
  kind: "table" | "csv";
  text: string;
  fileName: string | null;
  table: ParsedImportTable;
  onText: (text: string, fileName: string | null) => void;
  onNext?: () => void;
}) {
  const textId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <Section title={`1. ${guide.sourceTitle}`}>
      <p className="mb-4 text-sm text-[var(--admin-text-muted)]">{guide.sourceHelp}</p>
      <div className="grid gap-3">
        {kind === "csv" ? (
          <div className="flex flex-wrap items-center gap-3">
            <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(event) => { const file = event.target.files?.[0]; if (file) void file.text().then((value) => onText(value, file.name)); event.target.value = ""; }} />
            <button type="button" className={adminSecondaryButtonClass} onClick={() => fileRef.current?.click()}><FileSpreadsheet className="size-4" aria-hidden="true" />{guide.csvChoose}</button>
            {fileName ? <span className="text-sm">{fmt(guide.csvLoaded, { name: fileName })}</span> : null}
          </div>
        ) : null}
        <label htmlFor={textId} className="text-sm font-semibold">{guide.pasteLabel}</label>
        <textarea id={textId} value={text} onChange={(event) => onText(event.target.value, fileName)} rows={8} spellCheck={false} placeholder={guide.pastePlaceholder} className={cn(adminFieldClass, "min-h-40 py-2 font-mono text-xs")} />
        <div role="status" aria-live="polite" className="grid gap-2 text-sm">
          {text.trim() ? (
            table.rows.length ? <p className="font-semibold">{fmt(guide.parsedSummary, { rows: table.rows.length, columns: table.headers.length, delimiter: DELIMITER_LABEL[table.delimiter] })}</p> : <p>{guide.noRows}</p>
          ) : null}
          {table.unclosedQuote ? <p className="rounded-xl border border-[var(--admin-warning-border)] bg-[var(--admin-warning-soft)] p-3">{guide.unclosedQuote}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className={adminSecondaryButtonClass} onClick={downloadTemplate}><Download className="size-4" aria-hidden="true" />{guide.template}</button>
          <span className="text-xs text-[var(--admin-text-muted)]">{guide.templateHelp}</span>
        </div>
        <details className="rounded-[var(--admin-radius-control)] border border-[var(--admin-border)] p-3 text-sm">
          <summary className="cursor-pointer font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-focus,var(--admin-ink))]">{guide.formatTitle}</summary>
          <ul className="mt-2 grid list-disc gap-1 pl-5 text-[var(--admin-text-muted)]">
            {[guide.formatRow, guide.formatHeaders, guide.formatSpecs, guide.formatDefaults, guide.formatPrice].map((line) => <li key={line}>{line}</li>)}
          </ul>
        </details>
      </div>
      <StepButtons onNext={onNext} />
    </Section>
  );
}

function sampleOf(table: ParsedImportTable, index: number) {
  return table.rows.find((row) => row.cells[index])?.cells[index] ?? "";
}

function MappingStep({ table, targets, problems, onMapping, context, defaults, onDefaults, onBack, onNext }: {
  table: ParsedImportTable;
  targets: ColumnTarget[];
  problems: MappingProblems;
  onMapping: (index: number, key: string) => void;
  context: ImportCatalogContext;
  defaults: ImportDefaults;
  onDefaults: (defaults: ImportDefaults) => void;
  onBack: () => void;
  onNext?: () => void;
}) {
  const detected = useMemo(() => detectColumns(table.headers), [table.headers]);
  const highestPair = Math.max(0, ...targets.map((target) => (target.kind === "specLabel" || target.kind === "specValue" ? target.pair : 0)));
  const pairs = Array.from({ length: Math.min(IMPORT_SPEC_PAIRS_MAX, Math.max(3, highestPair + 1)) }, (_, index) => index + 1);
  const messages = [
    problems.modelMissing ? guide.problemModelMissing : null,
    ...problems.duplicateFields.map((field) => fmt(guide.problemDuplicate, { field: guide.fields[field] })),
    ...problems.incompletePairs.map((n) => fmt(guide.problemPair, { n })),
    problems.unlabeledSpecColumns.length ? guide.problemUnlabeled : null,
  ].filter((message): message is string => Boolean(message));
  return (
    <Section title={`2. ${guide.mappingTitle}`}>
      <p className="mb-4 text-sm text-[var(--admin-text-muted)]">{guide.mappingHelp}</p>
      <ul className="grid gap-2" aria-label={guide.mappingTitle}>
        <li aria-hidden="true" className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,16rem)] gap-3 px-3 text-xs font-semibold text-[var(--admin-text-muted)] md:grid">
          <span>{guide.colSource}</span><span>{guide.colSample}</span><span>{guide.colTarget}</span>
        </li>
        {table.headers.map((header, index) => {
          const key = targetKey(targets[index]);
          const auto = key !== "ignore" && key === targetKey(detected[index]);
          const name = header || guide.unnamedColumn;
          return (
            <li key={index} className="grid min-w-0 gap-2 rounded-[var(--admin-radius-control)] border border-[var(--admin-border)] p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,16rem)] md:items-center md:gap-3">
              <span className="min-w-0 font-semibold [overflow-wrap:anywhere]">
                {name}
                {auto ? <span className="ml-2 align-middle"><AdminStatus label={guide.autoDetected} tone="active" /></span> : null}
              </span>
              <span className="min-w-0 truncate font-mono text-xs text-[var(--admin-text-muted)]" title={sampleOf(table, index)}>{sampleOf(table, index) || "—"}</span>
              <select aria-label={fmt(guide.targetAria, { column: name })} value={key} onChange={(event) => onMapping(index, event.target.value)} className={cn(adminFieldClass, "min-h-10")}>
                <option value="ignore">{guide.targetIgnore}</option>
                <optgroup label={guide.targetGroupFields}>
                  {IMPORT_FIELDS.map((field) => <option key={field} value={`field:${field}`}>{guide.fields[field]}</option>)}
                </optgroup>
                <optgroup label={guide.targetGroupSpecs}>
                  <option value="spec">{guide.targetSpec}</option>
                  {pairs.flatMap((n) => [
                    <option key={`l${n}`} value={`spec-label:${n}`}>{fmt(guide.targetSpecLabel, { n })}</option>,
                    <option key={`v${n}`} value={`spec-value:${n}`}>{fmt(guide.targetSpecValue, { n })}</option>,
                  ])}
                </optgroup>
              </select>
            </li>
          );
        })}
      </ul>
      <div role="status" aria-live="polite">
        {messages.length ? (
          <ul className="mt-3 grid gap-1 rounded-xl border border-[var(--admin-danger-border)] bg-[var(--admin-danger-soft)] p-3 text-sm font-semibold">
            {messages.map((message) => <li key={message}>{message}</li>)}
          </ul>
        ) : null}
      </div>
      <DefaultsForm context={context} defaults={defaults} onDefaults={onDefaults} />
      <StepButtons onBack={onBack} onNext={onNext} />
    </Section>
  );
}

function DefaultsForm({ context, defaults, onDefaults }: { context: ImportCatalogContext; defaults: ImportDefaults; onDefaults: (defaults: ImportDefaults) => void }) {
  const id = useId();
  const brands = useMemo(() => [...new Set(context.models.map((model) => model.brandName))].sort((a, b) => a.localeCompare(b, "sr-Latn-RS")), [context.models]);
  const stands = defaults.participationId ? context.stands.filter((stand) => stand.participationId === defaults.participationId) : context.stands;
  const set = (patch: Partial<ImportDefaults>) => onDefaults({ ...defaults, ...patch });
  const field = (suffix: string) => `${id}-${suffix}`;
  return (
    <fieldset className="mt-5 grid min-w-0 gap-3 rounded-[var(--admin-radius-control)] border border-[var(--admin-border)] p-3">
      <legend className="px-1 text-sm font-semibold">{guide.defaultsTitle}</legend>
      <p className="text-xs text-[var(--admin-text-muted)]">{guide.defaultsHelp}</p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <label htmlFor={field("p")} className="grid gap-1 text-sm font-semibold">
          {guide.fields.exhibitor}
          <select id={field("p")} value={defaults.participationId ?? ""} onChange={(event) => set({ participationId: event.target.value || undefined, standId: undefined })} className={adminFieldClass}>
            <option value="">{guide.defaultNone}</option>
            {context.participations.map((row) => <option key={row.id} value={row.id}>{row.exhibitorName}</option>)}
          </select>
        </label>
        <label htmlFor={field("b")} className="grid gap-1 text-sm font-semibold">
          {guide.fields.brand}
          <input id={field("b")} list={field("bl")} value={defaults.brand ?? ""} onChange={(event) => set({ brand: event.target.value || undefined })} className={adminFieldClass} autoComplete="off" />
          <datalist id={field("bl")}>{brands.map((brand) => <option key={brand} value={brand} />)}</datalist>
        </label>
        <label htmlFor={field("s")} className="grid gap-1 text-sm font-semibold">
          {guide.fields.standCode}
          <select id={field("s")} value={defaults.standId ?? ""} onChange={(event) => set({ standId: event.target.value || undefined })} className={adminFieldClass}>
            <option value="">{guide.defaultNone}</option>
            {stands.map((row) => <option key={row.id} value={row.id}>{`${row.displayName} · ${row.code}`}</option>)}
          </select>
        </label>
        <label htmlFor={field("t")} className="grid gap-1 text-sm font-semibold">
          {guide.fields.package}
          <select id={field("t")} value={defaults.tier ?? ""} onChange={(event) => set({ tier: (event.target.value || undefined) as FairPackageTier | undefined })} className={adminFieldClass}>
            <option value="">{guide.defaultNone}</option>
            {FAIR_PACKAGE_TIERS.map((tier) => <option key={tier} value={tier}>{dict.tiers[tier]}</option>)}
          </select>
        </label>
        <label htmlFor={field("f")} className="grid gap-1 text-sm font-semibold">
          {guide.fields.packageFrom}
          <input id={field("f")} value={defaults.packageFrom ?? ""} onChange={(event) => set({ packageFrom: event.target.value || undefined })} className={adminFieldClass} aria-describedby={field("fh")} autoComplete="off" />
          <span id={field("fh")} className="text-xs font-normal text-[var(--admin-text-muted)]">{guide.defaultFromHelp}</span>
        </label>
        <label htmlFor={field("x")} className="grid gap-1 text-sm font-semibold">
          {guide.fields.passport}
          <select id={field("x")} value={defaults.passport === undefined ? "" : defaults.passport ? "da" : "ne"} onChange={(event) => set({ passport: event.target.value ? event.target.value === "da" : undefined })} className={adminFieldClass}>
            <option value="">{guide.defaultNone}</option>
            <option value="da">{guide.passportYes}</option>
            <option value="ne">{guide.passportNo}</option>
          </select>
        </label>
      </div>
    </fieldset>
  );
}

const ENTITIES = [["participations", dict.entityParticipations], ["stands", dict.entityStands]] as const;

function Counts({ view, skipped }: { view: DryRunView; skipped: number }) {
  return (
    <div className="grid gap-2">
      <h3 className="text-sm font-semibold">{guide.countsTitle}</h3>
      <p className="text-sm font-semibold">{view.ok ? dict.dryRunOk : dict.dryRunFailed}</p>
      <ul className="grid gap-1 text-sm">
        <li className="font-semibold">{fmt(guide.countsModels, { new: view.summary.models.new, existing: view.summary.models.existing })}</li>
        <li>{fmt(guide.countsSkipped, { count: skipped })}</li>
        {ENTITIES.map(([key, label]) => <li key={key}>{fmt(dict.summaryLine, { entity: label, new: view.summary[key].new, existing: view.summary[key].existing })}</li>)}
        <li>{fmt(dict.summaryUpgrades, { count: view.summary.upgrades })}</li>
        <li>{fmt(dict.summaryQr, { count: view.summary.qrAssignments })}</li>
      </ul>
    </div>
  );
}

export function CheckResult({ build, result, checking, targets, headers, onRecheck }: {
  build: ImportBuild;
  result: Result<DryRunView> | null;
  checking: boolean;
  targets: readonly ColumnTarget[];
  headers: readonly string[];
  onRecheck: () => void;
}) {
  const hasModels = build.payload.participations.length > 0;
  const dry = result?.ok ? result.value : null;
  const rows = importIssueRows(build, dry?.issues ?? [], targets, headers);
  return (
    <div role="status" aria-live="polite" className="mt-5 grid gap-4">
      {!hasModels ? <p className="rounded-xl border border-[var(--admin-danger-border)] bg-[var(--admin-danger-soft)] p-3 text-sm font-semibold">{guide.nothingToImport}</p> : null}
      {checking ? <p className="text-sm font-semibold">{guide.checking}</p> : null}
      {result && !result.ok ? (
        <p className="rounded-xl border border-[var(--admin-danger-border)] bg-[var(--admin-danger-soft)] p-3 text-sm font-semibold">{result.code === "ACTION_FAILED" ? dict.importShapeInvalid : issueText(result.code)}</p>
      ) : null}
      {dry ? <Counts view={dry} skipped={build.skipped} /> : null}
      <div className="grid gap-2">
        <h3 className="text-sm font-semibold">{guide.issuesTitle}</h3>
        <ImportIssuesList rows={rows} />
      </div>
      {hasModels && !checking ? <button type="button" className={cn(adminSecondaryButtonClass, "w-fit")} onClick={onRecheck}>{guide.recheck}</button> : null}
    </div>
  );
}

function CommitResult({ result, onRestart }: { result: Result<CommitView>; onRestart: () => void }) {
  const entities = [["participations", dict.entityParticipations], ["stands", dict.entityStands], ["models", dict.entityModels]] as const;
  return (
    <div role="status" aria-live="polite" className="mt-4 grid gap-3">
      {result.ok ? (
        <>
          <p className="text-sm font-semibold">{result.value.committed ? dict.commitDone : dict.commitRejected}</p>
          <ul className="grid gap-1 text-sm">
            {entities.map(([key, label]) => <li key={key}>{fmt(dict.commitLine, { entity: label, ...result.value.results[key] })}</li>)}
            <li>{fmt(dict.summaryUpgrades, { count: result.value.results.upgrades })}</li>
            <li>{fmt(dict.summaryQr, { count: result.value.results.qrAssignments })}</li>
          </ul>
          {result.value.issues.length ? <IssueList issues={result.value.issues} /> : null}
        </>
      ) : (
        <p className="rounded-xl border border-[var(--admin-danger-border)] bg-[var(--admin-danger-soft)] p-3 text-sm font-semibold">{issueText(result.code)}</p>
      )}
      <button type="button" className={cn(adminSecondaryButtonClass, "w-fit")} onClick={onRestart}>{guide.restart}</button>
    </div>
  );
}

// -----------------------------------------------------------------------------
// JSON v1 (napredno) — unchanged behaviour from A2
// -----------------------------------------------------------------------------

function ImportJsonPanel({ actions }: { actions: Pick<EventsActions, "dryRun" | "commit"> }) {
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
    <>
      <Section title={guide.jsonTitle}>
        <p className="text-sm text-[var(--admin-text-muted)]">{dict.importHelp}</p>
        <div className="mt-4 grid gap-3">
          <label htmlFor={textId} className="text-sm font-semibold">{dict.importTextLabel}</label>
          <textarea id={textId} value={text} onChange={(event) => setText(event.target.value)} rows={10} spellCheck={false} className={cn(adminFieldClass, "min-h-48 py-2 font-mono text-xs")} />
          <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(event) => { const file = event.target.files?.[0]; if (file) void file.text().then((value) => { setText(value); setError(null); }); event.target.value = ""; }} />
          <div className="flex flex-wrap gap-2">
            <button type="button" className={adminSecondaryButtonClass} onClick={() => fileRef.current?.click()}><FileJson className="size-4" aria-hidden="true" />{dict.importFile}</button>
            <button type="button" className={adminSecondaryButtonClass} disabled={pending || !text.trim()} onClick={() => void dryRun()}>{dict.dryRun}</button>
            <button type="button" className={adminPrimaryButtonClass} disabled={!canCommit} onClick={() => void commit()}>{dict.commit}</button>
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
    </>
  );
}
